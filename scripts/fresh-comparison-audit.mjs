import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {isDeepStrictEqual} from 'node:util';

const root=process.cwd(), require=createRequire(import.meta.url);
require('@next/env').loadEnvConfig(root);
const lab=path.join(root,'.data/comparison');
Object.assign(process.env,{OLA_ROOT_DIR:root,COMPARISON_DATA_DIR:lab,OLA_DATA_DIR:path.join(lab,'ola'),OLA_DISABLE_MESSAGING:'1'});
const {getCase,getAttempt,digest,fingerprint,redact}=await import('../src/comparison/store.ts');
const {db}=await import('../src/lib/platform-db.ts');
const {sharedBrief}=await import('../src/comparison/types.ts');
const {usageSummary}=await import('../src/lib/ai-usage.ts');
const {suppliedCopyIssues}=await import('../src/lib/content-representation.ts');
const sharp=(await import('sharp')).default;
const dir=path.join(lab,'fresh-matrix'),batch=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
const repairFile=path.join(dir,'repairs.json'),repairs=fs.existsSync(repairFile)?JSON.parse(fs.readFileSync(repairFile,'utf8')):undefined;
const checks=[],problems=[],outcomes=[];
function check(name,ok,detail){(ok?checks:problems).push({name,...(detail?{detail}:{})});}
check('21 cases covering seven companies and three active formats',batch.cases.length===21&&batch.companies.length===7&&batch.formats.length===3);
check('All new briefs are distinct',new Set(batch.cases.map(c=>c.brief)).size===21);
check('Generation source remains frozen',fingerprint()===(repairs?.fingerprint??batch.fingerprint));
const previousBriefs=new Set(batch.oldCases.map(c=>getCase(c.id).input.brief));
const previousDesigns=new Set(batch.oldAttempts.map(a=>getAttempt(a.id).state.designId).filter(Boolean)),newDesigns=new Set();
for(const old of repairs?.originalAttempts??[])check('Pre-repair attempt preserved: '+old.id,digest(JSON.stringify(getAttempt(old.id)))===old.hash);
for(const old of batch.oldCases)check('Earlier input preserved: '+old.id,getCase(old.id).inputHash===old.inputHash);
for(const old of batch.oldAttempts)check('Earlier attempt preserved: '+old.id,digest(JSON.stringify(getAttempt(old.id)))===old.hash);
for(const item of batch.cases){
 const c=getCase(item.id),label=item.company+' / '+item.format;
 check(label+': fresh brief',!previousBriefs.has(c.input.brief)&&c.input.brief===item.brief);
 check(label+': immutable input',digest(JSON.stringify(c.input))===item.inputHash&&c.inputHash===item.inputHash);
 check(label+': shared frozen brand',isDeepStrictEqual(c.input.brand,item.brand));
 check(label+': one initial attempt per contender',['canva-direct','canva-agent','ola'].every(e=>c.attempts.filter(a=>a.engine===e&&a.version===1).length===1));
 check(label+': complete source asset set',JSON.stringify(c.input.assets.map(a=>({id:a.id,name:a.name,sha256:a.sha256})))===JSON.stringify(item.sourceAssetHashes));
 for(const asset of c.input.assets){check(label+': asset bytes '+asset.name,digest(fs.readFileSync(asset.path))===asset.sha256);check(label+': isolated asset path '+asset.name,asset.path.startsWith(path.join(lab,'cases',c.id,'inputs')+path.sep));}
 for(const a of c.attempts){
  check(label+': identical contender input '+a.engine,a.inputHash===c.inputHash);
  check(label+': frozen model '+a.engine,a.engine==='canva-direct'||JSON.stringify(a.model)===JSON.stringify(batch.model));
  if(a.engine!=='canva-direct'){
   const usage=usageSummary(a.engine==='ola'?{projectId:a.projectId}:{attemptId:a.id});
   check(label+': recorded model requests '+a.engine,usage.records.every(r=>r.provider===batch.model.provider&&r.requestedModel===batch.model.model),JSON.stringify([...new Set(usage.records.map(r=>r.provider+'/'+r.requestedModel))]));
  }
  check(label+': traceable source '+a.engine,a.fingerprint===(a.version===1?batch.fingerprint:(repairs?.attemptFingerprints?.[a.id]??repairs?.targets.find(t=>t.attemptId===a.id)?.fingerprint)));
  if(a.state.designId){check(label+': fresh Canva design '+a.engine,!previousDesigns.has(a.state.designId)&&!newDesigns.has(a.state.designId));newDesigns.add(a.state.designId);}
  const pages=a.result?.pages??[],dimensions=[];
  for(const p of pages){const m=await sharp(p.file).metadata();check(label+': preserved artifact dimensions '+a.engine,m.width===p.width&&m.height===p.height);check(label+': durable artifact '+a.engine,p.file.startsWith(path.join(lab,'cases',c.id,a.id)+path.sep));dimensions.push([m.width,m.height]);}
  const expected=item.format==='poster'?[1240,1754]:item.format==='story'?[1080,1920]:[1080,1350];
  if(a.version>1&&['complete','needs-review'].includes(a.status)){
   check(label+': repaired page count '+a.engine,pages.length===(item.format==='carousel'?6:1));
   check(label+': repaired canvas dimensions '+a.engine,dimensions.every(d=>d[0]===expected[0]&&d[1]===expected[1]));
   if(a.engine==='ola'){
    const source=path.join(lab,'cases',c.id,a.id,'source.json');
    check(label+': repaired supplied copy',fs.existsSync(source)&&suppliedCopyIssues(JSON.parse(fs.readFileSync(source,'utf8')),c.input.brief).length===0);
   }
  }
  outcomes.push({company:item.company,format:item.format,caseId:c.id,attemptId:a.id,engine:a.engine,version:a.version,status:a.status,pages:pages.length,dimensions,formatMismatch:pages.length>0&&(pages.length!==(item.format==='carousel'?6:1)||dimensions.some(d=>d[0]!==expected[0]||d[1]!==expected[1])),error:a.error});
  if(a.engine==='ola'&&a.state.companyId){
   const shared=a.events.find(e=>e.kind==='shared-input')?.data;
   check(label+': Ola received frozen brief',shared?.brief===redact(sharedBrief(c.input))&&shared?.inputHash===c.inputHash);
   const isolated=db().prepare('SELECT id,name,disk_path FROM assets WHERE company_id=? ORDER BY id').all(a.state.companyId),mapping=shared?.assetMapping??{};
   const company=db().prepare('SELECT brand_json FROM companies WHERE id=?').get(a.state.companyId);
   check(label+': Ola uses the shared brand rules',!!company&&isDeepStrictEqual(JSON.parse(company.brand_json).designSystem,c.input.brand.designSystem));
   check(label+': Ola has only selected company assets',isolated.length===c.input.assets.length&&isolated.every(s=>Object.values(mapping).includes(s.id)));
   for(const asset of c.input.assets){const s=isolated.find(s=>s.id===mapping[asset.id]);check(label+': isolated Ola bytes '+asset.name,!!s&&digest(fs.readFileSync(s.disk_path))===asset.sha256);}
  }
 }
}
const audit={at:new Date().toISOString(),batchId:batch.id,fingerprint:batch.fingerprint,passed:checks.length,problems,outcomes};
fs.writeFileSync(path.join(dir,'audit.json'),JSON.stringify(audit,null,2));
console.log(JSON.stringify({at:audit.at,passed:audit.passed,problems:audit.problems,attempts:outcomes.length,rendered:outcomes.filter(o=>o.pages).length,mismatches:outcomes.filter(o=>o.formatMismatch).map(o=>({company:o.company,format:o.format,engine:o.engine,pages:o.pages,dimensions:o.dimensions}))},null,2));
if(problems.length)process.exitCode=1;
