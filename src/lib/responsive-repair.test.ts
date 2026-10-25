import { describe, expect, it } from 'vitest';
import { ResponsivePatchSchema } from './composition-design';
import { applyArtifactPatches } from './artifact-repair';
import { artifactPages, composePage } from './composition';
import { SimpleArtifactSchema } from './simple-content';
import { buildVisualScene, scenePng } from './content-layout';
import { sceneIssues } from './scene-renderer';
import type { ContentBrand } from './content-brand';
import type { VisualFormat } from './responsive-layout';

const brand:ContentBrand={companyId:'test',name:'Sample',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],palette:{background:'#FFFFFF',alternate:'#F1F3F5',ink:'#111111',dark:'#111111',accent:'#0055DD'},assets:[]};
function fixture(){
 const page=composePage({title:'Keep the context',body:'',cta:'Choose a next step',visualContent:{kind:'process',items:[{label:'Inspect',detail:'Read the whole message.'},{label:'Decide',detail:'Keep the useful detail.'}]}},{family:'diagram-led',recipe:{version:1,id:'tahta-timeline'},directionId:'editorial',intent:{goal:'Explain a useful sequence',relationship:'sequence',reason:'Connect the existing actions.'},responsive:{version:1,balance:{version:1},arrangement:'stack',anchor:'center',focal:'artwork',visualWeight:.5,craft:{version:1,surface:'dark',measure:.9},visual:{direction:'vertical',treatment:'plain'},adjustments:[{action:'reflow',arrangement:'stack'}]},typography:{title:{leading:1.05},label:{leading:1.2}}});
 return SimpleArtifactSchema.parse({type:'poster',headline:page.title,subline:page.body,cta:page.cta,visualContent:page.visualContent,composition:page.composition});
}
const patch=(responsive:unknown)=>({reason:'Give this existing explanation a different reading direction',patches:[{target:'page-1',responsive}]});

describe('local structural refinement',()=>{
 it('parses partial controls without inserting new-plan defaults',()=>{
  expect(ResponsivePatchSchema.parse({visual:{direction:'horizontal'}})).toEqual({visual:{direction:'horizontal'}});
  expect(ResponsivePatchSchema.parse({visual:{nodes:'dots'}})).toEqual({visual:{nodes:'dots'}});
  expect(ResponsivePatchSchema.safeParse({visualWeight:.1}).success).toBe(false);
  expect(ResponsivePatchSchema.safeParse({visual:{inventedLabels:['New copy']}}).success).toBe(false);
 });
 it('reorients existing stages while preserving canonical copy, recipe, fonts and craft',()=>{
  const original=fixture(),before=artifactPages(original)[0];
  const fixed=applyArtifactPatches(original,patch({visual:{direction:'horizontal'}}),'');
  const after=artifactPages(fixed)[0];
  expect(after.composition?.responsive).toEqual({...before.composition!.responsive,visual:{...before.composition!.responsive!.visual,direction:'horizontal'}});
  expect(after.composition?.blocks).toEqual(before.composition?.blocks);
  expect(after.composition?.placements).toEqual(before.composition?.placements);
  expect(after.composition?.typography).toEqual(before.composition?.typography);
  expect(after.composition?.recipe).toEqual(before.composition?.recipe);
  expect(after.visualContent).toEqual(before.visualContent);
  expect(before.composition?.responsive?.visual.direction).toBe('vertical');
 });
 it('replaces an old reflow action when a direct arrangement is chosen',()=>{
  const fixed=applyArtifactPatches(fixture(),patch({arrangement:'columns',anchor:'start'}),'');
  const responsive=artifactPages(fixed)[0].composition!.responsive!;
  expect(responsive.arrangement).toBe('columns');expect(responsive.anchor).toBe('start');
  expect(responsive.adjustments.some(action=>action.action==='reflow')).toBe(false);
  expect(responsive.craft).toMatchObject({surface:'dark',measure:.9});
 });
 it('retains measured controls when a full recipe replan omits them',()=>{
  const original=fixture(),before=artifactPages(original)[0];
  const fixed=applyArtifactPatches(original,{reason:'Strengthen headline scale while retaining the measured recipe',patches:[{target:'page-1',compositionPlan:{family:'diagram-led',recipe:before.composition!.recipe,intent:before.composition!.intent,typography:{title:{size:1.2}}}}]},'');
  const after=artifactPages(fixed)[0];expect(after.composition?.responsive).toEqual(before.composition?.responsive);
  expect(after.composition?.recipe).toEqual(before.composition?.recipe);expect(after.composition?.typography?.title?.size).toBe(1.2);
  expect(after.visualContent).toEqual(before.visualContent);expect(original).toEqual(fixture());
 });
 it('clears earlier page transforms explicitly while keeping every other layout setting',()=>{
  const original=fixture(),before=artifactPages(original)[0];
  const fixed=applyArtifactPatches(original,{reason:'Fit larger readable copy without obsolete transforms',patches:[{target:'page-1',resetLayoutActions:true,typography:{detail:{size:1.3}}}]},'');
  const after=artifactPages(fixed)[0];
  expect(after.composition?.responsive).toEqual({...before.composition!.responsive,adjustments:[]});
  expect(after.composition?.recipe).toEqual(before.composition?.recipe);
  expect(after.composition?.blocks).toEqual(before.composition?.blocks);
  expect(before.composition?.responsive?.adjustments).toHaveLength(1);
 });
 it('rejects an invalid visual relationship and a simultaneous copy rewrite without mutating the source',()=>{
  const original=fixture(),before=structuredClone(original);
  expect(()=>applyArtifactPatches(original,patch({visual:{treatment:'annotated',annotations:[{copyId:'invented',x:.5,y:.5}]}}),'')).toThrow('Annotated treatment requires');
  expect(()=>applyArtifactPatches(original,{reason:'Rewrite',patches:[{target:'page-1',title:'A new headline',responsive:{anchor:'start'}}]},'')).toThrow('must preserve approved copy');
  expect(original).toEqual(before);
  expect(()=>applyArtifactPatches(original,patch({}),'')).toThrow('no design change');
 });
 it.each<VisualFormat>(['poster','story','carousel','post','presentation'])('renders a changed native reading direction with connected editable labels in %s',async format=>{
  const original=fixture(),fixed=applyArtifactPatches(original,patch({visual:{direction:'horizontal'}}),'');
  const before=await buildVisualScene(format,artifactPages(original)[0],brand),after=await buildVisualScene(format,artifactPages(fixed)[0],brand);
  await scenePng(before);await scenePng(after);
  expect(sceneIssues(after)).toEqual([]);
  expect(before.responsiveLayout!.groups.find(g=>g.id==='artwork')!.visual!.columns).toBe(1);
  expect(after.responsiveLayout!.groups.find(g=>g.id==='artwork')!.visual!.columns).toBe(2);
  const labels=after.elements.filter(e=>e.kind==='text'&&e.id?.endsWith('.label'));
  expect(labels).toHaveLength(2);expect(labels[0].y).toBeCloseTo(labels[1].y,0);
  expect(after.elements.some(e=>e.kind==='line'&&e.groupId==='artwork')).toBe(true);
 },20000);
});
