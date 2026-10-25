// Reproduce the implementation proof from the saved candidate. No model calls or record writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';
import { composePage } from '../src/lib/composition.ts';
import { buildVisualScene, scenePng, sceneSvg } from '../src/lib/content-layout.ts';
import { sceneIssues, sceneFontCss } from '../src/lib/scene-renderer.ts';
import { canvasTexts } from '../src/lib/canvas-text.ts';
import { semanticComponentHtml, SEMANTIC_COMPONENT_CSS } from '../src/lib/semantic-components.ts';
import { semanticFontFaces } from '../src/lib/semantic-component-image.ts';
import { SEMANTIC_COMPONENT_INTEGRATIONS } from '../src/lib/semantic-component-integrations.ts';

const output = path.resolve('output/component-candidate-review');
await fs.mkdir(output, { recursive: true });
const db = new DatabaseSync('.data/comparison/component-candidates/candidates.sqlite', { readOnly: true });
const candidate = JSON.parse(db.prepare('SELECT record_json FROM candidates WHERE id=?').get('97396de5-0347-44ca-aac2-b2fdf24a3258').record_json);
db.close();
const sample = { ...candidate.sample, semanticComponent: { ...candidate.sample.semanticComponent, kind: 'relatedPair' } };
const plan = { family: 'diagram-led', bodyMode: 'text', intent: { goal: 'Connect the observation with its context.', relationship: 'relationship', reason: 'Two complementary peers without sequence or causality.' }, responsive: { version: 1, balance: { version: 1 }, readability: { version: 1 }, arrangement: 'stack', focal: 'artwork', anchor: 'center', visualWeight: .6, visual: { treatment: 'plain' } } };
const formats = ['poster', 'story', 'post', 'carousel', 'presentation'];
const report = [];
let fontCss = '';
for (const format of formats) {
  const page = composePage(sample, plan);
  const scene = await buildVisualScene(format, page, candidate.brand);
  await fs.writeFile(path.join(output, `${format}.png`), await scenePng(scene));
  fontCss = await sceneFontCss(scene);
  await fs.writeFile(path.join(output, `${format}.svg`), sceneSvg(scene).replace('><rect', `><style>${fontCss}</style><rect`));
  const editable = canvasTexts(scene, page).filter(t => t.source.startsWith('semanticComponent.'));
  const issues = sceneIssues(scene);
  report.push({ format, issues, editableSources: editable.map(t => t.source) });
  // A component prompt identical to the page title shares its canonical title binding.
  const pairTexts = scene.elements.filter(e => e.kind === 'text' && e.id?.startsWith('semanticComponent.'));
  if (issues.length || editable.length !== 4 || pairTexts.length !== 5) throw Error(`${format}: ${JSON.stringify(report.at(-1))}`);
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const article = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Related pair</title><style>${fontCss}${await semanticFontFaces()}*{box-sizing:border-box}body{margin:0;padding:40px;background:${candidate.brand.palette.background};color:${candidate.brand.palette.ink}}.frame{width:920px;height:520px;container-type:inline-size;--rd-accent:${candidate.brand.palette.accent}}${SEMANTIC_COMPONENT_CSS}.rd-semantic{--sc-font:OlaBody!important;--sc-heading-font:OlaHeading!important}</style><div class="frame">${semanticComponentHtml(sample.semanticComponent)}</div></html>`;
await fs.writeFile(path.join(output, 'article.html'), article);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  await page.route('**/*', route => route.abort());
  await page.setContent(article);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, 'article.png') });
} finally { await browser.close(); }
formats.push('article');
const decisions = SEMANTIC_COMPONENT_INTEGRATIONS.map(entry => `<section><h2>${escape(entry.candidateName)}</h2><p><strong>${entry.decision === 'implemented' ? 'Implemented as Related pair' : 'Not added separately'}</strong></p><p>${escape(entry.note)}</p></section>`).join('');
await fs.writeFile(path.join(output, 'gallery.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Component candidate review</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f4f6;color:#17202a;font:16px/1.55 system-ui,sans-serif;padding:40px}header,section{max-width:1000px}h1{margin:0}h2{font-size:22px}section{padding:12px 0;border-bottom:1px solid #ddd}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-top:32px}figure{margin:0;background:white;padding:16px;border-radius:12px}figcaption{font-weight:600;text-transform:capitalize;margin-bottom:12px}img{width:100%;height:520px;object-fit:contain;object-position:top}@media(max-width:900px){main{grid-template-columns:1fr}img{height:auto}}</style><header><h1>Component candidate review</h1><p>Related pair · implemented native text and connectors · six format previews</p></header>${decisions}<main>${formats.map(f => `<figure><figcaption>${f}</figcaption><a href="${f}.${f === 'article' ? 'html' : 'svg'}"><img src="${f}.png" alt="Related pair in ${f} format"></a></figure>`).join('')}</main></html>`);
await fs.writeFile(path.join(output, 'checks.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, formats, issues: report.flatMap(r => r.issues) }));
