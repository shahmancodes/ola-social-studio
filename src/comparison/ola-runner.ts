import { assertRequiredFonts } from "./font-assets";
import {recordWorkflowEvent} from "../lib/workflow-state";
import { setProjectAiPolicy } from "../lib/ai-execution";
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { db, projectRow } from '../lib/platform-db';
import { createCompany, storeCompanyAsset, saveBrand } from '../lib/platform';
import { createIntakeRequest, answerIntake } from '../lib/intake';
import { answerSpecialistQuestion } from '../lib/content-specialists';
import { requestSnapshot } from '../lib/request-workspace';
import { workflowEvents } from '../lib/workflow-state';
import { assertIsolation, providers } from './config';
import { labDb, event, saveAttempt, attemptDir } from './store';
import { sharedBrief, sourceBrief, type Attempt, type SharedInput } from './types';
import { pause } from './canva';
import { contenderInput, contenderId } from './contenders';
export async function startOla(a:Attempt,input:SharedInput) {
  input=contenderInput(input,contenderId(a));
  assertIsolation();
  if(!providers().some(p=>p.configured))throw new Error('Configure an AI provider for live Ola generation, or use fixture mode.');
  if(a.projectId)return;
  assertRequiredFonts(input.brand, input.assets, a.brandRules?.rules ?? input.brand.designSystem);
  // Recover a committed project if the process stopped before saving its lab record.
  const recovered=db().prepare("SELECT project_id FROM project_ai_policy WHERE json_extract(policy_json,'$.attemptId')=?").get(a.id) as {project_id:string}|undefined;
  if(recovered){a.projectId=recovered.project_id;a.state.companyId=projectRow(a.projectId)?.company_id;saveAttempt(a);return;}
  const configured=providers().find(p=>p.id===(process.env.AI_GATEWAY_API_KEY?'vercel':'openrouter'))!;
  a.model??={provider:configured.id as 'vercel'|'openrouter',model:configured.model};
  const database=db();
  let owner=(database.prepare("SELECT id FROM users WHERE email='comparison@localhost.invalid'").get() as {id:string}|undefined)?.id;
  if(!owner){owner=crypto.randomUUID();database.prepare('INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'comparison@localhost.invalid','disabled',new Date().toISOString());}
  const companyId=createCompany(input.companyName,owner,input.brand);
  const mapping:Record<string,string>={};
  for(const asset of input.assets)mapping[asset.id]=await storeCompanyAsset(companyId,asset.name,fs.readFileSync(asset.path),asset.mediaType,asset.category,{sourceUrl:asset.sourceUrl,rightsNote:asset.rightsNote},asset.role==='supporting'?'supporting':'primary');
  saveBrand(companyId,{...input.brand,library:input.brand.library?{...input.brand.library,sources:input.brand.library.sources.map(s=>({...s,assetId:s.assetId?mapping[s.assetId]:undefined}))}:undefined,sourceAssetAliases:mapping,designSystem:a.brandRules?.rules??input.brand.designSystem,logoAssetId:mapping[input.brand.logoAssetId??'']??null,wordmarkAssetId:mapping[input.brand.wordmarkAssetId??'']??null,artworkAssetIds:input.brand.artworkAssetIds.map(id=>mapping[id]).filter(Boolean),fontAssetIds:input.brand.fontAssetIds.map(id=>mapping[id]).filter(Boolean)});

  if(a.brandRules)event(a,"brand-rules-applied",a.brandRules);
  database.exec('BEGIN IMMEDIATE');
  try {
    a.projectId=createIntakeRequest(companyId,owner,sourceBrief(input));
    if(a.state.designFeedback)recordWorkflowEvent(a.projectId,"system","sentinel-baseline-feedback","production","Saved QA findings for the component gap assessor.",a.state.designFeedback);
    if(Array.isArray(a.state.designLessons)&&a.state.designLessons.length)recordWorkflowEvent(a.projectId,"system","human-design-lessons","production","Frozen human preferences for this company and format. Style evidence only.",a.state.designLessons);
    if (a.model) setProjectAiPolicy(a.projectId, { ...a.model, strict: input.mode === 'models'||input.mode==='ola', attemptId: a.id });
    database.exec('COMMIT');
  } catch(error) { database.exec('ROLLBACK'); throw error; }
  a.state.companyId=companyId;saveAttempt(a);event(a,'shared-input',{inputHash:a.inputHash,brief:sharedBrief(input),intakeBrief:sourceBrief(input),assetMapping:mapping});
}
async function capture(a:Attempt) {
  const row=projectRow(a.projectId!);if(!row?.artifact_json)return;
  const artifact=JSON.parse(row.artifact_json);
  const paths:string[]=artifact.imagePaths??(artifact.imagePath?[artifact.imagePath]:[]);
  if(!paths.length)return;
  const pages=[];const sources:string[]=[];
  for(const [index,source] of paths.entries()) {
    if(!fs.existsSync(source))continue;
    const file=path.join(attemptDir(a),`ola-${index+1}.png`);
    const svg=source.replace(/\.png$/,'.svg');if(fs.existsSync(svg)){const target=path.join(attemptDir(a),`ola-${index+1}.svg`);fs.copyFileSync(svg,target);sources.push(target);}
    fs.copyFileSync(source,file);const meta=await sharp(file).metadata();pages.push({file,width:meta.width!,height:meta.height!});
  }
  fs.writeFileSync(path.join(attemptDir(a),"source.json"),JSON.stringify(artifact,null,2));
  a.result={pages,sources,renderEvidence:artifact.renderEvidence,caption:artifact.caption,quality:artifact.quality};
}
export async function runOla(a:Attempt,input:SharedInput,signal:AbortSignal) {
  await startOla(a,input);
  let lastVersion='';
  for(;;){
    signal.throwIfAborted();
    const runs=db().prepare('SELECT started_at,finished_at FROM ai_runs WHERE project_id=?').all(a.projectId!) as {started_at:string;finished_at:string|null}[];
    a.activeMs=runs.reduce((total,run)=>total+Math.max(0,Date.parse(run.finished_at??new Date().toISOString())-Date.parse(run.started_at)),0);
    const commands=labDb().prepare('SELECT id,answer FROM commands WHERE attempt_id=?').all(a.id) as {id:string;answer:string}[];
    for(const command of commands){
      const row=projectRow(a.projectId!);
      try{
        if(row?.content_type==='intake')answerIntake(a.projectId!,command.answer);else answerSpecialistQuestion(a.projectId!,command.answer);
        event(a,'answer',command.answer);a.question=undefined;a.status='running';a.stage='Continuing Ola';
      }catch(e){event(a,'answer-rejected',e instanceof Error?e.message:'Answer rejected');}
      labDb().prepare('DELETE FROM commands WHERE id=?').run(command.id);
    }
    const snapshot=await requestSnapshot(a.projectId!);const row=projectRow(a.projectId!)!;
    a.question=snapshot.question??undefined;
    a.status=snapshot.question?'awaiting-input':'running';
    a.stage=snapshot.question?'Ola needs a detail':snapshot.events.at(-1)?.stage || snapshot.status;
    const version=`${row.version}:${row.updated_at}:${snapshot.status}`;
    if(version!==lastVersion){await capture(a);lastVersion=version;}
    if(['complete','needs-review','failed','coming-soon','stopped'].includes(snapshot.status)){
      a.status=snapshot.status==='complete'?'complete':snapshot.status==='needs-review'?'needs-review':'failed';
      a.error=snapshot.failure??(a.status==='failed'?`Ola ended with status ${snapshot.status}.`:undefined);
      a.stage=a.status==='needs-review'?'QA needs review':a.status==='complete'?'Complete':'Failed';
      event(a,'ola-workflow',workflowEvents(a.projectId!));await capture(a);saveAttempt(a);return;
    }
    saveAttempt(a);await pause(1000,signal);
  }
}
