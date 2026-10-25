import {listComponentCandidates,getComponentCandidate,reviewComponentCandidate,queueComponentJob,componentJobs,componentCandidateDir} from "@ola/lib/semantic-design-store";
import {COMPONENT_FORMATS} from "@ola/lib/semantic-design";
import {intentReport} from "../../../../../src/comparison/intent-report";
import { craftReport, craftReportFile, saveCraftReview } from '@ola/comparison/craft-report';
import {responsiveReport,responsiveProofFile} from '@ola/comparison/responsive-report';
import {olaStudyReport} from '@ola/comparison/ola-study-report';
import fs from 'node:fs';
import {posterReport} from '@ola/comparison/poster-report';
import {compositionReport,compositionBatchPath,type CompositionBatch} from '@ola/comparison/composition-report';
import crypto from 'node:crypto';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertLocal, canvaBlockReason, providers, LAB_DIR } from '@ola/comparison/config';
import { createComparison, sourceCatalog } from '@ola/comparison/inputs';
import { brandRuleHistory, saveBrandRules, labDb, getCase, getAttempt, listCases, newAttempt, publicCase, redact } from '@ola/comparison/store';
import { beginOAuth, completeOAuth, connected } from '@ola/comparison/canva';
import { ModelSchema, engines, comparisonContenders, contenderId } from '@ola/comparison/types';
import { modelCatalog } from '@ola/comparison/model-catalog';
import { DESIGN_RECIPE_IDS } from '@ola/lib/design-recipes';
import { sentinelUsage } from '@ola/comparison/sentinel-usage';
import { sentinelLibrary } from '@ola/comparison/sentinel-library';
import { sentinelHealth } from '@ola/comparison/sentinel-health';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'cache-control':'no-store'}});
async function handle(request:Request,context:{params:Promise<{path:string[]}>}){
  try{
    assertLocal(request);
    const {path:parts}=await context.params;const [area,id,action]=parts;
    if(request.method==='GET'){
      if(area==='health')return json(sentinelHealth());
      if(area==='craft-report'||area==='asset-report'||area==='textbox-report'){
        const study=area==='textbox-report'?'textbox-study':area==='asset-report'?'asset-study':'craft-study';
        if(id==='image'){const q=new URL(request.url).searchParams,file=craftReportFile(q.get('case')??'',q.get('variant')??'',Number(q.get('page')),study);return new Response(fs.readFileSync(file),{headers:{'content-type':'image/png','cache-control':'no-store'}});}
        return new Response(craftReport(study),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
      }
      if(area==='usage')return json(sentinelUsage());
      if(area==='library')return json(sentinelLibrary());
      if(area==='ola-study-report')return new Response(olaStudyReport(new URL(request.url).searchParams),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
      if(area==='fresh-comparison-report'){
        const params=new URL(request.url).searchParams,format=params.get('format'),baseline=params.get('baseline')==='1';
        if(format&&!['poster','story','carousel'].includes(format))return json({error:'Unknown format.'},400);
        const file=path.join(LAB_DIR,'fresh-matrix',`${baseline?'before-repairs':'index'}${format?'-'+format:''}.html`);
        if(!fs.existsSync(file))return json({error:'The fresh comparison matrix is being prepared.'},404);
        return new Response(fs.readFileSync(file),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
      }
      if(area==='recipe-variants'||area==='recipe-report'||area==='balance-report'){
        const file=path.join(LAB_DIR,area==='recipe-variants'?'recipe-variants':area==='balance-report'?'balance-live':'recipe-live','index.html');
        if(!fs.existsSync(file))return json({error:'The recipe report is not ready yet.'},404);
        return new Response(fs.readFileSync(file),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
      }
      if(area==='recipe-variant-file'){
        const match=/^([a-z-]+)-(poster|story|carousel)$/.exec(id??'');
        if(!match||!DESIGN_RECIPE_IDS.includes(match[1] as typeof DESIGN_RECIPE_IDS[number]))return json({error:'Preview not found.'},404);
        const file=path.join(LAB_DIR,'recipe-variants',id+'.png');if(!fs.existsSync(file))return json({error:'Preview not found.'},404);
        return new Response(fs.readFileSync(file),{headers:{'content-type':'image/png','cache-control':'no-store','x-content-type-options':'nosniff'}});
      }
      if(area==='template-previews'||area==='template-catalog'||area==='template-preview-file'){
        const root=path.join(LAB_DIR,'template-curation');
        const manifestFile=path.join(root,'manifest.json');
        if(!fs.existsSync(manifestFile))return json({error:'The curated template gallery is not ready yet.'},404);
        if(area==='template-previews')return new Response(fs.readFileSync(path.join(root,'index.html')),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
        if(area==='template-catalog')return new Response(fs.readFileSync(manifestFile),{headers:{'content-type':'application/json','content-disposition':'attachment; filename="ola-template-shortlist.json"','cache-control':'no-store','x-content-type-options':'nosniff'}});
        if(!/^[a-z][a-z-]+$/.test(id??''))return json({error:'Preview not found.'},404);
        const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'))as{items:Array<{id:string}>};
        if(!manifest.items.some(item=>item.id===id))return json({error:'Preview not found.'},404);
        return new Response(fs.readFileSync(path.join(root,'previews',id+'.png')),{headers:{'content-type':'image/png','cache-control':'no-store','x-content-type-options':'nosniff'}});
      }
      if(area==='recipe-preview-file'){
        if(!/^[a-z-]+-(poster|story|carousel)$/.test(id??''))return json({error:'Preview not found.'},404);
        const manifest=JSON.parse(fs.readFileSync(path.join(LAB_DIR,'recipe-previews','manifest.json'),'utf8')) as {items:Array<{id:string}>};
        if(!manifest.items.some(item=>item.id===id))return json({error:'Preview not found.'},404);
        return new Response(fs.readFileSync(path.join(LAB_DIR,'recipe-previews',id+'.png')),{headers:{'content-type':'image/png','cache-control':'no-store','x-content-type-options':'nosniff'}});
      }
      if(area==='recipe-previews'||area==='process-report'){
        const file=path.join(LAB_DIR,area==='recipe-previews'?'recipe-previews':'process-live','index.html');
        if(!fs.existsSync(file))return json({error:'The preview or comparison report is not ready yet.'},404);
        return new Response(fs.readFileSync(file),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
      }
      if(area==='representation-report'){
        const file=path.join(LAB_DIR,'representation-live','index.html');
        if(!fs.existsSync(file))return json({error:'The representation generation report is not ready yet.'},404);
        return new Response(fs.readFileSync(file),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
      }
      if(area==='responsive-live-report'){
        const file=path.join(LAB_DIR,'responsive-live','index.html');
        if(!fs.existsSync(file))return json({error:'The fresh generation report is not ready yet.'},404);
        return new Response(fs.readFileSync(file),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
      }
      if(area==='responsive-proof'){
        const url=new URL(request.url),file=responsiveProofFile(id,Number(url.searchParams.get('page')??0),url.searchParams.get('before')==='1');
        return new Response(fs.readFileSync(file),{headers:{'content-type':'image/png','cache-control':'no-store','x-content-type-options':'nosniff'}});
      }
      if(area==='responsive-report')return new Response(responsiveReport(),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
      if(area==='composition-proof'){
        const batch=JSON.parse(fs.readFileSync(compositionBatchPath(),'utf8')) as CompositionBatch;
        const proof=batch.cases.find(c=>c.caseId===id)?.correction;
        if(!proof||!path.resolve(proof.file).startsWith(path.join(LAB_DIR,'composition-batch','proofs')+path.sep))return json({error:'Proof not found.'},404);
        return new Response(fs.readFileSync(proof.file),{headers:{'content-type':'image/png','cache-control':'no-store','x-content-type-options':'nosniff'}});
      }
      if(area==='semantic-designer-report')return new Response(intentReport('semantic-designer-study'),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
      if(area==='intent-report')return new Response(intentReport(),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
      if(area==='composition-report')return new Response(compositionReport(),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
      if(area==='poster-report')return new Response(posterReport(),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
      if(area==='improvement-report'){
        const file=path.join(LAB_DIR,'improvements','index.html');if(!fs.existsSync(file))return json({error:'The improvement report is not ready yet.'},404);
        return new Response(fs.readFileSync(file),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
      }
      if(area==='batch-report'){
        const file=path.join(LAB_DIR,'brand-batch','index.html');
        if(!fs.existsSync(file))return json({error:'No brand batch report has been generated.'},404);
        return new Response(fs.readFileSync(file),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
      }
      if(area==='cases'&&id&&action==='brand-rules')return json({history:brandRuleHistory(getCase(id).input)});
      if(area==='cases'&&id&&action==='preferences')return json(labDb().prepare('SELECT record_json FROM preferences WHERE case_id=? ORDER BY created_at DESC').all(id).map(r=>JSON.parse(String(r.record_json))));
      if(area==='cases'&&id&&action==='asset'){
        const index=Number(new URL(request.url).searchParams.get('index'));
        if(!Number.isInteger(index)||index<0)throw new Error('Invalid asset index.');
        const asset=getCase(id).input.assets[index];if(!asset)return json({error:'Asset not found.'},404);
        return new Response(fs.readFileSync(asset.path),{headers:{'content-type':asset.mediaType,'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`,'cache-control':'no-store','x-content-type-options':'nosniff'}});
      }
      if(area==='models'){
        const provider=ModelSchema.shape.provider.parse(new URL(request.url).searchParams.get('provider'));
        return json({models:await modelCatalog(provider)});
      }
      if(area==='components'){
        if(id&&action==='preview'){const c=getComponentCandidate(id),format=z.enum(COMPONENT_FORMATS).parse(new URL(request.url).searchParams.get('format')),svg=new URL(request.url).searchParams.get('source')==='svg',check=c.checks.find(v=>v.format===format);if(!check?.passed)throw Error('This format has no validated preview.');const file=path.join(componentCandidateDir(),c.id,format+(svg?'.svg':'.png'));return new Response(fs.readFileSync(file),{headers:{'content-type':svg?'image/svg+xml':'image/png','cache-control':'no-store','x-content-type-options':'nosniff',...(svg?{'content-disposition':'attachment; filename=component.svg'}:{})}});}
        return json({candidates:listComponentCandidates(),jobs:componentJobs()});
      }
      if(area==='settings'){
        const heartbeat=labDb().prepare('SELECT at FROM heartbeat WHERE id=1').get() as {at:string}|undefined;
        const info=labDb().prepare('SELECT capabilities_json FROM worker_info WHERE id=1').get() as {capabilities_json:string}|undefined;
        return json({companyComparisonReady:Boolean(info&&JSON.parse(info.capabilities_json).companies),modelComparisonReady:Boolean(info&&JSON.parse(info.capabilities_json).models&&JSON.parse(info.capabilities_json).accounting),companies:sourceCatalog(),providers:providers(),canva:{blockedReason:canvaBlockReason(),connected:connected()},workerOnline:Boolean(heartbeat&&Date.now()-Date.parse(heartbeat.at)<10_000)});
      }
      if(area==='cases')return json(id?publicCase(getCase(id)):listCases());
      if(area==='attempts'&&action==='file'){
        const a=getAttempt(id);const url=new URL(request.url);const index=Number(url.searchParams.get('page')??0);
        if(!Number.isInteger(index)||index<0)throw new Error('Invalid page.');
        if(url.searchParams.get('source')==='svg'){const file=a.result?.sources?.[index];if(!file)throw new Error('Editable source unavailable.');return new Response(fs.readFileSync(file),{headers:{'content-type':'image/svg+xml','content-disposition':`attachment; filename=ola-page-${index+1}.svg`,'x-content-type-options':'nosniff','cache-control':'no-store'}});}
        const pages=url.searchParams.get('phase')==='initial'?a.result?.initialPages:a.result?.pages;
        const page=pages?.[index];if(!page)return json({error:'Page not available.'},404);
        return new Response(fs.readFileSync(page.file),{headers:{'content-type':'image/png','cache-control':'no-store','x-content-type-options':'nosniff'}});
      }
      if(area==='canva'&&id==='callback'){
        const url=new URL(request.url);
        if(url.searchParams.has('error'))throw new Error('Canva authorization was declined.');
        const cookie=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('comparison_oauth='))?.split('=')[1];
        await completeOAuth(url.searchParams.get('state')??'',url.searchParams.get('code')??'',cookie);
        const response=NextResponse.redirect(new URL('http://127.0.0.1:3100/'));response.cookies.delete('comparison_oauth');return response;
      }
    }
    if(request.method==='POST'){
      if((area==='craft-report'||area==='asset-report'||area==='textbox-report')&&id==='reviews')return json(saveCraftReview(await request.json(),area==='textbox-report'?'textbox-study':area==='asset-report'?'asset-study':'craft-study'),201);
      if(area==='components'){
        if(id&&action==='review'){const body=z.object({status:z.enum(['candidate','shortlisted','rejected']),note:z.string().max(1000)}).parse(await request.json());return json(reviewComponentCandidate(id,body.status,body.note));}
        const body=z.object({attemptId:z.string().uuid(),page:z.number().int().min(1).max(20)}).parse(await request.json()),source=getAttempt(body.attemptId);if(source.engine!=='ola'||!source.model||!source.result?.pages.length)throw Error('Select a rendered Ola attempt.');return json(queueComponentJob(body,source.model),202);
      }

      if(area==='cases'&&id&&action==='brand-rules'){
        const body=z.object({rules:z.unknown(),note:z.string().trim().min(1).max(1000),expectedRevision:z.number().int().min(0)}).parse(await request.json());
        return json(saveBrandRules(id,body.rules,body.note,body.expectedRevision));
      }
      if(area==='cases'&&id&&action==='preferences'){
        const body=z.object({attemptIds:z.array(z.string()).min(2).max(10),winner:z.string(),notes:z.string().max(3000),manualCorrections:z.number().int().min(0).max(1000),blind:z.boolean()}).parse(await request.json());
        const comparison=getCase(id);const selected=body.attemptIds.map(a=>comparison.attempts.find(b=>b.id===a));
        if(selected.length!==comparisonContenders(comparison).length||selected.some(a=>!a?.result?.pages.length)||new Set(selected.map(a=>a&&contenderId(a))).size!==selected.length||body.winner!=='tie'&&!body.attemptIds.includes(body.winner))throw new Error('Choose one saved attempt from each contender and a valid preference.');
        const record={...body,id:crypto.randomUUID(),caseId:id,createdAt:new Date().toISOString()};labDb().prepare('INSERT INTO preferences VALUES(?,?,?,?)').run(record.id,id,record.createdAt,JSON.stringify(record));return json(record,201);
      }
      if(area==='cases'&&!id){
        const reader=request.body?.getReader();if(!reader)throw new Error('Missing comparison input.');
        const chunks:Uint8Array[]=[];let length=0;
        for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>36*1024*1024){await reader.cancel();throw new Error('Comparison upload exceeds 36 MB.');}chunks.push(value);}
        const form=await new Response(Buffer.concat(chunks),{headers:{'content-type':request.headers.get('content-type')??''}}).formData();
        return json(publicCase(await createComparison(form)),201);
      }
      if(area==='cases'&&action==='rerun'){
        const input=z.object({engine:z.enum(engines).optional(),contenderId:z.string().optional(),model:ModelSchema.optional()}).parse(await request.json());
        const comparison=getCase(id), contender=comparisonContenders(comparison).find(c=>input.contenderId?c.id===input.contenderId:c.id===input.engine);
        if(!contender)throw new Error('Choose a valid contender.');
        if((comparison.input.mode==='models'||comparison.input.mode==='ola')&&input.model&&(input.model.model!==contender.model?.model||input.model.provider!==contender.model?.provider))throw new Error('Start a new comparison to change models.');
        const attempt=newAttempt(id,contender.engine,input.model,{contenderId:contender.id});return json({id:attempt.id},201);
      }
      if(area==='attempts'&&action==='answer'){
        const a=getAttempt(id);if(a.engine!=='ola'||a.status!=='awaiting-input')throw new Error('This attempt is not awaiting an answer.');
        const {answer}=z.object({answer:z.string().trim().min(1).max(2000)}).parse(await request.json());
        if(labDb().prepare('SELECT 1 FROM commands WHERE attempt_id=?').get(id))throw new Error('An answer is already queued.');
        labDb().prepare('INSERT INTO commands VALUES(?,?,?)').run(crypto.randomUUID(),id,answer);return json({ok:true});
      }
      if(area==='canva'&&id==='connect'){
        const result=await beginOAuth();const response=json({url:result.url});
        response.cookies.set('comparison_oauth',result.state,{httpOnly:true,sameSite:'lax',path:'/',maxAge:600});return response;
      }
    }
    return json({error:'Not found.'},404);
  }catch(error){return json({error:redact(error instanceof Error?error.message:'Request failed.')},400);}
}
export {handle as GET,handle as POST};
