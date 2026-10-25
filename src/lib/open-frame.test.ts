import{describe,it,expect}from'vitest';import{artifactPages,composePage}from'./composition';import{buildVisualScene,scenePng}from'./content-layout';import{applyArtifactPatches}from'./artifact-repair';import{SimpleArtifactSchema}from'./simple-content';import{CraftPatchSchema}from'./composition-design';import{sceneIssues}from'./scene-renderer';import type{ContentBrand}from'./content-brand';
const brand:ContentBrand={companyId:'test',name:'Example',description:'',audience:'Readers',voice:'Clear',typography:'',imagery:'',formatRules:'',examples:[],assets:[],palette:{background:'#FFFFFF',alternate:'#EEF1F5',ink:'#111111',dark:'#111111',accent:'#164DA8'}};
const plan={family:'asymmetric-editorial',intent:{goal:'Leave room for a better answer',relationship:'statement',reason:'An open boundary frames the message without closing it.'},responsive:{version:1,balance:{version:1},readability:{version:1},craft:{version:1,surface:'background',measure:.9,rule:'inset'}},typography:{title:{size:1.1}}};
const page=composePage({title:'Leave room to reconsider',body:'Check what the source actually shows.'},plan),artifact=SimpleArtifactSchema.parse({type:'poster',headline:page.title,subline:page.body,composition:page.composition});
const patch=(ruleSides:unknown)=>({reason:'Open the frame while retaining the reading structure',patches:[{target:'page-1',craft:{ruleSides}}]});
describe('customizable native frame sides',()=>{
 for(const format of ['poster','story','carousel','post','presentation']as const)it(`opens a chosen side and restores exact default pixels in ${format}`,async()=>{
  const before=structuredClone(artifact),opened=applyArtifactPatches(artifact,patch(['top','left','bottom']),''),reset=applyArtifactPatches(opened,patch(null),'');
  const originalScene=await buildVisualScene(format,page,brand),openScene=await buildVisualScene(format,artifactPages(opened)[0],brand),resetScene=await buildVisualScene(format,artifactPages(reset)[0],brand);
  const originalPng=await scenePng(originalScene),openPng=await scenePng(openScene),resetPng=await scenePng(resetScene);
  expect(openPng.equals(originalPng)).toBe(false);expect(resetPng.equals(originalPng)).toBe(true);
  expect(openScene.elements.filter(e=>e.id?.startsWith('craft-rule-')).map(e=>e.id)).toEqual(['craft-rule-top','craft-rule-left','craft-rule-bottom']);
  expect(openScene.elements.filter(e=>e.kind==='text')).toEqual(originalScene.elements.filter(e=>e.kind==='text'));
  expect(sceneIssues(openScene)).toEqual([]);expect(artifact).toEqual(before);
 },20000);
 it('rejects unknown, duplicated or empty side selections without inserting defaults',()=>{
  expect(CraftPatchSchema.parse({ruleSides:['left']})).toEqual({ruleSides:['left']});
  for(const ruleSides of [[],['top','top'],['diagonal']])expect(CraftPatchSchema.safeParse({ruleSides}).success).toBe(false);
 });
 it('retains top-only and no-rule modes regardless of an inherited side selection',async()=>{
  const opened=applyArtifactPatches(artifact,patch(['left','bottom']),'');
  for(const rule of ['none','top']as const){const fixed=applyArtifactPatches(opened,{reason:'Use the requested rule mode',patches:[{target:'page-1',craft:{rule}}]},''),scene=await buildVisualScene('poster',artifactPages(fixed)[0],brand);await scenePng(scene);expect(scene.elements.filter(e=>e.id?.startsWith('craft-rule-')).map(e=>e.id)).toEqual(rule==='none'?[]:['craft-rule-top']);}
 },20000);
});
