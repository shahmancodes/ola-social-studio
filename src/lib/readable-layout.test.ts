import { describe, expect, it } from 'vitest';
import { mobileMinimumFontSize, mobileTextEvidence } from './layout-readability';
import { artifactPages, composePage, planArtifactCompositions } from './composition';
import { applyArtifactPatches } from './artifact-repair';
import { SimpleArtifactSchema } from './simple-content';
import { SemanticComponentSchema } from './schemas';
import { buildVisualScene, scenePng } from './content-layout';
import { sceneIssues } from './scene-renderer';
import { observeLayout } from './layout-review';
import type { ContentBrand } from './content-brand';

const brand:ContentBrand={companyId:'test',name:'Example',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],assets:[],palette:{background:'#FFFFFF',alternate:'#EEEEEE',ink:'#111111',dark:'#111111',accent:'#164DB8'}};
const source={title:'Keep the context',body:'',cta:'Choose a next step',visualContent:{kind:'process' as const,items:[{label:'Inspect',detail:'Read the whole message.'},{label:'Decide',detail:'Keep the useful detail.'}]}};
const plan={family:'diagram-led',intent:{goal:'Explain a useful sequence',relationship:'sequence',reason:'Keep the actions connected.'},responsive:{version:1,balance:{version:1}},typography:{label:{size:.7},detail:{size:.7},cta:{size:.7}}};

describe('readable first-render defaults',()=>{
 it('enables the versioned policy for new pipeline candidates without mutating the input plan',()=>{
  const artifact=SimpleArtifactSchema.parse({type:'story',headline:'Keep the context',subline:'Read the whole message.',cta:'Save'});
  const input={candidates:[{pages:[{...plan,family:'oversized-typography'}]},{pages:[{...plan,family:'asymmetric-editorial'}]}]},before=structuredClone(input);
  const result=planArtifactCompositions(artifact,input,true);
  for(const candidate of result.candidates)expect(artifactPages(candidate)[0].composition?.responsive?.readability).toEqual({version:1});
  expect(input).toEqual(before);
 });
 it.each(['story','carousel','post'] as const)('keeps all primary native text readable on first render in %s',async format=>{
  const page=composePage(source,{...plan,responsive:{...plan.responsive,readability:{version:1}}});
  const scene=await buildVisualScene(format,page,brand);await scenePng(scene);
  const text=mobileTextEvidence(scene).text;
  expect(text.length).toBeGreaterThan(4);expect(text.every(t=>t.pixels+.01>=t.minimum)).toBe(true);
  expect(sceneIssues(scene)).toEqual([]);
  expect(page.visualContent).toEqual(composePage(source,plan).visualContent);
 },20000);
 it('leaves legacy sizing intact until the saved composition is explicitly upgraded',async()=>{
  const page=composePage(source,plan),artifact=SimpleArtifactSchema.parse({type:'story',headline:page.title,subline:page.body,cta:page.cta,composition:page.composition,visualContent:page.visualContent});
  const old=await buildVisualScene('story',page,brand);await scenePng(old);
  expect(mobileTextEvidence(old).text.some(t=>t.pixels<t.minimum)).toBe(true);
  const upgraded=applyArtifactPatches(artifact,{reason:'Keep existing copy readable during fitting',patches:[{target:'page-1',responsive:{readability:{version:1}}}]},'');
  const next=await buildVisualScene('story',artifactPages(upgraded)[0],brand);await scenePng(next);
  expect(mobileTextEvidence(next).text.every(t=>t.pixels+.01>=t.minimum)).toBe(true);
  expect(artifactPages(artifact)[0].composition?.responsive?.readability).toBeUndefined();
 },20000);
 it('retains the reading policy when a later repair replans the composition',()=>{
  const page=composePage(source,{...plan,responsive:{...plan.responsive,readability:{version:1}}});
  const artifact=SimpleArtifactSchema.parse({type:'story',headline:page.title,subline:page.body,cta:page.cta,composition:page.composition,visualContent:page.visualContent});
  const next=applyArtifactPatches(artifact,{reason:'Use a new reading path while retaining readability',patches:[{target:'page-1',compositionPlan:{...plan,family:'oversized-typography'}}]},'');
  expect(artifactPages(next)[0].composition?.responsive?.readability).toEqual({version:1});
 });
 it('keeps data values readable as well as their editable native labels',async()=>{
  const page=composePage({title:'Compare the reported shares',body:'',semanticComponent:SemanticComponentSchema.parse({kind:'barChart',unit:'%',items:[{label:'A',value:25},{label:'B',value:40}]})},{...plan,recipe:{version:1,id:'tahta-stats'},responsive:{...plan.responsive,readability:{version:1}}});
  const scene=await buildVisualScene('carousel',page,brand);await scenePng(scene);
  const values=mobileTextEvidence(scene).text.filter(t=>t.id.startsWith('metric-value-'));
  expect(values).toHaveLength(2);expect(values.every(t=>t.pixels>=t.minimum)).toBe(true);expect(sceneIssues(scene)).toEqual([]);
  expect(mobileMinimumFontSize('metric-value-0',1080)).toBe(33);expect(mobileMinimumFontSize('credit',1080)).toBeUndefined();
 },20000);
 it.each([undefined,'tahta-timeline'] as const)('reflows nested process columns from actual measurements with recipe %s',async recipe=>{
  const content={title:'Offer a possibility',body:'',visualContent:{kind:'process' as const,items:[{label:'Suggest an option',detail:'Offer a possible improvement, not a demand.'},{label:'Preserve agency',detail:'The author may know constraints you do not.'}]}};
  const page=composePage(content,{...plan,family:recipe?'diagram-led':'modular-grid',...(recipe?{recipe:{version:1,id:recipe}}:{}),typography:{detail:{leading:1.25}},responsive:{version:1,balance:{version:1},readability:{version:1},arrangement:'columns',focal:'artwork',gap:.04,craft:{version:1,measure:.9},visual:{direction:'horizontal',treatment:'plain'}}});
  const before=structuredClone(page),scene=await buildVisualScene('carousel',page,brand);await scenePng(scene);
  const visual=scene.responsiveLayout!.groups.find(g=>g.id==='artwork')!.visual!;
  expect(visual.columns).toBe(1);expect(visual.reflow?.fromColumns).toBe(2);
  expect(scene.responsiveLayout!.config.visual.direction).toBe('horizontal');
  expect(observeLayout(scene).reflows).toMatchObject([{group:'artwork',fromColumns:2}]);
  expect(mobileTextEvidence(scene).text.every(t=>t.pixels+.01>=t.minimum)).toBe(true);
  expect(scene.elements.some(e=>e.id?.startsWith('stage-connector-0'))).toBe(true);
  for(const item of content.visualContent.items)for(const text of [item.label,item.detail])expect(scene.elements.filter(e=>e.kind==='text'&&e.text===text)).toHaveLength(1);
  expect(sceneIssues(scene)).toEqual([]);expect(page).toEqual(before);
 },20000);
 it('keeps a horizontal process when its measured reading regions fit',async()=>{
  const page=composePage(source,{...plan,responsive:{version:1,balance:{version:1},readability:{version:1},arrangement:'stack',visual:{direction:'horizontal'}}});
  const scene=await buildVisualScene('carousel',page,brand);await scenePng(scene);
  expect(scene.responsiveLayout!.groups.find(g=>g.id==='artwork')!.visual!.columns).toBe(2);
  expect(observeLayout(scene).reflows).toBeUndefined();expect(sceneIssues(scene)).toEqual([]);
 },20000);
 it('reports measured capacity when reflow still cannot fit an unbreakable source word',async()=>{
  const page=composePage({...source,visualContent:{kind:'process',items:[{label:'Inspect',detail:'AnUnbreakableSourceWordThatCannotFitInAnyAvailableReadingRegion'},{label:'Decide',detail:'Keep the useful detail.'}]}},{...plan,responsive:{version:1,balance:{version:1},readability:{version:1},arrangement:'columns',visual:{direction:'horizontal'}}});
  const scene=await buildVisualScene('carousel',page,brand);
  await expect(scenePng(scene)).rejects.toThrow(/Text does not fit: visualContent.items.0.detail \(minimum 33.0px; region .*a word needs more width/);
 },20000);
 it('measures internal SVG and HTML labels inside a contained legacy diagram image',async()=>{
  const component=SemanticComponentSchema.parse({kind:'venn',prompt:'Connect evidence to impact',leftTitle:'Observed evidence',rightTitle:'Possible impact',items:[{label:'Observed issue',detail:'Name the behavior.'},{label:'Possible effect',detail:'Explain the effect.'},{label:'Reasoned link',detail:'Use cautious language.'}]});
  const page=composePage({title:'Explain the consequence',body:'',semanticComponent:component},{...plan,responsive:{version:1,balance:{version:1},readability:{version:1},arrangement:'columns'}});
  const scene=await buildVisualScene('carousel',page,brand);await scenePng(scene);
  const diagram=scene.elements.find(e=>e.kind==='image'&&e.id==='artwork');
  if(diagram?.kind!=='image')throw Error('Missing component image.');
  expect(diagram.embeddedText?.text.some(t=>t.content.includes('Observed'))).toBe(true);
  const evidence=mobileTextEvidence(scene).text.filter(t=>t.id==='artwork');
  expect(evidence.length).toBeGreaterThan(4);expect(evidence.some(t=>t.pixels<11)).toBe(true);
  const first=evidence[0],measured=diagram.embeddedText!.text[0];
  expect(first.pixels).toBeCloseTo(measured.size*diagram.w/diagram.embeddedText!.width*360/scene.width);
  expect(first.content).toBe(measured.content);
 },20000);
 it('permits deliberate type ratios while the measured social reading floors remain authoritative',async()=>{
  const page=composePage({title:'Leave room to reconsider.',body:'A thoughtful choice stays clear without pushing the reader.',cta:'Rewrite one unclear choice.'},{...plan,family:'oversized-typography',typography:{title:{size:1.8},body:{size:.55},cta:{size:.5}},responsive:{version:1,balance:{version:1},readability:{version:1}}});
  const scene=await buildVisualScene('story',page,brand);await scenePng(scene);
  expect(page.composition?.typography).toMatchObject({title:{size:1.8},body:{size:.55},cta:{size:.5}});
  expect(mobileTextEvidence(scene).text.every(t=>t.pixels+.01>=t.minimum)).toBe(true);expect(sceneIssues(scene)).toEqual([]);
 },20000);
});
