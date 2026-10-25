// Read-only assessment: never starts a contender or edits designs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const directory = path.resolve(process.argv[2]);
const read = file => JSON.parse(fs.readFileSync(file));
const m = read(path.join(directory, 'manifest.json'));
assert.equal(m.status, 'finished');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const frozen = read(path.join(m.snapshot, 'source-manifest.json'));
for (const source of frozen.sources) assert.equal(hash(fs.readFileSync(path.join(m.snapshot, source.file))), source.sha256);
const db = new DatabaseSync(path.join(m.runtime, 'comparisons.sqlite'), { readOnly: true });
const labels = { 'canva-direct': 'Canva Direct', 'canva-agent': 'AI + Canva', ola: 'Ola' };
const cases = m.cases.map(row => {
  const input = JSON.parse(db.prepare('SELECT input_json FROM cases WHERE id=?').get(row.id).input_json);
  for (const asset of input.assets) assert.equal(hash(fs.readFileSync(asset.path)), asset.sha256);
  const attempts = Object.fromEntries(Object.entries(row.attempts).map(([engine, id]) => {
    const a = JSON.parse(db.prepare('SELECT record_json FROM attempts WHERE id=?').get(id).record_json);
    return [engine, {
      id: a.id, status: a.status, stage: a.stage, error: a.error,
      startedAt: a.startedAt, finishedAt: a.finishedAt,
      pages: (a.result?.pages ?? []).map(page => ({ ...page, sha256: hash(fs.readFileSync(page.file)) })),
      editUrl: a.result?.editUrl, quality: a.result?.quality, limitations: a.limitations,
      projectId: a.projectId, usage: row.outcomes[engine]?.usage,
      clarifications: row.outcomes[engine]?.clarifications, quota: a.state?.canvaQuota,
    }];
  }));
  return { ...row, input, attempts };
});
db.close();

const wordCount = value => value.trim().split(/\s+/u).filter(Boolean).length;
const canonicalCopy = source => {
  const pages = source.slides ?? [source];
  return pages.flatMap(p => [p.title ?? p.headline, p.body ?? p.subline, p.cta,
    ...(p.visualContent?.items ?? []).flatMap(item => [item.label, item.detail])]).filter(Boolean).join('\n');
};
const coverage = (expected, text) => expected.map(value => ({ text: value, count: text.split(value).length - 1 }));
const matched = cases.filter(c => c.attempts['canva-direct'].pages.length && c.attempts.ola.pages.length);
assert.equal(matched.length, 2);
for (const c of matched) {
  const expected = [...c.input.brief.matchAll(/"([^"]+)"/g)].map(v => v[1]);
  const readbackFile = c.format === 'poster' ? 'canva-richtext-readback.json' : 'canva-carousel-richtext-readback.json';
  const richText = read(path.join(directory, readbackFile)).richText;
  assert.equal(typeof richText, 'string');
  const olaSource = read(path.join(path.dirname(c.attempts.ola.pages[0].file), 'source.json'));
  c.copyEvidence = {
    readbackFile,
    canva: coverage(expected, richText),
    ola: coverage(expected, canonicalCopy(olaSource)),
    method: 'Exact quoted brief blocks checked against read-only Canva rich text and canonical Ola copy; all eight rendered pages also visually inspected. This does not measure all generated-copy requirements.',
    olaSupportingWordCounts: olaSource.slides?.map(slide => wordCount(slide.body ?? '')),
  };
  assert(c.copyEvidence.ola.every(v => v.count === 1));
}
assert(matched[0].copyEvidence.canva.every(v => v.count === 1));
assert.equal(matched[1].copyEvidence.canva.filter(v => v.count === 1).length, 5);
const attempts = cases.flatMap(c => Object.values(c.attempts));
const providerCalls = attempts.reduce((sum, a) => sum + (a.usage?.calls ?? 0), 0);
const providerCostUsd = attempts.reduce((sum, a) => sum + (a.usage?.costUsd ?? 0), 0);
assert.equal(providerCalls, 35);

const assessment = {
  verdict: 'Ola is competitive on brief fidelity and brand control, but has not consistently beaten Canva or reached reliable professional quality with minimal editing.',
  scope: 'Two fresh matched Canva Direct vs Ola cases: one GitHub A4 poster and a three-page Mozilla carousel. AI + Canva produced no design because Canva credits were unavailable. The GitLab Story was also credit rejected; its Ola contender never started. Unavailable contenders are not design losses.',
  poster: {
    conclusion: 'Canva has the more finished decorative card treatment; Ola is more faithful to the supplied brand. Both retain all ten exact copy blocks. Ola remains a plain text stack and its structural repairs failed.',
    criteria: [
      ['Visual craft', 'Consistent 2 × 2 cards give strong grouping and a finished surface. Gradients and bubbles add decoration.', 'Large readable headline and blue labels, but a plain label-over-detail stack. The intended editorial margin is absent.'],
      ['Required copy', '10/10 exact quoted blocks once; confirmed by read-only text readback.', '10/10 exact quoted blocks once; canonical source and rendered output checked.'],
      ['Brand fidelity', 'Replaces the selected horizontal GitHub lockup with an illustrated Octocat; pink/purple gradients depart from supplied palette.', 'Uses supplied horizontal logo, white/charcoal/blue palette and saved Mona Sans files.'],
      ['Autonomous outcome', 'Exported; brand corrections remain by inspection.', 'Needs review. Four-item relatedPair repair and incompatible labeledVisual repair both rejected.'],
    ],
    requiredCorrections: {
      'Canva Direct': ['Restore the selected official logo lockup and supplied palette; confirm the intended typography.'],
      Ola: ['Execute a distinctive editorial structure for the four fields.', 'Apply a valid structural repair without losing exact copy.'],
    },
  },
  carousel: {
    conclusion: 'Ola is substantially closer to the brief and supplied Mozilla identity. Canva produces a coherent template, but rewrites required content and departs from the brand. Ola still omits a required supporting paragraph and fails to repair it.',
    criteria: [
      ['Required exact copy', '5/10 quoted blocks retained exactly. The first headline becomes “Start”; all three required detail questions are rewritten. CTA meaning is present but its exact sentence is not retained.', '10/10 quoted blocks retained once in the assigned pages, including all three complete question pairs.'],
      ['Generated supporting copy', 'Adds unrequested subheadings and lengthy prose beyond the requested 12–18 supporting words per page.', 'Page 1 has 14 supporting words; page 3 has 15. Page 2 has none, despite the brief requiring prose in addition to the exact fields.'],
      ['Brand and sequence', 'Consistent purple/serif/wavy-line template. Supplied Mozilla logo and white/black/lime identity are absent.', 'Supplied Mozilla logo and fonts; clear hierarchy and equal fields. A black final page and lime CTA give the sequence deliberate contrast.'],
      ['Autonomous outcome', 'Exported; substantial copy and brand corrections remain.', 'Needs review. Missing page-2 prose and unrequested page indicators remain; repair was rejected because it made no design change.'],
    ],
    requiredCorrections: {
      'Canva Direct': ['Restore the exact first headline, three exact detail questions and exact CTA.', 'Replace excess copy with the requested supporting-word budget and remove extra subheadings.', 'Apply the supplied Mozilla logo and brand identity.'],
      Ola: ['Add a distinct 12–18-word supporting paragraph on page 2.', 'Remove unrequested page indicators under this restrictive brief.', 'Make the repair path resolve actual content and layout defects.'],
    },
  },
  autonomy: 'No human edited the generated designs. Both Ola cases ended needs-review. The poster attempted invalid structural repairs; the carousel repair made no design change. Internal Ola QA scores are diagnostic only and are not independent comparative scores for Canva.',
  editing: 'Manual editing time and edit counts were not measured. Listed corrections are inspection judgments, not a timed editing benchmark.',
  limitations: [
    'Small exploratory sample: two familiar public brands, fresh briefs, no blinded independent rating or unfamiliar-brand test.',
    'Canva selection was fixed to the first returned candidate; no cherry-picking.',
    'Identical frozen briefs and brand assets were supplied. The Canva connector cannot upload the saved custom font files; font names and typography instructions were provided, so font-file parity cannot be guaranteed.',
    'Frozen Ola source verified: 438 files with no snapshot drift. Later root changes do not alter these original results.',
    'Canva credit/subscription cost is not exposed; recorded model-provider charges are not Canva’s total cost.',
    'One bounded continuation after the suggested credit interval obtained the carousel. The Story was then credit rejected. No additional attempts were launched.',
  ],
  nextPriorities: [
    'Make ordinary editorial label/detail arrangements executable and repairable before adding more decorative presets.',
    'Separate generated supporting-prose budgets from additional exact fields when the brief requires both; the current combined budget conflicts with the page-2 requirement.',
    'Let restrictive copy briefs suppress page indicators, and judge craft by the actual result rather than requiring every proposed decorative motif.',
    'Require further fresh matched evidence before broad professional-quality or Canva-superiority claims.',
  ],
};
const report = {
  createdAt: new Date().toISOString(), status: 'finished', professionalQualityEstablished: false,
  matchedPairs: matched.length, humanDesignEdits: 0, sourceFingerprint: m.fingerprint,
  sourceFilesVerified: frozen.sources.length, sourceDrift: false,
  assessment, providerCalls, providerCostUsd,
  canvaCreditCost: 'Not exposed; separate from recorded model-provider charges.', cases,
};
// Retain the first pilot report before replacing it with the completed assessment.
for (const [file, backup] of [['report.json', 'report-poster-pilot.json'], ['review.html', 'review-poster-pilot.html']]) {
  const old = path.join(directory, file), saved = path.join(directory, backup);
  if (fs.existsSync(old) && !fs.existsSync(saved)) fs.copyFileSync(old, saved);
}
fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const rel = file => path.relative(directory, file).split(path.sep).map(encodeURIComponent).join('/');
const list = values => `<ul>${values.map(v => `<li>${esc(v)}</li>`).join('')}</ul>`;
const sections = matched.map(c => {
  const a = assessment[c.format];
  return `<section><h2>${esc(c.label)} · ${esc(c.format)}</h2><p><strong>${esc(a.conclusion)}</strong></p>
  ${Array.from({ length: c.attempts.ola.pages.length }, (_, i) => `<h3>Page ${i + 1}</h3><div class="pair">${['canva-direct', 'ola'].map(engine => {
    const attempt = c.attempts[engine], page = attempt.pages[i];
    return `<figure><h3>${labels[engine]}</h3><a href="${rel(page.file)}"><img src="${rel(page.file)}" alt="${esc(c.company)} ${labels[engine]} page ${i + 1}"></a><figcaption>${page.width} × ${page.height} · ${esc(attempt.status)}${attempt.editUrl ? ` · <a href="${esc(attempt.editUrl)}">Editable Canva draft</a>` : ''}</figcaption></figure>`;
  }).join('')}</div>`).join('')}
  <div class="table"><table><thead><tr><th>Criterion</th><th>Canva Direct</th><th>Ola</th></tr></thead><tbody>${a.criteria.map(row => `<tr>${row.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
  <h3>Selected supplied logo</h3><img class="logo" src="${rel(c.input.assets.find(v => v.category === 'logo').path)}" alt="Selected ${esc(c.company)} logo asset">
  <h3>Remaining corrections</h3><div class="pair">${Object.entries(a.requiredCorrections).map(([engine, corrections]) => `<div><strong>${engine}</strong>${list(corrections)}</div>`).join('')}</div>
  <details><summary>Exact-copy evidence and original brief</summary><p>${esc(c.copyEvidence.method)}</p><table><tr><th>Quoted block</th><th>Canva occurrences</th><th>Ola occurrences</th></tr>${c.copyEvidence.ola.map((v, i) => `<tr><td>${esc(v.text)}</td><td>${c.copyEvidence.canva[i].count}</td><td>${v.count}</td></tr>`).join('')}</table><p><a href="${c.copyEvidence.readbackFile}">Read-only Canva text</a></p><pre>${esc(c.input.brief)}</pre></details>
  <details><summary>Ola’s internal review</summary><p>These scores are not independent comparative scores for Canva.</p><pre>${esc(JSON.stringify(c.attempts.ola.quality, null, 2))}</pre></details></section>`;
}).join('');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ola vs Canva · Current standings</title><style>*{box-sizing:border-box}body{font:16px/1.55 system-ui;background:#eef0f4;color:#192230;margin:0}main{max-width:1440px;margin:auto;padding:32px}h1{font-size:34px;letter-spacing:-.02em}h2{font-size:24px}h3{font-size:18px}.summary,section{background:white;padding:24px;border-radius:12px;margin:24px 0}.limit{background:#fff0d5;padding:16px;border-radius:8px}p{max-width:1080px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start;margin-bottom:26px}figure{margin:0}img{display:block;width:100%;height:auto;background:white;border:1px solid #dce0e7}figcaption,.meta{font-size:13px;color:#566271}a{color:#1856a8}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px;border-bottom:1px solid #dce0e7;vertical-align:top}details{margin:16px 0}pre{white-space:pre-wrap;font-size:12px}.logo{max-width:310px;padding:18px;background:white}.table{overflow-x:auto}@media(max-width:800px){main{padding:16px}.pair{grid-template-columns:1fr}h1{font-size:28px}td,th{padding:7px;font-size:13px}}</style><main><h1>Ola vs Canva: where we stand</h1><div class="summary"><strong>${esc(assessment.verdict)}</strong><p class="limit">${esc(assessment.scope)}</p><p class="meta">Same frozen briefs and assets · ${esc(m.fingerprint)} · ${frozen.sources.length} source files verified · no human design edits · ${providerCalls} model-provider calls, $${providerCostUsd.toFixed(8)} recorded model charges. Canva credit cost is not exposed.</p></div>${sections}<section><h2>Full comparison status</h2><div class="table"><table><tr><th>Case</th><th>Canva Direct</th><th>AI + Canva</th><th>Ola</th></tr>${cases.map(c => `<tr><td>${esc(c.label)}</td>${['canva-direct', 'canva-agent', 'ola'].map(engine => `<td>${esc(c.attempts[engine].status)}${!c.attempts[engine].startedAt ? ' · not started' : ''}</td>`).join('')}</tr>`).join('')}</table></div><p>${esc(assessment.autonomy)}</p><p>${esc(assessment.editing)}</p><h3>Limits of this comparison</h3>${list(assessment.limitations)}<h3>What this points to next</h3>${list(assessment.nextPriorities)}<a href="report.json">Full evidence report</a></section></main></html>`;
fs.writeFileSync(path.join(directory, 'review.html'), html);
console.log(JSON.stringify({ directory, matchedPairs: matched.length, providerCalls, providerCostUsd, sourceFilesVerified: frozen.sources.length, exactBlocks: matched.map(c => ({ case: c.label, canva: c.copyEvidence.canva.filter(v => v.count === 1).length, ola: c.copyEvidence.ola.filter(v => v.count === 1).length, required: c.copyEvidence.ola.length, olaSupportingWords: c.copyEvidence.olaSupportingWordCounts })) }));
