import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { composePage, artifactPages, compositionIssues, planArtifactCompositions, COMPOSITION_FAMILIES, type CopyPage } from './composition';
import { buildVisualScene, scenePng, sceneSvg, type VisualScene } from './content-layout';
import { sceneIssues } from './scene-renderer';
import { formatGeometry, resolveResponsiveScene, type VisualFormat } from './responsive-layout';
import { SimpleArtifactSchema } from './simple-content';
import { applyArtifactPatches, repairOutcomeMerit } from './artifact-repair';
import { renderModernArtifact, reviewModernArtifact } from './modern-content';
import { sceneTargets } from './composition-scene';
import type { ContentBrand } from './content-brand';

const formats:VisualFormat[]=['poster','story','carousel','post','presentation'];
const plan=(family:string, extra:Record<string,unknown>={})=>({family,intent:{goal:'Explain the supplied idea',relationship:'statement',reason:'A clear focal point and related groups'},responsive:{version:1},...extra});
const make=(family:string, extra:Record<string,unknown>={})=>composePage({title:'Make the idea clear.',body:family==='diagram-led'?'Plan → Build → Review → Learn':family==='comparison'?'Before\nAfter':'Give the reader one useful action.',cta:'Start with one change.',...(family==='image-led'?{assetId:'photo',credit:'Image: Example'}:{})},plan(family,{...(family==='diagram-led'?{bodyMode:'sequence',separator:' → '}:family==='comparison'?{bodyMode:'comparison',separator:'\n'}:{}),...extra}));
const element=(scene:VisualScene,id:string)=>scene.elements.find(e=>e.id===id)!;
let dir:string,brand:ContentBrand;
beforeAll(async()=>{
 dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-responsive-'));
 const photo=path.join(dir,'photo.png');await sharp(Buffer.from('<svg width="1200" height="750" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="750" fill="#24416a"/><circle cx="600" cy="375" r="260" fill="#73a5c4"/><path d="M0 650L1200 300V750H0Z" fill="#ddc9a1"/></svg>')).png().toFile(photo);
 brand={companyId:'test',name:'Example',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],palette:{background:'#FFFFFF',alternate:'#F1F3F5',accent:'#164DB8',ink:'#161616',dark:'#161616'},assets:[{id:'photo',name:'photo.png',mediaType:'image/png',diskPath:photo,role:'primary'}]};
});
afterAll(async()=>fs.rm(dir,{recursive:true,force:true}));
describe('shared measured layout',()=>{
 for(const format of formats)for(const family of COMPOSITION_FAMILIES)it(`${format}: ${family}`,async()=>{
   const scene=await buildVisualScene(format,make(family),brand,1,6);const png=await scenePng(scene);
   expect(sceneIssues(scene)).toEqual([]);const {width,height}=formatGeometry(format);expect(await sharp(png).metadata()).toMatchObject({width,height});
   expect(scene.responsiveLayout?.evidence?.groups.length).toBeGreaterThan(1);
   const visible=scene.elements.filter(e=>e.copyId);expect(new Set(visible.map(e=>e.copyId)).size).toBe(visible.length);
   expect(sceneSvg(scene)).not.toContain('@copy:');
   if(process.env.OLA_RESPONSIVE_FIXTURE_DIR){await fs.mkdir(process.env.OLA_RESPONSIVE_FIXTURE_DIR,{recursive:true});await fs.writeFile(path.join(process.env.OLA_RESPONSIVE_FIXTURE_DIR,`${format}-${family}.png`),png);}
 },20000);
 for(const format of formats)it(`retains structured example labels and details in ${format}`,async()=>{
   const page=composePage({title:'Make feedback specific.',body:'',visualContent:{kind:'comparison',items:[{label:'A vague request',detail:'Please review this change.'},{label:'A focused request',detail:'Check whether this handles an empty response.'}]}},plan('comparison',{responsive:{version:1,visual:{treatment:'cards'}}}));
   const scene=await buildVisualScene(format,page,brand);await scenePng(scene);
   expect(scene.elements.filter(e=>e.copySource?.startsWith('visualContent.'))).toHaveLength(4);expect(sceneIssues(scene)).toEqual([]);
   expect(scene.elements.some(e=>e.kind==='text'&&e.text==='Check whether this handles an empty response.')).toBe(true);
 },20000);
 it('keeps every process label as whole words when a focal diagram is enlarged',async()=>{
   const scene=await buildVisualScene('poster',make('diagram-led',{responsive:{version:1,focal:'artwork',visualWeight:.6,visual:{treatment:'cards'}}}),brand);await scenePng(scene);
   const label=element(scene,'semanticComponent.items.2.label');expect(label.kind==='text'&&label.lines).toEqual(['Review']);
 });
 it('moves following copy when a heading grows, while preserving a deliberate gap',async()=>{
   const run=async(title:string)=>{const scene=await buildVisualScene('poster',composePage({title,body:'One useful action.'},plan('oversized-typography')),brand);await scenePng(scene);return scene;};
   const a=await run('One idea.'),b=await run('A much longer headline that needs several readable lines');
   expect(element(b,'body').y-element(b,'title').y).toBeGreaterThan(element(a,'body').y-element(a,'title').y);
   for(const s of [a,b]){const title=element(s,'title');if('h'in title)expect(element(s,'body').y-title.y-title.h).toBeCloseTo(s.responsiveLayout!.gap);}
 });
 it('is stable across repeated measurement and keeps hotspots on actual bounds',async()=>{
   const scene=await buildVisualScene('story',make('diagram-led'),brand);await scenePng(scene);const before=sceneTargets(scene);const png=await scenePng(scene);expect(sceneTargets(scene)).toEqual(before);expect(png.length).toBeGreaterThan(10000);
   resolveResponsiveScene(scene);expect(sceneTargets(scene)).toEqual(before);
 });
 for(const format of formats)it(`contains image annotations and references each label once in ${format}`,async()=>{
   const page=composePage({title:'Look more closely.',body:'Inspect the surface.\nCompare the boundary.',assetId:'photo'},plan('image-led',{bodyMode:'grid',separator:'\n',responsive:{version:1,visual:{treatment:'annotated',annotations:[{copyId:'body-0',x:.3,y:.4},{copyId:'body-1',x:.7,y:.6}]}}}));
   const scene=await buildVisualScene(format,page,brand);await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);
   expect(scene.elements.filter(e=>e.copySource==='body')).toHaveLength(2);expect(scene.elements.some(e=>e.id==='callout-pin-0')).toBe(true);
   const image=element(scene,'artwork');expect(image.kind==='image'&&image.w/image.h).toBeCloseTo(1.6);
 },20000);
 it('retains both a supplied image and an existing semantic visual',async()=>{
   const page=make('diagram-led');page.assetId='photo';const scene=await buildVisualScene('poster',page,brand);await scenePng(scene);expect(element(scene,'artwork').kind).toBe('image');expect(scene.elements.filter(e=>e.copySource==='body')).toHaveLength(4);
 });
 for(const format of formats)it(`packs denser copy with a readable floor in ${format}`,async()=>{
   const p=composePage({title:'Make the next action clear before adding more detail.',body:'A useful explanation connects the evidence to the decision. Keep the important context, show the relationship, and make the next step easy to find. Give related ideas enough space to read as a group.',cta:'Choose one practical next step.'},plan('asymmetric-editorial'));
   const scene=await buildVisualScene(format,p,brand);await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);
   expect(scene.elements.filter(e=>e.kind==='text').every(e=>e.kind==='text'&&e.size>=(e.minSize??0))).toBe(true);
 },20000);
 it('uses the same measured scene for responsive preview, PNG and SVG export',async()=>{
   const p=make('diagram-led',{responsive:{version:1,focal:'artwork',visual:{treatment:'cards'}}});
   const a=SimpleArtifactSchema.parse({type:'poster',headline:p.title,subline:p.body,cta:p.cta,composition:p.composition,semanticComponent:p.semanticComponent,designVersion:2});
   await renderModernArtifact(a,brand,path.join(dir,'parity'));
   const scene=await buildVisualScene('poster',artifactPages(a)[0],brand);const png=await scenePng(scene);
   expect(a.type==='poster'&&Buffer.compare(png,await fs.readFile(a.imagePath!))).toBe(0);expect(a.renderEvidence?.[0].layout).toBeTruthy();
   expect(sceneTargets(scene).groups?.find(g=>g.id==='artwork')?.h).toBeGreaterThan(0);
 },20000);
 it('treats structured findings as failures, validates targets and carries repair objectives into review',async()=>{
   const p=make('oversized-typography');const a=SimpleArtifactSchema.parse({type:'poster',headline:p.title,subline:p.body,cta:p.cta,composition:p.composition,designVersion:2});
   await renderModernArtifact(a,brand,path.join(dir,'review'));
   const findings=[{page:1,targets:['body'],problem:'The supporting text is too distant.',successCriterion:'The body reads as part of the headline group.'}];
   const ask=async()=>JSON.stringify({scores:{clarity:5,usefulness:5,visualCraft:5,brandFit:5,editability:5},issues:[],findings,summary:'Repair grouping.'});
   const review=await reviewModernArtifact(a,brand,1,ask);expect(review.pass).toBe(false);expect(review.issues).toContain('Page 1: The supporting text is too distant.');
   a.quality=review;
   await reviewModernArtifact(a,brand,2,async prompt=>{expect(prompt).toContain('The body reads as part of the headline group.');return JSON.stringify({scores:{clarity:4,usefulness:4,visualCraft:4,brandFit:4,editability:4},issues:[],findings:[{...findings[0],targets:['nonexistent']}],summary:'Invalid'});}).then(result=>expect(result.issues.join(' ')).toContain('unknown layout target'));
 },20000);
});
describe('bounded relational repairs' ,()=>{
 const asArtifact=(p:CopyPage)=>SimpleArtifactSchema.parse({type:'poster',headline:p.title,subline:p.body,cta:p.cta,semanticComponent:p.semanticComponent,composition:p.composition});
 it('attaches CTA to a diagram and scales the whole visual with labels/connectors',async()=>{
   const base=asArtifact(make('diagram-led'));
   const fixed=applyArtifactPatches(base,{patches:[{target:'page-1',layoutActions:[{action:'scale',target:'artwork',factor:1.2},{action:'attach',target:'cta',to:'artwork',gap:.015}]}],reason:'Give the stages prominence and group the action'},'');
   expect(artifactPages(fixed)[0].body).toBe(artifactPages(base)[0].body);
   const scenes=await Promise.all([base,fixed].map(a=>buildVisualScene('poster',artifactPages(a)[0],brand)));for(const s of scenes)await scenePng(s);
   const [a,b]=scenes.map(s=>s.responsiveLayout!.groups.find(g=>g.id==='artwork')!);expect(b.h).toBeGreaterThan(a.h);
   const cta=scenes[1].responsiveLayout!.groups.find(g=>g.id==='cta')!;expect(cta.y-b.y-b.h).toBeCloseTo(Math.min(1048,1398)*.015);
 });
 for(const action of [{action:'attach',target:'body',to:'body',gap:.02},{action:'scale',target:'artwork',factor:1.2},{action:'scale',target:'title',factor:3},{action:'move',target:'logo',dx:0,dy:0}])it(`rejects invalid action ${JSON.stringify(action)}`,()=>{
   expect(()=>applyArtifactPatches(asArtifact(make('oversized-typography')),{patches:[{target:'page-1',layoutActions:[action]}],reason:'Invalid'},'')).toThrow();
 });
 it('rejects cycles and duplicated/unknown annotation labels',()=>{
   for(const annotations of [[{copyId:'missing',x:.5,y:.5}],[{copyId:'body',x:.5,y:.5},{copyId:'body',x:.2,y:.2}]])expect(()=>composePage({title:'A title.',body:'A label.',assetId:'photo'},plan('image-led',{responsive:{version:1,visual:{treatment:'annotated',annotations}}}))).toThrow();
   expect(()=>applyArtifactPatches(asArtifact(make('oversized-typography')),{patches:[{target:'page-1',layoutActions:[{action:'attach',target:'body',to:'cta',gap:.02}]}],reason:'Invalid'},'')).toThrow();
 });
 it('keeps legacy composition rendering opt-in and rejects overflow instead of hiding it',async()=>{
   const page=composePage({title:'One idea.',body:'One action.'},{family:'oversized-typography',intent:{goal:'Clarity',relationship:'statement',reason:'One message'}});expect(page.composition?.responsive).toBeUndefined();
   const legacy=await buildVisualScene('poster',page,brand);expect(legacy.responsiveLayout).toBeUndefined();
   const bad=make('oversized-typography',{responsive:{version:1,anchor:'start',adjustments:[{action:'move',target:'content',dx:-.12,dy:0}]}});
   await expect(scenePng(await buildVisualScene('story',bad,brand))).rejects.toThrow(/outside/);
 });
 it('retains copy when returning a reference-backed diagram to prose',()=>{
   const base=asArtifact(make('diagram-led'));
   const next=applyArtifactPatches(base,{patches:[{target:'page-1',compositionPlan:plan('oversized-typography')}],reason:'Use the same source as prose'},'');
   const p=artifactPages(next)[0];expect(p.body).toBe(artifactPages(base)[0].body);expect(p.semanticComponent).toBeUndefined();expect(compositionIssues(p)).toEqual([]);
 });
 it('rejects local geometry combined with copy rewrites and cumulative scaling abuse',()=>{
   const base=asArtifact(make('diagram-led'));
   expect(()=>applyArtifactPatches(base,{patches:[{target:'page-1',body:'Changed copy',layoutActions:[{action:'scale',target:'artwork',factor:1.1}]}],reason:'Invalid'},'')).toThrow(/preserve approved copy/);
   expect(()=>applyArtifactPatches(base,{patches:[{target:'page-1',layoutActions:Array.from({length:5},()=>({action:'scale',target:'artwork',factor:1.3}))}],reason:'Invalid'},'')).toThrow(/safe bounds/);
 });
 it('requires responsive plans for new production while accepting saved legacy plans',()=>{
   const base=asArtifact(make('oversized-typography'));
   const input={candidates:[{pages:[plan('oversized-typography')]},{pages:[plan('asymmetric-editorial')]}]};
   expect(planArtifactCompositions(base,input,true).candidates).toHaveLength(2);
   for(const candidate of input.candidates)delete (candidate.pages[0] as Record<string,unknown>).responsive;
   expect(()=>planArtifactCompositions(base,input,true)).toThrow(/Every new composition/);expect(planArtifactCompositions(base,input).candidates).toHaveLength(2);
 });
 it('honors a verified repair pass over a failed version with higher subjective scores',()=>{
   const failed={pass:false,scores:{a:5,b:5,c:5,d:5,e:5},issues:['A visible problem.']},passed={pass:true,scores:{a:4,b:4,c:4,d:4,e:4},issues:[]};
   expect(repairOutcomeMerit(passed)).toBeGreaterThan(repairOutcomeMerit(failed));
 });

});
