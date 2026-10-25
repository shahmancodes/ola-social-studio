import type { SimpleArtifact } from './simple-content';
import type { VisualScene } from './content-layout';
import { isConsistentDataSequence } from './sequence-design';
export type LayoutObservation = { version: 1; width: number; height: number; signature: string; readingSignature?: string; reflows?:Array<{group:string;fromColumns:number;target:string;reason:string}>; panels: Array<{id:string;area:number;reason:string}>; unrequestedPanels: string[] };
const visualStructure = (mode: string | undefined) => mode === 'timeline' || mode === 'sequence' ? 'connected' : mode === 'table' || mode === 'comparison' ? 'paired' : mode;
/** Uses rendered geometry, not recipe names, colors, branding or copy length. */
export function observeLayout(scene:VisualScene):LayoutObservation {
  const layout=scene.responsiveLayout,frame=layout?.frame??{x:0,y:0,w:scene.width,h:scene.height};
  const q=(n:number)=>Math.round(n*5)/5;
  const geometry=(layout?.groups??[]).filter(g=>['title','body','cta','artwork'].includes(g.id)).map(g=>({id:g.id,x:q((g.x-frame.x)/frame.w),w:q(g.w/frame.w),order:0})).sort((a,b)=>a.id.localeCompare(b.id));
  const order=(layout?.groups??[]).filter(g=>geometry.some(s=>s.id===g.id)).sort((a,b)=>a.y-b.y||a.x-b.x).map(g=>g.id);
  const panels=scene.elements.filter(e=>e.kind==='rect'&&/support-panel|visual-card|native-list-card|callout-\d+$|recipe-decoration-panel$/.test(e.id??'')).map(e=>({id:e.id!,area:e.kind==='rect'?e.w*e.h/(frame.w*frame.h):0,reason:e.id?.startsWith('recipe-decoration')?'explicit recipe':e.id?.startsWith('callout')?'image annotation':layout?.config.visual.treatment==='cards'?'explicit cards':layout?.config.surfaces?.find(s=>e.id?.startsWith(s.target))?.reason??''}));
  const visual=layout?.groups.find(g=>g.visual)?.visual;
  const readingMode=visual?.mode==='native-list'?visual.listKind==='processSteps'?'sequence':visual.listKind==='hubSpoke'?'association':'grid':visual?.mode;
  const primary=geometry.filter(g=>g.id!=='cta');
  const heading=scene.elements.find(e=>e.kind==='text'&&e.id==='title');
  const size=heading?.kind==='text'?heading.size/Math.min(scene.width,scene.height):undefined;
  const titleWeight=size===undefined?'unknown':size>=.105?'dominant':size<.065?'supporting':'balanced';
  const alignment=primary.filter(g=>g.id!=='artwork').map(g=>{const text=scene.elements.find(e=>e.kind==='text'&&e.id===g.id);return {id:g.id,align:text?.kind==='text'?text.align??'left':'left'};});
  const readingSignature=JSON.stringify({geometry:primary,order:order.filter(id=>id!=='cta'),alignment,titleWeight,visual:visual?{mode:visualStructure(readingMode),columns:visual.columns}:null});
  const reflows=(layout?.groups??[]).flatMap(g=>g.visual?.reflow?[{group:g.id,...g.visual.reflow}]:[]);
  return {version:1,width:scene.width,height:scene.height,signature:JSON.stringify({geometry,order,visual:visual?{mode:visual.mode,columns:visual.columns,treatment:visual.treatment}:null}),readingSignature,...(reflows.length?{reflows}:{}),panels,unrequestedPanels:panels.filter(p=>!p.reason).map(p=>p.id)};
}

/** Earlier saved renders have no readingSignature. Compare their primary structure conservatively. */
function primarySignature(observation: LayoutObservation) {
  if(observation.readingSignature)return observation.readingSignature;
  try{
    const saved=JSON.parse(observation.signature);
    return JSON.stringify({geometry:saved.geometry.filter((g:{id:string})=>g.id!=='cta'),order:saved.order.filter((id:string)=>id!=='cta'),visual:saved.visual?{mode:visualStructure(saved.visual.mode),columns:saved.visual.columns}:null});
  }catch{return observation.signature;}
}
export function layoutRepetitionFindings(artifact:SimpleArtifact) {
  const observations=(artifact.renderEvidence??[]).map(e=>({page:e.page,observation:(e.layout as {observation?:LayoutObservation}|undefined)?.observation}));
  const findings:Array<{page:number;targets:string[];problem:string;successCriterion:string}>=[];
  for(const {page,observation}of observations)if(observation?.unrequestedPanels.length)findings.push({page,targets:['content'],problem:'The renderer added filled text containers that the composition did not request.',successCriterion:'Render text without implicit surfaces, preserving all source copy.'});
  if(observations.length<4)return findings;
  const groups=new Map<string,number[]>();
  for(const {page,observation}of observations)if(observation){const key=primarySignature(observation),pages=groups.get(key)??[];pages.push(page);groups.set(key,pages);}
  const threshold=Math.max(3,Math.ceil(observations.length*.5));
  const slides=artifact.type==='carousel'||artifact.type==='presentation'?artifact.slides??[]:[];
  for(const pages of groups.values())if(pages.length>=threshold){
    const repeated=pages.map(page=>slides[page-1]);
    // Reusing one encoding for related data is useful comparison, not a missing narrative beat.
    const roles=repeated.map(page=>page?.role);
    if(isConsistentDataSequence(repeated))continue;
    const count=pages.length-threshold+1;
    const targets=pages.slice(1).reverse().sort((a,b)=>Number(slides[b-1]?.role==='close')-Number(slides[a-1]?.role==='close')).slice(0,count);
    for(const page of targets)findings.push({page,targets:['content'],problem:`Pages ${pages.join(', ')} repeat the same primary rendered reading structure${new Set(roles.filter(Boolean)).size>1?' across different narrative roles':''}. A closing CTA or different surface does not change that structure.`,successCriterion:'Give this page a distinct primary reading direction, headline hierarchy or visual relationship. Use responsive arrangement or visual direction controls on the existing copy; preserve brand consistency and meaningful repeated data structures.'});
  }
  return findings;
}
