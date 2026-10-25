import type { VisualPage, VisualScene } from "./content-layout";
import { setCopyText, type CopyPage } from "./composition";

export type CanvasText = {
  textbox?: import('./textbox-style').ResolvedTextbox;
  typography?: import('./design-typography').TextTypography;
  accentColor?: string;
  id: string;
  elementIndex: number;
  source: string;
  copyId?: string;
  range?: { start: number; end: number };
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  italic?: boolean;
  underline?: boolean;
  color: string;
  align: "left" | "center" | "right";
};
export type CanvasPreview = {
  brandName?: string;
  palette?: import("./textbox-style").TextboxPalette;
  objects?: import("./freeform-canvas").PreviewObject[];
  width: number;
  height: number;
  background: string;
  color: string;
  appearance?: import("./editor-appearance").EditorAppearance;
  divider?: { x: number; y: number; width: number; height: number };
  fontCss: string;
  balanced: boolean;
  texts: CanvasText[];
  visualGroup?: { x: number; y: number; width: number; height: number };
  artwork?: { x: number; y: number; width: number; height: number; url:string; sourceAspect:number; assetId?: string };
};

/** Bind visible text to canonical copy, never exposing internal @copy references. */
export function canvasTexts(scene: VisualScene, page: VisualPage): CanvasText[] {
  const used = new Map<string, number>();
  let bodyPart = 0;
  return scene.elements.flatMap((element, index) => {
    if (element.kind !== "text" || element.derivedValue) return [];
    let source = element.copySource;
    let range: CanvasText["range"];
    if (!source && !page.composition) {
      const item = element.id?.match(/^item-(\d+)-(label|detail)$/);
      if (item) source = `visualContent.items.${item[1]}.${item[2]}`;
      else if (element.id && /^(title|body|cta|credit|eyebrow)$/.test(element.id)) source = element.id;
      else if (element.id?.startsWith("body-")) source = "body";
      else if (!element.id) source = (["title", "body", "cta", "credit", "eyebrow"] as const).find(key => page[key] && (page[key] === element.text || (key === "eyebrow" && page[key]?.toUpperCase() === element.text)));
      // Older checklist scenes split a body field into independently rendered lines.
      if (!source && !element.id && element.text.length > 2 && page.body.includes(element.text)) source = "body";
      if (source === "body" && element.text !== page.body) {
        const start = page.body.indexOf(element.text, used.get(source) ?? 0);
        if (start < 0) return [];
        range = { start, end: start + element.text.length };
        used.set(source, range.end);
      }
    }
    if (!source) return [];
    return [{ textbox:element.textbox,typography:element.typography,accentColor:element.accentColor,id: element.copyId ?? element.id ?? (range ? `body-part-${bodyPart++}` : source), elementIndex: index, source, copyId: element.copyId, range, text: element.text,
      x: element.x, y: element.y, width: element.w, height: element.h,
      fontSize: element.size, fontFamily: element.fontFamily ?? "Arial, sans-serif",
      fontWeight: element.weight === "bold" ? 700 : 400, italic: element.italic, underline: element.underline, color: element.color, align: element.align ?? "left" }];
  });
}

export function updateCanvasText<T extends CopyPage>(page: T, target: CanvasText, text: string): T {
  if (target.copyId) return setCopyText(page, target.copyId, text) as T;
  // Only text paths emitted by canvasTexts may be edited.
  if (!/^(title|body|cta|credit|eyebrow|visualContent\.items\.\d+\.(label|detail))$/.test(target.source)) throw new Error("This text cannot be edited inline.");
  const result = structuredClone(page);
  const keys = target.source.split(".");
  let node = result as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
  const key = keys.at(-1)!;
  const previous = String(node[key] ?? "");
  if (target.range) {
    if (previous.slice(target.range.start, target.range.end) !== target.text) throw new Error("This text has changed. Wait for the preview to refresh and try again.");
    node[key] = previous.slice(0, target.range.start) + text + previous.slice(target.range.end);
  } else node[key] = text;
  return result;
}
