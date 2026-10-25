import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

const root=process.cwd();createRequire(import.meta.url)('@next/env').loadEnvConfig(root);
const sourceLab=path.join(root,'.data/comparison'),study=path.join(sourceLab,'craft-study'),runtime=path.join(study,'runtime');
Object.assign(process.env,{OLA_ROOT_DIR:root,COMPARISON_DATA_DIR:runtime,COMPARISON_SOURCE_DATA_DIR:path.join(root,'.data'),OLA_DATA_DIR:path.join(runtime,'ola'),OLA_DISABLE_MESSAGING:'1'});
const {insertCase,getCase,getAttempt,newAttempt,saveAttempt,labDb,digest,fingerprint}=await import('../src/comparison/store.ts');
const file=path.join(study,'manifest.json');
if(process.argv.includes('--queue')){
  if(fs.existsSync(file))throw Error('This batch already exists. Its inputs and original attempts must be preserved.');
  const old=new DatabaseSync(path.join(sourceLab,'comparisons.sqlite'),{readOnly:true});
  const inputs=JSON.parse(fs.readFileSync(path.join(sourceLab,'intent-study/manifest.json'),'utf8'));
  const manifest={version:1,createdAt:new Date().toISOString(),fingerprint:fingerprint(),model:inputs.model,change:'Typography, source-preserving phrase emphasis, three creative directions, reference-calibrated selection, phone-size and component QA',cases:[]};
  fs.mkdirSync(study,{recursive:true});
  for(const item of inputs.cases){
    const source=old.prepare('SELECT input_json,input_hash FROM cases WHERE id=?').get(item.caseId);
    const baselineRow=old.prepare('SELECT record_json FROM attempts WHERE id=?').get(item.attemptId),baseline=JSON.parse(baselineRow.record_json);
    if(!baseline.result?.pages.length)throw Error('Missing frozen baseline '+item.company);
    const input=JSON.parse(source.input_json),caseId=crypto.randomUUID(),assetDir=path.join(runtime,'cases',caseId,'inputs'),beforeDir=path.join(study,'before',caseId);
    fs.mkdirSync(assetDir,{recursive:true});fs.mkdirSync(beforeDir,{recursive:true});
    input.assets=input.assets.map(asset=>{const bytes=fs.readFileSync(asset.path);if(digest(bytes)!==asset.sha256)throw Error('Changed source asset '+asset.id);const target=path.join(assetDir,asset.id+path.extname(asset.path));fs.writeFileSync(target,bytes,{flag:'wx'});return{...asset,path:target};});
    const comparison=insertCase(caseId,{...input,mode:'ola',fixture:false,models:undefined,companies:undefined,model:manifest.model});
    const attempt=comparison.attempts[0];attempt.brandRules=baseline.brandRules;attempt.model=manifest.model;saveAttempt(attempt);
    const before=baseline.result.pages.map((page,i)=>{const target=path.join(beforeDir,`page-${i+1}.png`),bytes=fs.readFileSync(page.file);fs.writeFileSync(target,bytes,{flag:'wx'});return{...page,file:target,sha256:digest(bytes)};});
    fs.writeFileSync(path.join(beforeDir,'attempt.json'),baselineRow.record_json);
    manifest.cases.push({company:item.company,companyId:input.companyId,website:input.brand.website,format:item.format,caseId,attemptId:attempt.id,sourceCase:item.caseId,baselineId:baseline.id,baselineHash:digest(baselineRow.record_json),sourceInputHash:source.input_hash,inputHash:comparison.inputHash,brief:input.brief,brandRevision:input.brand.library?.revision,baselineFingerprint:baseline.fingerprint,before,beforeQuality:baseline.result.quality});
    fs.writeFileSync(file,JSON.stringify(manifest,null,2));
    console.log(JSON.stringify({company:item.company,format:item.format,attemptId:attempt.id}));
  }
  old.close();
}
const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
if(process.argv.includes('--pin-source')){if(manifest.cases.some(c=>getAttempt(c.attemptId).status!=='queued'||getAttempt(c.attemptId).startedAt))throw Error('Source can only be pinned before any attempt starts.');manifest.preparedFingerprint=manifest.fingerprint;manifest.fingerprint=fingerprint();fs.writeFileSync(file,JSON.stringify(manifest,null,2));}
if(process.argv.includes('--sync-attempts')){
  for(const entry of manifest.cases){const latest=getCase(entry.caseId).attempts.at(-1);if(latest&&latest.id!==entry.attemptId&&latest.state.baselineAttemptId===entry.attemptId){const old=getAttempt(entry.attemptId);entry.previousAttempts=[...(entry.previousAttempts??[]),{id:old.id,hash:digest(JSON.stringify(old)),fingerprint:old.fingerprint}];entry.attemptId=latest.id;}}fs.writeFileSync(file,JSON.stringify(manifest,null,2));
}
if(process.argv.includes('--record-upgrade')){
  const to=fingerprint();for(const entry of manifest.cases){const a=getAttempt(entry.attemptId);if(['complete','needs-review','failed','blocked','interrupted'].includes(a.status))continue;entry.sourceTransitions=[...(entry.sourceTransitions??[]),{from:a.fingerprint,to,at:new Date().toISOString(),stage:a.stage}];entry.executionFingerprint=to;if(entry.refinementFingerprint)entry.refinementFingerprint=to;a.events.push({at:new Date().toISOString(),kind:'pipeline-source-upgrade',data:entry.sourceTransitions.at(-1)});saveAttempt(a);}fs.writeFileSync(file,JSON.stringify(manifest,null,2));
}
if(process.argv.includes('--rerun')){
  const caseId=process.argv[process.argv.indexOf('--rerun')+1],entry=manifest.cases.find(c=>c.caseId===caseId);if(!entry)throw Error('Unknown case.');const before=getAttempt(entry.attemptId);if(!['failed','needs-review','complete','interrupted'].includes(before.status))throw Error('Wait for a terminal attempt.');
  const next=newAttempt(caseId,'ola',undefined,{olaBaselineId:before.id});entry.previousAttempts=[...(entry.previousAttempts??[]),{id:before.id,hash:digest(JSON.stringify(before)),fingerprint:before.fingerprint}];entry.attemptId=next.id;entry.executionFingerprint=fingerprint();fs.writeFileSync(file,JSON.stringify(manifest,null,2));console.log(JSON.stringify({rerun:next.id,of:before.id}));
}
if(process.argv.includes('--refine')){
  const caseId=process.argv[process.argv.indexOf('--refine')+1],entry=manifest.cases.find(c=>c.caseId===caseId);if(!entry)throw Error('Choose a saved case ID.');
  const before=getAttempt(entry.attemptId);if(!['complete','needs-review'].includes(before.status)||!before.projectId)throw Error('Refine only a terminal saved render.');
  const {enqueue,projectRow}=await import('../src/lib/platform-db.ts');const {setProjectAiPolicy}=await import('../src/lib/ai-execution.ts');
  const sourceProject=projectRow(before.projectId);if(!sourceProject?.artifact_json)throw Error('The editable source is missing.');
  let artifact=JSON.parse(sourceProject.artifact_json);
  if(process.argv.includes('--patch')){const patchFile=process.argv[process.argv.indexOf('--patch')+1];const {applyArtifactPatches}=await import('../src/lib/artifact-repair.ts');artifact=applyArtifactPatches(artifact,JSON.parse(fs.readFileSync(patchFile,'utf8')),sourceProject.brief);delete artifact.designSelection;}
  delete artifact.imagePath;delete artifact.imagePaths;delete artifact.previewPaths;delete artifact.quality;
  const {createProjectRecord}=await import('../src/lib/platform.ts');
  const projectId=createProjectRecord({companyId:sourceProject.company_id,creatorId:sourceProject.creator_id,contentType:sourceProject.content_type,brief:sourceProject.brief,status:'queued',artifact});
  const next=newAttempt(caseId,'ola',undefined,{olaBaselineId:before.id});next.projectId=projectId;next.state.companyId=before.state.companyId;next.state.refinementOf=before.id;saveAttempt(next);
  setProjectAiPolicy(next.projectId,{...next.model,strict:true,attemptId:next.id});
  const {recordWorkflowEvent}=await import('../src/lib/workflow-state.ts');recordWorkflowEvent(next.projectId,'system','render-refinement','production','Re-rendering existing approved copy after a measured renderer fix; no new copy draft.',{from:before.id,to:next.id});
  const {db}=await import('../src/lib/platform-db.ts');db().prepare('UPDATE projects SET brand_snapshot_json=? WHERE id=?').run(sourceProject.brand_snapshot_json,next.projectId);enqueue(next.projectId,'improve-simple');
  entry.previousAttempts=[...(entry.previousAttempts??[]),{id:before.id,hash:digest(JSON.stringify(before)),fingerprint:before.fingerprint}];entry.attemptId=next.id;entry.refinementFingerprint=fingerprint();fs.writeFileSync(file,JSON.stringify(manifest,null,2));console.log(JSON.stringify({refinement:next.id,of:before.id,caseId}));
}
const rows=manifest.cases.map(c=>({...c,attempt:getAttempt(c.attemptId)}));
const loaded=labDb().prepare('SELECT fingerprint FROM worker_info WHERE id=1').get()?.fingerprint;if(loaded&&!manifest.executionFingerprint){manifest.executionFingerprint=loaded;manifest.sourceChangedBeforeLaunch=loaded!==manifest.fingerprint;fs.writeFileSync(file,JSON.stringify(manifest,null,2));}
if(process.argv.includes('--answer-known')){
  for(const row of rows.filter(r=>r.attempt.status==='awaiting-input')){
    const q=row.attempt.question?.text??'';let answer;
    if(/audience|tone|voice|Who is this design for|Who will see|Who.*(?:read|for)/i.test(q))answer="For this synthetic benchmark, use the brand's saved audience and tone. These are benchmark harness defaults, recorded separately from the frozen brief; preserve all supplied copy and content constraints.";
    else if(row.format==='carousel'&&/supporting|body copy/i.test(q))answer='Write the supporting copy as the frozen brief directs: 12–28 useful words per page, keeping the six exact ordered headlines and supplied closing action.';
    else if(row.format!=='carousel'&&/carousel|audit labels/i.test(q))answer=`This is one ${row.format}. Keep the supplied copy and required image or diagram. Conditional carousel-only placement instructions do not add content to this single-page deliverable.`;
    if(answer&&!labDb().prepare('SELECT 1 FROM commands WHERE attempt_id=?').get(row.attempt.id)){labDb().prepare('INSERT INTO commands VALUES(?,?,?)').run(crypto.randomUUID(),row.attempt.id,answer);console.log(JSON.stringify({company:row.company,question:q,answer}));}
  }
}
const status={at:new Date().toISOString(),rows:rows.map(r=>({company:r.company,format:r.format,caseId:r.caseId,attemptId:r.attemptId,status:r.attempt.status,stage:r.attempt.stage,error:r.attempt.error,question:r.attempt.question,pages:r.attempt.result?.pages.length??0,quality:r.attempt.result?.quality,projectId:r.attempt.projectId})),counts:rows.reduce((a,r)=>(a[r.attempt.status]=(a[r.attempt.status]??0)+1,a),{}),pages:rows.reduce((n,r)=>n+(r.attempt.result?.pages.length??0),0)};
fs.writeFileSync(path.join(study,'status.json'),JSON.stringify(status,null,2));console.log(JSON.stringify(status));
if(process.argv.includes('--audit')){
  const errors=[];let checks=0;const check=(ok,label)=>{checks++;if(!ok)errors.push(label);};
  const original=new DatabaseSync(path.join(sourceLab,'comparisons.sqlite'),{readOnly:true});
  const {requiredCopyIssues}=await import('../src/lib/artifact-repair.ts');
  for(const row of rows){
    const comparison=getCase(row.caseId),a=row.attempt;
    check(comparison.inputHash===row.inputHash,'Input drift '+row.company);check(a.fingerprint===(row.refinementFingerprint??row.executionFingerprint??manifest.executionFingerprint??manifest.fingerprint),'Source version drift '+row.company);
    check(digest(original.prepare('SELECT record_json FROM attempts WHERE id=?').get(row.baselineId).record_json)===row.baselineHash,'Original baseline changed '+row.company);
    for(const page of row.before)check(digest(fs.readFileSync(page.file))===page.sha256,'Saved baseline image changed');
    for(const asset of comparison.input.assets)check(digest(fs.readFileSync(asset.path))===asset.sha256,'Changed asset '+asset.id);
    for(const old of row.previousAttempts??[])check(digest(JSON.stringify(getAttempt(old.id)))===old.hash,'Previous craft attempt changed');
    check(JSON.stringify(a.model)===JSON.stringify(manifest.model),'Model drift');
    check(a.result?.pages.length===(row.format==='carousel'?6:1),'Missing pages '+row.company);
    if(a.result?.pages.length){const artifact=JSON.parse(fs.readFileSync(path.join(runtime,'cases',row.caseId,a.id,'source.json'),'utf8'));check(requiredCopyIssues(artifact,comparison.input.brief).length===0,'Copy contract '+row.company);check(artifact.artDirection?.directions.length===3,'Missing art directions '+row.company);for(const page of a.result.pages){const expected=row.format==='story'?[1080,1920]:row.format==='poster'?[1240,1754]:[1080,1350];check(page.width===expected[0]&&page.height===expected[1],'Dimensions '+row.company);}}
  }
  original.close();const audit={at:new Date().toISOString(),checks,errors};fs.writeFileSync(path.join(study,'audit.json'),JSON.stringify(audit,null,2));console.log(JSON.stringify(audit));if(errors.length)process.exitCode=1;
}
