import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LAB_DIR, SOURCE_DATA_DIR, canvaBlockReason } from './config';
import { contenderId, contenderInput } from './contenders';
import { redact } from './store';
import type { Attempt, SharedInput } from './types';
import { defaultModelSettings, type ModelSettings } from '../lib/model-routing';
import type { WorkerSnapshot } from '../lib/worker-heartbeat';

export type HealthStatus = 'healthy' | 'attention' | 'offline' | 'unknown';
export type HealthWorker = { id: string; name: string; status: HealthStatus; lastSeen: string | null; detail: string; snapshot?: WorkerSnapshot; capabilities: string[] };
export type HealthJob = { id: string; source: string; kind: string; company: string; status: string; stage: string; updatedAt: string; leaseUntil?: string; retryAt?: string; retries?: number; caseId?: string; model?: string; pinnedModel?: boolean; error?: string };
export type HealthQueue = { name: string; queued: number; running: number; waiting: number; failed24h: number; expired: number };
export type HealthModelContext = { id: string; label: string; origin: 'worker' | 'web' | 'unavailable'; settings?: ModelSettings; note: string };
export type ObservedModel = { source: string; stage: string; provider: string; model: string; calls: number; failures: number; lastSeen: string };
export type HealthData = {
  updatedAt: string; workers: HealthWorker[]; queues: HealthQueue[]; jobs: HealthJob[]; failures: HealthJob[];
  modelContexts: HealthModelContext[]; observedModels: ObservedModel[]; warnings: string[];
  accounting: { pending: number; exhausted: number }; canva: { configured: boolean; note: string };
};
const table = (db: DatabaseSync, name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
function read<T>(file: string, fn: (db: DatabaseSync) => T): T | undefined {
  if (!fs.existsSync(file)) return;
  const db = new DatabaseSync(file, { readOnly: true });
  try { db.exec('PRAGMA busy_timeout=2000; BEGIN'); return fn(db); } finally { db.close(); }
}
export function heartbeatStatus(lastSeen: string | null, now: number, stopped = false): HealthStatus {
  if (!lastSeen) return 'unknown';
  return !stopped && Number.isFinite(Date.parse(lastSeen)) && now - Date.parse(lastSeen) >= -5000 && now - Date.parse(lastSeen) < 10000 ? 'healthy' : 'offline';
}
const emptyQueue = (name: string): HealthQueue => ({ name, queued: 0, running: 0, waiting: 0, failed24h: 0, expired: 0 });
const safeError = (error: string | undefined | null) => error ? String(redact(error)).slice(0, 600) : undefined;
function runtimeWorker(db: DatabaseSync, kind: WorkerSnapshot['kind']) {
  if (!table(db, 'worker_heartbeats')) return;
  const row = db.prepare('SELECT last_seen,status,record_json FROM worker_heartbeats WHERE kind=? ORDER BY last_seen DESC LIMIT 1').get(kind) as { last_seen: string; status: string; record_json: string } | undefined;
  return row ? { lastSeen: row.last_seen, stopped: row.status === 'stopped', snapshot: JSON.parse(row.record_json) as WorkerSnapshot } : undefined;
}

/** Local inspection only. Opening Health never starts workers or migrates either store. */
export function sentinelHealth(dirs = { lab: LAB_DIR, source: SOURCE_DATA_DIR }, now = Date.now()): HealthData {
  const updatedAt = new Date(now).toISOString(), since = new Date(now - 86400000).toISOString();
  const result: HealthData = { updatedAt, workers: [], queues: [], jobs: [], failures: [], modelContexts: [], observedModels: [], warnings: [], accounting: { pending: 0, exhausted: 0 }, canva: { configured: !canvaBlockReason(), note: canvaBlockReason() ?? 'Canva credentials are configured. Connection is checked separately when running a comparison.' } };
  let comparisonRuntime: WorkerSnapshot | undefined, productRuntime: WorkerSnapshot | undefined;
  const comparisonWorker: HealthWorker = { id: 'comparison', name: 'Sentinel worker', status: 'unknown', lastSeen: null, detail: 'No worker heartbeat has been recorded.', capabilities: [] };
  result.workers.push(comparisonWorker);
  try {
    read(path.join(dirs.lab, 'comparisons.sqlite'), db => {
      const runtime = runtimeWorker(db, 'comparison');
      const heartbeat = table(db, 'heartbeat') ? db.prepare('SELECT at FROM heartbeat WHERE id=1').get() as { at: string } | undefined : undefined;
      const info = table(db, 'worker_info') ? db.prepare('SELECT capabilities_json FROM worker_info WHERE id=1').get() as { capabilities_json: string } | undefined : undefined;
      comparisonWorker.lastSeen = heartbeat?.at ?? runtime?.lastSeen ?? null;
      comparisonWorker.status = heartbeatStatus(comparisonWorker.lastSeen, now, !heartbeat && runtime?.stopped);
      if (runtime && heartbeatStatus(runtime.lastSeen, now, runtime.stopped) === 'healthy') comparisonRuntime = runtime.snapshot;
      comparisonWorker.snapshot = comparisonRuntime;
      comparisonWorker.capabilities = comparisonRuntime?.capabilities ?? (info ? Object.entries(JSON.parse(info.capabilities_json)).filter(([, enabled]) => enabled === true).map(([key]) => key) : []);
      comparisonWorker.detail = comparisonWorker.status === 'healthy' ? 'Heartbeat received within the last 10 seconds.' : comparisonWorker.status === 'offline' ? 'Heartbeat is stale or the worker stopped.' : 'No worker heartbeat has been recorded.';
      if (!table(db, 'attempts') || !table(db, 'cases')) return;
      const queue = emptyQueue('Comparison attempts'); result.queues.push(queue);
      const rows = db.prepare('SELECT a.record_json,c.input_json FROM attempts a JOIN cases c ON c.id=a.case_id').all() as { record_json: string; input_json: string }[];
      for (const row of rows) {
        const a = JSON.parse(row.record_json) as Attempt, input = contenderInput(JSON.parse(row.input_json) as SharedInput, contenderId(a));
        if (a.status === 'queued') queue.queued++;
        if (a.status === 'running') queue.running++;
        if (a.status === 'awaiting-input') queue.waiting++;
        const failed = ['failed', 'blocked', 'interrupted'].includes(a.status) && (a.finishedAt ?? a.createdAt) >= since;
        if (failed) queue.failed24h++;
        if (!['queued', 'running', 'awaiting-input'].includes(a.status) && !failed) continue;
        const job: HealthJob = { id: a.id, source: 'Sentinel', kind: a.engine, company: input.companyName, status: a.status, stage: a.stage, updatedAt: a.finishedAt ?? a.events?.at(-1)?.at ?? a.startedAt ?? a.createdAt, caseId: a.caseId, model: input.fixture ? 'Fixture · no model calls' : a.model ? `${a.model.provider} · ${a.model.model}` : a.engine === 'canva-direct' ? 'Canva native' : 'Worker defaults', pinnedModel: !input.fixture && Boolean(a.model) && (a.engine === 'canva-agent' || a.engine === 'ola' && (input.mode === 'models' || input.mode === 'ola')), error: safeError(a.error) };
        (failed ? result.failures : result.jobs).push(job);
      }
    });
  } catch { comparisonWorker.status = 'unknown'; result.warnings.push('Sentinel worker and comparison status could not be fully read.'); }

  const productWorker: HealthWorker = { id: 'ola', name: 'Ola product worker', status: 'unknown', lastSeen: null, detail: 'No runtime heartbeat yet. Monitoring starts when the Ola worker next starts with this version.', capabilities: [] };
  result.workers.push(productWorker);
  const observed = new Map<string, ObservedModel>();
  for (const [source, file] of [['Sentinel pipeline', path.join(dirs.lab, 'ola', 'platform.sqlite')], ['Ola product', path.join(dirs.source, 'platform.sqlite')]] as const) {
    try {
      read(file, db => {
        if (source === 'Ola product') {
          const runtime = runtimeWorker(db, 'ola');
          if (runtime) { productWorker.lastSeen = runtime.lastSeen; productWorker.status = heartbeatStatus(runtime.lastSeen, now, runtime.stopped); productWorker.snapshot = runtime.snapshot; productWorker.capabilities = runtime.snapshot.capabilities; productWorker.detail = productWorker.status === 'healthy' ? 'Heartbeat received within the last 10 seconds.' : 'Last worker heartbeat is stale or the worker stopped.'; if (productWorker.status === 'healthy') productRuntime = runtime.snapshot; }
        }
        const queue = emptyQueue(source); result.queues.push(queue);
        if (table(db, 'jobs') && table(db, 'projects') && table(db, 'companies')) {
          const policies = table(db, 'project_ai_policy') ? new Map((db.prepare('SELECT project_id,policy_json FROM project_ai_policy').all() as { project_id: string; policy_json: string }[]).map(p => [p.project_id, JSON.parse(p.policy_json) as { provider: string; model: string; strict?: boolean }])) : new Map<string, { provider: string; model: string; strict?: boolean }>();
          const rows = db.prepare("SELECT j.id,j.project_id,j.kind,j.status,j.attempts,j.run_after,j.lease_until,j.error,j.updated_at,p.brief,c.name FROM jobs j LEFT JOIN projects p ON p.id=j.project_id LEFT JOIN companies c ON c.id=p.company_id WHERE j.status IN ('queued','running') OR (j.status='failed' AND j.updated_at>=?)").all(since) as Array<{ id: string; project_id: string; kind: string; status: string; attempts: number; run_after: string; lease_until: string | null; error: string | null; updated_at: string; brief: string; name: string | null }>;
          for (const j of rows) {
            if (j.status === 'queued') queue.queued++;
            if (j.status === 'running') queue.running++;
            if (j.status === 'failed') queue.failed24h++;
            if (j.status === 'running' && (!j.lease_until || j.lease_until < updatedAt)) queue.expired++;
            const policy = policies.get(j.project_id);
            const job: HealthJob = { id: j.id, source, kind: j.kind, company: j.name ?? 'Unknown company', status: j.status, stage: j.kind.replaceAll('-', ' '), updatedAt: j.updated_at, leaseUntil: j.lease_until ?? undefined, retryAt: j.status === 'queued' && j.run_after > updatedAt ? j.run_after : undefined, retries: Math.max(0, j.attempts - 1), error: safeError(j.error), model: policy?.strict ? `${policy.provider} · ${policy.model}` : undefined, pinnedModel: policy?.strict === true };
            (j.status === 'failed' ? result.failures : result.jobs).push(job);
          }
          queue.waiting = Number(db.prepare("SELECT count(*) AS n FROM projects WHERE status='awaiting-input'").get()?.n ?? 0);
        }
        if (table(db, 'brand_jobs') && table(db, 'companies')) {
          const rows = db.prepare("SELECT j.id,j.status,j.updated_at,j.error,c.name FROM brand_jobs j LEFT JOIN companies c ON c.id=j.company_id WHERE j.status IN ('queued','running') OR (j.status='failed' AND j.updated_at>=?)").all(since) as Array<{ id: string; status: string; updated_at: string; error: string | null; name: string | null }>;
          for (const j of rows) { if (j.status === 'queued') queue.queued++; if (j.status === 'running') queue.running++; if (j.status === 'failed') queue.failed24h++; const job: HealthJob = { id: j.id, source, kind: 'brand-analysis', stage: 'Brand analysis', status: j.status, company: j.name ?? 'Unknown company', updatedAt: j.updated_at, error: safeError(j.error) }; (j.status === 'failed' ? result.failures : result.jobs).push(job); }
        }
        if (!table(db, 'ai_calls')) return;
        const cols = db.prepare('PRAGMA table_info(ai_calls)').all() as { name: string }[];
        if (cols.some(c => c.name === 'reconcile_tries')) {
          const pending = db.prepare("SELECT count(*) AS n,sum(CASE WHEN reconcile_tries>=5 THEN 1 ELSE 0 END) AS exhausted FROM ai_calls WHERE json_extract(record_json,'$.costSource')='pending'").get();
          result.accounting.pending += Number(pending?.n ?? 0); result.accounting.exhausted += Number(pending?.exhausted ?? 0);
        }
        const rows = db.prepare("SELECT record_json FROM ai_calls WHERE json_extract(record_json,'$.startedAt')>=? ORDER BY rowid DESC LIMIT 2000").all(since) as { record_json: string }[];
        for (const r of rows) { const c = JSON.parse(r.record_json) as { provider: string; model: string; stage: string; outcome: string; startedAt: string }; const key = JSON.stringify([source, c.stage, c.provider, c.model]); const current = observed.get(key) ?? { source, stage: c.stage, provider: c.provider, model: c.model, calls: 0, failures: 0, lastSeen: c.startedAt }; current.calls++; if (c.outcome === 'failed') current.failures++; if (c.startedAt > current.lastSeen) current.lastSeen = c.startedAt; observed.set(key, current); }
      });
    } catch { result.warnings.push(`${source} status could not be fully read.`); }
  }
  try {
    read(path.join(dirs.lab, 'component-candidates', 'candidates.sqlite'), db => {
      if (!table(db, 'jobs')) return;
      const queue = emptyQueue('Component design'); result.queues.push(queue);
      const rows = db.prepare('SELECT record_json FROM jobs').all() as { record_json: string }[];
      for (const row of rows) { const j = JSON.parse(row.record_json) as { id: string; status: string; createdAt: string; error?: string; model?: { provider: string; model: string } }; const failed = ['failed', 'interrupted'].includes(j.status) && j.createdAt >= since; if (j.status === 'queued') queue.queued++; if (j.status === 'running') queue.running++; if (failed) queue.failed24h++; if (failed || ['queued', 'running'].includes(j.status)) { const job: HealthJob = { id: j.id, source: 'Component design', company: 'Source comparison', kind: 'semantic-designer', stage: 'Component design & visual review', status: j.status, updatedAt: j.createdAt, error: safeError(j.error), model: j.model ? `${j.model.provider} · ${j.model.model}` : undefined, pinnedModel: Boolean(j.model) }; (failed ? result.failures : result.jobs).push(job); } }
    });
  } catch { result.warnings.push('Component design queue could not be read.'); }
  result.modelContexts = [
    { id: 'comparison', label: 'Sentinel pipeline', origin: comparisonRuntime ? 'worker' : 'web', settings: comparisonRuntime?.models ?? defaultModelSettings(), note: comparisonRuntime ? 'Captured from the running Sentinel worker at startup.' : 'Configured defaults from the Sentinel web process. The running worker has no runtime model snapshot yet; its environment may differ. A snapshot will be recorded at its next start.' },
    { id: 'ola', label: 'Ola product', origin: productRuntime ? 'worker' : 'unavailable', settings: productRuntime?.models, note: productRuntime ? 'Captured from the running Ola product worker at startup.' : 'Runtime model configuration is unavailable until the Ola worker reports a fresh heartbeat. Observed calls below show models that have actually run.' },
  ];
  result.jobs.sort((a, b) => (a.status === 'running' ? 0 : 1) - (b.status === 'running' ? 0 : 1) || b.updatedAt.localeCompare(a.updatedAt));
  result.jobs = result.jobs.slice(0, 50); result.failures.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); result.failures = result.failures.slice(0, 20);
  result.observedModels = [...observed.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)).slice(0, 50);
  return result;
}
