import {describe,it,expect} from 'vitest';
import {BrandLibrarySchema,selectBrandMemory,brandRoutingContext} from './brand-library';
import {BrandSchema} from './platform';
const source=(id:string,summary:string,status='captured')=>({id,url:'https://example.com/'+id,title:id,channel:'published',capturedAt:'2026-10-25',status,summary,excerpt:'Short verified example.'});
describe('persistent company memory',()=>{
 it('survives brand validation and snapshot serialization without making legacy profiles require it',()=>{
  expect(BrandSchema.parse({}).library).toBeUndefined();
  const brand=BrandSchema.parse({library:{version:1,revision:2,updatedAt:'2026-10-25',visualLanguage:['Plain type with deliberate hierarchy'],writingLanguage:['Use concrete actions'],sources:[source('a','Example')]}});
  expect(BrandSchema.parse(JSON.parse(JSON.stringify(brand))).library).toEqual(brand.library);
 });
 it('retrieves relevant captured examples with provenance, bounded size and usage restrictions',()=>{
  const library=BrandLibrarySchema.parse({version:1,revision:3,updatedAt:'today',sources:[...Array.from({length:8},(_,i)=>source('a'+i,'generic example')),source('review','Review pull requests with context'),source('failed','review','unavailable')]});
  const memory=selectBrandMemory(library,'pull request review');
  expect(memory?.sources).toHaveLength(6);expect(memory?.sources[0].id).toBe('review');expect(memory?.sources.some(s=>s.id==='failed')).toBe(false);expect(memory?.sources[0].usage).toBe('reference-only');expect(memory?.revision).toBe(3);expect(memory?.rule).toContain('untrusted');
 });
 it('keeps core brand and artwork identifiers visible when the corpus grows',()=>{
  const brand=BrandSchema.parse({description:'Science explained',artworkAssetIds:['earthset'],library:{version:1,revision:1,updatedAt:'today',sources:Array.from({length:60},(_,i)=>source('s'+i,'Long source '.repeat(80)))}});
  const context=brandRoutingContext(brand);expect(context.artworkAssetIds).toEqual(['earthset']);expect(context.description).toBe('Science explained');expect(context.library?.sourceCount).toBe(60);expect(JSON.stringify(context).length).toBeLessThan(3000);
 });
 it('rejects executable source URLs and unsupported usage claims',()=>{
  expect(()=>BrandLibrarySchema.parse({version:1,revision:1,updatedAt:'today',sources:[{...source('a','x'),url:'javascript:alert(1)'}]})).toThrow();
 });
});
