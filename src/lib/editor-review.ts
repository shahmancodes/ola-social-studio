import type { SimpleArtifact } from "./simple-content";
import type { OlaTarget } from "./ola-edit";

export type ReviewItem = { id: string; problem: string; category: "Facts & sources" | "Design"; pageIndex: number | null; targets: string[]; successCriterion?: string };
export type CanvasReviewFocus = { key: number; targets: string[]; source?: string };
const category = (text: string): ReviewItem["category"] => /\b(factual|accuracy|claim|claims|evidence|citation|citations|unverified|unsupported|source|sources)\b/i.test(text) ? "Facts & sources" : "Design";

export function editorReviewItems(artifact: SimpleArtifact): ReviewItem[] {
  const report = artifact.quality;
  if (!report) return [];
  const pageCount = artifact.type === "article" ? artifact.sections.length : artifact.type === "carousel" || artifact.type === "presentation" ? artifact.slides.length : 1;
  const pageIndex = (page?: number) => page && page >= 1 && page <= pageCount ? page - 1 : null;
  const findings: ReviewItem[] = (report.findings ?? []).map((finding, index) => ({ id: `finding-${index}`, problem: finding.problem, successCriterion: finding.successCriterion, category: category(finding.problem), pageIndex: pageIndex(finding.page), targets: finding.targets }));
  const normalized = (value: string) => value.replace(/^page\s+\d+\s*:\s*/i, "").trim().toLowerCase();
  const issues: ReviewItem[] = report.issues.filter(issue => !findings.some(finding => normalized(finding.problem) === normalized(issue))).map((problem, index) => ({ id: `issue-${index}`, problem, category: category(problem), pageIndex: pageIndex(Number(problem.match(/\b(?:page|slide|section)\s+(\d+)/i)?.[1])) ?? (pageCount === 1 ? 0 : null), targets: [] }));
  return [...issues, ...findings];
}

/** Resolve known copy IDs/slots only. Unknown geometry targets select the page, never arbitrary text. */
export function reviewSource(artifact: SimpleArtifact, item: ReviewItem): string | undefined {
  if (item.pageIndex === null || artifact.type === "article") return undefined;
  const page = artifact.type === "carousel" || artifact.type === "presentation" ? artifact.slides[item.pageIndex] : artifact;
  if (!page) return undefined;
  for (const target of item.targets) {
    const block = page.composition?.blocks.find(block => block.id === target || `copy-${block.id}` === target);
    if (block) return block.source;
    if (/^(title|headline|heading|group-title|copy-title)$/.test(target)) return "title";
    if (/^(body|subline|group-body|copy-body)$/.test(target)) return "body";
    if (/^(cta|credit|eyebrow)$/.test(target)) return target;
    if (target === "artwork" || target === "image") return "artwork";
    if (/^semanticComponent\.(prompt|answer|leftTitle|rightTitle|takeaway|note|unit|items\.\d+\.(label|detail|tag))$/.test(target)) return target;
  }
  return undefined;
}

export function reviewOlaTarget(artifact: SimpleArtifact, item: ReviewItem): OlaTarget | null {
  if (item.pageIndex === null) return null;
  const prefix = artifact.type === "article" ? ["sections", item.pageIndex] : artifact.type === "carousel" || artifact.type === "presentation" ? ["slides", item.pageIndex] : [];
  const source = reviewSource(artifact, item);
  const path = source === "artwork" ? [...prefix, "assetId"] : source ? [...prefix, ...source.split(".").map(key => /^\d+$/.test(key) ? Number(key) : key)] : prefix;
  if (!prefix.length && path[0] === "title") path[0] = "headline";
  if (!prefix.length && path[0] === "body") path[0] = "subline";
  if (!path.length) return null;
  return { label: `Page ${item.pageIndex + 1}${source ? ` · ${source === "title" ? "headline" : source}` : ""}`, path };
}

export function reviewFixPrompt(item: ReviewItem) {
  return `Help fix this ${item.category === "Facts & sources" ? "factual review finding" : "design review finding"}${item.pageIndex === null ? "" : ` on page ${item.pageIndex + 1}`}: ${item.problem}${item.targets.length ? `\nAffected components: ${item.targets.join(", ")}.` : ""}${item.successCriterion ? `\nSuccess criterion: ${item.successCriterion}` : ""}\nPropose the smallest change and preserve unrelated content and exact supplied copy. Do not invent facts or sources.`;
}
