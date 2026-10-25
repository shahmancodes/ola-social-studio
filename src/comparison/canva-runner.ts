import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import JSZip from "jszip";
import { z } from "zod";
import { connectCanva, canvaFetch, downloadCanva, allowedCanvaUrl, pause, type CanvaClient, type ToolSpec } from "./canva";
import { attemptDir, event, saveAttempt } from "./store";
import { modelJson } from "./model";
import { brandedGenerationArgs, editSafetyIssues, expectedCanvas } from "./canva-contract";
import { sharedBrief, type Attempt, type PageArtifact, type SharedInput } from "./types";

type Obj=Record<string,unknown>;
const object=(v:unknown):Obj=>v&&typeof v==='object'?v as Obj:{};
export function creationArgs(spec:ToolSpec,brief:string,input:SharedInput,uploaded:Array<{id:string;name:string}>) {
  const properties=object(spec.inputSchema.properties);
  if(!properties.brief)throw new Error("Canva create-design no longer accepts a brief; update the adapter before running.");
  const args:Obj={brief};
  // A generic Instagram Post resolves to square. Let the explicit 4:5 brief
  // determine carousel size instead of overriding it with the square preset.
  if(properties.format && input.format==='story')args.format='Instagram Story';
  if(properties.format && input.format==='poster')args.format='Poster (Portrait A4)';
  if(uploaded.length){
    const name=['asset_ids','image_ids','imageReferences','assets'].find(k=>properties[k]);
    if(!name)throw new Error("This Canva create-design schema cannot accept the selected assets. Run all contenders without assets or update the adapter; assets were not silently omitted.");
    const schema=object(properties[name]);const items=object(schema.items);
    if(items.type==='string')args[name]=uploaded.map(a=>a.id);
    else if(items.type==='object') {
      const props=object(items.properties);const idKey=['id','asset_id','media_id','mediaId'].find(k=>props[k]);
      if(!idKey)throw new Error("Canva asset-reference schema is not supported by this adapter.");
      args[name]=uploaded.map(a=>({[idKey]:a.id,...(props.name?{name:a.name}:{})}));
    }else throw new Error("Canva asset-reference schema is not supported by this adapter.");
  }
  return args;
}
export function designIdentity(raw:Obj) {
  const root=object(raw.result ?? object(raw.job).result ?? raw);
  const design=object(root.design ?? root.design_summary ?? root);
  const id=design.id ?? design.design_id;
  const urls=object(design.urls);
  const url=design.url ?? design.edit_url ?? urls.edit_url ?? urls.view_url;
  return {id:typeof id==='string'?id:undefined,url:typeof url==='string'?url:undefined};
}
function setStage(a:Attempt,stage:string){a.stage=stage;saveAttempt(a);}
export async function createAndPoll(client:CanvaClient,a:Attempt,args:Obj,signal:AbortSignal) {
  if(!a.state.createJob){
    const previous=object(a.state.lastTool);
    const created=previous.name==='create-design'?object(previous.result):await client.call('create-design',args,true);
    if(!created.job_id)throw new Error("Canva did not return the expected creation job ID. Check this run before retrying.");
    a.state.createJob=created;a.state.nextPollAt=Date.now()+Math.max(1,Number(object(created.polling_policy).wait_seconds)||15)*1000;saveAttempt(a);
  }
  while(!a.state.designId){
    const job=object(a.state.createJob);
    await pause(Math.max(0,Number(a.state.nextPollAt)-Date.now()),signal);
    const result=await client.call('get-create-design-async-job',{job_id:job.job_id,continuation_token:job.continuation_token});
    const status=String(result.status ?? object(result.job).status);
    if(['failed','error','cancelled'].includes(status))throw new Error('Canva design generation failed.');
    if(['completed','success'].includes(status)){
      const design=designIdentity(result);
      if(!design.id)throw new Error("Canva completed without a design ID; inspect the returned schema before retrying.");
      a.state.designId=design.id;a.state.editUrl=`https://www.canva.com/design/${encodeURIComponent(design.id)}/edit`;saveAttempt(a);return;
    }
    a.state.createJob={...job,...result};a.state.nextPollAt=Date.now()+Math.max(1,Number(object(result.polling_policy).wait_seconds)||15)*1000;saveAttempt(a);
  }
}
/** Canva's advertised brand exception uses candidates and accepts uploaded images. */
export async function createBranded(client:CanvaClient,a:Attempt,args:Obj,signal:AbortSignal) {
  if(a.state.designId)return;
  if(!a.state.brandJob){
    const previous=object(a.state.lastTool);
    a.state.brandJob=previous.name==='generate-design'?object(previous.result):await client.call('generate-design',args,true);
    saveAttempt(a);
  }
  let job=object(a.state.brandJob);
  const jobId=job.job_id??object(job.job).id??object(job.job).job_id;
  if(typeof jobId!=='string')throw new Error('Canva branded generation returned no job ID; inspect the saved response before retrying.');
  for(;;){
    signal.throwIfAborted();
    const root=object(job.result??object(job.job).result??job);
    const candidates=root.candidates??root.design_candidates??root.generated_designs??object(job.job).candidates;
    if(Array.isArray(candidates)&&candidates.length){
      // Fixed, recorded rule for automated comparison: first returned candidate, never cherry-pick.
      const first=object(candidates[0]);const candidateId=first.candidate_id??first.id;
      if(typeof candidateId!=='string')throw new Error('Canva candidate schema is unsupported; the remote job is preserved.');
      a.state.selectedCandidate=candidateId;event(a,'candidate-selection',{rule:'first returned candidate',jobId,candidateId});
      const previous=object(a.state.lastTool);
      const created=previous.name==='create-design-from-candidate'?object(previous.result):await client.call('create-design-from-candidate',{job_id:jobId,candidate_id:candidateId},true);
      const design=designIdentity(created);if(!design.id)throw new Error('Canva returned no saved design ID. Inspect the saved candidate response.');
      a.state.designId=design.id;a.state.editUrl=`https://www.canva.com/design/${encodeURIComponent(design.id)}/edit`;saveAttempt(a);return;
    }
    const status=String(job.status??object(job.job).status??'');
    if(/failed|error|cancelled/.test(status))throw new Error('Canva branded generation failed; see the saved job response.');
    if(/completed|success/.test(status))throw new Error('Canva completed without supported candidates; inspect the saved job response.');
    a.state.nextPollAt??=Date.now()+Math.max(15,Number(object(job.polling_policy).wait_seconds)||15)*1000;saveAttempt(a);
    await pause(Math.max(0,Number(a.state.nextPollAt)-Date.now()),signal);
    job=await client.call('get-design-candidates',{job_id:jobId});
    a.state.brandJob={...job,job_id:jobId};a.state.nextPollAt=Date.now()+Math.max(15,Number(object(job.polling_policy).wait_seconds)||15)*1000;saveAttempt(a);
  }
}
async function writePng(a:Attempt,bytes:Buffer,prefix:string,index:number):Promise<PageArtifact> {
  const png=bytes[0]===0x89&&bytes[1]===0x50?bytes:await sharp(bytes,{limitInputPixels:60_000_000}).png().toBuffer();
  const meta=await sharp(png).metadata();const file=path.join(attemptDir(a),`${prefix}-${index+1}.png`);fs.writeFileSync(file,png);
  return {file,width:meta.width!,height:meta.height!};
}
export async function exportPages(client:CanvaClient,a:Attempt,prefix:string,signal:AbortSignal) {
  const available=await client.call('get-export-formats',{design_id:a.state.designId});
  if(!Object.hasOwn(object(available.formats),'png'))throw new Error('This Canva design does not support PNG export. Open the saved design to inspect it.');
  const exportSpec=client.specs.find(t=>t.name==='export-design');
  const formatSchema=object(object(exportSpec?.inputSchema.properties).format);
  const metadata=object(a.state.pageMetadata),items=Array.isArray(metadata.items)?metadata.items:[];
  const pageNumbers=items.map((item,index)=>Number(object(item).page_number??object(item).index??index+1));
  const result=await client.call('export-design',{design_id:a.state.designId,format:formatSchema.type==='object'?{type:'png',as_single_image:false,...(pageNumbers.length?{pages:pageNumbers}:{})}:'png'});
  const job=object(result.job ?? result);const urls=job.urls ?? object(job.result).urls;
  if(!Array.isArray(urls)||!urls.length)throw new Error("Canva did not return completed PNG exports; the design link is saved for inspection.");
  const pages:PageArtifact[]=[];
  for(const raw of urls){
    if(typeof raw!=='string')throw new Error("Invalid Canva export URL.");
    const bytes=await downloadCanva(raw,signal);
    fs.writeFileSync(path.join(attemptDir(a),`${prefix}-download-${pages.length+1}.${bytes[0]===0x50&&bytes[1]===0x4b?'zip':'png'}`),bytes);
    if(bytes[0]===0x50&&bytes[1]===0x4b){
      const zip=await JSZip.loadAsync(bytes);const entries=Object.values(zip.files).filter(f=>!f.dir&&/\.(png|jpg|jpeg|webp)$/i.test(f.name)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
      if(entries.length>30)throw new Error("Unexpected number of Canva export pages.");
      let expanded=0;
      for(const entry of entries){const data=await entry.async('nodebuffer');expanded+=data.length;if(expanded>120*1024*1024)throw new Error('Canva archive is too large.');pages.push(await writePng(a,data,prefix,pages.length));}
    }else pages.push(await writePng(a,bytes,prefix,pages.length));
  }
  if(!pages.length)throw new Error('Canva returned no readable pages.');return pages;
}
export async function ensureCanvas(client:CanvaClient,a:Attempt,input:SharedInput,signal:AbortSignal){
  const expected=expectedCanvas(input),metadata=object(a.state.pageMetadata),items=Array.isArray(metadata.items)?metadata.items:[];
  if(items.length!==expected.count){
    a.result={...a.result,pages:await exportPages(client,a,'mismatched',signal),editUrl:String(a.state.editUrl)};saveAttempt(a);
    throw new Error(`Canva generated ${items.length} pages; exactly ${expected.count} were requested. The output is preserved; no pages were duplicated or padded.`);
  }
  if(items.every(item=>{const d=object(object(item).dimensions??object(item).dimension);return d.width===expected.width&&d.height===expected.height;}))return;
  if(!client.specs.some(s=>s.name==='resize-design'))throw new Error('Canva native resizing is unavailable; the requested dimensions cannot be produced.');
  if(!a.state.resizeResult){
    const previous=object(a.state.lastTool);
    a.state.sourceDesignId??=a.state.designId;
    a.state.resizeResult=previous.name==='resize-design'?previous.result:await client.call('resize-design',{design_id:a.state.sourceDesignId,design_type:{type:'custom',width:expected.width,height:expected.height}},true);saveAttempt(a);
  }
  const resized=designIdentity(object(a.state.resizeResult));
  if(!resized.id)throw new Error('Canva did not return the resized design ID. Inspect the recorded response before retrying.');
  a.state.designId=resized.id;a.state.editUrl=`https://www.canva.com/design/${encodeURIComponent(resized.id)}/edit`;
  a.state.pageMetadata=await client.call('get-design-pages',{design_id:resized.id,limit:100});
  event(a,'native-canvas-adaptation',{sourceDesignId:a.state.sourceDesignId,designId:resized.id,expected});
}

export function validateEditTargets(operations:Obj[],transactionId:string,ownedTransaction:string,transaction?:Obj) {
  if(transactionId!==ownedTransaction)throw new Error("Editing a transaction outside this attempt is not allowed.");
  const ids=new Set<string>();
  function collect(value:unknown){if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object'){const obj=value as Obj;if(typeof obj.element_id==='string')ids.add(obj.element_id);Object.values(obj).forEach(collect);}}
  if(transaction)collect(transaction);
  for(const op of operations){
    if('design_id' in op||'transaction_id' in op)throw new Error('Model edits may not redirect to another design or transaction.');
    if(transaction&&typeof op.element_id==='string'&&!ids.has(op.element_id))throw new Error('Model referenced an element outside this transaction.');
  }
}
export function resolveAssetReferences(operations:Obj[],input:SharedInput,uploaded:Array<{id:string;name:string}>) {
  const allowed=new Set(uploaded.map(a=>a.id));
  return operations.map(op=>{
    if(typeof op.asset_id!=='string')return op;
    const source=input.assets.find(a=>a.id===op.asset_id);
    const assetId=source?uploaded.find(a=>a.name===source.name)?.id:op.asset_id;
    if(!assetId||!allowed.has(assetId))throw new Error('Model referenced an asset outside the supplied image set.');
    return {...op,asset_id:assetId};
  });
}
export async function runCanva(a:Attempt,input:SharedInput,signal:AbortSignal) {
  const client=await connectCanva(a,signal);
  try{
    let prompt=sharedBrief(input);event(a,'shared-input',{inputHash:a.inputHash,brief:prompt});
    if(a.engine==='canva-agent'&&!a.state.plannedBrief){
      setStage(a,'Planning copy and layout');
      const plan=z.object({brief:z.string().min(3).max(16000),caption:z.string().max(4000).optional()}).parse(await modelJson(a,`Plan a strong design using only this supplied brief and brand context. Preserve the facts, assets, required dimensions, and page count. Return JSON {"brief":"complete design instructions and page-by-page copy","caption":"optional social caption"}.\n${prompt}`,[],signal));
      a.state.plannedBrief=plan.brief;a.state.caption=plan.caption;saveAttempt(a);
    }
    if(a.engine==='canva-agent')prompt+=`\n\nAssistant's design plan:\n${a.state.plannedBrief}`;
    const branded=input.assets.length>0;
    const images=input.assets.filter(asset=>asset.mediaType.startsWith('image/'));
    const spec=client.specs.find(t=>t.name===(branded?'generate-design':'create-design'));if(!spec)throw new Error('The required Canva generation tool is unavailable.');
    if(branded){
      if(!object(spec.inputSchema.properties).asset_ids&&images.length)throw new Error('Canva branded generation cannot accept image assets.');
      if(input.assets.some(asset=>asset.mediaType.startsWith('font/'))){
        const note='Canva MCP accepts the supplied logo images but exposes no custom-font upload. Font names and typography instructions are supplied in the brief; use of the downloaded font files cannot be guaranteed.';
        a.limitations=[note];event(a,'capability-limit',note);
      }
      event(a,'generation-route',{tool:'generate-design',reason:'Advertised Canva brand exception: supplied logo and font context',candidateRule:'first returned candidate'});
    }else creationArgs(spec,prompt,input,[]);
    if(!a.state.uploaded){
      const uploaded:Array<{id:string;name:string}>=a.state.uploadedAssets as Array<{id:string;name:string}>??[];
      for(const asset of images.filter(asset=>!uploaded.some(u=>u.name===asset.name))){
        setStage(a,`Uploading ${asset.name}`);
        const target=await client.call('create-upload-url',{},true);
        if(typeof target.uploadUrl!=='string')throw new Error('Canva did not return an upload URL.');
        a.state.inFlight='upload-file';saveAttempt(a);
        const response=await canvaFetch(target.uploadUrl,{method:'POST',headers:{'content-type':'application/octet-stream'},body:new Uint8Array(fs.readFileSync(asset.path)),signal});
        if(!response.ok)throw new Error(`Canva upload failed (${response.status}).`);
        const result=await response.json();const id=result.mediaId??result.asset_id??result.id;
        if(typeof id!=='string')throw new Error('Canva upload returned no resource ID.');
        uploaded.push({id,name:asset.name});a.state.uploadedAssets=uploaded;a.state.inFlight=null;saveAttempt(a);
      }
      a.state.uploaded=uploaded;saveAttempt(a);
    }
    const uploaded=a.state.uploaded as Array<{id:string;name:string}>;
    setStage(a,'Creating design in Canva');
    if(branded)await createBranded(client,a,brandedGenerationArgs(spec,prompt,input,uploaded),signal);
    else await createAndPoll(client,a,creationArgs(spec,prompt,input,uploaded),signal);
    // A design ID can be checkpointed before its short URL was validated.
    if(!a.state.editUrl)a.state.editUrl=`https://www.canva.com/design/${encodeURIComponent(String(a.state.designId))}/edit`;
    if(!a.state.pageMetadata){a.state.pageMetadata=await client.call('get-design-pages',{design_id:a.state.designId,limit:100});saveAttempt(a);}
    await ensureCanvas(client,a,input,signal);
    if(!a.result)a.result={pages:[],editUrl:typeof a.state.editUrl==='string'?a.state.editUrl:undefined};saveAttempt(a);
    if(a.engine==='canva-agent'&&!a.state.refinementDone){
      setStage(a,'Inspecting rendered pages');
      const initial=a.result.initialPages?.length?a.result.initialPages:await exportPages(client,a,'initial',signal);
      a.result.initialPages=initial;a.result.pages=initial;saveAttempt(a);
      const transaction=await client.call('start-editing-transaction',{design_id:a.state.designId},true);
      const transactionId=String(transaction.transaction_id??object(transaction.transaction).transaction_id??object(transaction.transaction).id??'');if(!transactionId)throw new Error('Canva editing transaction is unavailable.');
      a.state.transactionId=transactionId;saveAttempt(a);
      const editSpec=client.specs.find(t=>t.name==='perform-editing-operations');if(!editSpec)throw new Error('Canva editing is unavailable.');
      const reviewSchema=z.object({critique:z.string(),edits:z.array(z.object({page_index:z.number().int().min(1),operations:z.array(z.record(z.string(),z.unknown())).max(30)})).max(9)});
      let review:z.infer<typeof reviewSchema>|undefined,reviewError='';
      for(let pass=0;pass<2;pass++){
      const proposed=reviewSchema.parse(await modelJson(a,`Inspect these rendered pages against the shared brief. Make at most one targeted refinement pass using at most eight operations in total. Keep the critique under 1200 characters. Never delete grouped/nested elements. Never replace/format empty, zero-height or non-TEXT elements. Use only existing nonempty TEXT boxes; when text cannot be inserted safely, report the limitation rather than editing a fake text box. Do not try to synthesize missing pages through unsupported editing operations. Return JSON {"critique":"specific findings","edits":[{"page_index":1,"operations":[...]}]}. Use only existing element IDs from the transaction, supported operations from the tool schema, and pages of this design. Return empty edits if it is already good or an improvement is unsupported. Do not invent factual claims.\nShared brief: ${sharedBrief(input)}\nUploaded Canva image IDs (use these IDs for asset_id, never the local UUIDs): ${JSON.stringify(a.state.uploaded)}\nTool schema: ${JSON.stringify(editSpec.inputSchema)}\nEditable state: ${JSON.stringify(transaction)}\n${reviewError?`Previous edit plan rejected: ${reviewError}`:''}`,initial.map(p=>p.file),signal));
      const operations=proposed.edits.flatMap(edit=>edit.operations);const issues=editSafetyIssues(operations,transaction);if(operations.length>8)issues.push('Use at most eight operations in this refinement pass.');
      if(!issues.length){review=proposed;break;}reviewError=issues.join(' ');event(a,'edit-plan-rejected',{pass,issues});
      }
      if(!review){await client.call('cancel-editing-transaction',{transaction_id:transactionId},true);throw new Error(`Canva edit plan rejected: ${reviewError}`);}
      event(a,'visual-critique',review);setStage(a,'Applying one refinement pass');
      let editablePages=transaction.pages;
      for(const edit of review.edits){if(!edit.operations.length)continue;edit.operations=resolveAssetReferences(edit.operations,input,uploaded);if(edit.page_index>initial.length)throw new Error('Model referenced a page outside this design.');validateEditTargets(edit.operations,transactionId,String(a.state.transactionId),transaction);const changed=await client.call('perform-editing-operations',{transaction_id:transactionId,...edit,...(Array.isArray(editablePages)?{pages:editablePages}:{})},true);
        editablePages=changed.pages??editablePages;
        const results=changed.edit_operation_results;
        if(!Array.isArray(results)||results.length!==edit.operations.length||results.some(r=>object(r).status!=='success')){await client.call('cancel-editing-transaction',{transaction_id:transactionId},true);throw new Error('Canva did not confirm every requested edit; the transaction was cancelled and the initial output is preserved.');}}
      if(review.edits.length){const committed=await client.call('commit-editing-transaction',{transaction_id:transactionId},true);if(!/committed|success|completed/.test(String(object(committed.transaction).status ?? committed.status ?? object(committed.job).status)))throw new Error('Canva did not confirm the edit was committed.');}
      else await client.call('cancel-editing-transaction',{transaction_id:transactionId},true);
      a.state.refinementDone=true;saveAttempt(a);
    }
    setStage(a,'Saving exported pages');
    a.result={...a.result,pages:await exportPages(client,a,'final',signal),caption:typeof a.state.caption==='string'?a.state.caption:undefined};
    const expected=expectedCanvas(input),pages=a.result.pages;
    if(pages.length!==expected.count||pages.some(p=>p.width!==expected.width||p.height!==expected.height))throw new Error(`Canva format validation failed: expected ${expected.count} pages at ${expected.width} × ${expected.height}; received ${pages.length} pages (${pages.map(p=>`${p.width} × ${p.height}`).join(', ')}). Actual output is preserved.`);
    a.status='complete';a.stage='Complete';saveAttempt(a);
  }finally{await client.close();}
}
