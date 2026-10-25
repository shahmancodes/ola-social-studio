import { selectBrandMemory } from "./brand-library";
import { brandDesignForPlanning, type BrandDesign } from "./brand-design";
import { db } from "./platform-db";
import { companyStorageDir, type Brand } from "./platform";
import path from 'node:path';

export type BrandAsset = { id: string; name: string; mediaType: string; diskPath: string; role: string; sourceUrl?: string | null; rightsNote?: string | null; attribution?:string };
type CatalogAsset = BrandAsset & { category: string };
export type ContentBrand = {
  projectId?: string;
  memory?: ReturnType<typeof selectBrandMemory>;
  companyId: string;
  name: string;
  audience: string;
  voice: string;
  description: string;
  typography: string;
  fonts?: BrandAsset[];
  assetAliases?: Record<string,string>;
  designSystem?: BrandDesign;
  imagery: string;
  formatRules: string;
  examples: string[];
  palette: { background: string; alternate: string; accent: string; ink: string; dark: string };
  logo?: BrandAsset;
  assets: BrandAsset[];
};

const validHex = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const STOP = new Set(["and", "for", "the", "with", "from", "into", "this", "that", "about", "post", "story", "slide", "slides", "article", "presentation", "carousel", "create", "single", "image", "headline", "idea", "short", "company", "brand", "aimed", "before", "after", "use", "one"]);
const words = (value: string) => new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 2 && !STOP.has(part)));
const stem = (value: string) => value.replace(/(ing|ers|ies|s)$/, "");
const lightness = (hex: string) => {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  return channels.reduce((sum, channel, index) => sum + (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index], 0);
};

export function brandPalette(brand: Brand): ContentBrand["palette"] {
  const colors = brand.colors.filter(validHex);
  const light = colors.filter((value) => lightness(value) > 0.68);
  const dark = colors.filter((value) => lightness(value) < 0.16).sort((a, b) => lightness(a) - lightness(b));
  const saturated = colors.filter((value) => { const c=[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)); return Math.max(...c)-Math.min(...c)>30; });
  const background = light[0] ?? "#F5F4F0";
  const alternate = light.find((value) => value !== background) ?? "#F1F3F5";
  const accent = saturated[0] ?? dark[0] ?? "#5D45B5";
  const ink = dark[0] ?? "#17151D";
  return brand.designSystem?.palette ?? { background, alternate, accent, ink, dark: ink };
}

export function shortlistBrandAssets(rows: CatalogAsset[], brand: Brand, brief: string): BrandAsset[] {
  const terms = words(brief);
  const styleTerms = words(brand.themeCard?.imagery ?? "");
  const score = (asset: CatalogAsset) => {
    const assetWords = words(asset.name);
    let value = [...terms].filter((term) => [...assetWords].some((part) => stem(part).startsWith(stem(term)))).length * 10;
    value += [...styleTerms].filter((term) => assetWords.has(term)).length;
    if (brand.artworkAssetIds.includes(asset.id)) value += 4;
    if (asset.role === "primary") value += 3;
    if (asset.category === "artwork" || asset.category === "illustration") value += 2;
    if (/logo|favicon|store|opengraph|badge|rank/i.test(asset.name)) value -= 8;
    return value;
  };
  return rows.filter((row) => (!row.sourceUrl || Boolean(row.rightsNote && !/unverified|permission.required|unknown|not verified/i.test(row.rightsNote))) && row.category !== 'project-artwork' && row.category !== "logo" && row.category !== "wordmark" && row.category !== "reference" && !/favicon|app-store|opengraph|badge|\blogo\b/i.test(row.name))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)).slice(0, 16)
    .map(({ id, name: assetName, mediaType, diskPath, role, sourceUrl, rightsNote }) => ({ id, name: assetName, mediaType, diskPath, role, sourceUrl, rightsNote }));
}

export function contentBrand(companyId: string, name: string, brand: Brand, brief: string, projectId?:string): ContentBrand {
  const rows = db().prepare("SELECT id,name,media_type AS mediaType,disk_path AS diskPath,usage_role AS role,category,source_url AS sourceUrl,rights_note AS rightsNote FROM assets WHERE company_id=? AND media_type IN ('image/png','image/jpeg','image/webp','image/svg+xml')")
    .all(companyId) as CatalogAsset[];
  const assets = shortlistBrandAssets(rows, brand, brief);
  if(projectId&&/^[a-f0-9-]{36}$/.test(projectId)){
    const root=path.join(companyStorageDir(companyId),'projects',projectId,'artwork')+path.sep;
    assets.push(...rows.filter(a=>a.category==='project-artwork'&&path.resolve(a.diskPath).startsWith(root)&&a.rightsNote).map(({category:_,...a})=>({...a,attribution:a.rightsNote?.match(/\nAttribution: ([\s\S]*)$/)?.[1]??''})));
  }
  const logo = rows.find((row) => (row.id === brand.logoAssetId || row.id === brand.wordmarkAssetId) && (!row.sourceUrl || Boolean(row.rightsNote && !/unverified|permission.required|unknown|not verified/i.test(row.rightsNote))));
  const fonts = (db().prepare("SELECT id,name,media_type AS mediaType,disk_path AS diskPath,usage_role AS role FROM assets WHERE company_id=? AND category='font'").all(companyId) as BrandAsset[]).filter(a => brand.fontAssetIds.includes(a.id));
  return {
    projectId, assetAliases: brand.sourceAssetAliases, fonts, designSystem: brandDesignForPlanning(brand.designSystem),
    memory: selectBrandMemory(brand.library, brief),
    companyId, name, audience: brand.audience, voice: brand.voice, description: brand.description,
    typography: brand.themeCard?.typography || "Readable, confident typography",
    imagery: brand.themeCard?.imagery || "Use supplied brand imagery where it adds meaning.",
    formatRules: brand.formatRules, examples: brand.examples.slice(0, 5), palette: brandPalette(brand),
    logo: logo && { id: logo.id, name: logo.name, mediaType: logo.mediaType, diskPath: logo.diskPath, role: logo.role }, assets,
  };
}

export function brandPrompt(brand: ContentBrand) {
  return JSON.stringify({
    memory: brand.memory,
    name: brand.name, audience: brand.audience, voice: brand.voice, description: brand.description,
    typography: brand.typography, imagery: brand.imagery, formatRules: brand.formatRules,
    examples: brand.examples, palette: brand.palette,
    assets: brand.assets.map(({ id, name, role }) => ({ id, name, role })),
    logo: brand.logo ? { id: brand.logo.id, name: brand.logo.name, automaticallyPlaced: true } : null,
    fonts: brand.fonts?.map(({ id, name }) => ({ id, name })), designSystem: brand.designSystem,
    hasLogo: Boolean(brand.logo),
  });
}

export function selectedBrandAsset(brand: ContentBrand, id?: string) {
  return brand.assets.find((asset) => asset.id === id);
}
