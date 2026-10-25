import fs from'node:fs';import path from'node:path';import crypto from'node:crypto';import{createRequire}from'node:module';
const root=process.cwd(),require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(root);const lab=path.join(root,'.data/comparison');Object.assign(process.env,{OLA_ROOT_DIR:root,COMPARISON_DATA_DIR:lab,OLA_DATA_DIR:path.join(lab,'ola'),OLA_DISABLE_MESSAGING:'1'});
const {getCase,getAttempt,labDb,digest}=await import('../src/comparison/store.ts');const manifest=JSON.parse(fs.readFileSync(path.join(lab,'ola-study/manifest.json'),'utf8'));
const{requiredCopyIssues}=await import('../src/lib/artifact-repair.ts');
const{db:olaDb,projectRow}=await import('../src/lib/platform-db.ts');
let last='';do{
 const rows=manifest.cases.map(c=>({...c,comparison:getCase(c.id)})).map(c=>({...c,attempt:c.comparison.attempts.filter(a=>a.engine==='ola').sort((a,b)=>b.version-a.version)[0]}));
 for(const r of rows.filter(r=>r.attempt.status==='awaiting-input')){
  const question=r.attempt.question?.text??'';
  if(process.argv.includes('--answer-known')&&r.format==='carousel'&&/supporting copy|supporting (?:text|sentence)|body copy/i.test(question)&&!labDb().prepare('SELECT 1 FROM commands WHERE attempt_id=?').get(r.attempt.id)){
   const answer='Draft the supporting copy yourself as the original brief directs: 12–28 useful words per page. Only the six ordered headlines, supplied diagram labels/data/credits, and final CTA are exact supplied copy. Do not ask for additional copy blocks. Preserve the rest of the frozen brief, assets and brand rules.';
   labDb().prepare('INSERT INTO commands VALUES(?,?,?)').run(crypto.randomUUID(),r.attempt.id,answer);console.log(JSON.stringify({answered:r.id,question,answer}));
  }
  const artwork=r.comparison.input.assets.filter(a=>a.category==='artwork'&&a.mediaType.startsWith('image/'));
  if(process.argv.includes('--answer-known')&&r.format!=='carousel'&&/carousel|single.*page|deliverable.*story/i.test(question)&&!labDb().prepare('SELECT 1 FROM commands WHERE attempt_id=?').get(r.attempt.id)){
   const answer=`The deliverable is exactly one ${r.format==='story'?'1080 × 1920 Instagram Story':'1240 × 1754 portrait Poster'}, as the first sentence of the frozen brief specifies. Include the requested visual on that single page. Any placement instruction explicitly scoped to a carousel applies only to the carousel adaptation of this concept; ignore its carousel page number here. Preserve all supplied copy and assets.`;
   labDb().prepare('INSERT INTO commands VALUES(?,?,?)').run(crypto.randomUUID(),r.attempt.id,answer);console.log(JSON.stringify({answered:r.id,question,answer}));
  }
  if(process.argv.includes('--answer-known')&&r.kind!=='data'&&/audit labels/i.test(question)&&r.brief.includes('any semantic diagram labels, exact audit labels')&&!labDb().prepare('SELECT 1 FROM commands WHERE attempt_id=?').get(r.attempt.id)){
   const answer='This concept contains no audit data and requests no audit label. The phrase about any specified audit labels is conditional; none are specified here. Use the exact headline, supporting line, CTA, and explicit diagram labels actually supplied in the frozen brief. Introduce no audit label or data. Continue without another clarification.';
   labDb().prepare('INSERT INTO commands VALUES(?,?,?)').run(crypto.randomUUID(),r.attempt.id,answer);console.log(JSON.stringify({answered:r.id,question,answer}));
  }
  if(process.argv.includes('--answer-known')&&artwork.length===1&&/which.*(?:asset|image)|no image.*listed|(?:provide|identify|select).*image asset|image.*not identified/i.test(question)&&!labDb().prepare('SELECT 1 FROM commands WHERE attempt_id=?').get(r.attempt.id)){
   const shared=r.attempt.events.find(e=>e.kind==='shared-input')?.data,mapped=shared?.assetMapping?.[artwork[0].id];
   if(mapped){const answer=`Use the single selected supplied artwork ${artwork[0].name}, frozen source ID ${artwork[0].id}, isolated company asset ID ${mapped}. Its bytes are already in this company snapshot. Keep it uncropped and retain the exact credit required by the original brief. Do not fetch or invent another image. Continue with the supplied brief and assets.`;labDb().prepare('INSERT INTO commands VALUES(?,?,?)').run(crypto.randomUUID(),r.attempt.id,answer);console.log(JSON.stringify({answered:r.id,question,answer}));}
  }
 }
 const counts={};for(const r of rows)counts[r.attempt.status]=(counts[r.attempt.status]??0)+1;
 const data={at:new Date().toISOString(),counts,pages:rows.reduce((n,r)=>n+(r.attempt.result?.pages.length??0),0),active:rows.filter(r=>['running','awaiting-input'].includes(r.attempt.status)).map(r=>({company:r.company,prompt:r.prompt,format:r.format,stage:r.attempt.stage,question:r.attempt.question})),failures:rows.filter(r=>['failed','blocked','interrupted'].includes(r.attempt.status)).map(r=>({caseId:r.id,company:r.company,prompt:r.prompt,format:r.format,error:r.attempt.error})),rows:rows.map(r=>({caseId:r.id,company:r.company,prompt:r.prompt,name:r.name,kind:r.kind,format:r.format,attempt:r.attempt.id,status:r.attempt.status,source:r.attempt.fingerprint,model:r.attempt.model,quality:r.attempt.result?.quality,pages:r.attempt.result?.pages??[],projectId:r.attempt.projectId}))};
 fs.writeFileSync(path.join(lab,'ola-study/status.json'),JSON.stringify(data,null,2));const signature=JSON.stringify({counts,active:data.active,failures:data.failures});if(signature!==last){console.log(JSON.stringify({...data,rows:undefined}));last=signature;}
 if(!process.argv.includes('--watch')||!rows.some(r=>['queued','running','awaiting-input'].includes(r.attempt.status)))break;await new Promise(r=>setTimeout(r,15000));
}while(true);
if(process.argv.includes('--audit')){
 const problems=[],artifactFindings=[];let checks=0;const check=(ok,why)=>{checks++;if(!ok)problems.push(why);};
 for(const item of manifest.cases){const c=getCase(item.id);check(c.inputHash===item.inputHash,`${c.id}: frozen hash`);check(c.input.mode==='ola'&&c.attempts.every(a=>a.engine==='ola'),`${c.id}: Ola only`);check(JSON.stringify(c.input.model)===JSON.stringify(manifest.model),`${c.id}: model`);
  for(const asset of c.input.assets)check(digest(fs.readFileSync(asset.path))===asset.sha256,`${c.id}: asset bytes`);
  for(const a of c.attempts){
   if(a.projectId){const project=projectRow(a.projectId);check(Boolean(project),`${a.id}: isolated project exists`);const assets=project?olaDb().prepare('SELECT id,disk_path FROM assets WHERE company_id=?').all(project.company_id):[];check(assets.length===c.input.assets.length,`${a.id}: selected assets only`);const mapping=a.events.find(e=>e.kind==='shared-input')?.data?.assetMapping??{};for(const frozen of c.input.assets){const actual=assets.find(asset=>asset.id===mapping[frozen.id]);check(Boolean(actual)&&digest(fs.readFileSync(actual.disk_path))===frozen.sha256,`${a.id}: isolated bytes ${frozen.name}`);}}
   check(a.inputHash===c.inputHash,`${a.id}: attempt hash`);check(JSON.stringify(a.model)===JSON.stringify(manifest.model),`${a.id}: pinned model`);const pages=a.result?.pages??[];if(pages.length){check(pages.length===(item.format==='carousel'?6:1),`${a.id}: page count`);const dim=item.format==='poster'?[1240,1754]:item.format==='story'?[1080,1920]:[1080,1350];check(pages.every(p=>p.width===dim[0]&&p.height===dim[1]),`${a.id}: dimensions`);const source=path.join(lab,'cases',c.id,a.id,'source.json');if(fs.existsSync(source)){const copy=requiredCopyIssues(JSON.parse(fs.readFileSync(source,'utf8')),c.input.brief);if(copy.length){artifactFindings.push({caseId:c.id,attemptId:a.id,status:a.status,issues:copy});if(a.status==='complete')check(false,`${a.id}: completed output has invalid exact copy: ${copy.join('; ')}`);}}}
  }
 }
 const repairFile=path.join(lab,'ola-study/repairs.json');if(fs.existsSync(repairFile)){const repair=JSON.parse(fs.readFileSync(repairFile,'utf8'));for(const old of [...repair.originalAttempts,...repair.savedRepairAttempts??[]])check(digest(JSON.stringify(getAttempt(old.id)))===old.hash,`${old.id}: study baseline version unchanged`);const allowed=new Set([manifest.fingerprint,...repair.fingerprints??[],repair.fingerprint]);for(const c of manifest.cases)for(const a of getCase(c.id).attempts)check(allowed.has(a.fingerprint),`${a.id}: recorded source version`);}
 for(const old of manifest.previousAttempts)check(digest(JSON.stringify(getAttempt(old.id)))===old.hash,`${old.id}: prior attempt unchanged`);
 const report={at:new Date().toISOString(),checks,problems,artifactFindings};fs.writeFileSync(path.join(lab,'ola-study/audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(problems.length)process.exitCode=1;
}
