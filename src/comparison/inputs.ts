import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { BrandSchema } from "../lib/platform";
import { providers } from "./config";
import { supportedModels } from "./supported-models";
import { modelCatalog } from "./model-catalog";
import { LAB_DIR, SOURCE_DATA_DIR } from "./config";
import { digest, insertCase, labDb } from "./store";
import { InputSchema, type FrozenAsset, type FrozenCompany } from "./types";
import { assertRequiredFonts, requiredFontAssetIds } from "./font-assets";

type SourceAsset = { id: string; name: string; media_type: string; disk_path: string; category: string; usage_role: string; source_url: string | null; rights_note: string | null };
export function sourceCatalog() {
  const file = path.join(SOURCE_DATA_DIR, "platform.sqlite");
  if (!fs.existsSync(file)) return [];
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return (db.prepare("SELECT id,name,brand_json FROM companies ORDER BY name").all() as { id: string; name: string; brand_json: string }[]).map(c => ({ id: c.id, name: c.name, brand: BrandSchema.parse(JSON.parse(c.brand_json)), assets: (db.prepare("SELECT id,name,media_type,category FROM assets WHERE company_id=? AND media_type IN ('image/png','image/jpeg','image/webp','image/svg+xml','font/woff2','font/woff','font/ttf','font/otf') AND (source_url IS NULL OR (rights_note IS NOT NULL AND rights_note NOT LIKE '%unverified%' AND rights_note NOT LIKE '%unknown%' AND rights_note NOT LIKE '%permission required%'))").all(c.id)) }));
  } finally { db.close(); }
}
function sourceAssets(companyId: string, ids: string[]) {
  const db = new DatabaseSync(path.join(SOURCE_DATA_DIR, "platform.sqlite"), { readOnly: true });
  try { return ids.map(id => {
    const a = db.prepare("SELECT * FROM assets WHERE company_id=? AND id=?").get(companyId, id) as SourceAsset | undefined;
    if (!a) throw new Error("Selected asset is not in this company.");
    const resolved = fs.realpathSync(a.disk_path);
    if (!resolved.startsWith(fs.realpathSync(SOURCE_DATA_DIR) + path.sep)) throw new Error("Asset is outside Ola's data directory.");
    if (a.source_url && (!a.rights_note || /unverified|unknown|permission.required|not verified/i.test(a.rights_note))) throw new Error("Selected asset has unconfirmed usage rights.");
    return a;
  }); } finally { db.close(); }
}
export async function createComparison(form: FormData) {
  const input = InputSchema.parse(JSON.parse(String(form.get("input"))));
  if (input.mode === 'models') {
    if (!input.models || input.models.length < 2 || input.models.length > 5) throw new Error('Choose 2–5 models.');
    const provider = input.models[0].provider;
    if (input.models.some(m => m.provider !== provider) || new Set(input.models.map(m => m.model)).size !== input.models.length) throw new Error('Choose distinct models using one provider.');
    if (input.models.some(m => !supportedModels.some(s => s[provider] === m.model))) throw new Error('Choose a supported model.');
    if (!input.fixture) {
      const worker = labDb().prepare('SELECT capabilities_json FROM worker_info WHERE id=1').get() as {capabilities_json:string}|undefined;
      if (!worker || !JSON.parse(worker.capabilities_json).models) throw new Error('Restart the comparison worker after active runs finish to enable model comparisons.');
      if (!providers().find(p => p.id === provider)?.configured) throw new Error('The selected provider is not configured.');
      const catalog = await modelCatalog(provider);
      if (input.models.some(m => !catalog.some(c => c.id === m.model))) throw new Error('A selected model is unavailable from this provider.');
    }
  }
  if (input.companyIds) {
    if (input.mode !== 'ola') throw new Error('Multiple companies are only supported in the company mode.');
    if (new Set(input.companyIds).size !== input.companyIds.length) throw new Error('Choose distinct companies.');
    if (input.assetIds.length) throw new Error('Company runs use each company’s own saved assets.');
    if (!input.fixture) {
      const worker = labDb().prepare('SELECT capabilities_json FROM worker_info WHERE id=1').get() as {capabilities_json:string}|undefined;
      if (!worker || !JSON.parse(worker.capabilities_json).companies) throw new Error('Restart the comparison worker after active runs finish to enable company runs.');
    }
  }
  const catalog = input.companyIds || input.companyId ? sourceCatalog() : [];
  const companies = input.companyIds?.map(id => {
    const company = catalog.find(c => c.id === id);
    if (!company) throw new Error('A selected company no longer exists. Refresh the company list.');
    if (company.assets.length > 16) throw new Error(`${company.name} has more than 16 eligible assets. Use a single-company run to choose assets.`);
    return company;
  });
  const files = form.getAll("files").filter((f): f is File => typeof f !== "string");
  if (files.length + input.assetIds.length > 16) throw new Error("Choose at most 16 assets in total.");
  if (input.assetIds.length && !input.companyId) throw new Error("Select a company for saved assets.");
  const id = crypto.randomUUID(); const dir = path.join(LAB_DIR, "cases", id, "inputs"); fs.mkdirSync(dir, { recursive: true });
  try {
    async function freeze(companyId: string | undefined, assetIds: string[], assetDir: string) {
    fs.mkdirSync(assetDir, {recursive:true});
    const assets: FrozenAsset[] = [];
    const originals = assetIds.length ? sourceAssets(companyId!, assetIds) : [];
    if (originals.length + files.length > 16) throw new Error('Choose at most 16 saved and shared assets per company.');
    const candidates = [...originals.map(a => ({ id: a.id, name: a.name, mediaType: a.media_type, category: a.category, role: a.usage_role, sourceUrl: a.source_url ?? undefined, rightsNote: a.rights_note ?? undefined, bytes: fs.readFileSync(a.disk_path) })), ...await Promise.all(files.map(async f => ({ id: crypto.randomUUID(), name: f.name, mediaType: f.type, category: input.uploadMetadata?.find(m => m.name === f.name)?.category ?? (f.type.startsWith("font/") ? "font" : "artwork"), role: "primary", sourceUrl: input.uploadMetadata?.find(m => m.name === f.name)?.sourceUrl, rightsNote: input.uploadMetadata?.find(m => m.name === f.name)?.rightsNote, bytes: Buffer.from(await f.arrayBuffer()) })))];
    let total = 0;
    for (const a of candidates) {
      total += a.bytes.length;
      if (a.bytes.length > 10 * 1024 * 1024 || total > 32 * 1024 * 1024) throw new Error("Assets must be under 10 MB each and 32 MB total.");
      const fontSignatures: Record<string, string> = { "font/woff2": "774f4632", "font/woff": "774f4646", "font/ttf": "00010000", "font/otf": "4f54544f" };
      if (fontSignatures[a.mediaType]) {
        if (a.bytes.length < 48 || a.bytes.subarray(0, 4).toString("hex") !== fontSignatures[a.mediaType]) throw new Error("Invalid font file header.");
      } else {
        if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(a.mediaType)) throw new Error("Use PNG, JPEG, WebP, SVG, WOFF2, WOFF, TTF, or OTF assets.");
        await sharp(a.bytes, { limitInputPixels: 40_000_000 }).metadata();
      }
      const extension = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/svg+xml": ".svg", "font/woff2": ".woff2", "font/woff": ".woff", "font/ttf": ".ttf", "font/otf": ".otf" }[a.mediaType];
      const file = path.join(assetDir, a.id + extension); fs.writeFileSync(file, a.bytes, { flag: "wx" });
      assets.push({ id: a.id, name: a.name, mediaType: a.mediaType, category: a.category, role: a.role, path: file, sha256: digest(a.bytes), sourceUrl: a.sourceUrl, rightsNote: a.rightsNote });
    }
    return assets;
    }
    const sourceCompany = input.companyId ? catalog.find(company => company.id === input.companyId) : undefined;
    if (input.companyId && !sourceCompany) throw new Error("The selected company no longer exists. Refresh the company list.");
    const dependencyIds = requiredFontAssetIds(input.brand, sourceCompany?.assets as Array<{id:string;name:string;category:string}> ?? []);
    const assets = await freeze(companies ? undefined : input.companyId, companies ? [] : [...new Set([...input.assetIds, ...dependencyIds])], dir);
    if (!companies) assertRequiredFonts(input.brand, assets);
    const { assetIds: _assetIds, companyIds: _companyIds, ...rest } = input;
    // The frozen brand only refers to the explicitly selected asset set.
    const selected = new Set(assets.map(a => a.id));
    rest.brand = { ...rest.brand, logoAssetId: selected.has(rest.brand.logoAssetId ?? "") ? rest.brand.logoAssetId : assets.find(a => a.category === "logo")?.id ?? null, wordmarkAssetId: selected.has(rest.brand.wordmarkAssetId ?? "") ? rest.brand.wordmarkAssetId : null, artworkAssetIds: rest.brand.artworkAssetIds.filter(a => selected.has(a)), fontAssetIds: [...new Set([...rest.brand.fontAssetIds.filter(a => selected.has(a)), ...assets.filter(a => a.category === "font").map(a => a.id)])] };
    let snapshots: FrozenCompany[] | undefined;
    if (companies) {
      snapshots = [];
      for (const company of companies) {
        const frozen = await freeze(company.id, company.assets.map(a => String(a.id)), path.join(dir, company.id));
        assertRequiredFonts(company.brand, frozen);
        snapshots.push({companyId:company.id, companyName:company.name, brand:company.brand, assets:frozen});
      }
    }
    return insertCase(id, { ...rest, companyName:snapshots ? snapshots.map(c=>c.companyName).join(', ') : rest.companyName, assets, companies:snapshots });
  } catch (e) { fs.rmSync(path.join(LAB_DIR, "cases", id), { recursive: true, force: true }); throw e; }
}
