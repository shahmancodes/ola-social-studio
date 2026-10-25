import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {composePage,COMPOSITION_FAMILIES,artifactPages,planArtifactCompositions} from './composition';
import {buildVisualScene,scenePng,sceneSvg} from './content-layout';
import {sceneIssues} from './scene-renderer';
import {formatGeometry,type VisualFormat} from './responsive-layout';
import {sceneTargets} from './composition-scene';
import type {ContentBrand} from './content-brand';
import {SimpleArtifactSchema} from './simple-content';
import {applyArtifactPatches} from './artifact-repair';
import {renderModernArtifact} from './modern-content';

const formats:VisualFormat[]=['poster','story','carousel','post','presentation'];
const intent={goal:'Explain the next action',relationship:'sequence',reason:'The relationship is the focal point.'};
const responsive={version:1,balance:{version:1}};
let dir:string,brand:ContentBrand;
beforeAll(async()=>{
 dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-balance-'));
 const photo=path.join(dir,'photo.png');await sharp({create:{width:1200,height:750,channels:3,background:'#46736A'}}).png().toFile(photo);
 brand={companyId:'test',name:'Example',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],palette:{background:'#FFFFFF',alternate:'#F1F3F5',accent:'#164DB8',ink:'#161616',dark:'#161616'},assets:[{id:'photo',name:'Photo',mediaType:'image/png',diskPath:photo,role:'primary'}]};
});
afterAll(async()=>fs.rm(dir,{recursive:true,force:true}));
async function save(name:string,png:Buffer){if(process.env.OLA_BALANCE_FIXTURE_DIR){await fs.mkdir(process.env.OLA_BALANCE_FIXTURE_DIR,{recursive:true});await fs.writeFile(path.join(process.env.OLA_BALANCE_FIXTURE_DIR,name+'.png'),png);}}
describe('content balance across formats',()=>{
 for(const format of ['poster','story','carousel']as const)it(`retains asymmetric geometry and a balanced three-stage process in ${format}`,async()=>{
  const p=composePage({title:'Make the context clear.',body:'Give the reader a useful next step.'},{family:'asymmetric-editorial',intent:{...intent,relationship:'statement'},responsive:{...responsive,arrangement:'stack'}});
  const scene=await buildVisualScene(format,p,brand);await scenePng(scene);const body=scene.responsiveLayout!.groups.find(g=>g.id==='body')!,title=scene.responsiveLayout!.groups.find(g=>g.id==='title')!;
  expect(body.x).toBeGreaterThan(title.x+formatGeometry(format).frame.w*.1);expect(sceneIssues(scene)).toEqual([]);
  const process=composePage({title:'Keep the handoff useful.',body:'Purpose → Progress → Next action'},{family:'diagram-led',recipe:{version:1,id:'tahta-timeline'},bodyMode:'sequence',separator:' → ',intent,responsive});
  const native=await buildVisualScene(format,process,brand);await scenePng(native);const labels=native.elements.filter(e=>e.copySource==='body');expect(new Set(labels.map(e=>Math.round(e.x))).size).toBe(1);expect(sceneIssues(native)).toEqual([]);
  const arrow=native.elements.find(e=>e.id==='stage-arrow-0-1');expect(arrow?.kind==='line'&&arrow.width).toBeGreaterThanOrEqual(3.5);
  await save(`${format}-asymmetric-stacked`,await scenePng(scene));await save(`${format}-three-stage`,await scenePng(native));
 });
 for(const format of formats)for(const recipe of [false,true])it(`gives a process explanatory prominence in ${format}, recipe ${recipe}`,async()=>{
  const p=composePage({title:'Keep the work moving.',body:'Plan → Build → Review → Learn',cta:'Improve one handoff today.'},{family:recipe?'diagram-led':'oversized-typography',...(recipe?{recipe:{version:1,id:'tahta-timeline'}}:{}),intent,bodyMode:'sequence',separator:' → ',responsive});
  const scene=await buildVisualScene(format,p,brand),png=await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);
  const art=scene.responsiveLayout!.groups.find(g=>g.id==='artwork')!,title=scene.elements.find(e=>e.id==='title')!;
  expect(art.w).toBeCloseTo(formatGeometry(format).frame.w);expect(art.h).toBeGreaterThan(formatGeometry(format).frame.h*.28);
  expect(title.kind==='text'&&title.size).toBeLessThanOrEqual(102);
  expect(scene.elements.filter(e=>e.id?.startsWith('stage-number-'))).toHaveLength(0);
  expect(scene.elements.filter(e=>e.kind==='text'&&!e.copyId&&e.id!=='brand')).toHaveLength(0);
  expect(scene.elements.filter(e=>e.copySource==='body')).toHaveLength(4);
  for(const text of scene.elements.filter(e=>e.kind==='text'&&e.copySource==='body'))if(text.kind==='text')expect(text.lines).toHaveLength(1);
  await save(`${format}-process-${recipe?'timeline':'lead'}`,png);
 },20000);
 for(const format of formats)for(const family of ['oversized-typography','asymmetric-editorial','modular-grid']as const)it(`keeps short supporting copy readable and unboxed in ${format} ${family}`,async()=>{
  const p=composePage({title:'Make review easier',body:'Give readers the context they need to follow the change.',cta:'Start with one change.'},{family,intent:{...intent,relationship:'statement'},responsive});
  const scene=await buildVisualScene(format,p,brand,2,6),png=await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);
  expect(scene.elements.some(e=>e.id==='body-support-panel'||e.id==='body-card')).toBe(false);
  const body=scene.elements.find(e=>e.id==='body');expect(body?.kind==='text'&&body.size).toBeGreaterThanOrEqual(24);
  expect(scene.elements.some(e=>e.id==='progress')).toBe(false);
  const marker=scene.elements.find(e=>e.id==='page-marker')!;expect(marker.kind==='text'&&marker.text).toBe('03 / 06');
  expect(new Set(scene.elements.filter(e=>e.copyId).map(e=>e.copyId)).size).toBe(p.composition!.blocks.length);
  if(family==='modular-grid'){const a=scene.responsiveLayout!.groups.find(g=>g.id==='body')!,b=scene.responsiveLayout!.groups.find(g=>g.id==='cta')!;if(format==='story')expect(b.y).toBeGreaterThan(a.y+a.h);else{expect(b.x).toBeGreaterThan(a.x+a.w);expect(b.y).toBeCloseTo(a.y);expect(b.h).toBeGreaterThan(0);}}
  const targets=sceneTargets(scene);await scenePng(scene);expect(sceneTargets(scene)).toEqual(targets);
  await save(`${format}-${family}`,png);
 },20000);
 for(const format of formats)it(`allows only a content-sized explicit panel in ${format}`,async()=>{
  const p=composePage({title:'An attributed observation',body:'This supplied quotation needs visual separation.'},{family:'oversized-typography',intent:{...intent,relationship:'statement'},responsive:{...responsive,anchor:'start',surfaces:[{target:'body',treatment:'panel',reason:'Separate a quotation from the headline'}]}});
  const scene=await buildVisualScene(format,p,brand);await scenePng(scene);const panel=scene.elements.find(e=>e.id==='body-support-panel')!,body=scene.elements.find(e=>e.id==='body')!;
  expect(panel.kind==='rect'&&body.kind==='text'&&panel.h).toBeCloseTo(body.kind==='text'?body.h+56*formatGeometry(format).unit:0);expect(scene.responsiveLayout!.evidence!.balance?.resolvedAnchor).toBe('start');expect(sceneIssues(scene)).toEqual([]);
 });
 it('preserves contained images, Story safety and all source text',async()=>{
  const p=composePage({title:'Look closer before you conclude.',body:'Observe the evidence before you decide.',assetId:'photo',credit:'Image: Example'},{family:'image-led',recipe:{version:1,id:'apple-image-cover'},intent:{...intent,relationship:'demonstration'},responsive});
  const scene=await buildVisualScene('story',p,brand);await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);const image=scene.elements.find(e=>e.id==='artwork')!;expect(image.kind==='image'&&image.w/image.h).toBeCloseTo(1.6);
  expect(scene.elements.some(e=>e.id==='page-marker')).toBe(false);
 });
 it('honors an explicit horizontal process without silently wrapping to two rows',async()=>{
  const p=composePage({title:'Keep the work moving.',body:'Plan → Build → Review → Learn'},{family:'oversized-typography',intent,bodyMode:'sequence',separator:' → ',responsive:{...responsive,visual:{direction:'horizontal'}}});
  const scene=await buildVisualScene('poster',p,brand);await scenePng(scene);
  const nodes=scene.elements.filter(e=>e.copySource==='body');
  expect(new Set(nodes.map(e=>e.x)).size).toBe(4);expect(new Set(nodes.map(e=>e.y)).size).toBe(1);
  expect(scene.elements.some(e=>e.id?.startsWith('visual-card-'))).toBe(false);
  for(const card of scene.elements.filter(e=>e.id?.startsWith('visual-card-')))if(card.kind==='rect')expect(card.h/card.w).toBeLessThan(1);
  expect(sceneIssues(scene)).toEqual([]);
 });
 it('balances a short-copy lead inside the usable frame instead of forcing it to the bottom',async()=>{
  const p=composePage({title:'Make review easier',body:'Lead with a clear summary of what the pull request changes.'},{family:'oversized-typography',recipe:{version:1,id:'tahta-lead'},intent:{...intent,relationship:'statement'},responsive});
  const scene=await buildVisualScene('carousel',p,brand,0,6);await scenePng(scene);
  expect(scene.responsiveLayout!.config.anchor).toBe('center');
  const groups=scene.responsiveLayout!.groups,f=scene.responsiveLayout!.frame;
  const top=Math.min(...groups.map(g=>g.y))-f.y,bottom=f.y+f.h-Math.max(...groups.map(g=>g.y+g.h));
  expect(top).toBeCloseTo(bottom);expect(sceneIssues(scene)).toEqual([]);
 });
 for(const format of formats)it(`expands an attached closing cluster instead of leaving an orphan half-frame in ${format}`,async()=>{
  const p=composePage({title:'Resolve comments and recap',body:'Address feedback and summarize what changed.',cta:'Save this checklist.'},{family:'modular-grid',intent:{...intent,relationship:'statement'},responsive:{...responsive,adjustments:[{action:'attach',target:'cta',to:'body',gap:.02}]}});
  const scene=await buildVisualScene(format,p,brand,5,6);await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);
  for(const id of ['body','cta']){const g=scene.responsiveLayout!.groups.find(g=>g.id===id)!;expect(g.lane).toBe('full');expect(g.w).toBeCloseTo(formatGeometry(format).frame.w);}
  const before=sceneTargets(scene);await scenePng(scene);expect(sceneTargets(scene)).toEqual(before);
 },20000);
 for(const format of formats)it(`preserves the requested start anchor within the usable ${format} frame`,async()=>{
  const p=composePage({title:'Explain the reason',body:'Explain the problem or need that prompted the change.'},{family:'modular-grid',intent:{...intent,relationship:'statement'},responsive:{...responsive,anchor:'start'}});
  const scene=await buildVisualScene(format,p,brand);await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);
  const evidence=scene.responsiveLayout!.evidence!,f=scene.responsiveLayout!.frame;
  expect(evidence.balance?.resolvedAnchor).toBe('start');
  const top=Math.min(...evidence.groups.map(g=>g.y))-f.y,bottom=f.y+f.h-Math.max(...evidence.groups.map(g=>g.y+g.h));
  expect(top).toBeCloseTo(0);expect(bottom).toBeGreaterThan(0);const before=sceneTargets(scene);await scenePng(scene);expect(sceneTargets(scene)).toEqual(before);
 },20000);
 it('accepts a per-patch repair explanation without changing or relaxing the approved copy',()=>{
  const p=composePage({title:'Explain the reason',body:'Keep the supplied explanation.'},{family:'modular-grid',intent,responsive});
  const a=SimpleArtifactSchema.parse({type:'poster',headline:p.title,subline:p.body,composition:p.composition});
  const fixed=applyArtifactPatches(a,{patches:[{target:'page-1',reason:'Balance the group',layoutActions:[{action:'move',target:'content',dx:0,dy:.02}]}],reason:'Correct the visible imbalance'},'');
  expect(artifactPages(fixed)[0].body).toBe(p.body);expect(artifactPages(fixed)[0].composition!.responsive!.adjustments).toHaveLength(1);
 });
 it('enables the policy for new production plans and retains saved geometry',()=>{
  const artifact=SimpleArtifactSchema.parse({type:'poster',headline:'A headline.',subline:'A useful supporting sentence.'});
  const input={candidates:[{pages:[{family:'oversized-typography',intent,responsive:{version:1}}]},{pages:[{family:'asymmetric-editorial',intent,responsive:{version:1}}]}]};
  expect(artifactPages(planArtifactCompositions(artifact,input,true).candidates[0])[0].composition!.responsive!.balance).toEqual({version:1});
  expect(artifactPages(planArtifactCompositions(artifact,input).candidates[0])[0].composition!.responsive!.balance).toBeUndefined();
 });
 it('preserves policy and copy through replanning and uses the same preview/export scene',async()=>{
  const p=composePage({title:'One clear action.',body:'Give readers the context they need.'},{family:'modular-grid',intent,responsive});
  const a=SimpleArtifactSchema.parse({type:'poster',headline:p.title,subline:p.body,composition:p.composition,designVersion:2});
  const fixed=applyArtifactPatches(a,{patches:[{target:'page-1',compositionPlan:{family:'asymmetric-editorial',intent,responsive:{version:1}}}],reason:'Change hierarchy'},'');
  expect(artifactPages(fixed)[0].composition!.responsive!.balance).toEqual({version:1});expect(artifactPages(fixed)[0].body).toBe(p.body);
  await renderModernArtifact(a,brand,path.join(dir,'parity'));const scene=await buildVisualScene('poster',artifactPages(a)[0],brand);expect(Buffer.compare(await scenePng(scene),await fs.readFile(a.type==='poster'?a.imagePath!:''))).toBe(0);expect(sceneSvg(scene)).not.toContain('@copy:');
 },20000);
});
