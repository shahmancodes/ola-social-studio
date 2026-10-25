import type { SceneElement, VisualScene } from './content-layout';
import type { LayoutGroup } from './responsive-layout';
import { readableInk } from './brand-design';

type Text=Extract<SceneElement,{kind:'text'}>;
const isText=(element:SceneElement|undefined):element is Text=>element?.kind==='text';

export function nativeListTextWidth(group:LayoutGroup,columns=group.visual!.columns) {
  const v=group.visual!,u=v.unit,pad=v.treatment==='cards'?18*u:0,gap=v.itemGap??32*u;
  const inset=(v.listKind==='fields'||v.listKind==='checklist'&&v.nodes==='none')?0:(v.treatment==='numbered'?64:40)*u;
  return columns===1?group.w-2*pad-inset:(group.w-gap*(columns-1))/columns-2*pad;
}

/** Measured canonical fields with task, process or central-to-peer relationships. */
export function layoutNativeList(scene:VisualScene,group:LayoutGroup,add:(element:SceneElement)=>void) {
  const v=group.visual;if(v?.mode!=='native-list')return false;
  const find=(id:string|undefined)=>scene.elements.find(e=>e.id===id&&e.groupId===group.id);
  const labels=v.labelIds.map(find).filter(isText),u=v.unit,gap=v.itemGap??32*u,pad=v.treatment==='cards'?18*u:0;
  const process=v.listKind==='processSteps',hub=v.listKind==='hubSpoke',numbered=process&&v.treatment==='numbered',vertical=v.columns===1;
  const neutral=(v.listKind==='fields'||v.listKind==='checklist'&&v.nodes==='none');
  const radius=(numbered?20:5)*u,inset=neutral?0:(numbered?64:40)*u;
  let y=0;
  for(const id of v.headerIds??[]){const e=find(id);if(isText(e)){e.x=0;e.y=y;y+=(hub?Math.max(e.h,(e.inkBounds?.y??0)+(e.inkBounds?.h??0)):e.h)+20*u;}}
  const headerBottom=y-20*u;
  const nodes:Array<{x:number;y:number}>=[];
  const item=(label:Text)=>({label,tag:find(v.tagIds?.[label.id!]),detail:find(v.details?.[label.id!])});
  if(vertical){
    for(const label of labels){
      const {tag,detail}=item(label),top=y,x=pad+inset;
      y+=pad;
      if(isText(tag)){tag.x=x;tag.y=y;y+=tag.h+8*u;}
      label.x=x;label.y=y;y+=label.h;
      nodes.push({x:pad+Math.max(radius,10*u),y:label.y+Math.min(label.h/2,20*u)});
      if(isText(detail)){detail.x=x;detail.y=y+8*u;y=detail.y+detail.h;}
      y+=pad;
      if(pad)add({kind:'rect',id:`native-list-card-${nodes.length-1}`,x:0,y:top,w:group.w,h:y-top,fill:v.surface,radius:10*u});
      y+=gap;
    }
    y-=labels.length?gap:0;
  }else{
    const cell=(group.w-gap*(v.columns-1))/v.columns,nodeY=y+pad+radius;
    const maxTag=Math.max(0,...labels.map(label=>{const tag=item(label).tag;return isText(tag)?tag.h+8*u:0;}));
    const labelY=(neutral?y+pad:nodeY+radius+24*u)+maxTag,maxLabel=Math.max(0,...labels.map(label=>label.h));
    let end=y;
    labels.forEach((label,index)=>{
      const {tag,detail}=item(label),x=index*(cell+gap)+pad;
      if(isText(tag)){tag.x=x;tag.y=labelY-maxTag;}
      label.x=x;label.y=labelY;nodes.push({x:index*(cell+gap)+cell/2,y:nodeY});
      let bottom=label.y+label.h;
      if(isText(detail)){detail.x=x;detail.y=labelY+maxLabel+8*u;bottom=detail.y+detail.h;}
      end=Math.max(end,bottom+pad);
    });
    if(pad)labels.forEach((_,i)=>add({kind:'rect',id:`native-list-card-${i}`,x:i*(cell+gap),y,w:cell,h:end-y,fill:v.surface,radius:10*u}));
    y=end;
  }
  if(process)for(let i=0;i<nodes.length-1;i++){
    const a=nodes[i],b=nodes[i+1],dx=vertical?0:radius,dy=vertical?radius:0;
    const from={x:a.x+dx,y:a.y+dy},to={x:b.x-dx,y:b.y-dy},length=Math.hypot(to.x-from.x,to.y-from.y);
    if(length<=0)throw Error('Native process stations need room for their connector.');
    add({kind:'line',id:`native-list-link-${i}`,x:from.x,y:from.y,x2:to.x,y2:to.y,width:2.5*u,color:v.accent});
    const ux=(to.x-from.x)/length,uy=(to.y-from.y)/length,head=Math.min(10*u,length*.35),wing=Math.min(6*u,length*.25);
    for(const sign of [-1,1])add({kind:'line',id:`native-list-arrow-${i}-${sign}`,x:to.x-head*ux+sign*wing*uy,y:to.y-head*uy-sign*wing*ux,x2:to.x,y2:to.y,width:2.5*u,color:v.accent});
  }
  // Every peer branches from the shared context. Peers never connect to one
  // another, so a long explanatory field cannot turn the association into steps.
  if(hub&&nodes.length){
    const rootY=headerBottom+10*u;
    const link=(id:string,x:number,y:number,x2:number,y2:number)=>add({kind:'line',id:`native-hub-${id}`,x,y,x2,y2,width:1.5*u,color:v.accent});
    if(vertical){
      const x=nodes[0].x;
      link('trunk',x,rootY,x,nodes.at(-1)!.y);
      nodes.forEach((node,i)=>link(`peer-${i}`,x,node.y,pad+inset-10*u,node.y));
    }else{
      const center=group.w/2;
      link('root',center,rootY,center,y>rootY?rootY+8*u:rootY);
      link('trunk',nodes[0].x,rootY+8*u,nodes.at(-1)!.x,rootY+8*u);
      nodes.forEach((node,i)=>link(`peer-${i}`,node.x,rootY+8*u,node.x,node.y));
    }
  }
  nodes.forEach((node,i)=>{
    if(process){
      if(v.nodes!=='none'||numbered)add({kind:'rect',id:`native-list-node-${i}`,x:node.x-radius,y:node.y-radius,w:radius*2,h:radius*2,radius,fill:v.accent});
      if(numbered)add({kind:'text',id:`native-list-number-${i}`,x:node.x-radius,y:node.y-14*u,w:radius*2,h:28*u,size:20*u,weight:'bold',align:'center',fontFamily:'OlaBody',color:readableInk(v.accent,'#FFFFFF'),text:String(i+1),lines:[String(i+1)]});
    }else if(!neutral&&!hub){
      add({kind:'line',id:`native-list-check-${i}-a`,x:node.x-4*u,y:node.y,x2:node.x,y2:node.y+5*u,width:3*u,color:v.accent});
      add({kind:'line',id:`native-list-check-${i}-b`,x:node.x,y:node.y+5*u,x2:node.x+10*u,y2:node.y-9*u,width:3*u,color:v.accent});
    }
  });
  for(const id of v.auxIds??[]){const e=find(id);if(isText(e)){e.x=0;e.y=y+24*u;y=e.y+e.h;}}
  group.h=y;
  return true;
}
