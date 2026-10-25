import type { CanvasObject } from './freeform-canvas';

type Point = { x: number; y: number };
export type SelectionRect = Point & { width: number; height: number };

export function selectionRect(start: Point, end: Point): SelectionRect {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x-start.x), height: Math.abs(end.y-start.y) };
}

/** Intersect the actual rotated box, not its larger axis-aligned bounding box. */
function intersects(object: CanvasObject, rect: SelectionRect) {
  const angle=object.rotation*Math.PI/180, cos=Math.cos(angle), sin=Math.sin(angle);
  const center={x:object.x+object.width/2,y:object.y+object.height/2};
  const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,y])=>({
    x:center.x+x*object.width*cos-y*object.height*sin,
    y:center.y+x*object.width*sin+y*object.height*cos,
  }));
  const box=[{x:rect.x,y:rect.y},{x:rect.x+rect.width,y:rect.y},{x:rect.x+rect.width,y:rect.y+rect.height},{x:rect.x,y:rect.y+rect.height}];
  return [{x:1,y:0},{x:0,y:1},{x:cos,y:sin},{x:-sin,y:cos}].every(axis=>{
    const a=corners.map(p=>p.x*axis.x+p.y*axis.y),b=box.map(p=>p.x*axis.x+p.y*axis.y);
    return Math.max(...a)>=Math.min(...b)&&Math.max(...b)>=Math.min(...a);
  });
}

export function marqueeSelection(objects: CanvasObject[], rect: SelectionRect, previous: string[] = []): string[] {
  const hits=objects.filter(object=>!object.hidden&&!object.locked&&intersects(object,rect)).map(object=>object.id);
  return [...new Set([...previous,...hits])];
}
