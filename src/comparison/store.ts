import { BrandDesignSchema, type BrandDesign } from "../lib/brand-design";
import { craftReviewLessons } from './craft-report';
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { LAB_DIR, assertIsolation } from "./config";
import { usageSummary } from "../lib/ai-usage";
import { ROOT_DIR } from "../lib/data-directory";
import { contenderInput } from "./contenders";
import { comparisonContenders, contenderId, engines, type Attempt, type Comparison, type Engine, type ModelConfig, type SharedInput } from "./types";
let connection: DatabaseSync | undefined;
export function labDb() {
  assertIsolation();
  if (connection) return connection;
  fs.mkdirSync(LAB_DIR, { recursive: true, mode: 0o700 });
  connection = new DatabaseSync(path.join(LAB_DIR, "comparisons.sqlite"));
  connection.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY, created_at TEXT NOT NULL, input_json TEXT NOT NULL, input_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), engine TEXT NOT NULL, contender_id TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL, record_json TEXT NOT NULL, UNIQUE(case_id,contender_id,version));
    CREATE TABLE IF NOT EXISTS brand_rules(brand_key TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL, rules_json TEXT NOT NULL, note TEXT NOT NULL, source_case TEXT NOT NULL, PRIMARY KEY(brand_key,revision));
    CREATE TABLE IF NOT EXISTS preferences(id TEXT PRIMARY KEY, case_id TEXT NOT NULL, created_at TEXT NOT NULL, record_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS secrets(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, answer TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS heartbeat(id INTEGER PRIMARY KEY, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS worker_info(id INTEGER PRIMARY KEY,fingerprint TEXT NOT NULL,capabilities_json TEXT NOT NULL);
  `);
  const columns = connection.prepare('PRAGMA table_info(attempts)').all() as {name:string}[];
  if (!columns.some(c => c.name === 'contender_id')) {
    connection.exec('BEGIN IMMEDIATE');
    try {
      connection.exec(`CREATE TABLE attempts_v2(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES cases(id),engine TEXT NOT NULL,contender_id TEXT NOT NULL,version INTEGER NOT NULL,status TEXT NOT NULL,record_json TEXT NOT NULL,UNIQUE(case_id,contender_id,version));
        INSERT INTO attempts_v2 SELECT id,case_id,engine,engine,version,status,record_json FROM attempts;
        DROP TABLE attempts; ALTER TABLE attempts_v2 RENAME TO attempts;`);
      connection.exec('COMMIT');
    } catch(error) { connection.exec('ROLLBACK'); throw error; }
  }
  return connection;
}
export const digest = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
export function fingerprint() {
  const hash = crypto.createHash("sha256");
  function walk(dir: string) { for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (/\.(ts|tsx)$/.test(entry.name)) hash.update(path.relative(ROOT_DIR, file)).update(fs.readFileSync(file));
  } }
  walk(path.join(ROOT_DIR, "src"));
  let head = "uncommitted"; try { head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
  return `${head}/${hash.digest("hex").slice(0,16)}`;
}
export function newAttempt(caseId: string, engine: Engine, model?: ModelConfig, options?: { olaBaselineId?: string; contenderId?: string }) {
  const database = labDb(); database.exec("BEGIN IMMEDIATE");
  try {
    const comparison = getCase(caseId);
    const contender = comparisonContenders(comparison).find(c => options?.contenderId ? c.id === options.contenderId : c.id === engine);
    if (!contender || contender.engine !== engine) throw new Error("Choose a valid contender from this comparison.");
    const cid = contender.id;
    if (comparison.attempts.some(a => contenderId(a) === cid && ["queued", "running", "awaiting-input"].includes(a.status))) throw new Error("This contender already has an active attempt.");
    const version = 1 + Math.max(0, ...comparison.attempts.filter(a => contenderId(a) === cid).map(a => a.version));
    const a: Attempt = { id: crypto.randomUUID(), caseId, engine, contenderId: cid, version, status: "queued", stage: "Queued", createdAt: new Date().toISOString(), activeMs: 0, model: comparison.input.mode === "models" || comparison.input.mode === "ola" ? contender.model : engine === "canva-agent" ? model ?? comparison.input.model : undefined, fingerprint: fingerprint(), inputHash: comparison.inputHash, state: {}, events: [] };
    if (options?.olaBaselineId && engine !== "ola") throw new Error("Only Ola attempts support a frozen Ola baseline.");
    if (engine === "ola") {
      const lessons=humanDesignLessons(contenderInput(comparison.input,cid));if(lessons.length)a.state.designLessons=lessons;
      if (options?.olaBaselineId) {
        const baseline = comparison.attempts.find(b=>b.id===options.olaBaselineId && b.engine==='ola' && contenderId(b)===cid);
        if (!baseline || ['queued','running','awaiting-input'].includes(baseline.status)) throw new Error("Choose a saved Ola baseline from this comparison.");
        a.brandRules = baseline.brandRules;
        a.model = baseline.model;
        a.state.baselineAttemptId = baseline.id;
        a.state.designFeedback = baseline.result?.quality;
      } else a.brandRules = comparison.input.mode === "models" || comparison.input.mode === "ola" ? contenderInput(comparison.input, cid).olaRules : currentBrandRules(comparison.input);
    }
    database.prepare("INSERT INTO attempts(id,case_id,engine,contender_id,version,status,record_json) VALUES(?,?,?,?,?,?,?)").run(a.id, caseId, engine, cid, version, a.status, JSON.stringify(a));
    database.exec("COMMIT"); return a;
  } catch (e) { database.exec("ROLLBACK"); throw e; }
}
export function insertCase(id: string, input: SharedInput) {
  if (input.mode === "models" || input.mode === "ola") input = { ...input, olaRules: currentBrandRules(input) };
  if (input.mode === 'ola' && input.companies) input = {...input, companies: input.companies.map(company => ({...company, olaRules:currentBrandRules({...input,...company})}))};
  labDb().prepare("INSERT INTO cases VALUES(?,?,?,?)").run(id, new Date().toISOString(), JSON.stringify(input), digest(JSON.stringify(input)));
  for (const contender of comparisonContenders({input})) {
    const a=newAttempt(id, contender.engine, contender.model, {contenderId:contender.id});
  }
  return getCase(id);
}
export function getCase(id: string): Comparison {
  const row = labDb().prepare("SELECT * FROM cases WHERE id=?").get(id) as { id: string; created_at: string; input_json: string; input_hash: string } | undefined;
  if (!row) throw new Error("Comparison not found.");
  const attempts = labDb().prepare("SELECT record_json FROM attempts WHERE case_id=? ORDER BY version,engine").all(id) as { record_json: string }[];
  return { id, createdAt: row.created_at, input: JSON.parse(row.input_json), inputHash: row.input_hash, attempts: attempts.map(r => JSON.parse(r.record_json)) };
}
export function listCases() { return (labDb().prepare("SELECT id,created_at,input_json FROM cases ORDER BY created_at DESC LIMIT 100").all() as { id: string; created_at: string; input_json: string }[]).map(r => { const i = JSON.parse(r.input_json); return { id: r.id, createdAt: r.created_at, brief: i.brief, companyName: i.companyName, format: i.format, fixture: i.fixture, mode: i.mode ?? "canva" }; }); }
export function getAttempt(id: string): Attempt {
  const row = labDb().prepare("SELECT record_json FROM attempts WHERE id=?").get(id) as { record_json: string } | undefined;
  if (!row) throw new Error("Attempt not found."); return JSON.parse(row.record_json);
}
export function saveAttempt(a: Attempt) { labDb().prepare("UPDATE attempts SET status=?,record_json=? WHERE id=?").run(a.status, JSON.stringify(a), a.id); }
export function event(a: Attempt, kind: string, data: unknown) { a.events.push({ at: new Date().toISOString(), kind, data: redact(data) }); saveAttempt(a); }
export function redact(data: unknown): unknown {
  if (typeof data === "string") {
    let text = data;
    for (const name of ['AI_GATEWAY_API_KEY','OPENROUTER_API_KEY','COMPARISON_CANVA_CLIENT_SECRET','COMPARISON_CANVA_TOKEN_KEY']) { const value=process.env[name]; if(value && value.length>8)text=text.split(value).join('[redacted]'); }
    return text.replace(/https?:\/\/[^\s"<>]+/g, raw => { try { const u = new URL(raw); if(u.hostname.endsWith("canva.com") && u.pathname.startsWith("/api/design/")) return "[signed Canva design URL]"; u.search = ""; u.hash = ""; return u.toString(); } catch { return "[URL]"; } }).replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  }
  if (Array.isArray(data)) return data.map(redact);
  if (data && typeof data === "object") return Object.fromEntries(Object.entries(data).map(([k,v]) => [k, /^(?:(?:access|refresh|continuation|id)?token|tokens|tokenjson)$|secret|authorization|verifier|uploadurl/i.test(k.replaceAll("_", "")) ? "[redacted]" : redact(v)]));
  return data;
}
export function publicCase(c: Comparison) { return { ...c, attempts: c.attempts.map(({ state: _state, ...attempt }) => ({ ...attempt, usage: c.input.fixture ? undefined : usageSummary(attempt.engine === 'ola' ? {projectId:attempt.projectId} : {attemptId:attempt.id}) })) }; }
export function attemptDir(a: Attempt) { const dir = path.join(LAB_DIR, "cases", a.caseId, a.id); fs.mkdirSync(dir, { recursive: true }); return dir; }

export type BrandRuleRevision = { revision: number; createdAt: string; rules: BrandDesign; note: string; sourceCase: string };
export function brandRuleKey(input: SharedInput) { return digest(input.companyId ? `company:${input.companyId}` : `${input.companyName.trim().toLowerCase()}|${input.brand.website.trim().toLowerCase()}`); }
export function brandRuleHistory(input: SharedInput): BrandRuleRevision[] {
  return (labDb().prepare('SELECT * FROM brand_rules WHERE brand_key=? ORDER BY revision DESC').all(brandRuleKey(input)) as Array<{revision:number;created_at:string;rules_json:string;note:string;source_case:string}>).map(r=>({revision:r.revision,createdAt:r.created_at,rules:JSON.parse(r.rules_json),note:r.note,sourceCase:r.source_case}));
}
export function currentBrandRules(input:SharedInput) { return brandRuleHistory(input)[0]; }
/** Explicit votes are the only learning signal. Freeze their evidence on the new attempt. */
export function humanDesignLessons(input:SharedInput) {
  const rows=labDb().prepare('SELECT p.record_json,c.input_json FROM preferences p JOIN cases c ON c.id=p.case_id ORDER BY p.created_at DESC LIMIT 200').all() as {record_json:string;input_json:string}[];
  const lessons=rows.flatMap<{preferenceId:string;verdict:string;notes:string;createdAt:string;referenceImages:string[];manualCorrections?:number;sourceAttempt?:string}>(row=>{
    const source=JSON.parse(row.input_json) as SharedInput;
    if(brandRuleKey(source)!==brandRuleKey(input)||source.format!==input.format)return [];
    const p=JSON.parse(row.record_json) as {id:string;winner:string;notes:string;manualCorrections:number;createdAt:string};
    if(p.winner==='tie')return p.notes?[{preferenceId:p.id,verdict:'none-ready',notes:p.notes,createdAt:p.createdAt,referenceImages:[]}]:[];
    const winner=getAttempt(p.winner);
    return [{preferenceId:p.id,verdict:'preferred',notes:p.notes,manualCorrections:p.manualCorrections,createdAt:p.createdAt,sourceAttempt:winner.id,referenceImages:(winner.result?.pages??[]).slice(0,2).map(page=>page.file)}];
  });
  return [...craftReviewLessons(input),...lessons].slice(0,4);
}
export function saveBrandRules(caseId:string, rules:unknown, note:string, expectedRevision:number) {
  const input=getCase(caseId).input,parsed=BrandDesignSchema.parse(rules);const database=labDb();database.exec('BEGIN IMMEDIATE');
  try {const current=currentBrandRules(input);if((current?.revision??0)!==expectedRevision)throw new Error('Brand rules changed. Reload before saving.');
    const revision=expectedRevision+1,createdAt=new Date().toISOString();database.prepare('INSERT INTO brand_rules VALUES(?,?,?,?,?,?)').run(brandRuleKey(input),revision,createdAt,JSON.stringify(parsed),note,caseId);database.exec('COMMIT');return {revision,createdAt,rules:parsed,note,sourceCase:caseId};
  }catch(error){database.exec('ROLLBACK');throw error;}
}
