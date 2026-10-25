import type {LayoutGroup} from './responsive-layout';
import type {SceneElement,VisualScene} from './content-layout';
import type {PrimitiveBox} from './design-primitives';
import {semanticFlowGroups,type SemanticFlowEvidence} from './semantic-text-flow';

export type SemanticFit = {node:string;source:string;declaredHeight:number;capacity:number;measuredHeight:number;resolvedHeight:number};

/** Profiles describe reading regions, not clipping masks. A region may grow down
 * into existing whitespace, while its width, top and neighbouring regions stay
 * fixed. This is calculated before font fitting and never changes the source. */
export function semanticDesignRegions(group:LayoutGroup,measured?:Map<string,number>,allowGroupOverflow=false) {
  if(!group.semanticDesign)throw Error('Missing semantic design.');
  const {spec,profile,height:maximum}=group.semanticDesign,p=spec.profiles[profile];
  const height=Math.min(group.w*p.heightRatio,group.visual?.imageHeight??maximum),unit=group.visual?.unit??1;
  const declared=new Map(p.boxes.map(b=>[b.id,{x:b.x*group.w,y:b.y*height,w:b.w*group.w,h:b.h*height}]));
  const flowGroups=semanticFlowGroups(group,height,declared),flowByNode=new Map(flowGroups.flatMap(f=>f.nodes.map(n=>[n.id,f] as const))),flow:SemanticFlowEvidence[]=[];
  const boxes=new Map<string,PrimitiveBox>(),capacities=new Map<string,number>(),fit:SemanticFit[]=[];
  const enclosure=(id:string)=>spec.enclosures?.find(e=>e.nodes.includes(id));
  const padding=(id:string)=>{const e=enclosure(id);return e?(e.padding??.015)*Math.min(group.w,height):0;};
  for(const node of spec.nodes){
    const b=declared.get(node.id);if(!b)throw Error('Designed component has an unresolved text region.');
    let end=height-padding(node.id);
    for(const [id,other] of declared){
      if(id===node.id||Math.min(b.x+b.w,other.x+other.w)-Math.max(b.x,other.x)<=.5||other.y<b.y+b.h-.5)continue;
      const gap=enclosure(id)?.id===enclosure(node.id)?.id?6*unit:6*unit+padding(id)+padding(node.id);
      end=Math.min(end,other.y-gap);
    }
    for(const shape of p.shapes??[]){
      let sx=shape.x*group.w,sy=shape.y*height,sw=shape.w*group.w,sh=shape.h*height;
      if(shape.kind==='circle'){const d=Math.min(sw,sh);sx+=(sw-d)/2;sy+=(sh-d)/2;sw=sh=d;}
      if(sx>b.x+.5||sy>b.y+.5||sx+sw<b.x+b.w-.5||sy+sh<b.y+b.h-.5){
        if(Math.min(b.x+b.w,sx+sw)-Math.max(b.x,sx)>.5&&sy>=b.y+b.h-.5)end=Math.min(end,sy-6*unit);
        continue;
      }
      let bottom=sy+sh;
      if(shape.kind==='circle'){
        const distance=Math.max(Math.abs(b.x-(sx+sw/2)),Math.abs(b.x+b.w-(sx+sw/2)));
        bottom=sy+sh/2+Math.sqrt(Math.max(0,(sw/2)**2-distance**2));
      }
      // Keep a small inset where the original layout provided one.
      end=Math.min(end,bottom-Math.min(6*unit,Math.max(0,bottom-b.y-b.h)));
    }
    const textGroup=flowByNode.get(node.id),capacity=textGroup?Math.max(1,textGroup.capacity-textGroup.gap*(textGroup.nodes.length-1)):Math.max(b.h,end-b.y),actual=measured?.get(node.source)??b.h;
    if(actual>capacity+.5&&(!textGroup||measured?.has(node.source)))throw Error(`Designed component text does not fit ${node.id}; measured ${actual.toFixed(1)}px exceeds its ${capacity.toFixed(1)}px clear region. Reflow the diagram instead of clipping.`);
    const resolvedHeight=textGroup&&measured?actual:Math.max(b.h,actual);
    boxes.set(node.id,{...b,h:resolvedHeight});capacities.set(node.source,capacity);
    if(resolvedHeight>b.h+.5)fit.push({node:node.id,source:node.source,declaredHeight:b.h,capacity,measuredHeight:actual,resolvedHeight});
  }
  if(measured)for(const f of flowGroups){
    const occupiedHeight=f.nodes.reduce((sum,n)=>sum+boxes.get(n.id)!.h,0)+f.gap*(f.nodes.length-1),overflow=Math.max(0,occupiedHeight-f.capacity);
    if(overflow>.5&&!allowGroupOverflow)throw Error(`Text group ${f.id} exceeds its clear region; reflow the diagram at readable sizes.`);
    let y=f.bounds.y;for(const node of f.nodes){const b=boxes.get(node.id)!;b.y=y;y+=b.h+f.gap;}
    flow.push({id:f.id,sources:f.nodes.map(n=>n.source),declaredHeight:f.bounds.h,capacity:f.capacity,occupiedHeight,gap:f.gap,overflow});
  }
  return{height,boxes,capacities,fit,flow};
}

/** Fit related fields as a unit only after their actual glyph heights are known.
 * Reading floors remain authoritative; impossible groups request a reflow. */
export function refitSemanticTextFlow(scene:VisualScene) {
  let changed=false;
  for(const group of scene.responsiveLayout?.groups??[]){
    if(!group.semanticDesign)continue;
    const elements=scene.elements.filter((e):e is Extract<SceneElement,{kind:'text'}>=>e.kind==='text'&&e.groupId===group.id);
    const measured=new Map(elements.flatMap(e=>e.id?[[e.id,e.h] as const]:[]));
    for(const flow of semanticDesignRegions(group,measured,true).flow){
      if(flow.overflow<=.5)continue;
      const members=elements.filter(e=>e.id&&flow.sources.includes(e.id)),gap=flow.gap*(members.length-1),ratio=Math.max(.5,(flow.capacity-gap)/(flow.occupiedHeight-gap)*.98);
      let fitted=false;
      for(const e of members){const next=Math.max(Math.min(e.size,e.minSize??24),e.size*ratio);if(next<e.size-.01){e.size=next;fitted=true;changed=true;}}
      if(!fitted)throw Error(`Text group ${flow.id} cannot fit its clear region at the readable minimum; reflow the diagram.`);
    }
  }
  return changed;
}

/** Current group geometry is authoritative on every measurement iteration. */
export function semanticTextCapacities(scene:VisualScene) {
  const capacities=new Map<SceneElement,number>();
  for(const group of scene.responsiveLayout?.groups??[]){
    if(!group.semanticDesign)continue;
    const regions=semanticDesignRegions(group);
    for(const node of group.semanticDesign.spec.nodes){
      const element=scene.elements.find(e=>e.groupId===group.id&&e.id===node.source);
      if(element?.kind!=='text')continue;
      element.w=regions.boxes.get(node.id)!.w;
      capacities.set(element,regions.capacities.get(node.source)!);
    }
  }
  return capacities;
}
