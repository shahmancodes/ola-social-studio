import{it,expect}from'vitest';
import{SimpleArtifactSchema}from'./simple-content';import{SemanticComponentSchema}from'./schemas';import{composePage,artifactPages,resolvedComponent,compositionIssues}from'./composition';
import{applyArtifactPatches,requiredCopyIssues}from'./artifact-repair';
const pairs=[{label:'Source',detail:'Check the original note.'},{label:'Action',detail:'Name the next useful step.'}],body=pairs.map(p=>p.label+' — '+p.detail).join('\n');
const brief='Headline: "Keep the context". Include these label/detail pairs: "Source" / "Check the original note."; "Action" / "Name the next useful step.". Generate no additional visible prose.';
const plan={family:'modular-grid',bodyMode:'text',intent:{goal:'Explain two useful fields',relationship:'statement',reason:'Keep each supplied label paired with its explanation.'},responsive:{version:1,balance:{version:1},readability:{version:1}}};
function fixture(type:'poster'|'story'|'post'|'carousel'|'presentation'='poster',extra=''){
 const page=composePage({title:'Keep the context',body:body+extra},{...plan,bodyMode:'grid',separator:'\n'});
 const source={id:'page-1',title:page.title,body:page.body,semanticComponent:page.semanticComponent,composition:page.composition};
 return SimpleArtifactSchema.parse(type==='carousel'||type==='presentation'?{type,title:'Guide',caption:'',slides:[source,{id:'page-2',title:'Explain the purpose',body:'Useful context.'},{id:'page-3',title:'Choose an action',body:'Move the work forward.'}]}:{type,headline:page.title,subline:page.body,caption:'',semanticComponent:page.semanticComponent,composition:page.composition});
}
function patch(artifact:ReturnType<typeof fixture>,items=pairs){return{reason:'Separate exact supplied roles without changing their wording.',patches:[{target:artifact.type==='carousel'||artifact.type==='presentation'?artifact.slides[0].id:'page-1',body:'',semanticComponent:SemanticComponentSchema.parse({kind:'checklist',items}),compositionPlan:plan}]};}
for(const type of ['poster','story','post','carousel','presentation']as const)it(`moves exact pair copy out of paragraph projections into canonical fields in ${type}`,()=>{
 const original=fixture(type),saved=structuredClone(original),fixed=applyArtifactPatches(original,patch(original),brief),page=artifactPages(fixed)[0];
 expect(original).toEqual(saved);expect(page.body).toBe('');expect(resolvedComponent(page)?.items.map(i=>({label:i.label,detail:i.detail}))).toEqual(pairs);
 expect(page.composition?.blocks.some(b=>b.source==='body')).toBe(false);expect(page.composition?.blocks.filter(b=>b.source.startsWith('semanticComponent.items.'))).toHaveLength(4);
 expect(compositionIssues(page)).toEqual([]);expect(requiredCopyIssues(fixed,brief)).toEqual([]);
});
it('keeps the repair locked unless its target roles and complete copy survive',()=>{
 const original=fixture();
 for(const items of [[pairs[0],{label:pairs[1].detail,detail:pairs[1].label}],[pairs[0],pairs[0]],[pairs[0],{...pairs[1],detail:'A rewritten step.'}]])expect(()=>applyArtifactPatches(original,patch(original,items),brief)).toThrow(/required copy|separate label/);
 const noPlan=patch(original);delete (noPlan.patches[0] as{compositionPlan?:unknown}).compositionPlan;expect(()=>applyArtifactPatches(original,noPlan,brief)).toThrow(/required copy/);
 const extra=fixture('poster','\nPreserve this separate explanation.');expect(()=>applyArtifactPatches(extra,patch(extra),brief)).toThrow(/required copy/);
 expect(requiredCopyIssues(original,brief).some(i=>i.includes('separate label'))).toBe(true);
});
it('retains a separately supplied whole-paragraph requirement',()=>{
 const original=fixture();expect(()=>applyArtifactPatches(original,patch(original),brief+` Supporting line: "${body}"`)).toThrow(/required copy/);
});
it('rejects a duplicate paragraph, new prose or loss of unrelated required fields',()=>{
 const original=fixture(),duplicate=patch(original);duplicate.patches[0].body=body;
 expect(()=>applyArtifactPatches(original,duplicate,brief)).toThrow(/duplicated in supporting prose/);
 const added=patch(original);added.patches[0].semanticComponent.note='Invented decoration label';expect(()=>applyArtifactPatches(original,added,brief)).toThrow(/required copy/);
 const title=patch(original);(title.patches[0] as{title?:string}).title='Changed headline';expect(()=>applyArtifactPatches(original,title,brief)).toThrow(/required copy/);
});
it('enforces the same transfer safeguards for single-quoted pairs',()=>{
 const original=fixture(),single=brief.replaceAll('"',"'");expect(requiredCopyIssues(applyArtifactPatches(original,patch(original),single),single)).toEqual([]);
 const added=patch(original);added.patches[0].semanticComponent.note='New prose';expect(()=>applyArtifactPatches(original,added,single)).toThrow(/permits only/);
});
