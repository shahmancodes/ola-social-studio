import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
const DATA_DIR = path.join(process.cwd(), ".data");

let database: DatabaseSync | undefined;

export function db() {
  if (database) return database;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  database = new DatabaseSync(path.join(DATA_DIR, "platform.sqlite"));
  database.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, is_root INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, name TEXT NOT NULL, brand_json TEXT NOT NULL DEFAULT '{}', onboarding_step INTEGER NOT NULL DEFAULT 5, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS memberships (user_id TEXT NOT NULL REFERENCES users(id), company_id TEXT NOT NULL REFERENCES companies(id), role TEXT NOT NULL CHECK(role IN ('owner','admin','member')), PRIMARY KEY(user_id,company_id));
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS invitations (token_hash TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), email TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','member')), expires_at TEXT NOT NULL, accepted_at TEXT);
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), creator_id TEXT REFERENCES users(id), content_type TEXT NOT NULL, brief TEXT NOT NULL, brand_snapshot_json TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, artifact_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS projects_company_idx ON projects(company_id,updated_at);
    CREATE TABLE IF NOT EXISTS workflow_state (project_id TEXT PRIMARY KEY REFERENCES projects(id), phase TEXT NOT NULL, specialist TEXT, answers_json TEXT NOT NULL DEFAULT '[]', question_json TEXT, route_json TEXT, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS workflow_events (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), actor TEXT NOT NULL, kind TEXT NOT NULL, stage TEXT NOT NULL, body TEXT NOT NULL, data_json TEXT, artifact_version INTEGER, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS workflow_events_project_idx ON workflow_events(project_id,created_at);
    CREATE TABLE IF NOT EXISTS workflow_qa (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), artifact_version INTEGER NOT NULL, gate TEXT NOT NULL, passed INTEGER NOT NULL, report_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS workflow_qa_project_idx ON workflow_qa(project_id,artifact_version);
    CREATE TABLE IF NOT EXISTS workflow_artifact_versions (project_id TEXT NOT NULL REFERENCES projects(id), version INTEGER NOT NULL, artifact_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(project_id,version));
    CREATE TABLE IF NOT EXISTS ola_messages (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL CHECK(role IN ('user','assistant')), stage TEXT NOT NULL, body TEXT NOT NULL, proposal_id TEXT, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS ola_messages_project_idx ON ola_messages(project_id,created_at);
    CREATE TABLE IF NOT EXISTS ola_proposals (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), user_id TEXT NOT NULL REFERENCES users(id), stage TEXT NOT NULL, base_version INTEGER NOT NULL, base_json TEXT NOT NULL, origin_json TEXT NOT NULL, candidate_json TEXT NOT NULL, summary TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','accepted','discarded','superseded')), created_at TEXT NOT NULL, decided_at TEXT);
    CREATE INDEX IF NOT EXISTS ola_proposals_project_idx ON ola_proposals(project_id,created_at);
    CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), name TEXT NOT NULL, media_type TEXT NOT NULL, disk_path TEXT NOT NULL, category TEXT NOT NULL, usage_role TEXT NOT NULL DEFAULT 'primary', source_url TEXT, rights_note TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS asset_deletions (company_id TEXT NOT NULL REFERENCES companies(id), source_url TEXT NOT NULL, deleted_at TEXT NOT NULL, PRIMARY KEY(company_id,source_url));
    CREATE TABLE IF NOT EXISTS brand_jobs (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), status TEXT NOT NULL, website TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS brand_jobs_company_idx ON brand_jobs(company_id,created_at);
    CREATE TABLE IF NOT EXISTS project_references (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL, media_type TEXT NOT NULL, disk_path TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), kind TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, run_after TEXT NOT NULL, lease_until TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS jobs_ready_idx ON jobs(status,run_after);
    CREATE TABLE IF NOT EXISTS whatsapp_links (phone TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), linked_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pairing_codes (code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL, used_at TEXT);
    CREATE TABLE IF NOT EXISTS pairing_attempts (phone TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS conversations (phone TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, phone TEXT NOT NULL, direction TEXT NOT NULL, body TEXT NOT NULL, external_id TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, retry_after TEXT, attempts INTEGER NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX IF NOT EXISTS messages_external_idx ON messages(external_id) WHERE external_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS share_links (token_hash TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canva_oauth_states (state_hash TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), user_id TEXT NOT NULL REFERENCES users(id), code_verifier TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS canva_connections (company_id TEXT NOT NULL REFERENCES companies(id), user_id TEXT NOT NULL REFERENCES users(id), token_json TEXT NOT NULL, expires_at TEXT NOT NULL, connected_at TEXT NOT NULL, PRIMARY KEY(company_id,user_id));
  `);
  const companyColumns = database.prepare("PRAGMA table_info(companies)").all() as Array<{ name: string }>;
  if (!companyColumns.some((column) => column.name === "onboarding_step")) database.exec("ALTER TABLE companies ADD COLUMN onboarding_step INTEGER NOT NULL DEFAULT 5");
  const userColumns = database.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  if (!userColumns.some((column) => column.name === "is_root")) database.exec("ALTER TABLE users ADD COLUMN is_root INTEGER NOT NULL DEFAULT 0");
  if (!userColumns.some((column) => column.name === "display_name")) database.exec("ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''");
  const assetColumns = database.prepare("PRAGMA table_info(assets)").all() as Array<{ name: string }>;
  if (!assetColumns.some((column) => column.name === "usage_role")) database.exec("ALTER TABLE assets ADD COLUMN usage_role TEXT NOT NULL DEFAULT 'primary'");
  // Existing local prototypes may have created the messages table before retries were scheduled.
  const messageColumns = database.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
  if (!messageColumns.some((column) => column.name === "retry_after")) database.exec("ALTER TABLE messages ADD COLUMN retry_after TEXT");
  if (!messageColumns.some((column) => column.name === "attempts")) database.exec("ALTER TABLE messages ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0");
  const proposalColumns = database.prepare("PRAGMA table_info(ola_proposals)").all() as Array<{ name: string }>;
  if (!proposalColumns.some((column) => column.name === "origin_json")) database.exec("ALTER TABLE ola_proposals ADD COLUMN origin_json TEXT NOT NULL DEFAULT '{}' ");
  return database;
}

export function id() { return crypto.randomUUID(); }
export function token() { return crypto.randomBytes(32).toString("base64url"); }
export function hashToken(value: string) { return crypto.createHash("sha256").update(value).digest("hex"); }
export function now() { return new Date().toISOString(); }
export function later(ms: number) { return new Date(Date.now() + ms).toISOString(); }

export type CompanyRow = { id: string; name: string; brand_json: string; onboarding_step: number; created_at: string };
export type ProjectRow = { id: string; company_id: string; creator_id: string | null; content_type: string; brief: string; brand_snapshot_json: string; status: string; version: number; artifact_json: string | null; created_at: string; updated_at: string };

export function companyForProject(projectId: string) {
  return db().prepare("SELECT company_id FROM projects WHERE id=?").get(projectId) as { company_id: string } | undefined;
}

export function projectRow(projectId: string) {
  return db().prepare("SELECT * FROM projects WHERE id=?").get(projectId) as ProjectRow | undefined;
}

export function enqueue(projectId: string, kind: string, payload: unknown = {}) {
  const duplicate = db().prepare("SELECT id FROM jobs WHERE project_id=? AND kind=? AND status IN ('queued','running') LIMIT 1").get(projectId, kind) as { id: string } | undefined;
  if (duplicate) return duplicate.id;
  const jobId = id();
  const time = now();
  db().prepare("INSERT INTO jobs(id,project_id,kind,payload_json,status,run_after,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(jobId, projectId, kind, JSON.stringify(payload), "queued", time, time, time);
  return jobId;
}
