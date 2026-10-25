import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import { db, projectRow } from './platform-db';
import { defaultModelSettings } from './model-routing';

export type AiPolicy = { provider: 'vercel' | 'openrouter'; model: string; strict?: boolean; attemptId?: string };
export type AiScope = { runId: string; projectId?: string; companyId?: string; jobId?: string; stage: string; policy?: AiPolicy };
export const aiScope = new AsyncLocalStorage<AiScope>();
export function setProjectAiPolicy(projectId: string, policy: AiPolicy) {
  db().prepare('INSERT INTO project_ai_policy VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET policy_json=excluded.policy_json').run(projectId, JSON.stringify(policy));
}
export function projectAiPolicy(projectId: string): AiPolicy | undefined {
  const row = db().prepare('SELECT policy_json FROM project_ai_policy WHERE project_id=?').get(projectId) as { policy_json: string } | undefined;
  return row ? JSON.parse(row.policy_json) : undefined;
}
export async function withAiRun<T>(scope: Omit<AiScope, 'runId'>, task: () => Promise<T>): Promise<T> {
  const current = aiScope.getStore();
  if (current && (!scope.projectId || scope.projectId === current.projectId)) return task();
  const runId = crypto.randomUUID();
  db().prepare('INSERT INTO ai_runs(id,project_id,company_id,job_id,attempt_id,stage,started_at,status) VALUES(?,?,?,?,?,?,?,?)')
    .run(runId, scope.projectId ?? null, scope.companyId ?? null, scope.jobId ?? null, scope.policy?.attemptId ?? null, scope.stage, new Date().toISOString(), 'running');
  let status = 'complete';
  try { return await aiScope.run({ ...scope, runId }, task); }
  catch (error) { status = 'failed'; throw error; }
  finally { db().prepare('UPDATE ai_runs SET status=?,finished_at=? WHERE id=?').run(status, new Date().toISOString(), runId); }
}
export function withProjectAi<T>(projectId: string, stage: string, task: () => Promise<T>, jobId?: string) {
  return withAiRun({ projectId, companyId: projectRow(projectId)?.company_id, jobId, stage, policy: projectAiPolicy(projectId) }, task);
}
export function modelFor(provider: 'vercel' | 'openrouter', vision = false) {
  const policy = aiScope.getStore()?.policy;
  if (policy?.strict) return policy.model;
  const settings = defaultModelSettings();
  return provider === 'vercel' ? settings.vercel.model : vision ? settings.openrouter.visionModel : settings.openrouter.model;
}
export function providerEnabled(provider: 'vercel' | 'openrouter') {
  const policy = aiScope.getStore()?.policy;
  return (!policy?.strict || policy.provider === provider) && Boolean(process.env[provider === 'vercel' ? 'AI_GATEWAY_API_KEY' : 'OPENROUTER_API_KEY']);
}
export function fallbackAllowed() { return !aiScope.getStore()?.policy?.strict; }
