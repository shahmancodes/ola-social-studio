import { createSemanticComponent } from './semantic-component-presets';
import { renderSemanticComponentPng } from './semantic-component-image';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import JSZip from 'jszip';
import pptxgen from 'pptxgenjs';
import { FreeformCanvasSchema, persistedObjects, reflowCanvasObjects, resizeCanvasObject, snapCanvasMove, type CanvasObject } from './freeform-canvas';
import { freeformScene, identifySceneObjects, previewSceneObjects } from './freeform-scene';
import { buildVisualScene, scenePng, sceneSvg, type VisualScene } from './content-layout';
import { SimpleArtifactSchema } from './simple-content';
import { artifactPages, withArtifactPages } from './composition';
import { addSceneToPptx } from './modern-content';
import type { ContentBrand } from './content-brand';

const brand:ContentBrand={companyId:'test',name:'Test',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],palette:{background:'#FFFFFF',alternate:'#EEEEEE',accent:'#123456',ink:'#111111',dark:'#111111'},assets:[]};
const text:CanvasObject={id:'title',kind:'text',x:20,y:30,width:200,height:70,rotation:0,text:'Editable title',fontSize:32,fontFamily:'Arial',color:'#111111'};
const document=(objects:CanvasObject[])=>FreeformCanvasSchema.parse({version:1,objects});
const base=():VisualScene=>({width:600,height:600,background:'#FFFFFF',elements:[]});

describe('freeform canvas documents',()=>{
  it('round trips positions, dimensions, layer order and content through poster and carousel save schemas',()=>{
    const objects=[{...text,x:-20,width:370,height:123,rotation:15,locked:true},{...text,id:'added',custom:true,text:'Added text'}];
    for(const raw of [{type:'poster',headline:'Original',subline:'Body',editorAppearance:{freeform:document(objects)}},{type:'carousel',title:'Deck',caption:'',slides:Array.from({length:3},()=>({title:'Slide',body:'Body',editorAppearance:{freeform:document(objects)}}))}]){
      const artifact=SimpleArtifactSchema.parse(raw),pages=artifactPages(artifact);
      const restored=SimpleArtifactSchema.parse(JSON.parse(JSON.stringify(withArtifactPages(artifact,pages))));
      expect(artifactPages(restored)[0].editorAppearance?.freeform?.objects).toEqual(objects);
    }
    expect(FreeformCanvasSchema.safeParse({version:1,objects:[text,text]}).success).toBe(false);
    expect(FreeformCanvasSchema.safeParse({version:1,objects:[{...text,width:-2}]}).success).toBe(false);
  });
  it('persists editable components and uploaded image IDs, and uses identical component bytes in preview and export',async()=>{
    const component=createSemanticComponent('checklist');component.items[0].label='Edited by the user';
    const object:CanvasObject={id:'component',kind:'image',x:100,y:120,width:350,height:250,rotation:15,custom:true,component};
    const uploaded:CanvasObject={id:'upload',kind:'image',referenceId:'12345678-1234-4234-8234-123456789012',x:20,y:30,width:150,height:100,rotation:0};
    const saved=SimpleArtifactSchema.parse({type:'post',designVersion:2,headline:'Post',subline:'',caption:'Caption',editorAppearance:{freeform:document([object,uploaded])}});
    const restored=artifactPages(SimpleArtifactSchema.parse(JSON.parse(JSON.stringify(saved))))[0].editorAppearance!.freeform!.objects;
    expect(restored).toEqual([object,uploaded]);
    const page={title:'Post',body:'',editorAppearance:{freeform:document([object])}};
    const scene=await freeformScene(base(),page,brand),expected=await renderSemanticComponentPng(component,brand.palette.accent,brand.companyId);
    expect(scene.elements[0].kind==='image'&&scene.elements[0].bytes.equals(expected)).toBe(true);
    expect(previewSceneObjects(scene,page)[0]).toMatchObject({component,rotation:15,width:350,height:250});
    expect(persistedObjects(previewSceneObjects(scene,page))[0].component?.items[0].label).toBe('Edited by the user');
    expect(sceneSvg(scene)).toContain('rotate(15 275 245)');
  });
  it('anchors the opposite corner during rotated resizing and prevents inverted boxes',()=>{
    const o={...text,rotation:90};
    const resized=resizeCanvasObject(o,'se',-40,80);
    expect(resized.width).toBeCloseTo(280);expect(resized.height).toBeCloseTo(110);
    const corner=(t:CanvasObject)=>({x:t.x+t.width/2+t.height/2,y:t.y+t.height/2-t.width/2});
    expect(corner(resized)).toEqual(corner(o));
    expect(resizeCanvasObject(text,'w',1000,0).width).toBe(16);
  });
  it('snaps moves to page and object centers without constraining off-page placement',()=>{
    const snap=snapCanvasMove({...text,x:198},[],600,600,5);
    expect(snap.object.x).toBe(200);expect(snap.guides).toContainEqual({axis:'x',value:300});
    expect(snapCanvasMove({...text,x:-200},[],600,600,5).object.x).toBe(-200);
  });
  it('keeps user text and additions after changing layout, but takes the new generated geometry',()=>{
    const previous=[{...text,text:'User copy',sourceText:'Original'},{...text,id:'new',custom:true,x:400}];
    const next=reflowCanvasObjects([{...text,text:'Original',x:100,width:350}],previous);
    expect(next[0]).toMatchObject({text:'User copy',x:100,width:350});expect(next[1]).toEqual(previous[1]);
    expect(persistedObjects([{...text,url:'data:private',textbox:undefined}])[0]).not.toHaveProperty('url');
  });
  it('renders manual overlaps, off-canvas objects and overflowing text without auto-reflow or shrinking',async()=>{
    const objects=[{...text,width:125,height:20,text:'A longer edited headline',fontSize:42},{id:'card',kind:'rect' as const,x:-30,y:250,width:300,height:120,rotation:0,fill:'#FF0000'},{...text,id:'hidden',hidden:true,text:'MUST NOT EXPORT'}];
    const page={title:'Original',body:'',editorAppearance:{freeform:document(objects)}};
    const scene=await freeformScene(base(),page,brand),png=await scenePng(scene);
    expect(scene.elements[0]).toMatchObject({x:20,y:30,w:125,h:20,size:42});
    const svg=sceneSvg(scene);expect(svg).toContain('A longer edited headline');expect(svg).not.toContain('MUST NOT EXPORT');
    expect([...await sharp(png).extract({left:100,top:300,width:1,height:1}).removeAlpha().raw().toBuffer()]).toEqual([255,0,0]);
    expect(previewSceneObjects(scene,page)[0]).toMatchObject({width:125,height:20,fontSize:42});
  });
  it('preserves every generated pixel when converting a page to editable objects',async()=>{
    const page={title:'Make room for better ideas.',body:'A little space makes a big difference.',cta:'Start with one idea.',eyebrow:'OLA STUDIO'};
    const generated=await buildVisualScene('poster',page,brand),before=await scenePng(generated);
    const objects=persistedObjects(previewSceneObjects(generated,page));
    const restored=await buildVisualScene('poster',{...page,editorAppearance:{freeform:document(objects)}},brand);
    const after=await scenePng(restored);
    const pixelsBefore=await sharp(before).raw().toBuffer(),pixelsAfter=await sharp(after).raw().toBuffer();
    expect(pixelsAfter.equals(pixelsBefore)).toBe(true);
  });
  it('keeps image references stable and exports duplicated, resized, rotated objects in layer order',async()=>{
    const bytes=await sharp({create:{width:80,height:40,channels:3,background:'#0000FF'}}).png().toBuffer();
    const generated:VisualScene={...base(),elements:[{kind:'image',id:'artwork',x:10,y:10,w:100,h:50,bytes}]};identifySceneObjects(generated);
    const objects:CanvasObject[]=[{id:'duplicate',kind:'image',sourceId:'artwork',x:200,y:300,width:160,height:80,rotation:90,custom:true},{...text,x:300,y:10,width:180,height:100,rotation:25}, {id:'hidden-shape',kind:'rect',x:0,y:0,width:600,height:600,fill:'#000000',rotation:0,hidden:true}];
    const scene=await freeformScene(generated,{title:'Original',body:'',editorAppearance:{freeform:document(objects)}},brand);
    await scenePng(scene);
    expect(sceneSvg(scene)).toContain('rotate(90 280 340)');
    const deck=new pptxgen();deck.defineLayout({name:'CANVAS',width:600/96,height:600/96});deck.layout='CANVAS';addSceneToPptx(deck,scene);
    const zip=await JSZip.loadAsync(await deck.write({outputType:'nodebuffer'}) as Buffer);
    const xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(xml).toContain('rot="5400000"');expect(xml).toContain('rot="1500000"');expect(xml).not.toContain('000000');
    expect(xml.indexOf('<p:pic>')).toBeLessThan(xml.indexOf('<p:sp>'));
  });
});
