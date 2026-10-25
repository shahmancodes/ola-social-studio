import{it,expect}from'vitest';import sharp from'sharp';
import{composePage,artifactPages}from'./composition';import{SimpleArtifactSchema}from'./simple-content';import{SemanticComponentSchema}from'./schemas';import{applyArtifactPatches,contentForEvidence}from'./artifact-repair';
import{buildVisualScene,scenePng}from'./content-layout';import{sceneIssues}from'./scene-renderer';import{mobileTextEvidence}from'./layout-readability';import type{ContentBrand}from'./content-brand';
const brand:ContentBrand={companyId:'test',name:'Example',audience:'Teams',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],assets:[],palette:{background:'#FFFFFF',alternate:'#EEF2F6',accent:'#1658B0',ink:'#17202A',dark:'#17202A'}};
const plan={family:'diagram-led',intent:{goal:'Explain the useful fields',relationship:'relationship',reason:'Keep existing labels close to their details and separate the peer entries.'},responsive:{version:1,balance:{version:1},readability:{version:1},arrangement:'stack'}};
for(const kind of ['checklist','processSteps','relatedPair']as const)for(const vertical of [true,false])it(`applies the existing visual-spacing action between ${kind} peers in ${vertical?'vertical':'horizontal'} flow`,async()=>{
 const component=SemanticComponentSchema.parse({kind,items:[{label:'Source',detail:'Read the original.'},{label:'Action',detail:'Choose a useful step.'}]});
 const responsive={...plan.responsive,arrangement:kind==='relatedPair'&&vertical?'columns':'stack',visual:{direction:kind==='relatedPair'?'auto':vertical?'vertical':'horizontal'}};
 const page=composePage({title:'Keep the context',body:'',semanticComponent:component},{...plan,responsive});
 const original=SimpleArtifactSchema.parse({type:'poster',headline:page.title,subline:'',semanticComponent:page.semanticComponent,composition:page.composition});
 const before=await scenePng(await buildVisualScene('poster',artifactPages(original)[0],brand));
 const fixed=applyArtifactPatches(original,{reason:'Give the peer entries a deliberate measured gap.',patches:[{target:'page-1',layoutActions:[{action:'spacing',target:'visual',gap:.08}]}]},'');expect(contentForEvidence(fixed)).toEqual(contentForEvidence(original));
 const scene=await buildVisualScene('poster',artifactPages(fixed)[0],brand);await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);
 const group=scene.responsiveLayout!.groups.find(g=>g.id==='artwork')!,gap=.08*Math.min(scene.responsiveLayout!.frame.w,scene.responsiveLayout!.frame.h);
 const first=scene.elements.find(e=>e.id==='semanticComponent.items.0.label'),detail=scene.elements.find(e=>e.id==='semanticComponent.items.0.detail'),second=scene.elements.find(e=>e.id==='semanticComponent.items.1.label');if(first?.kind!=='text'||detail?.kind!=='text'||second?.kind!=='text')throw Error('Missing fields');
 expect(group.visual?.itemGap).toBeCloseTo(gap);
 expect(vertical?second.y-detail.y-detail.h:second.x-first.x-first.w).toBeCloseTo(gap);
 expect(detail.y-first.y-first.h).toBeCloseTo((kind==='relatedPair'?12:8)*group.visual!.unit);
 const reset=applyArtifactPatches(fixed,{reason:'Restore the original spacing.',patches:[{target:'page-1',resetLayoutActions:true}]},'');const after=await scenePng(await buildVisualScene('poster',artifactPages(reset)[0],brand));expect((await sharp(after).raw().toBuffer()).equals(await sharp(before).raw().toBuffer())).toBe(true);
},30000);
it('retains social reading floors with an explicit native-list gap',async()=>{
 const page=composePage({title:'Keep the context',body:'',semanticComponent:SemanticComponentSchema.parse({kind:'checklist',items:[{label:'Source',detail:'Read the original.'},{label:'Action',detail:'Choose a useful step.'}]})},{...plan,responsive:{...plan.responsive,adjustments:[{action:'spacing',target:'visual',gap:.08}]}});
 const scene=await buildVisualScene('story',page,brand);await scenePng(scene);expect(mobileTextEvidence(scene).text.every(t=>t.pixels+.05>=t.minimum)).toBe(true);
});
