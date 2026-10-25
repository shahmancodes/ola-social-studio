import type { SceneElement } from './content-layout';
import type { LayoutGroup } from './responsive-layout';
import { readableInk } from './brand-design';
type TextElement=Extract<SceneElement,{kind:'text'}>;
type Point={x:number;y:number};

/** A process is one connected diagram. Nodes and their text share a row; cards hug measured content. */
export function layoutProcess(group:LayoutGroup,labels:TextElement[],detailFor:(label:TextElement)=>TextElement|undefined,prefix:number,gap:number,add:(element:SceneElement)=>void) {
  const v=group.visual!,u=v.unit,cards=v.treatment==='cards',numbered=v.treatment==='numbered',stations=numbered||v.nodes==='dots'||!v.balance&&v.nodes!=='none',centered=Boolean(v.balance)&&!stations;
  const vertical=v.columns===1,d=(numbered?v.balance?44:32:stations?18:0)*u,r=d/2,pad=(v.balance?24:cards?18:8)*u,labelGap=centered?0:14*u;
  const nodes:Array<Point&{index:number;card:{x:number;y:number;w:number;h:number}}>=[];
  const contentH=(label:TextElement)=>label.h+(detailFor(label)?detailFor(label)!.h+8*u:0);
  if(vertical){
    const maxInk=Math.max(...labels.map(e=>e.inkBounds?.w??Math.min(e.w,e.text.length*e.size*.65)),...labels.map(e=>detailFor(e)?.inkBounds?.w??0));
    const w=v.balance?group.w:Math.min(group.w,Math.max(180*u,maxInk+d+labelGap+2*pad+4*u)),x=(group.w-w)/2;
    let y=prefix;
    for(const [index,label]of labels.entries()){
      const h=Math.max(d+2*pad,contentH(label)+2*pad,(v.minHeight??0)/labels.length-gap);
      label.align=centered?'center':'left';label.x=x+pad+d+labelGap;label.y=y+(h-contentH(label))/2;label.w=w-2*pad-d-labelGap;
      const detail=detailFor(label);if(detail){detail.align=label.align;detail.x=label.x;detail.y=label.y+label.h+8*u;detail.w=label.w;}
      nodes.push({index,x:centered?x+w/2:x+pad+r,y:y+h/2,card:{x,y,w,h}});y+=h+Math.max(gap,24*u);
    }
    group.h=y-Math.max(gap,24*u);
  }else{
    const columns=v.columns,wrapped=labels.length>columns,gutter=wrapped?26*u:0,cellW=(group.w-2*gutter-gap*(columns-1))/columns;
    let y=prefix;
    for(let start=0;start<labels.length;start+=columns){
      const row=labels.slice(start,start+columns),h=Math.max(Math.max(...row.map(contentH))+d+labelGap+2*pad,v.balance?Math.min((v.minHeight??0)/Math.ceil(labels.length/columns)-gap,cellW*.8):(v.minHeight??0)/Math.ceil(labels.length/columns)-gap);
      row.forEach((label,col)=>{
        const cell=v.balance&&Math.floor(start/columns)%2===1?columns-1-col:col;
        const x=gutter+cell*(cellW+gap),top=v.balance?(h-d-labelGap-(stations?Math.max(...row.map(contentH)):contentH(label)))/2:pad;
        label.align='center';label.x=x+pad;label.y=y+top+d+labelGap;label.w=cellW-2*pad;
        const detail=detailFor(label);if(detail){detail.align='center';detail.x=label.x;detail.y=label.y+label.h+8*u;detail.w=label.w;}
        nodes.push({index:start+col,x:x+cellW/2,y:y+top+r,card:{x,y,w:cellW,h}});
      });
      y+=h+Math.max(gap,36*u);
    }
    group.h=y-Math.max(gap,36*u);
  }
  // Paint surfaces first, then the complete connected path and its nodes.
  if(cards)for(const n of nodes)add({kind:'rect',id:`visual-card-${n.index}`,...n.card,fill:v.surface,radius:10*u});
  for(let i=0;i<nodes.length-1;i++){
    const a=nodes[i],b=nodes[i+1];let path:Point[];
    if(vertical)path=centered?[{x:a.x,y:a.card.y+a.card.h+3*u},{x:b.x,y:b.card.y-3*u}]:[{x:a.x,y:a.y+r},{x:b.x,y:b.y-r}];
    else if(v.balance&&stations&&Math.abs(a.card.y-b.card.y)<1){const sign=Math.sign(b.x-a.x);path=[{x:a.x+sign*r,y:a.y},{x:b.x-sign*r,y:b.y}];}
    else if(v.balance&&Math.abs(a.card.y-b.card.y)<1){const sign=Math.sign(b.x-a.x);path=[{x:a.x+sign*(a.card.w/2+3*u),y:a.card.y+a.card.h/2},{x:b.x-sign*(b.card.w/2+3*u),y:b.card.y+b.card.h/2}];}
    else if(v.balance&&Math.abs(a.x-b.x)<1)path=[{x:a.x,y:a.card.y+a.card.h+3*u},{x:b.x,y:b.card.y-3*u}];
    else if(Math.abs(a.y-b.y)<1)path=[{x:a.x+r,y:a.y},{x:b.x-r,y:b.y}];
    else{
      const routeY=a.card.y+a.card.h+Math.max(gap,36*u)/2;
      path=[{x:a.x+r,y:a.y},{x:group.w-4*u,y:a.y},{x:group.w-4*u,y:routeY},{x:4*u,y:routeY},{x:4*u,y:b.y},{x:b.x-r,y:b.y}];
    }
    const stroke=(v.balance?3.5:2)*u;
    path.slice(1).forEach((point,j)=>add({kind:'line',id:`stage-connector-${i}-segment-${j}`,x:path[j].x,y:path[j].y,x2:point.x,y2:point.y,width:stroke,color:v.accent}));
    const tip=path.at(-1)!,before=path.at(-2)!,dx=tip.x-before.x,dy=tip.y-before.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
    if(!len)continue;
    const head=v.balance?Math.min(14*u,len*.65):7*u,wing=v.balance?Math.min(9*u,len*.45):5*u;
    for(const sign of [-1,1])add({kind:'line',id:`stage-arrow-${i}-${sign}`,x:tip.x-head*ux+sign*wing*uy,y:tip.y-head*uy-sign*wing*ux,x2:tip.x,y2:tip.y,width:stroke,color:v.accent});
  }
  for(const n of nodes){
    if(stations)add({kind:'rect',id:`stage-node-${n.index}`,x:n.x-r,y:n.y-r,w:d,h:d,fill:v.accent,radius:v.balance&&numbered?10*u:r});
    if(numbered)add({kind:'text',id:`stage-number-${n.index}`,x:n.x-r,y:n.y-(v.balance?15:12)*u,w:d,h:(v.balance?30:24)*u,size:(v.balance?22:18)*u,weight:'bold',color:readableInk(v.accent,'#FFFFFF'),align:'center',fontFamily:'OlaBody',text:String(n.index+1),lines:[String(n.index+1)]});
  }
}
