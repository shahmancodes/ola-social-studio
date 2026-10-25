import fs from'node:fs';import path from'node:path';import{createRequire}from'node:module';
const root=process.cwd(),require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(root);Object.assign(process.env,{OLA_ROOT_DIR:root,COMPARISON_DATA_DIR:path.join(root,'.data/comparison'),OLA_DATA_DIR:path.join(root,'.data/comparison/ola'),OLA_DISABLE_MESSAGING:'1'});
const{labDb,getAttempt,newAttempt,saveAttempt,digest,fingerprint}=await import('../src/comparison/store.ts');const file='.data/comparison/ola-study/repairs.json',r=JSON.parse(fs.readFileSync(file,'utf8')),source=fingerprint();
if(r.runtimeUpdates?.some(u=>u.kind==='family-recipe-schema'))throw Error('This queue release already exists.');
if(labDb().prepare("SELECT 1 FROM attempts WHERE status IN ('running','awaiting-input')").get())throw Error('Allow active attempts to finish first.');
const worker=labDb().prepare('SELECT fingerprint FROM worker_info WHERE id=1').get();if(worker&&worker.fingerprint!==source)throw Error('Stop the idle old worker before releasing held work.');
r.savedRepairAttempts??=[];r.attemptFingerprints??={};for(const t of r.targets){const a=getAttempt(t.attemptId);r.attemptFingerprints[a.id]=a.fingerprint;}
const update={kind:'family-recipe-schema',at:new Date().toISOString(),before:r.fingerprint,after:source,released:[],retried:[]};
for(const t of r.targets){let a=getAttempt(t.attemptId);
 if(a.status==='failed'){
  r.savedRepairAttempts.push({id:a.id,hash:digest(JSON.stringify(a))});t.previousRepairAttempts=[...(t.previousRepairAttempts??[]),a.id];
  const before=a.id;a=newAttempt(t.caseId,'ola',undefined,{olaBaselineId:t.baseline});t.attemptId=a.id;update.retried.push({caseId:t.caseId,before,after:a.id});
 }else if(a.status==='blocked'&&a.state.batchHold){a.status='queued';a.stage='Queued';delete a.state.batchHold;delete a.error;delete a.finishedAt;a.fingerprint=source;saveAttempt(a);update.released.push(a.id);}
 r.attemptFingerprints[a.id]=a.fingerprint;
}
r.fingerprints=[...new Set([...(r.fingerprints??[]),r.fingerprint,source])];r.fingerprint=source;r.runtimeUpdates=[...(r.runtimeUpdates??[]),update];
for(const old of [...r.originalAttempts,...r.savedRepairAttempts])if(digest(JSON.stringify(getAttempt(old.id)))!==old.hash)throw Error('A saved baseline or repair changed.');fs.writeFileSync(file,JSON.stringify(r,null,2));console.log(JSON.stringify(update));
