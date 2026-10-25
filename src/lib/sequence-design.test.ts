import { describe, expect, it } from 'vitest';
import { isConsistentDataSequence } from './sequence-design';
import { SimpleArtifactSchema } from './simple-content';
import { SemanticComponentSchema } from './schemas';
import { artifactPages, planArtifactCompositions } from './composition';
import { applyArtifactPatches } from './artifact-repair';

const component=SemanticComponentSchema.parse({kind:'barChart',unit:'%',items:[{label:'A',value:25},{label:'B',value:40}]});
const plan=(family:string)=>({family,responsive:{version:1},intent:{goal:'Compare the reported values',relationship:'statement',reason:'Keep the same encoding for the related evidence.'}});
const fixture=()=>SimpleArtifactSchema.parse({type:'carousel',title:'Related evidence',caption:'Compare the reported values.',slides:Array.from({length:6},(_,i)=>({id:`page-${i+1}`,role:'explanation',title:`Evidence ${i+1}`,body:'',semanticComponent:component}))});

describe('purposeful data consistency',()=>{
 it('requires real numeric content, matching representation and matching narrative role',()=>{
  expect(isConsistentDataSequence([{role:'explanation',semanticComponent:component},{role:'explanation',semanticComponent:component}])).toBe(true);
  expect(isConsistentDataSequence([{role:'hook',semanticComponent:component},{role:'explanation',semanticComponent:component}])).toBe(false);
  expect(isConsistentDataSequence([{role:'explanation',semanticComponent:component},{role:'explanation',semanticComponent:{...component,kind:'lineChart'}}])).toBe(false);
  expect(isConsistentDataSequence([{role:'explanation'},{role:'explanation'}])).toBe(false);
  expect(isConsistentDataSequence([undefined,undefined])).toBe(false);
 });
 it('allows a related numeric series without forcing three families into each candidate',()=>{
  const artifact=fixture();
  const result=planArtifactCompositions(artifact,{candidates:[{pages:Array.from({length:6},()=>plan('diagram-led'))},{pages:Array.from({length:6},()=>plan('modular-grid'))}]},true);
  expect(result.candidates).toHaveLength(2);
  expect(artifactPages(result.candidates[0]).every(page=>page.composition?.family==='diagram-led')).toBe(true);
  const narrative=fixture();if(narrative.type==='carousel')narrative.slides[5].role='close';
  expect(()=>planArtifactCompositions(narrative,{candidates:[{pages:Array.from({length:6},()=>plan('diagram-led'))},{pages:Array.from({length:6},()=>plan('modular-grid'))}]},true)).toThrow('at least three');
 });
 it('allows a numeric series repair to reduce family count while retaining every value and label',()=>{
  const artifact=fixture(),families=['diagram-led','modular-grid','oversized-typography','diagram-led','diagram-led','diagram-led'];
  const original=planArtifactCompositions(artifact,{candidates:[{pages:families.map(plan)},{pages:Array.from({length:6},()=>plan('modular-grid'))}]},true).candidates[0];
  const repaired=applyArtifactPatches(original,{reason:'Keep comparable evidence in a coherent data layout',patches:[{target:'page-3',compositionPlan:plan('diagram-led')}]},'');
  expect(new Set(artifactPages(repaired).map(page=>page.composition?.family)).size).toBe(2);
  expect(artifactPages(repaired).map(page=>page.semanticComponent)).toEqual(artifactPages(original).map(page=>page.semanticComponent));
 });
});
