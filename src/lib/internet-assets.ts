import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import sharp from "sharp";
import { invalidateAssetCatalog } from "./assets";
import { ASSETS_DIR } from "./paths";
import { GeneratedInternetAssetDossierSchema, InternetAssetDossierSchema, type GeneratedInternetAssetDossier, type InternetAssetDossier, type Project } from "./schemas";

const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateIp(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("fc") || normalized.startsWith("fd");
}

export async function safeRemoteUrl(raw: string) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only HTTP(S) image URLs are supported.");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new Error("Private hosts are not allowed.");
  const addresses = net.isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) throw new Error("Private network addresses are not allowed.");
  return url;
}

export async function fetchImage(raw: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  let url = await safeRemoteUrl(raw);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    signal?.throwIfAborted();
    const response = await fetch(url, {
      redirect: "manual",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
      headers: { "user-agent": "OlaAssetResearch/1.0" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("The image URL redirected too many times.");
      url = await safeRemoteUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Image download returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) throw new Error("The asset URL did not return an image.");
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > MAX_DOWNLOAD_BYTES) throw new Error("The image exceeds the 10 MB download limit.");
    if (!response.body) throw new Error("The image response was empty.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DOWNLOAD_BYTES) {
        await reader.cancel();
        throw new Error("The image exceeds the 10 MB download limit.");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  }
  throw new Error("Unable to download the image.");
}

export async function verifyDownloadableImage(raw: string, signal?: AbortSignal) {
  try {
    const bytes = await fetchImage(raw, signal);
    const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    if (!metadata.format || !metadata.width || !metadata.height) throw new Error("The response is not a decodable image.");
    return { ok: true, format: metadata.format, width: metadata.width, height: metadata.height, error: "" };
  } catch (error) {
    return { ok: false, format: "", width: 0, height: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function materializeInternetAssets(project: Project, input: GeneratedInternetAssetDossier, signal?: AbortSignal): Promise<InternetAssetDossier> {
  const dossier = GeneratedInternetAssetDossierSchema.parse(input);
  const relativeDir = path.posix.join("internet", project.id);
  const targetDir = path.join(ASSETS_DIR, relativeDir);
  await fs.mkdir(targetDir, { recursive: true });

  const assets = [];
  for (const candidate of dossier.assets) {
    signal?.throwIfAborted();
    if (candidate.usageRights === "permission-required") {
      assets.push({ ...candidate, status: "skipped" as const, error: "Reuse rights are unresolved; excluded from final renders." });
      continue;
    }
    try {
      const bytes = await fetchImage(candidate.assetUrl, signal);
      const png = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      const filename = `${crypto.createHash("sha256").update(candidate.assetUrl).digest("hex").slice(0, 16)}.png`;
      await fs.writeFile(path.join(targetDir, filename), png);
      assets.push({ ...candidate, status: "downloaded" as const, localPath: path.posix.join(relativeDir, filename) });
    } catch (error) {
      signal?.throwIfAborted();
      assets.push({ ...candidate, status: "failed" as const, error: error instanceof Error ? error.message : String(error) });
    }
  }
  invalidateAssetCatalog();
  const downloaded = assets.filter((asset) => asset.status === "downloaded").length;
  const importSummary = downloaded === 0
    ? "No external artwork was imported."
    : `${downloaded} external artwork file${downloaded === 1 ? "" : "s"} downloaded and ready for optional use.`;
  return InternetAssetDossierSchema.parse({ summary: `${importSummary}\n\nAgent notes (not download verification): ${dossier.summary}`, assets });
}
