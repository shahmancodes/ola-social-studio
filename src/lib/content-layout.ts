import { textboxCssText } from './textbox-style';
import { CANVAS_TYPOGRAPHY_CSS } from "./canvas-typography";
import { typographyHtml, type TextTypography } from './design-typography';
import type { EditorAppearance } from "./editor-appearance";
import { applyEditorAppearance } from "./scene-editor-appearance";
import { buildPosterScene } from "./poster-scene";
import fs from "node:fs/promises";
import sharp from "sharp";
import { buildSocialScene } from "./social-scene";
import { renderMeasuredScene } from "./scene-renderer";
import type { BrandAsset, ContentBrand } from "./content-brand";
import type { VisualLayout } from "./visual-layout-types";
import { storyTextIsSafe } from "./story-safe-area";
import { buildCompositionScene } from "./composition-scene";
import type { Composition } from "./composition";
import type { SlideSpec } from "./schemas";
import type { ResponsiveSceneLayout } from "./responsive-layout";
import {recipeCredit} from './design-recipes';
import { freeformScene, identifySceneObjects } from './freeform-scene';
import { lineSegments, type LineStyle } from './design-primitives';

export type VisualOverride = { x?: number; y?: number; width?: number; height?: number; fontSize?: number; color?: string };
export type VisualContent = { kind: "checklist" | "process" | "comparison" | "example"; items: Array<{label:string;detail:string}> };
export type VisualPage = { semanticDesign?: import("./semantic-design").SemanticDesign; supportingAssetIds?: string[]; editorAppearance?: EditorAppearance; composition?: Composition; semanticComponent?: SlideSpec["semanticComponent"]; credit?: string; visualContent?: VisualContent; title: string; body: string; cta?: string; storyTreatment?: "quick-tip" | "announcement" | "image-showcase" | "conversation-prompt"; layout?: VisualLayout; eyebrow?: string; assetId?: string; visualOverrides?: { background?: string; eyebrow?: VisualOverride; title?: VisualOverride; body?: VisualOverride; cta?: VisualOverride; artwork?: VisualOverride } };
export type SceneElement = ({ editorId?: string; rotation?: number; hidden?: boolean; textbox?: import('./textbox-style').ResolvedTextbox; typography?: TextTypography; accentColor?: string; derivedValue?: {valueSource:string;unitSource:string}; id?: string; italic?: boolean; underline?: boolean; fontFamily?: string; copyId?: string; copySource?: string; inkBounds?: { x:number; y:number; w:number; h:number }; groupId?: string; layoutDecoration?: boolean; minSize?: number; absoluteOverride?: { x?: number; y?: number } } & (
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: string; radius?: number; fitText?: string; textPadding?: number }
  | ({ kind: "line"; x: number; y: number; x2: number; y2: number; color: string; width: number } & LineStyle)
  | { kind: "text"; x: number; y: number; w: number; h: number; text: string; size: number; weight: "regular" | "bold"; color: string; align?: "left" | "center" | "right"; lines: string[] }
  | { kind: "image"; embeddedText?:import('./semantic-component-image').ComponentTextMetrics; originalWidth?: number; originalHeight?: number; x: number; y: number; w: number; h: number; bytes: Buffer }));
export type VisualScene = { freeform?: boolean; width: number; height: number; background: string; elements: SceneElement[]; compositionVersion?: 1; responsiveLayout?: ResponsiveSceneLayout; additionalFontCss?: string; measured?: boolean; fonts?: BrandAsset[]; headingFontId?: string; bodyFontId?: string; fontReport?: string[] };

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
function lines(text: string, width: number, size: number) {
  const max = Math.max(7, Math.floor(width / (size * 0.53)));
  const result: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    let current = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      if (current && `${current} ${word}`.length > max) { result.push(current); current = word; }
      else current = current ? `${current} ${word}` : word;
    }
    if (current) result.push(current);
  }
  return result;
}

function sceneText(elements: SceneElement[], text: string, x: number, y: number, w: number, h: number, preferred: number, min: number, color: string, weight: "regular" | "bold" = "regular", align: "left" | "center" = "left") {
  let size = preferred; let wrapped = lines(text, w, size);
  while (size > min && wrapped.length * size * 1.19 > h) { size -= 2; wrapped = lines(text, w, size); }
  if (wrapped.length * size * 1.19 > h) throw new Error(`Text does not fit its layout: ${text.slice(0, 80)}`);
  elements.push({ kind: "text", x, y, w, h, text, size, weight, color, align, lines: wrapped });
}

function bodyParts(body: string) {
  return body.split(/\n+|(?<=\.)\s+(?=[A-Z])/).map((part) => part.trim().replace(/^[-•\d.)\s]+/, "")).filter(Boolean);
}

function pageSize(format: "post" | "story" | "poster" | "carousel" | "presentation") {
  return format === "story" ? { width: 1080, height: 1920 } : format === "presentation" ? { width: 1280, height: 720 } : { width: 1080, height: 1350 };
}

async function imageBytes(asset?: { diskPath: string }) {
  if (!asset) return undefined;
  try { return await sharp(await fs.readFile(asset.diskPath)).resize({ width: 1000, height: 1000, fit: "inside" }).png().toBuffer(); }
  catch { return undefined; }
}

/** The same scene feeds PNG export, the editor preview and editable PPTX export. */
export async function buildVisualScene(format: "post" | "story" | "poster" | "carousel" | "presentation", page: VisualPage, brand: ContentBrand, index = 0, total = 1, component?: Buffer): Promise<VisualScene> {
  for(const id of [page.assetId,...(page.supportingAssetIds??[])]){
    const asset=brand.assets.find(a=>a.id===id);
    if(asset?.attribution&&!page.credit?.includes(asset.attribution))throw Error('Selected artwork requires its recorded attribution on this page.');
  }
  const base = await buildBaseVisualScene(format, page, brand, index, total, component);
  identifySceneObjects(base);
  if (page.editorAppearance?.freeform) return freeformScene(await applyEditorAppearance(base, page, brand), page, brand);
  return applyEditorAppearance(base, page, brand);
}

async function buildBaseVisualScene(format: "post" | "story" | "poster" | "carousel" | "presentation", page: VisualPage, brand: ContentBrand, index = 0, total = 1, component?: Buffer): Promise<VisualScene> {
  if (page.composition) {
    return buildCompositionScene(format, page, brand, index, total);
  }
  if (format === "poster") return buildPosterScene(page, brand, component);
  if ((format === "story" || format === "carousel") && brand.designSystem) return buildSocialScene(format,page,brand,index,total,component);
  const { width: W, height: H } = pageSize(format);
  const p = brand.palette;
  const elements: SceneElement[] = [];
  const defaultLayout: VisualLayout = format === "presentation" || format === "carousel"
    ? (["hero", "steps", "split", "diagram", "closing"][Math.min(index, 4)] as VisualLayout)
    : format === "story" ? "statement" : "split";
  const requestedLayout = page.layout ?? defaultLayout;
  const asset = brand.assets.find((item) => item.id === page.assetId);
  const visual = component ?? await imageBytes(asset);
  const logo = await imageBytes(brand.logo);
  if (format === "story" && page.storyTreatment) {
    const treatment = page.storyTreatment;
    const dark = treatment === "conversation-prompt";
    const background = page.visualOverrides?.background ?? (dark ? p.dark : p.background);
    const ink = dark ? "#FFFFFF" : p.ink;
    const muted = dark ? "#E6E1EF" : p.ink;
    const kicker = page.eyebrow?.toUpperCase() || brand.name.toUpperCase();
    elements.push({ kind: "rect", x: 76, y: 310, w: 54, h: 8, fill: p.accent, radius: 4 });
    sceneText(elements, kicker, 150, 284, 610, 68, 27, 20, ink, "bold");
    if (logo) {
      if (dark) elements.push({ kind: "rect", x: 813, y: 282, w: 204, h: 110, fill: "#FFFFFF", radius: 16 });
      elements.push({ kind: "image", x: 828, y: 292, w: 174, h: 90, bytes: logo });
    }
    if (treatment === "image-showcase" && visual) {
      elements.push({ kind: "rect", x: 76, y: 425, w: 928, h: 520, fill: p.alternate, radius: 32 });
      elements.push({ kind: "image", x: 110, y: 448, w: 860, h: 475, bytes: visual });
      sceneText(elements, page.title, 76, 995, 928, 252, 79, 40, ink, "bold");
      sceneText(elements, page.body, 76, 1245, 928, 135, 35, 23, muted);
    } else if (treatment === "quick-tip") {
      elements.push({ kind: "rect", x: 76, y: 1020, w: 928, h: 320, fill: p.alternate, radius: 28 });
      elements.push({ kind: "rect", x: 105, y: 1072, w: 9, h: 215, fill: p.accent, radius: 4 });
      sceneText(elements, page.title, 76, 520, 928, 455, 88, 42, ink, "bold");
      sceneText(elements, page.body, 150, 1060, 800, 240, 43, 25, p.ink);
    } else if (treatment === "announcement") {
      elements.push({ kind: "rect", x: 76, y: 965, w: 928, h: 365, fill: p.alternate, radius: 30 });
      sceneText(elements, page.title, 76, 520, 928, 400, 87, 42, ink, "bold");
      sceneText(elements, page.body, 132, 1025, 816, 260, 44, 25, p.ink);
    } else {
      elements.push({ kind: "rect", x: 76, y: 1050, w: 928, h: 280, fill: dark ? p.accent : p.alternate, radius: 30 });
      sceneText(elements, page.title, 76, 525, 928, 470, 87, 42, ink, "bold");
      sceneText(elements, page.body, 130, 1100, 820, 185, 42, 25, dark ? "#FFFFFF" : p.ink);
    }
    if (page.cta?.trim()) {
      const cta = page.cta.trim();
      elements.push({ kind: "rect", x: 76, y: 1410, w: 928, h: 104, fill: p.accent, radius: 22 });
      sceneText(elements, cta, 115, 1430, 850, 66, 36, 26, "#FFFFFF", "bold", "center");
    }
    const overrides = page.visualOverrides;
    if (overrides) {
      const change = (target: SceneElement | undefined, override: VisualOverride | undefined) => {
        if (!target || !override) return;
        if (override.x !== undefined) target.x = override.x * W;
        if (override.y !== undefined) target.y = override.y * H;
        if ("w" in target) {
          if (override.width !== undefined) target.w = override.width * W;
          if (override.height !== undefined) target.h = override.height * H;
        }
        if (target.kind === "text") {
          if (override.fontSize !== undefined) target.size = override.fontSize;
          if (override.color !== undefined) target.color = override.color;
          target.lines = lines(target.text, target.w, target.size);
          if (target.lines.length * target.size * 1.19 > target.h) throw new Error(`Edited text does not fit its layout: ${target.text.slice(0, 80)}`);
        }
      };
      change(elements.find((element) => element.kind === "text" && element.text === page.title), overrides.title);
      change(elements.find((element) => element.kind === "text" && element.text === page.body), overrides.body);
      change(elements.find((element) => element.kind === "text" && element.text === kicker), overrides.eyebrow);
      change(elements.find((element) => element.kind === "image" && element.bytes === visual), overrides.artwork);
      const cta = elements.find((element) => element.kind === "text" && element.text === page.cta?.trim());
      change(cta, overrides.cta);
      if (cta?.kind === "text" && overrides.cta) {
        const frame = elements.find((element) => element.kind === "rect" && element.y === 1410 && element.fill === p.accent && element.h === 104);
        if (frame?.kind === "rect") { frame.x = cta.x - 39; frame.y = cta.y - 20; frame.w = cta.w + 78; frame.h = cta.h + 38; }
      }
    }
    for (const element of elements) if (element.kind === "text" && !storyTextIsSafe(element)) throw new Error(`Story text is outside the Instagram safe area: ${element.text.slice(0, 80)}`);
    return { width: W, height: H, background, elements };
  }
  const layout = !visual && requestedLayout === "split" && total === 1 ? "statement" : requestedLayout;
  const pad = format === "presentation" ? 70 : 76;
  const kicker = page.eyebrow?.toUpperCase() || (!logo ? brand.name : "");
  let background = p.background;
  if (layout === "statement" || layout === "closing") background = p.dark;
  if (layout === "split") {
    elements.push({ kind: "rect", x: W * 0.56, y: 0, w: W * 0.44, h: H, fill: p.alternate });
    elements.push({ kind: "rect", x: W * 0.56, y: 0, w: 12, h: H, fill: p.accent });
  } else if (layout === "steps" || layout === "diagram") {
    elements.push({ kind: "rect", x: pad, y: H * (format === "story" ? 0.48 : 0.50), w: W - pad * 2, h: H * (format === "story" ? 0.22 : 0.39), fill: p.alternate, radius: 30 });
  } else if (layout === "hero") {
    elements.push({ kind: "rect", x: W * 0.70, y: 0, w: W * 0.30, h: H * 0.66, fill: p.alternate });
  } else if (!(format === "story" && page.cta)) {
    elements.push({ kind: "rect", x: pad, y: H * 0.80, w: W - pad * 2, h: 8, fill: p.accent, radius: 4 });
  }
  const foreground = background === p.dark ? "#FFFFFF" : p.ink;
  const muted = background === p.dark ? "#E6E1EF" : p.ink;
  if (kicker) {
    elements.push({ kind: "rect", x: pad, y: format === "story" ? 255 : 64, w: 54, h: 8, fill: p.accent, radius: 4 });
    sceneText(elements, kicker, pad + 72, format === "story" ? 234 : 43, W * 0.47, 60, format === "presentation" ? 21 : 26, 18, foreground, "bold");
  }
  if (logo) {
    const logoW = format === "presentation" ? 150 : 170;
    const logoX = W - pad - logoW;
    const logoY = format === "story" ? 286 : 42;
    if (background === p.dark) elements.push({ kind: "rect", x: logoX - 13, y: logoY - 7, w: logoW + 26, h: 105, fill: "#FFFFFF", radius: 13 });
    elements.push({ kind: "image", x: logoX, y: logoY, w: logoW, h: 92, bytes: logo });
  }
  const footerY = H - (format === "story" ? 260 : format === "presentation" ? 55 : 78);
  if (total > 1) sceneText(elements, brand.name, pad, footerY, W * 0.52, 45, format === "presentation" ? 17 : 23, 16, foreground, "bold");
  if (total > 1) sceneText(elements, `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, W - pad - 115, footerY, 115, 42, 18, 16, foreground, "bold");

  if (layout === "hero") {
    sceneText(elements, page.title, pad, H * (format === "story" ? 0.30 : 0.25), W * 0.66, H * 0.32, format === "presentation" ? 57 : 82, format === "presentation" ? 36 : 48, foreground, "bold");
    sceneText(elements, page.body, pad, H * 0.64, W * (visual ? 0.46 : 0.77), H * 0.16, format === "presentation" ? 25 : 36, 22, muted);
    if (visual) elements.push({ kind: "image", x: W * 0.60, y: H * 0.50, w: W * 0.34, h: H * 0.34, bytes: visual });
    else elements.push({ kind: "rect", x: W * 0.72, y: H * 0.54, w: W * 0.18, h: W * 0.18, fill: p.accent, radius: 28 });
  } else if (layout === "split") {
    sceneText(elements, page.title, pad, H * (format === "story" ? 0.33 : 0.23), W * 0.45, H * 0.29, format === "presentation" ? 48 : 72, 34, foreground, "bold");
    sceneText(elements, page.body, pad, H * 0.62, W * 0.44, H * 0.20, format === "presentation" ? 24 : 34, 20, muted);
    if (visual) elements.push({ kind: "image", x: W * 0.61, y: H * 0.26, w: W * 0.32, h: H * 0.53, bytes: visual });
    else {
      elements.push({ kind: "rect", x: W * 0.62, y: H * 0.37, w: W * 0.30, h: H * 0.32, fill: p.accent, radius: 36 });
      sceneText(elements, String(index + 1).padStart(2, "0"), W * 0.66, H * 0.42, W * 0.22, H * 0.19, format === "presentation" ? 115 : 166, 70, "#FFFFFF", "bold", "center");
    }
  } else if (layout === "steps" || layout === "diagram") {
    sceneText(elements, page.title, pad, H * 0.18, W - pad * 2, H * 0.25, format === "presentation" ? 54 : 72, 34, foreground, "bold");
    const parts = bodyParts(page.body);
    if (parts.length > 8) throw new Error("Too many points for this visual layout; shorten or divide the slide.");
    if (parts.length === 1) {
      elements.push({ kind: "rect", x: pad + 28, y: H * 0.58, w: 10, h: H * 0.18, fill: p.accent, radius: 5 });
      sceneText(elements, parts[0], pad + 70, H * 0.57, W - pad * 2 - 110, H * 0.22, format === "presentation" ? 36 : 45, 25, p.ink);
    } else if (parts.length > 3 || layout === "diagram") {
      const columns = format === "presentation" || parts.length > 3 ? 2 : 1;
      const rows = Math.ceil(parts.length / columns);
      const boxY = H * (format === "story" ? 0.495 : 0.515);
      const boxH = H * (format === "story" ? 0.20 : 0.355);
      const gap = format === "presentation" ? 12 : 18;
      const cellW = (W - pad * 2 - 54 - gap * (columns - 1)) / columns;
      const cellH = (boxH - gap * (rows - 1)) / rows;
      parts.forEach((part, item) => {
        const col = item % columns; const row = Math.floor(item / columns);
        const x = pad + 27 + col * (cellW + gap); const y = boxY + row * (cellH + gap);
        elements.push({ kind: "rect", x, y, w: cellW, h: cellH, fill: "#FFFFFF", radius: 14 });
        elements.push({ kind: "rect", x: x + 14, y: y + 15, w: 6, h: cellH - 30, fill: p.accent, radius: 3 });
        const preferred = format === "presentation" ? 23 : columns === 2 ? 27 : 32;
        const textHeight = lines(part, cellW - 48, preferred).length * preferred * 1.19;
        const textY = y + Math.max(8, (cellH - textHeight) / 2);
        sceneText(elements, part, x + 34, textY, cellW - 48, cellH - (textY - y) - 8, preferred, 16, p.ink);
      });
    } else {
      const rowY = H * (format === "story" ? 0.51 : 0.54); const rowH = H * (format === "story" ? 0.09 : 0.11);
      parts.forEach((part, item) => {
        const y = rowY + item * rowH;
        elements.push({ kind: "rect", x: pad + 28, y: y + 5, w: 44, h: 44, fill: p.accent, radius: 13 });
        sceneText(elements, String(item + 1), pad + 35, y + 4, 30, 38, 27, 22, "#FFFFFF", "bold", "center");
        sceneText(elements, part, pad + 105, y, W - pad * 2 - 155, rowH - 5, format === "presentation" ? 25 : 34, 20, p.ink);
      });
    }
    if (visual) elements.push({ kind: "image", x: W * 0.73, y: H * 0.25, w: W * 0.17, h: H * 0.19, bytes: visual });
  } else {
    sceneText(elements, page.title, pad, H * (format === "story" ? (visual ? 0.42 : 0.34) : 0.22), W - pad * 2, H * 0.36, format === "presentation" ? 65 : 84, 38, foreground, "bold");
    sceneText(elements, page.body, pad, H * (format === "story" ? 0.69 : 0.66), W * 0.78, H * 0.13, format === "presentation" ? 25 : 34, 20, muted);
    if (visual) elements.push(format === "story"
      ? { kind: "image", x: W * 0.08, y: H * 0.22, w: W * 0.34, h: H * 0.20, bytes: visual }
      : { kind: "image", x: W * 0.75, y: H * 0.67, w: W * 0.17, h: H * 0.16, bytes: visual });
  }
  if (format === "story" && page.cta?.trim()) {
    const cta = page.cta.trim();
    const buttonW = Math.min(W - pad * 2, Math.max(380, cta.length * 22 + 92));
    elements.push({ kind: "rect", x: pad, y: 1410, w: buttonW, h: 86, fill: p.accent, radius: 20 });
    sceneText(elements, cta, pad + 24, 1420, buttonW - 48, 62, 34, 26, "#FFFFFF", "bold", "center");
  }
  const overrides = page.visualOverrides;
  if (overrides) {
    background = overrides.background ?? background;
    const apply = (element: SceneElement, override: VisualOverride) => {
      if (override.x !== undefined) element.x = override.x * W;
      if (override.y !== undefined) element.y = override.y * H;
      if ("w" in element) {
        if (override.width !== undefined) element.w = override.width * W;
        if (override.height !== undefined) element.h = override.height * H;
      }
      if (element.kind === "text") {
        if (override.fontSize !== undefined) element.size = override.fontSize;
        if (override.color !== undefined) element.color = override.color;
        element.lines = lines(element.text, element.w, element.size);
        if (element.lines.length * element.size * 1.19 > element.h) throw new Error(`Edited text does not fit its layout: ${element.text.slice(0, 80)}`);
      } else if (element.kind === "rect" && override.color !== undefined) element.fill = override.color;
    };
    const title = elements.find((element) => element.kind === "text" && element.text === page.title);
    const body = elements.find((element) => element.kind === "text" && element.text === page.body);
    const eyebrow = page.eyebrow ? elements.find((element) => element.kind === "text" && element.text === kicker) : undefined;
    const cta = page.cta?.trim() ? elements.find((element) => element.kind === "text" && element.text === page.cta?.trim()) : undefined;
    const stepParts = layout === "steps" || layout === "diagram" ? bodyParts(page.body) : [];
    const stepBodies = !body ? elements.filter((element) => element.kind === "text" && stepParts.includes(element.text)) : [];
    const artwork = visual ? elements.find((element) => element.kind === "image" && element.bytes === visual) : undefined;
    if (title && overrides.title) apply(title, overrides.title);
    if (body && overrides.body) apply(body, overrides.body);
    if (eyebrow && overrides.eyebrow) apply(eyebrow, overrides.eyebrow);
    if (cta && overrides.cta) {
      apply(cta, overrides.cta);
      const frame = elements.find((element) => element.kind === "rect" && element.y === 1410 && element.fill === p.accent && element.radius === 20);
      if (frame?.kind === "rect" && cta.kind === "text") {
        if (overrides.cta.x !== undefined) frame.x = cta.x - 24;
        if (overrides.cta.y !== undefined) frame.y = cta.y - H * 0.005;
        if (overrides.cta.width !== undefined) frame.w = cta.w + 48;
        if (overrides.cta.height !== undefined) frame.h = cta.h + 14;
      }
    }
    if (stepBodies.length && overrides.body) {
      const first = stepBodies[0];
      const firstX = first.x; const firstY = first.y;
      for (const element of stepBodies) {
        const offsetX = element.x - firstX; const offsetY = element.y - firstY;
        apply(element, overrides.body);
        if (overrides.body.x !== undefined) element.x += offsetX;
        if (overrides.body.y !== undefined) element.y += offsetY;
      }
    }
    if (artwork && overrides.artwork) apply(artwork, overrides.artwork);
  }
  return { width: W, height: H, background, elements };
}

export function sceneSvg(scene: VisualScene) {
  const elements = scene.elements.filter(e => !e.hidden).map((element) => {
    const render = () => {
    if (element.kind === "rect") return `<rect x="${element.x}" y="${element.y}" width="${element.w}" height="${element.h}" rx="${element.radius ?? 0}" fill="${element.fill}"/>`;
    if (element.kind === "line") return lineSegments(element).map(s=>`<line x1="${s.x}" y1="${s.y}" x2="${s.x2}" y2="${s.y2}" stroke="${element.color}" stroke-width="${element.width}" stroke-linecap="round"/>`).join('');
    if (element.kind === "image") return `<image href="data:image/png;base64,${element.bytes.toString("base64")}" x="${element.x}" y="${element.y}" width="${element.w}" height="${element.h}" preserveAspectRatio="xMidYMid meet"/>`;
    if (scene.measured) {
      const css = `${CANVAS_TYPOGRAPHY_CSS}${textboxCssText(element.textbox)}width:${element.w}px;${scene.freeform?`min-height:${element.h}px;`:""}font-family:${element.fontFamily ?? 'Arial,sans-serif'};font-size:${element.size}px;font-weight:${element.weight === 'bold' ? 700 : 400};font-style:${element.italic ? 'italic' : 'normal'};text-decoration:${element.underline ? 'underline' : 'none'};color:${element.color};text-align:${element.align ?? 'left'};line-height:${element.typography?.leading ?? 1.15};letter-spacing:${element.typography?.tracking ?? 0}em;text-wrap:${element.typography?.wrap ?? (scene.compositionVersion === 1 ? 'balance' : 'wrap')};`;
      return `<foreignObject x="${element.x}" y="${element.y}" width="${element.w}" height="${Math.max(element.h, element.size * 1.4)}" overflow="visible"><div xmlns="http://www.w3.org/1999/xhtml" style="${escape(css)}">${typographyHtml(element.text,element.typography,element.accentColor)}</div></foreignObject>`;
    }
    const anchor = element.align === "center" ? "middle" : element.align === "right" ? "end" : "start";
    const x = element.align === "center" ? element.x + element.w / 2 : element.align === "right" ? element.x + element.w : element.x;
    const tspans = element.lines.map((line, index) => `<tspan x="${x}" y="${element.y + (index + 1) * element.size * 1.15}">${escape(line)}</tspan>`).join("");
    return `<text font-family="${element.fontFamily ?? "Arial,sans-serif"}" font-size="${element.size}" font-weight="${element.weight === "bold" ? 700 : 400}" font-style="${element.italic ? "italic" : "normal"}" text-decoration="${element.underline ? "underline" : "none"}" fill="${element.color}" text-anchor="${anchor}">${tspans}</text>`;
    };
    const markup=render();
    const cx=element.kind==='line'?(element.x+element.x2)/2:element.x+element.w/2;
    const cy=element.kind==='line'?(element.y+element.y2)/2:element.y+element.h/2;
    return element.rotation ? `<g transform="rotate(${element.rotation} ${cx} ${cy})">${markup}</g>` : markup;
  }).join("");
  const credit=scene.responsiveLayout?.recipe?`<metadata>${escape(JSON.stringify(recipeCredit(scene.responsiveLayout.recipe.id)))}</metadata>`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}">${credit}<rect width="100%" height="100%" fill="${scene.background}"/>${elements}</svg>`;
}

export async function scenePng(scene: VisualScene) { return scene.measured ? renderMeasuredScene(scene) : sharp(Buffer.from(sceneSvg(scene))).png().toBuffer(); }
