import {describe,expect,it} from 'vitest';
import {DesignTypographySchema,TextTypographyPatchSchema,resolveTypographyPatch,typographyHtml} from './design-typography';
import {applyArtifactPatches,artifactRepairSchema,artifactTypographySources} from './artifact-repair';
import {composePage} from './composition';
import {SimpleArtifactSchema} from './simple-content';

describe('source-preserving phrase typography repairs',()=>{
 const text='Visible: a request to talk later. Assumption: the reason is urgent.';
 it('compiles exact phrases into the existing canonical word-range format',()=>{
  const result=resolveTypographyPatch(text,{emphasis:[{phrase:'Visible:',treatment:'bold'},{phrase:'Assumption:',treatment:'italic'}],breakAfterText:[{phrase:'talk later.'}]});
  expect(result).toEqual({emphasis:[{start:0,end:1,treatment:'bold'},{start:6,end:7,treatment:'italic'}],breakAfter:[6]});
  expect(typographyHtml(text,result)).toBe('<span style="font-weight:700">Visible:</span> a request to talk later.\n<span style="font-style:italic">Assumption:</span> the reason is urgent.');
 });
 it('requires an explicit occurrence for repeated phrases',()=>{
  expect(()=>resolveTypographyPatch('Keep the source. Keep the context.',{emphasis:[{phrase:'Keep',treatment:'bold'}]})).toThrow(/occurs 2 times/);
  expect(resolveTypographyPatch('Keep the source. Keep the context.',{emphasis:[{phrase:'Keep',occurrence:2,treatment:'bold'}]}).emphasis).toEqual([{start:3,end:4,treatment:'bold'}]);
  expect(()=>resolveTypographyPatch('Keep the source.',{emphasis:[{phrase:'Keep',occurrence:2,treatment:'bold'}]})).toThrow(/does not exist/);
 });
 it('rejects rewritten, partial-word, punctuation-mismatched or overlapping selections',()=>{
  for(const phrase of ['Visible','visible:','is certain.','quest'])expect(()=>resolveTypographyPatch(text,{emphasis:[{phrase,treatment:'bold'}]})).toThrow(/exact complete words/);
  expect(()=>resolveTypographyPatch(text,{emphasis:[{phrase:'a request',treatment:'bold'},{phrase:'request to',treatment:'italic'}]})).toThrow(/cannot overlap/);
  expect(TextTypographyPatchSchema.safeParse({emphasis:[{phrase:'Visible:',treatment:'underline'}]}).success).toBe(false);
 });
 it('retains numeric controls and rejects conflicting or impossible line breaks',()=>{
  expect(resolveTypographyPatch(text,{breakAfter:[6],emphasis:[{start:0,end:1,treatment:'bold'}]}).breakAfter).toEqual([6]);
  expect(()=>resolveTypographyPatch(text,{breakAfter:[6],breakAfterText:[]})).toThrow(/not both/);
  expect(()=>resolveTypographyPatch(text,{breakAfterText:[{phrase:'urgent.'}]})).toThrow(/word boundaries/);
  expect(()=>resolveTypographyPatch(text,{maxLines:1,breakAfterText:[{phrase:'later.'}]})).toThrow(/line limit/);
 });
 it('applies a phrase patch without changing copy, existing style, box or layout',()=>{
  const title='Name one missing piece',page=composePage({title,body:text},{family:'asymmetric-editorial',bodyMode:'text',intent:{goal:'Identify the missing context',relationship:'statement',reason:'Distinguish the known request from the assumption.'},responsive:{version:1},typography:{body:{leading:1.3,width:.9,box:{preset:'dashed-note'}}}});
  const artifact=SimpleArtifactSchema.parse({type:'poster',headline:title,subline:text,composition:page.composition});
  const patch={reason:'Separate the known statement from the assumption',patches:[{target:'page-1',typography:{body:{emphasis:[{phrase:'Visible:',treatment:'bold'},{phrase:'Assumption:',treatment:'bold'}],breakAfterText:[{phrase:'talk later.'}]}}}]};
  expect(artifactRepairSchema(artifact).safeParse(patch).success).toBe(true);
  const fixed=applyArtifactPatches(artifact,patch,`Headline "${title}". Supporting copy "${text}".`);
  if(fixed.type!=='poster'||artifact.type!=='poster')throw Error('Wrong artifact type');
  expect(fixed.headline).toBe(title);expect(fixed.subline).toBe(text);
  expect(fixed.composition?.typography?.body).toMatchObject({leading:1.3,width:.9,box:{preset:'dashed-note'},breakAfter:[6],emphasis:[{start:0,end:1,treatment:'bold'},{start:6,end:7,treatment:'bold'}]});
  expect(DesignTypographySchema.safeParse(fixed.composition?.typography).success).toBe(true);
  expect(JSON.stringify(fixed.composition)).not.toContain('breakAfterText');
  expect(fixed.composition?.blocks).toEqual(artifact.composition?.blocks);
  expect(fixed.composition?.responsive).toEqual(artifact.composition?.responsive);
  expect(artifactTypographySources(artifact)[0].fields.body[6]).toEqual({index:6,word:'Assumption:'});
  expect(artifactRepairSchema(artifact).safeParse({reason:'No single canonical source',patches:[{target:'page-1',typography:{label:{emphasis:[{phrase:'Visible:',treatment:'bold'}]}}}]}).success).toBe(false);
 });
});
