import {describe,it,expect} from 'vitest';
import {boxEndpoints,lineSegments,routeConnector,segmentCrossesBox,rotateSegment} from './design-primitives';
import {canvasLine,FreeformCanvasSchema,persistedObjects,resolveCanvasConnectors,type CanvasObject} from './freeform-canvas';
import {sceneIssues} from './scene-renderer';

const a={x:20,y:30,w:120,h:60},b={x:400,y:30,w:120,h:60};
const rect=(id:string,x:number,y:number):CanvasObject=>({id,kind:'rect',x,y,width:120,height:60,rotation:0,fill:'#123456'});
const connector:CanvasObject={id:'connection',kind:'line',x:0,y:0,width:1,height:1,rotation:0,connector:{from:'a',to:'b'},arrow:'end',route:'elbow',strokeWidth:3};
describe('shared design primitives',()=>{
  it('attaches direct connectors outside the text regions and routes around a blocking region',()=>{
    const obstacle={x:230,y:20,w:80,h:80};
    const segments=routeConnector(a,b,[a,b,obstacle]);
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every(s=>![a,b,obstacle].some(box=>segmentCrossesBox(s,box,2)))).toBe(true);
    expect(()=>routeConnector(a,b,[obstacle],7,'straight')).toThrow(/crosses/);
    const direct=boxEndpoints(a,b);expect(direct).toEqual({x:147,y:60,x2:393,y2:60});
  });
  it('attaches diagonal connections to circular edges instead of their bounding corners',()=>{
    const from={x:20,y:20,w:100,h:100,kind:'circle'},to={x:300,y:300,w:100,h:100,kind:'circle'};
    const edge=boxEndpoints(from,to);
    expect(Math.hypot(edge.x-70,edge.y-70)).toBeCloseTo(57);
    expect(Math.hypot(edge.x2-350,edge.y2-350)).toBeCloseTo(57);
    expect(routeConnector(from,to,[from,to])).toHaveLength(1);
    const linked=resolveCanvasConnectors([{...rect('a',20,20),width:100,height:100,radius:10000,rotation:45},{...rect('b',300,300),width:100,height:100,radius:10000},{...connector,route:'straight' as const}])[2];
    expect(linked.x).toBeCloseTo(edge.x);expect(linked.y).toBeCloseTo(edge.y);
  });
  it('distinguishes a diagonal bounding-box overlap from an actual text crossing, including arrowheads',()=>{
    const rule={kind:'line' as const,x:0,y:0,x2:200,y2:200,color:'#123456',width:3,arrow:'end' as const};
    const text={kind:'text' as const,id:'copy',x:10,y:140,w:60,h:30,text:'Clear',size:20,weight:'regular' as const,color:'#111111',lines:[]};
    const scene={width:300,height:300,background:'#FFFFFF',elements:[rule,text]};
    expect(sceneIssues(scene)).toEqual([]);
    expect(sceneIssues({...scene,elements:[rule,{...text,x:100,y:100}]})).toContain('copy is crossed by a rule.');
    const [shaft,...heads]=lineSegments({...rule,x:0,y:10,x2:100,y2:10,arrow:'both'});
    expect(shaft.y).toBe(10);expect(heads).toHaveLength(4);
    expect(lineSegments({...rule,x2:0,y2:0})).toEqual([]);
  });
  it('keeps imported connectors attached through movement, rotation, save and reload without mutating source objects',()=>{
    const source=[rect('a',20,30),rect('b',400,180),connector],copy=structuredClone(source);
    const linked=resolveCanvasConnectors(source),first=linked[2];
    expect(first.x).toBeGreaterThan(140);expect(first.arrow).toBe('end');expect(first.routeAxis).toBe('horizontal');
    const moved=resolveCanvasConnectors([{...source[0],x:100,rotation:20},source[1],first]);
    expect(moved[2].x).not.toBe(first.x);
    expect(FreeformCanvasSchema.parse({version:1,objects:persistedObjects(moved)}).objects[2].connector).toEqual({from:'a',to:'b'});
    expect(source).toEqual(copy);
    const detached=resolveCanvasConnectors([source[0],first]);expect(detached[1].connector).toBeUndefined();expect(detached[1].x).toBe(first.x);
    expect(FreeformCanvasSchema.safeParse({version:1,objects:[{...connector,connector:{from:'a',to:'a'}}]}).success).toBe(false);
  });
  it('keeps horizontal and vertical line geometry in its object bounds, with reversible direction',()=>{
    const horizontal=canvasLine({...connector,lineAxis:'horizontal',width:200,height:1,flipX:true,flipY:true,connector:undefined});
    expect(horizontal).toMatchObject({x:200,x2:0,y:0,y2:0,arrow:'end'});
    const vertical=canvasLine({...connector,lineAxis:'vertical',width:1,height:200,flipX:true,flipY:true,connector:undefined});
    expect(vertical).toMatchObject({x:0,x2:0,y:200,y2:0});
    const rotated=rotateSegment({x:0,y:10,x2:100,y2:10},50,10,90);
    expect(rotated.x).toBeCloseTo(50);expect(rotated.y).toBeCloseTo(-40);expect(rotated.x2).toBeCloseTo(50);expect(rotated.y2).toBeCloseTo(60);
  });
});
