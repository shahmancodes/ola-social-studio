import path from "node:path";
import { chromium, type Browser } from "playwright";
import { ROOT_DIR } from "./data-directory";
import { fontFamily } from "./font-catalog";
import type { DesignSpec } from "./freeform-design";

/** Fabric measures and wraps text identically in the live canvas and SVG export. */
export async function freeformTypography(spec: DesignSpec, fontCss: string) {
  const browser: Browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: spec.size.widthPx, height: spec.size.heightPx }, deviceScaleFactor: 1 });
    await page.route("**/*", route => route.abort());
    await page.setContent(`<style>html,body{margin:0;padding:0}${fontCss}</style>`);
    await page.addScriptTag({ path: path.join(ROOT_DIR, "node_modules/fabric/dist/index.min.js") });
    await page.evaluate(async () => { await Promise.all([...document.fonts].map(font => font.load())); await document.fonts.ready; });
    const text = await page.evaluate(({ elements, width, height }) => {
      // The installed browser build is the same Fabric version used by the editor.
      const fabric = (window as unknown as { fabric: { Textbox: new (text: string, options: Record<string, unknown>) => { toSVG: () => string } } }).fabric;
      return elements.map(e => e.kind !== "text" ? "" : new fabric.Textbox(e.text, { left: e.x * width, top: e.y * height, width: e.width * width, fontSize: e.fontSize * width, fontFamily: e.family, fontWeight: e.weight === "bold" ? "bold" : "normal", fontStyle: e.italic ? "italic" : "normal", textAlign: e.align, fill: e.color, strokeWidth: 0, objectCaching: false }).toSVG());
    }, { elements: spec.elements.map(e => ({ ...e, family: e.kind === "text" ? fontFamily(e) ?? "OlaBody" : undefined })), width: spec.size.widthPx, height: spec.size.heightPx });
    return { text, async rasterize(svg: string) {
      await page.setContent(`<style>html,body{margin:0;padding:0}${fontCss}</style>${svg}`);
      await page.evaluate(async () => { await Promise.all([...document.fonts].map(font => font.load())); await document.fonts.ready; });
      return page.screenshot({ type: "png", animations: "disabled" });
    }, dispose: () => browser.close() };
  } catch (error) { await browser.close(); throw error; }
}
