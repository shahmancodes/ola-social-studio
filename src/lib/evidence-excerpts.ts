/** Keep evidence from across a source, rather than only its opening/navigation. */
export function readableEvidence(body: string, contentType: string) {
  if (!/html/i.test(contentType)) return body.replace(/\s+/g, " ").trim();
  const cleaned = body.replace(/<(script|style|nav|header|footer|aside|svg|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const main = cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1]
    ?? cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/i)?.[1] ?? cleaned;
  return main.replace(/<[^>]*>/g, " ").replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    if (!code.startsWith("#")) return named[code.toLowerCase()] ?? entity;
    const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  }).replace(/\s+/g, " ").trim();
}

const stopWords = new Set("about after against also and are before between both can code content design detail does each for from have into its more not only other page source that the their them these they this through use uses using was were what when which will with would your".split(" "));
function terms(value: string) {
  return new Set((value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(term => term.length > 2 && !stopWords.has(term)));
}

export function evidenceExcerpt(text: string, claim: string, visibleCopy: string, budget: number) {
  if (budget <= 0) return "";
  if (text.length <= budget) return text;
  const primary = terms(claim), secondary = terms(visibleCopy);
  const chunks: Array<{ start: number; end: number; text: string; score: number }> = [];
  // Overlap keeps sentences that straddle a boundary available to the reviewer.
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + Math.min(1000, budget), text.length);
    if (end < text.length) end = text.lastIndexOf(" ", end) > start ? text.lastIndexOf(" ", end) : end;
    const part = text.slice(start, end), found = terms(part);
    const score = [...primary].reduce((sum, term) => sum + (found.has(term) ? 8 : 0), 0)
      + [...secondary].reduce((sum, term) => sum + (found.has(term) ? 1 : 0), 0);
    chunks.push({ start, end, text: part, score });
    if (end === text.length) break;
    start = Math.max(start + 1, end - Math.min(180, Math.floor(budget / 5)));
    const boundary = text.indexOf(" ", start);
    if (boundary >= 0) start = boundary + 1;
  }
  // Include opening context, then the strongest claim-related passages anywhere on the page.
  const chosen = [chunks[0]];
  let remaining = budget - chunks[0].text.length;
  for (const chunk of chunks.slice(1).sort((a, b) => b.score - a.score || a.start - b.start)) {
    if (chunk.text.length + 7 > remaining || chosen.some(part => chunk.start < part.end && chunk.end > part.start)) continue;
    chosen.push(chunk); remaining -= chunk.text.length + 7;
  }
  return chosen.sort((a, b) => a.start - b.start).map(chunk => chunk.text).join(" […] ");
}
