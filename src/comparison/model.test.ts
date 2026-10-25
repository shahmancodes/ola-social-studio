import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Attempt } from './types';
const mocks=vi.hoisted(()=>({events:vi.fn(),save:vi.fn(),generate:vi.fn(),gateway:vi.fn(()=>((id:string)=>({id})))}));
vi.mock('./store',()=>({event:mocks.events,saveAttempt:mocks.save}));
vi.mock('ai',()=>({generateText:mocks.generate,createGateway:mocks.gateway,Output:{json:()=>({type:'json'})}}));
import { modelJson } from './model';
const attempt=(provider:'openrouter'|'vercel'):Attempt=>({id:'a',caseId:'c',engine:'canva-agent',version:1,status:'running',stage:'Planning',createdAt:'now',activeMs:0,model:{provider,model:'selected/model'},fingerprint:'code',inputHash:'input',state:{},events:[]});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});
describe('explicit model selection',()=>{
  it('sends exactly the selected OpenRouter model and records provider usage',async()=>{
    vi.stubEnv('OPENROUTER_API_KEY','test');const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'{"brief":"planned"}'}}],usage:{prompt_tokens:120,completion_tokens:30}})));vi.stubGlobal('fetch',fetch);
    const a=attempt('openrouter');expect(await modelJson(a,'same brief',[],new AbortController().signal)).toEqual({brief:'planned'});
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('selected/model');expect(mocks.events.mock.calls.at(-1)?.[2].usage).toEqual({prompt_tokens:120,completion_tokens:30});expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('does not use another provider after the selected model fails',async()=>{
    vi.stubEnv('OPENROUTER_API_KEY','test');vi.stubEnv('AI_GATEWAY_API_KEY','test');const fetch=vi.fn().mockResolvedValue(new Response('{}',{status:404}));vi.stubGlobal('fetch',fetch);
    await expect(modelJson(attempt('openrouter'),'brief',[],new AbortController().signal)).rejects.toThrow(/no fallback/);expect(fetch).toHaveBeenCalledTimes(1);expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('uses the explicit Vercel model and enforces the model-turn ceiling',async()=>{
    vi.stubEnv('AI_GATEWAY_API_KEY','test');mocks.generate.mockResolvedValue({text:'{"brief":"planned"}',usage:{inputTokens:12,outputTokens:3}});const a=attempt('vercel');
    await modelJson(a,'brief',[],new AbortController().signal);expect(mocks.generate.mock.calls[0][0].model).toEqual({id:'selected/model'});expect(mocks.generate.mock.calls[0][0].output).toEqual({type:'json'});
    a.state.modelTurns=12;await expect(modelJson(a,'brief',[],new AbortController().signal)).rejects.toThrow(/12-turn/);expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});
