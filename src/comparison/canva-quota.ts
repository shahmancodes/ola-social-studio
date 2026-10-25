type Obj=Record<string,unknown>;
const object=(value:unknown):Obj=>value&&typeof value==='object'?value as Obj:{};
export function canvaQuotaRejection(result:Obj,now=Date.now()){
  if(!result.isError)return;
  const code=object(result._errorMeta).code;
  if(code!=='credit_quota_cooldown'&&code!=='credit_quota_exceeded')return;
  const structured=object(result.structuredContent),usage=object(result.quota_usage??structured.quota_usage??object(structured.error).quota_usage??object(result._errorMeta).quota_usage);
  const end=Number(usage.cooldown_ends_at??usage.resets_at)*1000;
  return {code,observedAt:now,checkAfter:Number.isFinite(end)&&end>now?end:now+10*60_000,serverResetKnown:Number.isFinite(end)&&end>now};
}
export class CanvaQuotaError extends Error{
  constructor(readonly quota:NonNullable<ReturnType<typeof canvaQuotaRejection>>){super(`Canva ${quota.code==='credit_quota_cooldown'?'AI credit cooldown is active':'AI credits are exhausted'}. This request was explicitly rejected; its outcome is known. Resume when Canva credits are available.`);this.name='CanvaQuotaError';}
}
