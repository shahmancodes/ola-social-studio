import {describe,it,expect} from 'vitest';
import sample from '../../examples/design-primitives.json';
import {SemanticDesignSpecSchema,COMPONENT_FORMATS,componentSources} from './semantic-design';
import {SemanticComponentSchema} from './schemas';
import {composePage} from './composition';
import {buildVisualScene,scenePng} from './content-layout';
import {semanticDesignBlock} from './semantic-design-render';
import {sceneIssues} from './scene-renderer';
import {sceneTargets} from './composition-scene';
import type {ContentBrand} from './content-brand';
const spec=SemanticDesignSpecSchema.parse(sample.spec);
for(const p of Object.values(spec.profiles))p.boxes=[{id:'observe',x:.08,y:.12,w:.34,h:.04},{id:'evidence',x:.08,y:.42,w:.34,h:.4},{id:'respond',x:.58,y:.12,w:.34,h:.04},{id:'action',x:.58,y:.42,w:.34,h:.4}];
const component=SemanticComponentSchema.parse({...sample.semanticComponent,items:[{label:'Carefully reasoned concern',detail:'Read the evidence.'},sample.semanticComponent.items[1]]});
const brand:ContentBrand={companyId:'fixture',name:'Sample',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],assets:[],palette:{background:'#F7F6F2',alternate:'#E9EEF5',accent:'#174A80',ink:'#152A40',dark:'#152A40'}};
const source={title:sample.title,body:'',semanticComponent:component,semanticDesign:{candidateId:'a1000000-0000-4000-8000-000000000000',spec}};
const plan={family:'diagram-led',intent:{goal:spec.purpose,relationship:'sequence',reason:'Keep ordered stages and their explanatory details connected.'},responsive:{version:1,balance:{version:1},readability:{version:1},arrangement:'stack',focal:'artwork',visualWeight:.6}};
describe('measured semantic region growth in real renders',()=>{
 for(const format of COMPONENT_FORMATS)it(`keeps wrapped labels readable and editable in ${format}, updating grouping, routes and evidence`,async()=>{
  const original=structuredClone(source),page=composePage(source,plan),scene=format==='article'?semanticDesignBlock(source,brand):await buildVisualScene(format,page,brand);
  await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);expect(source).toEqual(original);
  const label=scene.elements.find(e=>e.id==='semanticComponent.items.0.label');if(label?.kind!=='text')throw Error('Missing canonical label.');
  expect(label.lines.length).toBeGreaterThan(format==='presentation'?0:1);expect(label.text).toBe(component.items[0].label);
  const fit=sceneTargets(scene).semanticFit?.find(f=>f.source===label.id);expect(fit).toBeDefined();expect(fit!.resolvedHeight).toBeGreaterThan(fit!.declaredHeight);expect(fit!.measuredHeight).toBeLessThanOrEqual(fit!.capacity+.5);
  if(['story','carousel','post'].includes(format)){expect(label.size).toBe(36);expect(label.minSize).toBe(33);}
  expect(scene.elements.some(e=>e.kind==='line'&&e.arrow==='end')).toBe(true);
  for(const key of componentSources(component))expect(scene.elements.filter(e=>e.kind==='text'&&e.copySource===key)).toHaveLength(1);
 },30000);
 it('still rejects a word that cannot fit the unchanged width at the reading minimum',async()=>{
  const impossible=structuredClone(source);impossible.semanticComponent.items[0].label='Unbreakable'.repeat(6);
  const page=composePage(impossible,plan),scene=await buildVisualScene('carousel',page,brand);
  await expect(scenePng(scene)).rejects.toThrow(/word needs more width/);
  expect(impossible.semanticComponent.items[0].label).toBe('Unbreakable'.repeat(6));
 });
});
