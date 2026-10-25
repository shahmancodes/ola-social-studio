import {describe,it,expect} from 'vitest';
import {SemanticDesignSpecSchema} from './semantic-design';
import {semanticDesignRegions,semanticTextCapacities} from './semantic-design-fit';
import type {LayoutGroup} from './responsive-layout';
import type {VisualScene} from './content-layout';
import {ResponsiveLayoutSchema} from './composition-design';
const profile={heightRatio:.5,boxes:[{id:'label',x:.1,y:.2,w:.3,h:.08},{id:'detail',x:.1,y:.4,w:.3,h:.2}]};
const spec=SemanticDesignSpecSchema.parse({version:1,name:'Measured related text',purpose:'Keep one label with its explanatory detail.',relationship:'statement',nodes:[{id:'label',source:'semanticComponent.items.0.label',role:'label'},{id:'detail',source:'semanticComponent.items.0.detail',role:'detail'}],connectors:[],profiles:{portrait:profile,landscape:profile}});
const group=():LayoutGroup=>({id:'artwork',lane:'full',x:0,y:0,w:1000,h:500,semanticDesign:{spec:structuredClone(spec),profile:'portrait',height:500},visual:{mode:'designed',labelIds:[],columns:1,treatment:'plain',accent:'#123456',surface:'#EEEEEE',ink:'#111111',unit:1,imageHeight:500,annotations:[]}});
describe('bounded measured semantic text regions',()=>{
 it('uses only available vertical space while preserving source, top, width and the next region',()=>{
  const g=group(),before=structuredClone(g.semanticDesign!.spec),result=semanticDesignRegions(g,new Map([['semanticComponent.items.0.label',80]]));
  expect(result.boxes.get('label')).toEqual({x:100,y:100,w:300,h:80});expect(result.boxes.get('detail')).toEqual({x:100,y:200,w:300,h:100});
  expect(result.capacities.get('semanticComponent.items.0.label')).toBe(94);expect(result.fit[0]).toMatchObject({node:'label',declaredHeight:40,measuredHeight:80,resolvedHeight:80});expect(g.semanticDesign!.spec).toEqual(before);
  expect(()=>semanticDesignRegions(g,new Map([['semanticComponent.items.0.label',100]]))).toThrow(/clear region/);
 });
 it('leaves fitted regions intact and does not reserve unused capacity as visible geometry',()=>{
  const result=semanticDesignRegions(group(),new Map([['semanticComponent.items.0.label',30]]));expect(result.fit).toEqual([]);expect(result.boxes.get('label')?.h).toBe(40);
 });
 it('respects the edge of a containing shape and the start of a separate shape',()=>{
  for(const shape of [{id:'own',kind:'rect',x:.09,y:.19,w:.32,h:.12},{id:'other',kind:'rect',x:.09,y:.31,w:.32,h:.1}]){
   const g=group();g.semanticDesign!.spec.profiles.portrait.shapes=[{...shape,kind:'rect',tone:'surface',purpose:'Keep a meaningful group visually contained.'}];
   expect(semanticDesignRegions(g).capacities.get('semanticComponent.items.0.label')).toBeCloseTo(49);
   expect(()=>semanticDesignRegions(g,new Map([['semanticComponent.items.0.label',60]]))).toThrow(/clear region/);
  }
 });
 it('allows growth within a circular surface only as far as its horizontal chord',()=>{
  const g=group(),p=g.semanticDesign!.spec.profiles.portrait;p.boxes=[{id:'label',x:.4,y:.4,w:.2,h:.08},{id:'detail',x:.01,y:.05,w:.1,h:.1}];p.shapes=[{id:'circle',kind:'circle',tone:'surface',purpose:'Contain this explanatory node in a circular region.',x:.3,y:.2,w:.4,h:.8}];
  expect(semanticDesignRegions(g).capacities.get('semanticComponent.items.0.label')).toBeCloseTo(100+Math.sqrt(30000)-6);
 });
 it('reserves the padding of separate enclosures while keeping related text together',()=>{
  const g=group();g.semanticDesign!.spec.enclosures=[{id:'first',kind:'rounded-rect',tone:'surface',purpose:'Keep the first explanation distinct.',nodes:['label']},{id:'second',kind:'rounded-rect',tone:'surface',purpose:'Keep the second explanation distinct.',nodes:['detail']}];
  expect(semanticDesignRegions(g).capacities.get('semanticComponent.items.0.label')).toBe(79);
  g.semanticDesign!.spec.enclosures[0].nodes.push('detail');g.semanticDesign!.spec.enclosures.pop();
  expect(semanticDesignRegions(g).capacities.get('semanticComponent.items.0.label')).toBe(94);
 });
 it('recomputes measurement capacity after the visual group changes height',()=>{
  const g=group(),element={kind:'text' as const,id:'semanticComponent.items.0.label',groupId:'artwork',x:0,y:0,w:300,h:40,text:'Wrapped label',size:36,weight:'bold' as const,color:'#111111',lines:[]};
  const scene:VisualScene={width:1000,height:500,background:'#FFFFFF',elements:[element],responsiveLayout:{version:1,frame:{x:0,y:0,w:1000,h:500},config:ResponsiveLayoutSchema.parse({version:1}),gap:0,split:.5,groups:[g],order:['artwork'],placements:[]}};
  expect(semanticTextCapacities(scene).get(element)).toBe(94);g.visual!.imageHeight=300;
  expect(semanticTextCapacities(scene).get(element)).toBe(54);
 });
});
