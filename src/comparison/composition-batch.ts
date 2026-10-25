import fs from 'node:fs';
import { assertIsolation, providers } from './config';
import { digest, getCase, newAttempt, getAttempt, saveAttempt, event, attemptDir } from './store';
import { db, enqueue, now, projectRow } from '../lib/platform-db';
import { companyStorageDir } from '../lib/platform';
import path from 'node:path';
import { compositionBatchPath, type CompositionBatch } from './composition-report';

assertIsolation();
const file=compositionBatchPath();
if(!fs.existsSync(file))throw new Error('Freeze the existing comparison baselines before queuing this batch.');
const batch=JSON.parse(fs.readFileSync(file,'utf8')) as CompositionBatch;
const provider=providers().find(p=>p.id===batch.models.provider);
if(!provider?.configured||provider.model!==batch.models.model)throw new Error('The configured provider/model differs from the frozen batch.');
const resume=process.argv.includes('--resume-render');
const selected=process.argv.includes('--queue')?batch.cases.filter(c=>!c.attempts.length):batch.cases.filter(c=>c.caseId===process.argv[process.argv.indexOf(resume?'--resume-render':'--rerun')+1]);
if(!selected.length)throw new Error('Use --queue for the first attempts or --rerun CASE_ID for an affected case.');
for(const c of selected){
  const comparison=getCase(c.caseId);
  if(comparison.inputHash!==c.inputHash)throw new Error('Frozen comparison input changed.');
  for(const asset of comparison.input.assets)if(digest(fs.readFileSync(asset.path))!==asset.sha256)throw new Error('Frozen asset bytes changed.');
  if(resume){
    const a=getAttempt(c.attempts.at(-1)!);const p=a.projectId&&projectRow(a.projectId);
    if(a.status!=='failed'||!a.error?.startsWith('No candidate passed rendering:')||a.result?.pages.length||!p)throw new Error('Only a failed local candidate render without output can resume this way.');
    if(a.state.localRenderRecovery)throw new Error('This attempt has already used its local render recovery.');
    const dir=path.join(companyStorageDir(p.company_id),'projects',p.id,'candidates');
    for(const i of [1,2])if(!fs.existsSync(path.join(dir,`candidate-${i}`,'source.json')))throw new Error('Both saved candidate sources are required.');
    const recovery={at:now(),previousError:a.error,previousFinishedAt:a.finishedAt,previousFingerprint:a.fingerprint,candidates:[1,2].map(i=>({index:i,sha256:digest(fs.readFileSync(path.join(dir,`candidate-${i}`,'source.json')))}))};
    fs.writeFileSync(path.join(attemptDir(a),'local-render-recovery.json'),JSON.stringify(recovery,null,2));
    a.state.localRenderRecovery=recovery;event(a,'local-render-recovery',recovery);
    db().prepare("UPDATE projects SET status='generating',updated_at=? WHERE id=?").run(now(),p.id);enqueue(p.id,'resume-composition');
    a.status='queued';a.stage='Resume saved local candidates';a.error=undefined;a.finishedAt=undefined;saveAttempt(a);
    console.log(`${c.company}: resume rendering Ola v${a.version} ${a.id}; no new contender version or planning calls.`);continue;
  }
  if(c.attempts.length>=3)throw new Error('This case has reached the initial run plus two improvement cycles.');
  const a=newAttempt(c.caseId,'ola',undefined,{olaBaselineId:c.baselines.ola.id});
  c.attempts.push(a.id);fs.writeFileSync(file,JSON.stringify(batch,null,2));
  console.log(`${c.company} ${c.format}: Ola v${a.version} ${a.id}`);
}
