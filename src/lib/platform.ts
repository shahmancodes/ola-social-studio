import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DATA_DIR } from "./paths";
import { db, id, now, projectRow, type CompanyRow, type ProjectRow } from "./platform-db";
import { type Role } from "./platform-auth";

export const ContentTypeSchema = z.enum(["carousel", "post", "story", "article", "presentation", "design"]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const BrandSchema = z.object({
  description: z.string().default(""),
  audience: z.string().default(""),
  voice: z.string().default(""),
  colors: z.array(z.string()).default([]),
  logoAssetId: z.string().nullable().default(null),
  wordmarkAssetId: z.string().nullable().default(null),
  fontAssetIds: z.array(z.string()).default([]),
  artworkAssetIds: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
  formatRules: z.string().default(""),
  website: z.string().default(""),
  socialLinks: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
  themeCard: z.object({
    tagline: z.string(),
    personality: z.array(z.string()),
    typography: z.string(),
    imagery: z.string(),
    source: z.string(),
    generatedAt: z.string(),
    featuredAssetId: z.string().nullable().optional(),
  }).nullable().default(null),
});
export type Brand = z.infer<typeof BrandSchema>;

export function createCompany(name: string, ownerId: string, brand: Partial<Brand> = {}) {
  if (!name.trim()) throw new Error("Company name is required.");
  const companyId = id();
  const profile = BrandSchema.parse(brand);
  db().prepare("INSERT INTO companies(id,name,brand_json,created_at) VALUES(?,?,?,?)")
    .run(companyId, name.trim(), JSON.stringify(profile), now());
  db().prepare("INSERT INTO memberships(user_id,company_id,role) VALUES(?,?,?)").run(ownerId, companyId, "owner");
  return companyId;
}

export function createOnboardingCompany(name: string, ownerId: string, brand: Partial<Brand>) {
  const companyId = createCompany(name, ownerId, brand);
  db().prepare("UPDATE companies SET onboarding_step=2 WHERE id=?").run(companyId);
  return companyId;
}

export function saveOnboardingCompany(companyId: string, name: string, brand: unknown, step: number) {
  const cleanName = name.trim().replace(/\s+/g, " ");
  if (!cleanName || cleanName.length > 120) throw new Error("Enter a company name under 120 characters.");
  if (!Number.isInteger(step) || step < 2 || step > 5) throw new Error("Invalid setup step.");
  const parsed = BrandSchema.parse(brand);
  db().prepare("UPDATE companies SET name=?,brand_json=?,onboarding_step=CASE WHEN onboarding_step=5 THEN 5 ELSE ? END WHERE id=?")
    .run(cleanName, JSON.stringify(parsed), step, companyId);
  return parsed;
}

export function companiesForUser(userId: string) {
  const root = db().prepare("SELECT is_root FROM users WHERE id=?").get(userId) as { is_root: number } | undefined;
  if (root?.is_root) return db().prepare("SELECT c.*, 'owner' AS role FROM companies c ORDER BY c.name").all() as Array<CompanyRow & { role: Role }>;
  return db().prepare("SELECT c.*,m.role FROM companies c JOIN memberships m ON m.company_id=c.id WHERE m.user_id=? ORDER BY c.name")
    .all(userId) as Array<CompanyRow & { role: Role }>;
}

export function getCompany(companyId: string) {
  return db().prepare("SELECT * FROM companies WHERE id=?").get(companyId) as CompanyRow | undefined;
}

export function teamForCompany(companyId: string) {
  const rows = db().prepare("SELECT u.id,u.email,u.display_name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,u.email")
    .all(companyId) as Array<{ id: string; email: string; display_name: string; role: Role }>;
  return rows.map((row) => ({ ...row }));
}

export function pendingInvitationsForCompany(companyId: string) {
  const rows = db().prepare("SELECT email,role,expires_at FROM invitations WHERE company_id=? AND accepted_at IS NULL AND expires_at>? ORDER BY expires_at DESC")
    .all(companyId, now()) as Array<{ email: string; role: "admin" | "member"; expires_at: string }>;
  return rows.map((row) => ({ ...row }));
}

export function getBrand(companyId: string): Brand {
  const company = getCompany(companyId);
  if (!company) throw new Error("Company not found.");
  return BrandSchema.parse(JSON.parse(company.brand_json));
}

export function saveBrand(companyId: string, brand: unknown) {
  const parsed = BrandSchema.parse(brand);
  db().prepare("UPDATE companies SET brand_json=? WHERE id=?").run(JSON.stringify(parsed), companyId);
  return parsed;
}

export function queueBrandAnalysis(companyId: string, website: string) {
  const jobId = id();
  const time = now();
  db().prepare("INSERT INTO brand_jobs(id,company_id,status,website,created_at,updated_at) VALUES(?,?,?,?,?,?)")
    .run(jobId, companyId, "queued", website, time, time);
  return jobId;
}

export function latestBrandJob(companyId: string) {
  return db().prepare("SELECT id,status,error,created_at,updated_at FROM brand_jobs WHERE company_id=? ORDER BY created_at DESC LIMIT 1")
    .get(companyId) as { id: string; status: string; error: string | null; created_at: string; updated_at: string } | undefined;
}

export function createProjectRecord(input: { id?: string; companyId: string; creatorId?: string | null; contentType: ContentType; brief: string; status?: string; artifact?: unknown }) {
  const projectId = input.id ?? id();
  const time = now();
  db().prepare("INSERT INTO projects(id,company_id,creator_id,content_type,brief,brand_snapshot_json,status,artifact_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(projectId, input.companyId, input.creatorId ?? null, input.contentType, input.brief, JSON.stringify(getBrand(input.companyId)), input.status ?? "draft", input.artifact === undefined ? null : JSON.stringify(input.artifact), time, time);
  return projectId;
}

export function updateProjectRecord(projectId: string, update: { status?: string; artifact?: unknown; brief?: string }, expectedVersion?: number) {
  const current = projectRow(projectId);
  if (!current) throw new Error("Project not found.");
  if (expectedVersion !== undefined && current.version !== expectedVersion) throw new Error("This project changed in another tab. Refresh before saving.");
  db().prepare("UPDATE projects SET status=?,artifact_json=?,brief=?,version=version+1,updated_at=? WHERE id=?")
    .run(update.status ?? current.status, update.artifact === undefined ? current.artifact_json : JSON.stringify(update.artifact), update.brief ?? current.brief, now(), projectId);
  if (update.artifact !== undefined) db().prepare("INSERT OR REPLACE INTO workflow_artifact_versions(project_id,version,artifact_json,created_at) VALUES(?,?,?,?)")
    .run(projectId, current.version + 1, JSON.stringify(update.artifact), now());
  return projectRow(projectId)!;
}

export function listCompanyProjects(companyId: string) {
  return db().prepare("SELECT * FROM projects WHERE company_id=? ORDER BY updated_at DESC").all(companyId) as ProjectRow[];
}

export function companyStorageDir(companyId: string) {
  if (!/^[a-f0-9-]{36}$/.test(companyId)) throw new Error("Invalid company ID.");
  return path.join(DATA_DIR, "companies", companyId);
}

export async function storeCompanyAsset(companyId: string, name: string, bytes: Buffer, mediaType: string, category: string, provenance?: { sourceUrl?: string; rightsNote?: string }, usageRole: "primary" | "supporting" = "primary") {
  const assetId = id();
  const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 12);
  const directory = path.join(companyStorageDir(companyId), "assets");
  await fs.mkdir(directory, { recursive: true });
  const target = path.join(directory, assetId + ext);
  await fs.writeFile(target, bytes, { flag: "wx" });
  db().prepare("INSERT INTO assets(id,company_id,name,media_type,disk_path,category,usage_role,source_url,rights_note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(assetId, companyId, name, mediaType, target, category, usageRole, provenance?.sourceUrl ?? null, provenance?.rightsNote ?? null, now());
  return assetId;
}

export function getCompanyAsset(companyId: string, assetId: string) {
  return db().prepare("SELECT * FROM assets WHERE company_id=? AND id=?").get(companyId, assetId) as { id: string; company_id: string; name: string; media_type: string; disk_path: string; category: string; source_url: string | null; rights_note: string | null } | undefined;
}

export async function deleteCompanyAsset(companyId: string, assetId: string) {
  const database = db();
  const asset = database.prepare("SELECT disk_path,source_url FROM assets WHERE company_id=? AND id=?").get(companyId, assetId) as { disk_path: string; source_url: string | null } | undefined;
  if (!asset) throw new Error("Asset not found.");
  database.exec("BEGIN IMMEDIATE");
  try {
    const brand = getBrand(companyId);
    saveBrand(companyId, {
      ...brand,
      logoAssetId: brand.logoAssetId === assetId ? null : brand.logoAssetId,
      wordmarkAssetId: brand.wordmarkAssetId === assetId ? null : brand.wordmarkAssetId,
      fontAssetIds: brand.fontAssetIds.filter((id) => id !== assetId),
      artworkAssetIds: brand.artworkAssetIds.filter((id) => id !== assetId),
      themeCard: brand.themeCard ? { ...brand.themeCard, featuredAssetId: brand.themeCard.featuredAssetId === assetId ? null : brand.themeCard.featuredAssetId } : null,
    });
    if (asset.source_url?.startsWith("legacy:")) database.prepare("INSERT OR IGNORE INTO asset_deletions(company_id,source_url,deleted_at) VALUES(?,?,?)").run(companyId, asset.source_url, now());
    database.prepare("DELETE FROM assets WHERE company_id=? AND id=?").run(companyId, assetId);
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  if (path.dirname(path.resolve(asset.disk_path)) === path.join(companyStorageDir(companyId), "assets")) await fs.unlink(asset.disk_path).catch(() => {});
}

export async function storeProjectReference(projectId: string, name: string, bytes: Buffer, mediaType: string) {
  const row = projectRow(projectId); if (!row) throw new Error("Project not found.");
  const referenceId = id();
  const directory = path.join(companyStorageDir(row.company_id), "projects", projectId, "references");
  await fs.mkdir(directory, { recursive: true });
  const target = path.join(directory, referenceId + path.extname(name).toLowerCase().slice(0, 12));
  await fs.writeFile(target, bytes, { flag: "wx" });
  db().prepare("INSERT INTO project_references(id,project_id,name,media_type,disk_path,created_at) VALUES(?,?,?,?,?,?)").run(referenceId, projectId, name, mediaType, target, now());
  return referenceId;
}

export function newShareToken(projectId: string) {
  if (!projectRow(projectId)) throw new Error("Project not found.");
  const value = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(value).digest("hex");
  db().prepare("INSERT INTO share_links(token_hash,project_id,expires_at,created_at) VALUES(?,?,?,?)")
    .run(hash, projectId, new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), now());
  return value;
}

export function projectForShareToken(value: string) {
  const hash = crypto.createHash("sha256").update(value).digest("hex");
  const link = db().prepare("SELECT project_id FROM share_links WHERE token_hash=? AND expires_at>? AND revoked_at IS NULL")
    .get(hash, now()) as { project_id: string } | undefined;
  return link ? projectRow(link.project_id) : undefined;
}
