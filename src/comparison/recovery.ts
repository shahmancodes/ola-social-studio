import type { Attempt } from './types';
/** A restart may resume polling, but may never repeat a possibly accepted mutation. */
export function canResume(a:Attempt) {
  if(a.engine==='ola')return true;
  if(a.state.inFlight)return false;
  if((a.state.createJob||a.state.brandJob)&&!a.state.designId)return true;
  const last=a.state.lastTool as {name?:string;result?:{job_id?:string}}|undefined;
  return ['create-design','generate-design'].includes(last?.name??'')&&Boolean(last?.result?.job_id)&&!a.state.designId;
}
