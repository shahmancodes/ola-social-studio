// Fifteen live evaluations requested by the user: five saved brands × three shared briefs.
// --prepare freezes production source/assets; --run launches three independent five-case shards.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
const root = process.cwd(), args = process.argv.slice(2);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
const base = path.join(root, '.data/comparison/product-standings');
const common = 'This is a private synthetic design evaluation, not an official company campaign. The specified audience is curious adults and collaborative teams; use clear accessible wording. The intended tone is calm, direct, practical and curious; this explicitly overrides any conflicting saved tone default for this synthetic brief. Use the saved brand fonts, colors and official logo without distortion. Choose the visual idea and layout autonomously. Shapes, arrows, connectors and semantic components are available when they clarify meaning. Preserve the intended relationships and exact supplied copy once. Captured reference images are style evidence only. Do not fabricate company claims, product behavior, statistics or interface screenshots. Use native editable typography and geometry and relevant supplied imagery. New asset acquisition is ENABLED: research and acquire genuinely useful rights-cleared visual assets when the brief calls for them, independently verify source identity and reuse terms, and include required attribution. Do not treat public availability alone as permission. Prefer relevant existing assets when they already meet the actual subject requirement. Keep production instructions out of visible copy and captions. Ask only if a consequential ambiguity genuinely prevents a correct design. Use normal bounded generation, selection, review and repair.';
const prompts = [
  { id: 'question-carousel', format: 'carousel', pages: 5, label: 'From a broad question to a useful next check', brief: 'Create exactly five ordered 1080 × 1350 carousel pages teaching how to turn a broad question into a useful next check. Develop a coherent sequence: identify what is unclear, narrow the question, give one clearly hypothetical before/after question example, choose useful evidence, and close with a practical next step. Write the headlines yourself, at most eight words each. Write 12–22 useful supporting words per page. Keep the example concrete and clearly illustrative, with no invented factual claim or numerical result. On the final page include the exact CTA "Choose one useful next check.". Choose the reading structures to suit each role; keep the sequence coherent and readable at phone size. ' + common },
  { id: 'perspective-poster', format: 'poster', pages: 1, label: 'Change the angle — image acquisition', brief: 'Create one A4 portrait photographic poster, exactly one 1240 × 1754 pixel page, about how a different viewpoint changes what we notice. Required headline: "Change the angle". Required supporting line: "Notice what a different view reveals.". Required closing line: "Look again before deciding.". Research and acquire a NEW rights-cleared photograph of a spiral staircase seen from above or below. The image is the main visual idea: its real geometry must communicate a changed viewpoint. Existing logos and brand references are not substitutes, and an unrelated saved image does not meet this subject requirement. Use actual source/rights evidence, download and independently review the image, then integrate it into the poster with its full proportions preserved. Include any required photographer/source credit; that credit is explicitly authorized additional visible copy. Keep the other visible wording limited to the three required blocks. Use strong brand-aware typography and image balance. If acquisition fails, preserve and report the failure rather than pretending an image was acquired; any native fallback must be identified as an unmet image requirement. ' + common },
  { id: 'observation-story', format: 'story', pages: 1, label: 'Look again before deciding', brief: 'Create one static 1080 × 1920 Instagram Story encouraging readers to separate observation from interpretation. Required headline: "Look again before deciding". Include exactly these two label/detail pairs: "Observed" / "What is directly visible?"; "Inferred" / "What are we adding?". Required closing line: "Leave room for a better explanation.". These are two complementary perspectives, not a yes/no branch or an ordered process. Generate no additional visible prose or labels. Choose an expressive, legible composition autonomously, with the core reading content inside Story interface safe areas. ' + common },
];
assert.equal(new Set(prompts.map(p => p.brief)).size, 3);

if (args.includes('--prepare')) {
  const directory = path.join(base, crypto.randomUUID()), snapshot = path.join(directory, 'source');
  fs.mkdirSync(snapshot, { recursive: true });
  const sources = [];
  function copySources(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) copySources(file);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const bytes = fs.readFileSync(file), relative = path.relative(root, file), target = path.join(snapshot, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o444 });
        sources.push({ file: relative, sha256: hash(bytes) });
      }
    }
  }
  copySources(path.join(root, 'src'));
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'scripts/ola-professional-study.mjs']) {
    fs.mkdirSync(path.dirname(path.join(snapshot, file)), { recursive: true }); fs.copyFileSync(path.join(root, file), path.join(snapshot, file));
  }
  for (const file of ['public', 'shared-assets']) fs.cpSync(path.join(root, file), path.join(snapshot, file), { recursive: true });
  if (fs.existsSync(path.join(root, 'shared-asset-metadata.json'))) fs.copyFileSync(path.join(root, 'shared-asset-metadata.json'), path.join(snapshot, 'shared-asset-metadata.json'));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(snapshot, 'node_modules'), 'dir');
  for (const source of sources) assert.equal(hash(fs.readFileSync(path.join(root, source.file))), source.sha256, 'Source changed during snapshot creation.');
  const sourceManifest = { createdAt: new Date().toISOString(), sources, sourceHash: hash(JSON.stringify(sources)), dependenciesHash: hash(fs.readFileSync(path.join(snapshot, 'package-lock.json'))) };
  write(path.join(snapshot, 'source-manifest.json'), sourceManifest);
  const seedFile = path.join(root, '.data/brand-library-seed/manifest.json'), seed = read(seedFile);
  const companies = ['Vercel', 'GitHub', 'GitLab', 'Mozilla', 'NASA'].map(name => {
    const record = seed.companies.find(c => c.name === name); assert(record, `Missing saved ${name} brand`); return record;
  });
  const platform = new DatabaseSync(path.join(root, '.data/platform.sqlite'), { readOnly: true });
  const original = new DatabaseSync(path.join(root, '.data/comparison/comparisons.sqlite'), { readOnly: true });
  const brands = [];
  for (const company of companies) {
    const row = platform.prepare('SELECT name,brand_json FROM companies WHERE id=?').get(company.companyId); assert.equal(row.name, company.name);
    const brandFile = path.join(directory, 'brands', company.name.toLowerCase() + '.json'); fs.mkdirSync(path.dirname(brandFile), { recursive: true }); fs.writeFileSync(brandFile, row.brand_json);
    const assets = platform.prepare('SELECT id,name,media_type AS mediaType,disk_path AS path,category,usage_role AS role,source_url AS sourceUrl,rights_note AS rightsNote FROM assets WHERE company_id=?').all(company.companyId).filter(a => ['logo', 'wordmark', 'font', 'reference', 'artwork', 'photography', 'illustration'].includes(a.category)).map(a => ({ ...a, sha256: hash(fs.readFileSync(a.path)) }));
    const source = original.prepare('SELECT input_json FROM cases WHERE id=?').get(company.sourceCase); assert(source);
    const candidates = original.prepare("SELECT id,record_json FROM attempts WHERE case_id=? AND engine='ola' AND status IN ('complete','needs-review','failed') ORDER BY rowid DESC").all(company.sourceCase);
    assert(candidates.length, `Missing saved baseline for ${company.name}`);
    const baseline = candidates[0], baselineRecord = JSON.parse(baseline.record_json);
    brands.push({ ...company, brand: JSON.parse(row.brand_json), brandFile, brandHash: hash(row.brand_json), assets,
      baselineAudit: { databaseFile: path.join(root, '.data/comparison/comparisons.sqlite'), sourceCaseId: company.sourceCase, sourceInputHash: hash(source.input_json), baselineId: baseline.id, baselineHash: hash(baseline.record_json), sourceAssets: JSON.parse(source.input_json).assets.map(a => ({ path: a.path, sha256: a.sha256 })), baselinePages: (baselineRecord.result?.pages ?? []).map(p => ({ file: p.file, sha256: hash(fs.readFileSync(p.file)) })) } });
  }
  platform.close(); original.close();
  const master = { createdAt: new Date().toISOString(), status: 'preparing', kind: 'five-companies-three-shared-prompts', directory, snapshot, sourceManifest: path.join(snapshot, 'source-manifest.json'), sourceHash: sourceManifest.sourceHash, sourceFiles: sources.length, assetAcquisition: 'enabled', expectedCases: 15, expectedPages: 35, companies: companies.map(c => c.name), prompts, shards: [],
    authorization: { approved: true, evidence: 'User: run ola for the 5 companies for 3 unique prompts, i want to see where the product currently stands', model: { provider: 'vercel', model: 'openai/gpt-6-luna' }, scope: '15 new live Ola jobs, five saved brands against the same three fresh shared briefs, standard bounded generation/selection/review/repair. All outcomes retained. New rights-cleared asset research, download, review and placement are enabled through the standard pipeline. No publication, messaging or replacement of prior content.' },
    limitations: ['Three shared briefs across familiar saved public brands; no unfamiliar-brand or blinded benchmark.', 'The photographic poster explicitly evaluates new image acquisition; other briefs allow assets only when genuinely useful.', 'Each of the 15 jobs has one new attempt; normal bounded internal retries and repairs are retained, with no selective reruns.', 'Node modules are shared; production TS/TSX source and brand/asset inputs are frozen and hash-verified.'] };
  write(path.join(directory, 'manifest.json'), master);
  // Prepare each isolated runtime in its own process: no shared database singleton or env leakage.
  for (const prompt of prompts) {
    const shardDir = path.join(root, '.data/comparison/professional-study', crypto.randomUUID()); fs.mkdirSync(shardDir, { recursive: true });
    const packetFile = path.join(directory, prompt.id + '-packet.json');
    const cases = brands.map(company => {
      const assetsDir = path.join(directory, 'inputs', prompt.id, company.name.toLowerCase()); fs.mkdirSync(assetsDir, { recursive: true });
      const assets = company.assets.map(a => { assert.equal(hash(fs.readFileSync(a.path)), a.sha256); const target = path.join(assetsDir, a.id + path.extname(a.path)); fs.copyFileSync(a.path, target); return { ...a, path: target }; });
      const input = { mode: 'ola', fixture: false, companyName: company.name, companyId: company.companyId, brand: company.brand, format: prompt.format, slideCount: prompt.pages === 1 ? 6 : prompt.pages, model: master.authorization.model, assets };
      input.brief = prompt.brief;
      const inputFile = path.join(assetsDir, 'input.json'); write(inputFile, input);
      return { id: company.name.toLowerCase() + '-' + prompt.id, company: company.name, label: company.name + ' · ' + prompt.label, format: prompt.format, pageCount: prompt.pages, knownBrief: false, inputFile, inputHash: hash(JSON.stringify(input)), ...company.baselineAudit };
    });
    const packet = { createdAt: master.createdAt, kind: master.kind, status: 'materialized', studyDirectory: shardDir, masterDirectory: directory, authorization: { ...master.authorization, maximumTests: 5, provider: 'Vercel AI Gateway' }, cases, codeSnapshot: { root: snapshot, sourceManifest: master.sourceManifest, sourceHash: master.sourceHash, dependencyLockHash: sourceManifest.dependenciesHash } };
    write(packetFile, packet);
    const script = path.join(directory, 'prepare-shard.mjs');
    if (!fs.existsSync(script)) fs.writeFileSync(script, `import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {pathToFileURL}from'node:url';const packetFile=process.argv[2],packet=JSON.parse(fs.readFileSync(packetFile)),snapshot=packet.codeSnapshot.root,runtime=path.join(packet.studyDirectory,'runtime');Object.assign(process.env,{OLA_ROOT_DIR:snapshot,COMPARISON_DATA_DIR:runtime,COMPARISON_SOURCE_DATA_DIR:${JSON.stringify(path.join(root,'.data'))},OLA_DATA_DIR:path.join(runtime,'ola'),OLA_DISABLE_MESSAGING:'1',OLA_ASSET_ACQUISITION:'enabled'});const {insertCase,saveAttempt,labDb,fingerprint}=await import(pathToFileURL(path.join(snapshot,'src/comparison/store.ts')).href);const cases=[];for(const c of packet.cases){const input=JSON.parse(fs.readFileSync(c.inputFile));const comparison=insertCase(crypto.randomUUID(),input);assert.equal(comparison.attempts.length,1);const attempt=comparison.attempts[0];attempt.state.assetAcquisition='enabled';saveAttempt(attempt);cases.push({...c,caseId:comparison.id,attemptId:attempt.id,packetCaseId:c.id,packetInputHash:c.inputHash,inputHash:comparison.inputHash,status:'queued'});}const manifest={createdAt:packet.createdAt,status:'prepared',assetAcquisition:'enabled',kind:packet.kind,packetFile,masterDirectory:packet.masterDirectory,authorization:packet.authorization,codeSnapshot:packet.codeSnapshot,fingerprint:'snapshot/'+fingerprint().split('/').at(-1),model:packet.authorization.model,clarificationAnswer:'Use the full frozen brief. Its explicitly specified audience controls this private evaluation; adapt the saved brand voice where it fits. All exact wording, required page counts, relationships and hypothetical-example scope are supplied. Choose reversible visual details autonomously, without inventing business facts or additional requirements. Record any question and answer.',cases};fs.writeFileSync(path.join(packet.studyDirectory,'manifest.json'),JSON.stringify(manifest,null,2));labDb().close();console.log(JSON.stringify({directory:packet.studyDirectory,cases:cases.length,fingerprint:manifest.fingerprint}));`);
    const code = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ['--import', 'tsx', script, packetFile], { cwd: root, stdio: 'inherit' }); child.once('error', reject); child.once('exit', resolve); });
    assert.equal(code, 0);
    master.shards.push({ promptId: prompt.id, format: prompt.format, directory: shardDir, packetFile, status: 'prepared' });
    write(path.join(directory, 'manifest.json'), master);
  }
  master.status = 'prepared'; write(path.join(directory, 'manifest.json'), master);
  console.log(JSON.stringify({ directory, status: master.status, companies: master.companies, uniquePrompts: prompts.length, cases: 15, expectedPages: 35, sourceFiles: sources.length, providerCalls: 0 }));
} else if (args.includes('--run')) {
  const directory = path.resolve(args[args.indexOf('--run') + 1] ?? ''); assert(directory.startsWith(base + path.sep));
  const file = path.join(directory, 'manifest.json'), master = read(file); assert.equal(master.status, 'prepared'); assert.equal(master.expectedCases, 15);
  master.status = 'running'; master.startedAt = new Date().toISOString(); write(file, master);
  const results = await Promise.allSettled(master.shards.map(async shard => {
    const logFile = path.join(directory, shard.promptId + '.log'), output = fs.createWriteStream(logFile, { flags: 'a' });
    shard.status = 'running'; write(file, master);
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, 'scripts/ola-holdout-launch.mjs'), shard.directory], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', chunk => { output.write(chunk); process.stdout.write('[' + shard.format + '] ' + chunk); });
      child.stderr.on('data', chunk => output.write(chunk));
      child.once('error', reject); child.once('exit', resolve);
    });
    output.end(); shard.exitCode = code; shard.status = read(path.join(shard.directory, 'manifest.json')).status;
    write(file, master); assert.equal(code, 0, `${shard.promptId} stopped; preserve its started attempts.`);
    return shard;
  }));
  master.status = results.every(r => r.status === 'fulfilled') ? 'finished' : 'needs-attention'; master.finishedAt = new Date().toISOString();
  master.errors = results.flatMap(r => r.status === 'rejected' ? [String(r.reason)] : []); write(file, master);
  console.log(JSON.stringify({ directory, status: master.status, shards: master.shards.map(s => ({ format: s.format, status: s.status })) }));
} else throw Error('Choose --prepare or --run <directory>.');
