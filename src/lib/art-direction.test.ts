import { expect, it } from 'vitest';
import { planArtDirection, artDirectionCompositionGuide } from './art-direction';
import { BrandDesignSchema } from './brand-design';
import { artifactPages, composePage, setCopyText, planArtifactCompositions } from './composition';
import { SimpleArtifactSchema } from './simple-content';
import type { ContentBrand } from './content-brand';
import { repairCompositionCandidates } from './composition-repair';
import { designerComponent } from './semantic-designer';
import {artifactRepairSchema,applyArtifactPatches,contentForEvidence} from './artifact-repair';

const direction={version:1 as const,referencePrinciples:['Use one strong type hierarchy.'],directions:['phrase','editorial','rhythm'].map(id=>({id,name:id+' direction',idea:'An original reading idea for '+id,attention:'A deliberate focal phrase.',hierarchy:'Headline and support have distinct roles.',rhythm:'Use deliberate visual beats across pages.',assetStrategy:'Use existing text and approved assets only.'}))};
it('uses reference pixels to plan three distinct ideas before drafting',async()=>{
  const result=await planArtDirection({format:'story',brief:'Keep the supplied words.',brand:{assets:[]} as unknown as ContentBrand,referenceNotes:[]},async(prompt,images)=>{expect(prompt).toContain('BEFORE content representation');expect(images).toEqual(['reference-pixels']);return JSON.stringify(direction);},['reference-pixels']);
  expect(result.directions.map(d=>d.id)).toEqual(['phrase','editorial','rhythm']);
});
it('requires one complete composition for each planned direction',()=>{
  const artifact=SimpleArtifactSchema.parse({type:'poster',headline:'One useful thing',subline:'Keep the message clear.',artDirection:direction});
  const candidates=['oversized-typography','asymmetric-editorial','modular-grid'].map((family,i)=>({pages:[{family,directionId:direction.directions[i].id,intent:{goal:'Focus the message',relationship:'statement',reason:'Give each idea a distinct reading path.'},responsive:{version:1}}]}));
  expect(planArtifactCompositions(artifact,{candidates}).candidates).toHaveLength(3);
  expect(()=>planArtifactCompositions(artifact,{candidates:candidates.slice(0,2)})).toThrow(/three complete/);
  candidates[2].pages[0].directionId='wrong';expect(()=>planArtifactCompositions(artifact,{candidates})).toThrow(/preserve directionId/);
});
it('lets user copy edits invalidate styling ranges without blocking the edit',()=>{
  const page=composePage({title:'Make one small thing useful.',body:'Read the context.'},{family:'oversized-typography',intent:{goal:'One message',relationship:'statement',reason:'A strong typographic statement.'},typography:{title:{leading:1.02,breakAfter:[3],emphasis:[{start:3,end:5,treatment:'accent'}]}}});
  const edited=setCopyText(page,'title','Build well.');expect(edited.title).toBe('Build well.');expect(edited.composition?.typography?.title).toEqual({leading:1.02});expect(page.composition?.typography?.title?.breakAfter).toEqual([3]);
});
it('retains native single-item examples instead of inventing annotated-example fields',()=>{
  const page={title:'An example',body:'',visualContent:{kind:'example' as const,items:[{label:'A useful comment',detail:'Could this name describe its purpose?'}]}};
  expect(designerComponent(page)).toBeUndefined();expect(page.visualContent.items).toHaveLength(1);
});

it('repairs a direction binding without redrafting approved geometry or asking a model',async()=>{
 const artifact=SimpleArtifactSchema.parse({type:'poster',headline:'One useful thing',subline:'Keep the message clear.',artDirection:direction});
 const candidates=['oversized-typography','asymmetric-editorial','modular-grid'].map((family,i)=>({pages:[{family,directionId:i===1?'mistyped':direction.directions[i].id,...(i===0?{recipe:{version:1,id:'tahta-lead'}}:{}),intent:{goal:'Focus the message',relationship:'statement',reason:'Give each idea a distinct reading path.'},responsive:{version:1}}]}));
 const result=await repairCompositionCandidates(artifact,{candidates},async()=>{throw Error('No model call is needed for metadata identity.');});
 expect(result.plans.candidates[1].pages[0].directionId).toBe('editorial');expect(result.plans.candidates[1].pages[0].family).toBe('asymmetric-editorial');
});

it('keeps native alternatives native rather than inventing column titles for a paired-row comparison',()=>{
 const page={title:'Compare one detail',body:'',visualContent:{kind:'comparison' as const,items:[{label:'Outer edge',detail:'Follow its shape.'},{label:'Inner lines',detail:'Look for a repeated direction.'}]}};
 expect(designerComponent(page)).toBeUndefined();expect(page.visualContent.items.map(i=>i.label)).toEqual(['Outer edge','Inner lines']);
});
it('scopes craft repair choices to the selected direction and actual page, preserving inherited identity',()=>{
 const plan={family:'asymmetric-editorial',directionId:'editorial',intent:{goal:'One message',relationship:'statement',reason:'Give the supporting text room.'},responsive:{version:1}};
 const page=composePage({title:'One useful thing',body:'Keep the message clear.'},plan);
 const artifact=SimpleArtifactSchema.parse({type:'poster',headline:page.title,subline:page.body,composition:page.composition,artDirection:direction}),schema=artifactRepairSchema(artifact);
 const patch={reason:'Change the hierarchy without renaming the selected idea.',patches:[{target:'page-1',compositionPlan:{...plan,directionId:undefined,typography:{title:{size:1.1}}}}]};
 expect(schema.safeParse({...patch,patches:[{...patch.patches[0],compositionPlan:{...plan,directionId:'invented-orbit'}}]}).success).toBe(false);
 expect(schema.safeParse({...patch,patches:[{...patch.patches[0],target:'page-99'}]}).success).toBe(false);
 expect(schema.safeParse({...patch,patches:[{...patch.patches[0],responsive:{visual:{textFlow:'grouped'}}}]}).success).toBe(false);
 const changed=applyArtifactPatches(artifact,schema.parse(patch),'');expect(artifactPages(changed)[0].composition?.directionId).toBe('editorial');expect(contentForEvidence(changed)).toEqual(contentForEvidence(artifact));
});

it('gives the art director live research and no mandatory editorial or frame treatment',async()=>{
 const visualResearch={summary:'Use contrasting scale to distinguish invitation from details.',layoutPatterns:['An image can carry the invitation.'],toneAndPacing:[],avoid:[],references:[{title:'Observed example',url:'https://example.org/reference',observedPattern:'Image dominance with a compact copy group.',usage:'reference-only' as const}]};
 await planArtDirection({format:'poster',brief:'Invite readers to observe.',brand:{assets:[]} as unknown as ContentBrand,referenceNotes:[],visualResearch},async prompt=>{
  expect(prompt).toContain(JSON.stringify(visualResearch));expect(prompt).toContain('No composition family');
  expect(prompt).not.toContain('An inset frame can open');return JSON.stringify(direction);
 },[]);
 const guide=artDirectionCompositionGuide({...direction,assetRequests:[],directions:direction.directions.map(d=>({...d,assetRequestIds:[]}))});expect(guide).not.toContain('confident editorial interpretation');expect(guide).toContain('There is no family, recipe or decoration quota');
 expect(BrandDesignSchema.parse({}).family).toBeUndefined();
});
it('allows three distinct ideas within the same layout family and retains chosen framing',()=>{
 const artifact=SimpleArtifactSchema.parse({type:'poster',headline:'Look again',subline:'Notice the change.',artDirection:direction});
 const candidates=direction.directions.map((d,i)=>({pages:[{family:'oversized-typography',directionId:d.id,intent:{goal:'Focus the message',relationship:'statement',reason:'The current brief calls for this hierarchy.'},responsive:{version:1,anchor:['start','center','end'][i],craft:{version:1,...(i===2?{rule:'inset',ruleSides:['top','left','bottom']}:{})}}}]}));
 const result=planArtifactCompositions(artifact,{candidates},true);
 expect(result.plans.candidates.map(c=>c.pages[0].family)).toEqual(Array(3).fill('oversized-typography'));
 expect(result.plans.candidates[2].pages[0].responsive?.craft?.ruleSides).toEqual(['top','left','bottom']);
 expect(result.plans.candidates[0].pages[0].responsive?.craft?.rule).toBeUndefined();
});
