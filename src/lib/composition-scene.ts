import fs from "node:fs/promises";
import sharp from "sharp";
import type { VisualPage, VisualScene, SceneElement } from "./content-layout";
import type { ContentBrand } from "./content-brand";
import { readableInk } from "./brand-design";
import { compositionIssues, copyText, resolvedComponent, type CopyPage } from "./composition";
import { renderSemanticComponentPng, semanticFontFaces } from "./semantic-component-image";
import { sceneFontCss } from "./scene-renderer";
import { buildResponsiveScene } from "./responsive-scene";
import type { VisualFormat } from "./responsive-layout";

type Region = { x: number; y: number; w: number; h: number };
export async function buildCompositionScene(format: VisualFormat, page: VisualPage & CopyPage, brand: ContentBrand, index: number, total: number): Promise<VisualScene> {
  const issues = compositionIssues(page); if (issues.length) throw new Error(issues.join(" "));
  const c = page.composition!;
  if (c.responsive) return buildResponsiveScene(format, page, brand, index, total);
  if (format === "post" || format === "presentation") throw new Error("This format requires a responsive composition plan.");
  const width = format === "poster" ? 1240 : 1080, height = format === "poster" ? 1754 : format === "story" ? 1920 : 1350;
  const story = format === "story", poster = format === "poster", pad = poster ? 96 : 76, w = width - 2 * pad;
  const top = story ? 420 : poster ? 300 : 222, bottom = story ? 1350 : poster ? 1430 : 1118, h = bottom - top;
  const footer = c.family === 'diagram-led' && c.bodyMode === 'sequence' ? top + h * (c.tuning.density === 'airy' ? .88 : c.tuning.density === 'compact' ? .73 : .79) : story ? 1404 : poster ? 1554 : 1190;
  const background = page.visualOverrides?.background ?? brand.palette.background;
  const ink = readableInk(background, brand.palette.ink), accent = readableInk(background, brand.palette.accent);
  const elements: SceneElement[] = [];
  const rules = brand.designSystem;
  for (const name of [rules?.headingFontName, rules?.bodyFontName]) if (name && !brand.fonts?.some(f => f.name === name)) throw new Error(`Requested font is unavailable in this company snapshot: ${name}`);
  const scene: VisualScene = { width, height, background, elements, compositionVersion: 1, measured: true, fonts: brand.fonts, headingFontId: rules?.headingFontId ?? brand.fonts?.find(f => f.name === rules?.headingFontName)?.id, bodyFontId: rules?.bodyFontId ?? brand.fonts?.find(f => f.name === rules?.bodyFontName)?.id };
  if(c.tuning.headingFontId)scene.headingFontId=brand.assetAliases?.[c.tuning.headingFontId]??c.tuning.headingFontId;
  if(c.tuning.bodyFontId)scene.bodyFontId=brand.assetAliases?.[c.tuning.bodyFontId]??c.tuning.bodyFontId;
  const region = (x: number, y: number, rw: number, rh: number): Region => ({ x: pad + x * w, y: top + y * h, w: rw * w, h: rh * h });
  const drawText = (slot: string, r: Region, size: number, heading = false, color = ink, align = c.tuning.align) => {
    const p = c.placements.find(p => p.slot === slot); if (!p) return;
    const block = c.blocks.find(b => b.id === p.copyId)!;
    elements.push({ kind: "text", id: slot, copyId: p.copyId, copySource: block.source, text: copyText(page, p.copyId), ...r, size: size * c.tuning.scale, weight: heading ? "bold" : "regular", color, align, lines: [], fontFamily: heading ? "OlaHeading" : "OlaBody" });
  };
  const logoAllowed = format !== "carousel" || rules?.logoPlacement !== "cover-only" || index === 0;
  if (logoAllowed) {
    const y = story ? 296 : pad;
    if (brand.logo) {
      const bytes = await sharp(await fs.readFile(brand.logo.diskPath)).png().toBuffer();
      if (rules?.logoTreatment !== "original" && background.toUpperCase() !== "#FFFFFF") elements.push({ kind: "rect", x: pad - 10, y: y - 10, w: 240, h: 100, fill: "#FFFFFF", radius: 4 });
      elements.push({ kind: "image", id: "logo", x: pad, y, w: 220, h: 80, bytes });
    } else elements.push({ kind: "text", id: "brand", text: brand.name, x: pad, y, w, h: 52, size: 28, weight: "bold", color: ink, lines: [], fontFamily: "OlaHeading" });
  }
  drawText("eyebrow", { x: pad, y: top - 44, w, h: 30 }, 24, true, accent);
  const hasVisual = Boolean(page.assetId || page.semanticComponent), split = c.tuning.split, gap = c.tuning.density === "airy" ? .09 : c.tuning.density === "compact" ? .04 : .065;
  let title: Region, body: Region, artwork: Region | undefined;
  switch (c.family) {
    case "oversized-typography":
      title = region(0, .015, hasVisual ? .6 : 1, .55); body = region(0, .64, 1, .32);
      if (hasVisual) artwork = region(.67, .08, .33, .48);
      break;
    case "asymmetric-editorial": {
      const tw = split - gap / 2, right = split + gap / 2;
      title = region(c.tuning.mirror ? right : 0, .01, c.tuning.mirror ? 1 - right : tw, .59);
      body = region(c.tuning.mirror ? right : 0, .7, c.tuning.mirror ? 1 - right : tw, .29);
      artwork = hasVisual ? region(c.tuning.mirror ? 0 : right, .05, c.tuning.mirror ? tw : 1 - right, .94) : undefined;
      if (!hasVisual) body = region(c.tuning.mirror ? 0 : right, .51, c.tuning.mirror ? tw : 1 - right, .47);
      break;
    }
    case "image-led":
      artwork = region(0, c.tuning.mirror ? .48 : 0, 1, .52);
      title = region(0, c.tuning.mirror ? .01 : .57, 1, .26);
      body = region(0, c.tuning.mirror ? .31 : .86, 1, .14);
      break;
    case "diagram-led":
      title = region(0, 0, 1, .29); body = region(0, .32, 1, .16);
      artwork = region(0, c.placements.some(p => p.slot === "body") ? .52 : c.tuning.density === 'compact' ? .29 : .36, 1, c.placements.some(p => p.slot === "body") ? .48 : .36);
      break;
    case "comparison":
      title = region(0, 0, 1, .28); body = region(0, .33, 1, .17); artwork = region(0, .51, 1, .48);
      break;
    case "modular-grid":
      title = region(c.tuning.mirror ? .56 : 0, .04, .44, .58);
      body = region(c.tuning.mirror ? 0 : .52, .48, .48, .49);
      if (hasVisual) { title = region(0, 0, 1, .27); body = region(0, .36, .37, .60); artwork = region(.44, .36, .56, .60); }
      break;
  }
  const panel = (r: Region) => elements.push({ kind: "rect", ...r, fill: brand.palette.alternate, radius: 6 });
  if (c.family === "modular-grid") {
    panel({ x: body.x - 16, y: body.y - 16, w: body.w + 32, h: body.h + 32 });
    Object.assign(elements.at(-1)!,{fitText:'body',textPadding:36});
    body = { x: body.x + 20, y: body.y + 20, w: body.w - 40, h: body.h - 40 };
  }
  if (c.family === "asymmetric-editorial" && !hasVisual) elements.push({ kind: "line", x: pad + w * split, y: top + h * .48, x2: pad + w * split, y2: bottom, width: 2, color: accent });
  const titleSize = c.family === "oversized-typography" ? (poster ? 156 : 122) : c.family === "asymmetric-editorial" || c.family === "modular-grid" ? 88 : poster ? 112 : 80;
  drawText("title", title, titleSize, true);
  drawText("body", body, poster ? 48 : story ? 36 : 44);
  drawText("cta", { x: pad, y: footer, w, h: poster ? 84 : 66 }, poster ? 38 : 32, true, accent);
  drawText("credit", { x: pad, y: story ? 1496 : poster ? 1488 : 1240, w: w * .8, h: 32 }, 24);

  if (artwork && page.semanticComponent) {
    const component = resolvedComponent(page)!;
    // Connected stages use the same timeline semantics, with region-sized native text/lines.
    // Every stage stays editable and measurable rather than being flattened inside a fixed screenshot.
    const bound = c.placements.filter(p => /^semanticComponent\.items\.\d+\.label$/.test(p.slot));
    if (c.bodyMode !== "text" && bound.length) {
      const horizontal = c.bodyMode === "sequence", columns = horizontal ? Math.min(bound.length, artwork.w > 700 ? 4 : 2) : 2;
      const rows = Math.ceil(bound.length / columns), cellW = artwork.w / columns, cellH = artwork.h / rows;
      if (horizontal) {
        for (let row = 0; row < rows; row++) {
          const count = Math.min(columns, bound.length - row * columns), y = artwork.y + row * cellH + cellH * .34;
          elements.push({ kind: "line", x: artwork.x + cellW * .5, y, x2: artwork.x + cellW * (count - .5), y2: y, width: 5, color: accent });
          for(let col=1;col<count;col++){
            const x=artwork.x+cellW*col;
            elements.push({kind:'line',id:`sequence-arrow-${row}-${col}-top`,x:x-13,y:y-12,x2:x+5,y2:y,width:5,color:accent});
            elements.push({kind:'line',id:`sequence-arrow-${row}-${col}-bottom`,x:x-13,y:y+12,x2:x+5,y2:y,width:5,color:accent});
          }
        }
      }
      const componentInk = component.style?.foreground ?? ink, componentAccent = component.style?.accent ?? accent;
      if(component.style)scene.additionalFontCss=await semanticFontFaces();
      bound.forEach((p, i) => {
        const x = artwork!.x + i % columns * cellW, y = artwork!.y + Math.floor(i / columns) * cellH;
        if (horizontal) {
          elements.push({ kind: "rect", x: x + cellW / 2 - 24, y: y + cellH * .34 - 24, w: 48, h: 48, fill: componentAccent, radius: 24 });
          drawText(p.slot, { x: x + 8, y: y + cellH * .34 + 66, w: cellW - 16, h: cellH * .4 }, poster ? 44 : 34, true, componentInk, "center");
        } else {
          const box = { x: x + 14, y: y + 14, w: cellW - 28, h: cellH - 28 }; panel(box);
          Object.assign(elements.at(-1)!,{fitText:p.slot,textPadding:32});
          drawText(p.slot, { x: box.x + 24, y: box.y + 32, w: box.w - 48, h: box.h - 64 }, poster ? 44 : 34, true,componentInk);
        }
        if(component.style){const e=elements.at(-1)!;if(e.kind==='text')e.fontFamily=({manrope:'Manrope',poppins:'Poppins',system:'Arial',serif:'Georgia'} as const)[component.style.headingFontFamily??component.style.fontFamily];}
      });
    } else {
      const fontCss = await sceneFontCss(scene);
      const bytes = await renderSemanticComponentPng(component, brand.palette.accent, brand.companyId, { width: Math.round(artwork.w), height: Math.round(artwork.h), fontCss,sourceCopyOnly:true });
      elements.push({ kind: "image", id: "artwork", ...artwork, bytes });
    }
  } else if (artwork && page.assetId) {
    const asset = brand.assets.find(a => a.id === page.assetId);
    if (!asset) throw new Error("Selected artwork is outside this company snapshot.");
    elements.push({ kind: "image", id: "artwork", ...artwork, bytes: await sharp(await fs.readFile(asset.diskPath)).png().toBuffer() });
  } else if (hasVisual) throw new Error("The composition has no region for its selected visual.");
  if (format === "carousel") {
    const y = 1280, segment = w / total;
    elements.push({ kind: "rect", id: "progress", x: pad, y, w, h: 4, fill: brand.palette.alternate });
    elements.push({ kind: "rect", x: pad + index * segment, y, w: segment, h: 4, fill: accent });
  }
  for (const e of elements) {
    const o = page.visualOverrides?.[e.id as "title" | "body" | "cta" | "artwork" | "eyebrow"]; if (!o) continue;
    if (o.x !== undefined) e.x = o.x * width; if (o.y !== undefined) e.y = o.y * height;
    if ("w" in e) { if (o.width !== undefined) e.w = o.width * width; if (o.height !== undefined) e.h = o.height * height; }
    if (e.kind === "text") { if (o.fontSize !== undefined) e.size = o.fontSize; if (o.color) e.color = o.color; }
  }
  return scene;
}

export function sceneTargets(scene: VisualScene) {
  return { width: scene.width, height: scene.height, groups: scene.responsiveLayout?.evidence?.groups, semanticFit:scene.responsiveLayout?.groups.flatMap(g=>(g.semanticDesign?.fit??[]).map(f=>({groupId:g.id,profile:g.semanticDesign!.profile,...f}))), semanticFlow:scene.responsiveLayout?.groups.flatMap(g=>(g.semanticDesign?.flow??[]).map(f=>({groupId:g.id,profile:g.semanticDesign!.profile,...f}))), targets: scene.elements.filter(e => e.kind === "text" && e.copySource || e.id === "artwork").map(e => ({ id: e.id!, x: e.x / scene.width, y: e.y / scene.height, width: ("w" in e ? e.w : 0) / scene.width, height: ("h" in e ? e.h : 0) / scene.height, source: "copySource" in e ? e.copySource : undefined, copyId: "copyId" in e ? e.copyId : undefined })) };
}
