import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';
import { TextboxStyleSchema, resolveTextbox, shadeColor, compositeColor, textboxCssText } from './textbox-style';
import { applyEditorAppearance } from './scene-editor-appearance';
import { canvasTexts } from './canvas-text';
import { scenePng, sceneSvg, buildVisualScene, type VisualScene } from './content-layout';
import { sceneIssues } from './scene-renderer';
import { addSceneToPptx } from './modern-content';
import { composePage, artifactPages } from './composition';
import { SimpleArtifactSchema } from './simple-content';
import { applyArtifactPatches } from './artifact-repair';
import type { ContentBrand } from './content-brand';

const brand:ContentBrand={companyId:'test',name:'Example',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],palette:{background:'#ffffff',alternate:'#eeeeee',accent:'#164db8',ink:'#111111',dark:'#111111'},assets:[]};
const box={fill:'accent',fillShade:.6,fillOpacity:.5,borderStyle:'double',borderColor:'ink',borderWidth:6,borderOpacity:.8,radius:30,padding:{top:24,right:36,bottom:24,left:36}} as const;
const plan={intent:{goal:'Make the action easy to find',relationship:'statement',reason:'One framed action anchors the editorial reading path.'},family:'oversized-typography',bodyMode:'text',responsive:{version:1,arrangement:'stack',balance:{version:1}},typography:{cta:{box}}};
const page={title:'One clear idea',body:'Make the next step easy to find.',cta:'Start here'};

describe('shared textbox styling',()=>{
  it('validates paint values and resolves shade, transparency and scaled padding',()=>{
    expect(TextboxStyleSchema.safeParse({...box,fill:'red;position:fixed'}).success).toBe(false);
    expect(TextboxStyleSchema.safeParse({...box,padding:{...box.padding,left:-1}}).success).toBe(false);
    expect(TextboxStyleSchema.safeParse({...box,fillOpacity:1.1}).success).toBe(false);
    expect(shadeColor('#164db8',1)).toBe('#ffffff');expect(shadeColor('#164db8',-1)).toBe('#000000');
    expect(compositeColor('#000000',.5,'#ffffff')).toBe('#808080');
    const style=resolveTextbox(box,brand.palette,2)!;expect(style.padding.left).toBe(72);expect(style.borderWidth).toBe(12);
    expect(textboxCssText(style)).toContain('border-style:double');expect(textboxCssText(style)).toContain('padding-top:calc(48px + .2em)');
    expect(resolveTextbox(undefined,brand.palette)).toBeUndefined();expect(textboxCssText()).toBe('');
  });
  it('retains styles in agent repairs and editor overrides without changing canonical copy',()=>{
    const composed=composePage(page,plan),artifact=SimpleArtifactSchema.parse({type:'poster',headline:page.title,subline:page.body,cta:page.cta,composition:composed.composition});
    const fixed=applyArtifactPatches(artifact,{reason:'Frame the action',patches:[{target:'page-1',typography:{cta:{box:{...box,radius:'pill'}}}}]},'');
    expect(artifactPages(fixed)[0]).toMatchObject({...page,composition:{typography:{cta:{box:{radius:'pill'}}}}});
  });
  it('measures padding before layout and exposes the same resolved style to SVG and canvas',async()=>{
    const plain=await buildVisualScene('poster',composePage(page,{...plan,typography:{}}),brand);await scenePng(plain);
    const styledPage=composePage(page,plan),scene=await buildVisualScene('poster',styledPage,brand);await scenePng(scene);
    const cta=scene.elements.find(e=>e.id==='cta'),plainCta=plain.elements.find(e=>e.id==='cta');
    if(cta?.kind!=='text'||plainCta?.kind!=='text')throw Error('Missing action text');
    expect(cta.h).toBeGreaterThan(plainCta.h+50);expect(sceneIssues(scene)).toEqual([]);
    expect(canvasTexts(scene,styledPage).find(t=>t.source==='cta')).toMatchObject({text:page.cta,textbox:{borderStyle:'double',fillOpacity:.5}});
    expect(sceneSvg(scene)).toContain('background-clip:padding-box');expect(sceneSvg(scene)).toContain('border-style:double');
  },20000);
  it('replaces a legacy target panel, including an editor Plain reset, instead of stacking containers',async()=>{
    const p=composePage(page,{...plan,responsive:{...plan.responsive,surfaces:[{target:'cta',treatment:'panel',reason:'Emphasize the action'}]}});
    const scene=await buildVisualScene('poster',p,brand);await scenePng(scene);
    expect(scene.elements.some(e=>e.id==='cta-support-panel')).toBe(false);expect(sceneIssues(scene)).toEqual([]);
    const cta=canvasTexts(scene,p).find(t=>t.source==='cta')!;
    const reset=await buildVisualScene('poster',{...p,editorAppearance:{text:{[cta.id]:{box:{}}}}},brand);await scenePng(reset);
    expect(reset.elements.some(e=>e.id==='cta-support-panel')).toBe(false);
    expect(canvasTexts(reset,p).find(t=>t.source==='cta')?.typography?.box).toEqual({});
  },20000);
  it('renders transparent rounded corners, shades and independent border alpha, including editor resets',async()=>{
    const p={title:'Readable',body:'',editorAppearance:{text:{title:{box}}}};
    const scene:VisualScene={width:1080,height:600,background:'#ffffff',elements:[{kind:'text',id:'title',text:p.title,x:50,y:50,w:500,h:400,size:48,weight:'bold',color:'#111111',lines:[]}]};
    await applyEditorAppearance(scene,p,brand);const png=await scenePng(scene),text=scene.elements[0];if(text.kind!=='text')throw Error('Missing text');
    const pixel=async(x:number,y:number)=>[...await sharp(png).extract({left:x,top:y,width:1,height:1}).removeAlpha().raw().toBuffer()];
    expect(await pixel(50,50)).toEqual([255,255,255]);
    const fill=resolveTextbox(box,brand.palette)!.fill!;const expected=compositeColor(fill,.5,'#ffffff');
    const actual=await pixel(300,Math.floor(text.y+text.h-10));expect(actual.every((v,i)=>Math.abs(v-parseInt(expected.slice(1+i*2,3+i*2),16))<=1)).toBe(true);
    await applyEditorAppearance(scene,{...p,editorAppearance:{text:{title:{box:{}}}}},brand);expect(scene.elements[0].typography?.box).toEqual({});expect(sceneSvg(scene)).toContain('background-color:transparent');
  });
  it.each(['solid','dashed','dotted','double'] as const)('exports editable native %s borders, opacity and text with padded coordinates',async borderStyle=>{
    const scene:VisualScene={width:1080,height:1350,background:'#ffffff',elements:[{kind:'text',id:'cta',text:'Start here',lines:['Start here'],x:100,y:100,w:600,h:160,size:40,weight:'bold',color:'#111111',textbox:resolveTextbox({...box,borderStyle,radius:'pill'},brand.palette)}]};
    const deck=new pptxgen();deck.defineLayout({name:'test',width:1080/96,height:1350/96});deck.layout='test';addSceneToPptx(deck,scene);
    const data=await deck.write({outputType:'nodebuffer'}),zip=await JSZip.loadAsync(data as Buffer),xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(xml).toContain('Start here');expect(xml).toContain('roundRect');expect(xml).toContain('val="50000"');expect(xml).toContain('val="80000"');
    expect(xml).toContain(`x="${Math.round((100+36+6)*9525)}"`);
    if(borderStyle==='dashed')expect(xml).toContain('prstDash val="dash"');if(borderStyle==='dotted')expect(xml).toContain('prstDash val="sysDot"');
    expect((xml.match(/<p:sp>/g)??[]).length).toBe(borderStyle==='double'?4:3);
  });
});
