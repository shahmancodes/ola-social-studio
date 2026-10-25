import { readableInk } from './brand-design';
import { resolveTextbox, textboxColor, compositeColor, mergeTextboxStyle } from './textbox-style';
import sharp from "sharp";
import type { ContentBrand } from "./content-brand";
import type { VisualPage, VisualScene } from "./content-layout";
import { canvasTexts } from "./canvas-text";
import { editorFontFamily } from "./editor-appearance";
import { selectedFontCss } from "./editor-font-files";

/** Applied once by the shared builder, so preview and every export retain edits. */
export async function applyEditorAppearance(scene: VisualScene, page: VisualPage, brand: ContentBrand) {
  scene.fonts ??= brand.fonts;
  const appearance = page.editorAppearance;
  for(const element of scene.elements)if(element.kind==='text'&&!element.typography){
    const slot=element.id??element.copySource??'';
    const role=/\.detail$/.test(slot)?'detail':/\.label$/.test(slot)?'label':slot;
    if(['title','body','cta','eyebrow','credit','label','detail'].includes(role))element.typography=page.composition?.typography?.[role as keyof NonNullable<NonNullable<typeof page.composition>['typography']>];
  }
  for(const element of scene.elements)if(element.kind==='text'){
    if(element.typography?.bold!==undefined)element.weight=element.typography.bold?'bold':'regular';
    if(element.typography?.italic!==undefined)element.italic=element.typography.italic;
    if(element.typography?.underline!==undefined)element.underline=element.typography.underline;
  }
  for (const target of canvasTexts(scene, page)) {
    const style = appearance?.text?.[target.id];
    if (!style) continue;
    const element = scene.elements[target.elementIndex];
    if (element.kind !== "text") continue;
    const family = editorFontFamily(style);
    if (family) element.fontFamily = family;
    if (style.fontSize !== undefined) { element.size = style.fontSize; element.minSize = Math.min(element.minSize ?? 24, style.fontSize); }
    if (style.bold !== undefined) element.weight = style.bold ? 'bold' : 'regular';
    if (style.italic !== undefined) element.italic = style.italic;
    if (style.underline !== undefined) element.underline = style.underline;
    if (style.color) element.color = style.color;
    if (style.align) element.align = style.align;
    for(const key of ['leading','tracking','breakAfter','emphasis'] as const)if(style[key]!==undefined)element.typography={...element.typography,[key]:style[key]};
    if(style.box!==undefined)element.typography={...element.typography,box:mergeTextboxStyle(element.typography?.box,style.box)};
  }
  for(const element of scene.elements)if(element.kind==='text'){
    element.textbox=resolveTextbox(element.typography?.box,brand.palette,Math.min(scene.width,scene.height)/1080);
    const editorColor=canvasTexts(scene,page).find(t=>t.elementIndex===scene.elements.indexOf(element));
    if(!editorColor||!appearance?.text?.[editorColor.id]?.color){
      if(element.typography?.color)element.color=textboxColor(element.typography.color,brand.palette);
      else if(element.textbox?.fill){
        const background=scene.elements.filter(e=>e.kind==='rect'&&e.x<=element.x&&e.y<=element.y&&e.x+e.w>=element.x+element.w&&e.y+e.h>=element.y+element.h).at(-1);
        const fill=compositeColor(element.textbox.fill,element.textbox.fillOpacity,background?.kind==='rect'?background.fill:scene.background);
        element.color=readableInk(fill,element.color);
      }
    }
    if(element.textbox?.fill)element.accentColor=readableInk(compositeColor(element.textbox.fill,element.textbox.fillOpacity,scene.background),element.accentColor??brand.palette.accent);
  }
  scene.additionalFontCss = (scene.additionalFontCss ?? "") + await selectedFontCss(Object.values(appearance?.text ?? {}), brand.fonts);
  const image = scene.elements.find(e => e.kind === "image" && e.id === "artwork");
  if (image?.kind === "image" && page.assetId && (!page.semanticComponent || scene.responsiveLayout) && appearance?.image) {
    const { crop, x, y } = appearance.image;
    if (crop) {
      const meta = await sharp(image.bytes).metadata();
      const width = meta.width!, height = meta.height!;
      image.originalWidth = width; image.originalHeight = height;
      const visual=scene.responsiveLayout?.groups.find(g=>g.id==='artwork')?.visual;
      if(visual?.mode==='annotated')visual.annotations=visual.annotations.map(a=>{
        const x=(a.x-crop.x)/crop.width,y=(a.y-crop.y)/crop.height;
        if(x<0||x>1||y<0||y>1)throw new Error('This crop excludes an annotated point. Adjust the crop or remove that annotation.');
        return {...a,x,y};
      });
      const left = Math.min(width - 1, Math.round(crop.x * width)), top = Math.min(height - 1, Math.round(crop.y * height));
      image.bytes = await sharp(image.bytes).extract({ left, top, width: Math.max(1, Math.min(width - left, Math.round(crop.width * width))), height: Math.max(1, Math.min(height - top, Math.round(crop.height * height))) }).png().toBuffer();
    }
    if (x !== undefined || y !== undefined) image.absoluteOverride = { x: x === undefined ? undefined : x * scene.width, y: y === undefined ? undefined : y * scene.height };
  }
  // Chromium and the canvas use the same DOM typography for all current visual formats.
  scene.measured = true;
  return scene;
}
