import {it,expect,vi} from 'vitest';
import {repairCompositionCandidates,compositionRepairTarget} from './composition-repair';
import {CompositionPlanSchema,artifactPages,planArtifactCompositions} from './composition';
import {SimpleArtifactSchema} from './simple-content';
import {SemanticComponentSchema} from './schemas';
import {RepresentationPlanSchema} from './content-representation';
const plan=(family:string,recipe?:string)=>CompositionPlanSchema.parse({family,...recipe?{recipe:{version:1,id:recipe}}:{},responsive:{version:1},intent:{goal:'Explain the message',relationship:'statement',reason:'Give the page clear hierarchy'}});
function fixture(){
 const artifact=SimpleArtifactSchema.parse({type:'carousel',title:'A guide',caption:'Save',slides:Array.from({length:6},(_,i)=>({id:`page-${i+1}`,title:`Step ${i+1}`,body:'A useful supporting sentence.'}))});
 const a=['oversized-typography','asymmetric-editorial','modular-grid'],b=['asymmetric-editorial','oversized-typography','modular-grid'];
 const input={candidates:[{pages:Array.from({length:6},(_,i)=>plan(a[i%3],i===0?'tahta-lead':undefined))},{pages:Array.from({length:6},(_,i)=>plan(b[i%3],i===1?'tahta-lead':undefined))}]};
 input.candidates[0].pages[5]=plan('diagram-led','tahta-timeline');return {artifact,input};
}
it('repairs only the rejected page and preserves the frozen copy and other candidate plans',async()=>{
 const {artifact,input}=fixture(),before=structuredClone(input),replacement=plan('modular-grid');
 const ask=vi.fn(async()=>JSON.stringify(replacement));const result=await repairCompositionCandidates(artifact,input,ask);
 expect(ask).toHaveBeenCalledTimes(1);
 expect(result.plans.candidates[0].pages.slice(0,5).map(p=>p.family)).toEqual(before.candidates[0].pages.slice(0,5).map(p=>p.family));
 expect(result.plans.candidates[1].pages.map(p=>p.family)).toEqual(before.candidates[1].pages.map(p=>p.family));
 for(const c of result.candidates)expect(artifactPages(c).map(p=>[p.title,p.body])).toEqual(artifactPages(artifact).map(p=>[p.title,p.body]));
 expect(input).toEqual(before);
});
it('rejects a source-incompatible page repair rather than inventing a diagram',async()=>{
 const {artifact,input}=fixture(),ask=vi.fn(async()=>JSON.stringify(plan('diagram-led','tahta-timeline')));
 await expect(repairCompositionCandidates(artifact,input,ask)).rejects.toThrow();expect(ask).toHaveBeenCalledTimes(2);
});
it('targets only candidate two when the first-page families collide',async()=>{
 const {artifact,input}=fixture();input.candidates[0].pages[5]=plan('modular-grid');input.candidates[1].pages[0]=plan('oversized-typography');
 const ask=vi.fn(async()=>JSON.stringify(plan('asymmetric-editorial'))),result=await repairCompositionCandidates(artifact,input,ask);
 expect(result.plans.candidates[0].pages[0].family).toBe('oversized-typography');expect(result.plans.candidates[1].pages[0].family).toBe('asymmetric-editorial');expect(ask).toHaveBeenCalledTimes(1);
 expect(compositionRepairTarget('The two candidates must have different first-page composition families.')).toEqual({candidate:1,page:0});
});
it('uses representation failures to repair a page without redrafting the deck',async()=>{
 const {artifact,input}=fixture();input.candidates[0].pages[5]=plan('modular-grid');
 const ask=vi.fn(async()=>JSON.stringify(plan('asymmetric-editorial')));
 const validate=(candidate:typeof artifact)=>artifactPages(candidate)[5].composition?.family==='modular-grid'?['Page 6: approved relationship is not represented.']:[];
 const result=await repairCompositionCandidates(artifact,input,ask,undefined,validate);
 expect(result.plans.candidates.every(c=>c.pages[5].family==='asymmetric-editorial')).toBe(true);expect(ask).toHaveBeenCalledTimes(2);
});
it('preserves an existing comparison instead of segmenting its supporting prose',async()=>{
 const component=SemanticComponentSchema.parse({kind:'comparison',leftTitle:'Vague',rightTitle:'Useful',items:[{label:'Nothing here',detail:'Add a first project'},{label:'Get started',detail:'Create a draft'}]});
 const artifact=SimpleArtifactSchema.parse({type:'poster',headline:'An empty screen can still help.',subline:'Give the reader a reason to take the first step.',semanticComponent:component});
 const bad={...plan('comparison','tahta-compare'),bodyMode:'comparison',separator:'\n'};
 const input={candidates:[{pages:[bad]},{pages:[plan('oversized-typography','tahta-lead')]}]};
 const result=await repairCompositionCandidates(artifact,input,async()=>JSON.stringify(plan('comparison','tahta-compare')));
 expect(result.plans.candidates[0].pages[0].bodyMode).toBe('text');
 for(const c of result.candidates)expect(artifactPages(c)[0].semanticComponent?.items.map(i=>[i.label,i.detail])).toEqual(component.items.map(i=>[i.label,i.detail]));
});
it('repairs a missing recipe on the compatible alternative while keeping first-page families distinct',async()=>{
 const artifact=SimpleArtifactSchema.parse({type:'poster',headline:'Make the choice clear.',subline:'Give the reader enough context.'});
 const input={candidates:[{pages:[plan('asymmetric-editorial')]},{pages:[plan('oversized-typography')]}]};
 const result=await repairCompositionCandidates(artifact,input,async()=>JSON.stringify(plan('oversized-typography','tahta-lead')),undefined,undefined,{requireRecipes:true});
 expect(result.plans.candidates[0].pages[0].family).toBe('asymmetric-editorial');expect(result.plans.candidates[1].pages[0].recipe?.id).toBe('tahta-lead');
});
it('accepts distinct custom alternatives without spending a repair call on a recipe quota',async()=>{
 const artifact=SimpleArtifactSchema.parse({type:'poster',headline:'Make the choice clear.',subline:'Give the reader enough context.'});
 const input={candidates:[{pages:[plan('asymmetric-editorial')]},{pages:[plan('oversized-typography')]}]},ask=vi.fn();
 const result=await repairCompositionCandidates(artifact,input,ask);
 expect(ask).not.toHaveBeenCalled();expect(result.plans.candidates.every(c=>!c.pages[0].recipe)).toBe(true);
 expect(result.candidates.map(c=>artifactPages(c)[0].title)).toEqual(['Make the choice clear.','Make the choice clear.']);
});
it('repairs a malformed page plan without discarding the valid deck',async()=>{
 const {artifact,input}=fixture();input.candidates[0].pages[5]=plan('modular-grid');input.candidates[0].pages[5].intent.goal='x'.repeat(301);
 const result=await repairCompositionCandidates(artifact,input,async()=>JSON.stringify(plan('modular-grid')));
 expect(result.candidates).toHaveLength(2);expect(result.plans.candidates[0].pages[5].intent.goal).toBe('Explain the message');
 expect(compositionRepairTarget(JSON.stringify([{path:['candidates',0,'pages',5,'intent','goal']}]))).toEqual({candidate:0,page:5});
});
it('repairs insufficient carousel rhythm by introducing a source-compatible third family',async()=>{
 const {artifact,input}=fixture();input.candidates[0].pages=input.candidates[0].pages.map((_,i)=>plan(i%2?'asymmetric-editorial':'oversized-typography',i===0?'tahta-lead':undefined));input.candidates[1].pages[5]=plan('modular-grid');
 const result=await repairCompositionCandidates(artifact,input,async()=>JSON.stringify(plan('modular-grid')));
 expect(new Set(result.plans.candidates[0].pages.map(p=>p.family)).size).toBe(3);expect(result.plans.candidates[0].pages[0].recipe?.id).toBe('tahta-lead');
});
it('rejects incompatible family/recipe pairs and corrects a malformed replacement within the page budget',async()=>{
 const artifact=SimpleArtifactSchema.parse({type:'poster',headline:'Make one thing useful.',subline:'Choose a clear purpose.'});
 const input={candidates:[{pages:[plan('oversized-typography','tahta-lead')]},{pages:[plan('asymmetric-editorial','tahta-lead')]}]};
 const ask=vi.fn().mockResolvedValueOnce(JSON.stringify(plan('asymmetric-editorial','tahta-lead'))).mockResolvedValueOnce(JSON.stringify(plan('asymmetric-editorial')));
 const result=await repairCompositionCandidates(artifact,input,ask);expect(ask).toHaveBeenCalledTimes(2);
 expect(result.plans.candidates[1].pages[0].family).toBe('asymmetric-editorial');expect(result.plans.candidates[1].pages[0].recipe).toBeUndefined();
});
it.each(['poster','story'] as const)('allows the documented custom alternative when %s has only one compatible recipe family',type=>{
 const artifact=SimpleArtifactSchema.parse({type,headline:'Make the choice useful.',subline:'',visualContent:{kind:'comparison',items:[{label:'Vague',detail:'Any thoughts?'},{label:'Specific',detail:'Check the recovery path.'}]}});
 const input={candidates:[{pages:[plan('oversized-typography','tahta-lead')]},{pages:[plan('comparison')]}]};
 expect(()=>planArtifactCompositions(artifact,input,true,true)).not.toThrow();
});
it('does not offer numbered treatment for a page without an ordered sequence',async()=>{
 const {artifact,input}=fixture();input.candidates[0].pages[5]=plan('modular-grid');input.candidates[0].pages[5].responsive!.visual.treatment='numbered';
 const bad=plan('modular-grid');bad.responsive!.visual.treatment='numbered';
 const ask=vi.fn().mockResolvedValueOnce(JSON.stringify(bad)).mockResolvedValueOnce(JSON.stringify(plan('modular-grid')));
 const result=await repairCompositionCandidates(artifact,input,ask);expect(ask).toHaveBeenCalledTimes(2);expect(result.plans.candidates[0].pages[5].responsive?.visual.treatment).toBe('plain');
});
it('excludes designed-component text flow from a plain page repair schema',async()=>{
 const artifact=SimpleArtifactSchema.parse({type:'poster',headline:'One useful thought.',subline:'Keep the explanation clear.'});
 const bad=plan('asymmetric-editorial');bad.responsive!.visual.textFlow='grouped';
 const input={candidates:[{pages:[bad]},{pages:[plan('oversized-typography')]}]};
 const ask=vi.fn(async(prompt:string)=>{
  const schema=JSON.parse(prompt.split('Return JSON matching ')[1].split('.\nYour last replacement')[0].replace(/\.$/,''));
  for(const branch of schema.oneOf)expect(branch.properties.responsive.properties.visual.properties.textFlow).toEqual({not:{}});
  return JSON.stringify(plan('asymmetric-editorial'));
 });
 const result=await repairCompositionCandidates(artifact,input,ask);expect(ask).toHaveBeenCalledTimes(1);expect(result.plans.candidates[0].pages[0].responsive?.visual.textFlow).toBeUndefined();
});
it('binds already repeated process labels to the exact source sequence instead of protecting a duplicate',async()=>{
 const artifact=SimpleArtifactSchema.parse({type:'poster',headline:'Pass the context with the work.',subline:'Purpose → Progress → Next action',semanticComponent:SemanticComponentSchema.parse({kind:'processLoop',items:[{label:'Purpose'},{label:'Progress'},{label:'Next action'}]}),representationPlan:RepresentationPlanSchema.parse({version:1,message:'A useful handoff',sequenceReason:'Show the supplied sequence',pages:[{page:1,role:'hook',goal:'Explain the stages',form:'process',reason:'The stages are ordered',supportingCopy:'supplied',contentNeeds:['Show the stages once'],assetIds:[],evidenceRefs:[],exactCopyRefs:[]}]})});
 const input={candidates:[{pages:[plan('diagram-led','tahta-timeline')]},{pages:[plan('oversized-typography','tahta-lead')]}]};
 const ask=vi.fn(async(prompt:string)=>JSON.stringify({...plan(prompt.includes('candidate 1')?'diagram-led':'oversized-typography',prompt.includes('candidate 1')?'tahta-timeline':'tahta-lead'),bodyMode:'sequence',separator:' → '}));
 const result=await repairCompositionCandidates(artifact,input,ask);for(const c of result.candidates){const p=artifactPages(c)[0];expect(p.body).toBe('Purpose → Progress → Next action');expect(p.composition?.placements.some(v=>v.slot==='body')).toBe(false);expect(p.semanticComponent?.items.map(i=>i.label)).toEqual(['@copy:body-0','@copy:body-1','@copy:body-2']);}
});
