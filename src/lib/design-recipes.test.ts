import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import sharp from 'sharp';
import {DESIGN_RECIPES,DesignRecipeSchema,recipeIssues} from './design-recipes';
import {composePage,compositionIssues,artifactPages,setCopyText,type CopyPage} from './composition';
import {buildVisualScene,scenePng,sceneSvg} from './content-layout';
import {sceneIssues} from './scene-renderer';import {formatGeometry,type VisualFormat} from './responsive-layout';
import {SimpleArtifactSchema} from './simple-content';import {SemanticComponentSchema} from './schemas';
import {sceneTargets} from './composition-scene';import {applyArtifactPatches} from './artifact-repair';
import type {ContentBrand} from './content-brand';
import {renderModernArtifact} from './modern-content';
import {canvasTexts} from './canvas-text';
let dir:string,brand:ContentBrand;
const make=(id:typeof DESIGN_RECIPES[number]['id'])=>{
 const spec=DESIGN_RECIPES.find(r=>r.id===id)!,p:CopyPage={title:'Make the next step clear.',body:'Give the reader a useful starting point.',cta:'Start with one change.'};
 if(['penpot-event-card','apple-split-image','apple-image-cover','apple-triptych'].includes(id))p.assetId='photo-0';
 if(id==='apple-triptych')p.supportingAssetIds=['photo-1','photo-2'];
 if(id==='tahta-stats'){p.body='Three supplied measures, side by side.';p.semanticComponent=SemanticComponentSchema.parse({kind:'barChart',unit:'%',items:[{label:'Discover',value:35},{label:'Build',value:62},{label:'Ship',value:89}]});}
 if(id==='tahta-compare')p.semanticComponent=SemanticComponentSchema.parse({kind:'comparison',leftTitle:'Before',rightTitle:'After',items:[{label:'Unclear request',detail:'One precise question'},{label:'Missing context',detail:'A concise explanation'},{label:'No evidence',detail:'A record of checks'}]});
 if(id==='tahta-timeline')p.body='Plan → Build → Review → Learn';
 return composePage(p,{family:spec.family,recipe:{version:1,id},intent:{goal:'Explain the supplied idea.',relationship:id==='tahta-timeline'?'sequence':id==='tahta-compare'?'contrast':'statement',reason:'The approved recipe supports the message.'},responsive:{version:1},...(id==='tahta-timeline'?{bodyMode:'sequence',separator:' → '}:{})});
};
beforeAll(async()=>{
 dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-recipes-'));const assets=[];
 for(const [i,[w,h,color]]of [[1200,750,'#46736A'],[800,1200,'#AB684A'],[1000,1000,'#626FA5']].entries()){
  const file=path.join(dir,`photo-${i}.png`);await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${color}"/><circle cx="${Number(w)/2}" cy="${Number(h)/2}" r="${Number(w)*.23}" fill="#E1DCC4"/></svg>`)).png().toFile(file);assets.push({id:`photo-${i}`,name:`Photo ${i}`,mediaType:'image/png',diskPath:file,role:'primary'});
 }
 brand={companyId:'fixture',name:'Example',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],palette:{background:'#FFFFFF',alternate:'#EFF2EC',accent:'#255C49',ink:'#16221B',dark:'#16221B'},assets};
});
afterAll(async()=>fs.rm(dir,{recursive:true,force:true}));
describe('approved native recipes',()=>{
 for(const format of ['poster','story','carousel']as VisualFormat[])for(const recipe of DESIGN_RECIPES)it(`${recipe.id} · ${format}`,async()=>{
  const p=make(recipe.id);p.composition!.responsive!.balance={version:1};
  const scene=await buildVisualScene(format,p,brand,0,6),png=await scenePng(scene),meta=await sharp(png).metadata();
  expect(meta).toMatchObject({width:formatGeometry(format).width,height:formatGeometry(format).height});expect(compositionIssues(p)).toEqual([]);expect(sceneIssues(scene)).toEqual([]);
  expect(scene.responsiveLayout?.recipe?.id).toBe(recipe.id);
  for(const block of p.composition!.blocks)expect(scene.elements.filter(e=>e.copyId===block.id)).toHaveLength(1);
  expect(sceneSvg(scene)).not.toContain('@copy:');expect(sceneTargets(scene).groups?.length).toBeGreaterThan(0);
  if(recipe.id==='apple-triptych'){const images=scene.elements.filter(e=>e.kind==='image');expect(images).toHaveLength(3);for(const img of images)if(img.kind==='image')expect(img.w/img.h).toBeCloseTo(img.bytes.readUInt32BE(16)/img.bytes.readUInt32BE(20));}
  if(recipe.id==='tahta-stats'){
   expect(scene.elements.filter(e=>e.id?.startsWith('metric-value-'))).toHaveLength(3);
   const bars=scene.elements.filter(e=>e.id?.startsWith('chart-bar-'));expect(bars).toHaveLength(3);
   expect(scene.elements.some(e=>e.kind==='text'&&e.id==='chart-axis-2'&&e.text==='100%')).toBe(true);
   expect(bars[0].kind==='rect'&&bars[2].kind==='rect'&&bars[0].w/bars[2].w).toBeCloseTo(35/89);
  }
  if(recipe.id==='tahta-compare')expect(scene.elements.filter(e=>e.id?.startsWith('comparison-rule-'))).toHaveLength(3);
  if(recipe.id==='tahta-timeline')expect(scene.elements.filter(e=>e.id?.startsWith('stage-connector-'))).toHaveLength(3);
  if(recipe.id==='tahta-timeline'&&format==='story'){const label=scene.elements.find(e=>e.id==='semanticComponent.items.0.label')!;expect(scene.elements.some(e=>e.id==='visual-card-0')).toBe(false);if(label.kind==='text')expect(label.align).toBe('center');}
  if(process.env.OLA_RECIPE_FIXTURE_DIR){await fs.mkdir(process.env.OLA_RECIPE_FIXTURE_DIR,{recursive:true});await fs.writeFile(path.join(process.env.OLA_RECIPE_FIXTURE_DIR,`${recipe.id}-${format}.png`),png);await fs.writeFile(path.join(process.env.OLA_RECIPE_FIXTURE_DIR,`${recipe.id}-${format}.svg`),sceneSvg(scene));}
 },20000);
 it('uses distinct geometry for the three single-image recipes in every format',async()=>{
  for(const format of ['poster','story','carousel']as VisualFormat[]){const signatures=[];for(const id of ['penpot-event-card','apple-split-image','apple-image-cover']as const){const scene=await buildVisualScene(format,make(id),brand);await scenePng(scene);signatures.push(JSON.stringify(sceneTargets(scene)));}expect(new Set(signatures).size).toBe(3);}
 },20000);
 it('rejects unknown IDs, missing assets, duplicate triptych images, and incompatible data',()=>{
  expect(DesignRecipeSchema.safeParse({version:1,id:'unknown'}).success).toBe(false);
  for(const id of ['penpot-event-card','apple-triptych','tahta-stats','tahta-compare','tahta-timeline']as const){const spec=DESIGN_RECIPES.find(r=>r.id===id)!;expect(()=>composePage({title:'Hello',body:'A statement.'},{family:spec.family,recipe:{version:1,id},responsive:{version:1},intent:{goal:'Test',relationship:'statement',reason:'Invalid input'}})).toThrow();}
  const p=make('apple-triptych');p.supportingAssetIds=['photo-0','photo-1'];expect(recipeIssues(p,p.composition!)).not.toEqual([]);
 });
 it('rejects extra images outside the company snapshot',async()=>{
  const p=make('apple-triptych');p.supportingAssetIds=['photo-1','foreign-image'];await expect(buildVisualScene('poster',p,brand)).rejects.toThrow(/outside this company/);
 });
 it('keeps recipe, source copy and numeric values through edits and bounded repairs',()=>{
  const p=make('tahta-timeline'),artifact=SimpleArtifactSchema.parse({type:'poster',headline:p.title,subline:p.body,cta:p.cta,composition:p.composition,semanticComponent:p.semanticComponent});
  const edited=setCopyText(p,'body-1','Create');expect(edited.body).toBe('Plan → Create → Review → Learn');expect(edited.composition?.recipe).toEqual(p.composition?.recipe);
  const fixed=applyArtifactPatches(artifact,{patches:[{target:'page-1',layoutActions:[{action:'spacing',target:'content',gap:.02}]}],reason:'Tighten grouping'},'');expect(artifactPages(fixed)[0].composition?.recipe).toEqual(p.composition?.recipe);expect(artifactPages(fixed)[0].body).toBe(p.body);
 });
 it('keeps saved compositions opt-in and measures editable brand fonts',async()=>{
  const legacy=make('tahta-lead');delete legacy.composition!.recipe;const a=await buildVisualScene('poster',legacy,brand);await scenePng(a);expect(a.responsiveLayout?.recipe).toBeUndefined();
  const font={id:'custom',name:'Company font',mediaType:'font/woff2',diskPath:path.resolve('node_modules/@fontsource/poppins/files/poppins-latin-700-normal.woff2'),role:'primary'};
  const p=make('tahta-lead');p.composition!.tuning.headingFontId='custom';const scene=await buildVisualScene('story',p,{...brand,fonts:[font]});await scenePng(scene);expect(scene.fontReport?.join(' ')).toContain('Company font');
 },20000);
 for(const [format,id]of [['poster','apple-triptych'],['story','tahta-stats'],['carousel','penpot-event-card']]as const)it(`keeps preview/export parity and credits for ${format}`,async()=>{
  const p=make(id),a=SimpleArtifactSchema.parse(format==='carousel'?{type:'carousel',title:'Test',caption:'',slides:[1,2,3].map(i=>({...p,id:'page-'+i})),designVersion:2}:{type:format,headline:p.title,subline:p.body,cta:p.cta,...p,designVersion:2});
  await renderModernArtifact(a,brand,path.join(dir,'export-'+format));const scene=await buildVisualScene(format,artifactPages(a)[0],brand,0,format==='carousel'?3:1),preview=await scenePng(scene);
  const file=a.type==='carousel'?a.imagePaths[0]:'imagePath'in a?a.imagePath:undefined;expect(Buffer.compare(preview,await fs.readFile(file!))).toBe(0);
  expect((await sharp(preview).metadata()).xmp?.toString()).toContain('Native Ola geometry');expect(sceneSvg(scene)).toContain('<metadata>');
  if(id==='tahta-stats'){expect(canvasTexts(scene,artifactPages(a)[0]).some(t=>t.source.endsWith('.value'))).toBe(false);expect(scene.elements.find(e=>e.id==='metric-value-0')?.kind).toBe('text');}
 },20000);
});
