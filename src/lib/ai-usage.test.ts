import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const mocks = vi.hoisted(() => ({ generate: vi.fn(), agent: vi.fn() }));
vi.mock('ai', () => ({ generateText: mocks.generate }));
vi.mock('@openrouter/agent', () => ({ callModel: mocks.agent }));
let usage: typeof import('./ai-usage'), execution: typeof import('./ai-execution'), database: typeof import('./platform-db');
let root: string;
beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ola-usage-'));
  vi.stubEnv('OLA_DATA_DIR', root);
  usage = await import('./ai-usage'); execution = await import('./ai-execution'); database = await import('./platform-db');
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
afterAll(() => { database.db().close(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function offline() { vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline'))); }
async function run(task: () => Promise<unknown>, projectId = crypto.randomUUID()) {
  await execution.withAiRun({ projectId, stage: 'test' }, task); return usage.usageSummary({projectId});
}
describe('durable usage accounting', () => {
  it('counts tool rounds once, rather than also counting aggregate usage', async () => {
    offline();
    const steps = [1,2].map(i=>({usage:{inputTokens:100,outputTokens:20},providerMetadata:{gateway:{cost:.001*i,generationId:`gen_${i}`}},toolCalls:i===1?[{}]:[]}));
    mocks.generate.mockImplementation(async options => { for(const step of steps) await options.onStepFinish(step); return {steps,usage:{inputTokens:200,outputTokens:40}}; });
    const summary=await run(()=>usage.generateText({model:{id:'openai/gpt-6-luna'} as any,prompt:'brief'}));
    expect(summary.calls).toBe(2);expect(summary.costUsd).toBeCloseTo(.003);expect(summary.inputTokens).toBe(200);expect(summary.incomplete).toBe(false);
  });
  it('records every transport retry, including a failed request with unknown charges', async()=>{
    offline();const error=new Error('temporary transport failure');
    const model={modelId:'openai/gpt-6-luna',doGenerate:vi.fn().mockRejectedValueOnce(error).mockResolvedValue({usage:{inputTokens:{total:100,cacheRead:20},outputTokens:{total:10,reasoning:4}},providerMetadata:{gateway:{cost:.003}}})};
    mocks.generate.mockImplementation(async options=>{try{await options.model.doGenerate({});}catch{}return options.model.doGenerate({});});
    const summary=await run(()=>usage.generateText({model:model as any,prompt:'brief'}));
    expect(summary.calls).toBe(2);expect(summary.unavailable).toBe(1);expect(summary.incomplete).toBe(true);expect(summary.records[1].reasoningTokens).toBe(4);expect(summary.records[1].cachedTokens).toBe(20);
  });
  it('keeps paid usage when JSON parsing fails after a response', async()=>{
    offline();mocks.generate.mockResolvedValue({text:'invalid json',usage:{inputTokens:1000,outputTokens:50},providerMetadata:{gateway:{cost:.04}}});
    const id=crypto.randomUUID();await expect(execution.withAiRun({projectId:id,stage:'draft'},async()=>{const result=await usage.generateText({model:{id:'openai/gpt-6-luna'} as any,prompt:'brief'});JSON.parse(result.text);})).rejects.toThrow();
    expect(usage.usageSummary({projectId:id}).costUsd).toBe(.04);
  });
  it('estimates cache reads/writes without charging reasoning tokens twice',()=>{
    const pricing=usage.fallbackPricing('openai/gpt-6.1-sol')!;
    expect(usage.estimateCost({inputTokens:1000,outputTokens:200,cachedTokens:400,cacheWriteTokens:100},pricing)).toBeCloseTo(.00329);
    expect(usage.estimateCost({inputTokens:null,outputTokens:200,cachedTokens:0,cacheWriteTokens:0},pricing)).toBeNull();
    expect(usage.fallbackPricing('unknown/model')).toBeUndefined();
    expect(usage.fallbackPricing('google/gemini-4-argon',new Date('2026-12-01'))!.input).toBe(4/1e6);
  });
  it('uses catalog prices and preserves the pricing snapshot',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{id:'catalog/model',pricing:{prompt:'0.000002',completion:'0.00001',input_cache_read:'0.0000001'}}]}))));
    const pricing=await usage.pricingFor('openrouter','catalog/model');expect(pricing?.source).toBe('openrouter-catalog');expect(pricing?.input).toBe(.000002);
  });
  it('records OpenRouter cost before the consumer reads or parses its content',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'gen_router',model:'actual/model',usage:{prompt_tokens:120,completion_tokens:30,cost:.009},choices:[{message:{content:'bad'}}]}))));
    const summary=await run(async()=>{const response=await usage.aiFetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'catalog/model'})});expect((await response.json()).choices[0].message.content).toBe('bad');});
    expect(summary.costUsd).toBe(.009);expect(summary.records[0].requestedModel).toBe('catalog/model');expect(summary.records[0].model).toBe('actual/model');
  });
  it('captures agent tool-round usage through per-call hooks',async()=>{
    offline();mocks.agent.mockImplementation((_client,options)=>({getText:async()=>{for(let i=0;i<3;i++)for(const h of options.hooks.PostModelCall)await h.handler({responseId:`agent_${i}`,model:'catalog/model',usage:{inputTokens:20,outputTokens:10,cost:.002}});return 'done';}}));
    const summary=await run(async()=>{await usage.callModel({} as any,{model:'catalog/model',input:'brief'}).getText();});
    expect(summary.calls).toBe(3);expect(summary.costUsd).toBe(.006);
  });
  it('reconciles delayed bills idempotently without adding a second charge',async()=>{
    offline();mocks.generate.mockResolvedValue({text:'ok',usage:{inputTokens:100,outputTokens:10},providerMetadata:{gateway:{generationId:'gen_delayed'}}});
    const id=crypto.randomUUID();await run(()=>usage.generateText({model:{id:'openai/gpt-6-luna'} as any,prompt:'brief'}),id);
    database.db().prepare("UPDATE ai_calls SET reconcile_after='2000-01-01' WHERE project_id=?").run(id);
    vi.stubEnv('AI_GATEWAY_API_KEY','test');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{total_cost:.012}}))));
    await usage.reconcileUsage();await usage.reconcileUsage();const summary=usage.usageSummary({projectId:id});expect(summary.calls).toBe(1);expect(summary.costUsd).toBe(.012);expect(summary.records[0].costSource).toBe('reported');
  });
  it('stores zero as reported free usage while missing usage remains unavailable',async()=>{
    offline();mocks.generate.mockResolvedValueOnce({text:'ok',providerMetadata:{gateway:{cost:0}}}).mockResolvedValueOnce({text:'ok'});
    const free=await run(()=>usage.generateText({model:{id:'unknown'} as any,prompt:'brief'}));const missing=await run(()=>usage.generateText({model:{id:'unknown'} as any,prompt:'brief'}));
    expect(free.costUsd).toBe(0);expect(missing.costUsd).toBeNull();expect(missing.incomplete).toBe(true);
  });
});
describe('persistent per-project execution policy',()=>{
  it('isolates concurrent projects, restores policies for later jobs, and pins vision too',async()=>{
    execution.setProjectAiPolicy('sol-project',{provider:'vercel',model:'openai/gpt-6.1-sol',strict:true,attemptId:'attempt-sol'});
    execution.setProjectAiPolicy('sonnet-project',{provider:'openrouter',model:'anthropic/claude-sonnet-5.5',strict:true,attemptId:'attempt-sonnet'});
    vi.stubEnv('AI_GATEWAY_API_KEY','test');vi.stubEnv('OPENROUTER_API_KEY','test');
    const results=await Promise.all(['sol-project','sonnet-project'].map(id=>execution.withProjectAi(id,'test',async()=>{await Promise.resolve();return {model:execution.modelFor('vercel',true),vercel:execution.providerEnabled('vercel'),fallback:execution.fallbackAllowed()};})));
    expect(results).toEqual([{model:'openai/gpt-6.1-sol',vercel:true,fallback:false},{model:'anthropic/claude-sonnet-5.5',vercel:false,fallback:false}]);
    await execution.withProjectAi('sol-project','later-job',async()=>expect(execution.modelFor('openrouter',true)).toBe('openai/gpt-6.1-sol'));
    expect(execution.aiScope.getStore()).toBeUndefined();
  });
});

it('never falls back to another model for a pinned comparison policy',async()=>{
  const {withProviderFallback}=await import('./ai-provider');const vercel=vi.fn().mockRejectedValue(new Error('selected model unavailable')),router=vi.fn().mockResolvedValue({value:'wrong model'});
  vi.stubEnv('AI_GATEWAY_API_KEY','test');vi.stubEnv('OPENROUTER_API_KEY','test');
  await expect(execution.withAiRun({stage:'comparison',policy:{provider:'vercel',model:'openai/gpt-6.1-sol',strict:true}},()=>withProviderFallback(vercel,router,{vercel:'openai/gpt-6.1-sol',openrouter:'other/model'}))).rejects.toThrow('selected model unavailable');
  expect(router).not.toHaveBeenCalled();
  const direct=vi.fn().mockResolvedValue({value:'selected'});await execution.withAiRun({stage:'comparison',policy:{provider:'openrouter',model:'anthropic/claude-sonnet-5.5',strict:true}},()=>withProviderFallback(vercel,direct,{vercel:'unused',openrouter:'anthropic/claude-sonnet-5.5'}));expect(direct).toHaveBeenCalledOnce();expect(vercel).toHaveBeenCalledOnce();
});

it('recovers interrupted job accounting without counting downtime or inventing a free call',()=>{
  const runId=crypto.randomUUID(),callId=crypto.randomUUID(),started='2026-01-01T00:00:00.000Z';
  database.db().prepare('INSERT INTO ai_runs(id,project_id,job_id,stage,started_at,status) VALUES(?,?,?,?,?,?)').run(runId,'interrupted-project','old-job','generation',started,'running');
  const record={id:callId,provider:'vercel',requestedModel:'openai/gpt-6-luna',model:'openai/gpt-6-luna',startedAt:started,durationMs:0,outcome:'pending',costUsd:null,costSource:'pending',incomplete:true};
  database.db().prepare('INSERT INTO ai_calls(id,run_id,project_id,provider,model,record_json) VALUES(?,?,?,?,?,?)').run(callId,runId,'interrupted-project','vercel',record.model,JSON.stringify(record));
  usage.recoverInterruptedRuns(true);
  expect(database.db().prepare('SELECT status,finished_at FROM ai_runs WHERE id=?').get(runId)).toEqual({status:'interrupted',finished_at:started});
  const summary=usage.usageSummary({projectId:'interrupted-project'});expect(summary.costUsd).toBeNull();expect(summary.unavailable).toBe(1);
});
