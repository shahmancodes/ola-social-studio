import {it,expect}from'vitest';import sharp from'sharp';
import {TextTypographySchema,typographyIssues}from'./design-typography';
import {composePage,artifactPages}from'./composition';import{buildVisualScene,scenePng}from'./content-layout';import{sceneIssues}from'./scene-renderer';
import{SimpleArtifactSchema}from'./simple-content';import{applyArtifactPatches,contentForEvidence}from'./artifact-repair';import{mobileTextEvidence}from'./layout-readability';
import type{ContentBrand}from'./content-brand';
import type{VisualScene}from'./content-layout';
const brand:ContentBrand={companyId:'test',name:'Example',audience:'Teams',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],assets:[],palette:{background:'#FFFFFF',alternate:'#EEF2F6',accent:'#1658B0',ink:'#17202A',dark:'#17202A'}};
const copy={title:'A handoff someone can use',body:'Keep the relevant context with the work.',cta:'Make the next action clear.'};
const plan={family:'oversized-typography',intent:{goal:'Explain the handoff',relationship:'statement',reason:'Keep a readable hierarchy between heading and supporting text.'},typography:{title:{size:1.35,width:.88,leading:1.05,tracking:-.025}},responsive:{version:1,balance:{version:1},readability:{version:1},arrangement:'stack',anchor:'start',craft:{version:1,distribution:'packed'}}};
it('validates a bounded line count and rejects contradictory phrase breaks',()=>{
 for(const maxLines of [0,1.5,13])expect(TextTypographySchema.safeParse({maxLines}).success).toBe(false);
 expect(TextTypographySchema.parse({maxLines:null})).toEqual({maxLines:null});
 expect(typographyIssues(copy.title,{maxLines:2,breakAfter:[2,3]})).toContain('The line limit cannot be smaller than the explicitly requested phrase lines.');
 expect(()=>composePage(copy,{...plan,typography:{title:{maxLines:1,breakAfter:[2]}}})).toThrow(/line limit/);
});
for(const format of ['poster','story','carousel','post','presentation']as const)it(`fits only the requested field to a measured line budget in ${format}`,async()=>{
 const baseline=await buildVisualScene(format,composePage(copy,plan),brand);await scenePng(baseline);
 const limited=await buildVisualScene(format,composePage(copy,{...plan,typography:{...plan.typography,title:{...plan.typography.title,maxLines:2}}}),brand);await scenePng(limited);
 expect(sceneIssues(limited)).toEqual([]);
 const title=limited.elements.find(e=>e.id==='title'),before=baseline.elements.find(e=>e.id==='title');if(title?.kind!=='text'||before?.kind!=='text')throw Error('Missing title');
 expect(title.lines.length).toBeLessThanOrEqual(2);expect(title.size).toBeLessThanOrEqual(before.size);expect(title.text).toBe(copy.title);
 for(const id of ['body','cta']){const a=baseline.elements.find(e=>e.id===id),b=limited.elements.find(e=>e.id===id);if(a?.kind!=='text'||b?.kind!=='text')throw Error('Missing field');expect(b.size).toBe(a.size);expect(b.text).toBe(a.text);}
 if(['story','carousel','post'].includes(format))expect(mobileTextEvidence(limited).text.every(t=>t.pixels+.05>=t.minimum)).toBe(true);
},30000);
it('fails an impossible line budget at the reading floor without truncation',async()=>{
 const page=composePage({...copy,title:'Keep the context visible when the next person starts working on the change'},{...plan,typography:{title:{width:.45,maxLines:1}},responsive:{...plan.responsive}});
 const scene=await buildVisualScene('story',page,brand);await expect(scenePng(scene)).rejects.toThrow(/exceeds the 1-line limit/);
 const title=scene.elements.find(e=>e.id==='title');if(title?.kind!=='text')throw Error('Missing title');expect(title.text).toBe(page.title);
});
it('supports a partial line-budget repair and clearing it restores the original pixels',async()=>{
 const page=composePage(copy,plan),original=SimpleArtifactSchema.parse({type:'poster',headline:copy.title,subline:copy.body,cta:copy.cta,composition:page.composition});
 const before=await scenePng(await buildVisualScene('poster',artifactPages(original)[0],brand));
 const fixed=applyArtifactPatches(original,{reason:'Keep the heading to two lines.',patches:[{target:'page-1',typography:{title:{maxLines:2}}}]},'Headline: "A handoff someone can use"');
 expect(contentForEvidence(fixed)).toEqual(contentForEvidence(original));expect(artifactPages(fixed)[0].composition?.typography?.title).toEqual({...plan.typography.title,maxLines:2});
 const scene=await buildVisualScene('poster',artifactPages(fixed)[0],brand);await scenePng(scene);const title=scene.elements.find(e=>e.id==='title');expect(title?.kind==='text'&&title.lines.length).toBe(2);
 const restored=applyArtifactPatches(fixed,{reason:'Release the line budget.',patches:[{target:'page-1',typography:{title:{maxLines:null}}}]},'');
 const after=await scenePng(await buildVisualScene('poster',artifactPages(restored)[0],brand));expect((await sharp(after).raw().toBuffer()).equals(await sharp(before).raw().toBuffer())).toBe(true);
},30000);
it('retains a manually positioned freeform object size even when it carries an earlier line limit',async()=>{
 const scene:VisualScene={width:1080,height:1350,background:'#FFFFFF',measured:true,freeform:true,compositionVersion:1,elements:[{kind:'text',id:'title',x:100,y:100,w:400,h:400,size:72,minSize:42,weight:'bold',color:'#17202A',text:copy.title,lines:[],typography:{maxLines:1}}]};
 await scenePng(scene);const title=scene.elements[0];if(title.kind!=='text')throw Error('Missing title');expect(title.size).toBe(72);expect(title.h).toBe(400);expect(title.lines.length).toBeGreaterThan(1);expect(title.text).toBe(copy.title);
});
