import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { ROOT_DIR } from "./paths";
import { getAssetCatalog, resolveAsset } from "./assets";
import { getCompanyAsset } from "./platform";
import type { SlideSpec } from "./schemas";
import { semanticComponentHtml, SEMANTIC_COMPONENT_CSS } from "./semantic-components";

type Component = NonNullable<SlideSpec["semanticComponent"]>;

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

export async function renderSemanticComponentPng(component: Component, accent = "#6848C9", companyId?: string) {
  const safeAccent = /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#6848C9";
  const illustration = await componentIllustrationData(component.assetPath, companyId);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 760 }, deviceScaleFactor: 1 });
    await page.setContent(`<style>${await semanticFontFaces()}*{box-sizing:border-box}html,body{margin:0;width:1080px;height:760px;background:transparent}.component-canvas{width:1080px;height:760px;container-type:inline-size;--rd-accent:${safeAccent}}${SEMANTIC_COMPONENT_CSS}</style><div class="component-canvas">${semanticComponentHtml(component, "", illustration)}</div>`);
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ omitBackground: true });
  } finally {
    await browser.close();
  }
}
