import { describe, expect, it } from 'vitest';
import { DesignTypographySchema, typographyHtml, typographyIssues } from './design-typography';
import { artifactPages, composePage } from './composition';
import { buildVisualScene, scenePng, sceneSvg } from './content-layout';
import { sceneIssues } from './scene-renderer';
import { canvasTexts } from './canvas-text';
import { applyArtifactPatches } from './artifact-repair';
import { SimpleArtifactSchema } from './simple-content';
import type { ContentBrand } from './content-brand';
import type { VisualFormat } from './responsive-layout';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const brand:ContentBrand={companyId:'test',name:'Example',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],palette:{background:'#FFFFFF',alternate:'#ECEFF5',accent:'#164DB8',ink:'#161616',dark:'#161616'},assets:[]};
const title='Make one small thing useful.',body='A focused release starts with a clear job for the reader.';
const plan={family:'oversized-typography',bodyMode:'text',intent:{goal:'Focus the reader on one useful action',relationship:'statement',reason:'A deliberate phrase break makes the message memorable.'},responsive:{version:1,balance:{version:1},anchor:'center',craft:{version:1,surface:'dark',measure:.9,horizontalAnchor:'left'}},typography:{title:{leading:1.02,tracking:-.025,breakAfter:[2],emphasis:[{start:2,end:5,treatment:'italic'}]},body:{leading:1.3,size:.9,width:.85}}};

describe('source-preserving design craft',()=>{
  it('changes one craft control without resetting the rendered surface, grid or other controls',async()=>{
    const crafted={...plan,responsive:{...plan.responsive,craft:{version:1,surface:'dark',measure:.8,horizontalAnchor:'center',distribution:'spread',stagger:.1,rule:'top',accentRule:true}}};
    const composed=composePage({title,body},crafted);
    const artifact=SimpleArtifactSchema.parse({type:'poster',headline:title,subline:body,composition:composed.composition});
    const fixed=applyArtifactPatches(artifact,{reason:'Remove the frame without losing the visual direction',patches:[{target:'page-1',craft:{rule:'none'}}]},'');
    const page=artifactPages(fixed)[0];
    expect(page.composition?.responsive?.craft).toEqual({...composed.composition!.responsive!.craft,rule:'none'});
    const before=await buildVisualScene('poster',composed,brand),after=await buildVisualScene('poster',page,brand);
    await scenePng(after);
    expect(after.background).toBe(brand.palette.dark);
    expect(after.responsiveLayout?.frame).toEqual(before.responsiveLayout?.frame);
    expect(after.elements.some(e=>e.id==='craft-rule-top')).toBe(false);
    expect(after.elements.some(e=>e.id==='craft-accent-rule')).toBe(true);
    expect(sceneIssues(after)).toEqual([]);
    expect(artifactPages(artifact)[0].composition?.responsive?.craft?.rule).toBe('top');
  },20000);
  it('rejects empty, identical and metadata-only repairs so the agent must make an effective change',()=>{
    const composed=composePage({title,body},plan);
    const artifact=SimpleArtifactSchema.parse({type:'poster',headline:title,subline:body,composition:composed.composition});
    const patch=(patches:unknown[])=>({reason:'Resolve the visible defect',patches});
    expect(()=>applyArtifactPatches(artifact,patch([]),'')).toThrow('no design change');
    expect(()=>applyArtifactPatches(artifact,patch([{target:'page-1',craft:{surface:'dark'}}]),'')).toThrow('no design change');
    expect(()=>applyArtifactPatches(artifact,patch([{target:'page-1',compositionPlan:{...plan,intent:{...plan.intent,reason:'A newly named idea with the same geometry.'}}}]),'')).toThrow('no design change');
  });
  it('retains the chosen direction when a repair replans geometry without repeating its ID',()=>{
    const composed=composePage({title,body},{...plan,directionId:'editorial'});
    const artifact=SimpleArtifactSchema.parse({type:'poster',headline:title,subline:body,composition:composed.composition});
    const fixed=applyArtifactPatches(artifact,{reason:'Make the reading path editorial',patches:[{target:'page-1',compositionPlan:{...plan,family:'asymmetric-editorial'}}]},'');
    expect(artifactPages(fixed)[0].composition?.directionId).toBe('editorial');
  });
  it('gives a single native example the full reading lane instead of reserving an empty second column',async()=>{
    const page=composePage({title:'Offer a possibility',body:'',visualContent:{kind:'example',items:[{label:'Try:',detail:'Would it help to handle this case earlier?'}]}},{...plan,family:'modular-grid',responsive:{...plan.responsive,arrangement:'stack'},typography:{title:{leading:1.05},detail:{leading:1.3}}});
    const scene=await buildVisualScene('carousel',page,brand);await scenePng(scene);
    const visual=scene.responsiveLayout!.groups.find(g=>g.id==='artwork')!;
    expect(visual.visual?.columns).toBe(1);
    const detail=scene.elements.find(e=>e.id==='visualContent.items.0.detail');if(detail?.kind!=='text')throw Error('Missing editable example text.');
    expect(detail.w).toBeGreaterThan(scene.responsiveLayout!.frame.w*.85);expect(sceneIssues(scene)).toEqual([]);
  });
  it('renders an explicit fine frame while keeping crafted editorial copy on the chosen grid',async()=>{
    const page=composePage({title,body,cta:'Choose the essential flow.'},{...plan,family:'asymmetric-editorial',responsive:{...plan.responsive,arrangement:'stack',craft:{version:1,surface:'background',measure:1,horizontalAnchor:'left',rule:'inset',accentRule:true}}});
    const scene=await buildVisualScene('poster',page,brand);await scenePng(scene);
    expect(scene.elements.filter(e=>e.id?.startsWith('craft-rule-'))).toHaveLength(4);
    expect(scene.elements.some(e=>e.id==='craft-accent-rule')).toBe(true);
    const titleGroup=scene.responsiveLayout!.groups.find(g=>g.id==='title')!,bodyGroup=scene.responsiveLayout!.groups.find(g=>g.id==='body')!;
    expect(bodyGroup.x).toBe(titleGroup.x);expect(sceneIssues(scene)).toEqual([]);
  });
  it('fits the brand backing to a square logo and aligns it with the content measure',async()=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-logo-craft-'));try{
      const file=path.join(dir,'logo.png');await sharp({create:{width:100,height:100,channels:3,background:'#164DB8'}}).png().toFile(file);
      const page=composePage({title,body},plan),scene=await buildVisualScene('story',page,{...brand,logo:{id:'mark',name:'mark',mediaType:'image/png',diskPath:file,role:'primary'}});
      const logo=scene.elements.find(e=>e.id==='logo'),surface=scene.elements.find(e=>e.id==='logo-surface');
      expect(logo?.x).toBe(scene.responsiveLayout?.frame.x);if(logo?.kind==='image')expect(logo.w).toBe(logo.h);if(surface?.kind==='rect')expect(surface.w).toBeLessThan(100);
      await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);
    }finally{await fs.rm(dir,{recursive:true,force:true});}
  });
  it('validates source ranges and escapes styled copy',()=>{
    expect(typographyIssues(title,{breakAfter:[2],emphasis:[{start:2,end:4,treatment:'accent'}]})).toEqual([]);
    expect(typographyIssues(title,{breakAfter:[5]})).not.toEqual([]);
    expect(typographyIssues(title,{emphasis:[{start:1,end:3,treatment:'bold'},{start:2,end:4,treatment:'accent'}]})).not.toEqual([]);
    expect(typographyHtml('<script> & words',{emphasis:[{start:0,end:1,treatment:'accent'}]},'red;position:fixed')).toContain('&lt;script&gt;');
    expect(typographyHtml(title,{breakAfter:[2]})).toBe('Make one\nsmall thing useful.');
    expect(DesignTypographySchema.safeParse({title:{tracking:-1}}).success).toBe(false);
  });
  it.each<VisualFormat>(['poster','story','carousel','post','presentation'])('measures and exports styled text consistently in %s',async format=>{
    const page=composePage({title,body,cta:'Choose the essential flow.'},plan);
    const scene=await buildVisualScene(format,page,brand),png=await scenePng(scene);
    expect(png.length).toBeGreaterThan(1000);expect(sceneIssues(scene)).toEqual([]);
    const heading=scene.elements.find(e=>e.id==='title');expect(heading?.kind).toBe('text');
    if(heading?.kind==='text'){expect(heading.lines[0]).toBe('Make one');expect(heading.lines).toHaveLength(2);expect(heading.text).toBe(title);expect(heading.typography?.tracking).toBe(-.025);}
    expect(sceneSvg(scene)).toContain('line-height:1.02');expect(sceneSvg(scene)).toContain('letter-spacing:-0.025em');
    expect(canvasTexts(scene,page).find(t=>t.source==='title')).toMatchObject({text:title,typography:{leading:1.02,breakAfter:[2]}});
    expect(page.title).toBe(title);expect(page.body).toBe(body);
  },20000);
  it('repairs typography locally while retaining exact copy and unrelated structure',()=>{
    const composed=composePage({title,body},plan),artifact=SimpleArtifactSchema.parse({type:'poster',headline:title,subline:body,composition:composed.composition});
    const fixed=applyArtifactPatches(artifact,{reason:'Improve phrase rhythm',patches:[{target:'page-1',typography:{title:{leading:1.1,breakAfter:[3]}}}]},`Use headline "${title}" and supporting copy "${body}".`);
    expect(fixed.type==='poster'&&fixed.headline).toBe(title);expect(fixed.type==='poster'&&fixed.composition?.family).toBe('oversized-typography');
    expect(fixed.type==='poster'&&fixed.composition?.typography?.body?.leading).toBe(1.3);
    expect(()=>applyArtifactPatches(artifact,{reason:'Invalid break',patches:[{target:'page-1',typography:{title:{breakAfter:[100]}}}]},'')).toThrow(/word boundaries/);
  });
});
