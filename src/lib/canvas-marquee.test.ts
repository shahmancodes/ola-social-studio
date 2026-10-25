import { describe, expect, it } from 'vitest';
import { marqueeSelection, selectionRect } from './canvas-marquee';
import type { CanvasObject } from './freeform-canvas';
const object=(id:string,x:number,y:number,extra:Partial<CanvasObject>={}):CanvasObject=>({id,kind:'rect',x,y,width:100,height:100,rotation:0,...extra});

describe('drag selection',()=>{
  it('selects intersecting objects in either drag direction, including partially enclosed boxes',()=>{
    const objects=[object('text',20,20,{kind:'text'}),object('component',150,100,{kind:'image'}),object('outside',400,400)];
    const from={x:0,y:0},to={x:180,y:130};
    expect(selectionRect(from,to)).toEqual(selectionRect(to,from));
    expect(marqueeSelection(objects,selectionRect(to,from))).toEqual(['text','component']);
  });
  it('ignores hidden and locked objects and adds to an existing selection without duplicates',()=>{
    const objects=[object('selected',0,0),object('new',150,0),object('locked',0,0,{locked:true}),object('hidden',0,0,{hidden:true})];
    expect(marqueeSelection(objects,{x:0,y:0,width:300,height:100},['selected','elsewhere'])).toEqual(['selected','elsewhere','new']);
    expect(marqueeSelection(objects,{x:400,y:400,width:10,height:10})).toEqual([]);
  });
  it('hits rotated objects precisely without selecting empty corners of their bounding box',()=>{
    const objects=[object('diamond',50,50,{rotation:45})];
    expect(marqueeSelection(objects,{x:29,y:29,width:10,height:10})).toEqual([]);
    expect(marqueeSelection(objects,{x:95,y:28,width:10,height:12})).toEqual(['diamond']);
    expect(marqueeSelection(objects,{x:80,y:80,width:10,height:10})).toEqual(['diamond']);
  });
});
