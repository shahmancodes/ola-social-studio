import{describe,it,expect,beforeAll,afterAll,vi}from'vitest';import fs from'node:fs/promises';import path from'node:path';import os from'node:os';
import{SemanticDesignSpecSchema,semanticDesignIssues,componentSources,COMPONENT_FORMATS}from'./semantic-design';import{composePage,copyText,setCopyText}from'./composition';import{buildVisualScene,scenePng}from'./content-layout';import{sceneIssues}from'./scene-renderer';import{semanticDesignBlock}from'./semantic-design-render';import{canvasTexts}from'./canvas-text';import{applyOnDemandDesigner,designSemanticCandidate,designerComponent}from'./semantic-designer';import{listComponentCandidates,reviewComponentCandidate,saveComponentCandidate,queueComponentJob,saveComponentJob,componentJobs}from'./semantic-design-store';import{SemanticComponentSchema}from'./schemas';import type{ContentBrand}from'./content-brand';import{SimpleArtifactSchema}from'./simple-content';import{supportingCopyBudgetIssues}from'./supporting-copy-budget';import{recoverComponentJobs}from'../comparison/component-jobs';
const brand:ContentBrand={companyId:'test',name:'Example',description:'',audience:'Readers',voice:'Plain',typography:'Manrope',imagery:'',formatRules:'',examples:[],assets:[],palette:{background:'#FFFFFF',alternate:'#EEEEEE',accent:'#163C8A',ink:'#111111',dark:'#111111'}};
const sample={title:'Two useful signals',body:'',semanticComponent:SemanticComponentSchema.parse({kind:'checklist',items:[{label:'Context',detail:'What changes the outcome.'},{label:'Effect',detail:'What could follow.'}]})};
const nodes=componentSources(sample.semanticComponent).map((source,i)=>({id:'n'+i,source,role:i%2?'detail':'label',emphasis:i%2?'normal':'strong'}));
const boxes=[{id:'n0',x:0,y:.05,w:.42,h:.18},{id:'n1',x:0,y:.28,w:.42,h:.5},{id:'n2',x:.58,y:.05,w:.42,h:.18},{id:'n3',x:.58,y:.28,w:.42,h:.5}];
const spec=SemanticDesignSpecSchema.parse({version:1,name:'Related signal lanes',purpose:'Keep two non-exclusive signals readable without binary branches.',relationship:'comparison',nodes,connectors:[],profiles:{portrait:{heightRatio:.75,boxes},landscape:{heightRatio:.4,boxes}}});
const design={candidateId:'a1000000-0000-4000-8000-000000000000',spec};let dir:string;
beforeAll(async()=>{dir=await fs.mkdtemp(path.join(os.tmpdir(),'sentinel-design-'));vi.stubEnv('COMPARISON_DATA_DIR',dir);});afterAll(async()=>{vi.unstubAllEnvs();await fs.rm(dir,{recursive:true,force:true});});
describe('on-demand semantic components',()=>{
 it('rejects executable content, new copy, duplicate bindings and invalid edges',()=>{
  expect(()=>SemanticDesignSpecSchema.parse({...spec,script:'alert(1)'})).toThrow();expect(semanticDesignIssues({...spec,nodes:[...spec.nodes,spec.nodes[0]]},componentSources(sample.semanticComponent))).toContain('Copy sources must be drawn once.');
  expect(semanticDesignIssues({...spec,connectors:[{from:'missing',to:'n0',kind:'arrow'}]},componentSources(sample.semanticComponent))).toContain('Connector has an invalid endpoint.');
  expect(semanticDesignIssues(spec,['semanticComponent.prompt'])).toContain('Design must cover exactly the existing canonical component text, without new labels or omissions.');
 });
 for(const format of COMPONENT_FORMATS)it(`renders native readable geometry and canonical editable text in ${format}`,async()=>{
  const page=composePage({...sample,semanticDesign:design},{family:'diagram-led',intent:{goal:spec.purpose,relationship:'relationship',reason:'Related signals are not yes/no alternatives.'},responsive:{version:1,balance:{version:1},arrangement:'stack',focal:'artwork',visualWeight:.6}});
  const scene=format==='article'?semanticDesignBlock({...sample,semanticDesign:design},brand):await buildVisualScene(format,page,brand);const bytes=await scenePng(scene);expect(bytes.length).toBeGreaterThan(1000);expect(sceneIssues(scene)).toEqual([]);expect(scene.elements.filter(e=>e.kind==='text'&&e.copySource?.startsWith('semanticComponent.'))).toHaveLength(4);
  if(format!=='article'){const target=canvasTexts(scene,page).find(t=>t.source==='semanticComponent.items.0.label')!;expect(target.copyId).toBeTruthy();const edited=setCopyText(page,target.copyId!,'Circumstance');expect(copyText(edited,target.copyId!)).toBe('Circumstance');expect(edited.semanticDesign).toEqual(design);}
 },20000);
 it('renders declared semantic shapes and handles a light brand accent safely',async()=>{
  const shaped={...spec,profiles:{...spec.profiles,landscape:{...spec.profiles.landscape,shapes:[{id:'group',kind:'rect' as const,tone:'surface' as const,purpose:'Group the paired explanatory signals',x:0,y:0,w:1,h:.9}]}}};
  const scene=semanticDesignBlock({...sample,semanticDesign:{...design,spec:shaped}},{...brand,palette:{...brand.palette,accent:'#D9FF00'}});await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);expect(scene.elements.some(e=>e.id==='designed-shape-group')).toBe(true);
 });
 it('assesses reuse without generating or registering unnecessary components',async()=>{
  let calls=0;const artifact=SimpleArtifactSchema.parse({type:'poster',headline:sample.title,subline:'',semanticComponent:sample.semanticComponent});const next=await applyOnDemandDesigner(artifact,{brand,brief:'Explain these signals',projectId:'test',images:[]},async()=>{calls++;return JSON.stringify({decisions:[{page:1,action:'reuse',relationship:'comparison',reason:'The existing data is already adequately represented.',removeGeneratedBinaryTags:false}]});},()=>{});expect(calls).toBe(1);expect(next).toEqual(artifact);expect(listComponentCandidates()).toHaveLength(0);
 });
 it('corrects stale baseline page references before invoking the designer',async()=>{
  const artifact=SimpleArtifactSchema.parse({type:'carousel',title:'Review',caption:'',slides:Array.from({length:6},(_,i)=>({title:'Step '+i,body:'',...(i===4?{semanticComponent:sample.semanticComponent}:{})}))});
  const events:unknown[]=[];let calls=0;
  const next=await applyOnDemandDesigner(artifact,{brand,brief:'Six steps',projectId:'test',images:[],feedback:{page:3}},async()=>JSON.stringify({decisions:[{page:++calls===1?3:5,action:'reuse',relationship:'association',reason:'Current component already explains the parallel signals clearly.',removeGeneratedBinaryTags:false}]}),e=>events.push(e));
  expect(calls).toBe(2);expect(next).toEqual(artifact);expect(events).toContainEqual(expect.objectContaining({stage:'gap-assessment-rejected'}));
  const unavailable=await applyOnDemandDesigner(artifact,{brand,brief:'Six steps',projectId:'test',images:[]},async()=>'{"decisions":[]}',()=>{});expect(unavailable.componentDesignWarnings?.[0]).toContain('unavailable');
 });
 it('saves a real candidate only after six format checks and independent rendered review',async()=>{
  const result=await designSemanticCandidate({page:sample,brand,reason:'The reviewer needs a neutral alternative with readable grouped labels.',relationship:'comparison'},async prompt=>JSON.stringify(prompt.startsWith('Independently')?{passed:true,issues:[]}:spec));expect(result.candidate.status).toBe('candidate');expect(result.candidate.checks.every(c=>c.passed)).toBe(true);expect(result.candidate.checks).toHaveLength(6);expect(listComponentCandidates()[0].id).toBe(result.candidate.id);expect(reviewComponentCandidate(result.candidate.id,'shortlisted','Useful neutral grouping').status).toBe('shortlisted');
 },60000);
 it('binds a validated on-demand candidate into the generated artifact before composition',async()=>{
  const artifact=SimpleArtifactSchema.parse({type:'poster',headline:sample.title,subline:'',semanticComponent:sample.semanticComponent});if(artifact.type!=='poster')throw Error('Unexpected fixture format');let calls=0;
  const next=await applyOnDemandDesigner(artifact,{brand,brief:'Explain these signals',projectId:'test',images:[],feedback:{issues:['The two related signals need a parallel reading path.']}},async prompt=>{calls++;return JSON.stringify(prompt.startsWith("You are Ola's component gap assessor")?{decisions:[{page:1,action:'design',relationship:'comparison',reason:'The supplied relationship needs independently readable parallel lanes.',removeGeneratedBinaryTags:false}]}:prompt.startsWith('Independently')?{passed:true,issues:[]}:spec);},()=>{});
  expect(calls).toBe(3);expect(next.type).toBe('poster');if(next.type!=='poster'||artifact.type!=='poster')throw Error('Unexpected format');expect(next.headline).toBe(artifact.headline);expect(next.semanticDesign?.spec).toEqual(spec);expect(componentSources(next.semanticComponent)).toEqual(componentSources(artifact.semanticComponent));expect(next.composition).toBeUndefined();
 },60000);
 it('keeps human review decisions during draft updates and preserves interrupted jobs',()=>{
  const c=listComponentCandidates()[0];expect(c).toBeTruthy();
  const reviewed=reviewComponentCandidate(c.id,'shortlisted','Retain this review');saveComponentCandidate({...c,status:'candidate',review:undefined});expect(listComponentCandidates()[0].review).toEqual(reviewed.review);expect(listComponentCandidates()[0].status).toBe('shortlisted');
  saveComponentCandidate({...c,id:'b1000000-0000-4000-8000-000000000000',checks:c.checks.slice(0,5)});expect(()=>reviewComponentCandidate('b1000000-0000-4000-8000-000000000000','shortlisted','Too early')).toThrow('Every format');
  const model={provider:'vercel' as const,model:'fixed-source-model'},job=queueComponentJob({attemptId:'a1000000-0000-4000-8000-000000000001',page:2},model);saveComponentJob({...job,status:'running'});recoverComponentJobs();expect(componentJobs()[0]).toMatchObject({status:'interrupted',source:job.source,model});expect(componentJobs()[0].error).toContain('explicitly');
 });
 it('never silently drops chart values or a bound component image',async()=>{
  const ask=vi.fn();await expect(designSemanticCandidate({page:{title:'Numbers',body:'',semanticComponent:SemanticComponentSchema.parse({kind:'barChart',items:[{label:'One',value:10},{label:'Two',value:20}]})},brand,reason:'Need a new visual.',relationship:'comparison'},ask)).rejects.toThrow('Data-bound');
  expect(ask).not.toHaveBeenCalled();
 });
 it('adapts existing flexible process copy without adding or duplicating words',()=>{
  const page={title:'A process',body:'',visualContent:{kind:'process' as const,items:[{label:'Observe',detail:'Read the evidence.'},{label:'Discuss',detail:'Invite another view.'}]}};
  const component=designerComponent(page)!;expect(component.kind).toBe('timeline');expect(component.items.map(i=>({label:i.label,detail:i.detail}))).toEqual(page.visualContent.items);expect(componentSources(component)).toHaveLength(4);expect(page).not.toHaveProperty('semanticComponent');
 });
 it('counts generated component copy in a per-page word budget',()=>{const a=SimpleArtifactSchema.parse({type:'poster',headline:'Headline excluded',subline:'One two three',semanticComponent:sample.semanticComponent});expect(supportingCopyBudgetIssues(a,'Write 2–4 useful supporting words per page.')[0]).toContain('supporting copy totals');});
});
