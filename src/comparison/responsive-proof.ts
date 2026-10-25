import fs from 'node:fs/promises';
import path from 'node:path';
import { LAB_DIR, assertIsolation } from './config';
import { compositionBatchPath, type CompositionBatch } from './composition-report';
import { attemptDir, getAttempt, getCase, digest, fingerprint } from './store';
import { projectRow } from '../lib/platform-db';
import { getCompany, getBrand } from '../lib/platform';
import { contentBrand } from '../lib/content-brand';
import { SimpleArtifactSchema } from '../lib/simple-content';
import { artifactPages, withArtifactPages } from '../lib/composition';
import { ResponsiveLayoutSchema } from '../lib/composition-design';
import { renderModernArtifact } from '../lib/modern-content';
import { requiredCopyIssues } from '../lib/artifact-repair';
import type { ResponsiveProofReport } from './responsive-report';

assertIsolation();
const batch=JSON.parse(await fs.readFile(compositionBatchPath(),'utf8')) as CompositionBatch;
const root=path.join(LAB_DIR,'responsive-proofs');await fs.mkdir(root,{recursive:true});
const report:ResponsiveProofReport={createdAt:new Date().toISOString(),fingerprint:fingerprint(),note:'Deterministic regression proofs using the saved approved copy, selected assets and brand snapshots. These are renderer tests, not new model generations or passed live QA attempts. Earlier comparison versions and Canva outputs are unchanged.',cases:[]};
for(const c of batch.cases){
  const attempt=getAttempt(c.attempts.at(-1)!),row=projectRow(attempt.projectId!)!;
  const sourcePath=path.join(attemptDir(attempt),'source.json'),sourceBytes=await fs.readFile(sourcePath);
  const source=SimpleArtifactSchema.parse(JSON.parse(sourceBytes.toString()));
  const comparison=getCase(c.caseId),originalHash=digest(JSON.stringify(comparison));
  const brand=contentBrand(row.company_id,getCompany(row.company_id)!.name,JSON.parse(row.brand_snapshot_json) as ReturnType<typeof getBrand>,row.brief);
  const output=path.join(root,c.caseId);await fs.mkdir(output,{recursive:true});
  const transformed=withArtifactPages(structuredClone(source),artifactPages(source).map(page=>{
    if(!page.composition)throw new Error('Proof source must already have approved copy references.');
    return {...page,composition:{...page.composition,responsive:ResponsiveLayoutSchema.parse({version:1,focal:c.format==='carousel'?'title':'artwork',gap:.025,visualWeight:c.format==='poster'?.6:.54,visual:{treatment:c.format==='poster'?'cards':'plain'}})}};
  }));
  const problems=requiredCopyIssues(transformed,row.brief);if(problems.length)throw new Error(problems.join(' '));
  // Clear old reviewer scores: they refer to the saved version, not this renderer proof.
  delete transformed.quality;
  await renderModernArtifact(transformed,brand,output);
  await fs.writeFile(path.join(output,'source.json'),JSON.stringify(transformed,null,2));
  const files=transformed.type==='carousel'?transformed.imagePaths:transformed.type==='story'||transformed.type==='poster'?[transformed.imagePath!]:[];
  if(files.length!==(attempt.result?.pages.length??0))throw new Error('Proof changed the output page count.');
  if(digest(await fs.readFile(sourcePath))!==digest(sourceBytes)||digest(JSON.stringify(getCase(c.caseId)))!==originalHash)throw new Error('A saved baseline was modified.');
  const copyBefore=artifactPages(source).map(p=>({title:p.title,body:p.body,cta:p.cta,credit:p.credit,assetId:p.assetId,blocks:p.composition?.blocks,placements:p.composition?.placements}));
  const copyAfter=artifactPages(transformed).map(p=>({title:p.title,body:p.body,cta:p.cta,credit:p.credit,assetId:p.assetId,blocks:p.composition?.blocks,placements:p.composition?.placements}));
  if(JSON.stringify(copyBefore)!==JSON.stringify(copyAfter))throw new Error('Proof changed frozen copy or references.');
  report.cases.push({caseId:c.caseId,company:c.company,format:c.format,sourceAttemptId:attempt.id,inputHash:c.inputHash,sourceHash:digest(sourceBytes),copyHash:digest(JSON.stringify(copyBefore)),before:attempt.result!.pages.map(p=>p.file),after:files,checks:transformed.renderEvidence??[],assessment:[]});
}
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({report:'/api/responsive-report',cases:report.cases.map(c=>({company:c.company,pages:c.after.length,checks:c.checks.length}))}));
