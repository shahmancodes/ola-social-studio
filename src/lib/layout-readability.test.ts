import { describe, expect, it } from 'vitest';
import { mobileTextEvidence, mobileReadabilityFindings } from './layout-readability';
import type { VisualScene } from './content-layout';
import type { SimpleArtifact } from './simple-content';

const scene=(width=1080):VisualScene=>({width,height:1350,background:'#FFFFFF',elements:[
 {kind:'text',id:'title',text:'A useful idea',x:0,y:0,w:900,h:180,size:84,weight:'bold',color:'#111111',lines:['A useful idea']},
 {kind:'text',id:'visualContent.items.0.detail',text:'Keep the useful detail.',x:0,y:200,w:900,h:80,size:24,weight:'regular',color:'#111111',lines:['Keep the useful detail.']},
 {kind:'text',id:'credit',text:'Image credit',x:0,y:400,w:900,h:25,size:18,weight:'regular',color:'#111111',lines:['Image credit']},
]});
const artifact=(reading:ReturnType<typeof mobileTextEvidence>,type='carousel')=>({type,renderEvidence:[{page:2,layout:{readability:reading}}]}) as SimpleArtifact;

describe('measured phone readability',()=>{
 it('uses measured source font sizes and viewing width rather than enlarged review previews',()=>{
  const reading=mobileTextEvidence(scene());
  expect(reading.text.find(t=>t.id.endsWith('.detail'))).toMatchObject({pixels:8,minimum:11});
  const findings=mobileReadabilityFindings(artifact(reading));
  expect(findings).toHaveLength(1);expect(findings[0]).toMatchObject({page:2,targets:['visualContent.items.0.detail']});
  expect(findings[0].problem).toContain('8.0px');
  expect(mobileTextEvidence(scene(2160)).text[1].pixels).toBe(4);
 });
 it('passes primary copy at its reading floor and keeps small credits in their own role',()=>{
  const s=scene();const detail=s.elements[1];if(detail.kind!=='text')throw Error('Missing detail');detail.size=33;
  const reading=mobileTextEvidence(s);
  expect(reading.text.some(t=>t.id==='credit')).toBe(false);
  expect(mobileReadabilityFindings(artifact(reading))).toEqual([]);
 });
 it('does not apply a phone viewing rule to posters, presentations, articles or old missing evidence',()=>{
  const reading=mobileTextEvidence(scene());
  for(const format of ['poster','presentation','article'])expect(mobileReadabilityFindings(artifact(reading,format))).toEqual([]);
  expect(mobileReadabilityFindings({type:'story',renderEvidence:[{page:1,layout:{}}]} as SimpleArtifact)).toEqual([]);
 });
 it('does not penalize hidden or decorative text and bounds repair targets to six per page',()=>{
  const s=scene();s.elements[1].hidden=true;
  expect(mobileReadabilityFindings(artifact(mobileTextEvidence(s)))).toEqual([]);
  s.elements[1].hidden=false;s.elements[1].layoutDecoration=true;
  expect(mobileReadabilityFindings(artifact(mobileTextEvidence(s)))).toEqual([]);
  s.elements[1].layoutDecoration=false;
  const reading=mobileTextEvidence(s);reading.text=Array.from({length:12},(_,i)=>({...reading.text[1],id:`visualContent.items.${i}.detail`}));
  expect(mobileReadabilityFindings(artifact(reading))[0].targets).toHaveLength(6);
 });
 it('checks internal diagram text at its final image scale and uses one valid repair target',()=>{
  const s=scene();s.elements.splice(1,1);
  s.elements.push({kind:'image',id:'artwork',x:0,y:200,w:540,h:300,bytes:Buffer.alloc(0),embeddedText:{width:1080,text:[{content:'Observed evidence',size:36},{content:'Explain the possible effect',size:24}]}});
  const reading=mobileTextEvidence(s),labels=reading.text.filter(t=>t.id==='artwork');
  expect(labels.map(t=>t.pixels)).toEqual([6,4]);
  const finding=mobileReadabilityFindings(artifact(reading))[0];
  expect(finding.targets).toEqual(['artwork']);expect(finding.problem).toContain('Explain the possible effect');
  s.elements.at(-1)!.hidden=true;expect(mobileReadabilityFindings(artifact(mobileTextEvidence(s)))).toEqual([]);
 });
});
