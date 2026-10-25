import {readableInk} from './brand-design';
import {routeConnector,type PrimitiveBox} from './design-primitives';
import type {SceneElement,VisualScene} from './content-layout';
import type {LayoutGroup} from './responsive-layout';
import {semanticDesignRegions} from './semantic-design-fit';
import {groupedSemanticText} from './semantic-text-flow';

/** Native primitives shared by every component format and editable vector export. */
export function layoutSemanticDesign(scene:VisualScene,g:LayoutGroup,add:(e:SceneElement)=>void){
  if(!g.semanticDesign)return false;
  const {spec,profile:which}=g.semanticDesign,p=spec.profiles[which],unit=g.visual?.unit??1;
  const measured=new Map(scene.elements.flatMap(e=>e.kind==='text'&&e.groupId===g.id&&e.id?[[e.id,e.h] as const]:[]));
  const {height:h,boxes,fit,flow}=semanticDesignRegions(g,measured);g.semanticDesign.fit=fit;g.semanticDesign.flow=flow;
  const shapes:Array<PrimitiveBox & {id:string;kind:string;tone:string;nodes?:string[]}>=[];
  for(const shape of p.shapes??[]){
    const b={x:shape.x*g.w,y:shape.y*h,w:shape.w*g.w,h:shape.h*h};
    if(shape.kind==='circle'){const d=Math.min(b.w,b.h);b.x+=(b.w-d)/2;b.y+=(b.h-d)/2;b.w=b.h=d;}
    shapes.push({...b,id:shape.id,kind:shape.kind,tone:shape.tone});
  }
  for(const enclosure of spec.enclosures??[]){
    const members=enclosure.nodes.map(id=>{const b=boxes.get(id);if(!b)throw Error('Enclosure has an unresolved node.');return b;});
    const pad=(enclosure.padding??.015)*Math.min(g.w,h);
    let x=Math.min(...members.map(b=>b.x))-pad,y=Math.min(...members.map(b=>b.y))-pad;
    let w=Math.max(...members.map(b=>b.x+b.w))-x+pad,eh=Math.max(...members.map(b=>b.y+b.h))-y+pad;
    if(enclosure.kind==='circle'){const diameter=Math.hypot(w,eh);x-=(diameter-w)/2;y-=(diameter-eh)/2;w=eh=diameter;}
    if(x<0||y<0||x+w>g.w||y+eh>h)throw Error(`Enclosure ${enclosure.id} needs more surrounding space in ${which}.`);
    for(const [id,b] of boxes)if(!enclosure.nodes.includes(id)&&Math.min(x+w,b.x+b.w)-Math.max(x,b.x)>.5&&Math.min(y+eh,b.y+b.h)-Math.max(y,b.y)>.5)throw Error(`Enclosure ${enclosure.id} covers unrelated node ${id}.`);
    shapes.push({x,y,w,h:eh,id:enclosure.id,kind:enclosure.kind,tone:enclosure.tone,nodes:enclosure.nodes});
  }
  const fill=(tone:string)=>tone==='accent'?g.visual!.accent:tone==='ink'?g.visual!.ink:g.visual!.surface;
  for(const shape of shapes)add({kind:'rect',id:`designed-shape-${shape.id}`,x:shape.x,y:shape.y,w:shape.w,h:shape.h,fill:fill(shape.tone),radius:shape.kind==='circle'?shape.w/2:shape.kind==='rounded-rect'?16*unit:8*unit});
  for(const node of spec.nodes){
    const e=scene.elements.find(e=>e.groupId===g.id&&e.id===node.source),b=boxes.get(node.id)!;
    if(e?.kind!=='text')throw Error('Designed component has an unresolved copy node.');
    if(e.h>b.h+.5)throw Error(`Designed component text does not fit ${node.id}; redesign the region instead of clipping.`);
    e.x=b.x;e.y=groupedSemanticText(g)?b.y:b.y+(b.h-e.h)/2;e.w=b.w;
    const surface=[...shapes].reverse().find(s=>s.x<=b.x&&s.y<=b.y&&s.x+s.w>=b.x+b.w&&s.y+s.h>=b.y+b.h);
    if(surface)e.color=readableInk(fill(surface.tone),e.color);
  }
  for(const [index,edge] of spec.connectors.entries()){
    const fromShape=shapes.find(s=>s.nodes?.includes(edge.from)&&!s.nodes.includes(edge.to));
    const toShape=shapes.find(s=>s.nodes?.includes(edge.to)&&!s.nodes.includes(edge.from));
    const from=fromShape??boxes.get(edge.from)!,to=toShape??boxes.get(edge.to)!;
    if(!from||!to)throw Error('Connector has an unresolved endpoint.');
    const obstacles=[...boxes.values(),...shapes.filter(s=>s.nodes&&!(s.nodes.includes(edge.from)&&s.nodes.includes(edge.to)))];
    const segments=routeConnector(from,to,obstacles,7*unit,edge.route??'auto');
    if(segments.some(s=>Math.min(s.x,s.x2)<0||Math.min(s.y,s.y2)<0||Math.max(s.x,s.x2)>g.w||Math.max(s.y,s.y2)>h))throw Error('Connector needs more space inside its component.');
    segments.forEach((segment,i)=>{
      const start=edge.kind==='double-arrow'&&i===0,end=edge.kind!=='line'&&i===segments.length-1;
      add({kind:'line',id:`designed-edge-${index}-${i}`,...segment,width:3.5*unit,color:g.visual!.accent,arrow:start&&end?'both':start?'start':end?'end':undefined});
    });
  }
  g.h=h;return true;
}
