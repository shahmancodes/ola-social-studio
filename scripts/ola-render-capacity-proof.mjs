// Offline replay of the failed fresh GitHub candidates; no provider calls or source edits.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import{DatabaseSync}from'node:sqlite';
import{brandPalette,shortlistBrandAssets}from'../src/lib/content-brand.ts';import{selectBrandMemory}from'../src/lib/brand-library.ts';import{BrandDesignSchema}from'../src/lib/brand-design.ts';import{artifactPages}from'../src/lib/composition.ts';import{buildVisualScene,scenePng}from'../src/lib/content-layout.ts';import{mobileTextEvidence}from'../src/lib/layout-readability.ts';
import{applyArtifactPatches,contentForEvidence}from'../src/lib/artifact-repair.ts';import sharp from'sharp';
const stations=process.argv.includes('--stations');
const nativeLists=process.argv.includes('--native-lists');
const root=process.cwd(),study=path.join(root,'.data/comparison/professional-study/5012a14d-382e-4acb-885f-74aac1ebecf7'),m=JSON.parse(fs.readFileSync(path.join(study,'manifest.json'))),sample=m.cases.find(c=>c.company===(stations?'GitLab':'GitHub'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),db=new DatabaseSync(path.join(study,'runtime/ola/platform.sqlite'),{readOnly:true}),lab=new DatabaseSync(path.join(study,'runtime/comparisons.sqlite'),{readOnly:true});
const loadedSources=['src/lib/composition-design.ts','src/lib/process-layout.ts','src/lib/native-list-layout.ts','src/lib/responsive-scene.ts','src/lib/responsive-layout.ts','src/lib/scene-renderer.ts','src/lib/artifact-repair.ts','src/lib/composition.ts'].map(file=>({file,sha256:hash(fs.readFileSync(file))}));
const attempt=JSON.parse(lab.prepare('SELECT record_json FROM attempts WHERE id=?').get(sample.attemptId).record_json),project=db.prepare('SELECT * FROM projects WHERE id=?').get(attempt.projectId),snapshot=JSON.parse(project.brand_snapshot_json),company=db.prepare('SELECT name FROM companies WHERE id=?').get(project.company_id);
const assets=db.prepare('SELECT id,name,media_type AS mediaType,disk_path AS diskPath,usage_role AS role,category,source_url AS sourceUrl,rights_note AS rightsNote FROM assets WHERE company_id=?').all(project.company_id);
const brand={companyId:project.company_id,name:company.name,audience:snapshot.audience,voice:snapshot.voice,description:snapshot.description,typography:snapshot.themeCard?.typography??'Readable typography',imagery:snapshot.themeCard?.imagery??'',formatRules:snapshot.formatRules,examples:snapshot.examples??[],palette:brandPalette(snapshot),designSystem:BrandDesignSchema.parse(snapshot.designSystem??{}),assetAliases:snapshot.sourceAssetAliases,fonts:assets.filter(a=>a.category==='font'&&snapshot.fontAssetIds.includes(a.id)),logo:assets.find(a=>a.id===snapshot.logoAssetId||a.id===snapshot.wordmarkAssetId),assets:shortlistBrandAssets(assets,snapshot,project.brief),memory:selectBrandMemory(snapshot.library,project.brief)};
const dir=path.join(root,'.data/comparison/capacity-proofs',crypto.randomUUID());fs.mkdirSync(dir,{recursive:true});const rows=[],baselineHash=hash(lab.prepare('SELECT record_json FROM attempts WHERE id=?').get(attempt.id).record_json);
const sourceDir=path.join(study,'runtime/ola/companies',project.company_id,'projects',project.id,'candidates');
if(stations){
 const file=path.join(study,'runtime/cases',sample.caseId,attempt.id,'source.json'),bytes=fs.readFileSync(file),original=JSON.parse(bytes),originalPixelHash=hash(fs.readFileSync(attempt.result.pages[0].file));
 const after=applyArtifactPatches(original,{reason:'Show each supplied stage as a station on one native connected route.',patches:[{target:'page-1',responsive:{visual:{nodes:'dots'}}}]},project.brief);
 assert.deepEqual(contentForEvidence(original),contentForEvidence(after));
 for(const[label,artifact]of [['before',original],['after',after]]){
  const scene=await buildVisualScene('poster',artifactPages(artifact)[0],brand),png=await scenePng(scene),target=path.join(dir,label+'.png');fs.writeFileSync(target,png);
  const nodes=scene.elements.filter(e=>e.id?.startsWith('stage-node-'));
  if(label==='after'){assert.equal(nodes.length,3);assert.equal(scene.elements.filter(e=>e.id?.startsWith('stage-number-')).length,0);for(let i=0;i<2;i++)assert(scene.elements.some(e=>e.id?.startsWith(`stage-connector-${i}-segment-`)));}
  fs.writeFileSync(path.join(dir,label+'-source.json'),JSON.stringify(artifact,null,2));rows.push({label,file:target,stations:nodes.length,status:'passed'});
 }
 assert.equal(hash(fs.readFileSync(file)),hash(bytes));assert.equal(hash(fs.readFileSync(attempt.result.pages[0].file)),originalPixelHash);
 const tiles=await Promise.all(rows.map(async(r,i)=>({input:await sharp(r.file).resize({width:360}).png().toBuffer(),left:i*380+10,top:40})));
 const labels=Buffer.from('<svg width="760" height="40"><style>text{font:16px sans-serif}</style><text x="10" y="28">Before: detached arrows</text><text x="390" y="28">After: connected native stations</text></svg>');
 await sharp({create:{width:760,height:560,channels:3,background:'#ddd'}}).composite([...tiles,{input:labels,left:0,top:0}]).png().toFile(path.join(dir,'contact-sheet.png'));
}else if(nativeLists){
 const file=path.join(sourceDir,'candidate-2/source.json'),bytes=fs.readFileSync(file),source=JSON.parse(bytes),page=artifactPages(source)[5],frozen=JSON.stringify(page);
 const oldReportFile=path.join(root,'.data/comparison/capacity-proofs/cc3a0186-459e-4696-877c-046c908142b0/report.json');
 const oldReport=JSON.parse(fs.readFileSync(oldReportFile)),old=oldReport.rows.find(r=>r.candidate===2&&r.page===6),oldBytes=fs.readFileSync(old.file),oldHash=hash(oldBytes);
 assert.equal(old.status,'passed');
 const scene=await buildVisualScene('carousel',page,brand,5,6),png=await scenePng(scene),reading=mobileTextEvidence(scene);
 for(const previous of old.text.filter(t=>['title','body','cta'].includes(t.id)))assert(scene.elements.some(e=>e.kind==='text'&&e.id===previous.id&&e.text===previous.text),'Surrounding canonical text changed.');
 assert.equal(scene.elements.filter(e=>e.kind==='image'&&e.groupId==='artwork').length,0);
 assert.equal(reading.text.filter(t=>t.pixels+.05<t.minimum).length,0);
 fs.writeFileSync(path.join(dir,'before.png'),oldBytes);fs.writeFileSync(path.join(dir,'after.png'),png);fs.writeFileSync(path.join(dir,'source.json'),bytes);
 rows.push({label:'before',file:path.join(dir,'before.png'),status:'passed',method:'Preserved historical renderer output of this exact saved candidate page.',readability:old.readability,baselineReport:oldReportFile,sha256:oldHash});
 rows.push({label:'after',file:path.join(dir,'after.png'),status:'passed',method:'Current native renderer; no source typography, layout or copy patch.',readability:reading,editableComponentFields:scene.elements.filter(e=>e.kind==='text'&&e.copySource?.startsWith('semanticComponent.')).map(e=>({id:e.id,source:e.copySource,text:e.text}))});
 assert.equal(JSON.stringify(page),frozen);assert.equal(hash(fs.readFileSync(file)),hash(bytes));assert.equal(hash(fs.readFileSync(old.file)),oldHash);
 const tiles=await Promise.all(rows.map(async(r,i)=>({input:await sharp(r.file).resize({width:360}).png().toBuffer(),left:i*380+10,top:40})));
 const labels=Buffer.from('<svg width="760" height="40"><style>text{font:16px sans-serif}</style><text x="10" y="28">Before: small labels inside image</text><text x="390" y="28">After: measured editable labels</text></svg>');
 await sharp({create:{width:760,height:510,channels:3,background:'#ddd'}}).composite([...tiles,{input:labels,left:0,top:0}]).png().toFile(path.join(dir,'contact-sheet.png'));
}else for(let c=1;c<=3;c++){
 const file=path.join(sourceDir,`candidate-${c}`,'source.json'),bytes=fs.readFileSync(file),source=JSON.parse(bytes);
 for(const[p,page]of artifactPages(source).entries()){
  const scene=await buildVisualScene('carousel',page,brand,p,6),row={candidate:c,page:p+1,title:page.title};
  try{const png=await scenePng(scene);row.file=path.join(dir,`candidate-${c}-page-${p+1}.png`);fs.writeFileSync(row.file,png);row.readability=mobileTextEvidence(scene);row.status='passed';}
  catch(e){row.status='failed';row.error=e instanceof Error?e.message:String(e);}
  row.text=scene.elements.filter(e=>e.kind==='text').map(e=>({id:e.id,w:e.w,h:e.h,size:e.size,minimum:e.minSize,text:e.text}));rows.push(row);
 }
 assert.equal(hash(fs.readFileSync(file)),hash(bytes));
}
assert.equal(hash(lab.prepare('SELECT record_json FROM attempts WHERE id=?').get(attempt.id).record_json),baselineHash);
for(const source of loadedSources)assert.equal(hash(fs.readFileSync(source.file)),source.sha256,'Source changed during local proof: '+source.file);
const report={createdAt:new Date().toISOString(),method:nativeLists?'Offline GitHub page6 comparison: historical image-component output vs current native measured list with the same saved source, copy and typography. No provider call, manual source patch, fresh autonomous validation or overall quality pass claimed.':stations?'Offline GitLab capability proof: one responsive.visual.nodes:dots patch, identical source copy and other composition settings, no new numbers or prose. Original generation and pixels preserved. No autonomous repair or independent quality score claimed.':'Offline re-render of all 18 pages in the failed fresh GitHub alternatives. Original generation remains failed; no paid retry, copy/style patch, independent model review or quality claim.',loadedSources,rendererHash:hash(fs.readFileSync('src/lib/scene-renderer.ts')),rows,passed:rows.filter(r=>r.status==='passed').length,failed:rows.filter(r=>r.status==='failed').length};fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');db.close();lab.close();console.log(JSON.stringify({dir,passed:report.passed,failed:report.failed,errors:rows.filter(r=>r.error).map(r=>({candidate:r.candidate,page:r.page,error:r.error}))}));
