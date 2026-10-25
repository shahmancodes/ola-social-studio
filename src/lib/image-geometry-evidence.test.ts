import sharp from 'sharp';
import {expect,it} from 'vitest';
import {imageGeometryEvidence} from './image-geometry-evidence';
import type {VisualScene} from './content-layout';
it.each([{width:985.12,height:677.27},{width:1000,height:1000}])('reports decoded source dimensions and the contained displayed image in $width × $height',async viewport=>{
 const bytes=await sharp({create:{width:1280,height:880,channels:3,background:'green'}}).png().toBuffer();
 const scene:VisualScene={width:1240,height:1754,background:'#ffffff',elements:[{kind:'image',id:'artwork',x:96,y:326,w:viewport.width,h:viewport.height,bytes}]};
 const [evidence]=await imageGeometryEvidence(scene);expect(evidence.source).toEqual({width:1280,height:880});expect(evidence.fitting).toBe('contain');expect(evidence.displayed.width/evidence.displayed.height).toBeCloseTo(1280/880,12);expect(evidence.displayed.width).toBeLessThanOrEqual(viewport.width);expect(evidence.displayed.height).toBeLessThanOrEqual(viewport.height);expect(evidence.viewport).toEqual({x:96,y:326,...viewport});
 expect(evidence.displayed.x).toBeCloseTo(96+(viewport.width-evidence.displayed.width)/2);expect(evidence.displayed.y).toBeCloseTo(326+(viewport.height-evidence.displayed.height)/2);
});
it('excludes hidden images and records rotation separately from source proportions',async()=>{
 const bytes=await sharp({create:{width:400,height:800,channels:3,background:'blue'}}).png().toBuffer();
 const scene:VisualScene={width:1080,height:1350,background:'#fff',elements:[{kind:'image',id:'hidden',hidden:true,x:0,y:0,w:400,h:800,bytes},{kind:'image',id:'rotated',rotation:90,x:50,y:100,w:400,h:400,bytes}]};
 const result=await imageGeometryEvidence(scene);expect(result).toHaveLength(1);expect(result[0]).toMatchObject({id:'rotated',rotation:90,source:{width:400,height:800},displayed:{width:200,height:400}});
});
