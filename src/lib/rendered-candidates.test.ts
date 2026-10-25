import {describe,it,expect}from'vitest';
import sharp from 'sharp';
import fs from'node:fs/promises';import os from'node:os';import path from'node:path';
import{selectRenderedCandidates}from'./rendered-candidates';import{SimpleArtifactSchema}from'./simple-content';import{BrandDesignSchema}from'./brand-design';import{buildVisualScene,scenePng}from'./content-layout';import type{ContentBrand}from'./content-brand';
import {renderModernArtifact,reviewModernArtifact} from './modern-content';
import { GenerationCheckpoint } from './generation-checkpoint';
import { composePage } from './composition';
import { applyArtifactPatches } from './artifact-repair';
const brand:ContentBrand={companyId:'test',name:'Sample',audience:'Readers',voice:'Clear',description:'',typography:'',imagery:'',formatRules:'',examples:[],palette:{background:'#FFFFFF',alternate:'#F1F3F5',ink:'#111111',dark:'#111111',accent:'#0055DD'},assets:[],designSystem:BrandDesignSchema.parse({})};
it('blocks a model-approved social render until primary explanation text meets its measured phone reading floor',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-mobile-reading-'));
 try{
  const page=composePage({title:'Keep the useful context',body:'',cta:'Choose a next step',visualContent:{kind:'process',items:[{label:'Inspect',detail:'Read the whole message.'},{label:'Decide',detail:'Keep the useful detail.'}]}},{family:'diagram-led',intent:{goal:'Explain a useful sequence',relationship:'sequence',reason:'Keep both steps connected.'},responsive:{version:1,balance:{version:1}},typography:{detail:{size:.7}}});
  const artifact=SimpleArtifactSchema.parse({type:'story',headline:page.title,subline:page.body,cta:page.cta,visualContent:page.visualContent,composition:page.composition,designVersion:2});
  const accept=async()=>JSON.stringify({scores:{clarity:4,usefulness:4,visualCraft:4,brandFit:4,editability:4},issues:[],summary:'Reviewed'});
  await renderModernArtifact(artifact,brand,path.join(dir,'small'));
  const rejected=await reviewModernArtifact(artifact,brand,1,accept);
  expect(rejected.pass).toBe(false);expect(rejected.findings?.[0].targets).toContain('visualContent.items.0.detail');
  expect(rejected.issues.join(' ')).toContain('phone viewing width');
  const crowded=await reviewModernArtifact(artifact,brand,1,async()=>JSON.stringify({scores:{clarity:4,usefulness:4,visualCraft:4,brandFit:4,editability:4},issues:[],summary:'All findings reviewed',findings:Array.from({length:30},(_,i)=>({page:1,targets:['content'],problem:`Visible defect ${i+1}`,successCriterion:'Resolve the specific visible defect.'}))}));
  expect(crowded.findings).toHaveLength(30);expect(crowded.issues).toContain('Page 1: Visible defect 30');
  expect(crowded.summary).toBe('All findings reviewed');expect(crowded.issues.join(' ')).not.toContain('Visual review unavailable');
  const repaired=applyArtifactPatches(artifact,{reason:'Make existing explanation readable',patches:[{target:'page-1',typography:{detail:{size:1.4}}}]},'');
  await renderModernArtifact(repaired,brand,path.join(dir,'readable'));
  expect((await reviewModernArtifact(repaired,brand,2,accept)).pass).toBe(true);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
},20000);
describe('rendered alternatives and semantic layouts',()=>{
 it('reviews the only surviving crafted candidate instead of accepting it by default',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-surviving-candidate-'));
  try {
   const artDirection={version:1,referencePrinciples:[],directions:['editorial','contrast','sequence'].map(id=>({id,name:`${id} direction`,idea:`A purposeful ${id} idea for the message`,attention:'A clear focal point',hierarchy:'One dominant headline',rhythm:'A readable sequence',assetStrategy:'Native editable text'}))};
   const candidate=SimpleArtifactSchema.parse({type:'story',headline:'Keep the context',subline:'Check before sharing.',cta:'Save',designVersion:2,artDirection});
   let calls=0;
   const result=await selectRenderedCandidates([candidate,SimpleArtifactSchema.parse({...candidate,assetId:'unavailable'})],brand,'Make a useful Story.',dir,async(prompt,images)=>{
    calls++;expect(prompt).toContain('Only one alternative survived rendering');expect(images!.length).toBeGreaterThan(1);
    return JSON.stringify({index:0,reason:'The supporting copy is disconnected from the headline.',ready:false,issues:['Close the gap between headline and support.']});
   });
   expect(calls).toBe(1);expect(result.evidence.failures).toHaveLength(1);
   expect(result.artifact.designSelection).toMatchObject({ready:false,issues:['Close the gap between headline and support.']});
   await expect(selectRenderedCandidates([candidate],brand,'Make a useful Story.',dir,async()=>JSON.stringify({index:0,reason:'Looks fine.'}))).rejects.toThrow('explicitly accept');
   const contradictory=await selectRenderedCandidates([candidate],brand,'Make a useful Story.',dir,async()=>JSON.stringify({index:0,reason:'Usable after repair.',ready:true,issues:['The supporting copy still needs regrouping.']}));
   expect(contradictory.artifact.designSelection?.ready).toBe(false);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
 },20000);
 it('reuses completed renders after the visual selector fails',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-render-resume-'));
  try {
   const candidates=['hero','statement'].map(layout=>SimpleArtifactSchema.parse({type:'story',headline:'Keep the context',subline:'Check before sharing.',cta:'Save',designVersion:2,layout}));
   const checkpoint=await GenerationCheckpoint.open(dir,{brief:'Make a useful Story.'});
   await expect(selectRenderedCandidates(candidates,brand,'Make a useful Story.',dir,async()=>{throw new Error('Provider deadline exceeded');},checkpoint)).rejects.toThrow('Provider deadline exceeded');
   const files=[1,2].map(index=>path.join(dir,`candidate-${index}`,'source.json'));
   const before=await Promise.all(files.map(async file=>(await fs.stat(file)).mtimeMs));
   const reopened=await GenerationCheckpoint.open(dir,{brief:'Make a useful Story.'});
   const selected=await selectRenderedCandidates(candidates,brand,'Make a useful Story.',dir,async()=>JSON.stringify({index:1,reason:'Clearer hierarchy.'}),reopened);
   expect(selected.evidence.selected).toBe(1);
   expect(await Promise.all(files.map(async file=>(await fs.stat(file)).mtimeMs))).toEqual(before);
   expect(reopened.completedSteps).toEqual(['render-candidate-1','render-candidate-2']);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
 },20000);
 it('selects from actual rendered candidates and preserves both source files',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-candidates-'));try{const base={type:'story',headline:'Look before sharing',subline:'Check the context.',cta:'Save',designVersion:2};const a=SimpleArtifactSchema.parse({...base,layout:'hero'}),b=SimpleArtifactSchema.parse({...base,layout:'statement'});let supplied=0;const result=await selectRenderedCandidates([a,b],brand,'Make a useful Story.',dir,async(_p,images)=>{supplied=images?.length??0;expect(images?.[0]).not.toEqual(images?.[1]);return JSON.stringify({index:1,reason:'Clearer emphasis.'});});expect(supplied).toBe(2);expect(result.evidence.selected).toBe(1);expect(await fs.readFile(path.join(dir,'candidate-1/source.json'),'utf8')).toContain('Look before sharing');expect(await fs.readFile(path.join(dir,'candidate-2/source.json'),'utf8')).toContain('Look before sharing');}finally{await fs.rm(dir,{recursive:true,force:true});}},20000);
 it.each(['checklist','process','comparison','example']as const)('renders %s content without clipping',async kind=>{const count=kind==='comparison'?2:kind==='example'?1:3;const scene=await buildVisualScene('carousel',{title:'Pause before sharing',body:'',layout:'diagram',visualContent:{kind,items:Array.from({length:count},(_,i)=>({label:['Pause','Inspect','Remove'][i]??'Check',detail:'Keep only the context the reader needs.'}))}},brand,1,6);const bytes=await scenePng(scene);expect(bytes.length).toBeGreaterThan(1000);expect(scene.elements.filter(e=>e.id?.endsWith('-label'))).toHaveLength(count);},15000);
});


it('keeps a supplied photo and explicit credit visible without overlapping the Story CTA',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-photo-'));try{
  const file=path.join(dir,'photo.png');await sharp({create:{width:900,height:600,channels:3,background:'#335577'}}).png().toFile(file);
  const b={...brand,assets:[{id:'photo',name:'photo.png',mediaType:'image/png',diskPath:file,role:'primary'}]};
  const scene=await buildVisualScene('story',{title:'Look closer before you conclude.',body:'Notice the light, texture, and horizon. Separate what you can see from what you infer.',cta:'Save this observation prompt.',credit:'Image: NASA',assetId:'photo',storyTreatment:'image-showcase'},b);
  await scenePng(scene);expect(scene.elements.some(e=>e.id==='artwork')).toBe(true);expect(scene.elements.some(e=>e.kind==='text'&&e.text==='Image: NASA')).toBe(true);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
},15000);

it('supplies measured export dimensions to the reviewer despite resized previews',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-review-size-'));try{
  const artifact=SimpleArtifactSchema.parse({type:'story',headline:'Keep the context',subline:'Read the whole image.',cta:'Save'});
  await renderModernArtifact(artifact,brand,dir);
  await reviewModernArtifact(artifact,brand,1,async(prompt,images)=>{
    expect(prompt).toContain('"width":1080,"height":1920');
    expect((await sharp(Buffer.from(images![0].split(',')[1],'base64')).metadata()).width).toBe(820);
    return JSON.stringify({scores:{clarity:4,usefulness:4,visualCraft:4,brandFit:4,editability:4},issues:[],summary:'Reviewed'});
  });
 }finally{await fs.rm(dir,{recursive:true,force:true});}
},15000);

it('supports one logo placement per deck and renders example messages as native panels',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-logo-'));try{
  const file=path.join(dir,'logo.png');await sharp({create:{width:200,height:70,channels:3,background:'#335577'}}).png().toFile(file);
  const b={...brand,designSystem:{...brand.designSystem!,logoPlacement:'cover-only' as const},logo:{id:'logo',name:'logo.png',mediaType:'image/png',diskPath:file,role:'primary'}};
  const page={title:'A fictional example',body:'Share the useful part.',visualContent:{kind:'example' as const,items:[{label:'Fictional community chat',detail:'The group has chosen the garden as its meeting place.'},{label:'Useful excerpt',detail:'Keep the place; remove identifying details.'}]}};
  const cover=await buildVisualScene('carousel',page,b,0,6),inner=await buildVisualScene('carousel',page,b,3,6);
  expect(cover.elements.some(e=>e.id==='logo')).toBe(true);expect(inner.elements.some(e=>e.id==='logo'||e.id==='brand')).toBe(false);
  expect(inner.elements.filter(e=>e.kind==='rect'&&e.radius===18)).toHaveLength(2);await scenePng(inner);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
},15000);

it('maps frozen asset IDs only to the isolated company and rejects unselected artwork',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-assets-'));try{
  const file=path.join(dir,'selected.png');await sharp({create:{width:900,height:600,channels:3,background:'#335577'}}).png().toFile(file);
  const b={...brand,assetAliases:{frozen:'isolated'},assets:[{id:'isolated',name:'selected.png',mediaType:'image/png',diskPath:file,role:'primary'}]};
  const artifact=SimpleArtifactSchema.parse({type:'story',headline:'Look closer',subline:'Inspect the selected image.',cta:'Save',assetId:'frozen',storyTreatment:'image-showcase'});
  await renderModernArtifact(artifact,b,path.join(dir,'output'));expect(artifact.type==='story'&&artifact.assetId).toBe('isolated');
  await expect(renderModernArtifact({...artifact,assetId:'another-company'} as typeof artifact,b,path.join(dir,'rejected'))).rejects.toThrow('asset snapshot');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
},15000);
