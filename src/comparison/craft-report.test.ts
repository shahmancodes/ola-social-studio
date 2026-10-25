import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SharedInput } from './types';

let root:string,db:DatabaseSync,report:typeof import('./craft-report');
const caseId='11111111-1111-4111-8111-111111111111',first='22222222-2222-4222-8222-222222222222',second='33333333-3333-4333-8333-333333333333';
const input={companyId:'example',companyName:'Example',format:'poster',brand:{website:'https://example.com'}} as SharedInput;
function manifest(attemptId:string){fs.writeFileSync(path.join(root,'craft-study/manifest.json'),JSON.stringify({fingerprint:'source',model:'test',createdAt:'now',cases:[{company:'Example',companyId:'example',website:'https://example.com',format:'poster',caseId,attemptId,baselineId:'baseline',before:[{file:'before.png'}]}]}));}
beforeAll(async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'ola-craft-votes-'));vi.stubEnv('COMPARISON_DATA_DIR',root);fs.mkdirSync(path.join(root,'craft-study/runtime'),{recursive:true});
  db=new DatabaseSync(path.join(root,'craft-study/runtime/comparisons.sqlite'));db.exec('CREATE TABLE attempts(id TEXT,case_id TEXT,version INTEGER,record_json TEXT)');
  for(const [i,id]of [first,second].entries())db.prepare('INSERT INTO attempts VALUES(?,?,?,?)').run(id,caseId,i+1,JSON.stringify({id,caseId,version:i+1,status:'complete',result:{pages:[{file:i?'second.png':'first.png'}]}}));
  manifest(first);report=await import('./craft-report');
});
afterAll(()=>{db.close();vi.unstubAllEnvs();fs.rmSync(root,{recursive:true,force:true});});
it('does not invent human preferences from automatic QA',()=>{expect(report.craftReviewLessons(input)).toEqual([]);});
it('binds a vote to the viewed version and retains its exact reference after a rerun',()=>{
  report.saveCraftReview({caseId,attemptId:first,preferred:'after',notes:'Keep the clear typographic contrast.',manualCorrections:1});manifest(second);
  expect(report.craftReviewLessons(input)[0].referenceImages).toEqual(['first.png']);
  expect(()=>report.saveCraftReview({caseId,attemptId:first,preferred:'after',notes:'Stale page.',manualCorrections:0})).toThrow(/displayed version changed/);
});
it('scopes examples to the same company and format',()=>{
  expect(report.craftReviewLessons({...input,companyId:'another'})).toEqual([]);expect(report.craftReviewLessons({...input,format:'story'})).toEqual([]);
});
it('serves only pages belonging to the selected saved case and version',()=>{
  expect(report.craftReportFile(caseId,'run-'+first,0)).toBe('first.png');expect(()=>report.craftReportFile(caseId,'run-not-in-this-case',0)).toThrow(/not available/);expect(()=>report.craftReportFile(caseId,'after',-1)).toThrow(/Invalid page/);
});
