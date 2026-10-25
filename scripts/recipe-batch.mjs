/** Freeze prior records and inputs before queuing exactly three new Ola attempts. */
import fs from 'node:fs';import path from 'node:path';import {createRequire}from'node:module';
const root=process.cwd(),require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(root);const lab=path.join(root,'.data/comparison');
Object.assign(process.env,{OLA_ROOT_DIR:root,COMPARISON_DATA_DIR:lab,OLA_DATA_DIR:path.join(lab,'ola'),OLA_DISABLE_MESSAGING:'1'});
const {getCase,getAttempt,newAttempt,digest,fingerprint,labDb}=await import('../src/comparison/store.ts');const {providers}=await import('../src/comparison/config.ts');
const dir=path.join(lab,'recipe-live'),file=path.join(dir,'manifest.json');fs.mkdirSync(dir,{recursive:true});
if(fs.existsSync(file))throw new Error('Recipe batch already exists; use its saved attempt IDs instead of silently duplicating generations.');
if(labDb().prepare("SELECT 1 FROM attempts WHERE status IN ('queued','running','awaiting-input')").get())throw new Error('Finish active comparison work before starting this frozen batch.');
const prior=JSON.parse(fs.readFileSync(path.join(lab,'representation-live/manifest.json'),'utf8'));
const cases=prior.cases.map(c=>{
 const comparison=getCase(c.caseId),previous=comparison.attempts.filter(a=>a.engine==='ola'&&a.result?.pages.length&&['complete','needs-review'].includes(a.status)).sort((a,b)=>b.version-a.version)[0];
 if(!previous)throw new Error('Missing saved Ola output.');if(comparison.inputHash!==c.inputHash)throw new Error('The frozen comparison input changed.');
 if(!previous.model||!providers().some(p=>p.id===previous.model.provider&&p.configured))throw new Error('The previous Ola model/provider is unavailable.');
 for(const asset of comparison.input.assets)if(digest(fs.readFileSync(asset.path))!==asset.sha256)throw new Error('Frozen asset bytes changed.');
 for(const a of Object.values(c.baselines))if(digest(JSON.stringify(getAttempt(a.id)))!==digest(JSON.stringify(a)))throw new Error('A saved baseline record changed.');
 return {...c,previousOla:previous,previousRecordHash:digest(JSON.stringify(previous)),freshAttemptId:null,unsuccessfulAttempts:[],assets:comparison.input.assets.map(a=>({id:a.id,sha256:a.sha256,name:a.name})),brandRuleRevision:previous.brandRules?.revision,model:previous.model};
});
const batch={createdAt:new Date().toISOString(),models:cases[0].model,fingerprint:fingerprint(),change:'Eight approved native design recipes; fixed shared process rendering; no new Canva generations.',cases};
fs.writeFileSync(file,JSON.stringify(batch,null,2));
for(const c of batch.cases){const a=newAttempt(c.caseId,'ola',undefined,{olaBaselineId:c.previousOla.id});c.freshAttemptId=a.id;fs.writeFileSync(file,JSON.stringify(batch,null,2));console.log(JSON.stringify({company:c.company,format:c.format,previous:c.previousOla.id,previousVersion:c.previousOla.version,fresh:a.id,version:a.version,model:a.model}));}
