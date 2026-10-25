import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { heartbeatStatus, sentinelHealth } from './sentinel-health';
import { defaultModelSettings } from '../lib/model-routing';

const now = Date.parse('2026-10-25T05:00:00Z');
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function dirs() { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-health-')); roots.push(root); return { lab: path.join(root, 'lab'), source: path.join(root, 'source') }; }
function database(file: string) { fs.mkdirSync(path.dirname(file), { recursive: true }); return new DatabaseSync(file); }

describe('Sentinel health', () => {
  it('distinguishes fresh, stale, stopped, missing, and invalid heartbeats', () => {
    expect(heartbeatStatus(new Date(now - 2000).toISOString(), now)).toBe('healthy');
    expect(heartbeatStatus(new Date(now - 10000).toISOString(), now)).toBe('offline');
    expect(heartbeatStatus(new Date(now).toISOString(), now, true)).toBe('offline');
    expect(heartbeatStatus(new Date(now + 6000).toISOString(), now)).toBe('offline');
    expect(heartbeatStatus(null, now)).toBe('unknown');
    expect(heartbeatStatus('invalid', now)).toBe('offline');
  });

  it('reads the existing Sentinel heartbeat without claiming a runtime model snapshot', () => {
    const d = dirs(), db = database(path.join(d.lab, 'comparisons.sqlite'));
    db.exec('CREATE TABLE heartbeat(id INTEGER,at TEXT); CREATE TABLE worker_info(id INTEGER,capabilities_json TEXT);');
    db.prepare('INSERT INTO heartbeat VALUES(1,?)').run(new Date(now - 2000).toISOString());
    db.prepare('INSERT INTO worker_info VALUES(1,?)').run(JSON.stringify({ models: true, accounting: true, companies: true })); db.close();
    const health = sentinelHealth(d, now);
    expect(health.workers[0]).toMatchObject({ status: 'healthy', capabilities: ['models', 'accounting', 'companies'] });
    expect(health.modelContexts[0].origin).toBe('web');
    expect(health.workers[1].status).toBe('unknown');
    expect(health.warnings).toEqual([]);
  });

  it('uses worker-captured model settings and separately reports observed calls', () => {
    const d = dirs(), db = database(path.join(d.source, 'platform.sqlite'));
    db.exec('CREATE TABLE worker_heartbeats(id TEXT,kind TEXT,last_seen TEXT,status TEXT,record_json TEXT); CREATE TABLE ai_calls(record_json TEXT);');
    const models = defaultModelSettings({ VERCEL_AI_MODEL: 'worker/text', AI_GATEWAY_API_KEY: 'do-not-expose-this-key', OPENROUTER_MODEL: 'worker/fallback', OPENROUTER_VISION_MODEL: 'worker/vision' });
    const snapshot = { id: 'worker', kind: 'ola', startedAt: new Date(now - 60000).toISOString(), models, concurrency: 1, capabilities: ['content-jobs'] };
    db.prepare('INSERT INTO worker_heartbeats VALUES(?,?,?,?,?)').run('worker', 'ola', new Date(now - 1000).toISOString(), 'running', JSON.stringify(snapshot));
    for (const outcome of ['complete', 'failed']) db.prepare('INSERT INTO ai_calls VALUES(?)').run(JSON.stringify({ provider: 'vercel', model: 'observed/model', stage: 'generate-simple', startedAt: new Date(now - 5000).toISOString(), outcome })); db.close();
    const result = sentinelHealth(d, now);
    expect(result.modelContexts[1]).toMatchObject({ origin: 'worker', settings: { vercel: { model: 'worker/text' }, openrouter: { visionModel: 'worker/vision' } } });
    expect(result.observedModels).toEqual([expect.objectContaining({ stage: 'generate-simple', model: 'observed/model', calls: 2, failures: 1 })]);
    expect(JSON.stringify(result)).not.toContain('do-not-expose-this-key');
    expect(JSON.stringify(result)).not.toContain(d.source);
  });

  it('counts queued jobs, expired leases, retries, and recent failures', () => {
    const d = dirs(), db = database(path.join(d.source, 'platform.sqlite'));
    db.exec('CREATE TABLE companies(id TEXT,name TEXT); CREATE TABLE projects(id TEXT,company_id TEXT,brief TEXT,status TEXT); CREATE TABLE jobs(id TEXT,project_id TEXT,kind TEXT,status TEXT,attempts INTEGER,run_after TEXT,lease_until TEXT,error TEXT,updated_at TEXT);');
    db.prepare('INSERT INTO companies VALUES(?,?)').run('co', 'Example'); db.prepare('INSERT INTO projects VALUES(?,?,?,?)').run('p', 'co', 'Brief', 'running');
    db.exec('CREATE TABLE project_ai_policy(project_id TEXT,policy_json TEXT)');
    db.prepare('INSERT INTO project_ai_policy VALUES(?,?)').run('p', JSON.stringify({ strict: true, provider: 'openrouter', model: 'pinned/model' }));
    const insert = db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?)');
    insert.run('queued', 'p', 'generate-simple', 'queued', 2, new Date(now + 10000).toISOString(), null, null, new Date(now - 1000).toISOString());
    insert.run('expired', 'p', 'review-simple', 'running', 1, new Date(now - 20000).toISOString(), new Date(now - 1000).toISOString(), null, new Date(now - 10000).toISOString());
    insert.run('failed', 'p', 'generate-simple', 'failed', 4, new Date(now - 20000).toISOString(), null, 'Failed request', new Date(now - 2000).toISOString());
    insert.run('old-failure', 'p', 'generate-simple', 'failed', 4, new Date(now - 172800000).toISOString(), null, 'Old error', new Date(now - 172800000).toISOString()); db.close();
    const result = sentinelHealth(d, now);
    expect(result.queues.find(q => q.name === 'Ola product')).toMatchObject({ queued: 1, running: 1, expired: 1, failed24h: 1 });
    expect(result.jobs.find(j => j.id === 'queued')).toMatchObject({ retries: 1, retryAt: new Date(now + 10000).toISOString(), model: 'openrouter · pinned/model' });
    expect(result.failures).toHaveLength(1);
    expect(result.workers[1].status).toBe('unknown');
  });

  it('does not initialize or migrate missing and legacy stores', () => {
    const d = dirs(); expect(sentinelHealth(d, now).workers.every(w => w.status === 'unknown')).toBe(true); expect(fs.existsSync(d.source)).toBe(false);
    const file = path.join(d.source, 'platform.sqlite'), db = database(file); db.exec('CREATE TABLE legacy(id TEXT)'); db.close();
    sentinelHealth(d, now);
    const check = new DatabaseSync(file, { readOnly: true }); expect(check.prepare("SELECT name FROM sqlite_master WHERE name='worker_heartbeats'").get()).toBeUndefined(); check.close();
  });

  it('distinguishes strict selected models from ordinary Ola defaults and fixtures', () => {
    const d = dirs(), db = database(path.join(d.lab, 'comparisons.sqlite'));
    db.exec('CREATE TABLE cases(id TEXT,input_json TEXT); CREATE TABLE attempts(case_id TEXT,record_json TEXT);');
    for (const [id, mode, engine, fixture] of [['default', 'canva', 'ola', false], ['selected', 'models', 'ola', false], ['canva-agent', 'canva', 'canva-agent', false], ['fixture', 'models', 'ola', true]] as const) {
      db.prepare('INSERT INTO cases VALUES(?,?)').run(id, JSON.stringify({ mode, companyName: 'Example', fixture }));
      db.prepare('INSERT INTO attempts VALUES(?,?)').run(id, JSON.stringify({ id, caseId: id, engine, status: 'running', stage: 'generate', createdAt: new Date(now).toISOString(), model: { provider: 'vercel', model: 'selected/model' } }));
    }
    db.close();
    const jobs = sentinelHealth(d, now).jobs;
    expect(jobs.find(j => j.id === 'default')?.pinnedModel).toBe(false);
    expect(jobs.find(j => j.id === 'selected')?.pinnedModel).toBe(true);
    expect(jobs.find(j => j.id === 'canva-agent')?.pinnedModel).toBe(true);
    expect(jobs.find(j => j.id === 'fixture')?.pinnedModel).toBe(false);
  });
});
