// Run with: node --import tsx scripts/audit-semantic-components.mjs [output directory]
// Uses the production renderer; no model calls, account access or external assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { SEMANTIC_COMPONENT_CHOICES, createSemanticComponent } from '../src/lib/semantic-component-presets.ts';
import { semanticComponentHtml, SEMANTIC_COMPONENT_CSS } from '../src/lib/semantic-components.ts';

const output = path.resolve(process.argv[2] || 'output/semantic-audit');
await fs.mkdir(output, { recursive: true });
const font = await fs.readFile('node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2');
const fontCss = `@font-face{font-family:Manrope;src:url(data:font/woff2;base64,${font.toString('base64')})}`;
const css = `${fontCss}*{box-sizing:border-box}body{margin:0;background:#f3f3f6;font-family:Manrope,Arial,sans-serif}header{padding:32px 36px 8px}h1{font-size:28px;margin:0}header p{color:#666}main{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:20px 36px 36px}article{background:#fff;border:1px solid #dedee6;border-radius:14px;overflow:hidden}h2{font-size:14px;font-weight:600;margin:0;padding:16px 20px;border-bottom:1px solid #eee}.frame{margin:24px;container-type:inline-size;height:300px;--rd-accent:#6848c9}${SEMANTIC_COMPONENT_CSS}`;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Semantic component library</title><style>${css}</style><header><h1>Semantic component library</h1><p>${SEMANTIC_COMPONENT_CHOICES.length} editable components · shared preview and export renderer · illustrative data</p></header><main>${SEMANTIC_COMPONENT_CHOICES.map(c => `<article><h2>${c.name}</h2><div class="frame">${semanticComponentHtml(createSemanticComponent(c.kind))}</div></article>`).join('')}</main></html>`;
await fs.writeFile(path.join(output, 'gallery.html'), html);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await page.route('**/*', route => route.abort());
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const cards = await page.locator('article').all();
  for (let index = 0; index < cards.length; index += 9) {
    const first = await cards[index].boundingBox();
    const last = await cards[Math.min(index + 8, cards.length - 1)].boundingBox();
    const top = index === 0 ? 0 : first.y - 12;
    await page.screenshot({ fullPage: true, path: path.join(output, `gallery-${Math.floor(index / 9) + 1}.png`), clip: { x: 0, y: top, width: 1440, height: last.y + last.height + 12 - top } });
  }

  const cases = SEMANTIC_COMPONENT_CHOICES.map(c => ({ name: c.kind, component: createSemanticComponent(c.kind) }));
  const pair = createSemanticComponent('relatedPair');
  pair.items[0].label = 'The observation that started the discussion';
  pair.items[0].detail = 'Describe the specific evidence and the circumstances that made it worth discussing with the team.';
  pair.items[1].label = 'The surrounding context';
  pair.items[1].detail = 'Explain what helps the reader interpret the observation without assuming it caused the outcome.';
  cases.push({ name: 'relatedPair-long', component: pair });
  for (const kind of ['processSteps', 'metricGrid', 'bulletChart', 'comparison']) {
    const component = createSemanticComponent(kind);
    component.items = Array.from({ length: 4 }, (_, i) => ({ ...component.items[i % component.items.length], label: ['Agree on the customer problem', 'Build a useful first version', 'Review the evidence together', 'Decide what happens next'][i], detail: 'A practical explanation that wraps onto several lines.' }));
    cases.push({ name: `${kind}-long`, component });
  }
  for (const kind of ['lineChart', 'histogram']) {
    const component = createSemanticComponent(kind);
    component.items = Array.from({ length: 12 }, (_, i) => ({ ...component.items[i % component.items.length], label: `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][i]} 2026` }));
    cases.push({ name: `${kind}-long`, component });
  }
  const dated = createSemanticComponent('timeline');
  dated.items = dated.items.map((item, i) => ({ ...item, tag: `Q${i + 1} 2026` }));
  cases.push({ name: 'timeline-long', component: dated });
  const report = [];
  for (const [width, height] of [[1080, 760], [640, 450], [360, 253], [960, 540], [360, 640]]) {
    for (const entry of cases) {
      if (height === 640 && !entry.name.startsWith('relatedPair')) continue;
      await page.setContent(`<style>${fontCss}*{box-sizing:border-box}body{margin:0}.frame{width:${width}px;height:${height}px;container-type:inline-size;--rd-accent:#6848c9}${SEMANTIC_COMPONENT_CSS}</style><div class="frame">${semanticComponentHtml(entry.component)}</div>`);
      await page.evaluate(() => document.fonts.ready);
      const outside = await page.evaluate(() => {
        const root = document.querySelector('.rd-semantic'), bounds = root.getBoundingClientRect(), results = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (!node.textContent.trim() || node.parentElement.closest('title,desc,style')) continue;
          const range = document.createRange(); range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          if (rect.width && rect.height && (rect.left < bounds.left - 2 || rect.right > bounds.right + 2 || rect.top < bounds.top - 2 || rect.bottom > bounds.bottom + 2)) results.push(node.textContent);
        }
        return results;
      });
      report.push({ name: entry.name, width, height, outside });
      if (entry.name.endsWith('-long') && ([640, 960].includes(width) || height === 640)) await page.locator('.frame').screenshot({ path: path.join(output, `${entry.name}-${width}.png`) });
    }
  }
  await fs.writeFile(path.join(output, 'bounds.json'), JSON.stringify(report, null, 2));
  const failures = report.filter(r => r.outside.length);
  console.log(JSON.stringify({ output, components: SEMANTIC_COMPONENT_CHOICES.length, rendersChecked: report.length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
