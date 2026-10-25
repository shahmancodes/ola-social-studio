import type { BrandDesign } from "../lib/brand-design";

type FontBrand = { fontAssetIds: string[]; designSystem?: BrandDesign };
type Asset = { id: string; name: string; category: string };

/** Saved typography is a dependency of the brand, even when optional images are deselected. */
export function requiredFontAssetIds(brand: FontBrand, available: Asset[]) {
  const rules = brand.designSystem;
  const names = [rules?.headingFontName, rules?.bodyFontName];
  const ids = [...brand.fontAssetIds, rules?.headingFontId, rules?.bodyFontId];
  return available.filter(asset => asset.category === "font" && (ids.includes(asset.id) || names.includes(asset.name))).map(asset => asset.id);
}

export function assertRequiredFonts(brand: FontBrand, assets: Asset[], rules = brand.designSystem) {
  const fonts = assets.filter(asset => asset.category === "font");
  for (const name of [rules?.headingFontName, rules?.bodyFontName]) {
    if (name && !fonts.some(font => font.name === name)) throw new Error(`Required brand font ${name} is missing from the comparison inputs. Include that font file before starting generation.`);
  }
  for (const id of [...brand.fontAssetIds, rules?.headingFontId, rules?.bodyFontId]) {
    if (id && !fonts.some(font => font.id === id)) throw new Error(`Required brand font asset ${id} is missing from the comparison inputs. Include that font file before starting generation.`);
  }
}
