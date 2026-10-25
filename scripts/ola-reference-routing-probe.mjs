// Three online coordinator decisions on preserved synthetic fixtures; no output generation or promotion.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import sharp from 'sharp';

const root=process.cwd(),baseline=path.resolve(process.argv[2]);
const read=file=>JSON.parse(fs.readFileSync(file)),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const master=read(path.join(baseline,'manifest.json'));
const directory=path.join(root,'.data/comparison/reference-routing-probe',crypto.randomUUID());
fs.mkdirSync(directory,{recursive:true});
process.env.OLA_DATA_DIR=path.join(directory,'runtime');process.env.OLA_ROOT_DIR=root;process.env.OLA_DISABLE_MESSAGING='1';
createRequire(import.meta.url)('@next/env').loadEnvConfig(root);
const {planVisualReferences}=await import('../src/lib/visual-reference-research.ts');
const {withAiRun}=await import('../src/lib/ai-execution.ts');
const {usageSummary}=await import('../src/lib/ai-usage.ts');
const {db}=await import('../src/lib/platform-db.ts');
const sources=['visual-reference-research.ts','workflow-model.ts','design-choice.ts','brand-design.ts'].map(name=>{const file=path.join(root,'src/lib',name);return{file,sha256:hash(fs.readFileSync(file))};});
const report={createdAt:new Date().toISOString(),status:'running',kind:'online-reference-routing-only',professionalQualityEstablished:false,scope:'Three normal coordinator decisions with actual frozen reference pixels, existing synthetic briefs and saved strict GPT-6 Luna / Vercel policy. No extra attempts, generation, repairs, publication or baseline changes.',limitations:['Decisions only: this does not establish generated-design quality or statistical absence of model preferences.','Known saved brands and briefs; no independent unseen-brand evaluation.'],sources,cases:[]};
const save=()=>fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));save();console.log(JSON.stringify({directory,status:report.status}));
for(const [company,format]of [['GitLab','carousel'],['GitHub','poster'],['Mozilla','story']]){
 const shard=master.shards.find(s=>s.format===format),packet=read(read(path.join(shard.directory,'manifest.json')).packetFile),row=packet.cases.find(c=>c.company===company);
 assert(row);const input=read(row.inputFile),inputHash=hash(fs.readFileSync(row.inputFile));
 const assets=input.assets.filter(a=>a.category==='reference'&&a.mediaType.startsWith('image/')).slice(0,3);
 const references=[];
 for(const asset of assets){const bytes=fs.readFileSync(asset.path);assert.equal(hash(bytes),asset.sha256);try{references.push({name:asset.name,path:asset.path,sha256:asset.sha256,image:'data:image/jpeg;base64,'+(await sharp(bytes).resize({width:1400,withoutEnlargement:true}).jpeg({quality:75}).toBuffer()).toString('base64')});}catch{}}
 const attemptId=crypto.randomUUID(),entry={company,format,attemptId,inputFile:row.inputFile,inputHash,references:references.map(({image:_,...ref})=>ref)};
 try{entry.plan=await withAiRun({stage:'visual-reference-evidence-probe',policy:{provider:'vercel',model:'openai/gpt-6-luna',strict:true,attemptId}},()=>planVisualReferences({type:format,brief:input.brief,brand:input.brand,localReferences:references.map(r=>r.name),referenceImages:references.map(r=>r.image),referenceNotes:[]}));entry.status='finished';}
 catch(error){entry.status='failed';entry.error=error instanceof Error?error.message:String(error);}
 entry.usage=usageSummary({attemptId});assert.equal(hash(fs.readFileSync(row.inputFile)),inputHash);for(const ref of references)assert.equal(hash(fs.readFileSync(ref.path)),ref.sha256);entry.originalsPreserved=true;report.cases.push(entry);save();console.log(JSON.stringify({company,plan:entry.plan,status:entry.status,error:entry.error}));
}
for(const source of sources)assert.equal(hash(fs.readFileSync(source.file)),source.sha256);
report.status=report.cases.every(c=>c.status==='finished')?'finished':'needs-attention';report.finishedAt=new Date().toISOString();save();db().close();console.log(JSON.stringify({directory,status:report.status}));
