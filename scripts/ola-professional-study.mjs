// Authorized isolated live pipeline evaluations; saved inputs and baselines stay read-only.
// Prepare: node --import tsx scripts/ola-professional-study.mjs --prepare
// Run once: node --import tsx scripts/ola-professional-study.mjs --run <absolute-study-directory>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';

const root=process.env.OLA_STUDY_CODE_ROOT??process.cwd(),args=process.argv.slice(2),lab=process.env.OLA_STUDY_LAB_ROOT??path.join(root,'.data/comparison');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const launchFlag=args.includes('--continue-remaining')?'--continue-remaining':'--run';
const dir=args.includes('--prepare')?path.join(lab,'professional-study',crypto.randomUUID()):path.resolve(args[args.indexOf(launchFlag)+1]??'');
if(!dir.startsWith(path.join(lab,'professional-study')+path.sep))throw Error('Use an isolated professional-study directory.');
const runtime=path.join(dir,'runtime'),manifestFile=path.join(dir,'manifest.json');
const write=value=>fs.writeFileSync(manifestFile,JSON.stringify(value,null,2)+'\n');
Object.assign(process.env,{OLA_ROOT_DIR:root,COMPARISON_DATA_DIR:runtime,COMPARISON_SOURCE_DATA_DIR:process.env.OLA_STUDY_SOURCE_DATA_DIR??path.join(root,'.data'),OLA_DATA_DIR:path.join(runtime,'ola'),OLA_DISABLE_MESSAGING:'1',OLA_ASSET_ACQUISITION:process.env.OLA_STUDY_ASSET_ACQUISITION==='enabled'?'enabled':'disabled'});
const {insertCase,getCase,getAttempt,saveAttempt,labDb,fingerprint}=await import('../src/comparison/store.ts');
const executionFingerprint=()=>process.env.OLA_STUDY_FROZEN_SOURCE==='1'?'snapshot/'+fingerprint().split('/').at(-1):fingerprint();
if(args.includes('--prepare')){
 fs.mkdirSync(dir,{recursive:true});
 const m={createdAt:new Date().toISOString(),status:'prepared',fingerprint:executionFingerprint(),authorization:'User approved up to three fresh tests: synthetic GitHub carousel, Mozilla Story, GitLab poster, saved GPT-6 Luna through Vercel AI Gateway. Standard bounded pipeline retries and repairs belong to each test; no additional attempts or paid studies authorized.',model:{provider:'vercel',model:'openai/gpt-6-luna'},cases:[]};
 for(const [study,company,format]of [['semantic-designer-study','GitHub','carousel'],['textbox-study','Mozilla','story'],['craft-study','GitLab','poster']]){
  const prior=JSON.parse(fs.readFileSync(path.join(lab,study,'manifest.json'))),sample=prior.cases.find(c=>c.company===company&&c.format===format);
  const sourceRuntime=study==='semantic-designer-study'?lab:path.join(lab,study,'runtime');
  const databaseFile=path.join(sourceRuntime,'comparisons.sqlite'),source=new DatabaseSync(databaseFile,{readOnly:true});
  const original=source.prepare('SELECT input_json FROM cases WHERE id=?').get(sample.caseId).input_json;
  const baselineId=sample.afterAttemptId??sample.attemptId,baseline=source.prepare('SELECT record_json FROM attempts WHERE id=?').get(baselineId).record_json;
  const input=JSON.parse(original),caseId=crypto.randomUUID(),assetDir=path.join(runtime,'cases',caseId,'inputs');fs.mkdirSync(assetDir,{recursive:true});
  const assets=input.assets.map(a=>{assert.ok(['logo','wordmark','font','reference'].includes(a.category),'Only public brand assets are approved.');const bytes=fs.readFileSync(a.path);assert.equal(hash(bytes),a.sha256);const target=path.join(assetDir,a.id+path.extname(a.path));fs.writeFileSync(target,bytes,{flag:'wx'});return{...a,path:target};});
  Object.assign(input,{assets,mode:'ola',fixture:false,model:m.model});delete input.models;delete input.companies;
  const comparison=insertCase(caseId,input),attempt=comparison.attempts[0];
  assert.equal(comparison.attempts.length,1);attempt.brandRules=JSON.parse(baseline).brandRules;attempt.state.assetAcquisition='disabled';saveAttempt(attempt);
  fs.writeFileSync(path.join(dir,company.toLowerCase()+'-input.json'),JSON.stringify(input,null,2));
  m.cases.push({company,format,caseId,attemptId:attempt.id,databaseFile,sourceCaseId:sample.caseId,sourceInputHash:hash(original),baselineId,baselineHash:hash(baseline),inputHash:comparison.inputHash,sourceAssets:JSON.parse(original).assets.map(a=>({path:a.path,sha256:a.sha256})),baselinePages:(JSON.parse(baseline).result?.pages??[]).map(p=>({file:p.file,sha256:hash(fs.readFileSync(p.file))}))});source.close();write(m);
 }
 console.log(JSON.stringify({dir,status:m.status,cases:m.cases.map(c=>({company:c.company,format:c.format}))}));labDb().close();process.exit(0);
}
if(!args.includes('--run')&&!args.includes('--continue-remaining'))throw Error('Choose --prepare, --run or --continue-remaining.');
const m=JSON.parse(fs.readFileSync(manifestFile));
if(m.packetFile){
 const packet=JSON.parse(fs.readFileSync(m.packetFile));assert.equal(packet.authorization.approved,true,'Fresh provider tests require explicit user approval.');assert.equal(m.cases.length,packet.authorization.maximumTests);assert.equal(new Set(m.cases.map(c=>c.packetCaseId)).size,m.cases.length);
 for(const row of m.cases){const approved=packet.cases.find(c=>c.id===row.packetCaseId);assert(approved);assert.equal(hash(JSON.stringify(JSON.parse(fs.readFileSync(approved.inputFile)))),row.packetInputHash);assert.equal(approved.inputHash,row.packetInputHash);}
}
if(launchFlag==='--run'){
 assert.equal(m.status,'prepared','This approved batch may only be launched once. Preserve failures; do not spend another test on an automatic rerun.');
 assert.equal(executionFingerprint(),m.fingerprint,'Production sources changed after preparing the study.');
}else{
 assert.ok(['running','interrupted'].includes(m.status),'Only an interrupted batch can continue unstarted cases.');
 for(const row of m.cases){const a=getAttempt(row.attemptId);if(a.startedAt)assert.ok(['complete','needs-review','failed'].includes(a.status),'A previously started case is still active. Never launch a duplicate.');}
}
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.env.OLA_STUDY_ENV_ROOT??root);
const {runOla}=await import('../src/comparison/ola-runner.ts');
const {runOneJob}=await import('../src/worker.ts');
const {db}=await import('../src/lib/platform-db.ts');
const {usageSummary}=await import('../src/lib/ai-usage.ts');
const {requiredCopyIssues}=await import('../src/lib/artifact-repair.ts');
m.status='running';m.startedAt??=new Date().toISOString();write(m);
for(const row of m.cases){
 const a=getAttempt(row.attemptId),input=getCase(row.caseId).input,controller=new AbortController();
 if(a.startedAt){
  const usage=usageSummary({projectId:a.projectId});
  Object.assign(row,{status:a.status,error:a.error,projectId:a.projectId,quality:a.result?.quality,pages:a.result?.pages,usage:{calls:usage.calls,costUsd:usage.costUsd,incomplete:usage.incomplete},finishedAt:a.finishedAt});write(m);continue;
 }
 assert.equal(a.status,'queued');assert.deepEqual(a.model,m.model);a.status='running';a.startedAt=new Date().toISOString();a.fingerprint=executionFingerprint();row.executionFingerprint=a.fingerprint;saveAttempt(a);
 row.startedAt=a.startedAt;write(m);console.log(JSON.stringify({company:row.company,status:'starting'}));
 let settled=false,lastStage='',answers=0,error;
 const monitor=runOla(a,input,controller.signal).catch(e=>{error=e;}).finally(()=>{settled=true;});
 try{
  while(!settled){
   if(Date.now()-Date.parse(a.startedAt)>30*60_000)throw Error('Study case exceeded 30 minutes; saved work preserved.');
   if(a.stage!==lastStage){lastStage=a.stage;console.log(JSON.stringify({company:row.company,status:a.status,stage:lastStage}));}
   if(a.status==='awaiting-input'){
    if(answers>=2)throw Error('Fixture required more than two clarification responses.');
    const answer=m.clarificationAnswer??'All decisions are supplied in the frozen brief and brand. Use the saved brand audience and voice for this private educational evaluation. For the GitHub carousel, write the requested useful supporting copy. For a single page, conditional carousel placement instructions do not add another page or prose. Preserve the exact supplied visible copy and constraints; choose remaining design details autonomously.';
    labDb().prepare('INSERT INTO commands VALUES(?,?,?)').run(crypto.randomUUID(),a.id,answer);answers++;row.clarifications=[...(row.clarifications??[]),{question:a.question,answer}];write(m);
    // Let the workflow monitor consume this response before asking again.
    await new Promise(r=>setTimeout(r,1100));
   }
   if(!await runOneJob())await new Promise(r=>setTimeout(r,300));
  }
  await monitor;if(error)throw error;
 }catch(e){controller.abort(e);await monitor;a.status='failed';a.error=e instanceof Error?e.message:String(e);a.stage='Study stopped';}
 a.finishedAt=new Date().toISOString();saveAttempt(a);
 const usage=usageSummary({projectId:a.projectId});
 Object.assign(row,{status:a.status,error:a.error,projectId:a.projectId,quality:a.result?.quality,pages:a.result?.pages,usage:{calls:usage.calls,costUsd:usage.costUsd,incomplete:usage.incomplete},clarificationCount:answers,finishedAt:a.finishedAt});
 const sourceFile=path.join(runtime,'cases',row.caseId,a.id,'source.json');
 if(fs.existsSync(sourceFile)){row.copyIssues=requiredCopyIssues(JSON.parse(fs.readFileSync(sourceFile)),input.brief);row.sourceFile=sourceFile;}
 const source=new DatabaseSync(row.databaseFile,{readOnly:true});
 assert.equal(hash(source.prepare('SELECT input_json FROM cases WHERE id=?').get(row.sourceCaseId).input_json),row.sourceInputHash);
 assert.equal(hash(source.prepare('SELECT record_json FROM attempts WHERE id=?').get(row.baselineId).record_json),row.baselineHash);source.close();
 for(const asset of [...row.sourceAssets,...input.assets])assert.equal(hash(fs.readFileSync(asset.path)),asset.sha256);
 for(const page of row.baselinePages)assert.equal(hash(fs.readFileSync(page.file)),page.sha256);
 assert.equal(getCase(row.caseId).inputHash,row.inputHash);
 row.baselineAudit='Passed: original input, attempt, image and asset hashes unchanged.';
 row.finishedFingerprint=executionFingerprint();row.sourceDrift=row.finishedFingerprint!==row.executionFingerprint;
 write(m);console.log(JSON.stringify({company:row.company,status:row.status,quality:row.quality,usage:row.usage}));
 if(row.sourceDrift&&m.cases.some(c=>!getAttempt(c.attemptId).startedAt)){m.status='interrupted';m.interruption='Sources changed during a case; the case result is preserved and cannot be rerun. Continue only unstarted approved cases after inspecting the change.';write(m);throw Error(m.interruption);}
}
m.status='finished';m.finishedAt=new Date().toISOString();write(m);db().close();labDb().close();console.log(JSON.stringify({dir,status:m.status}));
