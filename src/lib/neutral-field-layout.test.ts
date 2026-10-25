import{it,expect}from'vitest';import sharp from'sharp';
import{SemanticComponentSchema}from'./schemas';import{SimpleArtifactSchema}from'./simple-content';import{composePage,artifactPages}from'./composition';import{applyArtifactPatches,contentForEvidence}from'./artifact-repair';
import{buildVisualScene,scenePng}from'./content-layout';import{sceneIssues}from'./scene-renderer';import{mobileTextEvidence}from'./layout-readability';import type{ContentBrand}from'./content-brand';
const brand:ContentBrand={companyId:'test',name:'Example',audience:'Teams',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],assets:[],palette:{background:'#FFFFFF',alternate:'#EEF2F6',accent:'#1658B0',ink:'#17202A',dark:'#17202A'}};
const component=SemanticComponentSchema.parse({kind:'checklist',items:[{label:'Source',detail:'Read the original.'},{label:'Action',detail:'Choose a useful step.'}]});
const plan={family:'modular-grid',intent:{goal:'Explain the supplied fields',relationship:'statement',reason:'These are complementary fields, without order or completion marks.'},responsive:{version:1,balance:{version:1},readability:{version:1},arrangement:'stack'}};
for(const format of ['poster','story','carousel','post','presentation']as const)for(const treatment of ['plain','cards']as const)it(`renders neutral editable fields without completion cues in ${format} ${treatment}`,async()=>{
 const page=composePage({title:'Keep the context',body:'',semanticComponent:component},{...plan,responsive:{...plan.responsive,visual:{nodes:'none',direction:format==='presentation'?'horizontal':'vertical',treatment}}});
 const scene=await buildVisualScene(format,page,brand);await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);
 expect(scene.elements.some(e=>e.id?.startsWith('native-list-check-')||e.id?.startsWith('native-list-link-')||e.id?.startsWith('native-list-number-'))).toBe(false);
 const group=scene.responsiveLayout!.groups.find(g=>g.id==='artwork')!,pad=treatment==='cards'?18*group.visual!.unit:0;
 const label=scene.elements.find(e=>e.id==='semanticComponent.items.0.label');if(label?.kind!=='text')throw Error('Missing label');
 expect(label.x-group.x).toBeCloseTo(pad);expect(label.y-group.y).toBeCloseTo(pad);
 for(const [i,item]of component.items.entries())for(const role of ['label','detail']as const)expect(scene.elements.filter(e=>e.kind==='text'&&e.copySource===`semanticComponent.items.${i}.${role}`&&e.text===item[role])).toHaveLength(1);
 expect(scene.elements.filter(e=>e.id?.startsWith('native-list-card-'))).toHaveLength(treatment==='cards'?2:0);
 if(['story','carousel','post'].includes(format))expect(mobileTextEvidence(scene).text.every(t=>t.pixels+.05>=t.minimum)).toBe(true);
},20000);
it('repairs the optional marks and restoring defaults recovers the exact original pixels',async()=>{
 const page=composePage({title:'Keep the context',body:'',semanticComponent:component},plan),artifact=SimpleArtifactSchema.parse({type:'poster',headline:page.title,subline:'',semanticComponent:component,composition:page.composition});
 const before=await scenePng(await buildVisualScene('poster',artifactPages(artifact)[0],brand));
 const neutral=applyArtifactPatches(artifact,{reason:'Show complementary fields without completion cues.',patches:[{target:'page-1',responsive:{visual:{nodes:'none'}}}]},'');expect(contentForEvidence(neutral)).toEqual(contentForEvidence(artifact));
 const restored=applyArtifactPatches(neutral,{reason:'Restore the action marks.',patches:[{target:'page-1',responsive:{visual:{nodes:null}}}]},'');
 const after=await scenePng(await buildVisualScene('poster',artifactPages(restored)[0],brand));expect((await sharp(after).raw().toBuffer()).equals(await sharp(before).raw().toBuffer())).toBe(true);
});
