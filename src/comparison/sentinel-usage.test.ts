import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sentinelUsage } from './sentinel-usage';
import { summarizeUsage, usageCostLabel, usageDay, type GenerationUsage, type UsageCall } from './sentinel-usage-model';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const call = (id: string, costUsd: number | null = .2, costSource = 'reported'): UsageCall => ({ id, model: 'test/model', provider: 'vercel', stage: 'design', startedAt: '2026-10-24T20:00:00Z', durationMs: 50, outcome: 'complete', inputTokens: 100, outputTokens: 20, cachedTokens: null, reasoningTokens: null, costUsd, costSource, incomplete: costUsd === null });
const generation = (calls: UsageCall[] = []): GenerationUsage => ({ id: 'g', source: 'ola', companyId: 'co', companyName: 'Example', brief: 'An announcement', format: 'poster', status: 'complete', createdAt: '2026-10-24T20:00:00Z', fixture: false, models: [], calls });
function dirs() { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-usage-')); roots.push(root); return { lab: path.join(root, 'lab'), source: path.join(root, 'source') }; }
function database(file: string) { fs.mkdirSync(path.dirname(file), { recursive: true }); return new DatabaseSync(file); }
function platform(file: string, withUsage = true) {
  const db = database(file);
  db.exec(`CREATE TABLE companies(id TEXT,name TEXT); CREATE TABLE projects(id TEXT,company_id TEXT,brief TEXT,content_type TEXT,status TEXT,created_at TEXT);`);
  if (withUsage) db.exec(`CREATE TABLE ai_runs(id TEXT,project_id TEXT,company_id TEXT,attempt_id TEXT,stage TEXT,started_at TEXT,status TEXT); CREATE TABLE ai_calls(id TEXT,run_id TEXT,project_id TEXT,attempt_id TEXT,record_json TEXT);`);
  return db;
}

describe('Sentinel usage accounting', () => {
  it('keeps zero, missing billing, and estimates distinct', () => {
    expect(summarizeUsage([generation()]).costUsd).toBeNull();
    expect(usageCostLabel([generation()])).toBe('Unavailable');
    expect(usageCostLabel([generation([call('free', 0)])])).toBe('Reported · $0.00');
    const g = generation([call('reported'), call('estimated', .1, 'estimated'), call('pending', null, 'pending')]);
    expect(summarizeUsage([g])).toMatchObject({ calls: 3, inputTokens: 300, outputTokens: 60, reportedUsd: .2, estimatedUsd: .1, missingCosts: 1, incomplete: true });
    expect(summarizeUsage([g]).costUsd).toBeCloseTo(.3);
    expect(usageCostLabel([g])).toMatch(/^Partial/);
    expect(usageCostLabel([{ ...generation(), fixture: true }])).toBe('Fixture · $0');
  });

  it('joins all pipeline calls to one attempt and uses its frozen company', () => {
    const d = dirs(), lab = database(path.join(d.lab, 'comparisons.sqlite'));
    lab.exec('CREATE TABLE cases(id TEXT,input_json TEXT); CREATE TABLE attempts(case_id TEXT,record_json TEXT);');
    lab.prepare('INSERT INTO cases VALUES(?,?)').run('case', JSON.stringify({ mode: 'ola', brief: 'Shared brief', companyName: 'Multiple companies', format: 'poster', fixture: false, companies: [{ companyId: 'original-co', companyName: 'Frozen brand' }] }));
    lab.prepare('INSERT INTO attempts VALUES(?,?)').run('case', JSON.stringify({ id: 'attempt', caseId: 'case', contenderId: 'company-original-co', engine: 'ola', projectId: 'p1', createdAt: '2026-10-24T20:00:00Z', version: 1, status: 'complete' }));
    lab.close();
    const db = platform(path.join(d.lab, 'ola', 'platform.sqlite'));
    db.prepare('INSERT INTO companies VALUES(?,?)').run('cloned-co', 'Cloned company');
    db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('p1', 'cloned-co', 'Internal project brief', 'poster', 'complete', '2026-10-24T20:00:00Z');
    for (const id of ['r1', 'r2']) { db.prepare('INSERT INTO ai_runs VALUES(?,?,?,?,?,?,?)').run(id, 'p1', 'cloned-co', 'attempt', 'design', '2026-10-24T20:00:00Z', 'complete'); db.prepare('INSERT INTO ai_calls VALUES(?,?,?,?,?)').run(id, id, 'p1', 'attempt', JSON.stringify(call(id))); }
    db.close();
    const result = sentinelUsage(d);
    expect(result.warnings).toEqual([]);
    expect(result.generations).toHaveLength(1);
    expect(result.generations[0]).toMatchObject({ companyId: 'original-co', companyName: 'Frozen brand', source: 'comparison', caseId: 'case' });
    expect(summarizeUsage(result.generations)).toMatchObject({ calls: 2, generations: 1, costUsd: .4, inputTokens: 200 });
  });

  it('reads production projects and background tasks, including legacy projects without accounting', () => {
    const d = dirs(), db = platform(path.join(d.source, 'platform.sqlite'));
    db.prepare('INSERT INTO companies VALUES(?,?)').run('co', 'Production brand');
    db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('p', 'co', 'Launch a product', 'carousel', 'complete', '2026-10-24T20:00:00Z');
    db.prepare('INSERT INTO ai_runs VALUES(?,?,?,?,?,?,?)').run('bg', null, 'co', null, 'brand-analysis', '2026-10-24T20:00:00Z', 'complete');
    db.prepare('INSERT INTO ai_calls VALUES(?,?,?,?,?)').run('c', 'bg', null, null, JSON.stringify(call('c'))); db.close();
    const data = sentinelUsage(d);
    expect(data.generations).toHaveLength(2);
    expect(summarizeUsage(data.generations)).toMatchObject({ untracked: 1, calls: 1, costUsd: .2 });
    expect(data.generations.every(g => g.companyName === 'Production brand')).toBe(true);
    expect(JSON.stringify(data)).not.toContain(d.source);
  });

  it('keeps unknown token counts visible in summaries', () => {
    const c = { ...call('unknown'), inputTokens: null };
    expect(summarizeUsage([generation([c])])).toMatchObject({ missingTokens: 1, inputTokens: 0, outputTokens: 20 });
  });

  it('does not create or migrate missing or legacy production stores', () => {
    const d = dirs(); expect(sentinelUsage(d).generations).toEqual([]); expect(fs.existsSync(d.source)).toBe(false);
    const file = path.join(d.source, 'platform.sqlite'), db = platform(file, false);
    db.prepare('INSERT INTO companies VALUES(?,?)').run('co', 'Legacy brand');
    db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('p', 'co', 'Old generation', 'poster', 'complete', '2026-10-24T20:00:00Z'); db.close();
    expect(sentinelUsage(d).generations).toHaveLength(1);
    const check = new DatabaseSync(file, { readOnly: true }); expect(check.prepare("SELECT name FROM sqlite_master WHERE name='ai_calls'").get()).toBeUndefined(); check.close();
  });

  it('groups dates in the workspace timezone', () => { expect(usageDay('2026-10-24T20:00:00Z')).toBe('2026-10-25'); });
});
