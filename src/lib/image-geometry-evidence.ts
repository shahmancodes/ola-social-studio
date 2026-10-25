import sharp from 'sharp';
import type { VisualScene } from './content-layout';

/** Source dimensions and the same containment transform used by SVG/PNG/PPTX exports. */
export async function imageGeometryEvidence(scene: VisualScene) {
  return Promise.all(scene.elements.filter(element=>element.kind==='image'&&!element.hidden).map(async element=>{
    if(element.kind!=='image')throw Error('Expected image.');
    const source=await sharp(element.bytes).metadata();
    if(!source.width||!source.height)throw Error('Cannot decode placed-image dimensions.');
    const scale=Math.min(element.w/source.width,element.h/source.height);
    const width=source.width*scale,height=source.height*scale;
    return {id:element.id,source:{width:source.width,height:source.height},viewport:{x:element.x,y:element.y,width:element.w,height:element.h},fitting:'contain' as const,displayed:{x:element.x+(element.w-width)/2,y:element.y+(element.h-height)/2,width,height},rotation:element.rotation??0};
  }));
}
