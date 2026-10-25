// Read-only baseline, isolated project, unchanged model/copy/brand, and durable repair evidence.
// node --import tsx scripts/ola-refinement-study.mjs --run [--source-directory .data/comparison/professional-study/ID] [--company Mozilla]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

const root=process.cwd(),args=process.argv.slice(2);
if(args.includes('--proof')){
 const {composePage,artifactPages}=await import('../src/lib/composition.ts');
 const {SimpleArtifactSchema}=await import('../src/lib/simple-content.ts');
 const {applyArtifactPatches}=await import('../src/lib/artifact-repair.ts');
 const {ResponsiveLayoutSchema}=await import('../src/lib/composition-design.ts');
 const {buildVisualScene,scenePng}=await import('../src/lib/content-layout.ts');
 const {sceneIssues}=await import('../src/lib/scene-renderer.ts');
 const {default:sharp}=await import('sharp');
 const dir=path.join(root,'.data/comparison/refinement-study','proof-'+crypto.randomUUID());fs.mkdirSync(dir,{recursive:true});
 const brand={companyId:'proof',name:'Sample',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],assets:[],palette:{background:'#FFFFFF',alternate:'#E8EDE7',ink:'#151A18',dark:'#151A18',accent:'#C6F168'}};
 const title='Leave room to reconsider.',body='A thoughtful choice stays clear without pushing the reader.',cta='Rewrite one unclear choice.';
 const p=composePage({title,body,cta},{family:'oversized-typography',intent:{goal:'Make room for a considered choice',relationship:'statement',reason:'Centered text on a dark field with one grouped supporting line.'},responsive:{version:1,balance:{version:1},anchor:'center',craft:{version:1,surface:'dark',horizontalAnchor:'center',measure:.8,rule:'top'}},typography:{title:{align:'center',leading:1.05,breakAfter:[2]},body:{align:'center',leading:1.3},cta:{align:'center'}}});
 const artifact=SimpleArtifactSchema.parse({type:'story',headline:title,subline:body,cta,composition:p.composition});
 const patch={reason:'Remove the rule, keeping the chosen direction',patches:[{target:'page-1',craft:{rule:'none'}}]};
 const repaired=applyArtifactPatches(artifact,patch,'');
 // Reproduce the former patch parser's default insertion without changing production code.
 const former=applyArtifactPatches(artifact,{...patch,patches:[{target:'page-1',craft:ResponsiveLayoutSchema.shape.craft.unwrap().parse({version:1,rule:'none'})}]},'');
 const rows=[];
 for(const [id,label,source]of [['original','Original chosen direction',artifact],['former','Former partial repair',former],['repaired','Preserved direction after repair',repaired]]){
  const scene=await buildVisualScene('story',artifactPages(source)[0],brand),bytes=await scenePng(scene);assert.deepEqual(sceneIssues(scene),[]);
  const file=path.join(dir,id+'.png');fs.writeFileSync(file,bytes,{flag:'wx'});fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify(source,null,2));
  rows.push({id,label,file,background:scene.background,frame:scene.responsiveLayout.frame});
 }
 assert.equal(rows[0].background,rows[2].background);assert.deepEqual(rows[0].frame,rows[2].frame);assert.notEqual(rows[1].background,rows[2].background);
 assert.deepEqual(artifactPages(artifact).map(p=>[p.title,p.body,p.cta]),artifactPages(repaired).map(p=>[p.title,p.body,p.cta]));
 const tiles=await Promise.all(rows.map(async(row,i)=>({input:await sharp(row.file).resize({width:360}).png().toBuffer(),left:i*380+10,top:50})));
 const labels=Buffer.from(`<svg width="1140" height="50"><style>text{font:15px sans-serif;fill:#111}</style>${rows.map((r,i)=>`<text x="${i*380+10}" y="30">${r.label}</text>`).join('')}</svg>`);
 await sharp({create:{width:1140,height:710,channels:3,background:'#E6E6E6'}}).composite([...tiles,{input:labels,left:0,top:0}]).png().toFile(path.join(dir,'contact-sheet.png'));
 fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({method:'Deterministic regression proof. Same copy, brand and base composition. The middle view reproduces the previous default-reset behavior; the last uses the fixed partial patch. No AI generation or subjective quality claim.',rows,checks:'Copy preserved; chosen surface and grid preserved; all scenes passed geometry checks.'},null,2));
 console.log(JSON.stringify({dir,contactSheet:path.join(dir,'contact-sheet.png'),checks:'passed'}));process.exit(0);
}
const option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const study=option('--study','textbox-study'),company=option('--company','Mozilla');
if(!/^[a-z0-9-]+$/.test(study))throw Error('Choose a local saved study name.');
const sourceDir=path.resolve(option('--source-directory',path.join(root,'.data/comparison',study)));
assert(sourceDir.startsWith(path.join(root,'.data/comparison')+path.sep),'Choose a saved local comparison study.');
const studyName=path.relative(path.join(root,'.data/comparison'),sourceDir);
const manifest=JSON.parse(fs.readFileSync(path.join(sourceDir,'manifest.json'),'utf8'));
const sample=manifest.cases.find(row=>row.company===company);
if(!sample)throw Error('No matching company in this study.');
const sourceLab=new DatabaseSync(path.join(sourceDir,'runtime/comparisons.sqlite'),{readOnly:true});
const originalRecord=sourceLab.prepare('SELECT record_json FROM attempts WHERE id=?').get(sample.attemptId)?.record_json;
if(!originalRecord)throw Error('Saved baseline attempt is missing.');
const attempt=JSON.parse(originalRecord);
if(!['complete','needs-review'].includes(attempt.status))throw Error('Choose a finished baseline.');
if(!args.includes('--run')){
 console.log(JSON.stringify({company,study:studyName,status:attempt.status,model:attempt.model,issues:attempt.result?.quality?.issues,usage:'Add --run for one billable isolated refinement. Baselines are never modified.'},null,2));
 sourceLab.close();process.exit(0);
}
createRequire(import.meta.url)('@next/env').loadEnvConfig(root);
const dir=path.join(root,'.data/comparison/refinement-study',crypto.randomUUID()),runtime=path.join(dir,'runtime');
fs.mkdirSync(runtime,{recursive:true});
Object.assign(process.env,{OLA_ROOT_DIR:root,OLA_DATA_DIR:runtime,OLA_DISABLE_MESSAGING:'1',OLA_ASSET_ACQUISITION:'enabled'});
const sourceDb=new DatabaseSync(path.join(sourceDir,'runtime/ola/platform.sqlite'),{readOnly:true});
const source=sourceDb.prepare('SELECT * FROM projects WHERE id=?').get(attempt.projectId);
if(!source?.artifact_json)throw Error('Baseline project is missing.');
const originalArtifact=source.artifact_json,artifact=JSON.parse(originalArtifact);
if(artifact.artwork?.some(a=>a.localPath))throw Error('Use a brand-library-only fixture; project-scoped artwork requires a separate acquisition study.');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const write=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n');
const sources=[];
function recordSources(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(directory,entry.name);if(entry.isDirectory())recordSources(file);else if(/\.(ts|tsx)$/.test(file))sources.push({file:path.relative(root,file),sha256:hash(fs.readFileSync(file))});}}
recordSources(path.join(root,'src'));
const dependencyLockHash=hash(fs.readFileSync(path.join(root,'package-lock.json')));
write('source-manifest.json',{sources,sourceHash:hash(JSON.stringify(sources)),dependencyLockHash});
const {db,projectRow}=await import('../src/lib/platform-db.ts');
const {createProjectRecord}=await import('../src/lib/platform.ts');
const {withProjectAi,setProjectAiPolicy}=await import('../src/lib/ai-execution.ts');
const {improveSavedSimpleArtifact}=await import('../src/lib/simple-content.ts');
const {artifactPages}=await import('../src/lib/composition.ts');
const {requiredCopyIssues,contentForEvidence}=await import('../src/lib/artifact-repair.ts');
const {usageSummary}=await import('../src/lib/ai-usage.ts');
const database=db();
function insert(table,row){
 const columns=Object.keys(row);if(!columns.every(c=>/^[a-z_]+$/.test(c)))throw Error('Unexpected source column.');
 database.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>row[c]));
}
insert('companies',sourceDb.prepare('SELECT * FROM companies WHERE id=?').get(source.company_id));
const assets=sourceDb.prepare('SELECT * FROM assets WHERE company_id=?').all(source.company_id);
const frozenAssets=[];
for(const asset of assets){
 const bytes=fs.readFileSync(asset.disk_path),target=path.join(runtime,'assets',asset.id+path.extname(asset.disk_path));
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});
 frozenAssets.push({id:asset.id,path:asset.disk_path,sha256:hash(bytes)});
 insert('assets',{...asset,disk_path:target});
}
const projectId=createProjectRecord({companyId:source.company_id,contentType:source.content_type,brief:source.brief,status:'queued',artifact});
database.prepare('UPDATE projects SET brand_snapshot_json=? WHERE id=?').run(source.brand_snapshot_json,projectId);
setProjectAiPolicy(projectId,{...(attempt.model??manifest.model),strict:true});
const before=artifact.type==='carousel'?artifact.imagePaths:artifact.type==='presentation'?artifact.previewPaths:[artifact.imagePath];
const baselinePages=(before??[]).filter(Boolean).map((file,i)=>{
 const bytes=fs.readFileSync(file),target=path.join(dir,`before-${i+1}.png`);fs.writeFileSync(target,bytes,{flag:'wx'});return {file:target,source:file,sha256:hash(bytes)};
});
write('before-source.json',artifact);
const summary={createdAt:new Date().toISOString(),company,format:source.content_type,study:studyName,sourceDirectory:sourceDir,projectId,baselineAttemptId:attempt.id,model:attempt.model??manifest.model,baselineRecordHash:hash(originalRecord),baselineArtifactHash:hash(originalArtifact),brandHash:hash(source.brand_snapshot_json),briefHash:hash(source.brief),baselinePages,frozenAssets,sourceFiles:sources.length,sourceHash:hash(JSON.stringify(sources)),dependencyLockHash,beforeQuality:artifact.quality,status:'running',professionalQualityEstablished:false,method:'Same saved generated artifact, brand, assets and model; fresh independent review followed by at most two autonomous repairs. This tests refinement, not fresh generation or a Canva win rate. Refinement can adjust existing content and geometry; it does not rerun initial research, direction selection or asset acquisition.'};
write('report.json',summary);console.log(JSON.stringify({dir,projectId,status:'running'}));
try{
 await withProjectAi(projectId,'refinement-study',()=>improveSavedSimpleArtifact(projectId));
 const result=projectRow(projectId),after=JSON.parse(result.artifact_json);
 assert.equal(result.brief,source.brief);assert.equal(result.brand_snapshot_json,source.brand_snapshot_json);
 assert.deepEqual(artifactPages(after).map(p=>[p.title,p.body,p.cta]),artifactPages(artifact).map(p=>[p.title,p.body,p.cta]));
 assert.deepEqual(contentForEvidence(after),contentForEvidence(artifact));
 assert.deepEqual(requiredCopyIssues(after,source.brief),[]);
 assert.equal(hash(sourceLab.prepare('SELECT record_json FROM attempts WHERE id=?').get(attempt.id).record_json),summary.baselineRecordHash);
 assert.equal(hash(sourceDb.prepare('SELECT artifact_json FROM projects WHERE id=?').get(source.id).artifact_json),summary.baselineArtifactHash);
 for(const asset of frozenAssets)assert.equal(hash(fs.readFileSync(asset.path)),asset.sha256);
 const events=database.prepare("SELECT kind,data_json FROM workflow_events WHERE project_id=? AND kind IN ('repair-patches','repair-rejected','repair-rollback') ORDER BY created_at,rowid").all(projectId).map(event=>({kind:event.kind,data:event.data_json?JSON.parse(event.data_json):null}));
 write('after-source.json',after);write('repair-events.json',events);
 const usage=usageSummary({projectId});
 Object.assign(summary,{status:result.status,afterQuality:after.quality,afterPages:after.type==='carousel'?after.imagePaths:after.type==='presentation'?after.previewPaths:[after.imagePath],repairEvents:events.length,audit:'Passed: all visible canonical copy, brief, brand, baseline records, baseline pixels and asset bytes preserved.',usage:{calls:usage.calls,costUsd:usage.costUsd,incomplete:usage.incomplete}});
 for(const page of baselinePages){assert.equal(hash(fs.readFileSync(page.file)),page.sha256);assert.equal(hash(fs.readFileSync(page.source)),page.sha256);}
 console.log(JSON.stringify({dir,status:summary.status,quality:summary.afterQuality,usage:summary.usage}));
}catch(error){const usage=usageSummary({projectId});Object.assign(summary,{status:'failed',error:error instanceof Error?error.message:String(error),usage:{calls:usage.calls,costUsd:usage.costUsd,incomplete:usage.incomplete}});throw error;}
finally{
 try{for(const file of sources)assert.equal(hash(fs.readFileSync(path.join(root,file.file))),file.sha256);assert.equal(hash(fs.readFileSync(path.join(root,'package-lock.json'))),dependencyLockHash);summary.sourceDrift=false;}
 catch(error){summary.sourceDrift=true;summary.auditError=error instanceof Error?error.message:String(error);summary.status='failed';}
 summary.finishedAt=new Date().toISOString();write('report.json',summary);sourceDb.close();sourceLab.close();database.close();
}
