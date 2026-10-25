import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { ROOT_DIR } from "./paths";
import { getAssetCatalog, resolveAsset } from "./assets";
import { getCompanyAsset } from "./platform";
import type { SlideSpec } from "./schemas";
import { semanticComponentHtml, SEMANTIC_COMPONENT_CSS } from "./semantic-components";
import {componentSources,componentText} from './semantic-design';
import {missingRenderedCopy} from './rendered-copy';

type Component = NonNullable<SlideSpec["semanticComponent"]>;
export type ComponentTextMetrics = {width:number;text:Array<{content:string;size:number}>};

export async function semanticFontFaces() {
  const files = [
    ["Manrope", "@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2", "200 800"],
    ["Poppins", "@fontsource/poppins/files/poppins-latin-400-normal.woff2", "400"],
    ["Poppins", "@fontsource/poppins/files/poppins-latin-700-normal.woff2", "700"],
  ] as const;
  const rules = await Promise.all(files.map(async ([family, file, weight]) => {
    const bytes = await fs.readFile(path.join(ROOT_DIR, "node_modules", file));
    return `@font-face{font-family:${family};src:url(data:font/woff2;base64,${bytes.toString("base64")}) format("woff2");font-weight:${weight};font-style:normal}`;
  }));
  return rules.join("");
}

export async function componentIllustrationData(assetPath: string, companyId?: string) {
  if (!assetPath) return "";
  if (assetPath.startsWith("company:")) {
    if (!companyId) throw new Error("A company is required for this illustration.");
    const asset = getCompanyAsset(companyId, assetPath.slice("company:".length));
    if (!asset || !asset.media_type.startsWith("image/")) throw new Error("Component illustration is unavailable to this company.");
    if (asset.source_url && (!asset.rights_note || /unverified|permission.required|unknown|not verified/i.test(asset.rights_note))) throw new Error("Component illustration has unresolved reuse rights.");
    return `data:${asset.media_type};base64,${(await fs.readFile(asset.disk_path)).toString("base64")}`;
  }
  if (!(await getAssetCatalog()).some((asset) => asset.path === assetPath)) throw new Error("Component illustration is not in the shared asset library.");
  const file = resolveAsset(assetPath);
  const extension = path.extname(file).toLowerCase();
  const mime = extension === ".svg" ? "image/svg+xml" : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`;
}

export async function renderSemanticComponentPng(component: Component, accent = "#6848C9", companyId?: string, options?: { width: number; height: number; fontCss: string; sourceCopyOnly?: boolean; onTextMetrics?:(metrics:ComponentTextMetrics)=>void }) {
  const safeAccent = /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#6848C9";
  const illustration = await componentIllustrationData(component.assetPath, companyId);
  const browser = await chromium.launch({ headless: true });
  try {
    const width = options?.width ?? 1080, height = options?.height ?? 760;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.route('**/*', route => route.abort());
    await page.setContent(`<style>${await semanticFontFaces()}${options?.fontCss ?? ""}*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;background:transparent}.component-canvas{width:${width}px;height:${height}px;container-type:inline-size;--rd-accent:${safeAccent}}${SEMANTIC_COMPONENT_CSS}${options && !component.style ? '.rd-semantic{--sc-font:OlaBody!important;--sc-heading-font:OlaHeading!important;--sc-quote-font:OlaHeading!important}' : ''}</style><div class="component-canvas">${semanticComponentHtml(component, "", illustration, options?.sourceCopyOnly)}</div>`);
    await page.evaluate(() => document.fonts.ready);
    if(options?.onTextMetrics||options?.sourceCopyOnly){
      const text=await page.evaluate(()=>{
        const result:Array<{content:string;size:number}>=[],seen=new Set<Element>(),walker=document.createTreeWalker(document.querySelector('.component-canvas')!,NodeFilter.SHOW_TEXT);
        let node:Node|null;
        while((node=walker.nextNode())){
          const parent=node.parentElement;if(!parent||parent.closest('style,script,desc,title')||!/[\p{L}\p{N}]/u.test(node.textContent??''))continue;
          const element=parent.closest('text')??parent;if(seen.has(element))continue;
          const style=getComputedStyle(element),bounds=element.getBoundingClientRect();
          if(style.display==='none'||style.visibility==='hidden'||!bounds.width||!bounds.height)continue;
          seen.add(element);
          // SVG font sizes are in viewBox units, so include the actual screen transform.
          const matrix=element instanceof SVGGraphicsElement?element.getScreenCTM():null;
          const scale=matrix?Math.hypot(matrix.c,matrix.d):1;
          const size=parseFloat(style.fontSize)*scale;
          if(Number.isFinite(size)&&size>0)result.push({content:element.matches('text')?[...element.querySelectorAll('tspan')].map(line=>line.textContent?.trim()??'').join(' '):element.textContent?.trim()??'',size});
        }
        return result;
      });
      if(options.sourceCopyOnly){
        const missing=missingRenderedCopy(componentSources(component).map(source=>({source,text:componentText(component,source)})),text.map(item=>item.content));
        if(missing.length)throw Error(`The ${component.kind} renderer omitted canonical copy: ${missing.join(', ')}. Use a measured native component or a designed component that covers these fields; changing scale cannot restore missing text.`);
      }
      options.onTextMetrics?.({width,text});
    }
    return await page.screenshot({ omitBackground: true });
  } finally {
    await browser.close();
  }
}
