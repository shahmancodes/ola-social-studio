import {describe,it,expect} from 'vitest';import sharp from 'sharp';
import sample from '../../examples/design-primitives.json';
import {SemanticDesignSpecSchema,COMPONENT_FORMATS,componentSources} from './semantic-design';import {SemanticComponentSchema} from './schemas';
import {composePage,artifactPages} from './composition';import {SimpleArtifactSchema} from './simple-content';import {applyArtifactPatches,contentForEvidence} from './artifact-repair';
import {buildVisualScene,scenePng} from './content-layout';import {semanticDesignBlock} from './semantic-design-render';import {sceneIssues} from './scene-renderer';import {sceneTargets} from './composition-scene';
import type {ContentBrand} from './content-brand';
const component=SemanticComponentSchema.parse(sample.semanticComponent),spec=SemanticDesignSpecSchema.parse(sample.spec);
const source={title:sample.title,body:'',semanticComponent:component,semanticDesign:{candidateId:'a1000000-0000-4000-8000-000000000000',spec}};
const brand:ContentBrand={companyId:'fixture',name:'Sample',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],assets:[],palette:{background:'#F7F6F2',alternate:'#E9EEF5',accent:'#174A80',ink:'#152A40',dark:'#152A40'}};
const plan={family:'diagram-led',intent:{goal:spec.purpose,relationship:'sequence',reason:'Keep each action and its explanation closely related.'},responsive:{version:1,balance:{version:1},readability:{version:1},arrangement:'stack',focal:'artwork',visualWeight:.6}};
describe('shared grouped semantic text typesetting',()=>{
 for(const format of COMPONENT_FORMATS)it(`packs canonical fields with one measured gap and native routes in ${format}`,async()=>{
  const grouped=structuredClone(source);grouped.semanticDesign.spec.textFlow='grouped';const original=structuredClone(grouped);
  const page=composePage(grouped,plan),scene=format==='article'?semanticDesignBlock(grouped,brand):await buildVisualScene(format,page,brand);
  await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);expect(grouped).toEqual(original);
  const evidence=sceneTargets(scene).semanticFlow!;expect(evidence).toHaveLength(2);
  for(const group of evidence){const label=scene.elements.find(e=>e.id===group.sources[0]),detail=scene.elements.find(e=>e.id===group.sources[1]);if(label?.kind!=='text'||detail?.kind!=='text')throw Error('Missing canonical field');expect(detail.y-label.y-label.h).toBeCloseTo(group.gap);expect(group.overflow).toBe(0);}
  expect(scene.elements.filter(e=>e.id?.startsWith('designed-shape-'))).toHaveLength(2);expect(scene.elements.some(e=>e.kind==='line'&&e.arrow==='end')).toBe(true);
  for(const key of componentSources(component))expect(scene.elements.filter(e=>e.kind==='text'&&e.copySource===key)).toHaveLength(1);
 },30000);
 it('can repair spacing with one partial control and restore the exact original pixels',async()=>{
  const page=composePage(source,plan),artifact=SimpleArtifactSchema.parse({type:'poster',headline:source.title,subline:'',semanticComponent:component,semanticDesign:source.semanticDesign,composition:page.composition});
  const beforeScene=await buildVisualScene('poster',artifactPages(artifact)[0],brand),before=await scenePng(beforeScene);
  const changed=applyArtifactPatches(artifact,{reason:'Keep each explanation close to its label.',patches:[{target:'page-1',responsive:{visual:{textFlow:'grouped'}}}]},'Preserve this exact supplied copy.');
  expect(contentForEvidence(changed)).toEqual(contentForEvidence(artifact));expect(artifactPages(changed)[0].semanticDesign).toEqual(source.semanticDesign);
  const grouped=await buildVisualScene('poster',artifactPages(changed)[0],brand);await scenePng(grouped);expect(sceneTargets(grouped).semanticFlow).toHaveLength(2);
  const restored=applyArtifactPatches(changed,{reason:'Restore independent regions.',patches:[{target:'page-1',responsive:{visual:{textFlow:'regions'}}}]},'Preserve this exact supplied copy.');
  const reverted=await buildVisualScene('poster',artifactPages(restored)[0],brand),after=await scenePng(reverted);
  expect((await sharp(after).raw().toBuffer()).equals(await sharp(before).raw().toBuffer())).toBe(true);
 });
 it('rejects a flow repair on an unsupported visual rather than silently ignoring it',()=>{
  expect(()=>composePage({title:'A plain statement',body:'Preserve this sentence.'},{...plan,family:'asymmetric-editorial',responsive:{...plan.responsive,visual:{textFlow:'grouped'}}})).toThrow(/Text flow requires/);
 });
});
