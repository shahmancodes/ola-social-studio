import{describe,it,expect}from'vitest';
import{SimpleArtifactSchema,type SimpleArtifact}from'./simple-content';import{SemanticComponentSchema}from'./schemas';import{realizeStatementFields}from'./statement-fields';import{representationCopyPolicy,suppliedCopyIssues}from'./content-representation';import{designerComponent}from'./semantic-designer';import{artifactPages,composePage,withArtifactPages}from'./composition';
const title='A useful answer shows its limits',items=[{label:'Observation',detail:'Say what the source actually shows.'},{label:'Uncertainty',detail:'Name what remains unconfirmed.'},{label:'Next check',detail:'Choose the evidence that would help.'}];
const brief=`Headline: "${title}". Label/detail pairs: ${items.map(i=>`"${i.label}" / "${i.detail}"`).join('; ')}. Closing line: "Leave room for a better answer.". These are complementary information fields, not tasks or stages. Generate no additional visible prose.`;
const representation={version:1,message:'Show the scope of an answer.',sequenceReason:'Three complementary fields, not ordered steps.',pages:[{page:1,role:'hook',goal:'A useful reminder',form:'statement',reason:'The fields support one statement.',supportingCopy:'structured',contentNeeds:['Retain every supplied pair.'],assetIds:[],evidenceRefs:[],exactCopyRefs:representationCopyPolicy(brief).exactCopyRefs.map(r=>r.id)}]};
type Visual=Exclude<SimpleArtifact,{type:'article'}>;type Poster=Extract<SimpleArtifact,{type:'poster'}>;
function fixture(type?:'poster'):Poster;
function fixture(type:'poster'|'story'|'post'|'carousel'|'presentation'):Visual;
function fixture(type:'poster'|'story'|'post'|'carousel'|'presentation'='poster'):Visual{
 const page={id:'page-1',title,body:'',cta:'Leave room for a better answer.',semanticComponent:SemanticComponentSchema.parse({kind:'hubSpoke',prompt:title,items})};
 return SimpleArtifactSchema.parse(type==='carousel'||type==='presentation'?{type,title:'A useful answer',caption:'',slides:[page,{id:'page-2',title:'Keep the source',body:'Read the source carefully.'},{id:'page-3',title:'Make the next check',body:'Choose useful evidence.'}],representationPlan:{...representation,pages:[representation.pages[0],...['context','close'].map((role,i)=>({...representation.pages[0],page:i+2,role,form:'statement',supportingCopy:'supplied',exactCopyRefs:[]}))]}}:{type,headline:title,subline:'',cta:page.cta,caption:'',semanticComponent:page.semanticComponent,representationPlan:type==='post'?{...representation,pages:[{...representation.pages[0],exactCopyRefs:representation.pages[0].exactCopyRefs.filter(r=>r!=='cta')}]}:representation}) as Visual;
}
describe('neutral statement realization before composition',()=>{
 for(const type of ['poster','story','post','carousel','presentation']as const)it(`keeps exact fields independent in ${type} with no new stage or visible words`,()=>{
  const source=fixture(type),testBrief=type==='post'?brief.replace(' Closing line: "Leave room for a better answer.".',''):brief,before=structuredClone(source),result=realizeStatementFields(source,testBrief),page=artifactPages(result.artifact)[0];
  expect(source).toEqual(before);expect(result.changes).toHaveLength(1);expect(page.visualContent).toEqual({kind:'example',items});expect(page.semanticComponent).toBeUndefined();expect(page.title).toBe(title);
  expect(suppliedCopyIssues(result.artifact,testBrief)).toEqual([]);expect(designerComponent(page)).toBeUndefined();expect(realizeStatementFields(result.artifact,testBrief).changes).toEqual([]);
  expect(result.artifact.representationPlan).toEqual(source.representationPlan);
 });
 it('preserves genuine relationship maps and explicit central entities',()=>{
  for(const form of ['relationship-map','process','checklist']as const){const source=fixture();source.representationPlan!.pages[0].form=form;expect(realizeStatementFields(source,brief).artifact).toBe(source);}
  const source=fixture();source.semanticComponent!.prompt='The actual answer';expect(realizeStatementFields(source,brief).changes).toEqual([]);
 });
 it('does not discard independent copy, tags, data, colors, images or existing geometry',()=>{
  const changes:Array<(a:Poster)=>void>=[a=>{a.semanticComponent!.note='Keep this source note';},a=>{a.semanticComponent!.items[0].tag='Evidence';},a=>{a.semanticComponent!.items[0].value=2;},a=>{a.semanticComponent!.items[0].color='#123456';},a=>{a.semanticComponent!.items[0].x=20;},a=>{a.semanticComponent!.style=SemanticComponentSchema.parse({...a.semanticComponent,style:{}}).style;},a=>{if(a.type==='poster')a.assetId='supplied-image';},a=>{if(a.type==='poster')a.subline='Keep this additional explanation.';}];
  for(const mutate of changes){const source=fixture();mutate(source);expect(realizeStatementFields(source,brief).artifact).toBe(source);}
  const source=fixture(),p=composePage(artifactPages(source)[0],{family:'diagram-led',intent:{goal:'Keep the map',relationship:'relationship',reason:'This is an already composed map.'}}),composed=withArtifactPages(source,[p]);expect(realizeStatementFields(composed,brief).artifact).toBe(composed);
 });
 it('requires all exact roles and the approved assignment rather than guessing from several items',()=>{
  for(const mutate of [(a:Poster)=>{a.representationPlan!.pages[0].exactCopyRefs=a.representationPlan!.pages[0].exactCopyRefs.filter(r=>r!=='pair-2-detail');},(a:Poster)=>{a.semanticComponent!.items[1].detail='A rewritten explanation.';},(a:Poster)=>{a.semanticComponent!.items.reverse();},(a:Poster)=>{a.representationPlan!.pages[0].supportingCopy='supplied';}]){const source=fixture();mutate(source);expect(realizeStatementFields(source,brief).artifact).toBe(source);}
  expect(realizeStatementFields(fixture(),'An unstructured reminder.').changes).toEqual([]);
 });
 it('preserves an explicitly requested association even when the generated plan mislabels it a statement',()=>{
  const source=fixture();expect(realizeStatementFields(source,brief+' Show a central-to-peer association.').artifact).toBe(source);
  expect(realizeStatementFields(source,brief.replace('These are complementary information fields, not tasks or stages. ','' )).artifact).toBe(source);
 });
 it('retains supported 72-character semantic labels rather than narrowing their copy budget',()=>{
  const label='A'.repeat(72),source=fixture(),customBrief=brief.replaceAll('Observation',label);source.semanticComponent!.items[0].label=label;
  const result=realizeStatementFields(source,customBrief);expect(result.changes).toHaveLength(1);expect(artifactPages(result.artifact)[0].visualContent!.items[0].label).toBe(label);expect(SimpleArtifactSchema.safeParse(result.artifact).success).toBe(true);
 });
});
