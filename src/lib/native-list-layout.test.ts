import {describe,it,expect} from 'vitest';
import {composePage,componentCopySources,copySource,resolvedComponent,setCopyText,pageCompositionCapabilities} from './composition';
import {createSemanticComponent} from './semantic-component-presets';
import {buildVisualScene,scenePng,sceneSvg} from './content-layout';
import {sceneIssues} from './scene-renderer';
import {mobileTextEvidence} from './layout-readability';
import {canvasTexts} from './canvas-text';
import {observeLayout} from './layout-review';
import {SemanticComponentSchema} from './schemas';
import type {ContentBrand} from './content-brand';

const brand:ContentBrand={companyId:'test',name:'Example',description:'',audience:'Readers',voice:'Clear',typography:'Manrope',imagery:'',formatRules:'',examples:[],assets:[],palette:{background:'#FFFFFF',alternate:'#EEF1F5',ink:'#111111',dark:'#111111',accent:'#164DA8'}};
const plan={family:'diagram-led',bodyMode:'text',intent:{goal:'Make each action clear',relationship:'sequence',reason:'Keep existing labels and their useful context together.'},responsive:{version:1,balance:{version:1},readability:{version:1},arrangement:'stack',focal:'artwork'}};

describe('measured native narrative lists',()=>{
 for(const kind of ['checklist','processSteps'] as const)for(const format of ['story','post','carousel','poster','presentation'] as const)it(`${kind} keeps native editable copy in ${format}`,async()=>{
  const component=createSemanticComponent(kind),page=composePage({title:'Make the next action useful',body:'',semanticComponent:component},plan),original=structuredClone(page);
  const scene=await buildVisualScene(format,page,brand);await scenePng(scene);
  expect(scene.elements.filter(e=>e.kind==='image')).toHaveLength(0);
  const texts=canvasTexts(scene,page).filter(t=>t.source.startsWith('semanticComponent.'));
  expect(texts.length).toBe(componentCopySources(page).filter(s=>copySource(page,s).trim()).length);
  for(const field of texts)expect(sceneSvg(scene)).toContain(field.text);
  if(['story','post','carousel'].includes(format))expect(mobileTextEvidence(scene).text.filter(t=>t.pixels+.05<t.minimum)).toEqual([]);
  expect(sceneIssues(scene)).toEqual([]);expect(page).toEqual(original);expect(resolvedComponent(page)).toEqual(component);
  expect(scene.elements.some(e=>e.id?.startsWith(kind==='processSteps'?'native-list-link-':'native-list-check-'))).toBe(true);
  expect(JSON.parse(observeLayout(scene).readingSignature!).visual.mode).toBe(kind==='processSteps'?'connected':'grid');
 },20000);
 it('retains header, footer, tag and detail fields exactly once',async()=>{
  const c=createSemanticComponent('processSteps');c.items=c.items.slice(0,2);
  Object.assign(c,{prompt:'Shared context',answer:'A useful explanation',leftTitle:'First heading',rightTitle:'Second heading',takeaway:'Keep the work moving',note:'Source note',unit:'Working days'});
  c.items.forEach((item,i)=>{item.tag=`Stage ${i+1}`;});
  const page=composePage({title:'Show the handoff',body:'',semanticComponent:c},{...plan,responsive:{...plan.responsive,visual:{direction:'vertical',treatment:'cards'}}});
  const scene=await buildVisualScene('carousel',page,brand);await scenePng(scene);
  for(const slot of componentCopySources(page).filter(s=>copySource(page,s).trim()))expect(scene.elements.filter(e=>e.kind==='text'&&e.copySource===slot)).toHaveLength(1);
  expect(scene.elements.filter(e=>e.id?.startsWith('native-list-card-'))).toHaveLength(2);expect(sceneIssues(scene)).toEqual([]);
  expect(observeLayout(scene).panels).toHaveLength(2);expect(observeLayout(scene).unrequestedPanels).toEqual([]);
 },20000);
 it('reflows narrow columns based on measured words while retaining labels and their links',async()=>{
  const c=createSemanticComponent('processSteps');c.items=c.items.slice(0,2);c.prompt='';
  c.items[0].detail='Offer a possible improvement, not a demand.';c.items[1].detail='The author may know constraints you do not.';
  const page=composePage({title:'Offer a possibility',body:'',semanticComponent:c},{...plan,family:'modular-grid',responsive:{...plan.responsive,arrangement:'columns',craft:{version:1,measure:.9},visual:{direction:'horizontal'}}});
  expect(pageCompositionCapabilities(page).visualDirections).toContain('horizontal');
  const scene=await buildVisualScene('carousel',page,brand);await scenePng(scene);
  const visual=scene.responsiveLayout!.groups.find(g=>g.id==='artwork')!.visual!;
  expect(visual.columns).toBe(1);expect(visual.reflow?.fromColumns).toBe(2);
  expect(mobileTextEvidence(scene).text.filter(t=>t.pixels+.05<t.minimum)).toEqual([]);expect(sceneIssues(scene)).toEqual([]);
  const detail=canvasTexts(scene,page).find(t=>t.source==='semanticComponent.items.0.detail')!;
  const edited=setCopyText(page,detail.copyId!,'Offer one useful alternative.');expect(resolvedComponent(edited)?.items[0].detail).toBe('Offer one useful alternative.');
 },20000);
 it('retains saved legacy rendering until the reading policy is enabled',async()=>{
  const c=createSemanticComponent('checklist'),page=composePage({title:'Agree on a next step',body:'',semanticComponent:c},{...plan,responsive:{version:1,balance:{version:1}}});
  const scene=await buildVisualScene('carousel',page,brand);await scenePng(scene);
  expect(scene.elements.some(e=>e.kind==='image'&&e.embeddedText)).toBe(true);
  expect(mobileTextEvidence(scene).text.some(t=>t.pixels<t.minimum)).toBe(true);
 },20000);
 it('edits one repeated explanation without changing the other canonical list entries',()=>{
  const page=composePage({title:'Work through the checklist',body:'',semanticComponent:createSemanticComponent('checklist')},plan);
  const block=page.composition!.blocks.find(b=>b.source==='semanticComponent.items.0.detail')!;
  const edited=setCopyText(page,block.id,'Explain just the first action.');
  expect(resolvedComponent(edited)?.items.map(item=>item.detail)).toEqual(['Explain just the first action.','Add a short explanation','Add a short explanation']);
  expect(resolvedComponent(page)?.items[0].detail).toBe('Add a short explanation');
 });
 it('retains explicit comparison segmentation instead of adding action-list semantics',async()=>{
  const page=composePage({title:'Consider both views',body:'One view | Another view'},{...plan,family:'comparison',bodyMode:'comparison',separator:' | '});
  const scene=await buildVisualScene('carousel',page,brand);await scenePng(scene);
  expect(scene.responsiveLayout!.groups.find(g=>g.id==='artwork')!.visual!.mode).toBe('comparison');
  expect(scene.elements.some(e=>e.id?.startsWith('native-list-check-'))).toBe(false);expect(sceneIssues(scene)).toEqual([]);
 },20000);
 it('retains explicit component colors and heading/body font choices',async()=>{
  const component=SemanticComponentSchema.parse({...createSemanticComponent('processSteps'),style:{foreground:'#182740',muted:'#57514A',fontFamily:'serif',headingFontFamily:'poppins'}});
  const page=composePage({title:'Keep the context',body:'',semanticComponent:component},plan),scene=await buildVisualScene('carousel',page,brand);
  const header=scene.elements.find(e=>e.id==='semanticComponent.prompt'),detail=scene.elements.find(e=>e.id==='semanticComponent.items.0.detail');
  expect(header).toMatchObject({color:'#182740',fontFamily:'Poppins'});expect(detail).toMatchObject({color:'#57514A',fontFamily:'Georgia'});
 });
});

it.each(['story','post','carousel','poster','presentation'] as const)('renders one checklist item as editable native text in %s without filler',async format=>{
 const checklist=SemanticComponentSchema.parse({kind:'checklist',items:[{label:'Evidence fit',detail:'Can you access it now?'}]});
 const page=composePage({title:'Make one practical check',body:'',semanticComponent:checklist},plan);
 const scene=await buildVisualScene(format,page,brand);await scenePng(scene);
 expect(sceneIssues(scene)).toEqual([]);expect(scene.elements.filter(e=>e.kind==='text'&&e.copySource==='semanticComponent.items.0.label')).toHaveLength(1);expect(scene.elements.filter(e=>e.kind==='text'&&e.copySource==='semanticComponent.items.0.detail')).toHaveLength(1);
 expect(scene.elements.some(e=>e.id?.startsWith('semanticComponent.items.1'))).toBe(false);
});
