import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { RenderInternals, getVideoMetadata, makeCancelSignal } from '@remotion/renderer';
import type { Page } from 'playwright';
import type { z } from 'zod';
import type { CaptureStepSchema, ClipAsset, CaptureAsset } from './schema';
import { detectLogin, LoginRequired, unsafeControl } from './discovery';

type Step = z.infer<typeof CaptureStepSchema>;
type Box = { x: number; y: number; width: number; height: number };
/** Source pixel bounds become normalized framing guides, not invented product content. */
export function focusBounds(boxes: Box[]) {
  if (!boxes.length) return { x: .15, y: .15, width: .7, height: .7 };
  const left = Math.max(0, Math.min(...boxes.map(b => b.x)) - 55);
  const top = Math.max(0, Math.min(...boxes.map(b => b.y)) - 55);
  const right = Math.min(1440, Math.max(...boxes.map(b => b.x + b.width)) + 55);
  const bottom = Math.min(1000, Math.max(...boxes.map(b => b.y + b.height)) + 55);
  return { x: left / 1440, y: top / 1000, width: (right - left) / 1440, height: (bottom - top) / 1000 };
}
/** A bounded CDP take: frame timestamps share the browser clock; no exploration/LLM pauses. */
async function recordTake(page: Page, directory: string, id: string, perform: () => Promise<void>) {
  const session = await page.context().newCDPSession(page);
  const temporary = await fs.mkdtemp(path.join(directory, '.take-'));
  const frames: { data: Buffer; at: number }[] = [];
  let overflow = false;
  session.on('Page.screencastFrame', event => {
    if (frames.length < 700) frames.push({ data: Buffer.from(event.data, 'base64'), at: event.metadata.timestamp ?? Date.now() / 1000 }); else overflow = true;
    void session.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  });
  try {
    await session.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1334, everyNthFrame: 1 });
    await page.waitForTimeout(180); await perform(); await page.waitForTimeout(650);
    await session.send('Page.stopScreencast');
    if (overflow || frames.length < 2) throw new Error('The clean take exceeded its frame limit or produced no motion.');
    const first = frames[0].at, last = frames.at(-1)!.at;
    if (last - first > 16) throw new Error('This interaction is too long for one clean take.');
    // Duplicate still frames to preserve their actual on-screen duration, then encode at 30 fps.
    const lines: string[] = [];
    for (let i = 0; i < frames.length; i++) {
      const name = `frame-${String(i).padStart(4, '0')}.jpg`;
      await fs.writeFile(path.join(temporary, name), frames[i].data);
      lines.push(`file '${name}'`, `duration ${Math.max(1 / 120, i + 1 < frames.length ? frames[i + 1].at - frames[i].at : .65).toFixed(6)}`);
    }
    lines.push(`file 'frame-${String(frames.length - 1).padStart(4, '0')}.jpg'`);
    await fs.writeFile(path.join(temporary, 'frames.txt'), lines.join('\n'));
    const file = `${id}.mp4`; const { cancel, cancelSignal } = makeCancelSignal(); const timer = setTimeout(cancel, 60000);
    try { await RenderInternals.callFf({ bin: 'ffmpeg', args: ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '1', '-i', path.join(temporary, 'frames.txt'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-r', '30', '-fps_mode', 'cfr', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', '-y', path.join(directory, file)], indent: false, logLevel: 'error', binariesDirectory: null, cancelSignal }); }
    finally { clearTimeout(timer); }
    const metadata = await getVideoMetadata(path.join(directory, file));
    if (!metadata.durationInSeconds || metadata.durationInSeconds < .3) throw new Error('Clean clip encoding failed.');
    return { startedAt: first, file, seconds: metadata.durationInSeconds, width: metadata.width, height: metadata.height, fps: 30, sha256: crypto.createHash('sha256').update(await fs.readFile(path.join(directory, file))).digest('hex') };
  } finally { await session.send('Page.stopScreencast').catch(() => {}); await session.detach(); await fs.rm(temporary, { recursive: true, force: true }); }
}
export async function filmCleanTakes(page: Page, steps: Step[], directory: string, navigate: (url: string) => Promise<void>, report: (message: string, progress: number) => void) {
  const assets: CaptureAsset[] = [], clips: ClipAsset[] = [];
  // A real cursor overlay is recorded with the action, so editing cannot detach it from the UI.
  const installPointer = () => page.evaluate(() => {
    document.getElementById('ola-take-pointer')?.remove();
    const cursor = document.createElement('div'); cursor.id = 'ola-take-pointer';
    cursor.style.cssText = 'position:fixed;left:-100px;top:-100px;width:24px;height:30px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 2px 2px #0004)';
    cursor.innerHTML = '<svg viewBox="0 0 28 36"><path d="M2 1L2 29L10 22L16 34L23 31L17 19L27 18Z" fill="#7c5ce7" stroke="white" stroke-width="2"/></svg>';
    document.documentElement.append(cursor);
    document.addEventListener('mousemove', event => { cursor.style.left = event.clientX + 'px'; cursor.style.top = event.clientY + 'px'; });
    document.addEventListener('mousedown', () => { cursor.style.filter = 'drop-shadow(0 0 7px #8b5cf6)'; });
    document.addEventListener('mouseup', () => { cursor.style.filter = 'drop-shadow(0 2px 2px #0004)'; });
  });
  await installPointer();
  const snapshot = async (label: string) => {
    if (await detectLogin(page)) throw new LoginRequired(page.url());
    await page.locator('#ola-take-pointer').evaluate(el => { (el as HTMLElement).style.visibility = 'hidden'; }).catch(() => {});
    let bytes: Buffer; try { bytes = await page.screenshot({ animations: 'disabled' }); } finally { await page.locator('#ola-take-pointer').evaluate(el => { (el as HTMLElement).style.visibility = ''; }).catch(() => {}); }
    const meta = await sharp(bytes).metadata(); const id = `take-still-${assets.length + 1}`, file = id + '.png';
    await fs.writeFile(path.join(directory, file), bytes);
    const asset: CaptureAsset = { id, file, url: page.url(), title: await page.title(), label, width: meta.width!, height: meta.height!, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), capturedAt: new Date().toISOString(), take: true }; assets.push(asset); return asset;
  };
  const drawingBounds: Box[] = [];
  let previous = await snapshot('Clean starting state'); let cursor = { x: 700, y: 700 };
  const move = async (x: number, y: number, milliseconds = 350) => {
    const from = { ...cursor }, count = Math.max(8, Math.round(milliseconds / 25));
    for (let n = 1; n <= count; n++) { const t = n / count, ease = t * t * (3 - 2 * t); await page.mouse.move(from.x + (x - from.x) * ease, from.y + (y - from.y) * ease); await page.waitForTimeout(milliseconds / count); }
    cursor = { x, y };
  };
  for (const [stepIndex, step] of steps.entries()) {
    if (step.url) { await navigate(step.url); await installPointer(); drawingBounds.length = 0; previous = await snapshot('Before ' + step.label); }
    if (!step.actions.length) continue;
    report(`Filming clean take ${stepIndex + 1}: ${step.label}`, 78 + Math.min(15, stepIndex * 3));
    const boxes: Box[] = [], dragBoxes: Box[] = [], events: ClipAsset['events'] = []; 
    const encoded = await recordTake(page, directory, `take-${clips.length + 1}`, async () => {
      for (const action of step.actions) {
        if (await detectLogin(page)) throw new LoginRequired(page.url());
        const start = Date.now() / 1000;
        if (action.type === 'drag') {
          const box = { x: Math.min(action.from.x, action.to.x), y: Math.min(action.from.y, action.to.y), width: Math.abs(action.to.x - action.from.x), height: Math.abs(action.to.y - action.from.y) }; boxes.push(box); dragBoxes.push(box); drawingBounds.push(box);
          await move(action.from.x, action.from.y); await page.mouse.down(); try { await move(action.to.x, action.to.y, 1100); } finally { await page.mouse.up(); }
        } else if (action.type === 'scroll') { await page.evaluate(y => window.scrollTo({ top: y, behavior: 'smooth' }), action.y); await page.waitForTimeout(600); }
        else {
          const target = page.locator(action.selector); const type = await target.getAttribute('type');
          if (['password', 'file', 'hidden'].includes(type ?? '')) throw new Error('A sensitive input appeared during the clean take.');
          const label = await target.getAttribute('aria-label') || await target.getAttribute('title') || (action.selector !== 'body' ? await target.innerText().catch(() => '') : '');
          if (unsafeControl.test(label + ' ' + (await target.getAttribute('href') ?? ''))) throw new Error('The replay target changed to a control outside the demonstration scope.');
          const box = await target.boundingBox(); if (box && action.selector !== 'body') { boxes.push(box); await move(box.x + box.width / 2, box.y + box.height / 2); }
          if (action.type === 'click') await target.click({ timeout: 5000 });
          else if (action.type === 'fill') { await target.fill(''); await target.pressSequentially(action.value, { delay: Math.min(65, 2000 / Math.max(1, action.value.length)) }); }
          else if (action.type === 'select') await target.selectOption(action.value);
          else await target.press(action.key);
        }
        await page.waitForTimeout(180); events.push({ action: action.type, start, end: Date.now() / 1000 });
      }
    });
    const after = await snapshot(step.label);
    const { startedAt, ...media } = encoded;
    clips.push({ id: `take-${clips.length + 1}`, ...media, label: step.label, startAssetId: previous.id, endAssetId: after.id, actionCount: step.actions.length, focus: focusBounds(dragBoxes.length ? drawingBounds : boxes), events: events.map(event => ({ ...event, start: Math.max(0, event.start - startedAt), end: Math.min(encoded.seconds, event.end - startedAt) })) });
    previous = after;
  }
  return { assets, clips };
}
