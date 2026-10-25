import {describe,it,expect} from 'vitest';
import {composePage,resolvedComponent} from './composition';
import {SemanticComponentSchema} from './schemas';
import {buildVisualScene,scenePng} from './content-layout';
import {sceneIssues} from './scene-renderer';
import {mobileTextEvidence} from './layout-readability';
import {canvasTexts} from './canvas-text';
import {renderSemanticComponentPng} from './semantic-component-image';
import {missingRenderedCopy} from './rendered-copy';
import {observeLayout} from './layout-review';
import type {ContentBrand} from './content-brand';
const brand:ContentBrand={companyId:'test',name:'Example',description:'',audience:'Readers',voice:'Clear',typography:'',imagery:'',formatRules:'',examples:[],assets:[],palette:{background:'#FFFFFF',alternate:'#EEF1F5',ink:'#111111',dark:'#111111',accent:'#164DA8'}};
const title='A useful answer shows its limits';
const component=SemanticComponentSchema.parse({kind:'hubSpoke',prompt:title,items:[{label:'Observation',detail:'Say what the source actually shows.'},{label:'Uncertainty',detail:'Name what remains unconfirmed.'},{label:'Next check',detail:'Choose the evidence that would help.'}]});
const plan={family:'asymmetric-editorial',bodyMode:'text',intent:{goal:'Show the answer and its three facets',relationship:'relationship',reason:'The three peers share one central context without connecting to each other.'},typography:{title:{maxLines:2,size:1.35},label:{size:.85},detail:{size:.92}},responsive:{version:1,balance:{version:1},readability:{version:1},arrangement:'stack',visual:{nodes:'none'}}};
describe('source-faithful hub rendering',()=>{
 for(const format of ['poster','story','carousel','post','presentation'] as const)it(`draws the central headline and every paired detail as measured editable text in ${format}`,async()=>{
  const page=composePage({title,body:'',cta:'Leave room for a better answer.',semanticComponent:component},plan),before=structuredClone(page);
  const scene=await buildVisualScene(format,page,brand);await scenePng(scene);
  expect(scene.elements.some(e=>e.kind==='image')).toBe(false);
  const text=canvasTexts(scene,page);expect(text.filter(t=>t.text===title)).toHaveLength(1);
  for(const item of component.items)for(const value of [item.label,item.detail])expect(text.filter(t=>t.text===value)).toHaveLength(1);
  const headline=scene.elements.find(e=>e.kind==='text'&&e.copySource==='title');expect(headline?.kind==='text'&&headline.lines.length).toBeLessThanOrEqual(2);
  expect(scene.elements.filter(e=>e.id?.startsWith('native-hub-peer-'))).toHaveLength(3);
  expect(scene.elements.some(e=>/native-list-(link|arrow|check|number)/.test(e.id??''))).toBe(false);
  expect(JSON.parse(observeLayout(scene).readingSignature!).visual.mode).toBe('association');
  expect(sceneIssues(scene)).toEqual([]);expect(page).toEqual(before);expect(resolvedComponent(page)).toEqual(component);
  if(['story','carousel','post'].includes(format))expect(mobileTextEvidence(scene).text.filter(t=>t.pixels+.05<t.minimum)).toEqual([]);
 },20000);
 it('rejects legacy omitted fields rather than accepting descriptions as rendered text',async()=>{
  await expect(renderSemanticComponentPng(component,undefined,undefined,{width:1000,height:500,fontCss:'',sourceCopyOnly:true})).rejects.toThrow('renderer omitted canonical copy: semanticComponent.items.0.detail');
 },20000);
 it('compares Unicode visible glyphs across line wraps without accepting unrelated words',()=>{
  const required=[{source:'label',text:'Uncertainty'},{source:'detail',text:'**Name** what remains unconfirmed.'}];
  expect(missingRenderedCopy(required,['Uncer tainty','Name what remains\nunconfirmed.'])).toEqual([]);
  expect(missingRenderedCopy(required,['Uncertainty','Name what remains confirmed.'])).toEqual(['detail']);
 });
});

it('fails closed when a native component cannot draw an independent source field',async()=>{
 const page=composePage({title:'Two peers',body:'',semanticComponent:SemanticComponentSchema.parse({kind:'relatedPair',items:[{label:'One',detail:'Keep this explanation.',tag:'First tag'},{label:'Two',detail:'Keep this explanation.',tag:'Second tag'}]})},plan);
 await expect(buildVisualScene('poster',page,brand)).rejects.toThrow('Rendered composition omitted canonical copy: semanticComponent.items.0.tag');
});
