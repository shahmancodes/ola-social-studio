import{describe,it,expect}from'vitest';import{repairSupportingBudgets}from'./copy-budget-repair';import{SimpleArtifactSchema}from'./simple-content';import{supportingCopyBudgetIssues}from'./supporting-copy-budget';
import {composePage} from './composition';
describe('focused supporting copy repair',()=>{
 it('repairs an over-budget page while preserving exact headlines, CTA, facts and other pages',async()=>{
 const a=SimpleArtifactSchema.parse({type:'carousel',title:'Test',caption:'',slides:[{title:'Keep this headline',body:'One two three four five six seven eight nine ten eleven twelve thirteen'},{title:'Valid second page',body:'One two three four'},{title:'Close',body:'One two three four',cta:'Save this.'}]});
 let calls=0;const result=await repairSupportingBudgets(a,'Write 3–6 useful supporting words per page. Headline: "Keep this headline" CTA: "Save this."',async()=>{calls++;return JSON.stringify({edits:[{source:'body',value:'One clear explanation now'}]});});expect(calls).toBe(1);expect(supportingCopyBudgetIssues(result,'Write 3–6 useful supporting words per page.')).toEqual([]);if(result.type==='carousel'){expect(result.slides[0].title).toBe(a.type==='carousel'&&a.slides[0].title);expect(result.slides.slice(1)).toEqual(a.type==='carousel'&&a.slides.slice(1));}
 });
 it('rejects attempts to modify arbitrary fields',async()=>{const a=SimpleArtifactSchema.parse({type:'poster',headline:'Fixed',subline:'One two three four five six seven'});await expect(repairSupportingBudgets(a,'Write 2–4 useful supporting words per page.',async()=>JSON.stringify({edits:[{source:'title',value:'Changed'}]}))).rejects.toThrow();});
 it('counts repeated explanations independently before and after composition',()=>{
  const raw=SimpleArtifactSchema.parse({type:'poster',headline:'Actions',subline:'',semanticComponent:{kind:'checklist',items:[{label:'Plan',detail:'Keep useful context'},{label:'Build',detail:'Keep useful context'}]}});
  const page=composePage({title:'Actions',body:'',semanticComponent:raw.type==='poster'?raw.semanticComponent:undefined},{family:'diagram-led',intent:{goal:'Explain the actions',relationship:'sequence',reason:'Keep each existing explanation editable.'},responsive:{version:1,readability:{version:1}}});
  const composed=SimpleArtifactSchema.parse({...raw,semanticComponent:page.semanticComponent,composition:page.composition});
  for(const source of [raw,composed])expect(supportingCopyBudgetIssues(source,'Write 3–6 useful supporting words per page.')[0]).toContain('totals 8 words');
 });
});

describe('missing supporting prose repair', () => {
 const brief='Write 12–18 useful supporting words per page. Also include exactly these label/detail pairs: "Observation" / "What does the source actually show?"; "Uncertainty" / "What remains unconfirmed?"; "Next check" / "What evidence would help?".';
 const body='Separate what the evidence supports from what still needs checking before drawing a conclusion.';
 const fixture=()=>SimpleArtifactSchema.parse({type:'poster',headline:'Notice the limits',subline:'',visualContent:{kind:'example',items:[{label:'Observation',detail:'What does the source actually show?'},{label:'Uncertainty',detail:'What remains unconfirmed?'},{label:'Next check',detail:'What evidence would help?'}]}});
 it('repairs an empty paragraph with one bounded call and preserves every exact field',async()=>{
  const original=fixture();let calls=0;
  const result=await repairSupportingBudgets(original,brief,async prompt=>{
   calls++;expect(prompt).toContain('IN ADDITION');expect(prompt).toContain('"body":""');
   return JSON.stringify({edits:[{source:'body',value:body}]});
  });
  expect(calls).toBe(1);expect(supportingCopyBudgetIssues(result,brief)).toEqual([]);
  expect(result).toEqual({...original,subline:body});expect(original).toEqual(fixture());
 });
 it('never offers the supplied fields as editable ways to satisfy the prose budget',async()=>{
  await expect(repairSupportingBudgets(fixture(),brief,async()=>JSON.stringify({edits:[{source:'visualContent.items.0.detail',value:body}]}))).rejects.toThrow();
 });
 it('protects exact copy embedded in a longer supporting field',async()=>{
  const artifact=SimpleArtifactSchema.parse({type:'poster',headline:'Fixed',subline:'Some context before Preserve these exact words and extra context afterward.'});
  let calls=0;
  await expect(repairSupportingBudgets(artifact,'Write 2–4 supporting words per page. Supporting line: "Preserve these exact words".',async()=>{calls++;return JSON.stringify({edits:[{source:'body',value:'Lost all required words'}]});})).rejects.toThrow('exact supplied copy');
  expect(calls).toBe(0);
 });
});
