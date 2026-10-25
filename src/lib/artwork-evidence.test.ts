import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { artworkCreditEvidence } from './artwork-evidence';
import { SimpleArtifactSchema } from './simple-content';
import type { Artwork } from './directed-artwork';
let directory: string, item: Artwork;
beforeEach(async()=>{
  directory=await fs.mkdtemp(path.join(os.tmpdir(),'ola-credit-evidence-'));
  const localPath=path.join(directory,'image.png'),bytes=Buffer.from('approved-photo-bytes');await fs.writeFile(localPath,bytes);
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  item={title:'Spiral stairs',sourcePageUrl:'https://example.org/photo',assetUrl:'https://example.org/photo.png',rightsUrl:'https://example.org/licence',rights:'Reusable with attribution.',attribution:'Photo: Example / CC BY 4.0',use:true,status:'downloaded',localPath,sha256,assetId:'photo',reason:'A changed viewpoint.',review:{approved:true,rightsVerified:true,sourceMatches:true,reason:'Image and credit verified against the source.'},acquisitionEvidence:{version:1,checkedAt:'2026-10-25T00:00:00Z',sha256,sourcePageUrl:'https://example.org/photo',assetUrl:'https://example.org/photo.png',rightsUrl:'https://example.org/licence',attribution:'Photo: Example / CC BY 4.0',sources:[{url:'https://example.org/photo',text:'Spiral stairs by Example. CC BY 4.0.'},{url:'https://example.org/licence',text:'Reuse requires attribution and licence link.'}]}};
});
afterEach(async()=>{await fs.rm(directory,{recursive:true,force:true});});
const artifact=()=>SimpleArtifactSchema.parse({type:'poster',headline:'Change the angle',subline:'Look again.',assetId:'photo',credit:item.attribution,artwork:[item]});
it('hands copy QA the actual independently checked excerpts without repeating acquisition or network calls',async()=>{
 const reopen=vi.fn();const result=await artworkCreditEvidence(artifact(),reopen);
 expect(result.issues).toEqual([]);expect(reopen).not.toHaveBeenCalled();expect(result.evidence).toEqual([expect.objectContaining({assetId:'photo',attribution:item.attribution,origin:'acquisition-review',sources:item.acquisitionEvidence!.sources})]);
});
it.each(['attribution','sourcePageUrl','assetUrl','rightsUrl'] as const)('rejects evidence after changing its bound %s',async field=>{
 const a=artifact();a.artwork[0][field]=field==='attribution'?'Different author':'https://example.org/different';
 const result=await artworkCreditEvidence(a,vi.fn());expect(result.evidence).toEqual([]);expect(result.issues[0]).toContain('no longer matches');
});
it('rejects changed bytes rather than lending the old approval to a replacement image',async()=>{
 await fs.writeFile(item.localPath!,Buffer.from('different-photo'));const result=await artworkCreditEvidence(artifact(),vi.fn());expect(result.evidence).toEqual([]);expect(result.issues[0]).toContain('bytes have changed');
});
it('reopens source and terms for legacy approved images without captured evidence',async()=>{
 delete item.acquisitionEvidence;const reopen=vi.fn(async(url:string)=>({url,text:'Image by Example, reusable under CC BY 4.0.',readLimitReached:false}));
 const result=await artworkCreditEvidence(artifact(),reopen);expect(result.issues).toEqual([]);expect(reopen.mock.calls.map(c=>c[0])).toEqual([item.sourcePageUrl,item.rightsUrl]);expect(result.evidence[0].origin).toBe('reopened');
});
it('does not use unplaced or unapproved image evidence to support a credit',async()=>{
 const a=artifact();a.artwork[0].assetId='unplaced';expect(await artworkCreditEvidence(a,vi.fn())).toEqual({evidence:[],issues:[]});
 a.artwork[0].assetId='photo';a.artwork[0].review!.approved=false;const result=await artworkCreditEvidence(a,vi.fn());expect(result.evidence).toEqual([]);expect(result.issues[0]).toContain('has not passed');
});
it('fails closed on an inaccessible legacy source, preserving programming errors as errors',async()=>{
 delete item.acquisitionEvidence;
 const result=await artworkCreditEvidence(artifact(),async()=>{throw Error('HTTP 403');});expect(result.evidence).toEqual([]);expect(result.issues[0]).toContain('403');
 await expect(artworkCreditEvidence(artifact(),async()=>{throw new ReferenceError('Parser bug');})).rejects.toThrow(ReferenceError);
});
it('covers a secondary placed image while excluding a different unused approved image',async()=>{
 const a=artifact();if(a.type!=='poster')throw Error('Expected poster');a.assetId='supplied';a.supportingAssetIds=['photo'];a.artwork.push({...item,assetId:'unused'});
 const result=await artworkCreditEvidence(a,vi.fn());expect(result.issues).toEqual([]);expect(result.evidence.map(e=>e.assetId)).toEqual(['photo']);
});
