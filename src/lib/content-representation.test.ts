import { describe, expect, it } from 'vitest';
import { RepresentationPlanSchema, bindSuppliedCopy, suppliedCopyIssues, representationCopyPolicy, representationPlanIssues, planContentRepresentation, representationDraftGuide, representationRealizationIssues, type RepresentationInput } from './content-representation';
import { SimpleArtifactSchema } from './simple-content';
import { createSemanticComponent } from './semantic-component-presets';
import { applyArtifactPatches } from './artifact-repair';
import { composePage, CompositionPlanSchema, planArtifactCompositions } from './composition';
const input=(extra:Partial<RepresentationInput>={}):RepresentationInput=>({type:'poster',brief:'Explain how to improve a handoff.',brand:{name:'Example',audience:'Teams',voice:'Clear',description:'Helpful guidance',assets:[{id:'photo',name:'original.png',mediaType:'image/png',diskPath:'/snapshot/original.png',role:'primary'}]},sources:[],...extra});
const page=(extra={})=>({page:1,role:'explanation',goal:'Make the next action understandable.',form:'statement',reason:'One message suits the available source.',contentNeeds:['Give a specific practical action.'],assetIds:[],evidenceRefs:[],exactCopyRefs:[],...extra});
const plan=(pages:unknown[]=[page()])=>RepresentationPlanSchema.parse({version:1,message:'Improve the handoff.',sequenceReason:'Explain the action before the next step.',pages});
describe('representation before generated copy',()=>{
  const pairsBrief='Required headline: "Know the work". Include exactly these label/detail pairs: "Signal" / "Describe what changed."; "Proof" / "Show one observation.". Required closing line: "Make it useful." Generate no additional visible prose.';
  const pairsPlan=()=>plan([page({form:'checklist',exactCopyRefs:['title','pair-1-label','pair-1-detail','pair-2-label','pair-2-detail','cta']})]);
  const pairItems=[{label:'Signal',detail:'Describe what changed.'},{label:'Proof',detail:'Show one observation.'}];
  it('retains pair roles as exact source ranges and assigns closing lines to cta',()=>{
    const policy=representationCopyPolicy(pairsBrief);
    expect(policy.additionalCopy).toBe(false);
    expect(policy.exactCopyRefs.map(r=>[r.id,pairsBrief.slice(r.start,r.end)])).toEqual([['title','Know the work'],['cta','Make it useful.'],['pair-1-label','Signal'],['pair-1-detail','Describe what changed.'],['pair-2-label','Proof'],['pair-2-detail','Show one observation.']]);
    expect(representationPlanIssues(pairsPlan(),input({brief:pairsBrief}))).toEqual([]);
  });
  it.each(['poster','story','post','carousel','presentation','article']as const)('requires canonical paired fields in %s without rewriting supplied text',type=>{
    const source={title:'Know the work',body:'',cta:'Make it useful.',semanticComponent:{kind:'checklist',items:pairItems}};
    const artifact=SimpleArtifactSchema.parse(type==='article'?{type,title:'Guide',sections:[source]}:type==='carousel'||type==='presentation'?{type,title:'Guide',caption:'',slides:[source,source,source]}:{type,headline:source.title,subline:'',caption:'',cta:source.cta,semanticComponent:source.semanticComponent});
    // Multi-page content assigns each required pair once, rather than repeating it on every page.
    if(artifact.type==='carousel'||artifact.type==='presentation')for(const row of artifact.slides.slice(1)){delete row.semanticComponent;delete row.cta;row.title='Another message';}
    const p=type==='carousel'||type==='presentation'?plan([...pairsPlan().pages,page({page:2}),page({page:3})]):pairsPlan();
    const brief=(type==='article'||type==='post')?pairsBrief.replace('Required closing line: "Make it useful." ',''):pairsBrief;
    if(type==='article'||type==='post')p.pages[0].exactCopyRefs=p.pages[0].exactCopyRefs.filter(r=>r!=='cta');
    expect(suppliedCopyIssues(artifact,brief,p)).toEqual([]);
    const bound=bindSuppliedCopy(artifact,p,brief);expect(suppliedCopyIssues(bound,brief,p)).toEqual([]);
    expect(JSON.stringify(bound)).not.toContain('"pair-1-label":');expect(bound).not.toBe(artifact);
  });
  it('rejects flattened, swapped, omitted and duplicated pair roles before composition',()=>{
    const p=pairsPlan();
    for(const items of [pairItems.map(i=>({label:`${i.label} — ${i.detail}`,detail:''})),pairItems.map(i=>({label:i.detail,detail:i.label})),[pairItems[0],{...pairItems[1],detail:''}],[...pairItems,pairItems[0]]]){
      const artifact=SimpleArtifactSchema.parse({type:'poster',headline:'Know the work',subline:'',cta:'Make it useful.',semanticComponent:{kind:'checklist',items}});
      expect(representationRealizationIssues(artifact,p,'draft',pairsBrief).join(' ')).toContain('separate label and detail fields');
    }
  });
  it('preserves pair validation through native copy references and accepts structured visual fields',()=>{
    const source={title:'Know the work',body:'',cta:'Make it useful.',visualContent:{kind:'checklist' as const,items:pairItems}};
    const page=composePage(source,CompositionPlanSchema.parse({family:'modular-grid',responsive:{version:1},intent:{goal:'Show the fields',relationship:'relationship',reason:'The labels describe complementary information.'}}));
    const artifact=SimpleArtifactSchema.parse({type:'poster',headline:source.title,subline:'',cta:source.cta,visualContent:page.visualContent,composition:page.composition});
    expect(representationRealizationIssues(artifact,pairsPlan(),'composed',pairsBrief)).toEqual([]);
  });
  it('rejects assigning a label and its explanation to different pages',()=>{
    const p=plan([page({exactCopyRefs:['title','pair-1-label','pair-2-label','pair-2-detail','cta']}),page({page:2,exactCopyRefs:['pair-1-detail']}),page({page:3})]);
    expect(representationPlanIssues(p,input({type:'carousel',brief:pairsBrief,count:3})).join(' ')).toContain('pair-1 label and detail must be assigned to the same page');
  });
  it('preserves deliberately repeated supplied pairs as independent canonical items',()=>{
    const brief='Label/detail pairs: "Signal" / "Check it."; "Signal" / "Check it."';
    const artifact=SimpleArtifactSchema.parse({type:'poster',headline:'Observe',subline:'',semanticComponent:{kind:'checklist',items:[{label:'Signal',detail:'Check it.'},{label:'Signal',detail:'Check it.'}]}});
    expect(suppliedCopyIssues(artifact,brief)).toEqual([]);
  });
  it.each(['carousel','presentation'] as const)('validates the closing CTA on its assigned final page for %s',type=>{
    const brief='The ONLY required visible page headlines, in order, are: 1. "First."; 2. "Middle."; 3. "Last.". On the final page include the exact CTA "Save this guide."';
    const p=plan([1,2,3].map(n=>page({page:n,exactCopyRefs:[`page-${n}-title`,...(n===3?['cta']:[])]})));
    expect(representationCopyPolicy(brief).exactCopyRefs).toHaveLength(4);
    expect(representationPlanIssues(p,input({type,brief,count:3}))).toEqual([]);
    const artifact=SimpleArtifactSchema.parse({type,title:'Metadata',caption:'',slides:[{title:'First.',body:'Start here.'},{title:'Middle.',body:'Explain this.'},{title:'Last.',body:'Finish here.',cta:'Save this guide.'}]});
    expect(representationRealizationIssues(artifact,p,'draft',brief)).toEqual([]);
    if(artifact.type!=='carousel'&&artifact.type!=='presentation')throw new Error('Expected pages');
    artifact.slides[0].cta='Save this guide.';delete artifact.slides[2].cta;
    expect(suppliedCopyIssues(artifact,brief,p).join(' ')).toMatch(/Page 1.*duplicated.*Page 3/);
    const bound=bindSuppliedCopy(artifact,p,brief);expect(bound.slides[0].cta).toBeUndefined();expect(bound.slides[2].cta).toBe('Save this guide.');expect(suppliedCopyIssues(bound,brief)).toEqual([]);
    p.pages[0].exactCopyRefs.push('cta');p.pages[2].exactCopyRefs.pop();expect(representationPlanIssues(p,input({type,brief,count:3})).join(' ')).toContain('belongs on page 3');
  });
  it('uses representation assignments for supplied copy outside page one',()=>{
    const brief='Supporting line: "The exact explanation."';const p=plan([page(),page({page:2,exactCopyRefs:['body']}),page({page:3})]);
    const a=SimpleArtifactSchema.parse({type:'presentation',title:'Guide',slides:[{title:'Start',body:'A generated opening.'},{title:'Explain',body:'The exact explanation.'},{title:'Close',body:'Next step.'}]});
    if(a.type!=='presentation')throw new Error('Expected presentation');
    expect(representationRealizationIssues(a,p,'draft',brief)).toEqual([]);
    a.slides[1].body='Changed';expect(representationRealizationIssues(a,p,'draft',brief)).toContain('Page 2: exact source copy changed: body.');
  });
  it.each(['on every page where the image appears','on each page that uses it','wherever it appears','wherever shown'])('binds credits only on image pages: %s',scope=>{
    const brief=`Headline: "Observe." Include the exact small credit 'Image: NASA' ${scope}. Include the small label 'Illustrative example'.`;
    const p=plan([page({assetIds:['photo'],exactCopyRefs:['title','credit','eyebrow']}),page({page:2}),page({page:3,assetIds:['photo']})]);
    const a=SimpleArtifactSchema.parse({type:'carousel',title:'Guide',caption:'',slides:[{title:'Changed',body:'Observe.',assetId:'photo'},{title:'Explain',body:'Context.'},{title:'Finish',body:'Act.',assetId:'photo'}]});
    if(a.type!=='carousel')throw new Error('Expected carousel');
    const bound=bindSuppliedCopy(a,p,brief);expect(bound.slides.map(p=>p.credit)).toEqual(['Image: NASA',undefined,'Image: NASA']);expect(bound.slides[0].eyebrow).toBe('Illustrative example');expect(suppliedCopyIssues(bound,brief)).toEqual([]);
  });
  it.each(['one concise, practical supporting sentence','one practical concise supporting sentence','a single short supporting sentence','one supporting sentence'])('retains the copy contract after intake normalization: %s',phrase=>{
    const brief=`Add ${phrase} per slide. Add “Save this checklist.” to slide 3. Keep to the supplied copy.`;
    const policy=representationCopyPolicy(brief);expect(policy.sentenceOnly).toBe(true);expect(policy.additionalCopy).toBe(false);expect(brief.slice(policy.closingAction!.start,policy.closingAction!.end)).toBe('Save this checklist.');
    const p=plan([1,2,3].map(pageNumber=>page({page:pageNumber,form:'checklist'})));expect(representationPlanIssues(p,input({type:'carousel',brief,count:3})).join(' ')).toContain('one-sentence');
  });
  it('keeps exact text as ranges into the authoritative brief',()=>{
    const brief='Headline: “Keep moving.” Supporting line: "Plan → Build → Review → Learn" CTA: "Try it." Add no other visible text. Include the small credit "Image: NASA".';
    const policy=representationCopyPolicy(brief);expect(policy.additionalCopy).toBe(false);
    expect(Object.fromEntries(policy.exactCopyRefs.map(r=>[r.id,brief.slice(r.start,r.end)]))).toEqual({title:'Keep moving.',body:'Plan → Build → Review → Learn',cta:'Try it.',credit:'Image: NASA'});
    expect(policy.exactCopyRefs.every(r=>!('text'in r))).toBe(true);
  });
  it('does not read JSON brand keys as publishable copy cues',()=>{
    const brief='Use these exact headlines in order: 1. "Read"; 2. "Check"; 3. "Share". Brand context: {"Headline":"Include exact label","label":"Style only"}';
    const policy=representationCopyPolicy(brief);expect(policy.exactCopyRefs.map(r=>r.id)).toEqual(['page-1-title','page-2-title','page-3-title']);
    const same='Headline: "Headline"';const ref=representationCopyPolicy(same).exactCopyRefs[0];expect(ref.start).toBe(same.indexOf('"')+1);expect(same.slice(ref.start,ref.end)).toBe('Headline');
  });
  it('retains ordered supplied headlines and enforces one-sentence scope',()=>{
    const brief='Use these exact headlines in order: 1. "Start"; 2. "Explain"; 3. "Finish". Add one concise practical supporting sentence per slide.';
    const policy=representationCopyPolicy(brief);expect(policy.sentenceOnly).toBe(true);
    expect(policy.exactCopyRefs.map(r=>brief.slice(r.start,r.end))).toEqual(['Start','Explain','Finish']);
    const p=plan([1,2,3].map(n=>page({page:n,exactCopyRefs:[`page-${n}-title`]})));
    expect(representationPlanIssues(p,input({type:'carousel',brief,count:3}))).toEqual([]);
    p.pages[0].form='comparison';expect(representationPlanIssues(p,input({type:'carousel',brief,count:3})).join(' ')).toMatch(/one-sentence/);
    p.pages[0].form='statement';p.pages[0].exactCopyRefs=['page-2-title'];expect(representationPlanIssues(p,input({type:'carousel',brief,count:3})).join(' ')).toMatch(/twice|headlines|Missing/);
  });
  it.each(['poster','story','post','carousel','presentation','article'] as const)('uses the same source contract for %s',type=>{
    const count=['carousel','presentation'].includes(type)?3:1,p=plan(Array.from({length:count},(_,i)=>page({page:i+1,form:type==='article'?'prose':'statement'})));
    expect(representationPlanIssues(p,input({type,count}))).toEqual([]);
    const a=type==='article'?{type,title:'Guide',sections:[{title:'Act',body:'Explain one action.'}]}:type==='carousel'||type==='presentation'?{type,title:'Guide',caption:'',slides:Array.from({length:count},()=>({title:'Act',body:'Explain one action.'}))}:{type,headline:'Act',subline:'Explain one action.',caption:''};
    const saved=SimpleArtifactSchema.parse({...a,representationPlan:p});expect(saved.representationPlan).toEqual(p);expect(representationRealizationIssues(saved,p)).toEqual([]);
  });
  it('distinguishes explicitly requested generated sentences from unrequested extra copy',()=>{
    const brief='Use these exact headlines in order: 1. "Start"; 2. "Explain"; 3. "Finish". Add one concise practical supporting sentence per slide. On slide 3 add "Keep this guide." Avoid extra text.';
    const p=plan([1,2,3].map(n=>page({page:n,exactCopyRefs:[`page-${n}-title`],supportingCopy:'generate'})));
    expect(representationPlanIssues(p,input({type:'carousel',brief,count:3}))).toEqual([]);
    p.pages[0].supportingCopy='none';expect(representationPlanIssues(p,input({type:'carousel',brief,count:3})).join(' ')).toMatch(/explicitly requires/);p.pages[0].supportingCopy='generate';
    const draft=SimpleArtifactSchema.parse({type:'carousel',title:'Guide',caption:'',slides:[{title:'Start',body:'Begin with a clear goal.'},{title:'Explain',body:''},{title:'Finish',body:'Keep this guide.'}]});
    const issues=representationRealizationIssues(draft,p,'draft',brief);expect(issues).toHaveLength(3);expect(issues.join(' ')).toMatch(/Page 2/);expect(issues.join(' ')).toMatch(/Page 3/);
    if(draft.type!=='carousel')throw new Error('Unexpected fixture type');
    draft.slides[1].body='Explain why the action matters.';draft.slides[2].body='Recap the result before moving on.';draft.slides[2].cta='Keep this guide.';expect(representationRealizationIssues(draft,p,'draft',brief)).toEqual([]);
  });
  it('rejects unsupported assets, nonexistent evidence and geometry masquerading as content planning',()=>{
    expect(representationPlanIssues(plan([page({form:'image-story',assetIds:['outside']})]),input()).join(' ')).toMatch(/outside|supplied image/);
    expect(representationPlanIssues(plan([page({form:'data-explanation',evidenceRefs:[99]})]),input()).join(' ')).toMatch(/unknown evidence/);
    expect(representationPlanIssues(plan([page({form:'data-explanation'})]),input()).join(' ')).toMatch(/verified evidence/);
    expect(representationPlanIssues(plan([page({form:'data-explanation',evidenceRefs:['brief']})]),input({brief:'The supplied survey recorded 40 yes and 60 no responses.'}))).toEqual([]);
    expect(()=>plan([page({x:.1,family:'diagram-led'})])).toThrow();
  });
  it('does not repeat invalid planning indefinitely or silently fall back',async()=>{
    let calls=0;await expect(planContentRepresentation(input(),async()=>{calls++;return '{}';})).rejects.toThrow(/Representation planning failed/);expect(calls).toBe(2);
    const rejected:string[]=[];let prompts:string[]=[];
    const result=await planContentRepresentation(input(),async prompt=>{prompts.push(prompt);return prompts.length===1?JSON.stringify(plan([page({assetIds:['outside']})])):JSON.stringify(plan());},error=>rejected.push(error));
    expect(result).toEqual(plan());expect(rejected).toHaveLength(1);expect(prompts[1]).toContain('Previous plan rejected');expect(prompts[0]).toContain('BEFORE copy drafting');expect(representationDraftGuide(result,'')).toContain('Approved content representation');
  });
  it('offers only source artwork and renderable forms in the representation schema',async()=>{
    let prompt='';await planContentRepresentation(input({brand:{...input().brand,assets:[]}}),async p=>{prompt=p;return JSON.stringify(plan());});
    const match=prompt.match(/Return ONLY JSON matching (.*?)\.\nFormat:/s);expect(match).toBeTruthy();
    const schema=JSON.parse(match![1]),page=schema.properties.pages.items;
    expect(page.properties.form.enum).not.toContain('prose');expect(page.properties.form.enum).not.toContain('image-story');expect(page.properties.assetIds.items).toEqual({not:{}});
  });
  it('rejects changed supplied copy across single-page formats',()=>{
    for(const type of ['poster','story','post']as const){const brief='Headline: "Use this exact title." Supporting line: "Exact support."';const p=plan([page({exactCopyRefs:['title','body']})]);const a=SimpleArtifactSchema.parse({type,headline:'Rewritten title',subline:'Exact support.',caption:''});expect(representationRealizationIssues(a,p,'draft',brief).join(' ')).toMatch(/exact source copy changed/);}
  });
  it('requires an actual process after composition without duplicating exact stage copy',()=>{
    const p=plan([page({form:'process'})]);const a=SimpleArtifactSchema.parse({type:'poster',headline:'Keep moving.',subline:'Plan → Build → Review → Learn'});
    expect(representationRealizationIssues(a,p,'draft')).toEqual([]);expect(representationRealizationIssues(a,p,'composed').join(' ')).toMatch(/process/);
    const composed=composePage({title:'Keep moving.',body:'Plan → Build → Review → Learn'},CompositionPlanSchema.parse({family:'diagram-led',bodyMode:'sequence',separator:' → ',intent:{goal:'Show the process',relationship:'sequence',reason:'The approved stages have an explicit order.'}}));
    const result=SimpleArtifactSchema.parse({...a,composition:composed.composition,semanticComponent:composed.semanticComponent,representationPlan:p});expect(representationRealizationIssues(result,p,'composed')).toEqual([]);
    const repaired=applyArtifactPatches(result,{patches:[{target:'page-1',layoutActions:[{action:'align',target:'title',align:'center'}]}],reason:'Align the headline with the process.'},'');expect(repaired.representationPlan).toEqual(p);
  });
  it('uses structured generated content instead of a paragraph for checklists and comparisons',()=>{
    for(const kind of ['checklist','comparison']as const){const p=plan([page({form:kind})]),a=SimpleArtifactSchema.parse({type:'story',headline:'Improve the handoff',subline:'Do better.'});expect(representationRealizationIssues(a,p)).toHaveLength(1);const structured=SimpleArtifactSchema.parse({...a,subline:'',visualContent:{kind,items:[{label:'Prepare',detail:'Make ownership clear.'},{label:'Confirm',detail:'Check the next action.'}]}});expect(representationRealizationIssues(structured,p)).toEqual([]);}
  });
  it('rejects added labels under a restricted exact-copy brief',()=>{
    const brief='Headline: "Keep moving." Supporting line: "Plan → Build → Review → Learn" Use these exact three copy blocks; add no other visible text.';
    const p=plan([page({form:'process',exactCopyRefs:['title','body']})]);
    const a=SimpleArtifactSchema.parse({type:'poster',headline:'Keep moving.',subline:'Plan → Build → Review → Learn',visualContent:{kind:'process',items:[{label:'Invented stage',detail:''}]}});
    expect(representationRealizationIssues(a,p,'draft',brief).join(' ')).toMatch(/unauthorized component label/);
  });
  it('identifies the candidate and page when a statement is given native diagram settings',()=>{
    const artifact=SimpleArtifactSchema.parse({type:'carousel',title:'Guide',caption:'',slides:Array.from({length:3},(_,i)=>({title:`Action ${i+1}`,body:'Explain the action clearly.'}))});
    const make=(family:string,direction='auto')=>({family,intent:{goal:'Explain an action',relationship:'statement',reason:'Use clear hierarchy.'},responsive:{version:1,visual:{treatment:'plain',direction,annotations:[]}}});
    const candidates={candidates:[{pages:[make('oversized-typography'),make('asymmetric-editorial','vertical'),make('modular-grid')]},{pages:[make('asymmetric-editorial'),make('oversized-typography'),make('modular-grid')]}]};
    expect(()=>planArtifactCompositions(artifact,candidates,true)).toThrow(/Candidate 1, page 2:.*direction to auto/);
    candidates.candidates[0].pages[1]=make('asymmetric-editorial');expect(planArtifactCompositions(artifact,candidates,true).candidates).toHaveLength(2);
  });
  it('keeps supplied images bound and rejects unrelated charts for a relationship map',()=>{
    const p=plan([page({form:'image-story',assetIds:['photo']})]),a=SimpleArtifactSchema.parse({type:'story',headline:'Look',subline:'Observe.',assetId:'outside'});expect(representationRealizationIssues(a,p).join(' ')).toMatch(/image/);
    const chart=SimpleArtifactSchema.parse({...a,semanticComponent:createSemanticComponent('pieChart')});expect(representationRealizationIssues(chart,plan([page({form:'relationship-map'})])).join(' ')).toMatch(/relationship-map/);
  });
  it('rejects a supporting paragraph accidentally appended to the final process stage before copy is frozen',()=>{
    const p=plan([page({form:'process'})]);
    const a=SimpleArtifactSchema.parse({type:'story',headline:'Pause before you share.',subline:'Read → Check → Add context. Distinguish source statements from your conclusions and clearly mark interpretations beyond the text.'});
    expect(representationRealizationIssues(a,p,'draft').join(' ')).toContain('Keep the short stage labels separate from the supporting paragraph');
    const good=SimpleArtifactSchema.parse({type:'story',headline:'Pause before you share.',subline:'Distinguish what the source states from what you conclude.',visualContent:{kind:'process',items:[{label:'Read',detail:''},{label:'Check',detail:''},{label:'Add context',detail:''}]}});
    expect(representationRealizationIssues(good,p,'draft')).toEqual([]);
  });
});
