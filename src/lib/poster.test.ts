import {describe,it,expect} from 'vitest';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {reviewModernArtifact} from './modern-content';
import {buildVisualScene,scenePng} from './content-layout';
import {sceneIssues} from './scene-renderer';
import {SimpleArtifactSchema} from './simple-content';
import {isActiveFormat,inferRequestedFormat} from './format-availability';
import {fallbackDecision} from './intake';
import {applyArtifactPatches,requiredCopyIssues,contentForEvidence} from './artifact-repair';
import {contentSpecialist} from './content-specialists';
import type {ContentBrand} from './content-brand';
const brand:ContentBrand={companyId:'test',name:'Test company',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],palette:{background:'#FFFFFF',alternate:'#F1F3F5',accent:'#164DB8',ink:'#161616',dark:'#161616'},assets:[]};
describe('Poster content type',()=>{
 it('routes posters explicitly and retains paused formats',()=>{
  expect(isActiveFormat('poster')).toBe(true);expect(inferRequestedFormat('Create a poster about code review')).toBe('poster');expect(fallbackDecision('Create a poster about code review',[]).question).toBeNull();expect(inferRequestedFormat('Create a flyer')).toBe('design');expect(isActiveFormat('post')).toBe(false);expect(contentSpecialist('poster').instructions()).toContain('1240 × 1754');
 });
 it('keeps explicit frozen formats separate from brand layout names',()=>{
  expect(inferRequestedFormat('Create an Instagram Story with poster typography.')).toBe('story');
  expect(inferRequestedFormat('Create a poster telling a story.')).toBe('poster');
  expect(inferRequestedFormat('Create a carousel.\nRequired format: 6 ordered 1080 × 1350 Instagram carousel pages.\nBrand context: {"family":"poster"}')).toBe('carousel');
  expect(inferRequestedFormat('Create a poster.\nRequired format: one static 1080 × 1920 Instagram Story.\nBrand context: {"family":"poster"}')).toBe('story');
 });
 it('preserves exact copy and editable CTA during bounded repairs',()=>{
  const artifact=SimpleArtifactSchema.parse({type:'poster',headline:'Review together.',subline:'Make the next change clear.',cta:'Start a conversation.'});
  const brief='Headline: "Review together." Supporting line: "Make the next change clear." CTA: "Start a conversation."';
  expect(requiredCopyIssues(artifact,brief)).toEqual([]);expect(contentForEvidence(artifact)).toHaveProperty('cta','Start a conversation.');
  expect(()=>applyArtifactPatches(artifact,{patches:[{target:'page-1',cta:'Buy now'}],reason:'x'},brief)).toThrow(/required copy/);
  expect(applyArtifactPatches(artifact,{patches:[{target:'page-1',layout:'statement'}],reason:'Contrast'},brief)).toMatchObject({type:'poster',layout:'statement',headline:'Review together.'});
 });
 it('renders one A4 page with measured text, no Story constraints or slide numbering',async()=>{
  const scene=await buildVisualScene('poster',{title:'Build with intention.',body:'Make a small change. Review it together. Learn from what happens next.',cta:'Start with one useful idea.'},brand);
  const bytes=await scenePng(scene);expect(await sharp(bytes).metadata()).toMatchObject({width:1240,height:1754});expect(sceneIssues(scene)).toEqual([]);expect(scene.elements.some(e=>e.id==='progress')).toBe(false);expect(scene.elements.some(e=>e.id==='cta')).toBe(true);
 },20000);
 it('reserves a full-width area for semantic visuals without collisions',async()=>{
  const component=await sharp({create:{width:1080,height:760,channels:4,background:'#c6d5ef'}}).png().toBuffer();
  const scene=await buildVisualScene('poster',{title:'One useful diagram.',body:'Read the structure.',cta:'Explore the idea.'},brand,0,1,component);await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);expect(scene.elements.find(e=>e.id==='artwork')).toMatchObject({w:1048,h:490});
  await expect(buildVisualScene('poster',{title:'x',body:'',assetId:'outside'},brand)).rejects.toThrow(/snapshot/);
 },20000);
 it('reviews a poster using its own format rules without Story interface coordinates',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ola-poster-review-'));
  try{
   const imagePath=path.join(dir,'poster.png');await sharp({create:{width:1240,height:1754,channels:3,background:'#FFFFFF'}}).png().toFile(imagePath);
   const artifact=SimpleArtifactSchema.parse({type:'poster',headline:'Ask a better question.',subline:'Look for evidence.',cta:'Try it.',imagePath,designVersion:2});
   let prompt='';const result=await reviewModernArtifact(artifact,brand,1,async p=>{prompt=p;return JSON.stringify({scores:{clarity:4,usefulness:4,visualCraft:4,brandFit:4,editability:4},issues:[],summary:'Checked'});},'Create an A4 poster.');
   expect(prompt).toContain('single A4 portrait poster');expect(prompt).not.toContain('y=270..1536');expect(prompt).toContain('1240');expect(result.pass).toBe(true);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
 });

});
