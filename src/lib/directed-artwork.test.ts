import fs from 'node:fs/promises';
import sharp from 'sharp';
import os from 'node:os';
import path from 'node:path';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { acquireDirectedArtwork,approvedArtwork,externalArtworkAllowed,prepareArtworkImage,approvedArtworkPreviews,type Artwork } from './directed-artwork';
import { ArtDirectionSchema } from './art-direction';
import { BrandSchema } from './platform';
import { bindArtworkCredits,SimpleArtifactSchema } from './simple-content';
import { buildVisualScene } from './content-layout';
import type { ContentBrand } from './content-brand';
let directory:string,item:Artwork;
const request={id:'moon',subject:'Lunar surface photograph',purpose:'Help the reader observe a real surface.',style:'Clear contained photography',placement:'One prominent image above the headline'};
const direction=ArtDirectionSchema.parse({version:1,referencePrinciples:[],assetRequests:[request],directions:['photo','editorial','type'].map(id=>({id,name:id+' idea',idea:'A concrete visual idea about observation',attention:'Start with a clear visual focus',hierarchy:'Keep title and support distinct',rhythm:'Vary visual weight across the sequence',assetStrategy:'Use the commissioned image if approved',assetRequestIds:['moon']}))});
const input=()=>({projectId:'project',companyId:'company',brief:'A story about observation. Permit reusable images and credits.',brand:BrandSchema.parse({}),type:'story',direction:structuredClone(direction),available:[]});
const accepted={approved:true,rightsVerified:true,sourceMatches:true,reason:'The actual image matches the source and its public-domain terms.'};
const deps=()=>({research:vi.fn(async(_input:{feedback?:string})=>[item]),reopen:vi.fn(async(url:string)=>({url,text:'A specific source identifies this lunar image as public domain.',readLimitReached:false})),register:vi.fn(async()=> 'approved-id')});
beforeEach(async()=>{directory=await fs.mkdtemp(path.join(os.tmpdir(),'ola-directed-assets-'));const file=path.join(directory,'asset.png');await fs.writeFile(file,Buffer.from('fixture-image'));item={title:'Lunar surface',sourcePageUrl:'https://example.org/image',assetUrl:'https://example.org/image.png',rightsUrl:'https://example.org/rights',rights:'Public domain',attribution:'Image: Example',reason:'A real surface to observe',use:true,status:'downloaded',localPath:file};vi.stubEnv('OLA_ASSET_ACQUISITION','auto');});
afterEach(async()=>{vi.unstubAllEnvs();await fs.rm(directory,{recursive:true,force:true});});
it('passes request, actual pixels and independently reopened source evidence through approval before registration',async()=>{const d=deps(),ask=vi.fn(async(_prompt:string,_images?:string[])=>JSON.stringify(accepted));const result=await acquireDirectedArtwork(input(),ask,d);expect(d.research).toHaveBeenCalledWith(expect.objectContaining({request}));expect(ask.mock.calls[0][0]).toContain('specific source');expect(ask.mock.calls[0][1]![0]).toMatch(/^data:image\/png;base64,/);expect(d.register).toHaveBeenCalledTimes(1);expect(approvedArtwork(result[0])).toBe(true);});
it.each(['rightsVerified','sourceMatches','approved'] as const)('quarantines a downloaded image when %s is false',async(field)=>{const d=deps();const result=await acquireDirectedArtwork(input(),async()=>JSON.stringify({...accepted,[field]:false}),d);expect(d.register).not.toHaveBeenCalled();expect(approvedArtwork(result[0])).toBe(false);expect(result[0].use).toBe(false);});
it('does not expose images whose source cannot be reopened',async()=>{const d=deps();d.reopen.mockRejectedValue(Error('HTTP 403'));const ask=vi.fn();const result=await acquireDirectedArtwork(input(),ask,d);expect(ask).not.toHaveBeenCalled();expect(d.register).not.toHaveBeenCalled();expect(result[0].error).toContain('403');});
it('uses existing approved artwork without searching or redownloading',async()=>{const d=deps(),i=input();i.direction.assetRequests[0]={...request,existingAssetId:'saved'};const result=await acquireDirectedArtwork({...i,available:[{id:'saved',name:'Existing',mediaType:'image/png',diskPath:'/unused',role:'primary'}]},vi.fn(),d);expect(result).toEqual([]);expect(d.research).not.toHaveBeenCalled();});
it.each(['No external images.','Use only supplied images.','Native editable text, geometry and semantic components only.'])('respects explicit restriction: %s',async brief=>{expect(externalArtworkAllowed(brief)).toBe(false);const d=deps();expect(await acquireDirectedArtwork({...input(),brief},vi.fn(),d)).toEqual([]);expect(d.research).not.toHaveBeenCalled();});
it('keeps the comparison disabled arm free of downloader and review calls',async()=>{vi.stubEnv('OLA_ASSET_ACQUISITION','disabled');const d=deps();expect(await acquireDirectedArtwork(input(),vi.fn(),d)).toEqual([]);expect(d.research).not.toHaveBeenCalled();});
it('rejects attribution incompatible with locked visible copy',async()=>{const d=deps();const result=await acquireDirectedArtwork({...input(),brief:'Headline: "Observe." No extra copy.'},async()=>JSON.stringify(accepted),d);expect(result[0].error).toContain('attribution');expect(d.register).not.toHaveBeenCalled();});
it('binds required credit only on pages using the approved image',()=>{const artifact=SimpleArtifactSchema.parse({type:'carousel',title:'Observe',caption:'',slides:[{title:'Look',body:'Observe a detail.',assetId:'approved-id'},{title:'Reflect',body:'Name the detail.'},{title:'Act',body:'Look again.'}],artwork:[{...item,assetId:'approved-id',review:accepted}]});bindArtworkCredits(artifact);if(artifact.type!=='carousel')throw Error('Expected carousel');expect(artifact.slides[0].credit).toBe('Image: Example');expect(artifact.slides[1].credit).toBeUndefined();});
it('prevents an editor preview or export from dropping a registered required credit',async()=>{await expect(buildVisualScene('story',{title:'Observe',body:'',assetId:'approved-id'},{assets:[{id:'approved-id',attribution:'Image: Example'}]}as unknown as ContentBrand)).rejects.toThrow(/attribution/);});

it('rasterizes small intrinsic SVGs sharply while rejecting small raster thumbnails',async()=>{
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10" fill="blue"/></svg>');
 expect((await sharp(await prepareArtworkImage(svg)).metadata()).width).toBe(1800);
 const tiny=await sharp({create:{width:24,height:24,channels:3,background:'blue'}}).png().toBuffer();
 await expect(prepareArtworkImage(tiny)).rejects.toThrow(/too small/);
});
it('tries one alternative source after a failed download, retaining the failed version and approval evidence',async()=>{
 const d=deps();d.research.mockResolvedValueOnce([{...item,requestId:'moon',status:'failed',use:false,error:'HTTP 404'}]).mockResolvedValueOnce([{...item,assetUrl:'https://example.org/alternative.png'}]);
 const result=await acquireDirectedArtwork(input(),async()=>JSON.stringify(accepted),d);
 expect(d.research).toHaveBeenCalledTimes(2);expect(d.research.mock.calls[1][0].feedback).toContain('404');
 expect(result).toHaveLength(2);expect(result[0].error).toContain('404');expect(approvedArtwork(result[1])).toBe(true);
});

it('hands planners only approved image pixels and actual aspect ratios',async()=>{
 await fs.writeFile(item.localPath!,await sharp({create:{width:600,height:300,channels:3,background:'green'}}).png().toBuffer());
 const previews=await approvedArtworkPreviews([{...item,assetId:'approved-id',review:accepted},{...item,use:false}]);
 expect(previews).toHaveLength(1);expect(previews[0]).toMatchObject({assetId:'approved-id',width:600,height:300});expect(previews[0].image).toMatch(/^data:image\/jpeg;base64,/);
});
