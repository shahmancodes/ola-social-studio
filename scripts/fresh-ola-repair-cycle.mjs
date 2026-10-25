import fs from'node:fs';import path from'node:path';import{createRequire}from'node:module';const root=process.cwd(),require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(root);Object.assign(process.env,{OLA_ROOT_DIR:root,COMPARISON_DATA_DIR:path.join(root,'.data/comparison'),OLA_DATA_DIR:path.join(root,'.data/comparison/ola'),OLA_DISABLE_MESSAGING:'1'});
const{getAttempt,getCase,newAttempt,saveAttempt,labDb,digest,fingerprint}=await import('../src/comparison/store.ts');
const file='.data/comparison/fresh-matrix/repairs.json',r=JSON.parse(fs.readFileSync(file,'utf8'));
if(labDb().prepare("SELECT 1 FROM attempts WHERE status IN ('queued','running','awaiting-input')").get())throw Error('Finish the current attempts before loading another source version.');
if(r.focusedCycle)throw Error('The focused cycle already exists. Preserve its results rather than duplicate it.');
r.attemptFingerprints??={};for(const t of r.targets)if(t.attemptId)r.attemptFingerprints[t.attemptId]=getAttempt(t.attemptId).fingerprint;
r.fingerprints=[...new Set([...(r.fingerprints??[]),fingerprint()])];r.fingerprint=fingerprint();r.focusedCycle={at:new Date().toISOString(),fingerprint:r.fingerprint,targets:[]};
for(const t of r.targets.filter(t=>t.engine==='ola')){
 const before=getAttempt(t.attemptId),issues=before.result?.quality?.issues??[];
 const harness=issues.some(s=>/Visual review unavailable|required exact credit|logo.*(?:one-placement|once in the carousel|all six pages)/i.test(s));
 if(before.status!=='failed'&&!harness)continue;
 if(getCase(t.caseId).inputHash!==t.inputHash)throw Error('Frozen input changed.');
 const a=newAttempt(t.caseId,'ola',undefined,{olaBaselineId:t.baselineId});a.model=r.model;saveAttempt(a);t.previousAttempts=[...(t.previousAttempts??[]),t.attemptId];t.attemptId=a.id;t.fingerprint=a.fingerprint;r.attemptFingerprints[a.id]=a.fingerprint;
 r.focusedCycle.targets.push({company:t.company,format:t.format,before:before.id,after:a.id,reason:before.error??issues});fs.writeFileSync(file,JSON.stringify(r,null,2));
}
for(const old of r.originalAttempts)if(digest(JSON.stringify(getAttempt(old.id)))!==old.hash)throw Error('A pre-repair attempt changed.');
fs.writeFileSync(file,JSON.stringify(r,null,2));console.log(JSON.stringify(r.focusedCycle,null,2));
