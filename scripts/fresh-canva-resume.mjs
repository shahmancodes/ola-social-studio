import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('.data/comparison/comparisons.sqlite'),batch=JSON.parse(fs.readFileSync('.data/comparison/fresh-matrix/repairs.json')),wait=process.argv.includes('--wait');
const get=id=>JSON.parse(db.prepare('SELECT record_json FROM attempts WHERE id=?').get(id).record_json);
const save=a=>db.prepare('UPDATE attempts SET status=?,record_json=? WHERE id=?').run(a.status,JSON.stringify(a),a.id);
const targets=batch.targets.filter(t=>t.engine!=='ola').sort((a,b)=>Number(b.format==='carousel')-Number(a.format==='carousel'));
let stop=false;
for(const t of targets){
 let a=get(t.attemptId);if(a.status!=='blocked'||!a.state.canvaQuota)continue;
 while(a.status==='blocked'){
  if(a.state.canvaQuota.code!=='credit_quota_cooldown'){console.log(JSON.stringify({held:true,id:a.id,reason:'Canva credits must be restored before retrying'}));stop=true;break;}
  if((a.state.quotaRetryChecks??0)>=3){console.log(JSON.stringify({held:true,id:a.id,reason:'Three bounded credit rechecks exhausted; account action is needed'}));stop=true;break;}
  const holds=db.prepare("SELECT record_json FROM attempts WHERE status='blocked' AND json_extract(record_json,'$.state.canvaQuota.checkAfter')>?").all(Date.now()).map(r=>JSON.parse(r.record_json));
  const checkAfter=Math.max(a.state.canvaQuota.checkAfter??0,...holds.map(a=>a.state.canvaQuota.checkAfter));
  if(Date.now()<checkAfter){console.log(JSON.stringify({waiting:true,company:t.company,engine:t.engine,checkAfter:new Date(checkAfter).toISOString(),serverResetKnown:!!a.state.canvaQuota.serverResetKnown}));if(!wait){stop=true;break;}while(Date.now()<checkAfter)await new Promise(r=>setTimeout(r,Math.min(45000,checkAfter-Date.now())));}
  if(db.prepare("SELECT 1 FROM attempts WHERE engine!='ola' AND status IN ('queued','running','awaiting-input')").get())throw Error('A Canva attempt is already active; do not overlap resumptions.');
  a.state.quotaRetryChecks=(a.state.quotaRetryChecks??0)+1;a.status='queued';a.stage='Continue after credit cooldown';a.error=undefined;a.finishedAt=undefined;
  a.events.push({at:new Date().toISOString(),kind:'quota-recheck',data:{reason:'Previous creation was explicitly rejected, or never started; bounded backoff elapsed'}});save(a);console.log(JSON.stringify({resumed:a.id,company:t.company,format:t.format,engine:t.engine}));
  do{await new Promise(r=>setTimeout(r,5000));a=get(a.id);}while(['queued','running','awaiting-input'].includes(a.status));
  const error=a.events.filter(e=>e.kind==='tool-error'&&['credit_quota_cooldown','credit_quota_exceeded'].includes(e.data.result?._errorMeta?.code)).at(-1);
  if(error&&Date.parse(error.at)>Date.parse(a.events.filter(e=>e.kind==='quota-recheck').at(-1).at)){
   a.status='blocked';a.stage='Canva AI credits unavailable';a.error='Canva explicitly rejected generation: credit quota cooldown is still active. No job was created by this request.';a.state.inFlight=null;a.state.canvaQuota={code:error.data.result._errorMeta.code,observedAt:Date.parse(error.at),checkAfter:Date.parse(error.at)+600000,serverResetKnown:false};a.events.push({at:new Date().toISOString(),kind:'quota-classified',data:{code:a.state.canvaQuota.code,noJobCreated:true}});save(a);console.log(JSON.stringify({held:true,id:a.id,checkAfter:new Date(a.state.canvaQuota.checkAfter).toISOString()}));if(!wait){stop=true;break;}continue;
  }
  console.log(JSON.stringify({id:a.id,status:a.status,pages:a.result?.pages.length??0}));
  if(a.status==='interrupted'){console.log('Uncertain remote operation requires explicit approval; no further resumes.');stop=true;}
  break;
 }
 if(stop)break;
}
db.close();
