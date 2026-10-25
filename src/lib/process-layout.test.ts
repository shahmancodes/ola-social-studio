import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {composePage} from './composition';import {buildVisualScene,scenePng,type SceneElement}from'./content-layout';import {sceneIssues}from'./scene-renderer';import type{ContentBrand}from'./content-brand';
const formats=['poster','story','carousel','post','presentation']as const;
const brand:ContentBrand={companyId:'process-test',name:'Example',audience:'Teams',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],assets:[],palette:{background:'#FFFFFF',alternate:'#F1F3F5',accent:'#5D45B5',ink:'#161616',dark:'#161616'}};
const line=(e:SceneElement|undefined):e is Extract<SceneElement,{kind:'line'}>=>e?.kind==='line';
let dir:string;beforeAll(async()=>{dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-process-'));});afterAll(async()=>fs.rm(dir,{recursive:true,force:true}));
describe('connected process geometry',()=>{
 it('can remove station markers explicitly without removing the native route',async()=>{
  const p=composePage({title:'Show the handoff',body:'Purpose → Progress → Next action'},{family:'diagram-led',intent:{goal:'Show ordered stages',relationship:'sequence',reason:'Use an unnumbered path.'},bodyMode:'sequence',separator:' → ',responsive:{version:1,visual:{direction:'horizontal',nodes:'none'}}});
  const scene=await buildVisualScene('poster',p,brand);await scenePng(scene);
  expect(scene.elements.some(e=>e.id?.startsWith('stage-node-'))).toBe(false);expect(scene.elements.some(e=>e.id?.startsWith('stage-connector-'))).toBe(true);expect(sceneIssues(scene)).toEqual([]);
 });
 for(const format of formats)for(const direction of ['horizontal','vertical'])it(`${format}: connected stations without added numbering (${direction})`,async()=>{
  const labels=['Purpose','Progress','Next action'];
  const p=composePage({title:'Pass the context with the work.',body:labels.join(' → '),cta:'Make one handoff easier.'},{family:'diagram-led',intent:{goal:'Show one connected handoff',relationship:'sequence',reason:'Each existing stage is a station on one route.'},bodyMode:'sequence',separator:' → ',responsive:{version:1,balance:{version:1},readability:{version:1},focal:'artwork',visual:{direction,treatment:'plain',nodes:'dots'}}});
  const source=structuredClone(p),scene=await buildVisualScene(format,p,brand);await scenePng(scene);
  const nodes=labels.map((_,i)=>scene.elements.find(e=>e.id===`stage-node-${i}`));
  expect(nodes).toHaveLength(3);expect(scene.elements.some(e=>e.id?.startsWith('stage-number-'))).toBe(false);
  for(let i=0;i<2;i++){
   const path=scene.elements.filter(e=>e.id?.startsWith(`stage-connector-${i}-segment-`)),a=nodes[i],b=nodes[i+1],first=path[0],last=path.at(-1);
   if(a?.kind!=='rect'||b?.kind!=='rect'||!line(first)||!line(last))throw Error('Missing native station route.');
   expect(a.radius).toBeCloseTo(a.w/2);
   if(direction==='horizontal'){expect(first.x).toBeCloseTo(a.x+a.w);expect(last.x2).toBeCloseTo(b.x);expect(a.y).toBeCloseTo(b.y);}
   else{expect(first.y).toBeCloseTo(a.y+a.h);expect(last.y2).toBeCloseTo(b.y);}
  }
  for(const text of labels)expect(scene.elements.filter(e=>e.kind==='text'&&e.text===text)).toHaveLength(1);
  expect(sceneIssues(scene)).toEqual([]);expect(p).toEqual(source);
 });
 for(const format of formats)for(const treatment of ['plain','cards','numbered'])for(const direction of ['horizontal','vertical'])it(`${format}: ${direction} ${treatment}`,async()=>{
  const labels=['Plan','Build','Review','Learn'];
  const p=composePage({title:'Keep work moving.',body:labels.join(' → '),cta:'Improve one handoff.'},{family:'diagram-led',intent:{goal:'Show the ordered process',relationship:'sequence',reason:'The supplied stages are ordered.'},bodyMode:'sequence',separator:' → ',responsive:{version:1,focal:'artwork',gap:.025,visual:{treatment,direction}}});
  const scene=await buildVisualScene(format,p,brand);const png=await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);
  const nodes=labels.map((_,i)=>scene.elements.find(e=>e.id===`stage-node-${i}`)!);
  for(let i=0;i<3;i++){
    const segments=scene.elements.filter(e=>e.id?.startsWith(`stage-connector-${i}-segment-`));expect(segments.length).toBeGreaterThan(0);
    for(let j=1;j<segments.length;j++){const prev=segments[j-1],next=segments[j];if(!line(prev)||!line(next))throw new Error();expect([prev.x2,prev.y2]).toEqual([next.x,next.y]);}
    const first=segments[0],last=segments.at(-1)!;if(!line(first)||!line(last))throw new Error();const a=nodes[i],b=nodes[i+1];if(a.kind!=='rect'||b.kind!=='rect')throw new Error();
    if(direction==='vertical'){expect(first.x).toBeCloseTo(a.x+a.w/2);expect(first.y).toBeCloseTo(a.y+a.h);expect(last.x2).toBeCloseTo(b.x+b.w/2);expect(last.y2).toBeCloseTo(b.y);}
    else{expect(first.x).toBeCloseTo(a.x+a.w);expect(first.y).toBeCloseTo(a.y+a.h/2);expect(last.x2).toBeCloseTo(b.x);expect(last.y2).toBeCloseTo(b.y+b.h/2);}
  }
  if(direction==='vertical')for(let i=0;i<4;i++){const label=scene.elements.find(e=>e.id===`semanticComponent.items.${i}.label`)!;const node=nodes[i];if(label.kind!=='text'||node.kind!=='rect')throw new Error();expect(label.x).toBeGreaterThan(node.x+node.w);expect(node.y+node.h/2).toBeGreaterThan(label.y);expect(node.y+node.h/2).toBeLessThan(label.y+label.h+1);if(treatment==='cards'){const card=scene.elements.find(e=>e.id===`visual-card-${i}`)!;if(card.kind!=='rect')throw new Error();expect(card.h).toBeLessThan(label.h+45*(format==='poster'?1.15:1));expect(card.w).toBeLessThan(scene.width*.6);}}
  if(process.env.OLA_PROCESS_FIXTURE_DIR){await fs.mkdir(process.env.OLA_PROCESS_FIXTURE_DIR,{recursive:true});await fs.writeFile(path.join(process.env.OLA_PROCESS_FIXTURE_DIR,`${format}-${direction}-${treatment}.png`),png);}
 });
 it('wraps longer processes with one continuous path and keeps long labels readable',async()=>{
  const p=composePage({title:'Explain each handoff.',body:'Prepare the approved brief → Assign the next owner → Review the proposed change → Confirm the acceptance criteria → Record the next action'}, {family:'diagram-led',intent:{goal:'Show each handoff in order',relationship:'sequence',reason:'Five supplied stages require an ordered path.'},bodyMode:'sequence',separator:' → ',responsive:{version:1,visual:{direction:'horizontal',treatment:'cards'}}});
  const scene=await buildVisualScene('poster',p,brand);await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);
  const wrap=scene.elements.filter(e=>e.id?.startsWith('stage-connector-3-segment-'));expect(wrap).toHaveLength(5);
  for(let i=0;i<5;i++)expect(scene.elements.filter(e=>e.copyId===`body-${i}`)).toHaveLength(1);
 });
});
