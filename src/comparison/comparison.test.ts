import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import JSZip from 'jszip';
import { brandedGenerationArgs, editSafetyIssues } from './canva-contract';
import { canvaQuotaRejection } from './canva-quota';
import type { Attempt, SharedInput } from './types';
import type { CanvaClient } from './canva';
const mocks=vi.hoisted(()=>({connect:vi.fn(),model:vi.fn(),download:vi.fn()}));
vi.mock('./model',()=>({modelJson:mocks.model}));
// Transport tests own their stored questions; migration/provider behavior has separate coverage.
vi.mock('../lib/pending-clarification',()=>({ensurePendingClarification:vi.fn(async()=>{})}));
vi.mock('./canva',async importOriginal=>({...await importOriginal<typeof import('./canva')>(),connectCanva:mocks.connect,downloadCanva:mocks.download}));
let store:typeof import('./store'),config:typeof import('./config'),canva:typeof import('./canva'),runner:typeof import('./canva-runner'),inputs:typeof import('./inputs'),recovery:typeof import('./recovery');
let root:string,base:SharedInput;
beforeAll(async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'ola-comparison-tests-'));
  vi.stubEnv('COMPARISON_DATA_DIR',path.join(root,'lab'));vi.stubEnv('COMPARISON_SOURCE_DATA_DIR',path.join(root,'source'));vi.stubEnv('OLA_DATA_DIR',path.join(root,'lab','ola'));vi.stubEnv('OLA_DISABLE_MESSAGING','1');vi.stubEnv('OLA_ROOT_DIR',process.cwd());
  fs.mkdirSync(path.join(root,'source'),{recursive:true});
  store=await import('./store');config=await import('./config');canva=await import('./canva');runner=await import('./canva-runner');inputs=await import('./inputs');recovery=await import('./recovery');
  const {BrandSchema}=await import('../lib/platform');
  base={brief:'Create a useful revision carousel.',companyName:'Fixture Academy',brand:BrandSchema.parse({colors:['#6036bb'],voice:'Clear and useful'}),format:'carousel',slideCount:3,model:{provider:'vercel',model:'test/model'},assets:[],fixture:true};
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.clearAllMocks();});
afterAll(()=>{store.labDb().close();vi.unstubAllEnvs();fs.rmSync(root,{recursive:true,force:true});});
function make(engine:Attempt['engine']='canva-direct'){
  const c=store.insertCase(crypto.randomUUID(),structuredClone(base));return {c,a:c.attempts.find(a=>a.engine===engine)!};
}
function client():CanvaClient{
  return {specs:[{name:'create-design',inputSchema:{type:'object',properties:{brief:{type:'string'},format:{type:'string'}},required:['brief']}},{name:'export-design',inputSchema:{type:'object',properties:{format:{type:'string'}}}},{name:'perform-editing-operations',inputSchema:{type:'object'}}],call:vi.fn(async(name)=>{
    if(name==='create-design')return {job_id:'job-1',continuation_token:'secret',polling_policy:{wait_seconds:1}};
    if(name==='get-create-design-async-job')return {status:'completed',result:{design:{id:'owned-design',url:'https://www.canva.com/design/owned-design/edit'}}};
    if(name==='get-design-pages')return {items:[{page_id:'p1',dimensions:{width:1080,height:1920},thumbnail:{url:'https://www.canva.com/thumbnail?token=private'}}]};
    if(name==='get-export-formats')return {formats:{png:{page_numbers:[1]}}};
    if(name==='export-design')return {job:{status:'success',urls:['https://export-download.canva.com/example.png?secret=hidden']}};
    if(name==='start-editing-transaction')return {transaction:{transaction_id:'owned-transaction',status:'open'},elements:[{element_id:'element-1'}]};
    if(name==='perform-editing-operations')return {edit_operation_results:[{status:'success'}]};
    if(name==='commit-editing-transaction')return {transaction:{id:'owned-transaction',status:'committed'}};
    if(name==='cancel-editing-transaction')return {status:'success'};
    throw new Error(`Unexpected tool: ${name}`);
  }),close:vi.fn(async()=>{})};
}
describe('frozen comparisons and independent versions',()=>{
  it('keeps brand metadata out of copy parsing while retaining it in the shared context',async()=>{
    const {sourceBrief,sharedBrief}=await import('./types');const input={...base,brand:{...base.brand,formatRules:'{"Headline":"Style instruction"}'}};
    expect(sourceBrief(input)).toContain(base.brief);expect(sourceBrief(input)).toContain('1080 × 1350');expect(sourceBrief(input)).not.toContain('Brand context');expect(sourceBrief(input)).not.toContain('Style instruction');expect(sharedBrief(input)).toContain('Style instruction');
  });
  it('creates only Ola for an Ola-only batch and pins its model on reruns',()=>{
    const c=store.insertCase(crypto.randomUUID(),{...base,mode:'ola'});expect(c.attempts).toHaveLength(1);
    const a=c.attempts[0];expect(a.engine).toBe('ola');expect(a.model).toEqual(base.model);
    a.status='complete';store.saveAttempt(a);const next=store.newAttempt(c.id,'ola');expect(next.model).toEqual(base.model);
    expect(()=>store.newAttempt(c.id,'canva-direct')).toThrow(/valid contender/);
  });
  it('renders one A4 poster fixture per contender from the same frozen source',async()=>{
    const {runFixture}=await import('./fixtures');const {sharedBrief}=await import('./types');
    const c=store.insertCase(crypto.randomUUID(),{...base,format:'poster',slideCount:9});
    await Promise.all(c.attempts.map(a=>runFixture(a,c.input,new AbortController().signal)));
    for(const a of c.attempts){expect(a.status).toBe('complete');expect(a.result?.pages).toHaveLength(1);expect(a.result?.pages[0]).toMatchObject({width:1240,height:1754});expect(a.events.find(e=>e.kind==='shared-input')?.data).toEqual({inputHash:c.inputHash,brief:sharedBrief(c.input)});}
    expect(mocks.connect).not.toHaveBeenCalled();expect(mocks.model).not.toHaveBeenCalled();
  });
  it('gives all three contenders the same immutable input hash',()=>{const {c}=make();expect(c.attempts).toHaveLength(3);expect(new Set(c.attempts.map(a=>a.inputHash)).size).toBe(1);const original=store.getCase(c.id).input.brief;c.input.brief='changed';expect(store.getCase(c.id).input.brief).toBe(original);});
  it('reruns only Ola while preserving both baselines and rejects duplicate running attempts',()=>{const {c,a}=make('ola');expect(()=>store.newAttempt(c.id,'ola')).toThrow(/active/);a.status='complete';store.saveAttempt(a);const before=store.getCase(c.id).attempts.filter(a=>a.engine!=='ola');const next=store.newAttempt(c.id,'ola');expect(next.version).toBe(2);expect(next.inputHash).toBe(a.inputHash);expect(store.getCase(c.id).attempts.filter(a=>a.engine!=='ola')).toEqual(before);});
  it('does not expose private execution state through the API projection',()=>{const {c,a}=make();a.state={createJob:{continuation_token:'do-not-share'}};store.saveAttempt(a);expect(JSON.stringify(store.publicCase(store.getCase(c.id)))).not.toContain('do-not-share');});
  it('pins an Ola rerun to the chosen baseline brand rules and preserves every earlier attempt',()=>{
    const {c,a}=make('ola');const old={revision:1,createdAt:'before',rules:base.brand.designSystem!,note:'Frozen',sourceCase:c.id};a.brandRules=old;a.status='complete';store.saveAttempt(a);
    const before=store.getCase(c.id).attempts;
    const next=store.newAttempt(c.id,'ola',undefined,{olaBaselineId:a.id});
    expect(next.brandRules).toEqual(old);expect(next.state.baselineAttemptId).toBe(a.id);expect(next.inputHash).toBe(a.inputHash);
    expect(store.getCase(c.id).attempts.filter(x=>x.id!==next.id)).toEqual(before);
  });
  it('copies uploaded bytes and rejects unsupported attachments',async()=>{
    const form=new FormData();form.set('input',JSON.stringify({...base,assetIds:[]}));const bytes=await sharp({create:{width:10,height:10,channels:3,background:'#fff'}}).png().toBuffer();form.set('files',new Blob([new Uint8Array(bytes)],{type:'image/png'}),'logo.png');
    const c=await inputs.createComparison(form);expect(fs.readFileSync(c.input.assets[0].path)).toEqual(bytes);expect(c.input.assets[0].sha256).toBe(store.digest(bytes));
    form.set('files',new Blob(['no'],{type:'text/plain'}),'bad.txt');await expect(inputs.createComparison(form)).rejects.toThrow(/PNG/);
  });
  it('preserves font bytes, provenance and brand font references',async()=>{
    const form=new FormData();form.set('input',JSON.stringify({...base,assetIds:[],uploadMetadata:[{name:'Example.woff2',category:'font',sourceUrl:'https://example.com/font.woff2'}]}));
    const font=Buffer.alloc(64);font.write('wOF2');form.set('files',new Blob([font],{type:'font/woff2'}),'Example.woff2');
    const c=await inputs.createComparison(form);expect(c.input.brand.fontAssetIds).toEqual([c.input.assets[0].id]);expect(fs.readFileSync(c.input.assets[0].path)).toEqual(font);expect(c.input.assets[0].sourceUrl).toBe('https://example.com/font.woff2');
    form.set('files',new Blob(['not a font'],{type:'font/woff2'}),'Example.woff2');await expect(inputs.createComparison(form)).rejects.toThrow(/font file/);
  });
  it('reads original company data without writing to the source database',()=>{
    const file=path.join(root,'source','platform.sqlite');const source=new DatabaseSync(file);source.exec('CREATE TABLE companies(id TEXT,name TEXT,brand_json TEXT);CREATE TABLE assets(id TEXT,company_id TEXT,name TEXT,media_type TEXT,category TEXT,source_url TEXT,rights_note TEXT)');source.prepare('INSERT INTO companies VALUES(?,?,?)').run('source-company','Original',JSON.stringify(base.brand));source.close();
    const before=fs.readFileSync(file);expect(inputs.sourceCatalog()[0].name).toBe('Original');expect(fs.readFileSync(file)).toEqual(before);
  });
});
describe('explicit reusable brand rules',()=>{
  it('snapshots rule revisions for new Ola attempts without changing frozen inputs or Canva',()=>{
    const {c,a}=make('ola');const hash=c.inputHash;
    const rev=store.saveBrandRules(c.id,{family:'grid',bodyScale:1.2},'Make support copy easier to read',0);
    expect(rev.revision).toBe(1);expect(store.getAttempt(a.id).brandRules).toBeUndefined();
    a.status='complete';store.saveAttempt(a);const next=store.newAttempt(c.id,'ola');expect(next.brandRules?.rules.bodyScale).toBe(1.2);expect(next.inputHash).toBe(hash);
    expect(store.getCase(c.id).attempts.filter(a=>a.engine!=='ola').every(a=>!a.brandRules)).toBe(true);
    store.saveBrandRules(c.id,{family:'poster'},'Try a different composition',1);
    expect(store.getAttempt(next.id).brandRules?.revision).toBe(1);
    expect(()=>store.saveBrandRules(c.id,{},'stale edit',1)).toThrow(/changed/);
    expect(store.getCase(c.id).inputHash).toBe(hash);
  });
});
describe('local isolation, secrets, and transport',()=>{
  it('accepts Next-normalized URLs only with the exact incoming Host and same origin',()=>{
    expect(()=>config.assertLocal(new Request('http://localhost:3100/api/cases',{method:'POST',headers:{host:'127.0.0.1:3100',origin:'http://127.0.0.1:3100'}}))).not.toThrow();
    expect(()=>config.assertLocal(new Request('http://127.0.0.1:3100/api/cases',{method:'POST',headers:{host:'127.0.0.1:3100',origin:'https://evil.example'}}))).toThrow(/origin/);
    expect(()=>config.assertLocal(new Request('http://127.0.0.1:3100/api/settings',{headers:{host:'evil.example'}}))).toThrow(/loopback/);
  });
  it('blocks live Canva until permission is configured',()=>{const old=process.env.COMPARISON_CANVA_PERMITTED;delete process.env.COMPARISON_CANVA_PERMITTED;expect(config.canvaBlockReason()).toMatch(/permits|permitted/);if(old)process.env.COMPARISON_CANVA_PERMITTED=old;});
  it('allows the OAuth return navigation while rejecting other cross-site requests',()=>{
    const headers={host:'127.0.0.1:3100','sec-fetch-site':'cross-site','sec-fetch-mode':'navigate'};
    expect(()=>config.assertLocal(new Request('http://localhost:3100/api/canva/callback?code=example&state=example',{headers}))).not.toThrow();
    expect(()=>config.assertLocal(new Request('http://localhost:3100/api/settings',{headers}))).toThrow(/Cross-site/);
    expect(()=>config.assertLocal(new Request('http://localhost:3100/api/canva/callback',{headers:{...headers,'sec-fetch-mode':'cors'}}))).toThrow(/Cross-site/);
    expect(()=>config.assertLocal(new Request('http://localhost:3100/api/canva/callback',{method:'POST',headers:{...headers,origin:'https://www.canva.com'}}))).toThrow(/origin/);
  });
  it('guards outbound messaging even if an isolated message was queued',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const {queueWhatsApp,flushWhatsAppMessages}=await import('../lib/whatsapp');queueWhatsApp('123','should not send');await flushWhatsAppMessages();expect(fetch).not.toHaveBeenCalled();
    const {db}=await import('../lib/platform-db');expect(db().prepare('SELECT COUNT(*) AS n FROM messages').get()).toEqual({n:0});
  });
  it('isolates Ola projects, pauses for clarification, and records the answer before continuing',async()=>{
    vi.stubEnv('AI_GATEWAY_API_KEY','test-only');
    const {a}=make('ola');const {startOla,runOla}=await import('./ola-runner');
    const sourceFile=path.join(root,'source','platform.sqlite');const before=fs.readFileSync(sourceFile);
    await startOla(a,base);expect(a.projectId).toBeTruthy();expect(fs.readFileSync(sourceFile)).toEqual(before);
    const {db}=await import('../lib/platform-db');const {saveWorkflowState,workflowState}=await import('../lib/workflow-state');
    db().prepare("UPDATE projects SET content_type='story',status='awaiting-input' WHERE id=?").run(a.projectId!);
    saveWorkflowState({projectId:a.projectId!,phase:'awaiting-input',specialist:'story',answers:[],question:{text:'What time is the clinic?',options:['6 pm','7 pm'],purpose:'other',generatedBy:'llm'},route:null});
    vi.useFakeTimers();const pending=runOla(a,base,new AbortController().signal);await vi.advanceTimersByTimeAsync(1);expect(a.status).toBe('awaiting-input');expect(a.question?.text).toMatch(/time/);
    store.labDb().prepare('INSERT INTO commands VALUES(?,?,?)').run(crypto.randomUUID(),a.id,'6 pm');await vi.advanceTimersByTimeAsync(1000);
    expect(workflowState(a.projectId!)?.answers[0].answer).toBe('6 pm');expect(a.status).toBe('running');
    db().prepare("UPDATE projects SET status='needs-review' WHERE id=?").run(a.projectId!);await vi.advanceTimersByTimeAsync(1000);await pending;
    expect(a.status).toBe('needs-review');expect(fs.readFileSync(sourceFile)).toEqual(before);
  });
  it('encrypts OAuth tokens at rest and redacts sensitive URL parameters',()=>{
    vi.stubEnv('COMPARISON_CANVA_TOKEN_KEY',crypto.randomBytes(32).toString('base64url'));canva.putSecret('test-secret',{access_token:'super-private'});
    expect(JSON.stringify(store.labDb().prepare("SELECT value FROM secrets WHERE key='test-secret'").get())).not.toContain('super-private');expect(canva.readSecret('test-secret')).toEqual({access_token:'super-private'});
    const safe=JSON.stringify(store.redact({continuation_token:'sensitive',url:'https://www.canva.com/design/id?token=private',authorization:'Bearer hidden'}));expect(safe).not.toContain('private');expect(safe).not.toContain('sensitive');expect(safe).not.toContain('hidden');expect(store.redact({inputTokens:123,outputTokens:45,access_token:'hidden'})).toEqual({inputTokens:123,outputTokens:45,access_token:'[redacted]'});
  });
  it('rejects OAuth callbacks without a matching browser state',async()=>{
    vi.stubEnv('COMPARISON_CANVA_PERMITTED','1');vi.stubEnv('COMPARISON_CANVA_CLIENT_ID','test');vi.stubEnv('COMPARISON_CANVA_CLIENT_SECRET','test');
    await expect(canva.completeOAuth('wrong','code','different')).rejects.toThrow(/state/);vi.stubEnv('COMPARISON_CANVA_PERMITTED','0');
  });
  it('rejects external and lookalike resource domains',()=>{expect(()=>canva.allowedCanvaUrl('https://www.canva.com/design/x')).not.toThrow();for(const url of ['http://127.0.0.1/private','https://canva.com.evil.example/x','https://user:secret@www.canva.com/x'])expect(()=>canva.allowedCanvaUrl(url)).toThrow();});
  it('accepts Canva generation shortlinks without accepting lookalike hosts',()=>{expect(canva.allowedCanvaUrl('https://canva.link/example').hostname).toBe('canva.link');expect(()=>canva.allowedCanvaUrl('https://canva.link.evil.example/example')).toThrow();});
  it('backs off for 429 and never retries ambiguous network failures',async()=>{
    vi.useFakeTimers();const fetch=vi.fn().mockResolvedValueOnce(new Response('',{status:429,headers:{'retry-after':'2'}})).mockResolvedValueOnce(new Response('{}'));vi.stubGlobal('fetch',fetch);
    const pending=canva.canvaFetch('https://api.canva.com/tool');await vi.advanceTimersByTimeAsync(2000);expect((await pending).status).toBe(200);expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockReset().mockRejectedValue(new Error('connection lost'));await expect(canva.canvaFetch('https://api.canva.com/tool',{method:'POST'})).rejects.toThrow('connection lost');expect(fetch).toHaveBeenCalledTimes(1);
  });
});
describe('Canva contracts and recovery',()=>{
  it('distinguishes explicit credit rejections from uncertain creation outcomes',()=>{
    expect(canvaQuotaRejection({isError:true,_errorMeta:{code:'credit_quota_cooldown'}},1000)).toMatchObject({code:'credit_quota_cooldown',checkAfter:601000,serverResetKnown:false});
    expect(canvaQuotaRejection({isError:true,_errorMeta:{code:'credit_quota_exceeded'},structuredContent:{quota_usage:{resets_at:100}}},1000)).toMatchObject({checkAfter:100000,serverResetKnown:true});
    expect(canvaQuotaRejection({isError:true,_errorMeta:{code:'internal_error'}})).toBeUndefined();expect(canvaQuotaRejection({_errorMeta:{code:'credit_quota_cooldown'}})).toBeUndefined();
  });
  it('clears uncertain-creation markers only for explicit quota rejection responses',()=>{
    const {a}=make();a.state.inFlight='generate-design';
    expect(()=>canva.checkpointToolResponse(a,'generate-design',{isError:true,_errorMeta:{code:'credit_quota_cooldown'}})).toThrow(/explicitly rejected/);
    const saved=store.getAttempt(a.id);expect(saved.state.inFlight).toBeNull();expect(saved.state.canvaQuota).toMatchObject({code:'credit_quota_cooldown'});
    a.state.inFlight='generate-design';expect(()=>canva.checkpointToolResponse(a,'generate-design',{isError:true,_errorMeta:{code:'internal_error'}})).toThrow();expect(a.state.inFlight).toBe('generate-design');
  });
  it('routes a six-page branded carousel through native multi-page generation',()=>{
    const input={...base,slideCount:6,brief:'Exact headlines in order: 1. "One"; 2. "Two"; 3. "Three"; 4. "Four"; 5. "Five"; 6. "Six".'};
    const spec={name:'generate-design',inputSchema:{properties:{design_type:{enum:['presentation','instagram_post']},length:{type:'string'}}}};
    const args=brandedGenerationArgs(spec,'Frozen shared context',input,[{id:'logo',name:'logo.png'}]);
    expect(args).toMatchObject({design_type:'presentation',length:'balanced',asset_ids:['logo']});expect(args.query).toContain('EXACTLY 6 pages');expect(args.query).toContain('Slide 6 — "Six"');
    expect(()=>brandedGenerationArgs({name:'generate-design',inputSchema:{}},'Brief',input,[])).toThrow(/unavailable/);
  });
  it('exports all pages explicitly as separate native PNGs and preserves downloaded bytes',async()=>{
    const {a}=make();a.state.designId='owned-design';a.state.pageMetadata={items:Array.from({length:6},(_,i)=>({index:i+1}))};const c=client();
    c.specs.find(s=>s.name==='export-design')!.inputSchema={properties:{format:{type:'object'}}};
    const zip=new JSZip(),png=await sharp({create:{width:20,height:25,channels:3,background:'#224466'}}).png().toBuffer();
    for(let i=6;i>0;i--)zip.file(`page-${i}.png`,png);const bytes=await zip.generateAsync({type:'nodebuffer'});mocks.download.mockResolvedValue(bytes);
    const pages=await runner.exportPages(c,a,'all',new AbortController().signal);expect(pages).toHaveLength(6);
    expect(c.call).toHaveBeenCalledWith('export-design',{design_id:'owned-design',format:{type:'png',as_single_image:false,pages:[1,2,3,4,5,6]}});
    expect(fs.readFileSync(pages[0].file)).toEqual(png);expect(fs.readFileSync(path.join(store.attemptDir(a),'all-download-1.zip'))).toEqual(bytes);
  });
  it('resizes a multi-page design natively once and keeps its original identity',async()=>{
    const {a}=make();a.state.designId='source-design';a.state.pageMetadata={items:Array.from({length:3},(_,i)=>({index:i+1,dimensions:{width:1920,height:1080}}))};
    const c=client();c.specs.push({name:'resize-design',inputSchema:{}});vi.mocked(c.call).mockImplementation(async name=>name==='resize-design'?{design:{id:'resized-design'}}:{items:Array.from({length:3},(_,i)=>({index:i+1,dimensions:{width:1080,height:1350}}))});
    await runner.ensureCanvas(c,a,base,new AbortController().signal);await runner.ensureCanvas(c,a,base,new AbortController().signal);
    expect(a.state.sourceDesignId).toBe('source-design');expect(a.state.designId).toBe('resized-design');expect(vi.mocked(c.call).mock.calls.filter(c=>c[0]==='resize-design')).toHaveLength(1);
  });
  it('rejects unsafe empty text edits and grouped deletion before mutation',()=>{
    const transaction={richtexts:[{element_id:'empty',regions:[],containerElement:{type:'TEXT',dimension:{height:0}}},{element_id:'valid',regions:[{text:'Hello'}],containerElement:{type:'TEXT',dimension:{height:50}}}]};
    expect(editSafetyIssues([{type:'replace_text',element_id:'empty'}],transaction)).toHaveLength(1);expect(editSafetyIssues([{type:'replace_text',element_id:'valid'}],transaction)).toEqual([]);
    expect(editSafetyIssues([{type:'delete_element',element_id:'page-LBgroup-LBchild'}],transaction)).toHaveLength(1);
  });
  it('requests the portrait poster preset without changing the shared brief',()=>{
    const input={...base,format:'poster' as const};
    const args=runner.creationArgs(client().specs[0],'Frozen poster brief',input,[]);
    expect(args).toEqual({brief:'Frozen poster brief',format:'Poster (Portrait A4)'});
  });
  it('validates live tool schemas and refuses to silently drop selected assets',()=>{
    const spec=client().specs[0];canva.validateTool(spec,{brief:'hello'});expect(()=>canva.validateTool(spec,{brief:7})).toThrow(/schema/);
    expect(()=>runner.creationArgs(spec,'brief',base,[{id:'asset',name:'logo'}])).toThrow(/cannot accept/);
  });
  it('uses the first branded candidate with the exact uploaded asset IDs and resumes without regeneration',async()=>{
    const {a}=make();const c=client();vi.mocked(c.call).mockImplementation(async name=>{
      if(name==='generate-design')return {job:{id:'brand-job',status:'success',result:{generated_designs:[{candidate_id:'first'},{candidate_id:'second'}]}}};
      if(name==='create-design-from-candidate')return {design_summary:{id:'brand-design'}};
      throw new Error(name);
    });
    const args={query:'Use the supplied logo and named font',design_type:'your_story',asset_ids:['uploaded-logo']};
    await runner.createBranded(c,a,args,new AbortController().signal);
    expect(c.call).toHaveBeenCalledWith('generate-design',args,true);expect(c.call).toHaveBeenCalledWith('create-design-from-candidate',{job_id:'brand-job',candidate_id:'first'},true);
    await runner.createBranded(c,a,args,new AbortController().signal);expect(c.call).toHaveBeenCalledTimes(2);
    a.state={brandJob:{job_id:'known'}};expect(recovery.canResume(a)).toBe(true);
    a.state.inFlight='create-design-from-candidate';expect(recovery.canResume(a)).toBe(false);
  });
  it('maps local logo IDs to uploaded Canva IDs and rejects foreign asset references',()=>{
    const input={...base,assets:[{id:'local-logo',name:'logo.png',path:'/unused',sha256:'hash',category:'logo',role:'primary',mediaType:'image/png'}]};
    expect(runner.resolveAssetReferences([{type:'update_fill',asset_id:'local-logo'}],input,[{id:'remote-logo',name:'logo.png'}])).toEqual([{type:'update_fill',asset_id:'remote-logo'}]);
    expect(()=>runner.resolveAssetReferences([{asset_id:'foreign'}],input,[{id:'remote-logo',name:'logo.png'}])).toThrow(/outside/);
  });
  it('resumes a known creation job without invoking create-design again',async()=>{
    const {a}=make();a.state.createJob={job_id:'saved-job',continuation_token:'saved-token'};a.state.nextPollAt=0;const c=client();await runner.createAndPoll(c,a,{},new AbortController().signal);
    expect(c.call).toHaveBeenCalledWith('get-create-design-async-job',{job_id:'saved-job',continuation_token:'saved-token'});expect(c.call).toHaveBeenCalledTimes(1);expect(a.state.designId).toBe('owned-design');
  });
  it('recovers the committed creation response if the process stopped before the next checkpoint',async()=>{
    vi.useFakeTimers();const {a}=make();a.state.lastTool={name:'create-design',result:{job_id:'saved-job',continuation_token:'saved-token',polling_policy:{wait_seconds:1}}};const c=client();const pending=runner.createAndPoll(c,a,{},new AbortController().signal);await vi.advanceTimersByTimeAsync(1000);await pending;expect(c.call).toHaveBeenCalledTimes(1);
  });
  it('requires explicit retry after an uncertain mutation',()=>{const {a}=make();a.state={inFlight:'create-design'};expect(recovery.canResume(a)).toBe(false);a.state={createJob:{job_id:'known'}};expect(recovery.canResume(a)).toBe(true);a.state={designId:'owned',inFlight:'commit-editing-transaction'};expect(recovery.canResume(a)).toBe(false);});
  it('rejects edits that attempt to redirect to another design or transaction',()=>{expect(()=>runner.validateEditTargets([{design_id:'other'}],'owned','owned')).toThrow();expect(()=>runner.validateEditTargets([],'other','owned')).toThrow();});
  it('runs AI creation, vision review, and exactly one refinement while preserving the initial artifact',async()=>{
    vi.useFakeTimers();const comparison=store.insertCase(crypto.randomUUID(),{...base,format:'story'});const a=comparison.attempts.find(a=>a.engine==='canva-agent')!;const c=client();mocks.connect.mockResolvedValue(c);
    mocks.download.mockResolvedValue(await sharp({create:{width:1080,height:1920,channels:3,background:'#fff'}}).png().toBuffer());
    mocks.model.mockResolvedValueOnce({brief:'A carefully planned carousel.',caption:'Caption'}).mockResolvedValueOnce({critique:'Shorten headline',edits:[{page_index:1,operations:[{type:'replace_text',element_id:'element-1',text:'A clearer headline'}]}]});
    const pending=runner.runCanva(a,comparison.input,new AbortController().signal);await vi.advanceTimersByTimeAsync(1000);await pending;
    expect(a.status).toBe('complete');expect(a.result?.initialPages).toHaveLength(1);expect(a.result?.pages[0].file).not.toBe(a.result?.initialPages?.[0].file);
    const calls=vi.mocked(c.call).mock.calls;expect(calls.filter(call=>call[0]==='create-design')).toHaveLength(1);expect(calls.filter(call=>call[0]==='commit-editing-transaction')).toHaveLength(1);expect(mocks.model).toHaveBeenCalledTimes(2);expect(mocks.model.mock.calls[1][2]).toHaveLength(1);expect(a.model).toEqual(base.model);
  });
});

describe('Ola model contenders',()=>{
  it.each([2,3,5])('creates %i independent Ola contenders and versions',async count=>{
    const {supportedModels}=await import('./supported-models');
    const c=store.insertCase(crypto.randomUUID(),{...base,mode:'models',models:supportedModels.slice(0,count).map(m=>({provider:'vercel',model:m.vercel}))});
    expect(c.attempts).toHaveLength(count);expect(c.attempts.every(a=>a.engine==='ola'&&a.version===1)).toBe(true);expect(new Set(c.attempts.map(a=>a.contenderId)).size).toBe(count);
    const first=c.attempts[0];first.status='complete';store.saveAttempt(first);
    const next=store.newAttempt(c.id,'ola',undefined,{contenderId:first.contenderId});expect(next.version).toBe(2);expect(next.model).toEqual(first.model);expect(next.inputHash).toBe(first.inputHash);
    expect(store.getCase(c.id).attempts.filter(a=>a.id!==next.id)).toEqual(c.attempts);
  });
  it('freezes one brand-rule revision across contenders and subsequent reruns',async()=>{
    const localBase={...base,companyName:'Model rule isolation'};const c=store.insertCase(crypto.randomUUID(),localBase);store.saveBrandRules(c.id,{family:'grid'},'One shared revision',0);
    const models=[{provider:'vercel' as const,model:'openai/gpt-6-luna'},{provider:'vercel' as const,model:'openai/gpt-6.1-sol'}];
    const compared=store.insertCase(crypto.randomUUID(),{...localBase,mode:'models',models});
    expect(compared.attempts.every(a=>a.brandRules?.revision===1)).toBe(true);
    store.saveBrandRules(c.id,{family:'poster'},'Later unrelated revision',1);
    const first=compared.attempts[0];first.status='complete';store.saveAttempt(first);
    expect(store.newAttempt(compared.id,'ola',undefined,{contenderId:first.contenderId}).brandRules?.revision).toBe(1);
  });
  it('rejects duplicate models, mixed providers, unknown models, and missing lineup',async()=>{
    const selected={provider:'vercel',model:'openai/gpt-6-luna'};
    for(const models of [[selected,selected],[selected,{provider:'openrouter',model:'openai/gpt-6.1-sol'}],[selected,{provider:'vercel',model:'unknown'}],undefined]){
      const form=new FormData();form.set('input',JSON.stringify({...base,mode:'models',models}));await expect(inputs.createComparison(form)).rejects.toThrow();
    }
  });
  it('does not queue Canva or use model calls for a five-model fixture',async()=>{
    const {supportedModels}=await import('./supported-models'),{runFixture}=await import('./fixtures');
    const c=store.insertCase(crypto.randomUUID(),{...base,format:'story',mode:'models',models:supportedModels.map(m=>({provider:'vercel',model:m.vercel}))});
    await Promise.all(c.attempts.map(a=>runFixture(a,c.input,new AbortController().signal)));
    expect(c.attempts.every(a=>a.engine==='ola'&&a.status==='complete'&&a.result?.pages.length===1)).toBe(true);expect(mocks.connect).not.toHaveBeenCalled();expect(mocks.model).not.toHaveBeenCalled();
  });
});

it('persists the selected model before jobs run and recovers a committed project without duplication',async()=>{
  const {startOla}=await import('./ola-runner'),{projectAiPolicy,withProjectAi,modelFor}=await import('../lib/ai-execution'),{db}=await import('../lib/platform-db');
  vi.stubEnv('AI_GATEWAY_API_KEY','test');vi.stubEnv('VERCEL_AI_MODEL','openai/gpt-6-luna');
  const c=store.insertCase(crypto.randomUUID(),{...base,mode:'models',models:[{provider:'vercel',model:'openai/gpt-6.1-sol'},{provider:'vercel',model:'anthropic/claude-sonnet-5.5'}]});
  const a=c.attempts[0];await startOla(a,c.input);expect(a.model?.model).toBe('openai/gpt-6.1-sol');expect(projectAiPolicy(a.projectId!)).toMatchObject({model:'openai/gpt-6.1-sol',strict:true,attemptId:a.id});
  const before=db().prepare('SELECT count(*) AS n FROM projects').get();const recovered={...a,projectId:undefined};await startOla(recovered,c.input);expect(recovered.projectId).toBe(a.projectId);expect(db().prepare('SELECT count(*) AS n FROM projects').get()).toEqual(before);
  await withProjectAi(a.projectId!,'resumed-review',async()=>expect(modelFor('vercel',true)).toBe('openai/gpt-6.1-sol'));
});

it('rejects live model comparisons on an older worker and unavailable catalog selections',async()=>{
  const {supportedModels}=await import('./supported-models');const form=new FormData();form.set('input',JSON.stringify({...base,fixture:false,mode:'models',models:supportedModels.slice(0,2).map(m=>({provider:'vercel',model:m.vercel}))}));
  await expect(inputs.createComparison(form)).rejects.toThrow(/Restart the comparison worker/);
  vi.stubEnv('AI_GATEWAY_API_KEY','test');store.labDb().prepare('INSERT INTO worker_info VALUES(1,?,?)').run('test',JSON.stringify({models:true,accounting:true}));
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{id:'openai/gpt-6-luna',modalities:{input:['text','image'],output:['text']}}]}))));
  try {await expect(inputs.createComparison(form)).rejects.toThrow(/unavailable/);} finally {store.labDb().prepare('DELETE FROM worker_info').run();}
});

describe('Ola across companies',()=>{
  const ids=Array.from({length:10},()=>crypto.randomUUID());
  beforeAll(async()=>{
    const source=new DatabaseSync(path.join(root,'source','platform.sqlite'));
    source.exec('ALTER TABLE assets ADD COLUMN disk_path TEXT; ALTER TABLE assets ADD COLUMN usage_role TEXT');
    const image=path.join(root,'source','brand-logo.png');
    await sharp({create:{width:12,height:12,channels:3,background:'#7234dc'}}).png().toFile(image);
    for(const [index,id] of ids.entries()){
      source.prepare('INSERT INTO companies VALUES(?,?,?)').run(id,`Company ${index+1}`,JSON.stringify({...base.brand,voice:`Brand voice ${index+1}`}));
      const aid=crypto.randomUUID();source.prepare('INSERT INTO assets(id,company_id,name,media_type,category,disk_path,usage_role) VALUES(?,?,?,?,?,?,?)').run(aid,id,`Logo ${index+1}`,'image/png','logo',image,'primary');
    }
    source.close();
  });
  const form=(companyIds:string[],extra:Record<string,unknown>={})=>{const f=new FormData();f.set('input',JSON.stringify({...base,mode:'ola',companyIds,...extra}));return f;};
  it.each([2,3,10])('freezes %i independent brands under one prompt and model',async count=>{
    const {comparisonContenders,contenderInput}=await import('./contenders');
    const before=fs.readFileSync(path.join(root,'source','platform.sqlite'));
    const c=await inputs.createComparison(form(ids.slice(0,count)));
    expect(c.attempts).toHaveLength(count);expect(new Set(c.attempts.map(a=>a.contenderId)).size).toBe(count);
    expect(c.attempts.every(a=>a.engine==='ola'&&a.model?.model===base.model.model)).toBe(true);
    for(const [index,contender] of comparisonContenders(c).entries()){
      const input=contenderInput(c.input,contender.id);
      expect(input.companyId).toBe(ids[index]);expect(input.brand.voice).toBe(`Brand voice ${index+1}`);
      expect(input.brief).toBe(base.brief);expect(input.assets).toHaveLength(1);
      expect(input.assets[0].name).toBe(`Logo ${index+1}`);
      expect(fs.readFileSync(input.assets[0].path)).toEqual(fs.readFileSync(path.join(root,'source','brand-logo.png')));
    }
    expect(fs.readFileSync(path.join(root,'source','platform.sqlite'))).toEqual(before);
    expect(store.getCase(c.id).input).toEqual(c.input);
  });
  it('retains company rules and inputs when rerunning just one contender',async()=>{
    const {contenderInput,contenderId}=await import('./contenders');
    const baseline=store.insertCase(crypto.randomUUID(),{...base,companyId:ids[0]});
    const rule={family:'editorial',bodyScale:1.1,spacing:'balanced',logoTreatment:'original',notes:['Frozen company guidance']};
    const saved=store.saveBrandRules(baseline.id,rule,'Initial rules',0);
    const c=await inputs.createComparison(form(ids.slice(0,2)));const first=c.attempts.find(a=>contenderId(a)===`company-${ids[0]}`)!;
    expect(first.brandRules).toEqual(saved);expect(c.attempts.find(a=>a.id!==first.id)?.brandRules).toBeUndefined();
    first.status='failed';store.saveAttempt(first);store.saveBrandRules(baseline.id,{...rule,notes:['New guidance']},'Later rules',1);
    const next=store.newAttempt(c.id,'ola',undefined,{contenderId:first.contenderId});
    expect(next.version).toBe(2);expect(next.brandRules).toEqual(saved);expect(next.model).toEqual(first.model);
    expect(store.getCase(c.id).attempts.filter(a=>a.id!==next.id&&a.id!==first.id)).toEqual(c.attempts.filter(a=>a.id!==first.id));
    expect(()=>contenderInput(c.input,'company-unknown')).toThrow(/not found/);
  });
  it('rejects duplicate, missing, excessive, wrong-mode, and non-existent company selections',async()=>{
    for(const [companies,extra] of [[ids.slice(0,1),{}],[[ids[0],ids[0]],{}],[[...ids,crypto.randomUUID()],{}],[[ids[0],crypto.randomUUID()],{}],[ids.slice(0,2),{mode:'canva'}]] as Array<[string[],Record<string,unknown>]>)await expect(inputs.createComparison(form(companies,extra))).rejects.toThrow();
  });
  it('gives fixtures their own company identity without model or Canva calls',async()=>{
    const {runFixture}=await import('./fixtures');const c=await inputs.createComparison(form(ids.slice(0,2),{format:'story'}));
    await Promise.all(c.attempts.map(a=>runFixture(a,c.input,new AbortController().signal)));
    for(const a of c.attempts){expect(a.status).toBe('complete');expect(a.result?.pages).toHaveLength(1);const context=JSON.stringify(a.events.find(e=>e.kind==='shared-input'));expect(context).toContain(a.contenderId===`company-${ids[0]}`?'Company 1':'Company 2');}
    expect(mocks.model).not.toHaveBeenCalled();expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('requires a worker with company support before queuing live runs',async()=>{
    await expect(inputs.createComparison(form(ids.slice(0,2),{fixture:false}))).rejects.toThrow(/Restart the comparison worker/);
  });
});

describe('saved typography dependencies in comparison input',()=>{
  it('freezes required company fonts even when the image selection is empty',async()=>{
    const companyId=crypto.randomUUID(),fontIds=[crypto.randomUUID(),crypto.randomUUID()];
    const names=['Inter.woff2','PublicSans-Regular.woff2'];
    const {BrandSchema}=await import('../lib/platform');
    const brand=BrandSchema.parse({...base.brand,fontAssetIds:fontIds,designSystem:{headingFontName:names[0],bodyFontName:names[1]}});
    const sourceFile=path.join(root,'source','platform.sqlite'),source=new DatabaseSync(sourceFile);
    source.prepare('INSERT INTO companies VALUES(?,?,?)').run(companyId,'Required fonts',JSON.stringify(brand));
    const font=Buffer.alloc(64);font.write('wOF2');
    for(const[index,id]of fontIds.entries()){
      const file=path.join(root,'source',`${id}.woff2`);fs.writeFileSync(file,font);
      source.prepare('INSERT INTO assets(id,company_id,name,media_type,category,disk_path,usage_role) VALUES(?,?,?,?,?,?,?)').run(id,companyId,names[index],'font/woff2','font',file,'primary');
    }
    source.close();const before=fs.readFileSync(sourceFile);
    const form=new FormData();form.set('input',JSON.stringify({...base,companyId,brand,assetIds:[]}));
    const c=await inputs.createComparison(form);
    expect(c.input.assets.map(a=>a.name)).toEqual(names);
    expect(c.input.brand.fontAssetIds).toEqual(fontIds);
    for(const asset of c.input.assets)expect(fs.readFileSync(asset.path)).toEqual(font);
    expect(fs.readFileSync(sourceFile)).toEqual(before);
    expect(new Set(c.attempts.map(a=>a.inputHash)).size).toBe(1);
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it('rejects unavailable named fonts without creating paid attempts',async()=>{
    const before=store.listCases().length;
    const form=new FormData();form.set('input',JSON.stringify({...base,brand:{...base.brand,designSystem:{headingFontName:'Missing.woff2'}},assetIds:[]}));
    await expect(inputs.createComparison(form)).rejects.toThrow('Required brand font Missing.woff2 is missing');
    expect(store.listCases()).toHaveLength(before);
    expect(mocks.model).not.toHaveBeenCalled();
  });
});
