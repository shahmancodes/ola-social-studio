import{describe,it,expect}from'vitest';import{composePage}from'./composition';import{buildVisualScene,scenePng}from'./content-layout';import{sceneIssues}from'./scene-renderer';import{mobileTextEvidence}from'./layout-readability';import{canvasTexts}from'./canvas-text';import type{ContentBrand}from'./content-brand';
const brand:ContentBrand={companyId:'test',name:'Example',description:'',audience:'Readers',voice:'Clear',typography:'',imagery:'',formatRules:'',examples:[],assets:[],palette:{background:'#FFFFFF',alternate:'#EEF1F5',ink:'#111111',dark:'#111111',accent:'#164DA8'}};
const items=[{label:'Observation',detail:'Say what the source actually shows.'},{label:'Uncertainty',detail:'Name what remains unconfirmed.'},{label:'Next check',detail:'Choose the evidence that would help.'}];
const base={family:'modular-grid',intent:{goal:'Present equal complementary fields',relationship:'statement',reason:'Equal unmarked groups retain their label and detail roles.'},responsive:{version:1,balance:{version:1},readability:{version:1},arrangement:'stack'}};
describe('native neutral label/detail fields',()=>{
 for(const format of ['poster','story','carousel','post','presentation']as const)for(const direction of ['vertical','horizontal']as const)it(`measures unmarked editable ${direction} fields in ${format}`,async()=>{
  const page=composePage({title:'A useful answer shows its limits',body:'',visualContent:{kind:'example',items}}, {...base,responsive:{...base.responsive,visual:{direction}}}),before=structuredClone(page),scene=await buildVisualScene(format,page,brand);await scenePng(scene);
  const texts=canvasTexts(scene,page);for(const item of items)for(const value of [item.label,item.detail])expect(texts.filter(t=>t.text===value)).toHaveLength(1);
  expect(scene.elements.some(e=>e.kind==='image'||/native-list-(?:check|number|link|arrow|node)|native-hub/.test(e.id??''))).toBe(false);
  const labels=scene.elements.filter(e=>e.kind==='text'&&e.id?.endsWith('.label'));
  if(direction==='horizontal')expect(new Set(labels.map(e=>e.x)).size).toBe(3);else expect(new Set(labels.map(e=>e.x)).size).toBe(1);
  expect(sceneIssues(scene)).toEqual([]);expect(page).toEqual(before);
  if(['story','carousel','post'].includes(format))expect(mobileTextEvidence(scene).text.filter(t=>t.pixels+.05<t.minimum)).toEqual([]);
 },20000);
 it('reflows narrow fields at readable sizes without dropping their explanations',async()=>{
  const page=composePage({title:'Keep fields readable',body:'',visualContent:{kind:'example',items}}, {...base,responsive:{...base.responsive,arrangement:'columns',visual:{direction:'horizontal'}}}),scene=await buildVisualScene('carousel',page,brand);await scenePng(scene);
  const v=scene.responsiveLayout!.groups.find(g=>g.id==='artwork')!.visual!;expect(v.columns).toBe(1);expect(v.reflow?.fromColumns).toBe(3);expect(sceneIssues(scene)).toEqual([]);
 },20000);
});
