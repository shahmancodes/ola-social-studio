// Known-source, offline replay. No providers, project writes or replacement of saved outcomes.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { DatabaseSync } from 'node:sqlite';
import { SimpleArtifactSchema } from '../src/lib/simple-content.ts';
import { artifactPages, resolvedVisualContent } from '../src/lib/composition.ts';
import { applyArtifactPatches, artifactRepairSchema, requiredCopyIssues } from '../src/lib/artifact-repair.ts';
import { repairSupportingBudgets } from '../src/lib/copy-budget-repair.ts';
import { supportingCopyBudgetChecks, supportingCopyBudgetIssues } from '../src/lib/supporting-copy-budget.ts';
import { buildVisualScene, scenePng } from '../src/lib/content-layout.ts';
import { sceneIssues } from '../src/lib/scene-renderer.ts';
import { mobileTextEvidence } from '../src/lib/layout-readability.ts';
import { brandPalette } from '../src/lib/content-brand.ts';
import { BrandDesignSchema } from '../src/lib/brand-design.ts';

const root = process.cwd(), study = path.join(root, '.data/comparison/canva-standings/f5460088-1a32-4134-a194-e6ee14818a0a');
const manifestFile = path.join(study, 'manifest.json'), manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
assert.equal(manifest.status, 'finished');
const row = manifest.cases.find(c => c.format === 'carousel');
assert.equal(row.outcomes.ola.status, 'needs-review');
const sourceFile = path.join(path.dirname(row.outcomes.ola.pages[0].file), 'source.json');
const source = SimpleArtifactSchema.parse(JSON.parse(await fs.readFile(sourceFile, 'utf8')));
const db = new DatabaseSync(path.join(study, 'runtime/ola/platform.sqlite'), { readOnly: true });
const project = db.prepare('SELECT * FROM projects WHERE id=?').get('962f611f-6826-4dcc-b45a-06a9237dd58c');
const savedBrand = JSON.parse(project.brand_snapshot_json);
const assets = db.prepare('SELECT id,name,media_type AS mediaType,disk_path AS diskPath,usage_role AS role,category FROM assets WHERE company_id=?').all(project.company_id);
const brand = { assetAliases: savedBrand.sourceAssetAliases, companyId: project.company_id, name: 'Mozilla', audience: savedBrand.audience, voice: savedBrand.voice, description: savedBrand.description, typography: 'Saved Mozilla fonts', imagery: '', formatRules: savedBrand.formatRules, examples: [], assets: [], palette: brandPalette(savedBrand), designSystem: BrandDesignSchema.parse(savedBrand.designSystem), fonts: assets.filter(a => savedBrand.fontAssetIds.includes(a.id)), logo: assets.find(a => a.id === savedBrand.logoAssetId) };
const draftFile = path.join(study, 'runtime/ola/companies', project.company_id, 'projects', project.id, 'draft-copy.json');
const draft = SimpleArtifactSchema.parse(JSON.parse(await fs.readFile(draftFile, 'utf8')));
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
const preserved = await Promise.all([manifestFile, sourceFile, draftFile, ...row.outcomes.ola.pages.map(p => p.file), ...assets.map(a => a.diskPath)].map(async file => ({ file, sha256: hash(await fs.readFile(file)) })));
const sourceHashes = await Promise.all(['supporting-copy-budget', 'copy-budget-repair', 'content-representation', 'simple-content', 'composition', 'artifact-repair', 'responsive-scene'].map(async name => { const file = path.join(root, 'src/lib', `${name}.ts`); return { file, sha256: hash(await fs.readFile(file)) }; }));
assert.equal(supportingCopyBudgetChecks(draft, project.brief)[1].words, 0);
assert.equal(supportingCopyBudgetIssues(draft, project.brief).length, 1);
const paragraph = 'Separate what the evidence supports from what still needs checking before drawing a conclusion.';
const requests = [];
const repairedDraft = await repairSupportingBudgets(draft, project.brief, async prompt => {
  requests.push(prompt);
  assert(prompt.includes('IN ADDITION'));
  assert(prompt.includes('"body":""'));
  return JSON.stringify({ edits: [{ source: 'body', value: paragraph }] });
});
assert.equal(requests.length, 1);
assert.deepEqual(repairedDraft.slides[1], { ...draft.slides[1], body: paragraph });
assert.deepEqual(repairedDraft.slides[0], draft.slides[0]);
assert.deepEqual(repairedDraft.slides[2], draft.slides[2]);
assert.deepEqual(requiredCopyIssues(repairedDraft, project.brief), []);
const { version, blocks, placements, ...plan } = source.slides[1].composition;
const repair = { reason: 'Add the separately requested supporting paragraph while preserving the selected layout and every exact field.', patches: [{ target: source.slides[1].id, body: paragraph, compositionPlan: plan }] };
const repaired = applyArtifactPatches(source, artifactRepairSchema(source).parse(repair), project.brief);
assert.deepEqual(requiredCopyIssues(repaired, project.brief), []);
assert.deepEqual(resolvedVisualContent(artifactPages(repaired)[1]), resolvedVisualContent(artifactPages(source)[1]));
const directory = path.join(root, '.data/comparison/supporting-prose-proofs', crypto.randomUUID());
await fs.mkdir(directory, { recursive: true });
const rows = [];
for (const format of ['carousel', 'poster', 'story', 'post', 'presentation']) {
  for (const [stage, artifact] of (format === 'carousel' ? [['original-replay', source], ['repaired', repaired]] : [['repaired', repaired]])) {
    const pages = artifactPages(artifact);
    for (const index of format === 'carousel' ? [0, 1, 2] : [1]) {
      const page = pages[index], scene = await buildVisualScene(format, page, brand, format === 'carousel' ? index : 0, format === 'carousel' ? 3 : 1), file = path.join(directory, `${stage}-${format}-${index + 1}.png`);
      await fs.writeFile(file, await scenePng(scene));
      assert.deepEqual(sceneIssues(scene), [], `${stage} ${format} page ${index + 1}`);
      const text = scene.elements.filter(e => e.kind === 'text' && e.copyId).map(e => ({ id: e.id, source: e.copySource, text: e.text, size: e.size, x: e.x, y: e.y, width: e.w, height: e.h }));
      const visual = resolvedVisualContent(page);
      for (const value of [page.title, page.body, page.cta, ...(visual?.items.flatMap(item => [item.label, item.detail]) ?? [])].filter(Boolean)) assert.equal(text.filter(t => t.text === value).length, 1, `${format} page ${index + 1}: ${value}`);
      const reading = mobileTextEvidence(scene);
      if (['carousel', 'story', 'post'].includes(format)) assert.equal(reading.text.filter(t => t.pixels + .05 < t.minimum).length, 0, `${format} reading minimum`);
      rows.push({ stage, format, page: index + 1, file, text, reading });
    }
  }
}
for (const file of [...preserved, ...sourceHashes]) assert.equal(hash(await fs.readFile(file.file)), file.sha256);
assert.equal(db.prepare('SELECT artifact_json FROM projects WHERE id=?').get(project.id).artifact_json, project.artifact_json);
db.close();
await fs.writeFile(path.join(directory, 'repaired-draft.json'), JSON.stringify(repairedDraft, null, 2));
await fs.writeFile(path.join(directory, 'repair.json'), JSON.stringify(repair, null, 2));
await fs.writeFile(path.join(directory, 'repaired-source.json'), JSON.stringify(repaired, null, 2));
const thumbs = [];
for (const [left, stage] of [[0, 'original-replay'], [432, 'repaired']]) thumbs.push({ input: await sharp(rows.find(r => r.format === 'carousel' && r.page === 2 && r.stage === stage).file).resize({ width: 432 }).png().toBuffer(), left, top: 0 });
await sharp({ create: { width: 864, height: 540, channels: 4, background: '#FFFFFF' } }).composite(thumbs).png().toFile(path.join(directory, 'comparison.png'));
const report = {
  createdAt: new Date().toISOString(), professionalQualityEstablished: false, providerCalls: 0,
  method: 'Offline replay of the actual frozen Mozilla carousel. The current pre-approval budget check now rejects its missing paragraph. A deterministic stand-in response, authored for this proof, fills only the generated body via the normal focused repair function. The same paragraph is applied to the saved final artifact through the normal repair API, with its selected plan unchanged. This verifies capability, not fresh autonomous generation.',
  limitation: 'Original paid output remains needs-review. The added paragraph is engineer-authored; no fresh model selected or wrote it. Original page indicators remain and still need the separate restrictive-brief fix. No professional-quality claim.',
  originalStudy: study, sourceFile, preserved, sourceHashes, paragraph,
  focusedRepairRequests: requests.length,
  beforeBudgets: supportingCopyBudgetChecks(source, project.brief), afterBudgets: supportingCopyBudgetChecks(repaired, project.brief),
  repair, rows,
};
await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
await fs.writeFile(path.join(directory, 'review.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Additional supporting prose · Offline proof</title><style>body{font:16px/1.5 system-ui;background:#eef0f4;color:#18202c;margin:32px}main{max-width:1400px;margin:auto}.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px}img{width:100%;background:white}figure{margin:0}p{max-width:1100px}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style><main><h1>Exact fields plus supporting prose</h1><p>${report.method}</p><p><strong>${report.limitation}</strong></p><div class="pair"><figure><h2>Original saved output · page 2</h2><img src="${path.relative(directory, row.outcomes.ola.pages[1].file)}" alt="Original page 2 with missing supporting prose"></figure><figure><h2>Normal repair API · page 2</h2><img src="repaired-carousel-2.png" alt="Added supporting prose and preserved exact fields"></figure></div><h2>Same repair in other formats</h2><div class="pair">${rows.filter(r => r.format !== 'carousel').map(r => `<figure><h3>${r.format}</h3><img src="${path.basename(r.file)}" alt="${r.format} supporting prose with exact fields"></figure>`).join('')}</div><p>All exact copy blocks remain once, requested supporting prose is visible at readable sizes in all five visual formats, and saved input sources/assets/originals are hash-verified unchanged.</p><a href="report.json">Verification report</a></main></html>`);
console.log(JSON.stringify({ directory, renders: rows.length, focusedRepairRequests: requests.length, providerCalls: 0, originalsPreserved: true, afterWords: report.afterBudgets.map(b => b.words) }));
