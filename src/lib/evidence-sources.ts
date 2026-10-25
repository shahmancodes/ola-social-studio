import { safeRemoteUrl } from "./internet-assets";
import { readableEvidence } from "./evidence-excerpts";

export class EvidenceSourceAccessError extends Error {
  override name = "EvidenceSourceAccessError";
}

type EvidenceSource = { title: string; url: string; claim: string };

async function fetchEvidenceText(raw: string) {
  let url = await safeRemoteUrl(raw);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(12_000), headers: { "user-agent": "OlaEvidenceReview/1.0" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Source redirected without a location");
      url = await safeRemoteUrl(new URL(location, url).toString());
      continue;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !/text\/(html|plain|markdown)|application\/markdown/i.test(contentType)) throw new Error(`HTTP ${response.status} or unreadable source`);
    if (!response.body) throw new Error("Source returned no readable body");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    const limit = 2_000_000;
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const segment = value.subarray(0, limit - size);
      chunks.push(segment); size += segment.byteLength;
    }
    await reader.cancel().catch(() => {});
    return { url: url.toString(), body: Buffer.concat(chunks.map((part) => Buffer.from(part))).toString("utf8"), contentType, readLimitReached: size === limit };
  }
  throw new Error("Source redirected too many times");
}


export async function reopenedPage(raw: string) {
  let page: Awaited<ReturnType<typeof fetchEvidenceText>>;
  try { page = await fetchEvidenceText(raw); }
  catch (error) {
    // Programming errors must never be presented as failed citations or trigger paid research.
    if (error instanceof ReferenceError || error instanceof SyntaxError) throw error;
    throw new EvidenceSourceAccessError(error instanceof Error ? error.message : String(error), { cause: error });
  }
  const text = readableEvidence(page.body, page.contentType);
  if (text.length < 100) throw new EvidenceSourceAccessError("Source page contained too little readable text");
  return { url: page.url, text, readLimitReached: page.readLimitReached };
}

/** Preserve source positions used by the representation plan; replacements still face claim QA. */
export async function resolveEvidenceSources(
  sources: EvidenceSource[],
  replace: (source: EvidenceSource, reason: string) => Promise<EvidenceSource[]>,
  onReplacement?: (original: EvidenceSource, replacement: EvidenceSource) => void,
): Promise<EvidenceSource[]> {
  const checked = await Promise.allSettled(sources.map(source => reopenedPage(source.url)));
  const resolved = structuredClone(sources);
  for (const [index, result] of checked.entries()) {
    if (result.status === "fulfilled") continue;
    if (!(result.reason instanceof EvidenceSourceAccessError)) throw result.reason;
    const original = sources[index];
    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
    const candidates = await replace(original, reason);
    let replacement: EvidenceSource | undefined;
    for (const candidate of candidates.slice(0, 8)) {
      if (candidate.url === original.url) continue;
      try {
        await reopenedPage(candidate.url);
        replacement = candidate;
        break;
      } catch (error) {
        if (!(error instanceof EvidenceSourceAccessError)) throw error;
      }
    }
    if (!replacement) throw new Error(`Evidence source check failed: Could not reopen cited source ${original.url}: ${reason}. No readable replacement was found.`);
    resolved[index] = replacement;
    onReplacement?.(original, replacement);
  }
  return resolved;
}
