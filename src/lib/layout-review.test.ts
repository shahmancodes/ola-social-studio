import {describe,it,expect} from 'vitest';
import {observeLayout,layoutRepetitionFindings,layoutRepetitionObservations} from './layout-review';
import type {VisualScene} from './content-layout';
import type {SimpleArtifact} from './simple-content';
function scene(x=0):VisualScene{return{width:1080,height:1350,background:'#fff',elements:[],responsiveLayout:{version:1,frame:{x:0,y:0,w:1080,h:1350},gap:30,split:.5,groups:[{id:'title',x,y:100,w:x?500:1080,h:200,lane:'full'},{id:'body',x:0,y:350,w:1080,h:100,lane:'full'}],placements:[],order:['title','body'],config:{version:1,arrangement:'auto',anchor:'center',focal:'title',gap:.03,visualWeight:.43,visual:{treatment:'plain',direction:'auto',annotations:[]},adjustments:[]}}};}
describe('rendered repetition review',()=>{
 it('catches a repeated closing structure when a CTA and surface change disguise it',()=>{
  const scenes=[scene(100),scene(),scene(),scene(300),scene(700),scene()];
  scenes[5].background='#111111';
  scenes[5].responsiveLayout!.groups.push({id:'cta',x:0,y:600,w:1080,h:60,lane:'full'});
  const roles=['hook','context','explanation','example','takeaway','close'];
  const artifact={type:'carousel',slides:roles.map(role=>({role})),renderEvidence:scenes.map((s,i)=>({page:i+1,layout:{observation:observeLayout(s)}}))} as SimpleArtifact;
  const findings=layoutRepetitionObservations(artifact);
  expect(layoutRepetitionFindings(artifact)).toEqual([]);
  expect(findings).toHaveLength(1);expect(findings[0].page).toBe(6);
  expect(findings[0].problem).toContain('Pages 2, 3, 6');
 });
 it('distinguishes deliberate headline hierarchy and alignment without counting color or cards as rhythm',()=>{
  const s=scene();s.elements.push({kind:'text',id:'title',x:0,y:100,w:1080,h:200,text:'One clear idea',size:80,minSize:38,weight:'bold',color:'#111111',align:'left',lines:['One clear idea']});
  const original=observeLayout(s).readingSignature;
  s.background='#000000';s.responsiveLayout!.config.visual.treatment='cards';
  expect(observeLayout(s).readingSignature).toBe(original);
  const heading=s.elements[0];if(heading.kind!=='text')throw Error('Missing heading');
  heading.size=140;expect(observeLayout(s).readingSignature).not.toBe(original);
  heading.size=80;heading.align='center';expect(observeLayout(s).readingSignature).not.toBe(original);
 });
 it('allows a consistent encoding for related data pages with the same narrative role',()=>{
  const artifact={type:'carousel',slides:Array.from({length:6},()=>({role:'explanation',semanticComponent:{kind:'barChart',items:[{label:'A',value:25},{label:'B',value:40}]}})),renderEvidence:Array.from({length:6},(_,i)=>({page:i+1,layout:{observation:observeLayout(scene())}}))} as SimpleArtifact;
  expect(layoutRepetitionObservations(artifact)).toEqual([]);
  if(artifact.type==='carousel')artifact.slides[5].role='close';
  expect(layoutRepetitionObservations(artifact).length).toBeGreaterThan(0);
 });
 it('retains repetition checks for saved observations without the new reading signature',()=>{
  const observations=Array.from({length:6},(_,i)=>{
   const observation=observeLayout(scene(i===1||i===2||i===5?0:100+i*100));delete observation.readingSignature;
   const signature=JSON.parse(observation.signature);signature.visual={mode:i===2?'sequence':'timeline',columns:1,treatment:i===5?'numbered':'plain'};
   if(i===5){signature.geometry.push({id:'cta',x:0,w:1,order:0});signature.order.push('cta');}
   observation.signature=JSON.stringify(signature);return {page:i+1,layout:{observation}};
  });
  const artifact={type:'carousel',renderEvidence:observations} as SimpleArtifact;
  expect(layoutRepetitionObservations(artifact)[0].problem).toContain('Pages 2, 3, 6');
 });
 it('detects repeated actual geometry despite different declared families',()=>{
 const artifact={type:'carousel',renderEvidence:Array.from({length:6},(_,i)=>({page:i+1,layout:{observation:observeLayout(scene(i<4?0:300))}}))} as SimpleArtifact;
 expect(layoutRepetitionObservations(artifact)[0].problem).toContain('Pages 1, 2, 3, 4');
 });
 it('does not reject small decks or varied reading structures',()=>{
  expect(layoutRepetitionFindings({type:'carousel',renderEvidence:[0,200,400].map((x,i)=>({page:i+1,layout:{observation:observeLayout(scene(x))}}))} as SimpleArtifact)).toEqual([]);
 });
 it('flags an implicit panel and preserves a justified explicit surface',()=>{
  const s=scene();s.elements.push({kind:'rect',id:'body-support-panel',x:0,y:0,w:900,h:300,fill:'#F1F3F5'});
  expect(observeLayout(s).unrequestedPanels).toEqual(['body-support-panel']);s.responsiveLayout!.config.surfaces=[{target:'body',treatment:'panel',reason:'Separate a supplied quotation from explanatory copy'}];expect(observeLayout(s).unrequestedPanels).toEqual([]);
 });
});
