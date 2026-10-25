import type {LayoutGroup} from './responsive-layout';
import type {PrimitiveBox} from './design-primitives';

export type SemanticFlowGroup={id:string;nodes:Array<{id:string;source:string}>;bounds:PrimitiveBox;capacity:number;gap:number};
export type SemanticFlowEvidence={id:string;sources:string[];declaredHeight:number;capacity:number;occupiedHeight:number;gap:number;overflow:number};
export function groupedSemanticText(group:LayoutGroup) {
  return (group.semanticDesign?.textFlow??group.semanticDesign?.spec.textFlow)==='grouped';
}
const overlap=(a:PrimitiveBox,b:PrimitiveBox)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>.5;
const contains=(a:PrimitiveBox,b:PrimitiveBox)=>a.x<=b.x+.5&&a.y<=b.y+.5&&a.x+a.w>=b.x+b.w-.5&&a.y+a.h>=b.y+b.h-.5;

/** Infer only unambiguous canonical label/detail stacks. Side-by-side fields,
 * separate surfaces, intervening text and reordered branch tags keep their own
 * regions. This cannot infer a new relationship or reorder source content. */
export function semanticFlowGroups(group:LayoutGroup,height:number,boxes:Map<string,PrimitiveBox>):SemanticFlowGroup[] {
  if(!group.semanticDesign||!groupedSemanticText(group))return[];
  const {spec,profile}=group.semanticDesign,p=spec.profiles[profile],unit=group.visual?.unit??1;
  if(spec.nodes.some(n=>!boxes.has(n.id)))throw Error('Designed component has an unresolved text region.');
  const shapes=(p.shapes??[]).map(s=>{let x=s.x*group.w,y=s.y*height,w=s.w*group.w,h=s.h*height;if(s.kind==='circle'){const d=Math.min(w,h);x+=(w-d)/2;y+=(h-d)/2;w=h=d;}return{...s,x,y,w,h};});
  const items=new Map<number,Map<string,typeof spec.nodes[number]>>();
  for(const node of spec.nodes){const match=node.source.match(/^semanticComponent\.items\.(\d+)\.(label|detail|tag)$/);if(!match)continue;const index=Number(match[1]),fields=items.get(index)??new Map();fields.set(match[2],node);items.set(index,fields);}
  const membership=(id:string)=>spec.enclosures?.find(e=>e.nodes.includes(id));
  const padding=(id:string)=>{const e=membership(id);return e?(e.padding??.015)*Math.min(group.w,height):0;};
  const result:SemanticFlowGroup[]=[];
  for(const [item,fields]of items){
    const label=fields.get('label'),detail=fields.get('detail');if(!label||!detail)continue;
    const nodes=[label,detail],tag=fields.get('tag');
    if(tag&&boxes.get(tag.id)!.y>=boxes.get(detail.id)!.y+boxes.get(detail.id)!.h-.5)nodes.push(tag);
    const members=nodes.map(n=>boxes.get(n.id)!);
    if(members.some((b,i)=>i>0&&(b.y<members[i-1].y+members[i-1].h-.5||Math.abs(b.x-members[0].x)>group.w*.04||Math.min(b.x+b.w,members[0].x+members[0].w)-Math.max(b.x,members[0].x)<Math.min(b.w,members[0].w)*.75)))continue;
    if(new Set(nodes.map(n=>membership(n.id)?.id??'')).size>1)continue;
    if(new Set(members.map(b=>shapes.filter(s=>contains(s,b)).map(s=>s.id).sort().join('|'))).size>1)continue;
    const x=Math.min(...members.map(b=>b.x)),y=Math.min(...members.map(b=>b.y)),w=Math.max(...members.map(b=>b.x+b.w))-x,h=Math.max(...members.map(b=>b.y+b.h))-y,bounds={x,y,w,h};
    const ids=new Set(nodes.map(n=>n.id));
    if([...boxes].some(([id,b])=>!ids.has(id)&&overlap(bounds,b)))continue;
    let end=height-padding(label.id);
    for(const [id,b]of boxes)if(!ids.has(id)&&Math.min(x+w,b.x+b.w)-Math.max(x,b.x)>.5&&b.y>=y+h-.5)end=Math.min(end,b.y-6*unit-padding(label.id)-padding(id));
    for(const shape of shapes){
      if(contains(shape,bounds)){
        let bottom=shape.y+shape.h;
        if(shape.kind==='circle'){const distance=Math.max(Math.abs(x-(shape.x+shape.w/2)),Math.abs(x+w-(shape.x+shape.w/2)));bottom=shape.y+shape.h/2+Math.sqrt(Math.max(0,(shape.w/2)**2-distance**2));}
        end=Math.min(end,bottom-Math.min(6*unit,Math.max(0,bottom-y-h)));
      }else if(Math.min(x+w,shape.x+shape.w)-Math.max(x,shape.x)>.5&&shape.y>=y+h-.5)end=Math.min(end,shape.y-6*unit);
    }
    result.push({id:`item-${item}`,nodes:nodes.map(n=>({id:n.id,source:n.source})),bounds,capacity:Math.max(h,end-y),gap:Math.min(24*unit,.025*Math.min(group.w,height))});
  }
  return result;
}
