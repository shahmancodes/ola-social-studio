import { z } from 'zod';
import { SemanticComponentSchema } from './schemas';
import { TextTypographySchema } from './design-typography';
import { EDITOR_FONT_IDS } from './font-catalog';
import { boxEndpoints } from './design-primitives';

const color = z.string().regex(/^#[\da-f]{6}$/i);
const coordinate = z.number().min(-20000).max(20000);
/** A generated page becomes an ordinary object document on its first edit.
 * Image bytes remain on the server; sourceId refers to an image in its base scene. */
export const CanvasObjectSchema = z.object({
  id: z.string().min(1).max(180), kind: z.enum(['text', 'rect', 'line', 'image']),
  x: coordinate, y: coordinate, width: z.number().min(1).max(20000), height: z.number().min(1).max(20000),
  rotation: z.number().min(-360).max(360).default(0),
  locked: z.boolean().optional(), hidden: z.boolean().optional(), custom: z.boolean().optional(),
  component: SemanticComponentSchema.optional(), referenceId: z.string().uuid().optional(),
  sourceId: z.string().max(180).optional(), assetId: z.string().max(180).optional(),
  source: z.string().max(200).optional(), copyId: z.string().max(180).optional(),
  text: z.string().max(20000).optional(), sourceText: z.string().max(20000).optional(),
  fontSize: z.number().min(1).max(1000).optional(),
  fontFamily: z.string().max(180).regex(/^[a-zA-Z0-9 ,"'_-]+$/).optional(),
  font: z.enum(EDITOR_FONT_IDS).optional(), fontId: z.string().max(120).optional(),
  bold: z.boolean().optional(), italic: z.boolean().optional(), underline: z.boolean().optional(),
  color: color.optional(), align: z.enum(['left','center','right']).optional(),
  typography: TextTypographySchema.optional(), accentColor: color.optional(),
  fill: color.optional(), radius: z.number().min(0).max(10000).optional(),
  lineAxis: z.enum(['horizontal','vertical']).optional(),
  arrow:z.enum(['start','end','both']).optional(), route:z.enum(['straight','elbow']).optional(), routeAxis:z.enum(['horizontal','vertical']).optional(),
  connector:z.object({from:z.string().min(1).max(180),to:z.string().min(1).max(180)}).strict().refine(c=>c.from!==c.to,'Connect two different objects.').optional(),
  strokeWidth: z.number().min(.1).max(100).optional(), flipX: z.boolean().optional(), flipY: z.boolean().optional(),
  crop: z.object({ x:z.number().min(0).max(1), y:z.number().min(0).max(1), width:z.number().min(.05).max(1), height:z.number().min(.05).max(1) }).refine(v=>v.x+v.width<=1.00001&&v.y+v.height<=1.00001).optional(),
}).strict();
export const FreeformCanvasSchema = z.object({ version:z.literal(1), objects:z.array(CanvasObjectSchema).max(400) }).strict()
  .refine(v=>new Set(v.objects.map(o=>o.id)).size===v.objects.length,'Canvas object IDs must be unique.');
export type CanvasObject = z.infer<typeof CanvasObjectSchema>;
export type FreeformCanvas = z.infer<typeof FreeformCanvasSchema>;
export type PreviewObject = CanvasObject & { url?:string; textbox?:import('./textbox-style').ResolvedTextbox };

/** Attach to current object bounds on both client and export. Removing a target
 * detaches the connector at its last saved position, rather than losing it. */
export function resolveCanvasConnectors<T extends CanvasObject>(objects:T[]):T[] {
  const targets=new Map(objects.filter(o=>o.kind!=='line').map(o=>[o.id,o]));
  const bounds=(o:CanvasObject)=>{
    if(o.kind==='rect'&&(o.radius??0)>=o.width/2&&Math.abs(o.width-o.height)<.01)return{x:o.x,y:o.y,w:o.width,h:o.height,kind:'circle'};
    const angle=o.rotation*Math.PI/180,w=Math.abs(o.width*Math.cos(angle))+Math.abs(o.height*Math.sin(angle)),h=Math.abs(o.width*Math.sin(angle))+Math.abs(o.height*Math.cos(angle));
    return{x:o.x+(o.width-w)/2,y:o.y+(o.height-h)/2,w,h};
  };
  return objects.map(o=>{
    if(o.kind!=='line'||!o.connector)return o;
    const a=targets.get(o.connector.from),b=targets.get(o.connector.to);
    if(!a||!b)return{...o,connector:undefined};
    const ab=bounds(a),bb=bounds(b),gap=Math.max(7,(o.strokeWidth??2)*2);
    let edge,routeAxis=o.routeAxis;try{edge=boxEndpoints(ab,bb,gap);}catch{return o;}
    if(o.route==='elbow'){
      const dx=bb.x+bb.w/2-ab.x-ab.w/2,dy=bb.y+bb.h/2-ab.y-ab.h/2;
      routeAxis=Math.abs(dx)-(ab.w+bb.w)/2>=Math.abs(dy)-(ab.h+bb.h)/2?'horizontal':'vertical';
      if(routeAxis==='horizontal'){const sign=dx>=0?1:-1;edge={x:ab.x+ab.w/2+sign*(ab.w/2+gap),y:ab.y+ab.h/2,x2:bb.x+bb.w/2-sign*(bb.w/2+gap),y2:bb.y+bb.h/2};}
      else{const sign=dy>=0?1:-1;edge={x:ab.x+ab.w/2,y:ab.y+ab.h/2+sign*(ab.h/2+gap),x2:bb.x+bb.w/2,y2:bb.y+bb.h/2-sign*(bb.h/2+gap)};}
    }
    // Axis hints belong to loose lines, never to attached connectors.
    return{...o,x:Math.min(edge.x,edge.x2),y:Math.min(edge.y,edge.y2),width:Math.max(1,Math.abs(edge.x2-edge.x)),height:Math.max(1,Math.abs(edge.y2-edge.y)),rotation:0,routeAxis,lineAxis:edge.y===edge.y2?'horizontal':edge.x===edge.x2?'vertical':undefined,flipX:edge.x2<edge.x,flipY:edge.y2<edge.y};
  });
}

export function canvasLine(o:CanvasObject) {
  return{x:o.lineAxis==='vertical'?0:o.flipX?o.width:0,y:o.lineAxis==='horizontal'?0:o.flipY?o.height:0,x2:o.lineAxis==='vertical'?0:o.flipX?0:o.width,y2:o.lineAxis==='horizontal'?0:o.flipY?0:o.height,width:o.strokeWidth??2,arrow:o.arrow,route:o.route,routeAxis:o.routeAxis};
}

export function persistedObjects(objects: PreviewObject[]): CanvasObject[] {
  return resolveCanvasConnectors(objects).map(({url: _url, textbox: _textbox, ...object})=>object);
}

/** Resize in the object's own axes while keeping its opposite edge anchored. */
export function resizeCanvasObject(object: CanvasObject, handle: string, dx: number, dy: number): CanvasObject {
  const angle=object.rotation*Math.PI/180, cos=Math.cos(angle), sin=Math.sin(angle);
  const localX=dx*cos+dy*sin, localY=-dx*sin+dy*cos;
  const width=Math.max(16,object.width+(handle.includes('e')?localX:handle.includes('w')?-localX:0));
  const height=Math.max(16,object.height+(handle.includes('s')?localY:handle.includes('n')?-localY:0));
  const cx=(width-object.width)*(handle.includes('w')?-.5:.5),cy=(height-object.height)*(handle.includes('n')?-.5:.5);
  return {...object,width,height,x:object.x+(object.width-width)/2+cx*cos-cy*sin,y:object.y+(object.height-height)/2+cx*sin+cy*cos};
}

export function snapCanvasMove(object: CanvasObject, others: CanvasObject[], width:number,height:number,threshold:number) {
  const guides:{axis:'x'|'y';value:number}[]=[];
  let {x,y}=object;
  for(const axis of ['x','y'] as const){
    const size=axis==='x'?'width':'height',limit=axis==='x'?width:height;
    const stops=[0,limit/2,limit,...others.filter(o=>!o.hidden&&o.rotation===0).flatMap(o=>[o[axis],o[axis]+o[size]/2,o[axis]+o[size]])];
    let best=threshold,delta=0,guide:number|undefined;
    for(const offset of [0,object[size]/2,object[size]])for(const stop of stops){const d=stop-object[axis]-offset;if(Math.abs(d)<best){best=Math.abs(d);delta=d;guide=stop;}}
    if(guide!==undefined){if(axis==='x')x+=delta;else y+=delta;guides.push({axis,value:guide});}
  }
  return {object:{...object,x,y},guides};
}

/** A layout rearranges generated objects. User-added objects and edited copy survive. */
export function reflowCanvasObjects(generated: PreviewObject[], previous: PreviewObject[]) {
  const old=new Map(previous.filter(o=>!o.custom).map(o=>[o.id,o]));
  return [...generated.map(o=>{
    const prior=old.get(o.id);
    return prior?{...o,hidden:prior.hidden,locked:prior.locked,...(o.kind==='text'&&prior.text!==prior.sourceText?{text:prior.text}: {})}:o;
  }),...previous.filter(o=>o.custom)];
}
