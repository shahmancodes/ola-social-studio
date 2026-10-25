import {runComponentJob,recoverComponentJobs} from "./component-jobs";
import {componentJobs} from "../lib/semantic-design-store";
import { withAiRun } from "../lib/ai-execution";
import { startWorkerHeartbeat } from '../lib/worker-heartbeat';
import { reconcileUsage, recoverInterruptedRuns } from "../lib/ai-usage";
import { labDb, getAttempt, getCase, saveAttempt, event, redact, fingerprint } from './store';
import { assertIsolation, canvaBlockReason } from './config';
import { runCanva } from './canva-runner';
import { runFixture } from './fixtures';
import { runOla } from './ola-runner';
import { runOneJob } from '../worker';
import { db } from '../lib/platform-db';
import { pause } from './canva';
import type { Attempt } from './types';
import { contenderInput, contenderId } from './contenders';
import { canResume } from './recovery';
import { CanvaQuotaError } from './canva-quota';
assertIsolation();
const loadedFingerprint = fingerprint();
const database=labDb();
// Only one worker may own recovery and launch attempts in this data directory.
database.exec('BEGIN IMMEDIATE');
const existing=database.prepare('SELECT at FROM heartbeat WHERE id=1').get() as {at:string}|undefined;
if(existing && Date.now()-Date.parse(existing.at)<6000){database.exec('ROLLBACK');throw new Error('A comparison worker is already running.');}
database.prepare('INSERT OR REPLACE INTO heartbeat VALUES(1,?)').run(new Date().toISOString());
database.exec('COMMIT');
database.prepare('INSERT OR REPLACE INTO worker_info VALUES(1,?,?)').run(loadedFingerprint,JSON.stringify({models:true,accounting:true,companies:true,componentDesigner:true}));
const beat=setInterval(()=>database.prepare('INSERT OR REPLACE INTO heartbeat VALUES(1,?)').run(new Date().toISOString()),2000);
recoverInterruptedRuns(true);
recoverComponentJobs();
const controller=new AbortController();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{controller.abort(new Error('Worker stopped'));setTimeout(()=>process.exit(0),3000).unref();});
const active=new Map<string,{attempt:Attempt;promise:Promise<void>}>();
function recover(a:Attempt){
  if(canResume(a)){a.status='queued';saveAttempt(a);return;}
  a.status='interrupted';a.stage='Explicit retry required';a.error='The worker stopped during this attempt. Its saved output is preserved; retry explicitly to avoid duplicate Canva work.';saveAttempt(a);
}
for(const row of database.prepare("SELECT id FROM attempts WHERE status IN ('running','awaiting-input')").all() as {id:string}[])recover(getAttempt(row.id));
// The old worker process is gone; reclaim only this isolated database's jobs.
db().prepare("UPDATE jobs SET status='queued',lease_until=NULL WHERE status='running'").run();
async function execute(a:Attempt){
  const input=contenderInput(getCase(a.caseId).input,contenderId(a));
  const block=a.engine!=='ola'&&!input.fixture?canvaBlockReason():null;
  if(block){a.status='blocked';a.error=block;a.stage='Canva setup required';a.finishedAt=new Date().toISOString();saveAttempt(a);return;}
  a.status='running';a.startedAt??=new Date().toISOString();a.stage='Starting';a.error=undefined;a.fingerprint=loadedFingerprint;saveAttempt(a);
  const limit=new AbortController();
  const abort=()=>limit.abort(controller.signal.reason);controller.signal.addEventListener('abort',abort,{once:true});
  let last=Date.now();
  const timer=setInterval(()=>{const now=Date.now();if(a.status==='running'&&(input.fixture||a.engine!=='ola'))a.activeMs+=now-last;last=now;saveAttempt(a);if(a.engine==='canva-agent'&&a.activeMs>=15*60_000)limit.abort(new Error('AI + Canva exceeded 15 minutes.'));},1000);
  try{
    if(input.fixture)await runFixture(a,input,limit.signal);
    else if(a.engine==='ola')await runOla(a,input,limit.signal);
    else await withAiRun({ stage: 'ai-canva', policy: a.model ? {...a.model, attemptId:a.id, strict:true} : undefined }, () => runCanva(a,input,limit.signal));
  }catch(error){
    if(error instanceof CanvaQuotaError){a.status='blocked';a.stage='Canva AI credits unavailable';a.error=error.message;event(a,'quota-blocked',error.quota);return;}
    a.status=controller.signal.aborted&&canResume(a)?'queued':a.state.inFlight||controller.signal.aborted?'interrupted':'failed';a.stage=a.status==='queued'?'Resume after restart':a.status==='interrupted'?'Explicit retry required':'Failed';
    a.error=String(redact(error instanceof Error?error.message:'Generation failed'));
    if(a.state.inFlight)a.error='Canva may have accepted the last operation. Check the saved design before explicitly retrying. '+a.error;
    event(a,'error',a.error);
  }finally{
    clearInterval(timer);controller.signal.removeEventListener('abort',abort);if(input.fixture||a.engine!=='ola')a.activeMs+=Date.now()-last;if(a.status!=='queued')a.finishedAt=new Date().toISOString();saveAttempt(a);
  }
}
const olaWork=new Set<Promise<unknown>>();
const olaConcurrency=Math.max(1,Math.min(4,Number(process.env.COMPARISON_OLA_CONCURRENCY)||1));
const stopRuntimeHeartbeat=startWorkerHeartbeat(database,'comparison',{concurrency:olaConcurrency,capabilities:['companies','models','accounting','componentDesigner']});
let componentWork:Promise<unknown>|undefined;
let accounting:Promise<unknown>|undefined;let nextAccounting=0;
console.log('Comparison worker ready; ordinary Ola data and WhatsApp are isolated.');
try{
  while(!controller.signal.aborted){
    if(!componentWork&&componentJobs().some(j=>j.status==='queued'))componentWork=runComponentJob().catch(e=>console.error('Component design job failed',e)).finally(()=>{componentWork=undefined;});
    if(!accounting&&Date.now()>nextAccounting){nextAccounting=Date.now()+30000;accounting=reconcileUsage().catch(()=>{}).finally(()=>{accounting=undefined;});}
    while(olaWork.size<olaConcurrency){const work=runOneJob().catch(e=>console.error('Isolated Ola job:',e instanceof Error?e.message:'failed')).finally(()=>olaWork.delete(work));olaWork.add(work);}
    for(const row of database.prepare("SELECT id FROM attempts WHERE status='queued' ORDER BY rowid").all() as {id:string}[]){
      if(active.has(row.id))continue;
      const a=getAttempt(row.id);
      if(a.status!=='queued')continue;
      if(a.engine==='ola'&&[...active.values()].filter(v=>v.attempt.engine==='ola'&&v.attempt.status!=='awaiting-input').length>=olaConcurrency)continue;
      if(a.engine!=='ola'&&!getCase(a.caseId).input.fixture){
        const held=database.prepare("SELECT record_json FROM attempts WHERE status='blocked' AND json_extract(record_json,'$.state.canvaQuota.checkAfter')>? ORDER BY rowid DESC LIMIT 1").get(Date.now()) as {record_json:string}|undefined;
        if(held){const source=JSON.parse(held.record_json) as Attempt;a.status='blocked';a.stage='Canva AI credits unavailable';a.error=source.error;a.state.canvaQuota={...(source.state.canvaQuota as object),notStarted:true};a.finishedAt=new Date().toISOString();event(a,'quota-queue-held',{sourceAttempt:source.id});continue;}
      }
      if([...active.values()].some(v=>(a.engine!=='ola'&&v.attempt.engine!=='ola')))continue;
      const promise=execute(a).finally(()=>active.delete(a.id));active.set(a.id,{attempt:a,promise});
    }
    await pause(500,controller.signal);
  }
}catch(error){if(!controller.signal.aborted)throw error;}
finally{stopRuntimeHeartbeat();clearInterval(beat);database.prepare('DELETE FROM heartbeat WHERE id=1').run();database.prepare('DELETE FROM worker_info WHERE id=1').run();await Promise.allSettled([...active.values()].map(v=>v.promise));}
