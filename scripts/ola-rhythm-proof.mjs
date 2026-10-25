// A deterministic source-preserving repair proof, with no model calls or baseline writes.
// node --import tsx scripts/ola-rhythm-proof.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { applyArtifactPatches, contentForEvidence, requiredCopyIssues } from '../src/lib/artifact-repair.ts';
import { renderModernArtifact } from '../src/lib/modern-content.ts';
import { artifactPages } from '../src/lib/composition.ts';
import { brandPalette, shortlistBrandAssets } from '../src/lib/content-brand.ts';
import { BrandDesignSchema } from '../src/lib/brand-design.ts';
import { selectBrandMemory } from '../src/lib/brand-library.ts';
import { layoutRepetitionFindings } from '../src/lib/layout-review.ts';
import { mobileReadabilityFindings } from '../src/lib/layout-readability.ts';

const root=process.cwd(),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const readableDefaults=process.argv.includes('--readable-defaults');
const loadedSources=['scripts/ola-rhythm-proof.mjs','src/lib/artifact-repair.ts','src/lib/composition.ts','src/lib/composition-design.ts','src/lib/layout-review.ts','src/lib/layout-readability.ts','src/lib/modern-content.ts','src/lib/responsive-scene.ts','src/lib/responsive-layout.ts','src/lib/scene-renderer.ts','src/lib/sequence-design.ts'].map(file=>({file,sha256:hash(fs.readFileSync(path.join(root,file)))}));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'.data/comparison/semantic-designer-study/manifest.json'),'utf8'));
const sample=manifest.cases.find(row=>row.company==='GitHub'&&row.format==='carousel');
if(!sample?.afterAttemptId)throw Error('The saved GitHub carousel fixture is required.');
const lab=new DatabaseSync(path.join(root,'.data/comparison/comparisons.sqlite'),{readOnly:true});
const platform=new DatabaseSync(path.join(root,'.data/comparison/ola/platform.sqlite'),{readOnly:true});
let outputDirectory;
try{
 const attemptRecord=lab.prepare('SELECT record_json FROM attempts WHERE id=?').get(sample.afterAttemptId)?.record_json;
 if(!attemptRecord)throw Error('The baseline attempt is missing.');
 const attempt=JSON.parse(attemptRecord),project=platform.prepare('SELECT * FROM projects WHERE id=?').get(attempt.projectId);
 const sourceFile=path.join(root,'.data/comparison/cases',sample.caseId,attempt.id,'source.json');
 const sourceBytes=fs.readFileSync(sourceFile),artifact=JSON.parse(sourceBytes),snapshot=JSON.parse(project.brand_snapshot_json);
 const company=platform.prepare('SELECT name FROM companies WHERE id=?').get(project.company_id);
 const assets=platform.prepare('SELECT id,name,media_type AS mediaType,disk_path AS diskPath,usage_role AS role,category,source_url AS sourceUrl,rights_note AS rightsNote FROM assets WHERE company_id=?').all(project.company_id);
 const brand={companyId:project.company_id,name:company.name,audience:snapshot.audience,voice:snapshot.voice,description:snapshot.description,typography:snapshot.themeCard?.typography??'Readable typography',imagery:snapshot.themeCard?.imagery??'',formatRules:snapshot.formatRules,examples:snapshot.examples??[],palette:brandPalette(snapshot),designSystem:BrandDesignSchema.parse(snapshot.designSystem??{}),assetAliases:snapshot.sourceAssetAliases,fonts:assets.filter(a=>a.category==='font'&&snapshot.fontAssetIds.includes(a.id)),logo:assets.find(a=>a.id===snapshot.logoAssetId||a.id===snapshot.wordmarkAssetId),assets:shortlistBrandAssets(assets,snapshot,project.brief),memory:selectBrandMemory(snapshot.library,project.brief)};
 const dir=path.join(root,'.data/comparison/rhythm-proofs',crypto.randomUUID());fs.mkdirSync(dir,{recursive:true});
 outputDirectory=dir;
 const baselinePages=artifact.imagePaths.map(file=>({file,sha256:hash(fs.readFileSync(file))}));
 const assetHashes=[...brand.fonts,...brand.assets,...(brand.logo?[brand.logo]:[])].map(a=>({id:a.id,file:a.diskPath,sha256:hash(fs.readFileSync(a.diskPath))}));
 const target=artifact.slides.at(-1).id;
 const patch={reason:'Make explanatory copy readable at phone size and distinguish the closing action using the existing stages.',patches:artifact.slides.map(slide=>{
  const reflow=slide.composition.responsive.adjustments.filter(a=>a.action==='reflow').at(-1);
  return {target:slide.id,resetLayoutActions:true,...(readableDefaults?{}:{typography:{detail:{size:1.4}}}),...(readableDefaults||slide.id===target||reflow?{responsive:{...(readableDefaults?{readability:{version:1}}:{}),...(reflow?{arrangement:reflow.arrangement}:{}),...(slide.id===target?{visual:{direction:'horizontal'}}:{})}}:{})};
 })};
 const before=structuredClone(artifact),after=applyArtifactPatches(artifact,patch,project.brief);
 for(const[name,value]of [['baseline-source',artifact],['planned-after-source',after],['patch',patch]])fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(value,null,2)+'\n');
 assert.deepEqual(contentForEvidence(after),contentForEvidence(before));assert.deepEqual(requiredCopyIssues(after,project.brief),[]);
 if(readableDefaults)assert.deepEqual(artifactPages(after).map(page=>page.composition.typography),artifactPages(before).map(page=>page.composition.typography),'The readable-defaults proof must not hand-tune typography.');
 await renderModernArtifact(before,brand,path.join(dir,'before'));
 await renderModernArtifact(after,brand,path.join(dir,'after'));
 const findingsBefore=layoutRepetitionFindings(before),findingsAfter=layoutRepetitionFindings(after);
 const readabilityBefore=mobileReadabilityFindings(before),readabilityAfter=mobileReadabilityFindings(after);
 for(const[name,value]of [['before-source',before],['after-source',after],['patch',patch],['diagnostics',{findingsBefore,findingsAfter,readabilityBefore,readabilityAfter}]])fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(value,null,2)+'\n');
 assert(findingsBefore.some(f=>f.problem.includes('Pages 2, 3, 6')),'The frozen fixture no longer reproduces the repeated reading structure.');
 assert.equal(findingsAfter.length,0,'The local change did not resolve the repeated primary structure.');
 assert(readabilityBefore.length>0,'The fixture no longer reproduces the small explanatory text.');
 assert.equal(readabilityAfter.length,0,'The explanatory text is still below its phone reading floor.');
 assert.deepEqual(artifactPages(before).map(p=>p.composition.recipe),artifactPages(after).map(p=>p.composition.recipe));
 for(const item of [...baselinePages,...assetHashes])assert.equal(hash(fs.readFileSync(item.file)),item.sha256);
 assert.equal(hash(fs.readFileSync(sourceFile)),hash(sourceBytes));
 assert.equal(hash(lab.prepare('SELECT record_json FROM attempts WHERE id=?').get(attempt.id).record_json),hash(attemptRecord));
 for(const item of loadedSources)assert.equal(hash(fs.readFileSync(path.join(root,item.file))),item.sha256,'Source changed during this proof: '+item.file);
 const rows=[before.imagePaths,after.imagePaths],cellW=256,cellH=340;
 const tiles=[];for(const[row,files]of rows.entries())for(const[i,file]of files.entries())tiles.push({input:await sharp(file).resize({width:240}).png().toBuffer(),left:i*cellW+8,top:row*cellH+32});
 const labels=Buffer.from(`<svg width="1536" height="680"><style>text{font:16px sans-serif;fill:#111}</style><text x="8" y="23">Before: repeated reading structures and small explanatory text</text><text x="8" y="363">After: readable explanation text and a different closing flow; all copy and recipes preserved</text></svg>`);
 const contactSheet=path.join(dir,'contact-sheet.png');await sharp({create:{width:1536,height:680,channels:3,background:'#E6E6E6'}}).composite([...tiles,{input:labels,left:0,top:0}]).png().toFile(contactSheet);
 const report={createdAt:new Date().toISOString(),caseId:sample.caseId,baselineAttemptId:attempt.id,baselineSourceHash:hash(sourceBytes),baselineRecordHash:hash(attemptRecord),brandHash:hash(project.brand_snapshot_json),briefHash:hash(project.brief),loadedSources,baselinePages,assetHashes,findingsBefore,findingsAfter,readabilityBefore,readabilityAfter,contactSheet,patch,readableDefaults,method:'Local renderer proof using a saved generated carousel. A deterministic patch exercises the agent repair interface; '+(readableDefaults?'The versioned reading policy supplies minimum sizes without hand-tuned font multipliers. ':'')+'No AI generation, independent model review, or human preference is claimed.',checks:'All 12 pages rendered; primary text meets measured phone reading floors; canonical copy, recipe IDs, assets and historical source/record/pixel hashes preserved.'};
 fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({dir,contactSheet,findingsBefore,findingsAfter,checks:report.checks}));
}catch(error){if(outputDirectory)fs.writeFileSync(path.join(outputDirectory,'failure.json'),JSON.stringify({error:error instanceof Error?error.message:String(error)},null,2)+'\n');throw error;}
finally{platform.close();lab.close();}
