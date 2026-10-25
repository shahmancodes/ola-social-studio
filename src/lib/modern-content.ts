import {semanticDesignBlock} from "./semantic-design-render";
import {lineSegments,rotateSegment} from './design-primitives';
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
import { buildVisualScene, scenePng, sceneSvg, type VisualScene } from "./content-layout";
import { componentIllustrationData, renderSemanticComponentPng, semanticFontFaces } from "./semantic-component-image";
import { semanticComponentHtml, SEMANTIC_COMPONENT_CSS } from "./semantic-components";
import { sceneFontCss } from "./scene-renderer";
import { contentForEvidence } from "./artifact-repair";
import { VisualFindingSchema } from "./composition-design";
import { sceneTargets } from "./composition-scene";
import { artifactPages } from "./composition";
import { observeLayout, layoutRepetitionFindings, layoutRepetitionObservations } from './layout-review';
import { mobileTextEvidence, mobileReadabilityFindings } from './layout-readability';
import { DESIGN_CHOICE_STANDARD } from './design-choice';
import {recipeCredit} from './design-recipes';
import { articleBodyHtml } from "./article-markdown";
import { CRAFT_REVIEW_STANDARD } from './art-direction';
import { craftInspectionImages } from './visual-inspection';
import { typographyParts } from './design-typography';
import { imageGeometryEvidence } from './image-geometry-evidence';
import { supportingCopyBudgetChecks, supportingCopyBudgetGuide } from './supporting-copy-budget';

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

export function addSceneToPptx(deck: pptxgen, scene: VisualScene) {
  const slide = deck.addSlide();
  slide.background = { color: hex(scene.background) };
  const toIn = (number: number) => number / 96;
  for (const element of scene.elements) {
    if (element.hidden) continue;
    if (element.kind === "rect") slide.addShape(element.radius&&element.radius>=element.w/2&&Math.abs(element.w-element.h)<.01 ? deck.ShapeType.ellipse : element.radius ? deck.ShapeType.roundRect : deck.ShapeType.rect, {
      x: toIn(element.x), y: toIn(element.y), w: toIn(element.w), h: toIn(element.h),
      rotate: element.rotation,
      rectRadius: element.radius ? toIn(element.radius) : undefined,
      fill: { color: hex(element.fill) }, line: { color: hex(element.fill), transparency: 100 },
    });
    else if (element.kind === "line") for(const part of lineSegments(element)) {const segment=rotateSegment(part,(element.x+element.x2)/2,(element.y+element.y2)/2,element.rotation);slide.addShape(deck.ShapeType.line, {
      x: toIn(segment.x), y: toIn(segment.y), w: toIn(segment.x2 - segment.x), h: toIn(segment.y2 - segment.y),
      line: { color: hex(element.color), width: Math.max(1, element.width * 0.75) },
    });}
    else if (element.kind === "image") {
      const sourceWidth = element.bytes.readUInt32BE(16);
      const sourceHeight = element.bytes.readUInt32BE(20);
      const scale = Math.min(element.w / sourceWidth, element.h / sourceHeight);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      slide.addImage({ rotate: element.rotation, data: `data:image/png;base64,${element.bytes.toString("base64")}`, x: toIn(element.x + (element.w - width) / 2), y: toIn(element.y + (element.h - height) / 2), w: toIn(width), h: toIn(height) });
    }
    else {
      const box=element.textbox;
      if(box&&(box.fill||box.borderWidth>0)){
        const width=box.borderWidth;
        const radius=box.radius==='pill'?Math.min(element.w,element.h)/2:Math.min(box.radius,element.w/2,element.h/2);
        const shape=(inset:number,stroke:number,fill:boolean)=>slide.addShape(radius?deck.ShapeType.roundRect:deck.ShapeType.rect,{
          rotate:element.rotation,
          x:toIn(element.x+inset),y:toIn(element.y+inset),w:toIn(Math.max(0,element.w-inset*2)),h:toIn(Math.max(0,element.h-inset*2)),rectRadius:radius?toIn(Math.max(0,radius-inset)):undefined,
          fill:{color:hex(box.fill??scene.background),transparency:fill&&box.fill?(1-box.fillOpacity)*100:100},
          line:{color:hex(box.borderColor),width:stroke*.75,transparency:stroke?(1-box.borderOpacity)*100:100,
            dashType:box.borderStyle==='dashed'?'dash':box.borderStyle==='dotted'?'sysDot':'solid'},
        });
        // Fill stops at the inside border edge, just like CSS background-clip:padding-box.
        if(box.fill)shape(width,0,true);
        if(width>0){
          // Native editable double borders: two strokes with an actually transparent gap.
          if(box.borderStyle==='double'&&width>=3){shape(width/6,width/3,false);shape(width*5/6,width/3,false);}
          else shape(width/2,width,false);
        }
      }
      const insetX=box?(box.padding.left+box.borderWidth):0,insetY=box?(box.padding.top+box.borderWidth+element.size*.2):0;
      slide.addText(element.typography?typographyParts(element.lines.join('\n'),{...element.typography,breakAfter:undefined}).map(part=>({text:part.text,options:{color:hex(part.treatment==='accent'?element.accentColor??element.color:element.color),bold:part.treatment==='bold'||element.weight==='bold',italic:part.treatment==='italic'||element.italic}})):element.lines.join("\n"), {
      x: toIn(element.x+insetX), y: toIn(element.y+insetY), w: toIn(element.w-insetX-(box?box.padding.right+box.borderWidth:0)), h: toIn(element.h-insetY-(box?box.padding.bottom+box.borderWidth:0)),
      rotate:element.rotation,
      fontFace: (element.fontFamily ?? 'Arial').split(',')[0].replaceAll('"','').replaceAll("'",''), fontSize: element.size * 0.75, bold: element.weight === "bold", italic: element.italic, underline: element.underline ? {style:"sng"} : undefined, color: hex(element.color),
      align: element.align ?? "left", valign: "top", margin: 0, breakLine: false,
      ...(element.typography?{lineSpacingMultiple:element.typography.leading??1.15,charSpacing:(element.typography.tracking??0)*element.size*.75}:{}),
    });
    }
  }
}

export async function renderModernArtifact(artifact: SimpleArtifact, brand: ContentBrand, projectDir: string) {
  await fs.mkdir(projectDir, { recursive: true });
  const credits=artifactPages(artifact).flatMap((p,i)=>p.composition?.recipe?[{page:i+1,...recipeCredit(p.composition.recipe.id)}]:[]);
  if(credits.length)await fs.writeFile(path.join(projectDir,'design-recipe-credits.json'),JSON.stringify({version:1,credits},null,2));
  const resolveAsset = (id?: string) => {
    if (!id || /^(none|null)$/i.test(id)) return undefined;
    const mapped=brand.assetAliases?.[id]??id;
    if(mapped===brand.logo?.id)return undefined; // Official logo is already placed by the renderer.
    if(!brand.assets.some(a=>a.id===mapped))throw new Error("Selected artwork is not in this company's asset snapshot.");
    return mapped;
  };
  if(artifact.type==='story'||artifact.type==='post'||artifact.type==='poster'){artifact.assetId=resolveAsset(artifact.assetId);if(artifact.supportingAssetIds)artifact.supportingAssetIds=artifact.supportingAssetIds.map(id=>{const mapped=resolveAsset(id);if(!mapped)throw new Error('A triptych slot must reference an image, not the protected brand mark.');return mapped;});}
  if(artifact.type==='carousel'||artifact.type==='presentation')artifact.slides.forEach(s=>{s.assetId=resolveAsset(s.assetId);if(s.supportingAssetIds)s.supportingAssetIds=s.supportingAssetIds.map(id=>{const mapped=resolveAsset(id);if(!mapped)throw new Error('A triptych slot must reference an image, not the protected brand mark.');return mapped;});});
  if (artifact.type === "article") {
    const p = brand.palette;
    const style = artifact.articleStyle;
    const sections = await Promise.all(artifact.sections.map(async (section) => {
      const body = section.bodyJson ? generateHTML(section.bodyJson as JSONContent, [StarterKit]) : articleBodyHtml(section.body);
      const component = section.semanticDesign ? `<div class="content-component"><img style="width:100%;height:auto" alt="${escape(section.semanticDesign.spec.purpose)}" src="data:image/png;base64,${(await scenePng(semanticDesignBlock(section,brand))).toString('base64')}"/></div>` : section.semanticComponent ? `<div class="content-component">${semanticComponentHtml(section.semanticComponent, "", await componentIllustrationData(section.semanticComponent.assetPath, brand.companyId))}</div>` : "";
      return `<section><h2>${escape(section.title)}</h2>${body}${component}</section>`;
    }));
    const css = `${artifact.sections.some((section) => section.semanticComponent) ? await semanticFontFaces() : ""}body{margin:0;background:${style?.background ?? p.background};color:${style?.color ?? p.ink};font-family:Arial,sans-serif}article{box-sizing:border-box;max-width:${style?.pageWidth ?? 920}px;margin:0 auto;padding:64px 72px 100px;background:${style?.background ?? "#FFFFFF"};min-height:100vh}header{border-top:8px solid ${p.accent};padding-top:32px;margin-bottom:54px}.brand{color:${p.accent};font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:800}h1{font-size:${style?.titleSize ?? 52}px;line-height:1.07;letter-spacing:-.045em;margin:20px 0 0}h2{font-size:${style?.headingSize ?? 27}px;line-height:1.18;letter-spacing:-.025em;margin:56px 0 18px}p,li{font-size:${style?.bodySize ?? 18}px;line-height:1.7}li{margin:9px 0}section{max-width:690px}section+section{border-top:1px solid #e5e0e8}.content-component{width:100%;max-width:690px;aspect-ratio:1080/760;position:relative;container-type:inline-size;--rd-accent:${p.accent}}${SEMANTIC_COMPONENT_CSS}@media(max-width:700px){article{padding:34px 24px 64px}h1{font-size:${Math.min(style?.titleSize ?? 52, 39)}px}h2{font-size:${Math.min(style?.headingSize ?? 27, 24)}px}}`;
    artifact.html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(artifact.title)}</title><style>${css}</style></head><body><article><header><div class="brand">${escape(brand.name)} / Guide</div><h1>${escape(artifact.title)}</h1></header>${sections.join("")}</article></body></html>`;
    artifact.markdown = `# ${artifact.title}\n\n${artifact.sections.map((section) => `## ${section.title}\n\n${section.bodyJson ? markdownNode(section.bodyJson as JSONContent).trim() : section.body}`).join("\n\n")}`;
    await Promise.all([fs.writeFile(path.join(projectDir, "article.html"), artifact.html), fs.writeFile(path.join(projectDir, "article.md"), artifact.markdown)]);
    return artifact;
  }
  if (artifact.type === "post" || artifact.type === "story" || artifact.type === "poster") {
    const page = { semanticDesign:artifact.semanticDesign, editorAppearance: artifact.editorAppearance, composition: artifact.composition, semanticComponent: artifact.semanticComponent, credit: artifact.credit, visualContent: artifact.visualContent, title: artifact.headline, body: artifact.subline, cta: (artifact.type === "story" || artifact.type === "poster") ? artifact.cta : undefined, storyTreatment: artifact.type === "story" ? artifact.storyTreatment : undefined, layout: artifact.layout, eyebrow: artifact.eyebrow, assetId: artifact.assetId, supportingAssetIds: artifact.supportingAssetIds, visualOverrides: artifact.visualOverrides };
    const scene = await buildVisualScene(artifact.type, page, brand, 0, 1, artifact.composition ? undefined : await componentImage(artifact.semanticComponent, brand));
    artifact.imagePath = path.join(projectDir, `${artifact.type}.png`);
    await fs.writeFile(artifact.imagePath, await scenePng(scene));
    if (scene.measured) await fs.writeFile(artifact.imagePath.replace(/\.png$/, ".svg"), sceneSvg(scene).replace("><rect", `><style>${await sceneFontCss(scene)}</style><rect`));
    artifact.renderEvidence = [{ page: 1, fonts: scene.fontReport ?? [], layout: scene.responsiveLayout ? { ...scene.responsiveLayout.evidence, observation:observeLayout(scene), readability:mobileTextEvidence(scene), images:await imageGeometryEvidence(scene), ...sceneTargets(scene), recipe:scene.responsiveLayout.recipe,semanticDesign:artifact.semanticDesign } : undefined, checks: scene.measured ? ["font-load", "glyph-measurement", ...(scene.responsiveLayout?["copy-coverage"]:[]), "text-fit", "contrast", "collision", "safe-area"] : ["legacy-render"] }];
    return artifact;
  }
  const isPresentation = artifact.type === "presentation";
  const deck = isPresentation ? new pptxgen() : null;
  if (deck) { deck.layout = "LAYOUT_WIDE"; deck.author = brand.name; deck.subject = artifact.title; }
  const paths: string[] = [];
  artifact.renderEvidence = [];
  for (const [index, slide] of artifact.slides.entries()) {
    const scene = await buildVisualScene(artifact.type, slide, brand, index, artifact.slides.length, slide.composition ? undefined : await componentImage(slide.semanticComponent, brand));
    const target = path.join(projectDir, `${isPresentation ? "preview" : "slide"}-${String(index + 1).padStart(2, "0")}.png`);
    await fs.writeFile(target, await scenePng(scene));
    if (scene.measured) await fs.writeFile(target.replace(/\.png$/, ".svg"), sceneSvg(scene).replace("><rect", `><style>${await sceneFontCss(scene)}</style><rect`));
    paths.push(target);
    artifact.renderEvidence.push({ page: index + 1, fonts: scene.fontReport ?? [], layout: scene.responsiveLayout ? { ...scene.responsiveLayout.evidence, observation:observeLayout(scene), readability:mobileTextEvidence(scene), images:await imageGeometryEvidence(scene), ...sceneTargets(scene), recipe:scene.responsiveLayout.recipe,semanticDesign:slide.semanticDesign } : undefined, checks: scene.measured ? ["font-load", "glyph-measurement", ...(scene.responsiveLayout?["copy-coverage"]:[]), "text-fit", "contrast", "collision"] : ["legacy-render"] });
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

export async function reviewModernArtifact(artifact: SimpleArtifact, brand: ContentBrand, passNumber: number, ask: (prompt: string, images?: string[]) => Promise<string>, brief = "", references:string[] = []) {
  const repetition=[...layoutRepetitionFindings(artifact),...mobileReadabilityFindings(artifact)];
  const deterministic: string[] = [...(artifact.componentDesignWarnings??[]),...repetition.map(f=>`Page ${f.page}: ${f.problem}`)];
  const supportingCopy=supportingCopyBudgetChecks(artifact,brief);
  deterministic.push(...supportingCopy.flatMap(check=>check.issue?[check.issue]:[]));
  if(passNumber===1&&artifact.designSelection?.ready===false)deterministic.push(...artifact.designSelection.issues.map(i=>'Candidate selection requires refinement: '+i));
  if ((artifact.type === "post" || artifact.type === "story" || artifact.type === "poster") && artifact.headline.toLowerCase().replace(/[^a-z]/g, " ").trim() === artifact.subline.toLowerCase().replace(/[^a-z]/g, " ").trim()) deterministic.push("The headline and subline repeat the same message.");
  if (artifact.type === "story" && artifact.subline.split(/[.!?]+/).filter((part) => part.trim()).length > 2) deterministic.push("The Story tries to communicate more than one main idea in a single frame.");
  if (artifact.type === "article" && !artifact.sections.some((section) => /example|sample|worked/i.test(`${section.title} ${section.body}`))) deterministic.push("Instructional article needs a concrete worked example.");
  if (artifact.type === "presentation" || artifact.type === "carousel") {
    if (new Set(artifact.slides.map((slide) => `${slide.title.toLowerCase().trim()}|${slide.body.toLowerCase().trim()}`)).size !== artifact.slides.length) deterministic.push("The deck repeats a slide instead of advancing its message.");
    if (artifact.type === "carousel" && artifact.slides[0]?.role && artifact.slides[0].role !== "hook") deterministic.push("The opening slide needs a hook.");
    if (artifact.type === "carousel" && artifact.slides.at(-1)?.role && artifact.slides.at(-1)?.role !== "close") deterministic.push("The final slide needs a relevant close.");
  }
  const selectedAssets = artifact.type === "post" || artifact.type === "story" || artifact.type === "poster" ? [artifact.assetId] : artifact.type === "article" ? [] : artifact.slides.map((slide) => slide.assetId);
  if (selectedAssets.some((id) => id && !brand.assets.some((asset) => asset.id === id))) deterministic.push("An artwork selection is missing from the company asset shortlist.");
  const images: string[] = [];
  const exportDimensions: Array<{page:number;width:number|undefined;height:number|undefined}> = [];
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
      const files = artifact.type === "post" || artifact.type === "story" || artifact.type === "poster" ? [artifact.imagePath] : artifact.type === "carousel" ? artifact.imagePaths : [];
      for (const file of (files ?? []).filter(Boolean) as string[]) {
        const metadata=await sharp(file).metadata();
        exportDimensions.push({page:exportDimensions.length+1,width:metadata.width,height:metadata.height});
        images.push(`data:image/jpeg;base64,${(await sharp(file).resize({ width: 820 }).jpeg({ quality: 70 }).toBuffer()).toString("base64")}`);
      }
    }
  }
  if (!images.length || artifact.type === "carousel" && images.length !== artifact.slides.length) throw new Error("Every rendered carousel slide must be available for visual review.");
  const prompt = `You are an independent senior editor and art director. Review the ACTUAL rendered ${artifact.type} for a company. Be critical: technically exportable is not production-ready. Score each criterion 0–5: clarity, usefulness, visualCraft, brandFit, editability. Fail if any score is below 4 or if a material issue remains. Check rendered geometry across pages, not only different family or recipe labels. Repeated logos, fonts, margins and coherent related data pages are intentional; repeated structures across different narrative roles need judgment against their purpose, rather than automatic rejection. Flag decorative containers that do not group, protect contrast or explain a relationship. When textbox styling is requested, verify its actual corner shape, border treatment, colors and shades, opacity and comfortable padding against the brief. A meaningful border must remain visible at use size. Report textbox defects against the existing text target ID, not an invented separate box ID. Negative space alone never justifies adding a box. Check generic/repeated copy, purposeful composition and variation, a diagram large enough to explain its relationship, meaningful use of the usable frame for short copy (without filler or invented content), legibility at use size, brand asset fit, factual restraint, and whether the format does real work. For articles demand a usable example when compatible with the brief; for decks demand slide-to-slide progression. ${artifact.type === "story" ? "Story text must stay within y=270..1536 on a 1920px canvas: reserved interface areas above/below are intentional and must not be filled." : artifact.type === "poster" ? "This is a single A4 portrait poster. Review edge margins, viewing-distance legibility, optical balance, focal point and the requested visual idea. Instagram interface safe areas and the 360px social-text thresholds do not apply to this print poster. Phone-scaled measurements in render diagnostics are informational here; judge its A4 viewing-distance legibility. Negative space is permitted when it supports the composition." : "Review the margins, hierarchy and composition for the requested format."} Follow the explicit brand designSystem, including light-surface logo treatment when selected. The renderer automatically places the approved primary logo asset; a wordmark and a symbol in style references may be different legitimate lockups. Do not allege asset substitution solely because a reference uses a different lockup; identify a visible distortion or verified mismatch with the selected asset. Logo placement rules apply per page by default: one official logo on each slide is intentional consistent branding. Require a single logo across an entire deck only when the brief explicitly says once in the entire deck/carousel. A private evaluation concept does not need additional disclaimer copy unless the brief requests it. ${supportingCopyBudgetGuide(brief)} Deterministic supporting-copy checks: ${JSON.stringify(supportingCopy)}. These counts resolve visible canonical fields and exclude the headline, CTA and credit. Judge any actual missing or duplicated wording separately; do not add the CTA to the supporting-word budget or demand shortening where the recorded count is in range. The original brief is authoritative: preserve exact supplied copy and do not demand additional content or examples if the brief forbids them. A layout name or narrative role does not promise extra copy. ${DESIGN_CHOICE_STANDARD} Composition intent and previous repair suggestions describe proposed solutions, not additional user requirements. Judge whether the actual layout communicates the approved meaning. Do not demand check marks, bullets, arrows or boxes merely because a checklist, process or composition intent mentions them. Missing marks are a defect when the authoritative brief requires them or their absence visibly obscures grouping, order or another necessary relationship; name that communication failure. Alternative clear visual treatments are valid. Keep the same professional craft threshold for hierarchy, grouping, optical balance and legibility. Editability is checked separately from the structured source; score editability 4 unless the supplied structured content is actually missing, and never fail because a PNG is flattened. Preview images have been resized to 820px wide for inspection. Never infer original export dimensions from these previews: the file decoder measured ${JSON.stringify(exportDimensions)}. The export gate, not visual estimation, owns pixel dimensions. Actual render checks also include decoded image source dimensions, viewport and displayed geometry with fitting:contain. Use those measurements for image proportions: a contained image preserves its original ratio even when its viewport has another shape. Do not infer stretching from approximate preview measurements or perspective in the photographed subject. Require contradictory rendered evidence for a distortion finding; wrong subjects, missing images, unreadable detail and inappropriate image scale remain visual defects. Do not infer details not visible. Original brief: ${JSON.stringify(brief)}. Actual render checks: ${JSON.stringify(artifact.renderEvidence ?? [])}. When there is a visual defect, include findings:[{page:1-based page number,targets:[actual group or element IDs from render checks],problem:"specific visible defect",successCriterion:"observable change that fixes it"}]. Diagnose grouping, scale, gaps, alignment or arrangement using those IDs. Use targets:["content"] for a defect affecting the whole page; always provide at least one target. Do not invent targets or demand new copy. Return ONLY JSON {"findings":[],"scores":{"clarity":0,"usefulness":0,"visualCraft":0,"brandFit":0,"editability":0},"issues":["specific actionable issue"],"summary":"one sentence"}. Company brief: ${JSON.stringify({ name: brand.name, memory:brand.memory, audience: brand.audience, voice: brand.voice, imagery: brand.imagery, palette: brand.palette, designSystem: brand.designSystem })}. Visible copy (component references resolved; segmentation may place supporting copy inside a diagram instead of a standalone line): ${JSON.stringify(contentForEvidence(artifact)).slice(0, 14000)}. Previous visual repair objectives: ${JSON.stringify(artifact.quality?.findings ?? [])}. Verify each objective against the new rendered pages; retain unresolved defects and check for regressions. Approved content representation (verify the rendered communication, not only its metadata): ${JSON.stringify(artifact.representationPlan ?? null)}. Composition intent: ${JSON.stringify(artifactPages(artifact).map(p=>p.composition&&({family:p.composition.family,recipe:p.composition.recipe,intent:p.composition.intent}))).slice(0,5000)}. Advisory repetition observations (not automatic defects): ${JSON.stringify(layoutRepetitionObservations(artifact))}. Deterministic concerns: ${JSON.stringify(deterministic)}.`;
  try {
    const inspection=artifact.artDirection?await craftInspectionImages(artifact):{images:[],labels:[]};
    const craftPrompt=artifact.artDirection?` ${CRAFT_REVIEW_STANDARD} First are the ${images.length} page previews described above. Next views: ${JSON.stringify(inspection.labels)}. Last ${references.length} images are reference-only brand examples. Compare craft, scale and style against those examples without reproducing them. Creative directions: ${JSON.stringify(artifact.artDirection)}. Chosen direction IDs: ${JSON.stringify(artifactPages(artifact).map(p=>p.composition?.directionId))}. Evaluate the actual component in the page, not only its close-up. Previous selection: ${JSON.stringify(artifact.designSelection)}. Refinement may use typography and responsive.craft controls; preserve source copy and faithful representations.`:'';
    const raw = await ask(prompt+craftPrompt, [...images,...inspection.images,...references]);
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    const scores = formatScores(parsed.scores ?? {});
    const normalizedFindings=Array.isArray(parsed.findings)?parsed.findings.map((finding:Record<string,unknown>)=>finding&&Array.isArray(finding.targets)&&finding.targets.length===0?{...finding,targets:['content']}:finding):parsed.findings;
    const reviewedFindings = VisualFindingSchema.array().max(30).parse(normalizedFindings ?? []);
    const allFindings = VisualFindingSchema.array().parse([...repetition,...reviewedFindings]);
    // The artifact bounds its structured findings, but every defect still participates in readiness.
    const findings = allFindings.slice(0,30);
    const pages = artifactPages(artifact);
    for(const f of allFindings) {
      if(f.page>pages.length && artifact.type!=='article')throw new Error('Review referenced a nonexistent page.');
      const layout=artifact.renderEvidence?.find(e=>e.page===f.page)?.layout as {groups?:Array<{id:string}>;targets?:Array<{id:string}>}|undefined;
      const known=new Set(['content','copy','artwork','title','body','cta','credit','eyebrow',...(layout?.groups??[]).map(g=>g.id),...(layout?.targets??[]).map(g=>g.id)]);
      if(f.targets.some(id=>!known.has(id)))throw new Error('Review referenced an unknown layout target.');
    }
    const issues = [...new Set([...deterministic, ...(Array.isArray(parsed.issues) ? parsed.issues.map(String) : []), ...allFindings.map(f=>`Page ${f.page}: ${f.problem}`)])];
    const pass = !issues.length && Object.values(scores).every((value) => Number.isFinite(value) && value >= 4);
    return { pass, scores, issues, findings, summary: String(parsed.summary ?? "Review completed."), passNumber };
  } catch (error) {
    return { pass: false, scores: { clarity: 0, usefulness: 0, visualCraft: 0, brandFit: 0, editability: 0 }, issues: [...deterministic, `Visual review unavailable: ${error instanceof Error ? error.message : String(error)}`], summary: "Visual review could not establish production readiness.", passNumber };
  }
}
