import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type { CanvasObject } from './freeform-canvas';

const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ola-insert-test-'));
vi.stubEnv('OLA_DATA_DIR',directory);
const platform=await import('./platform');
const auth=await import('./platform-auth');
const {db,projectRow}=await import('./platform-db');
const {saveSimpleArtifact}=await import('./simple-content');
const {contentBrand}=await import('./content-brand');
const {freeformScene}=await import('./freeform-scene');
let companyId:string,projectId:string,otherProject:string,foreignCompany:string,referenceId:string;
const png=await sharp({create:{width:200,height:100,channels:3,background:'#00AA55'}}).png().toBuffer();
beforeAll(async()=>{
  const user=auth.createUser('inserts@example.test','local-insert-test-password');
  companyId=platform.createCompany('Insert Studio',user);
  foreignCompany=platform.createCompany('Other Studio',user);
  projectId=platform.createProjectRecord({companyId,creatorId:user,contentType:'poster',brief:'Test inserted images'});
  otherProject=platform.createProjectRecord({companyId,creatorId:user,contentType:'poster',brief:'Another project'});
  referenceId=await platform.storeProjectReference(projectId,'upload.png',png,'image/png');
});
afterAll(async()=>{db().close();vi.unstubAllEnvs();await fs.rm(directory,{recursive:true,force:true});});
const object=()=>({id:'uploaded',kind:'image' as const,x:100,y:100,width:400,height:200,rotation:0,custom:true,referenceId});
const page=(objects:CanvasObject[])=>({title:'Test',body:'',editorAppearance:{freeform:{version:1 as const,objects}}});
const brand=(project=projectId,company=companyId)=>contentBrand(company,'Studio',platform.getBrand(company),'',project);
const base={width:600,height:600,background:'#FFFFFF',elements:[]};
describe('inserted image persistence and access',()=>{
  it('saves uploaded image geometry and exports its pixels, rejecting cross-project reuse without changing the saved version',async()=>{
    const artifact={type:'poster',headline:'Test',subline:'',editorAppearance:page([object()]).editorAppearance};
    await saveSimpleArtifact(projectId,artifact,projectRow(projectId)!.version);
    const row=projectRow(projectId)!,saved=JSON.parse(row.artifact_json!);
    expect(saved.editorAppearance.freeform.objects[0]).toEqual(object());
    const pixel=await sharp(saved.imagePath).extract({left:200,top:150,width:1,height:1}).removeAlpha().raw().toBuffer();
    expect([...pixel]).toEqual([0,170,85]);
    const version=projectRow(otherProject)!.version;
    await expect(saveSimpleArtifact(otherProject,artifact,version)).rejects.toThrow(/unavailable in this project/);
    expect(projectRow(otherProject)!.version).toBe(version);
    await expect(freeformScene(base,page([object()]),brand(projectId,foreignCompany))).rejects.toThrow(/unavailable/);
  });
  it('renders a brand asset outside the generation shortlist, but rejects foreign and ineligible assets',async()=>{
    const assetId=await platform.storeCompanyAsset(companyId,'Brand logo.png',png,'image/png','logo');
    expect(brand().assets.some(a=>a.id===assetId)).toBe(false);
    const item={...object(),referenceId:undefined,assetId};
    const scene=await freeformScene(base,page([item]),brand());
    expect(scene.elements[0].kind==='image'&&scene.elements[0].bytes.equals(png)).toBe(true);
    await expect(freeformScene(base,page([item]),brand(projectId,foreignCompany))).rejects.toThrow(/asset library/);
    const unverified=await platform.storeCompanyAsset(companyId,'Unverified.png',png,'image/png','photography',{sourceUrl:'https://example.test/image.png',rightsNote:'unverified'});
    await expect(freeformScene(base,page([{...item,assetId:unverified}]),brand())).rejects.toThrow(/asset library/);
  });
});
