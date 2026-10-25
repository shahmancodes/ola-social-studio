import crypto from 'node:crypto';
import { generateText as sdkGenerateText } from 'ai';
import { callModel as sdkCallModel } from '@openrouter/agent';
import { aiScope } from './ai-execution';
import { db } from './platform-db';

type Provider = 'vercel' | 'openrouter';
type Pricing = { input: number; output: number; cached?: number; cacheWrite?: number; source: string; capturedAt: string };
export type CallUsage = {
  id: string; provider: Provider; requestedModel: string; model: string; generationId?: string;
  stage: string; startedAt: string; durationMs: number; outcome: 'pending' | 'complete' | 'failed';
  inputTokens: number | null; outputTokens: number | null; cachedTokens: number | null;
  cacheWriteTokens: number | null; reasoningTokens: number | null;
  costUsd: number | null; costSource: 'reported' | 'estimated' | 'pending' | 'unavailable';
  incomplete: boolean; pricing?: Pricing; reasoning: 'provider-default';
};
export type UsageSummary = { calls: number; inputTokens: number; outputTokens: number; costUsd: number | null; reportedUsd: number; estimatedUsd: number; pending: number; unavailable: number; incomplete: boolean; records: CallUsage[] };
const numeric = (x: unknown): number | undefined => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : undefined;
const prices = new Map<string, Pricing>();
const catalogUntil = new Map<Provider, number>();
export function fallbackPricing(model: string, at = new Date()): Pricing | undefined {
  const rates: Record<string, [number, number, number, number]> = {
    'openai/gpt-6-luna': [.1, .5, .01, .125], 'openai/gpt-6.1-sol': [2, 10, .1, 2.5],
    'anthropic/claude-sonnet-5.5': [2, 10, .1, 2.5], 'anthropic/claude-opus-5.5': [4, 20, .2, 5],
    'google/gemini-4-argon': at < new Date('2026-12-01T00:00:00Z') ? [2, 10, .1, 2] : [4, 20, .2, 4],
  };
  const rate = rates[model];
  return rate ? { input: rate[0] / 1e6, output: rate[1] / 1e6, cached: rate[2] / 1e6, cacheWrite: rate[3] / 1e6, source: 'fallback-rates-2026-10-24', capturedAt: at.toISOString() } : undefined;
}
export async function pricingFor(provider: Provider, model: string): Promise<Pricing | undefined> {
  const key = `${provider}:${model}`;
  if ((catalogUntil.get(provider) ?? 0) < Date.now()) {
    catalogUntil.set(provider, Date.now() + 10 * 60_000);
    try {
      const response = await fetch(provider === 'vercel' ? 'https://ai-gateway.vercel.sh/v1/models' : 'https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(4000) });
      if (response.ok) {
        const body = await response.json();
        for (const item of body.data ?? []) {
          const p = item.pricing, input = numeric(p?.input ?? p?.prompt), output = numeric(p?.output ?? p?.completion);
          if (input !== undefined && output !== undefined) prices.set(`${provider}:${item.id}`, { input, output, cached: numeric(p.cachedInputTokens ?? p.input_cache_read), cacheWrite: numeric(p.cacheCreationInputTokens ?? p.input_cache_write), source: `${provider}-catalog`, capturedAt: new Date().toISOString() });
        }
      }
    } catch { /* A billing metadata outage must not stop generation. */ }
  }
  return prices.get(key) ?? fallbackPricing(model);
}
export function estimateCost(usage: Pick<CallUsage, 'inputTokens' | 'outputTokens' | 'cachedTokens' | 'cacheWriteTokens'>, pricing?: Pricing, model = '') {
  if (!pricing || usage.inputTokens === null || usage.outputTokens === null) return null;
  const cached = usage.cachedTokens ?? 0, written = usage.cacheWriteTokens ?? 0;
  const long = model.startsWith('openai/gpt-6') && usage.inputTokens > 272000;
  return (Math.max(0, usage.inputTokens - cached - written) * pricing.input + cached * (pricing.cached ?? pricing.input) + written * (pricing.cacheWrite ?? pricing.input)) * (long ? 2 : 1) + usage.outputTokens * pricing.output * (long ? 1.5 : 1);
}
function startCall(provider: Provider, model: string, pricing?: Pricing): CallUsage {
  const record: CallUsage = { id: crypto.randomUUID(), provider, requestedModel: model, model, stage: aiScope.getStore()?.stage ?? 'generation', startedAt: new Date().toISOString(), durationMs: 0, outcome: 'pending', inputTokens: null, outputTokens: null, cachedTokens: null, cacheWriteTokens: null, reasoningTokens: null, costUsd: null, costSource: 'pending', incomplete: true, pricing, reasoning: 'provider-default' };
  saveCall(record); return record;
}
export function saveCall(record: CallUsage) {
  const scope = aiScope.getStore();
  if (!scope) return;
  db().prepare(`INSERT INTO ai_calls(id,run_id,project_id,attempt_id,provider,model,generation_id,record_json,reconcile_after) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET model=excluded.model,generation_id=excluded.generation_id,record_json=excluded.record_json,reconcile_after=excluded.reconcile_after`)
    .run(record.id, scope.runId, scope.projectId ?? null, scope.policy?.attemptId ?? null, record.provider, record.model, record.generationId ?? null, JSON.stringify(record), record.generationId && record.costSource !== 'reported' ? new Date(Date.now() + 5000).toISOString() : null);
}
// Usage aliases differ between the AI SDK, OpenRouter chat, and agent hooks.
export function finishCall(record: CallUsage, usage: any, metadata: any = {}, outcome: CallUsage['outcome'] = 'complete', tools = false) {
  const gateway = metadata.gateway ?? {}, u = usage ?? {};
  record.inputTokens = numeric((typeof u.inputTokens === 'object' ? u.inputTokens?.total : u.inputTokens) ?? u.prompt_tokens) ?? null;
  record.outputTokens = numeric((typeof u.outputTokens === 'object' ? u.outputTokens?.total : u.outputTokens) ?? u.completion_tokens) ?? null;
  record.cachedTokens = numeric(u.inputTokens?.cacheRead ?? u.inputTokenDetails?.cacheReadTokens ?? u.prompt_tokens_details?.cached_tokens ?? u.cachedTokens) ?? null;
  record.cacheWriteTokens = numeric(u.inputTokens?.cacheWrite ?? u.inputTokenDetails?.cacheWriteTokens ?? u.prompt_tokens_details?.cache_write_tokens) ?? null;
  record.reasoningTokens = numeric(u.outputTokens?.reasoning ?? u.outputTokenDetails?.reasoningTokens ?? u.completion_tokens_details?.reasoning_tokens ?? u.reasoningTokens) ?? null;
  record.generationId = gateway.generationId ?? metadata.generationId ?? record.generationId;
  record.model = gateway.routing?.canonicalSlug ?? metadata.model ?? record.model;
  const billed = numeric(gateway.cost ?? u.cost);
  record.costUsd = billed ?? estimateCost(record, record.pricing, record.model);
  record.costSource = billed !== undefined ? 'reported' : record.costUsd !== null ? 'estimated' : record.generationId ? 'pending' : 'unavailable';
  record.incomplete = billed === undefined && (tools || record.costUsd === null || ((record.cachedTokens ?? 0) > 0 && record.pricing?.cached === undefined) || ((record.cacheWriteTokens ?? 0) > 0 && record.pricing?.cacheWrite === undefined));
  record.outcome = outcome; record.durationMs = Date.now() - Date.parse(record.startedAt);
  saveCall(record);
}

// Preserve the SDK's generic public signatures while instrumenting its steps.
export const generateText: typeof sdkGenerateText = (async (options: any) => {
  const scope = aiScope.getStore();
  if (!scope) return sdkGenerateText(options);
  const model = options.model.modelId ?? options.model.id ?? String(options.model);
  const pricing = await pricingFor('vercel', model);
  const instrumented = typeof options.model.doGenerate === 'function';
  let calls = 0;
  // Instrument the transport boundary, so SDK retries and tool-loop rounds are
  // each recorded, including requests which fail before a step completes.
  const languageModel = instrumented ? new Proxy(options.model, { get(target, property) {
    if (property === 'doGenerate') return async (...args: any[]) => aiScope.run(scope, async () => {
      calls++;
      const record = startCall('vercel', model, pricing);
      try {
        const result = await target.doGenerate(...args);
        finishCall(record, result.usage, { ...result.providerMetadata, model: result.response?.modelId, generationId: result.response?.id?.startsWith('gen_') ? result.response.id : undefined }, 'complete', Boolean(options.tools));
        return result;
      } catch (error: any) {
        finishCall(record, error.usage, { ...error.providerMetadata, generationId: error.generationId }, 'failed', Boolean(options.tools)); throw error;
      }
    });
    const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
  } }) : options.model;
  const capture = (step: any) => aiScope.run(scope, () => {
    calls++; const record = startCall('vercel', model, pricing);
    finishCall(record, step.usage, { ...step.providerMetadata, model: step.response?.modelId, generationId: step.response?.id?.startsWith('gen_') ? step.response.id : undefined }, 'complete', Boolean(step.toolCalls?.length));
  });
  try {
    const result = await sdkGenerateText({ ...options, model: languageModel, onStepFinish: async (step: any) => { if (!instrumented) capture(step); await options.onStepFinish?.(step); } });
    if (!calls) {
      if (result.steps?.length) for (const step of result.steps) capture(step);
      else capture(result);
    }
    return result;
  } catch (error: any) {
    if (!calls) { const record = startCall('vercel', model, pricing); finishCall(record, error.usage, { ...error.providerMetadata, generationId: error.generationId }, 'failed', Boolean(options.tools)); }
    throw error;
  }
}) as typeof sdkGenerateText;

export const aiFetch: typeof fetch = async (input, init) => {
  if (!aiScope.getStore()) return fetch(input, init);
  const request = JSON.parse(String(init?.body ?? '{}'));
  const record = startCall('openrouter', request.model ?? 'unknown', await pricingFor('openrouter', request.model));
  try {
    const response = await fetch(input, { ...init, body: JSON.stringify({ ...request, usage: { include: true } }) });
    let body: any = {}; try { body = await response.clone().json(); } catch { /* Preserve the response for the caller. */ }
    finishCall(record, body.usage, { generationId: body.id, model: body.model }, response.ok ? 'complete' : 'failed', Boolean(request.tools?.length));
    return response;
  } catch (error) { finishCall(record, undefined, {}, 'failed'); throw error; }
};

export const callModel: typeof sdkCallModel = ((client: any, options: any) => {
  const scope = aiScope.getStore();
  if (!scope) return sdkCallModel(client, options);
  let seen = false; let settled = false;
  const price = pricingFor('openrouter', options.model);
  const pending = startCall('openrouter', options.model, fallbackPricing(options.model));
  const result = sdkCallModel(client, { ...options, hooks: { ...options.hooks, PostModelCall: [...(options.hooks?.PostModelCall ?? []), { handler: (call: any) => aiScope.run(scope, async () => {
    const record = seen ? startCall('openrouter', options.model, pending.pricing) : pending; seen = true;
    record.pricing = await price;
    finishCall(record, call.usage, { generationId: call.responseId, model: call.model }, 'complete', Boolean(options.tools?.length));
  }) }] } });
  const original = result.getText.bind(result);
  result.getText = async () => {
    try { return await original(); }
    catch (error) { if (seen && !settled) aiScope.run(scope, () => finishCall(startCall('openrouter', options.model, pending.pricing), undefined, {}, 'failed', true)); throw error; }
    finally { if (!seen && !settled) aiScope.run(scope, () => finishCall(pending, undefined, {}, 'failed', true)); settled = true; }
  };
  return result;
}) as typeof sdkCallModel;

export function usageSummary(filter: { projectId?: string; attemptId?: string; runId?: string }): UsageSummary {
  const [column, value] = filter.attemptId ? ['attempt_id', filter.attemptId] : filter.runId ? ['run_id', filter.runId] : ['project_id', filter.projectId];
  const records = value ? (db().prepare(`SELECT record_json FROM ai_calls WHERE ${column}=? ORDER BY rowid`).all(value) as { record_json: string }[]).map(r => JSON.parse(r.record_json) as CallUsage) : [];
  const known = records.filter(r => r.costUsd !== null);
  return { calls: records.length, inputTokens: records.reduce((s, r) => s + (r.inputTokens ?? 0), 0), outputTokens: records.reduce((s, r) => s + (r.outputTokens ?? 0), 0), costUsd: known.length ? known.reduce((s, r) => s + r.costUsd!, 0) : null,
    reportedUsd: known.filter(r => r.costSource === 'reported').reduce((s, r) => s + r.costUsd!, 0), estimatedUsd: known.filter(r => r.costSource === 'estimated').reduce((s, r) => s + r.costUsd!, 0), pending: records.filter(r => r.costSource === 'pending').length, unavailable: records.filter(r => r.costSource === 'unavailable').length, incomplete: !records.length || records.some(r => r.incomplete), records };
}

export async function reconcileUsage() {
  const rows = db().prepare('SELECT id,provider,generation_id,record_json,reconcile_tries FROM ai_calls WHERE reconcile_after<=? AND reconcile_tries<5 LIMIT 3').all(new Date().toISOString()) as Array<{ id: string; provider: Provider; generation_id: string; record_json: string; reconcile_tries: number }>;
  await Promise.allSettled(rows.map(async row => {
    db().prepare('UPDATE ai_calls SET reconcile_tries=reconcile_tries+1,reconcile_after=? WHERE id=?').run(new Date(Date.now() + 30000 * 2 ** row.reconcile_tries).toISOString(), row.id);
    const url = row.provider === 'vercel' ? 'https://ai-gateway.vercel.sh/v1/generation' : 'https://openrouter.ai/api/v1/generation';
    const key = process.env[row.provider === 'vercel' ? 'AI_GATEWAY_API_KEY' : 'OPENROUTER_API_KEY'];
    if (!key) return;
    const response = await fetch(`${url}?id=${encodeURIComponent(row.generation_id)}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4000) });
    if (!response.ok) return;
    const body = await response.json(), data = body.data ?? body;
    const cost = numeric(data.totalCost ?? data.total_cost ?? data.usage);
    if (cost === undefined) return;
    const record = JSON.parse(row.record_json) as CallUsage;
    record.costUsd = cost; record.costSource = 'reported'; record.incomplete = false;
    record.inputTokens = numeric(data.promptTokens ?? data.tokens_prompt ?? data.native_tokens_prompt) ?? record.inputTokens;
    record.outputTokens = numeric(data.completionTokens ?? data.tokens_completion ?? data.native_tokens_completion) ?? record.outputTokens;
    record.cachedTokens = numeric(data.cachedTokens ?? data.cache_read_tokens) ?? record.cachedTokens;
    record.reasoningTokens = numeric(data.reasoningTokens ?? data.native_tokens_reasoning) ?? record.reasoningTokens;
    record.model = data.model ?? record.model;
    db().prepare('UPDATE ai_calls SET record_json=?,reconcile_after=NULL WHERE id=?').run(JSON.stringify(record), row.id);
  }));
}


/** Recover job-owned spans without charging worker downtime as generation time. */
export function recoverInterruptedRuns(force = false) {
  const database = db();
  const runs = database.prepare("SELECT id,started_at FROM ai_runs WHERE status='running' AND job_id IS NOT NULL AND project_id IS NOT NULL AND (? OR NOT EXISTS(SELECT 1 FROM jobs WHERE jobs.id=ai_runs.job_id AND jobs.status='running' AND jobs.lease_until>?))").all(force ? 1 : 0, new Date().toISOString()) as {id:string;started_at:string}[];
  for (const run of runs) {
    const calls = database.prepare('SELECT id,record_json FROM ai_calls WHERE run_id=?').all(run.id) as {id:string;record_json:string}[];
    let finished = Date.parse(run.started_at);
    for (const call of calls) {
      const record = JSON.parse(call.record_json) as CallUsage;
      finished = Math.max(finished, Date.parse(record.startedAt) + record.durationMs);
      if (record.outcome === 'pending') {
        record.outcome = 'failed'; record.incomplete = true;
        if (!record.generationId) record.costSource = 'unavailable';
        database.prepare('UPDATE ai_calls SET record_json=? WHERE id=?').run(JSON.stringify(record), call.id);
      }
    }
    database.prepare("UPDATE ai_runs SET status='interrupted',finished_at=? WHERE id=?").run(new Date(finished).toISOString(), run.id);
  }
}
