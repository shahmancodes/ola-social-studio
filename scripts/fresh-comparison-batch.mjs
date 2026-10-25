import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import{createRequire}from'node:module';
const root=process.cwd(),require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(root);const lab=path.join(root,'.data/comparison');
Object.assign(process.env,{OLA_ROOT_DIR:root,COMPARISON_DATA_DIR:lab,OLA_DATA_DIR:path.join(lab,'ola'),OLA_DISABLE_MESSAGING:'1'});
const {labDb,getCase,getAttempt,insertCase,saveAttempt,currentBrandRules,digest,fingerprint}=await import('../src/comparison/store.ts');
const {providers,canvaBlockReason}=await import('../src/comparison/config.ts');const {connected}=await import('../src/comparison/canva.ts');const {InputSchema}=await import('../src/comparison/types.ts');
const dir=path.join(lab,'fresh-matrix'),file=path.join(dir,'manifest.json');fs.mkdirSync(dir,{recursive:true});
if(!process.argv.includes('--resume')&&fs.existsSync(file))throw Error('Fresh matrix already exists; use --resume rather than duplicate comparisons.');
if(labDb().prepare("SELECT 1 FROM attempts WHERE status IN ('queued','running','awaiting-input')").get()&&!process.argv.includes('--resume'))throw Error('Finish active work before starting this batch.');
const provider=providers().find(p=>p.id==='vercel'&&p.configured)??providers().find(p=>p.configured);if(!provider)throw Error('No configured model provider.');if(canvaBlockReason()||!connected())throw Error('Canva setup is incomplete.');
const model={provider:provider.id,model:provider.model};
const common='Private educational evaluation concept, not an official company campaign or a claim about its products. Use the shared saved brand rules, official supplied logo and brand fonts where supported. Preserve logo proportions. No external artwork, invented real-world statistics, offers, dates, endorsements or product capabilities. Supplied explicitly fictional examples/data are permitted only where requested and must stay labeled as illustrative. Keep unsupported font/asset capabilities visible in execution details. Use native editable text, geometry and semantic components; do not bake all content into a generated image. No follow-up questions are needed. Retain all required copy without unintended duplication. Context/topic is not an additional visible cover heading.';
let batch;
if(fs.existsSync(file))batch=JSON.parse(fs.readFileSync(file,'utf8'));
else{
 const briefs=JSON.parse(fs.readFileSync(path.join(dir,'briefs.json'),'utf8')),oldCases=labDb().prepare('SELECT id,input_hash FROM cases').all(),oldAttempts=labDb().prepare('SELECT id,record_json FROM attempts').all();
 batch={id:crypto.randomUUID(),createdAt:new Date().toISOString(),fingerprint:fingerprint(),model,companies:briefs.map(b=>b.company),formats:['poster','story','carousel'],expectedComparisons:briefs.length*3,expectedAttempts:briefs.length*9,oldCases:oldCases.map(c=>({id:c.id,inputHash:c.input_hash})),oldAttempts:oldAttempts.map(a=>({id:a.id,hash:digest(a.record_json)})),cases:[]};
 for(const b of briefs){const source=getCase(b.source);if(source.input.companyName!==b.company)throw Error('Source company mismatch.');const rules=currentBrandRules(source.input);const brand=structuredClone(source.input.brand);if(rules)brand.designSystem=rules.rules;
  for(const format of batch.formats){const p=b[format];const brief=format==='carousel'?`Create exactly six ordered 1080 × 1350 Carousel pages. Context only: ${p.goal} The ONLY required visible page headlines, in order, are: ${p.headlines.map((h,i)=>`${i+1}. "${h}"`).join('; ')}. ${p.direction} On the final page include the exact CTA "Save this guide." Do not render the context sentence as another cover title. ${common}`:`Create exactly one ${format==='poster'?'1240 × 1754 A4 portrait Poster (digital proof)':'1080 × 1920 static Instagram Story'}. Headline: "${p.headline}" Supporting line: "${p.body}" CTA: "${p.cta}" ${p.direction} Preserve the exact supplied copy blocks and any explicitly supplied diagram labels or credits; generate no additional visible prose. ${common}`;
   if(oldCases.some(c=>getCase(c.id).input.brief===brief))throw Error('A brief was reused.');const id=crypto.randomUUID();batch.cases.push({id,company:b.company,format,sourceCase:b.source,sourceInputHash:source.inputHash,sourceAssetHashes:source.input.assets.map(a=>({id:a.id,name:a.name,sha256:a.sha256})),brandRuleRevision:rules?.revision??null,brief,brand,sourceAssets:source.input.assets,model,state:'planned',attempts:{}});
  }
 }
 fs.writeFileSync(file,JSON.stringify(batch,null,2));
}
for(const item of batch.cases){
 if(labDb().prepare('SELECT 1 FROM cases WHERE id=?').get(item.id)){const c=getCase(item.id);item.state='queued';item.inputHash=c.inputHash;item.attempts=Object.fromEntries(c.attempts.map(a=>[a.engine,a.id]));continue;}
 const assetDir=path.join(lab,'cases',item.id,'inputs');fs.mkdirSync(assetDir,{recursive:true});
 const assets=item.sourceAssets.map(a=>{const bytes=fs.readFileSync(a.path);if(digest(bytes)!==a.sha256)throw Error('Frozen source asset changed.');const target=path.join(assetDir,a.id+path.extname(a.path));if(fs.existsSync(target)){if(digest(fs.readFileSync(target))!==a.sha256)throw Error('Partial snapshot differs.');}else fs.writeFileSync(target,bytes,{flag:'wx'});return {...a,path:target};});
 const input=InputSchema.parse({mode:'canva',brief:item.brief,companyName:item.company,brand:item.brand,format:item.format,slideCount:6,model:item.model,assetIds:[],fixture:false});const {assetIds:_,...rest}=input;
 const c=insertCase(item.id,{...rest,assets});for(const a of c.attempts)if(a.engine==='ola'){a.model=item.model;saveAttempt(a);}
 item.state='queued';item.inputHash=c.inputHash;item.attempts=Object.fromEntries(c.attempts.map(a=>[a.engine,a.id]));fs.writeFileSync(file,JSON.stringify(batch,null,2));console.log(JSON.stringify({company:item.company,format:item.format,id:item.id,attempts:item.attempts}));
}
for(const old of batch.oldCases)if(getCase(old.id).inputHash!==old.inputHash)throw Error('An earlier input changed.');for(const old of batch.oldAttempts)if(digest(JSON.stringify(getAttempt(old.id)))!==old.hash)throw Error('An earlier attempt changed.');
fs.writeFileSync(file,JSON.stringify(batch,null,2));console.log(JSON.stringify({comparisons:batch.cases.length,attempts:batch.cases.length*3,model:batch.model,manifest:file}));
