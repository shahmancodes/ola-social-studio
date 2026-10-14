import fs from "node:fs/promises";
import path from "node:path";
import { ASSETS_DIR, ASSET_METADATA_FILE } from "./paths";
import type { Storyboard } from "./schemas";

export type AssetRecord = {
  path: string;
  name: string;
  category: string;
  extension: string;
  tokens: string[];
  description: string;
  sentinelKey?: string;
  metadataCategory?: string;
  version?: string;
  recommendedRole: "primary" | "supporting" | "brand";
};

let catalogCache: AssetRecord[] | null = null;

export function invalidateAssetCatalog() {
  catalogCache = null;
}

type SentinelAssetMetadata = {
  sentinelKey: string;
  category: string;
  description: string;
  version: string;
  kind: string;
};

function tokenize(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function recommendedRole(category: string): AssetRecord["recommendedRole"] {
  if (["logos", "watermarks"].includes(category)) return "brand";
  if (["drawings", "social"].includes(category)) return "primary";
  return "supporting";
}

async function readMetadata() {
  try {
    const saved = JSON.parse(await fs.readFile(ASSET_METADATA_FILE, "utf8"));
    return (saved.assets ?? []) as SentinelAssetMetadata[];
  } catch {
    return [];
  }
}

function selectMetadata(relative: string, candidates: SentinelAssetMetadata[]) {
  const localTokens = new Set(tokenize(relative));
  return candidates
    .map((metadata) => ({
      metadata,
      score: tokenize(metadata.sentinelKey).reduce((score, token) => score + (localTokens.has(token) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.metadata.sentinelKey.localeCompare(b.metadata.sentinelKey))[0]?.metadata;
}

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(target) : Promise.resolve([target]);
    }),
  );
  return nested.flat();
}

export async function getAssetCatalog() {
  if (catalogCache) return catalogCache;
  const [files, metadata] = await Promise.all([walk(ASSETS_DIR), readMetadata()]);
  const metadataByName = new Map<string, SentinelAssetMetadata[]>();
  for (const record of metadata) {
    const name = path.posix.basename(record.sentinelKey).toLowerCase();
    metadataByName.set(name, [...(metadataByName.get(name) ?? []), record]);
  }
  catalogCache = files
    .filter((file) => /\.(svg|png|jpg|jpeg)$/i.test(file))
    .map((file) => {
      const relative = path.relative(ASSETS_DIR, file).split(path.sep).join("/");
      const name = path.basename(relative);
      const matched = selectMetadata(relative, metadataByName.get(name.toLowerCase()) ?? []);
      const description = matched?.description ?? "";
      return {
        path: relative,
        name,
        category: relative.split("/")[0],
        extension: path.extname(relative).slice(1).toLowerCase(),
        tokens: tokenize(`${relative.startsWith("internet/") ? name.replace(/\.[^.]+$/, "") : relative.replace(/\.[^.]+$/, "")} ${description} ${matched?.category ?? ""}`),
        description,
        sentinelKey: matched?.sentinelKey,
        metadataCategory: matched?.category,
        version: matched?.version,
        recommendedRole: recommendedRole(relative.split("/")[0]),
      };
    });
  return catalogCache;
}

export async function getEditorAssetCatalog() {
  const catalog = await getAssetCatalog();
  const choice = ({ path, name, description }: AssetRecord) => ({ path, name, description });
  const isMascot = (asset: AssetRecord) => asset.category === "drawings" && /^(mascot-|baby-mascot)/.test(asset.name);
  const secondaryCategories = new Set(["secondary", "illustrations", "icons", "emojis", "badges", "values", "social"]);
  return {
    mascot: catalog.filter(isMascot).map(choice),
    secondary: catalog.filter((asset) => secondaryCategories.has(asset.category) || (asset.category === "drawings" && !isMascot(asset))).map(choice),
    uploads: catalog.filter((asset) => asset.category === "uploads").map(choice),
  };
}

export async function searchAssets(query: string, limit = 12) {
  const catalog = await getAssetCatalog();
  const queryTokens = tokenize(query);
  return catalog
    .map((asset) => {
      const filenameTokens = tokenize(asset.name.replace(/\.[^.]+$/, ""));
      const score = queryTokens.reduce((total, token) => {
        if (filenameTokens.includes(token)) return total + 6;
        if (filenameTokens.some((candidate) => candidate.length >= 4 && token.length >= 4 && (candidate.includes(token) || token.includes(candidate)))) return total + 3;
        if (asset.tokens.includes(token)) return total + 2;
        if (asset.tokens.some((candidate) => candidate.length >= 4 && token.length >= 4 && (candidate.includes(token) || token.includes(candidate)))) return total + 0.75;
        return total;
      }, asset.description.toLowerCase().includes(query.toLowerCase()) ? 5 : asset.category === "drawings" ? 1 : 0);
      return { ...asset, score };
    })
    .filter((asset) => asset.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}

export async function chooseAsset(query: string) {
  const matches = await searchAssets(query, 1);
  return matches[0]?.path ?? "";
}

export async function invalidStoryboardAssets(storyboard: Storyboard) {
  const catalog = await getAssetCatalog();
  const known = new Set(catalog.map((asset) => asset.path));
  const invalid: Array<{ slideIndex: number; field: "asset" | "supportingAsset" | "additionalAssets" | "semanticComponent"; path: string }> = [];
  for (const slide of storyboard.slides) {
    if (slide.asset && !known.has(slide.asset)) invalid.push({ slideIndex: slide.index, field: "asset", path: slide.asset });
    if (slide.supportingAsset && !known.has(slide.supportingAsset)) invalid.push({ slideIndex: slide.index, field: "supportingAsset", path: slide.supportingAsset });
    if (slide.semanticComponent?.assetPath && !known.has(slide.semanticComponent.assetPath)) invalid.push({ slideIndex: slide.index, field: "semanticComponent", path: slide.semanticComponent.assetPath });
    for (const asset of slide.additionalAssets) {
      if (!known.has(asset.path)) invalid.push({ slideIndex: slide.index, field: "additionalAssets", path: asset.path });
    }
  }
  return invalid;
}

export async function assertStoryboardAssets(storyboard: Storyboard) {
  const invalid = await invalidStoryboardAssets(storyboard);
  if (invalid.length) {
    const detail = invalid.map((item) => `slide ${item.slideIndex} ${item.field}: ${item.path}`).join("; ");
    throw new Error(`Storyboard references assets that do not exist in the local library: ${detail}`);
  }
}

export function resolveAsset(relative: string) {
  const normalized = path.posix.normalize(relative).replace(/^\.\.\//, "");
  const absolute = path.join(ASSETS_DIR, normalized);
  if (!absolute.startsWith(ASSETS_DIR)) throw new Error("Unsafe asset path");
  return absolute;
}
