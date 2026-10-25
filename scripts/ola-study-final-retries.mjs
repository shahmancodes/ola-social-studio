import fs from'node:fs';import path from'node:path';import{createRequire}from'node:module';
const root=process.cwd(),require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(root);Object.assign(process.env,{OLA_ROOT_DIR:root,COMPARISON_DATA_DIR:path.join(root,'.data/comparison'),OLA_DATA_DIR:path.join(root,'.data/comparison/ola'),OLA_DISABLE_MESSAGING:'1'});
const{labDb,getCase,getAttempt,newAttempt,digest,fingerprint}=await import('../src/comparison/store.ts');const file='.data/comparison/ola-study/repairs.json',r=JSON.parse(fs.readFileSync(file,'utf8')),source=fingerprint();
const cycleKey=process.argv.includes('--stage-boundary')?'stageBoundaryCycle':process.argv.includes('--closure')?'closureCycle':'finalCycle';if(r[cycleKey])throw Error('This contract/provider retry cycle already exists.');
if(labDb().prepare("SELECT 1 FROM attempts WHERE status IN ('queued','running','awaiting-input')").get())throw Error('Finish the active attempts first.');
const worker=labDb().prepare('SELECT fingerprint FROM worker_info WHERE id=1').get();if(worker&&worker.fingerprint!==source)throw Error('Restart the idle worker before creating this cycle.');
r[cycleKey]={at:new Date().toISOString(),fingerprint:source,targets:[]};r.savedRepairAttempts??=[];r.attemptFingerprints??={};
for(const t of r.targets){const before=getAttempt(t.attemptId);r.attemptFingerprints[before.id]=before.fingerprint;if(before.status!=='failed')continue;
 const c=getCase(t.caseId);if(c.input.mode!=='ola'||c.inputHash!==t.inputHash)throw Error('Frozen Ola-only input changed.');
 r.savedRepairAttempts.push({id:before.id,hash:digest(JSON.stringify(before))});const a=newAttempt(t.caseId,'ola',undefined,{olaBaselineId:t.baseline});t.previousRepairAttempts=[...(t.previousRepairAttempts??[]),before.id];t.attemptId=a.id;r.attemptFingerprints[a.id]=a.fingerprint;
 r[cycleKey].targets.push({caseId:t.caseId,company:t.company,prompt:t.prompt,format:t.format,before:before.id,after:a.id,reason:before.error,category:/gateway|timeout|aborted/i.test(before.error??'')?'provider execution':'planning contract'});
}
r.fingerprints=[...new Set([...(r.fingerprints??[]),r.fingerprint,source])];r.fingerprint=source;
for(const old of [...r.originalAttempts,...r.savedRepairAttempts])if(digest(JSON.stringify(getAttempt(old.id)))!==old.hash)throw Error('A saved attempt changed.');fs.writeFileSync(file,JSON.stringify(r,null,2));console.log(JSON.stringify({targets:r[cycleKey].targets.length,categories:r[cycleKey].targets.reduce((n,t)=>(n[t.category]=(n[t.category]??0)+1,n),{}),source}));
