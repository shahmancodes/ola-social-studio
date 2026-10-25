import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LAB_DIR, SOURCE_DATA_DIR } from './config';
import { contenderId, contenderInput } from './contenders';
import type { Attempt, SharedInput } from './types';
import type { GenerationUsage, UsageCall, UsageData } from './sentinel-usage-model';

function hasTable(db: DatabaseSync, table: string) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)); }
function readOnly<T>(file: string, read: (db: DatabaseSync) => T): T | undefined {
  if (!fs.existsSync(file)) return;
  const db = new DatabaseSync(file, { readOnly: true });
  try { db.exec('PRAGMA busy_timeout=3000; BEGIN'); return read(db); }
  finally { db.close(); }
}

/** Read both stores without initializing or migrating the production database. */
export function sentinelUsage(dirs = { lab: LAB_DIR, source: SOURCE_DATA_DIR }): UsageData {
  const generations: GenerationUsage[] = [], warnings: string[] = [];
  const attemptMap = new Map<string, GenerationUsage>(), projectMap = new Map<string, GenerationUsage>();
  try {
    readOnly(path.join(dirs.lab, 'comparisons.sqlite'), db => {
      if (!hasTable(db, 'attempts') || !hasTable(db, 'cases')) return;
      const rows = db.prepare('SELECT a.record_json,c.input_json FROM attempts a JOIN cases c ON c.id=a.case_id').all() as { record_json: string; input_json: string }[];
      for (const row of rows) {
        const a = JSON.parse(row.record_json) as Attempt, shared = JSON.parse(row.input_json) as SharedInput;
        const input = contenderInput(shared, contenderId(a));
        const g: GenerationUsage = { id: `comparison:${a.id}`, source: 'comparison', companyId: input.companyId ?? null, companyName: input.companyName, brief: input.brief, format: input.format, status: a.status, createdAt: a.createdAt, fixture: input.fixture, caseId: a.caseId, engine: a.engine, version: a.version, models: a.model ? [a.model.model] : [], calls: [] };
        generations.push(g); attemptMap.set(a.id, g); if (a.projectId) projectMap.set(a.projectId, g);
      }
    });
  } catch { warnings.push('Comparison history could not be read. Retry after active writes finish.'); }
  const visited = new Set<string>();
  for (const [source, dir] of [['comparison', path.join(dirs.lab, 'ola')], ['ola', dirs.source]] as const) {
    const file = path.join(dir, 'platform.sqlite');
    if (!fs.existsSync(file)) continue;
    const real = fs.realpathSync(file); if (visited.has(real)) continue; visited.add(real);
    try {
      readOnly(file, db => {
        const projects = new Map<string, GenerationUsage>();
        const companyOrigins = new Map<string, { id: string | null; name: string }>();
        if (hasTable(db, 'projects') && hasTable(db, 'companies')) {
          const rows = db.prepare('SELECT p.id,p.company_id,c.name,p.brief,p.content_type,p.status,p.created_at FROM projects p LEFT JOIN companies c ON c.id=p.company_id').all() as { id: string; company_id: string; name: string | null; brief: string; content_type: string; status: string; created_at: string }[];
          for (const p of rows) {
            const g = source === 'comparison' ? projectMap.get(p.id) : undefined;
            const record: GenerationUsage = g ?? { id: `${source}:project:${p.id}`, source, companyId: p.company_id, companyName: p.name ?? 'Unknown company', brief: p.brief, format: p.content_type, status: p.status, createdAt: p.created_at, fixture: false, models: [], calls: [] };
            projects.set(p.id, record); if (!g) generations.push(record);
            if (g) companyOrigins.set(p.company_id, { id: g.companyId, name: g.companyName });
          }
        }
        const runs = new Map<string, GenerationUsage>();
        if (hasTable(db, 'ai_runs')) {
          const rows = db.prepare('SELECT * FROM ai_runs').all() as { id: string; project_id: string | null; company_id: string | null; attempt_id: string | null; stage: string; started_at: string; status: string }[];
          const companies = hasTable(db, 'companies') ? new Map((db.prepare('SELECT id,name FROM companies').all() as { id: string; name: string }[]).map(c => [c.id, c.name])) : new Map<string, string>();
          for (const r of rows) {
            const existing = (source === 'comparison' && r.attempt_id ? attemptMap.get(r.attempt_id) : undefined) ?? (r.project_id ? projects.get(r.project_id) : undefined);
            const origin = r.company_id ? companyOrigins.get(r.company_id) : undefined;
            const g: GenerationUsage = existing ?? { id: `${source}:run:${r.id}`, source, companyId: origin ? origin.id : r.company_id, companyName: origin?.name ?? (r.company_id ? companies.get(r.company_id) ?? 'Unknown company' : 'Unassigned'), brief: r.stage.replaceAll('-', ' '), format: 'Background task', status: r.status, createdAt: r.started_at, fixture: false, models: [], calls: [] };
            runs.set(r.id, g); if (!existing) generations.push(g);
          }
        }
        if (!hasTable(db, 'ai_calls')) return;
        const calls = db.prepare('SELECT id,run_id,project_id,attempt_id,record_json FROM ai_calls ORDER BY rowid').all() as { id: string; run_id: string | null; project_id: string | null; attempt_id: string | null; record_json: string }[];
        for (const row of calls) {
          const c = JSON.parse(row.record_json) as UsageCall;
          let g = (source === 'comparison' && row.attempt_id ? attemptMap.get(row.attempt_id) : undefined) ?? (row.project_id ? projects.get(row.project_id) : undefined) ?? (row.run_id ? runs.get(row.run_id) : undefined);
          if (!g) { g = { id: `${source}:call:${row.id}`, source, companyId: null, companyName: 'Unassigned', brief: c.stage, format: 'Background task', status: c.outcome, createdAt: c.startedAt, fixture: false, models: [], calls: [] }; generations.push(g); }
          // Select billing fields explicitly; never expose prompts, secrets or database paths.
          g.calls.push({ id: c.id, model: c.model, provider: c.provider, stage: c.stage, startedAt: c.startedAt, durationMs: c.durationMs, outcome: c.outcome, inputTokens: c.inputTokens, outputTokens: c.outputTokens, cachedTokens: c.cachedTokens, reasoningTokens: c.reasoningTokens, costUsd: c.costUsd, costSource: c.costSource, incomplete: c.incomplete });
          if (!g.models.includes(c.model)) g.models.push(c.model);
        }
      });
    } catch { warnings.push(`${source === 'ola' ? 'Ola' : 'Comparison'} usage could not be fully read. Some records may be missing.`); }
  }
  return { generations: generations.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), updatedAt: new Date().toISOString(), warnings };
}
