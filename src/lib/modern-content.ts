import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pptxgen from "pptxgenjs";
import sharp from "sharp";
import { chromium } from "playwright";
import type { JSONContent } from "@tiptap/core";
import { generateHTML } from "@tiptap/html/server";
import StarterKit from "@tiptap/starter-kit";
import type { SimpleArtifact } from "./simple-content";
import type { ContentBrand } from "./content-brand";
import { buildVisualScene, scenePng, type VisualScene } from "./content-layout";
import { componentIllustrationData, renderSemanticComponentPng, semanticFontFaces } from "./semantic-component-image";
import { semanticComponentHtml, SEMANTIC_COMPONENT_CSS } from "./semantic-components";
import { articleBodyHtml } from "./article-markdown";

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const hex = (value: string) => value.replace(/^#/, "");
const execFileAsync = promisify(execFile);
async function componentImage(component: unknown, brand: ContentBrand) {
  if (!component) return undefined;
  return renderSemanticComponentPng(component as Parameters<typeof renderSemanticComponentPng>[0], brand.palette.accent, brand.companyId);
}

function markdownNode(node: JSONContent): string {
  if (node.type === "text") {
    let text = node.text ?? "";
    if (node.marks?.some((mark) => mark.type === "bold")) text = `**${text}**`;
    if (node.marks?.some((mark) => mark.type === "italic")) text = `*${text}*`;
    return text;
  }
  const inner = (node.content ?? []).map(markdownNode).join("");
  if (node.type === "paragraph") return `${inner}\n\n`;
  if (node.type === "heading") return `${"#".repeat(Number(node.attrs?.level ?? 2))} ${inner}\n\n`;
  if (node.type === "bulletList") return (node.content ?? []).map((item) => `- ${markdownNode(item).trim()}\n`).join("") + "\n";
  if (node.type === "orderedList") return (node.content ?? []).map((item, index) => `${index + 1}. ${markdownNode(item).trim()}\n`).join("") + "\n";
  if (node.type === "hardBreak") return "  \n";
  return inner;
}

function addSceneToPptx(deck: pptxgen, scene: VisualScene) {
  const slide = deck.addSlide();
  slide.background = { color: hex(scene.background) };
  const toIn = (number: number) => number / 96;
  for (const element of scene.elements) {
    if (element.kind === "rect") slide.addShape(element.radius ? deck.ShapeType.roundRect : deck.ShapeType.rect, {
      x: toIn(element.x), y: toIn(element.y), w: toIn(element.w), h: toIn(element.h),
      rectRadius: element.radius ? toIn(element.radius) : undefined,
      fill: { color: hex(element.fill) }, line: { color: hex(element.fill), transparency: 100 },
    });
    else if (element.kind === "line") slide.addShape(deck.ShapeType.line, {
      x: toIn(element.x), y: toIn(element.y), w: toIn(element.x2 - element.x), h: toIn(element.y2 - element.y),
      line: { color: hex(element.color), width: Math.max(1, element.width * 0.75) },
    });
    else if (element.kind === "image") {
      const sourceWidth = element.bytes.readUInt32BE(16);
      const sourceHeight = element.bytes.readUInt32BE(20);
      const scale = Math.min(element.w / sourceWidth, element.h / sourceHeight);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      slide.addImage({ data: `data:image/png;base64,${element.bytes.toString("base64")}`, x: toIn(element.x + (element.w - width) / 2), y: toIn(element.y + (element.h - height) / 2), w: toIn(width), h: toIn(height) });
    }
    else slide.addText(element.lines.join("\n"), {
      x: toIn(element.x), y: toIn(element.y), w: toIn(element.w), h: toIn(element.h),
      fontFace: "Arial", fontSize: element.size * 0.75, bold: element.weight === "bold", color: hex(element.color),
      align: element.align ?? "left", valign: "top", margin: 0, breakLine: false,
    });
  }
}

export async function renderModernArtifact(artifact: SimpleArtifact, brand: ContentBrand, projectDir: string) {
  await fs.mkdir(projectDir, { recursive: true });
  if (artifact.type === "article") {
    const p = brand.palette;
    const style = artifact.articleStyle;
    const sections = await Promise.all(artifact.sections.map(async (section) => {
      const body = section.bodyJson ? generateHTML(section.bodyJson as JSONContent, [StarterKit]) : articleBodyHtml(section.body);
      const component = section.semanticComponent ? `<div class="content-component">${semanticComponentHtml(section.semanticComponent, "", await componentIllustrationData(section.semanticComponent.assetPath, brand.companyId))}</div>` : "";
      return `<section><h2>${escape(section.title)}</h2>${body}${component}</section>`;
    }));
    const css = `${artifact.sections.some((section) => section.semanticComponent) ? await semanticFontFaces() : ""}body{margin:0;background:${style?.background ?? p.background};color:${style?.color ?? p.ink};font-family:Arial,sans-serif}article{box-sizing:border-box;max-width:${style?.pageWidth ?? 920}px;margin:0 auto;padding:64px 72px 100px;background:${style?.background ?? "#FFFFFF"};min-height:100vh}header{border-top:8px solid ${p.accent};padding-top:32px;margin-bottom:54px}.brand{color:${p.accent};font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:800}h1{font-size:${style?.titleSize ?? 52}px;line-height:1.07;letter-spacing:-.045em;margin:20px 0 0}h2{font-size:${style?.headingSize ?? 27}px;line-height:1.18;letter-spacing:-.025em;margin:56px 0 18px}p,li{font-size:${style?.bodySize ?? 18}px;line-height:1.7}li{margin:9px 0}section{max-width:690px}section+section{border-top:1px solid #e5e0e8}.content-component{width:100%;max-width:690px;aspect-ratio:1080/760;position:relative;container-type:inline-size;--rd-accent:${p.accent}}${SEMANTIC_COMPONENT_CSS}@media(max-width:700px){article{padding:34px 24px 64px}h1{font-size:${Math.min(style?.titleSize ?? 52, 39)}px}h2{font-size:${Math.min(style?.headingSize ?? 27, 24)}px}}`;
    artifact.html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(artifact.title)}</title><style>${css}</style></head><body><article><header><div class="brand">${escape(brand.name)} / Guide</div><h1>${escape(artifact.title)}</h1></header>${sections.join("")}</article></body></html>`;
    artifact.markdown = `# ${artifact.title}\n\n${artifact.sections.map((section) => `## ${section.title}\n\n${section.bodyJson ? markdownNode(section.bodyJson as JSONContent).trim() : section.body}`).join("\n\n")}`;
    await Promise.all([fs.writeFile(path.join(projectDir, "article.html"), artifact.html), fs.writeFile(path.join(projectDir, "article.md"), artifact.markdown)]);
    return artifact;
  }
  if (artifact.type === "post" || artifact.type === "story") {
    const page = { title: artifact.headline, body: artifact.subline, cta: artifact.type === "story" ? artifact.cta : undefined, storyTreatment: artifact.type === "story" ? artifact.storyTreatment : undefined, layout: artifact.layout, eyebrow: artifact.eyebrow, assetId: artifact.assetId, visualOverrides: artifact.visualOverrides };
    const scene = await buildVisualScene(artifact.type, page, brand, 0, 1, await componentImage(artifact.semanticComponent, brand));
    artifact.imagePath = path.join(projectDir, artifact.type === "post" ? "post.png" : "story.png");
    await fs.writeFile(artifact.imagePath, await scenePng(scene));
    return artifact;
  }
  const isPresentation = artifact.type === "presentation";
  const deck = isPresentation ? new pptxgen() : null;
  if (deck) { deck.layout = "LAYOUT_WIDE"; deck.author = brand.name; deck.subject = artifact.title; }
  const paths: string[] = [];
  for (const [index, slide] of artifact.slides.entries()) {
    const scene = await buildVisualScene(artifact.type, slide, brand, index, artifact.slides.length, await componentImage(slide.semanticComponent, brand));
    const target = path.join(projectDir, `${isPresentation ? "preview" : "slide"}-${String(index + 1).padStart(2, "0")}.png`);
    await fs.writeFile(target, await scenePng(scene));
    paths.push(target);
    if (deck) addSceneToPptx(deck, scene);
  }
  if (artifact.type === "presentation" && deck) {
    artifact.previewPaths = paths;
    artifact.pptxPath = path.join(projectDir, "presentation.pptx");
    await deck.writeFile({ fileName: artifact.pptxPath });
  } else if (artifact.type === "carousel") artifact.imagePaths = paths;
  return artifact;
}

const score = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(5, Number(value))) : 0;
const formatScores = (scores: Record<string, unknown>) => ({
  clarity: score(scores.clarity), usefulness: score(scores.usefulness), visualCraft: score(scores.visualCraft), brandFit: score(scores.brandFit), editability: score(scores.editability),
});

async function renderedPresentationPages(pptxPath: string, limit: number) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ola-pptx-review-"));
  try {
    await execFileAsync("soffice", ["-env:UserInstallation=file://" + path.join(dir, "profile"), "--headless", "--convert-to", "pdf", "--outdir", dir, pptxPath], { timeout: 90_000 });
    const pdf = path.join(dir, `${path.basename(pptxPath, ".pptx")}.pdf`);
    await fs.access(pdf);
    await execFileAsync("pdftoppm", ["-f", "1", "-l", String(limit), "-r", "90", "-jpeg", pdf, path.join(dir, "slide")], { timeout: 90_000 });
    const pages = (await fs.readdir(dir)).filter((name) => /^slide-\d+\.jpg$/.test(name)).sort();
    if (!pages.length) throw new Error("PPTX export produced no readable slide images.");
    return Promise.all(pages.map(async (name) => `data:image/jpeg;base64,${(await fs.readFile(path.join(dir, name))).toString("base64")}`));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

export async function reviewModernArtifact(artifact: SimpleArtifact, brand: ContentBrand, passNumber: number, ask: (prompt: string, images?: string[]) => Promise<string>) {
  const deterministic: string[] = [];
  if ((artifact.type === "post" || artifact.type === "story") && artifact.headline.toLowerCase().replace(/[^a-z]/g, " ").trim() === artifact.subline.toLowerCase().replace(/[^a-z]/g, " ").trim()) deterministic.push("The headline and subline repeat the same message.");
  if (artifact.type === "story" && artifact.subline.split(/[.!?]+/).filter((part) => part.trim()).length > 2) deterministic.push("The Story tries to communicate more than one main idea in a single frame.");
  if (artifact.type === "article" && !artifact.sections.some((section) => /example|sample|worked/i.test(`${section.title} ${section.body}`))) deterministic.push("Instructional article needs a concrete worked example.");
  if (artifact.type === "presentation" || artifact.type === "carousel") {
    if (new Set(artifact.slides.map((slide) => slide.layout)).size < Math.min(3, artifact.slides.length)) deterministic.push("Slides need at least three purposeful layout variants.");
    if (new Set(artifact.slides.map((slide) => `${slide.title.toLowerCase().trim()}|${slide.body.toLowerCase().trim()}`)).size !== artifact.slides.length) deterministic.push("The deck repeats a slide instead of advancing its message.");
    if (artifact.type === "carousel" && artifact.slides[0]?.role && artifact.slides[0].role !== "hook") deterministic.push("The opening slide needs a hook.");
    if (artifact.type === "carousel" && artifact.slides.at(-1)?.role && artifact.slides.at(-1)?.role !== "close") deterministic.push("The final slide needs a relevant close.");
  }
  const selectedAssets = artifact.type === "post" || artifact.type === "story" ? [artifact.assetId] : artifact.type === "article" ? [] : artifact.slides.map((slide) => slide.assetId);
  if (selectedAssets.some((id) => id && !brand.assets.some((asset) => asset.id === id))) deterministic.push("An artwork selection is missing from the company asset shortlist.");
  const images: string[] = [];
  if (artifact.type === "article" && artifact.html) {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1100, height: 1400 }, deviceScaleFactor: 1 });
      await page.setContent(artifact.html);
      const full = await page.screenshot({ fullPage: true });
      const height = (await sharp(full).metadata()).height ?? 1400;
      for (let top = 0; top < height && images.length < 4; top += 1250) {
        const segment = await sharp(full).extract({ left: 0, top, width: 1100, height: Math.min(1400, height - top) }).resize({ width: 900 }).jpeg({ quality: 72 }).toBuffer();
        images.push(`data:image/jpeg;base64,${segment.toString("base64")}`);
      }
    }
    finally { await browser.close(); }
  } else {
    if (artifact.type === "presentation" && artifact.pptxPath) images.push(...await renderedPresentationPages(artifact.pptxPath, 6));
    else {
      const files = artifact.type === "post" || artifact.type === "story" ? [artifact.imagePath] : artifact.type === "carousel" ? artifact.imagePaths : [];
      for (const file of (files ?? []).filter(Boolean) as string[]) images.push(`data:image/jpeg;base64,${(await sharp(file).resize({ width: 820 }).jpeg({ quality: 70 }).toBuffer()).toString("base64")}`);
    }
  }
  if (!images.length || artifact.type === "carousel" && images.length !== artifact.slides.length) throw new Error("Every rendered carousel slide must be available for visual review.");
  const prompt = `You are an independent senior editor and art director. Review the ACTUAL rendered ${artifact.type} for a company. Be critical: technically exportable is not production-ready. Score each criterion 0–5: clarity, usefulness, visualCraft, brandFit, editability. Fail if any score is below 4 or if a material issue remains. Check generic/repeated copy, purposeful composition and variation, legibility at use size, brand asset fit, factual restraint, and whether the format does real work. For articles demand a usable example; for decks demand slide-to-slide progression. Do not infer details not visible. Return ONLY JSON {"scores":{"clarity":0,"usefulness":0,"visualCraft":0,"brandFit":0,"editability":0},"issues":["specific actionable issue"],"summary":"one sentence"}. Company brief: ${JSON.stringify({ name: brand.name, audience: brand.audience, voice: brand.voice, imagery: brand.imagery, palette: brand.palette })}. Content: ${JSON.stringify(artifact).slice(0, 14000)}. Deterministic concerns: ${JSON.stringify(deterministic)}.`;
  try {
    const raw = await ask(prompt, images);
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    const scores = formatScores(parsed.scores ?? {});
    const issues = [...deterministic, ...(Array.isArray(parsed.issues) ? parsed.issues.map(String) : [])];
    const pass = !issues.length && Object.values(scores).every((value) => Number.isFinite(value) && value >= 4);
    return { pass, scores, issues, summary: String(parsed.summary ?? "Review completed."), passNumber };
  } catch (error) {
    return { pass: false, scores: { clarity: 0, usefulness: 0, visualCraft: 0, brandFit: 0, editability: 0 }, issues: [...deterministic, `Visual review unavailable: ${error instanceof Error ? error.message : String(error)}`], summary: "Visual review could not establish production readiness.", passNumber };
  }
}
