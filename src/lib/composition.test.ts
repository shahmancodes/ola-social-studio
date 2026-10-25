import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { compositionGuide, pageCompositionCapabilities, COMPOSITION_FAMILIES, CompositionPlanSchema, composePage, copyText, compositionIssues, resolvedComponent, setCopyText, artifactPages, withArtifactPages, syncArtifactComposition, planArtifactCompositions, type CopyPage } from './composition';
import { SimpleArtifactSchema } from './simple-content';
import { applyArtifactPatches, contentForEvidence, requiredCopyIssues, enforceBriefScope } from './artifact-repair';
it('offers only source-compatible composition families and recipes for every page',()=>{
 const plain=pageCompositionCapabilities({title:'Finish clearly',body:'Keep the next action useful.',cta:'Save this guide.'});
 expect(plain.families).toEqual(['oversized-typography','asymmetric-editorial','modular-grid']);expect(plain.plainVisualOnly).toBe(true);expect(plain.recipes).not.toContain('tahta-timeline');
 const process=pageCompositionCapabilities({title:'Keep moving',body:'Plan → Build → Review'});expect(process.families).toContain('diagram-led');expect(process.recipes).toContain('tahta-timeline');
 const image=pageCompositionCapabilities({title:'Observe',body:'Look closely.',assetId:'supplied'});expect(image.families).toContain('image-led');expect(image.recipes).toContain('apple-image-cover');
});
it('removes unsupported designed text flow from the initial plain-brief planning schema',()=>{
 const schema=JSON.parse(compositionGuide({allowTextFlow:false}).split('PLAN schema: ')[1]);
 expect(schema.properties.responsive.properties.visual.properties.textFlow).toEqual({not:{}});
 const designed=JSON.parse(compositionGuide({allowTextFlow:true}).split('PLAN schema: ')[1]);
 expect(designed.properties.responsive.properties.visual.properties.textFlow.enum).toEqual(['regions','grouped']);
});
import { buildVisualScene, scenePng, sceneSvg } from './content-layout';
import { sceneIssues } from './scene-renderer';
import { sceneTargets } from './composition-scene';
import { renderModernArtifact } from './modern-content';
import type { ContentBrand } from './content-brand';
import { execFileSync } from 'node:child_process';
import { createSemanticComponent } from './semantic-component-presets';

const plan = (family: typeof COMPOSITION_FAMILIES[number], extra = {}) => CompositionPlanSchema.parse({ family, intent: {goal:'Make the relationship easy to understand',relationship:'statement',reason:'Use hierarchy suited to this content'}, ...extra });
const processPage = () => composePage({title:'Keep the work moving.',body:'Plan → Build → Review → Learn',cta:'Improve one handoff today.'},plan('diagram-led',{bodyMode:'sequence',separator:' → '}));
const asPoster = (page: CopyPage) => SimpleArtifactSchema.parse({type:'poster',headline:page.title,subline:page.body,cta:page.cta,composition:page.composition,semanticComponent:page.semanticComponent,designVersion:2});
describe('copy ownership and composition contracts',()=>{
  it('stores source text once and resolves four ordered stages without repeating the supporting line',()=>{
    const page=processPage(); expect(compositionIssues(page)).toEqual([]);
    expect(page.composition?.blocks.filter(b=>b.source==='body')).toHaveLength(4);
    expect(page.composition?.placements.some(p=>p.slot==='body')).toBe(false);
    expect(page.semanticComponent?.items.map(i=>i.label)).toEqual(['@copy:body-0','@copy:body-1','@copy:body-2','@copy:body-3']);
    expect(resolvedComponent(page)?.items.map(i=>i.label)).toEqual(['Plan','Build','Review','Learn']);
    expect(JSON.stringify(page.composition)).not.toContain('Improve one handoff');
    const brief='Headline: "Keep the work moving." Supporting line: "Plan → Build → Review → Learn" CTA: "Improve one handoff today." Avoid extra text.';
    expect(requiredCopyIssues(asPoster(page),brief)).toEqual([]);
    expect(contentForEvidence(asPoster(page))).toHaveProperty('semanticComponent.items.2.label','Review');
    expect(contentForEvidence(asPoster(page))).toHaveProperty('subline','');
    expect(enforceBriefScope(asPoster(page),brief)).toEqual(asPoster(page));
  });
  it('keeps stage IDs stable and makes source and component edits update the same value',()=>{
    const page=processPage(), edited=setCopyText(page,'body-2','Inspect');
    expect(edited.body).toBe('Plan → Build → Inspect → Learn');expect(copyText(edited,'body-2')).toBe('Inspect');
    const before=asPoster(page), displayed=withArtifactPages(before,artifactPages(before).map(p=>({...p,semanticComponent:resolvedComponent(p)})));
    if(displayed.type!=='poster')throw new Error();
    displayed.semanticComponent!.items[1].label='Create';
    const synced=syncArtifactComposition(before,displayed);expect(synced).toHaveProperty('subline','Plan → Create → Review → Learn');
    expect(artifactPages(synced)[0].semanticComponent!.items[1].label).toBe('@copy:body-1');
    const titleEdit=syncArtifactComposition(before,{...withArtifactPages(before,artifactPages(before).map(p=>({...p,semanticComponent:resolvedComponent(p)}))),headline:'Move together.'} as typeof before);
    expect(titleEdit).toHaveProperty('headline','Move together.');
    const changed=structuredClone(before);artifactPages(changed)[0].composition!.blocks[0].id='another-id';
    expect(()=>syncArtifactComposition(before,changed)).toThrow(/preserve copy IDs/);
  });
  it.each(['missing','duplicate','uncovered','extra-label','changed-separator'])('rejects %s copy plans',kind=>{
    const page=processPage();
    if(kind==='missing')page.composition!.placements[0].copyId='unknown';
    if(kind==='duplicate')page.composition!.placements.push({...page.composition!.placements[0]});
    if(kind==='uncovered')page.composition!.blocks=page.composition!.blocks.filter(b=>b.id!=='body-1');
    if(kind==='extra-label')page.semanticComponent!.note='Unauthorized label';
    if(kind==='changed-separator')page.body='Plan, Build, Review, Learn';
    expect(compositionIssues(page).length).toBeGreaterThan(0);
  });
  it('rejects unsupported capabilities and cannot invent labels to force a diagram',()=>{
    expect(()=>composePage({title:'Look',body:'See clearly.'},plan('image-led'))).toThrow(/artwork/);
    expect(()=>composePage({title:'Look',body:'See clearly.'},plan('diagram-led'))).toThrow(/component/);
    expect(()=>composePage({title:'Look',body:'See clearly.'},plan('comparison'))).toThrow(/groups/);
    expect(()=>composePage({title:'Look',body:'See clearly.'},plan('diagram-led',{bodyMode:'sequence'}))).toThrow(/explicit/);
    expect(()=>CompositionPlanSchema.parse({...plan('modular-grid'),tuning:{scale:3}})).toThrow();
  });
  it('allows composition repairs and refuses hidden rewrites or legacy layout changes',()=>{
    const artifact=asPoster(processPage()), brief='Headline: "Keep the work moving." Supporting line: "Plan → Build → Review → Learn" CTA: "Improve one handoff today."';
    const edited=applyArtifactPatches(artifact,{patches:[{target:'page-1',compositionPlan:plan('asymmetric-editorial',{bodyMode:'sequence',separator:' → '})}],reason:'Use a different geometry'},brief);
    expect(artifactPages(edited)[0].composition?.family).toBe('asymmetric-editorial');
    expect(requiredCopyIssues(edited,brief)).toEqual([]);
    expect(()=>applyArtifactPatches(artifact,{patches:[{target:'page-1',layout:'statement'}],reason:'Change'},brief)).toThrow(/compositionPlan/);
    expect(()=>applyArtifactPatches(artifact,{patches:[{target:'page-1',body:'Invented'}],reason:'Change'},brief)).toThrow(/required copy/);
  });
  it('validates existing semantic-library copy and rejects reordered source segments',()=>{
    const page=composePage({title:'Compare the approaches.',body:'',semanticComponent:createSemanticComponent('comparison')},plan('comparison'));
    expect(compositionIssues(page)).toEqual([]);expect(resolvedComponent(page)?.leftTitle).toBe('Option A');
    const p=processPage();[p.composition!.placements[0].slot,p.composition!.placements[1].slot]=[p.composition!.placements[1].slot,p.composition!.placements[0].slot];
    expect(compositionIssues(p).join(' ')).toContain('reading order');
  });
  it('leaves legacy content without composition metadata unchanged',()=>{
    const a=SimpleArtifactSchema.parse({type:'story',headline:'Look',subline:'Observe carefully',cta:'Save',layout:'hero'});
    expect(artifactPages(a)[0].composition).toBeUndefined();expect(syncArtifactComposition(a,a)).toEqual(a);
  });
  it('orchestrates two candidates from the same immutable copy, pages and selected assets',()=>{
    const artifact=SimpleArtifactSchema.parse({type:'carousel',title:'A review sequence',caption:'Save',slides:Array.from({length:6},(_,i)=>({id:`page-${i+1}`,title:`Step ${i+1}`,body:'One concise supporting sentence.'}))});
    const first=['oversized-typography','asymmetric-editorial','modular-grid'] as const, second=['asymmetric-editorial','modular-grid','oversized-typography'] as const;
    const input={candidates:[{pages:Array.from({length:6},(_,i)=>plan(first[i%3]))},{pages:Array.from({length:6},(_,i)=>plan(second[i%3]))}]};
    const {candidates}=planArtifactCompositions(artifact,input);
    expect(candidates).toHaveLength(2);
    for(const c of candidates)expect(artifactPages(c).map(p=>({title:p.title,body:p.body,assetId:p.assetId}))).toEqual(artifactPages(artifact).map(p=>({title:p.title,body:p.body,assetId:p.assetId})));
    expect(artifactPages(artifact).every(p=>!p.composition)).toBe(true);
    expect(()=>planArtifactCompositions(artifact,{candidates:[input.candidates[0],input.candidates[0]]})).toThrow(/different/);
    expect(()=>planArtifactCompositions(artifact,{candidates:[input.candidates[0],{pages:input.candidates[1].pages.slice(1)}]})).toThrow(/page count/);
    expect(()=>planArtifactCompositions(artifact,{...input,copy:'Rewritten'})).toThrow();
  });
});

describe('composition rendering across active formats',()=>{
  let dir:string;let brand:ContentBrand;
  beforeAll(async()=>{
    dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-compositions-'));
    const photo=path.join(dir,'photo.png');
    await sharp(Buffer.from('<svg width="1200" height="750" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="750" fill="#24416a"/><circle cx="600" cy="375" r="260" fill="#73a5c4"/><path d="M0 650L1200 300V750H0Z" fill="#ddc9a1"/></svg>')).png().toFile(photo);
    brand={companyId:'test',name:'Example',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],palette:{background:'#FFFFFF',alternate:'#F1F3F5',accent:'#164DB8',ink:'#161616',dark:'#161616'},assets:[{id:'photo',name:'photo.png',mediaType:'image/png',diskPath:photo,role:'primary'}]};
  });
  afterAll(async()=>fs.rm(dir,{recursive:true,force:true}));
  it('runs font measurement through the actual tsx worker transform',()=>{
    const output=execFileSync(process.execPath,['--import','tsx','src/comparison/composition-runtime-smoke.ts'],{cwd:process.cwd(),encoding:'utf8',timeout:20000});
    expect(JSON.parse(output.trim())).toMatchObject({width:1080,height:1350});
  },25000);
  for(const format of ['poster','story','carousel'] as const)for(const family of COMPOSITION_FAMILIES){
    it(`${family} fits and exports ${format}`,async()=>{
      const base:CopyPage={title:'Make the idea clear.',body:family==='diagram-led'?'Plan → Build → Review → Learn':family==='comparison'?'Before\nAfter':'Give the reader one useful action.',cta:'Start with one change.',...(family==='image-led'?{assetId:'photo',credit:'Image: Example'}:{})};
      const page=composePage(base,plan(family,family==='diagram-led'?{bodyMode:'sequence',separator:' → '}:family==='comparison'?{bodyMode:'comparison',separator:'\n'}:{}));
      const scene=await buildVisualScene(format,page,brand,1,6);const bytes=await scenePng(scene);
      expect(sceneIssues(scene)).toEqual([]);expect(await sharp(bytes).metadata()).toMatchObject({width:format==='poster'?1240:1080,height:format==='poster'?1754:format==='story'?1920:1350});
      const targets=sceneTargets(scene);expect(targets.targets.find(t=>t.id==='title')?.source).toBe('title');
      if(family==='diagram-led'){expect(scene.elements.filter(e=>e.kind==='text'&&e.copySource==='body')).toHaveLength(4);expect(scene.elements.filter(e=>e.id?.startsWith('sequence-arrow'))).toHaveLength(6);expect(scene.elements.some(e=>e.id==='body')).toBe(false);expect(sceneSvg(scene)).not.toContain('@copy:');}
      if(process.env.OLA_COMPOSITION_FIXTURE_DIR){await fs.mkdir(process.env.OLA_COMPOSITION_FIXTURE_DIR,{recursive:true});await fs.writeFile(path.join(process.env.OLA_COMPOSITION_FIXTURE_DIR,`${format}-${family}.png`),bytes);}
    },20000);
  }
  it('uses distinct geometry and preserves identical copy between two candidates',async()=>{
    const p={title:'Make the idea clear.',body:'Give the reader one useful action.'};
    const a=await buildVisualScene('poster',composePage(p,plan('oversized-typography')),brand),b=await buildVisualScene('poster',composePage(p,plan('asymmetric-editorial')),brand);
    expect(a.elements.filter(e=>e.kind==='text').map(e=>e.kind==='text'&&e.text)).toEqual(b.elements.filter(e=>e.kind==='text').map(e=>e.kind==='text'&&e.text));
    expect(a.elements.find(e=>e.id==='title')).not.toMatchObject({w:(b.elements.find(e=>e.id==='title') as {w:number}).w});
  });
  it('balances headline lines, fits surfaces to real copy, and honors native diagram font edits',async()=>{
    const editorial=await buildVisualScene('carousel',composePage({title:'Explain the reason',body:'State the problem this change addresses.'},plan('asymmetric-editorial')),brand);await scenePng(editorial);
    const title=editorial.elements.find(e=>e.id==='title');expect(title?.kind==='text'&&title.lines).not.toContain('the');
    const grid=await buildVisualScene('poster',composePage({title:'One idea.',body:'One useful sentence.'},plan('modular-grid')),brand);await scenePng(grid);
    const card=grid.elements.find(e=>e.kind==='rect'&&e.fitText==='body');const body=grid.elements.find(e=>e.id==='body');
    expect(card&&body&&'h'in card&&'h'in body&&card.h).toBeLessThan(300);
    const page=processPage();page.semanticComponent!.style={foreground:'#161616',muted:'#53535C',line:'#d7d7dc',surface:'#FFFFFF',accent:'#164DB8',seriesTwo:'#9599A6',seriesThree:'#c9cbd2',seriesFour:'#467640',seriesFive:'#9B4874',onAccent:'#FFFFFF',fontFamily:'poppins',headingFontFamily:'poppins',quoteFontFamily:'serif'};
    const diagram=await buildVisualScene('poster',page,brand);await scenePng(diagram);expect(diagram.elements.find(e=>e.id==='semanticComponent.items.0.label')?.fontFamily).toBe('Poppins');
  },20000);
  it('rejects foreign artwork and keeps preview and export on the same scene',async()=>{
    const page=composePage({title:'Look closely.',body:'Inspect the image.',assetId:'foreign'},plan('image-led'));
    await expect(buildVisualScene('story',page,brand)).rejects.toThrow(/snapshot/);
    const artifact=asPoster(processPage());await renderModernArtifact(artifact,brand,path.join(dir,'export'));
    const scene=await buildVisualScene('poster',artifactPages(artifact)[0],brand);const png=await scenePng(scene);
    expect(Buffer.compare(await fs.readFile((artifact as {imagePath:string}).imagePath),png)).toBe(0);
  },20000);
  it('renders an existing semantic component in its allocated region and rejects foreign font IDs',async()=>{
    const p=composePage({title:'Compare the approaches.',body:'',semanticComponent:createSemanticComponent('comparison')},plan('comparison'));
    const scene=await buildVisualScene('poster',p,brand);await scenePng(scene);expect(scene.elements.some(e=>e.id==='artwork')).toBe(true);
    const bad=composePage({title:'One idea.',body:'One action.'},plan('modular-grid',{tuning:{headingFontId:'another-company-font'}}));
    await expect(scenePng(await buildVisualScene('poster',bad,brand))).rejects.toThrow(/company snapshot/);
  },20000);
});
