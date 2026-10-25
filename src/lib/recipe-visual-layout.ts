import type { VisualScene,SceneElement } from './content-layout';
import type { LayoutGroup,ResponsiveSceneLayout,Box } from './responsive-layout';
import { layoutProcess } from './process-layout';
import {barScale} from './chart-scale';
const isText=(e:SceneElement|undefined):e is Extract<SceneElement,{kind:'text'}>=>e?.kind==='text';
/** Every leaf stays editable; numeric glyphs derive from existing component values. */
export function layoutRecipeVisual(scene:VisualScene,g:LayoutGroup,layout:ResponsiveSceneLayout,gap:number,add:(e:SceneElement)=>void){
 const v=g.visual!,unit=v.unit,find=(id:string|undefined)=>scene.elements.find(e=>e.id===id),labels=v.labelIds.map(find).filter(isText);
 const detail=(label:SceneElement)=>find(v.details?.[label.id!]),tag=(label:SceneElement)=>find(v.tagIds?.[label.id!]);
 const aux=(v.auxIds??[]).map(find).filter(isText);
 const appendAux=(start:number)=>{let y=start;for(const e of aux){e.x=0;e.y=y;y+=e.h+gap*.5;}return aux.length?y-gap*.5:start;};
 if(v.mode==='triptych'){
  const images=scene.elements.filter((e):e is Extract<SceneElement,{kind:'image'}>=>e.groupId===g.id&&e.kind==='image');
  if(images.length!==3)throw new Error('Triptych cannot render without exactly three supplied images.');
  const h=v.imageHeight,portrait=layout.recipe?.format==='story';
  const cells:Box[]=portrait?[{x:0,y:0,w:g.w,h:h*.6},{x:0,y:h*.6+gap,w:(g.w-gap)/2,h:h*.4-gap},{x:(g.w+gap)/2,y:h*.6+gap,w:(g.w-gap)/2,h:h*.4-gap}]:[{x:0,y:0,w:(g.w-gap)*.56,h},{x:(g.w-gap)*.56+gap,y:0,w:(g.w-gap)*.44,h:(h-gap)/2},{x:(g.w-gap)*.56+gap,y:(h+gap)/2,w:(g.w-gap)*.44,h:(h-gap)/2}];
  images.forEach((image,i)=>{const c=cells[i],aspect=image.bytes.readUInt32BE(16)/image.bytes.readUInt32BE(20);image.w=Math.min(c.w,c.h*aspect);image.h=image.w/aspect;image.x=c.x+(c.w-image.w)/2;image.y=c.y+(c.h-image.h)/2;});g.h=h;return true;
 }
 if(v.mode==='bars'){
  const values=v.barValues??[],numbers=(v.numericIds??[]).map(find).filter(isText);
  if(values.length!==labels.length||numbers.length!==labels.length)throw new Error('Bar chart labels and values must share one canonical item set.');
  const scale=barScale(values,v.valueUnit??''),barX=g.w*.34,barW=g.w*.5,position=(n:number)=>barX+(n-scale.min)/(scale.max-scale.min)*barW,zero=position(0);
  let y=appendAux(0)+(aux.length?gap:0);
  for(const[i,tick]of scale.ticks.entries()){const text=String(Math.round(tick*100)/100)+(v.valueUnit??'');add({kind:'text',id:`chart-axis-${i}`,x:position(tick)-42*unit,y,w:84*unit,h:30*unit,size:24*unit,minSize:20*unit,weight:'regular',fontFamily:'OlaBody',color:v.ink,align:'center',text,lines:[text]});}
  y+=38*unit;
  labels.forEach((label,i)=>{const number=numbers[i],d=detail(label),height=Math.max(76*unit,label.h+(isText(d)?d.h+8*unit:0),number.h);label.x=0;label.y=y+(height-label.h-(isText(d)?d.h+8*unit:0))/2;if(isText(d)){d.x=0;d.y=label.y+label.h+8*unit;}number.x=g.w*.88;number.y=y+(height-number.h)/2;
   add({kind:'rect',id:`chart-track-${i}`,x:barX,y:y+height/2-9*unit,w:barW,h:18*unit,fill:v.surface,radius:3*unit});
   const end=position(values[i]);if(end!==zero)add({kind:'rect',id:`chart-bar-${i}`,x:Math.min(zero,end),y:y+height/2-9*unit,w:Math.abs(end-zero),h:18*unit,fill:v.accent,radius:3*unit});
   y+=height+gap*.65;
  });
  g.h=y-gap*.65;return true;
 }
 if(v.mode==='stats'){
  const numbers=(v.numericIds??[]).map(find).filter(isText),cols=v.columns,cellW=(g.w-gap*(cols-1))/cols;let y=0;
  for(let start=0;start<labels.length;start+=cols){const row=labels.slice(start,start+cols),height=Math.max(...row.map((label,j)=>numbers[start+j].h+10*unit+label.h+(isText(detail(label))?detail(label)!.kind==='text'?(detail(label) as Extract<SceneElement,{kind:'text'}>).h+8*unit:0:0)));
   row.forEach((label,col)=>{const n=numbers[start+col],x=col*(cellW+gap);n.x=x;n.y=y;label.x=x;label.y=y+n.h+10*unit;const d=detail(label);if(isText(d)){d.x=x;d.y=label.y+label.h+8*unit;}});y+=height+gap*1.4;
  }g.h=appendAux(Math.max(0,y-gap*1.4)+(aux.length?gap:0));return true;
 }
 if(v.mode==='table'){
  const headers=(v.headerIds??[]).map(find).filter(isText),cellW=(g.w-gap)/2;let y=0;
  headers.forEach((h,i)=>{h.x=i*(cellW+gap);h.y=0;});if(headers.length)y=Math.max(...headers.map(h=>h.h))+gap;
  for(const [i,label]of labels.entries()){
   const d=detail(label),height=Math.max(label.h,isText(d)?d.h:0);label.x=0;label.y=y;if(isText(d)){d.x=cellW+gap;d.y=y;}
   y+=height+gap*.6;add({kind:'line',id:`comparison-rule-${i}`,x:0,y,x2:g.w,y2:y,width:1.3*unit,color:v.accent});y+=gap*.65;
  }g.h=appendAux(y);return true;
 }
 if(v.mode==='timeline'){
  if(v.balance&&!(v.tagIds&&Object.keys(v.tagIds).length)){
   layoutProcess(g,labels,label=>{const d=detail(label);return isText(d)?d:undefined;},0,gap,add);
   g.h=appendAux(g.h+(aux.length?gap:0));return true;
  }
  const vertical=v.columns===1,radius=6*unit,head=28*unit;let y=0;const centers:Array<{x:number;y:number}>=[];
  if(vertical){
   for(const label of labels){const t=tag(label),d=detail(label),x=head+gap;let cursor=y;
    if(isText(t)){t.x=x;t.y=cursor;cursor+=t.h+7*unit;}label.x=x;label.y=cursor;cursor+=label.h;
    if(isText(d)){d.x=x;d.y=cursor+8*unit;cursor=d.y+d.h;}centers.push({x:radius,y:label.y+Math.min(label.h/2,20*unit)});y=cursor+gap*1.3;
   }y-=gap*1.3;
  }else{
   const cellW=(g.w-gap*(labels.length-1))/labels.length,maxTag=Math.max(0,...labels.map(l=>{const t=tag(l);return isText(t)?t.h:0;})),nodeY=maxTag+(maxTag?gap*.4:0)+radius;
   labels.forEach((label,i)=>{const x=i*(cellW+gap),t=tag(label),d=detail(label);if(isText(t)){t.x=x;t.y=0;}label.x=x;label.y=nodeY+radius+gap*.65;let end=label.y+label.h;if(isText(d)){d.x=x;d.y=end+8*unit;end=d.y+d.h;}centers.push({x:x+radius,y:nodeY});y=Math.max(y,end);});
  }
  centers.forEach((p,i)=>{if(i){const prev=centers[i-1];add({kind:'line',id:`timeline-link-${i}`,x:prev.x+(vertical?0:radius),y:prev.y+(vertical?radius:0),x2:p.x-(vertical?0:radius),y2:p.y-(vertical?radius:0),width:2*unit,color:v.accent});}add({kind:'rect',id:`timeline-node-${i}`,x:p.x-radius,y:p.y-radius,w:radius*2,h:radius*2,radius,fill:v.accent});});
  g.h=appendAux(y+(aux.length?gap:0));return true;
 }
 return false;
}
