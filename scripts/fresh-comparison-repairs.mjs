import fs from 'node:fs';import path from 'node:path';import{createRequire}from'node:module';
const root=process.cwd(),require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(root);const lab=path.join(root,'.data/comparison');Object.assign(process.env,{OLA_ROOT_DIR:root,COMPARISON_DATA_DIR:lab,OLA_DATA_DIR:path.join(lab,'ola'),OLA_DISABLE_MESSAGING:'1'});
const {getCase,getAttempt,newAttempt,saveAttempt,labDb,digest,fingerprint}=await import('../src/comparison/store.ts');
const dir=path.join(lab,'fresh-matrix'),file=path.join(dir,'repairs.json'),batch=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
let repairs;
if(fs.existsSync(file))repairs=JSON.parse(fs.readFileSync(file,'utf8'));
else {
 const records=labDb().prepare('SELECT id,record_json FROM attempts').all();
 repairs={createdAt:new Date().toISOString(),fingerprint:fingerprint(),model:batch.model,originalAttempts:records.map(a=>({id:a.id,hash:digest(a.record_json)})),targets:[]};
 for(const item of batch.cases){const c=getCase(item.id);for(const a of c.attempts){if(a.version!==1)throw Error('Inspect existing reruns before starting this repair batch.');if(c.input.format==='carousel'||['failed','needs-review','interrupted','blocked'].includes(a.status))repairs.targets.push({company:item.company,format:item.format,caseId:c.id,engine:a.engine,baselineId:a.id,inputHash:c.inputHash});}}
 fs.writeFileSync(file,JSON.stringify(repairs,null,2));
 for(const format of ['',...batch.formats.map(f=>'-'+f)])fs.copyFileSync(path.join(dir,`index${format}.html`),path.join(dir,`before-repairs${format}.html`));
 fs.copyFileSync(path.join(dir,'status.json'),path.join(dir,'before-repairs-status.json'));
}
for(const target of repairs.targets)if(target.attemptId)target.fingerprint??=getAttempt(target.attemptId).fingerprint;
repairs.fingerprints=[...new Set([...(repairs.fingerprints??[repairs.fingerprint]),fingerprint()])];repairs.fingerprint=fingerprint();fs.writeFileSync(file,JSON.stringify(repairs,null,2));
const probe=process.argv.includes('--probe');
const probeTargets=[['Vercel','carousel','ola'],['GitHub','carousel','canva-direct']];
for(const target of repairs.targets){
 if(probe&&!probeTargets.some(([company,format,engine])=>company===target.company&&format===target.format&&engine===target.engine))continue;
 if(target.attemptId)continue;
 if(getCase(target.caseId).inputHash!==target.inputHash)throw Error('Frozen input changed.');
 const a=newAttempt(target.caseId,target.engine,batch.model,target.engine==='ola'?{olaBaselineId:target.baselineId}:undefined);a.model=target.engine==='canva-direct'?undefined:batch.model;saveAttempt(a);
 target.attemptId=a.id;target.fingerprint=a.fingerprint;fs.writeFileSync(file,JSON.stringify(repairs,null,2));console.log(JSON.stringify(target));
}
for(const old of repairs.originalAttempts)if(digest(JSON.stringify(getAttempt(old.id)))!==old.hash)throw Error('A previous attempt was modified.');
console.log(JSON.stringify({targets:repairs.targets.length,queued:repairs.targets.filter(t=>t.attemptId).length,fingerprint:repairs.fingerprint}));
