import fs from "node:fs/promises";
import path from "node:path";
import { ROOT_DIR } from "./data-directory";
import { bundledFontFile, fontFamily, type FontSelection } from "./font-catalog";
import type { BrandAsset } from "./content-brand";

export async function readBundledFont(id: string, weight = 400, italic = false) {
  const file = bundledFontFile(id, weight, italic);
  if (!file) throw new Error("Unknown bundled font.");
  return fs.readFile(path.join(ROOT_DIR, "node_modules", file));
}
/** Embed the same bytes used by the browser, including in standalone SVG exports. */
export async function selectedFontCss(selections: FontSelection[], fonts: BrandAsset[] = []) {
  const unique = new Map(selections.map(s => [s.fontId ? `asset:${s.fontId}` : s.font, s]));
  const rules: string[] = [];
  for (const selection of unique.values()) {
    const family = fontFamily(selection);
    if (selection.fontId) {
      const font = fonts.find(f => f.id === selection.fontId);
      if (!font) throw new Error("This font is not available in this company's font library. Choose another font.");
      const bytes = await fs.readFile(font.diskPath);
      if (bytes.length > 15 * 1024 * 1024) throw new Error("Font file is too large.");
      rules.push(`@font-face{font-family:${family};src:url(data:${font.mediaType};base64,${bytes.toString("base64")});font-weight:100 900;font-style:normal;font-display:block}`);
    } else if (selection.font && bundledFontFile(selection.font)) {
      for (const weight of [400, 700]) for (const italic of [false, true]) {
        if (selection.font === "manrope" && italic) continue;
        const bytes = await readBundledFont(selection.font, weight, italic);
        rules.push(`@font-face{font-family:${family};src:url(data:font/woff2;base64,${bytes.toString("base64")});font-weight:${weight};font-style:${italic ? "italic" : "normal"};font-display:block}`);
      }
    }
  }
  return rules.join("");
}
