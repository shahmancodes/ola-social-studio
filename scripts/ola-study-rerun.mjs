import fs from'node:fs';import path from'node:path';import{createRequire}from'node:module';
const root=process.cwd(),require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(root);const lab=path.join(root,'.data/comparison');Object.assign(process.env,{OLA_ROOT_DIR:root,COMPARISON_DATA_DIR:lab,OLA_DATA_DIR:path.join(lab,'ola'),OLA_DISABLE_MESSAGING:'1'});
const{labDb,getCase,newAttempt,getAttempt,digest,fingerprint}=await import('../src/comparison/store.ts');const dir=path.join(lab,'ola-study'),batch=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8')),file=path.join(dir,'repairs.json');
if(fs.existsSync(file))throw Error('This repair cycle already exists. Preserve its versions rather than create duplicates.');
if(labDb().prepare("SELECT 1 FROM attempts WHERE status IN ('queued','running','awaiting-input')").get())throw Error('Let the initial batch finish before running repairs.');
const source=fingerprint(),worker=labDb().prepare('SELECT fingerprint FROM worker_info WHERE id=1').get();if(worker&&worker.fingerprint!==source)throw Error('Restart the idle worker before queuing this source version.');
const rows=batch.cases.map(item=>({...item,comparison:getCase(item.id)}));
const repair={createdAt:new Date().toISOString(),fingerprint:source,model:batch.model,baselineFingerprint:batch.fingerprint,originalAttempts:rows.flatMap(r=>r.comparison.attempts.map(a=>({id:a.id,hash:digest(JSON.stringify(a))}))),targets:[]};
fs.writeFileSync(file,JSON.stringify(repair,null,2));
for(const r of rows){const baseline=r.comparison.attempts.at(-1);const representative=r.company==='Vercel'&&(r.prompt===2&&r.format==='poster'||r.prompt===1&&['story','carousel'].includes(r.format));if(baseline.status==='complete'&&!representative)continue;
 const a=newAttempt(r.id,'ola',undefined,{olaBaselineId:baseline.id});repair.targets.push({caseId:r.id,company:r.company,prompt:r.prompt,format:r.format,baseline:baseline.id,attemptId:a.id,inputHash:r.inputHash,reason:baseline.error??baseline.result?.quality??'Representative rendering regression check'});fs.writeFileSync(file,JSON.stringify(repair,null,2));console.log(JSON.stringify({company:r.company,prompt:r.prompt,format:r.format,before:baseline.id,after:a.id}));
}
for(const a of repair.originalAttempts)if(digest(JSON.stringify(getAttempt(a.id)))!==a.hash)throw Error('A baseline attempt changed.');console.log(JSON.stringify({targets:repair.targets.length,fingerprint:source,file}));
