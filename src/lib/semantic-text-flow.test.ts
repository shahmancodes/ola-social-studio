import {describe,it,expect} from 'vitest';
import {SemanticDesignSpecSchema} from './semantic-design';
import {semanticDesignRegions,refitSemanticTextFlow} from './semantic-design-fit';
import {ResponsiveLayoutSchema} from './composition-design';
import type {LayoutGroup} from './responsive-layout';
import type {VisualScene,SceneElement} from './content-layout';
const profile={heightRatio:.5,boxes:[{id:'label',x:.1,y:.1,w:.3,h:.08},{id:'detail',x:.1,y:.22,w:.3,h:.24},{id:'heading',x:.1,y:.52,w:.3,h:.08}]};
const spec=SemanticDesignSpecSchema.parse({version:1,name:'Related evidence fields',purpose:'Keep a supplied action label close to its explanation.',relationship:'statement',textFlow:'grouped',nodes:[{id:'label',source:'semanticComponent.items.0.label',role:'label'},{id:'detail',source:'semanticComponent.items.0.detail',role:'detail'},{id:'heading',source:'semanticComponent.prompt',role:'heading'}],connectors:[],profiles:{portrait:profile,landscape:profile}});
const group=():LayoutGroup=>({id:'artwork',lane:'full',x:0,y:0,w:1000,h:500,semanticDesign:{spec:structuredClone(spec),profile:'portrait',height:500},visual:{mode:'designed',labelIds:[],columns:1,treatment:'plain',accent:'#123456',surface:'#EEEEEE',ink:'#111111',unit:1,imageHeight:500,annotations:[]}});
const small=()=>new Map([['semanticComponent.items.0.label',30],['semanticComponent.items.0.detail',60],['semanticComponent.prompt',8]]);
const measured=()=>new Map([['semanticComponent.items.0.label',45],['semanticComponent.items.0.detail',70],['semanticComponent.prompt',40]]);
const scene=(g:LayoutGroup,sizes=40,min=20):VisualScene=>({width:1000,height:500,background:'#FFFFFF',elements:g.semanticDesign!.spec.nodes.map(n=>({kind:'text',id:n.source,groupId:g.id,x:0,y:0,w:300,h:n.id==='label'?80:n.id==='detail'?160:40,text:n.id,size:sizes,minSize:min,weight:'regular',color:'#111111',lines:[]})),responsiveLayout:{version:1,frame:{x:0,y:0,w:1000,h:500},config:ResponsiveLayoutSchema.parse({version:1}),gap:0,split:.5,groups:[g],order:['artwork'],placements:[]}});
describe('canonical semantic text flow',()=>{
 it('packs existing item fields into measured stacks and keeps their horizontal regions and source unchanged',()=>{
  const g=group(),original=structuredClone(g.semanticDesign!.spec),r=semanticDesignRegions(g,measured());
  expect(r.flow).toHaveLength(1);expect(r.flow[0]).toMatchObject({id:'item-0',gap:12.5,capacity:204,occupiedHeight:127.5});
  expect(r.boxes.get('label')).toEqual({x:100,y:50,w:300,h:45});expect(r.boxes.get('detail')).toEqual({x:100,y:107.5,w:300,h:70});expect(g.semanticDesign!.spec).toEqual(original);
  g.semanticDesign!.textFlow='regions';expect(semanticDesignRegions(g,measured()).flow).toEqual([]);
 });
 it('keeps side-by-side fields and intervening text in their independent regions',()=>{
  for(const sideBySide of [false,true]){const g=group(),p=g.semanticDesign!.spec.profiles.portrait;if(sideBySide)p.boxes[1]={...p.boxes[1],x:.55,y:.1};else p.boxes[2]={...p.boxes[2],y:.19,h:.02};expect(semanticDesignRegions(g).flow).toEqual([]);expect(semanticDesignRegions(g,small()).flow).toEqual([]);}
 });
 it('does not combine distinct surfaces or separate enclosures',()=>{
  const g=group();g.semanticDesign!.spec.profiles.portrait.shapes=[{id:'label-strip',x:.09,y:.09,w:.32,h:.1,kind:'rect',tone:'accent',purpose:'Keep this label on a separate colored strip.'}];expect(semanticDesignRegions(g,small()).flow).toEqual([]);
  delete g.semanticDesign!.spec.profiles.portrait.shapes;g.semanticDesign!.spec.enclosures=[{id:'first',nodes:['label'],kind:'rect',tone:'surface',purpose:'Group the first part independently.'}];expect(semanticDesignRegions(g,small()).flow).toEqual([]);
 });
 it('includes only trailing canonical tags and preserves an earlier branch marker',()=>{
  const g=group(),p=g.semanticDesign!.spec.profiles.portrait;g.semanticDesign!.spec.nodes.push({id:'tag',source:'semanticComponent.items.0.tag',role:'label',emphasis:'normal'});p.boxes.push({id:'tag',x:.1,y:.47,w:.3,h:.03});
  const heights=measured();heights.set('semanticComponent.items.0.tag',20);expect(semanticDesignRegions(g,heights).flow[0].sources).toHaveLength(3);
  p.boxes.at(-1)!.y=.02;expect(semanticDesignRegions(g,heights).flow[0].sources).toHaveLength(2);
 });
 it('fits an overflowing stack as one unit, then stops changing text once it fits',()=>{
  const g=group(),s=scene(g);expect(refitSemanticTextFlow(s)).toBe(true);
  for(const e of s.elements)if(e.kind==='text'&&e.id!=='semanticComponent.prompt'){expect(e.size).toBeGreaterThanOrEqual(20);expect(e.size).toBeLessThan(40);e.h*=e.size/40;}
  expect(refitSemanticTextFlow(s)).toBe(false);expect(semanticDesignRegions(g,new Map(s.elements.filter((e):e is Extract<SceneElement,{kind:'text'}>=>e.kind==='text').map(e=>[e.id!,e.h]))).flow[0].overflow).toBe(0);
 });
 it('rejects an overfull group at its reading floor instead of clipping or rewriting',()=>{
  const s=scene(group(),33,33),before=structuredClone(s.elements);expect(()=>refitSemanticTextFlow(s)).toThrow(/readable minimum/);expect(s.elements).toEqual(before);
 });
});
