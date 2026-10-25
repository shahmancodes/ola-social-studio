/** Shared vector geometry. No DOM, assets, model calls or visible copy. */
export type Point = {x:number;y:number};
export type PrimitiveBox = Point & {w:number;h:number;kind?:string};
export type LineStyle = {arrow?:'start'|'end'|'both';route?:'straight'|'elbow';routeAxis?:'horizontal'|'vertical'};
export type PrimitiveLine = Point & LineStyle & {x2:number;y2:number;width:number};
export type Segment = {x:number;y:number;x2:number;y2:number};

export function rotateSegment(segment:Segment,cx:number,cy:number,degrees=0):Segment {
  const angle=degrees*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  const point=(x:number,y:number)=>({x:cx+(x-cx)*cos-(y-cy)*sin,y:cy+(x-cx)*sin+(y-cy)*cos});
  const from=point(segment.x,segment.y),to=point(segment.x2,segment.y2);
  return{...from,x2:to.x,y2:to.y};
}

export function lineSegments(line:PrimitiveLine):Segment[] {
  const a={x:line.x,y:line.y},b={x:line.x2,y:line.y2};
  const points=line.route==='elbow'&&a.x!==b.x&&a.y!==b.y
    ?(line.routeAxis?line.routeAxis==='horizontal':Math.abs(b.x-a.x)>=Math.abs(b.y-a.y))
      ?[a,{x:(a.x+b.x)/2,y:a.y},{x:(a.x+b.x)/2,y:b.y},b]
      :[a,{x:a.x,y:(a.y+b.y)/2},{x:b.x,y:(a.y+b.y)/2},b]
    :[a,b];
  const segments=points.slice(1).map((p,i)=>({x:points[i].x,y:points[i].y,x2:p.x,y2:p.y})).filter(s=>Math.hypot(s.x2-s.x,s.y2-s.y)>.01);
  const head=(tip:Point,previous:Point)=>{
    const length=Math.hypot(tip.x-previous.x,tip.y-previous.y);if(!length)return;
    const u=(tip.x-previous.x)/length,v=(tip.y-previous.y)/length,size=Math.min(length*.6,Math.max(8,line.width*3.5));
    for(const sign of [-1,1])segments.push({x:tip.x-u*size+sign*v*size*.55,y:tip.y-v*size-sign*u*size*.55,x2:tip.x,y2:tip.y});
  };
  if(line.arrow==='start'||line.arrow==='both')head(a,points[1]);
  if(line.arrow==='end'||line.arrow==='both')head(b,points.at(-2)!);
  return segments;
}

/** True segment/rectangle intersection, including stroke clearance; diagonal rules
 * must not fail QA merely because their bounding rectangles touch text. */
export function segmentCrossesBox(segment:Segment,box:PrimitiveBox,padding=0) {
  const minX=box.x-padding,maxX=box.x+box.w+padding,minY=box.y-padding,maxY=box.y+box.h+padding;
  let low=0,high=1;
  for(const [start,delta,min,max] of [[segment.x,segment.x2-segment.x,minX,maxX],[segment.y,segment.y2-segment.y,minY,maxY]]){
    if(Math.abs(delta)<1e-9){if(start<=min||start>=max)return false;continue;}
    const a=(min-start)/delta,b=(max-start)/delta;low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(high<=low)return false;
  }
  return high>low;
}

const center=(b:PrimitiveBox)=>({x:b.x+b.w/2,y:b.y+b.h/2});
export function boxEndpoints(a:PrimitiveBox,b:PrimitiveBox,gap=7):Segment {
  const from=center(a),to=center(b),dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);
  if(!length)throw Error('Connector endpoints coincide.');
  const edge=(box:PrimitiveBox)=>box.kind==='circle'?box.w/2/length:Math.min(dx?box.w/2/Math.abs(dx):Infinity,dy?box.h/2/Math.abs(dy):Infinity);
  const af=edge(a),bf=edge(b),pad=Math.min(gap,Math.max(0,(length*(1-af-bf))/3));
  return{x:from.x+dx*af+dx/length*pad,y:from.y+dy*af+dy/length*pad,x2:to.x-dx*bf-dx/length*pad,y2:to.y-dy*bf-dy/length*pad};
}

/** Choose a clear edge-to-edge route after layout, with no coordinate decisions
 * required from the designer. Try direct, then orthogonal paths around regions. */
export function routeConnector(a:PrimitiveBox,b:PrimitiveBox,obstacles:PrimitiveBox[],gap=7,route:'auto'|'straight'|'elbow'='auto'):Segment[] {
  const direct=boxEndpoints(a,b,gap);
  const blocked=(s:Segment)=>obstacles.some(box=>{
    if(box.kind!=='circle')return segmentCrossesBox(s,box,gap*.4);
    const c=center(box),dx=s.x2-s.x,dy=s.y2-s.y,square=dx*dx+dy*dy;
    const t=square?Math.max(0,Math.min(1,((c.x-s.x)*dx+(c.y-s.y)*dy)/square)):0;
    return Math.hypot(s.x+t*dx-c.x,s.y+t*dy-c.y)<box.w/2+gap*.4;
  });
  if(route!=='elbow'&&!blocked(direct))return[direct];
  if(route==='straight')throw Error('Straight connector crosses a text region; choose auto routing or move its nodes.');
  const ports=(box:PrimitiveBox)=>[{x:box.x-gap,y:box.y+box.h/2},{x:box.x+box.w+gap,y:box.y+box.h/2},{x:box.x+box.w/2,y:box.y-gap},{x:box.x+box.w/2,y:box.y+box.h+gap}];
  let best:Segment[]|undefined,score=Infinity;
  for(const from of ports(a))for(const to of ports(b)){
    const xs=[(from.x+to.x)/2,...obstacles.flatMap(o=>[o.x-gap,o.x+o.w+gap])];
    const ys=[(from.y+to.y)/2,...obstacles.flatMap(o=>[o.y-gap,o.y+o.h+gap])];
    const candidates=[
      [from,{x:to.x,y:from.y},to],[from,{x:from.x,y:to.y},to],
      ...xs.map(x=>[from,{x,y:from.y},{x,y:to.y},to]),
      ...ys.map(y=>[from,{x:from.x,y},{x:to.x,y},to]),
    ];
    for(const points of candidates){
      const segments=points.slice(1).map((p,i)=>({x:points[i].x,y:points[i].y,x2:p.x,y2:p.y})).filter(s=>Math.hypot(s.x2-s.x,s.y2-s.y)>.01);
      if(!segments.length||segments.some(blocked))continue;
      const value=segments.reduce((sum,s)=>sum+Math.hypot(s.x2-s.x,s.y2-s.y),0)+segments.length*gap*2;
      if(value<score){score=value;best=segments;}
    }
  }
  if(!best)throw Error('No clear connector route; increase spacing or simplify the relationship.');
  return best;
}

export const PRIMITIVE_CHOICES=[
  {id:'rectangle',name:'Rectangle',description:'Group related content',aspect:1.5,kind:'rect',radius:0},
  {id:'rounded',name:'Rounded rectangle',description:'A soft grouping surface',aspect:1.5,kind:'rect',radius:24},
  {id:'circle',name:'Circle',description:'Mark a focal point or node',aspect:1,kind:'rect',radius:10000},
  {id:'line',name:'Line',description:'Separate or connect',aspect:5,kind:'line',route:'straight'},
  {id:'arrow',name:'Arrow',description:'Show direction',aspect:5,kind:'line',route:'straight',arrow:'end'},
  {id:'two-way',name:'Two-way arrow',description:'Show a mutual relationship',aspect:5,kind:'line',route:'straight',arrow:'both'},
  {id:'connector',name:'Elbow connector',description:'Connect offset groups',aspect:2,kind:'line',route:'elbow',arrow:'end'},
] as const;
