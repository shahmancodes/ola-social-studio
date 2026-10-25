import {describe,it,expect} from 'vitest';
import path from 'node:path';
import sharp from 'sharp';
import {BrandDesignSchema} from './brand-design';
import {buildVisualScene,scenePng} from './content-layout';
import {sceneIssues} from './scene-renderer';
import {SimpleArtifactSchema} from './simple-content';
import {applyArtifactPatches,contentForEvidence,requiredCopyIssues,enforceBriefScope} from './artifact-repair';
import type {ContentBrand} from './content-brand';
const font={id:'font',name:'Manrope.woff2',mediaType:'font/woff2',diskPath:path.resolve('node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2'),role:'primary'};
const brand:ContentBrand={companyId:'test',name:'Test',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],palette:{background:'#FFFFFF',alternate:'#F1F3F5',accent:'#FF6600',ink:'#161616',dark:'#161616'},assets:[],fonts:[font],designSystem:BrandDesignSchema.parse({family:'poster'})};
describe('measured social design',()=>{
 it('loads supplied font bytes, wraps with actual glyph metrics and exports a safe Story',async()=>{
  const scene=await buildVisualScene('story',{title:'Give your reviewer a clear starting point.',body:'Explain what changed, why it matters, and how you tested it.',cta:'Save this reminder.',layout:'hero'},brand);
  const bytes=await scenePng(scene);expect(scene.fontReport?.join(' ')).toContain('Manrope.woff2');expect(sceneIssues(scene)).toEqual([]);expect(await sharp(bytes).metadata()).toMatchObject({width:1080,height:1920});
  const text=scene.elements.find(e=>e.id==='title');expect(text?.kind==='text'&&text.lines.length).toBeGreaterThan(1);
 },15000);
 it('detects real text collisions and foreground occlusion',async()=>{
  const scene=await buildVisualScene('carousel',{title:'Make review easier',body:'State the change and the outcome a reviewer should look for.',layout:'hero'},brand,0,6);await scenePng(scene);
  const body=scene.elements.find(e=>e.id==='body')!;scene.elements.push({kind:'rect',x:body.x,y:body.y,w:90,h:90,fill:'#000000'});expect(sceneIssues(scene).join(' ')).toMatch(/obscured/);
 },15000);
 it('does not substitute a font from another company',async()=>{
  const scene=await buildVisualScene('story',{title:'One action',body:'Try it',cta:'Save'}, {...brand,designSystem:{...brand.designSystem!,headingFontId:'foreign'}});
  await expect(scenePng(scene)).rejects.toThrow(/company snapshot/);
 });
 it('detects rules crossing text and vertical rules outside the canvas',async()=>{
  const scene=await buildVisualScene('carousel',{title:'Readable title',body:'Readable body'},brand,0,6);
  scene.elements.push({kind:'line',x:85,y:250,x2:85,y2:1450,width:2,color:'#111111'});
  expect(sceneIssues(scene).join(' ')).toMatch(/outside the canvas/);
  expect(sceneIssues(scene).join(' ')).toMatch(/crossed by a rule/);
 });
});
describe('bounded repairs and complete QA evidence',()=>{
 const artifact=SimpleArtifactSchema.parse({type:'story',headline:'Preview before you publish.',subline:'Check the layout.',cta:'Save this reminder.',layout:'hero'});
 const brief='Headline: "Preview before you publish." Supporting line: "Check the layout." CTA: "Save this reminder."';
 it('includes the CTA in evidence and verifies quoted copy',()=>{expect(contentForEvidence(artifact)).toHaveProperty('cta','Save this reminder.');expect(requiredCopyIssues(artifact,brief)).toEqual([]);expect(requiredCopyIssues({...artifact,cta:'Wrong'} as typeof artifact,brief)).toHaveLength(1);});
 it('shows requested labels and image credits to copy QA across visual formats',()=>{
  const poster=SimpleArtifactSchema.parse({type:'poster',headline:'Observe',subline:'Context',eyebrow:'Illustrative example',credit:'Image: NASA',caption:''});
  expect(contentForEvidence(poster)).toMatchObject({eyebrow:'Illustrative example',credit:'Image: NASA'});
  const carousel=SimpleArtifactSchema.parse({type:'carousel',title:'Guide',caption:'',slides:[{title:'Observe',body:'Context',eyebrow:'Illustrative example',credit:'Image: NASA'},{title:'Explain',body:'Context'},{title:'Act',body:'Context'}]});
  expect(contentForEvidence(carousel)).toMatchObject({slides:[{eyebrow:'Illustrative example',credit:'Image: NASA'},{},{}]});
 });
 it('catches forbidden dates inside structured example copy',()=>{
  const example={...artifact,visualContent:{kind:'example' as const,items:[{label:'Fictional chat',detail:'Meet on Saturday at 10:00.'}]}};
  expect(requiredCopyIssues(example,'Do not add statistics, product claims, dates or personal details.').join(' ')).toMatch(/forbids dates/);
  expect(requiredCopyIssues(example,'Include the supplied event time.')).toEqual([]);
 });
 it('applies a local visual edit while preserving content and rejects invented layouts',()=>{
  const result=applyArtifactPatches(artifact,{patches:[{target:'page-1',layout:'statement'}],reason:'Improve hierarchy'},brief);expect(result).toMatchObject({headline:'Preview before you publish.',layout:'statement'});expect(artifact).toHaveProperty('layout','hero');
  expect(()=>applyArtifactPatches(artifact,{patches:[{target:'page-1',layout:'magazine'}],reason:'x'},brief)).toThrow();
 });
 it('rejects foreign targets, unknown fields and changes to locked copy',()=>{
  for(const patch of [{target:'page-2',layout:'hero'},{target:'page-1',imagePath:'/tmp/foreign'},{target:'page-1',cta:'Buy now'}])expect(()=>applyArtifactPatches(artifact,{patches:[patch],reason:'x'},brief)).toThrow();
 });
});


describe('brief scope is enforced before rendering',()=>{
 it('removes invented visual copy from exact-copy briefs while retaining the requested sentence',()=>{
  const artifact=SimpleArtifactSchema.parse({type:'carousel',title:'Checklist',caption:'Save',slides:Array.from({length:3},(_,i)=>({id:`page-${i+1}`,title:`Step ${i+1}`,body:'One concise sentence.',eyebrow:'Extra label',visualContent:{kind:'checklist',items:[{label:'Extra',detail:'Unrequested'}]}}))});
  const scoped=enforceBriefScope(artifact,'Add one concise practical supporting sentence per slide. Avoid extra text.');
  expect(scoped.type==='carousel'&&scoped.slides.every(s=>!s.visualContent&&!s.eyebrow&&s.body==='One concise sentence.')).toBe(true);
  expect(artifact.type==='carousel'&&artifact.slides[0].visualContent).toBeTruthy();
  expect(enforceBriefScope(artifact,'Use diagrams and examples.')).toEqual(artifact);
 });
});
