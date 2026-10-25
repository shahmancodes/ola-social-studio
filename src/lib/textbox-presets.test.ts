import {describe,expect,it} from 'vitest';
import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';
import {TEXTBOX_PRESET_IDS,TEXTBOX_PRESETS,TextboxStyleSchema,expandTextboxStyle,mergeTextboxStyle,resolveTextbox,textboxGuide} from './textbox-style';
import {composePage,artifactPages} from './composition';
import {SimpleArtifactSchema} from './simple-content';
import {applyArtifactPatches} from './artifact-repair';
import {buildVisualScene,scenePng,sceneSvg} from './content-layout';
import {canvasTexts} from './canvas-text';
import {sceneIssues} from './scene-renderer';
import {addSceneToPptx} from './modern-content';
import type {ContentBrand} from './content-brand';
const palette={background:'#ffffff',alternate:'#eeeeee',accent:'#164db8',ink:'#111111',dark:'#111111'};
const brand:ContentBrand={companyId:'test',name:'Example',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],palette,assets:[]};
const page={title:'One clear idea',body:'Give the next step a useful shape.',cta:'Start here'};
const plan={family:'oversized-typography',bodyMode:'text',intent:{goal:'A clear next step',relationship:'statement',reason:'A single action anchors the reading path.'},responsive:{version:1,balance:{version:1},arrangement:'stack'},typography:{cta:{box:{preset:'rounded-callout'},underline:true,bold:false,italic:true,size:1.1}}};

describe('editable textbox presets',()=>{
 it('exposes ten validated, distinct treatments to agents',()=>{
  expect(TEXTBOX_PRESETS.map(p=>p.id)).toEqual(TEXTBOX_PRESET_IDS);expect(TEXTBOX_PRESETS).toHaveLength(10);
  expect(new Set(TEXTBOX_PRESETS.map(p=>JSON.stringify(p.style))).size).toBe(10);
  for(const p of TEXTBOX_PRESETS){expect(TextboxStyleSchema.safeParse(p.style).success).toBe(true);expect(textboxGuide()).toContain(p.id);}
  expect(TextboxStyleSchema.safeParse({preset:'invented'}).success).toBe(false);
 });
 it('inherits sparse overrides and allows clearing paint and detaching without changing the style',()=>{
  const style=TextboxStyleSchema.parse({preset:'rounded-callout',borderStyle:'dotted',radius:47,padding:{left:61},fill:'none'});
  const resolved=resolveTextbox(style,palette)!;expect(resolved).toMatchObject({borderStyle:'dotted',radius:47,padding:{top:24,right:32,bottom:24,left:61}});expect(resolved.fill).toBeUndefined();
  const custom=JSON.parse(JSON.stringify(expandTextboxStyle(style)));expect(custom.preset).toBeUndefined();expect(resolveTextbox(custom,palette)).toEqual(resolved);
  expect(resolveTextbox({preset:'rounded-callout',borderStyle:'none'},palette)?.borderWidth).toBe(0);
  expect(mergeTextboxStyle(style,{})).toEqual({});expect(mergeTextboxStyle(style,{preset:'plain'})).toEqual({preset:'plain'});
 });
 it('preserves a preset and unrelated overrides through agent local repairs',()=>{
  const p=composePage(page,plan),artifact=SimpleArtifactSchema.parse({type:'poster',headline:page.title,subline:page.body,cta:page.cta,composition:p.composition});
  const fixed=applyArtifactPatches(artifact,{reason:'Adjust the chosen callout',patches:[{target:'page-1',typography:{cta:{box:{borderWidth:4,padding:{left:50}},underline:false,size:.9}}}]},'');
  const result=artifactPages(fixed)[0];expect(result).toMatchObject(page);expect(result.composition?.typography?.cta).toMatchObject({size:.9,italic:true,underline:false,box:{preset:'rounded-callout',borderWidth:4,padding:{left:50}}});
  expect(resolveTextbox(result.composition?.typography?.cta?.box,palette)?.padding).toEqual({top:24,right:32,bottom:24,left:50});
 });
 it.each(TEXTBOX_PRESET_IDS)('measures %s using the same style in canvas and exports',async preset=>{
  const p=composePage(page,{...plan,typography:{cta:{...plan.typography.cta,box:{preset}}}}),scene=await buildVisualScene('poster',p,brand);await scenePng(scene);
  expect(sceneIssues(scene)).toEqual([]);expect(canvasTexts(scene,p).find(t=>t.source==='cta')).toMatchObject({text:page.cta,underline:true,italic:true,fontWeight:400,typography:{box:{preset}}});
  expect(sceneSvg(scene)).toContain('text-decoration:underline');
 },20000);
 it('preserves preset overrides alongside free-form positions, dimensions and text edits in the saved editor document',async()=>{
  const p=composePage(page,plan);
  p.editorAppearance={freeform:{version:1,objects:[{id:'custom-note',kind:'text',custom:true,x:123,y:234,width:500,height:200,rotation:0,text:'An edited idea',fontSize:37,bold:false,italic:true,underline:true,color:'#111111',typography:{box:{preset:'rounded-callout',borderStyle:'double',borderWidth:6,radius:47,padding:{top:39,left:61}}}}]}};
  const artifact=SimpleArtifactSchema.parse({type:'poster',headline:page.title,subline:page.body,cta:page.cta,composition:p.composition,editorAppearance:p.editorAppearance});
  const restored=artifactPages(SimpleArtifactSchema.parse(JSON.parse(JSON.stringify(artifact))))[0];
  const scene=await buildVisualScene('poster',restored,brand);await scenePng(scene);
  expect(scene.freeform).toBe(true);expect(scene.elements[0]).toMatchObject({x:123,y:234,w:500,h:200,size:37,text:'An edited idea',underline:true,textbox:{borderStyle:'double'}});
  expect(sceneSvg(scene)).toContain('border-style:double');expect(sceneSvg(scene)).toContain('text-decoration:underline');
 },20000);
 it('lets editor changes override agent typography and preset values, including native presentation text',async()=>{
  const p=composePage(page,plan),initial=await buildVisualScene('presentation',p,brand),id=canvasTexts(initial,p).find(t=>t.source==='cta')!.id;
  p.editorAppearance={text:{[id]:{fontSize:36,bold:true,italic:false,underline:false,box:{fill:'none',borderStyle:'double',borderWidth:6,padding:{left:50}}}}};
  const scene=await buildVisualScene('presentation',p,brand);await scenePng(scene);
  const target=canvasTexts(scene,p).find(t=>t.id===id)!;expect(target).toMatchObject({fontSize:36,fontWeight:700,italic:false,underline:false,typography:{box:{preset:'rounded-callout'}},textbox:{borderStyle:'double'}});expect(target.textbox?.fill).toBeUndefined();
  expect(target.textbox?.padding.right).toBeGreaterThan(0);
  const deck=new pptxgen();deck.layout='LAYOUT_WIDE';addSceneToPptx(deck,scene);const zip=await JSZip.loadAsync(await deck.write({outputType:'nodebuffer'}) as Buffer),xml=await zip.file('ppt/slides/slide1.xml')!.async('string');expect([...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)].map(m=>m[1]).join('')).toContain('Start here');
  const agentScene=await buildVisualScene('presentation',composePage(page,plan),brand);await scenePng(agentScene);const agentDeck=new pptxgen();agentDeck.layout='LAYOUT_WIDE';addSceneToPptx(agentDeck,agentScene);const az=await JSZip.loadAsync(await agentDeck.write({outputType:'nodebuffer'}) as Buffer);expect(await az.file('ppt/slides/slide1.xml')!.async('string')).toContain('u="sng"');
 },20000);
});
