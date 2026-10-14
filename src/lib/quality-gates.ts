import fs from "node:fs/promises";
import sharp from "sharp";
import { z } from "zod";
import type { SimpleArtifact } from "./simple-content";
import type { DesignSpec } from "./freeform-design";
import { askWorkflowModel, workflowModelConfigured } from "./workflow-model";
import { safeRemoteUrl } from "./internet-assets";

const Review = z.object({ passed: z.boolean(), issues: z.array(z.string()).max(10), summary: z.string() });
export type GateReport = z.infer<typeof Review>;

async function reopenedPage(raw: string) {
  let url = await safeRemoteUrl(raw);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(12_000), headers: { "user-agent": "OlaEvidenceReview/1.0" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Source redirected without a location");
      url = await safeRemoteUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok || !/text\/html|text\/plain/i.test(response.headers.get("content-type") ?? "")) throw new Error(`HTTP ${response.status} or unreadable source`);
    if (!response.body) throw new Error("Source returned no readable body");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 150_000) {
      const { done, value } = await reader.read();
      if (done) break;
      const segment = value.subarray(0, 150_000 - size);
      chunks.push(segment); size += segment.byteLength;
    }
    await reader.cancel().catch(() => {});
    const page = Buffer.concat(chunks.map((part) => Buffer.from(part))).toString("utf8").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 12_000);
    if (page.length < 100) throw new Error("Source page contained too little readable text");
    return { url: url.toString(), excerpt: page };
  }
  throw new Error("Source redirected too many times");
}

export async function reviewContentEvidence(artifact: SimpleArtifact, brief: string, brand: unknown, requiresSources: boolean): Promise<GateReport> {
  const issues: string[] = [];
  if (requiresSources && !artifact.researchSources.length) issues.push("This fact-sensitive brief has no verified sources.");
  const reopened: Array<{ url: string; claim: string; excerpt: string }> = [];
  if (requiresSources) for (const source of artifact.researchSources) {
    try {
      reopened.push({ ...await reopenedPage(source.url), claim: source.claim });
    } catch (error) { issues.push(`Could not reopen cited source ${source.url}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (!workflowModelConfigured()) return { passed: issues.length === 0, issues, summary: issues.length ? "Evidence needs review." : "Evidence preflight passed." };
  const content = artifact.type === "post" || artifact.type === "story" ? { headline: artifact.headline, subline: artifact.subline, caption: artifact.type === "post" ? artifact.caption : undefined } : artifact.type === "article" ? { title: artifact.title, sections: artifact.sections.map(({ title, body }) => ({ title, body })) } : { title: artifact.title, slides: artifact.slides.map(({ title, body }) => ({ title, body })) };
  const review = await askWorkflowModel(Review, `You are an independent content and evidence QA agent. Check every material claim in the draft against the original brief and REOPENED cited source excerpts. Treat the original brief as evidence only for explicitly supplied or fictional facts. Flag each claim that cannot be checked or is contradicted. Catch invented specifics, missing requested information, weak usefulness, wrong format, and poor structure. Judge actual text, not creator assurances. Return ONLY JSON {"passed":boolean,"issues":["specific actionable issue"],"summary":"short summary"}. Brief: ${JSON.stringify(brief)}. Brand: ${JSON.stringify(brand).slice(0, 4500)}. Reopened sources: ${JSON.stringify(reopened).slice(0, 35000)}. Draft: ${JSON.stringify(content).slice(0, 18000)}.`);
  const all = [...issues, ...review.issues];
  return { passed: review.passed && all.length === 0, issues: all, summary: review.summary };
}

async function fileReady(path: string | undefined) {
  if (!path) return false;
  try { return (await fs.stat(path)).size > 0; } catch { return false; }
}

export async function reviewSimpleExport(artifact: SimpleArtifact): Promise<GateReport> {
  const issues: string[] = [];
  if (artifact.type === "article") {
    if (!artifact.html || !artifact.markdown) issues.push("Article HTML or Markdown is missing.");
  } else if (artifact.type === "presentation") {
    if (!await fileReady(artifact.pptxPath)) issues.push("Editable PowerPoint export is missing or empty.");
  } else {
    const paths = artifact.type === "carousel" ? artifact.imagePaths : [artifact.imagePath];
    if (!paths?.length || paths.some((path) => !path)) issues.push("One or more image exports are missing.");
    for (const path of paths ?? []) {
      if (!await fileReady(path)) { issues.push("An image export is missing or empty."); continue; }
      try {
        const meta = await sharp(path).metadata();
        const expected = artifact.type === "story" ? [1080, 1920] : [1080, 1350];
        if (meta.width !== expected[0] || meta.height !== expected[1]) issues.push(`An image export has the wrong dimensions: ${meta.width}×${meta.height}.`);
      } catch { issues.push("An image export cannot be decoded."); }
    }
  }
  return { passed: issues.length === 0, issues, summary: issues.length ? "Export validation failed." : "Exports are present and valid." };
}

export async function reviewDesignVisual(spec: DesignSpec, brief: string, brand: unknown): Promise<GateReport> {
  const issues: string[] = [];
  if (!await fileReady(spec.svgPath) || !await fileReady(spec.imagePath)) issues.push("PNG or editable SVG export is missing.");
  if (spec.elements.some((element) => "width" in element && element.x + element.width > 1.001)) issues.push("An element extends beyond the right edge.");
  if (spec.elements.some((element) => "height" in element && element.y + element.height > 1.001)) issues.push("An element extends beyond the bottom edge.");
  if (issues.length || !spec.imagePath) return { passed: false, issues, summary: "Design export needs repair." };
  if (!workflowModelConfigured()) return { passed: false, issues: ["Visual QA needs an AI provider before this design can be marked ready."], summary: "Rendered design could not be reviewed." };
  const image = `data:image/jpeg;base64,${(await sharp(spec.imagePath).resize({ width: 1100, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer()).toString("base64")}`;
  const review = await askWorkflowModel(Review, `You are an independent art director reviewing the ACTUAL rendered design. Check all required copy, factual restraint, readable text, clipping, composition, spacing, brand fit, and whether the design fulfills its purpose. Report only material, fixable issues. Return ONLY JSON {"passed":boolean,"issues":["specific actionable issue"],"summary":"short summary"}. Brief: ${JSON.stringify(brief)}. Brand: ${JSON.stringify(brand).slice(0, 4000)}. Design elements: ${JSON.stringify(spec.elements).slice(0, 12000)}.`, [image]);
  return { passed: review.passed && review.issues.length === 0, issues: review.issues, summary: review.summary };
}
