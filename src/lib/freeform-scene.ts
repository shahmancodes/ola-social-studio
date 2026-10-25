import fs from 'node:fs/promises';
import { db } from './platform-db';
import { getCompanyAsset } from './platform';
import { renderSemanticComponentPng } from './semantic-component-image';
import sharp from 'sharp';
import type { VisualPage, VisualScene, SceneElement } from './content-layout';
import type { ContentBrand } from './content-brand';
import { canvasTexts } from './canvas-text';
import type { PreviewObject } from './freeform-canvas';
import { editorFontFamily } from './editor-appearance';
import { selectedFontCss } from './editor-font-files';
import { resolveTextbox } from './textbox-style';
import { canvasLine, resolveCanvasConnectors } from './freeform-canvas';

export function identifySceneObjects(scene:VisualScene) {
  const used=new Set(scene.elements.flatMap(e=>e.editorId?[e.editorId]:[]));
  scene.elements.forEach((e,index)=>{
    if(e.editorId)return;
    const base=e.copyId??e.id??`${e.kind}-${index}`;
    let id=base,n=1;while(used.has(id))id=`${base}-${n++}`;
    e.editorId=id;used.add(id);
  });
}
export function previewSceneObjects(scene:VisualScene,page:VisualPage):PreviewObject[] {
  identifySceneObjects(scene);
  const targets=new Map(canvasTexts(scene,page).map(t=>[t.elementIndex,t]));
  return scene.elements.map((e,index)=>{
    const stored=page.editorAppearance?.freeform?.objects.find(o=>o.id===e.editorId);
    const common={id:e.editorId!,kind:e.kind,x:e.kind==='line'?Math.min(e.x,e.x2):e.x,y:e.kind==='line'?Math.min(e.y,e.y2):e.y,
      width:e.kind==='line'?Math.max(1,Math.abs(e.x2-e.x)):e.w,height:e.kind==='line'?Math.max(1,Math.abs(e.y2-e.y)):e.h,
      rotation:e.rotation??0,locked:stored?.locked,hidden:e.hidden,custom:stored?.custom};
    if(e.kind==='text')return {...common,source:targets.get(index)?.source,copyId:e.copyId,text:e.text,sourceText:stored?.sourceText??e.text,fontSize:e.size,fontFamily:e.fontFamily??'Arial, sans-serif',font:stored?.font,fontId:stored?.fontId,
      bold:e.weight==='bold',italic:e.italic,underline:e.underline,color:e.color,align:e.align??'left',typography:e.typography,accentColor:e.accentColor,textbox:e.textbox};
    if(e.kind==='image')return {...common,sourceId:stored?.sourceId??e.editorId,assetId:stored?.assetId,referenceId:stored?.referenceId,component:stored?.component,crop:stored?.crop,url:`data:image/png;base64,${e.bytes.toString('base64')}`};
    if(e.kind==='rect')return {...common,fill:e.fill,radius:e.radius};
    return {...common,lineAxis:e.y===e.y2?'horizontal' as const:e.x===e.x2?'vertical' as const:undefined,color:e.color,strokeWidth:e.width,flipX:e.x2<e.x,flipY:e.y2<e.y,arrow:e.arrow,route:e.route,routeAxis:e.routeAxis,connector:stored?.connector};
  });
}
/** Hydrate the saved object document. Generated layout constraints end here. */
export async function freeformScene(base:VisualScene,page:VisualPage,brand:ContentBrand):Promise<VisualScene> {
  identifySceneObjects(base);
  const saved=page.editorAppearance!.freeform!;
  const sources=new Map(base.elements.map(e=>[e.editorId,e]));
  const elements:SceneElement[]=[];
  for(const object of resolveCanvasConnectors(saved.objects)){
    const {x,y,width:w,height:h}=object;
    const common={editorId:object.id,id:object.id,x,y,w,h,rotation:object.rotation,hidden:object.hidden};
    if(object.kind==='text')elements.push({...common,kind:'text',text:object.text??'',lines:[],size:object.fontSize??48,
      weight:object.bold?'bold':'regular',fontFamily:editorFontFamily(object)??object.fontFamily??'Arial, sans-serif',
      italic:object.italic,underline:object.underline,color:object.color??brand.palette.ink,align:object.align,
      typography:object.typography,accentColor:object.accentColor??brand.palette.accent,
      textbox:resolveTextbox(object.typography?.box,brand.palette,Math.min(base.width,base.height)/1080),copyId:object.copyId,copySource:object.source});
    else if(object.kind==='rect')elements.push({...common,kind:'rect',fill:object.fill??brand.palette.accent,radius:object.radius});
    else if(object.kind==='line'){const line=canvasLine(object);elements.push({...common,...line,kind:'line',x:x+line.x,y:y+line.y,x2:x+line.x2,y2:y+line.y2,color:object.color??brand.palette.accent});}
    else {
      let bytes:Buffer;
      if(object.component){
        bytes=await renderSemanticComponentPng(object.component,brand.palette.accent,brand.companyId);
      }else if(object.referenceId){
        const reference=db().prepare("SELECT r.disk_path FROM project_references r JOIN projects p ON p.id=r.project_id WHERE r.id=? AND r.project_id=? AND p.company_id=? AND r.media_type='image/png'").get(object.referenceId,brand.projectId??'',brand.companyId) as {disk_path:string}|undefined;
        if(!reference)throw new Error('This uploaded image is unavailable in this project.');
        bytes=await fs.readFile(reference.disk_path);
      }else if(object.assetId){
        const asset=[...brand.assets,...(brand.logo?[brand.logo]:[])].find(a=>a.id===object.assetId);
        const library=asset?undefined:getCompanyAsset(brand.companyId,object.assetId);
        const allowed=library&&library.media_type.startsWith('image/')&&library.category!=='project-artwork'&&(!library.source_url||Boolean(library.rights_note&&!/unverified|permission.required|unknown|not verified/i.test(library.rights_note)));
        if(!asset&&!allowed)throw new Error('This image is no longer in the project’s asset library.');
        bytes=await sharp(await fs.readFile(asset?.diskPath??library!.disk_path)).png().toBuffer();
      }else{
        const source=sources.get(object.sourceId);
        if(source?.kind!=='image')throw new Error('An image source is missing. Restore the image or choose a replacement.');
        bytes=source.bytes;
      }
      if(object.crop){const meta=await sharp(bytes).metadata(),c=object.crop,W=meta.width!,H=meta.height!;
        const left=Math.min(W-1,Math.round(c.x*W)),top=Math.min(H-1,Math.round(c.y*H));
        bytes=await sharp(bytes).extract({left,top,width:Math.max(1,Math.min(W-left,Math.round(c.width*W))),height:Math.max(1,Math.min(H-top,Math.round(c.height*H)))}).png().toBuffer();}
      elements.push({...common,kind:'image',bytes});
    }
  }
  return {...base,elements,responsiveLayout:undefined,freeform:true,measured:true,
    additionalFontCss:(base.additionalFontCss??'')+await selectedFontCss(saved.objects,brand.fonts)};
}
