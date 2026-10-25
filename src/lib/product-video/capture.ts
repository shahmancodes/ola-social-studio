import fs from 'node:fs/promises';
import { filmCleanTakes } from './clean-take';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium, type BrowserContext, type Page } from 'playwright';
import sharp from 'sharp';
import { captureProxy, publicUrl, resolvePublic } from './network';
import { detectLogin, discoverFeature, LoginRequired, type DiscoveryPlanner, type DiscoveryReport } from './discovery';
import { authenticatePage } from './login';
import type { LoginCredentials } from './credentials';
import type { CaptureAsset, VideoInput, CaptureStepSchema } from './schema';
import type { z } from 'zod';

export async function captureProduct(input: VideoInput, directory: string, report: (message: string, progress: number) => void = () => {}, options: { credentials?: LoginCredentials; planner?: DiscoveryPlanner } = {}) {
  publicUrl(input.url); await resolvePublic(new URL(input.url).hostname);
  await fs.mkdir(directory, { recursive: true });
  const recordingDir = await fs.mkdtemp(path.join(directory, '.recording-'));
  const proxy = await captureProxy();
  const browser = await chromium.launch({ headless: true, proxy: { server: proxy.url, bypass: '<-loopback>' }, args: ['--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] }).catch(async error => { proxy.close(); await fs.rm(recordingDir, { recursive: true, force: true }); throw error; });
  const deadline = setTimeout(() => void browser.close(), 8 * 60_000);
  const assets: CaptureAsset[] = []; const warnings: string[] = []; let authOrigin: string | undefined; let credentialsInFlight = false;
  const contextOptions = { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.5, colorScheme: input.theme, reducedMotion: 'reduce' as const, serviceWorkers: 'block' as const, acceptDownloads: false };
  const configure = async (context: BrowserContext) => {
    await context.route('**/*', async route => {
      const request = route.request();
      try {
        if (request.url().startsWith('data:') || request.url().startsWith('blob:')) return route.continue();
        const url = publicUrl(request.url());
        if (credentialsInFlight && url.origin !== authOrigin) return route.abort();
        // Login gets a narrowly scoped same-origin POST exception in an unrecorded context.
        const loginPost = authOrigin === url.origin && request.method() === 'POST';
        if ((!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !loginPost) || request.resourceType() === 'media') return route.abort();
        return route.continue();
      } catch { return route.abort(); }
    });
    await context.routeWebSocket('**/*', socket => socket.close());
  };
  const settlePage = async (page: Page) => { await page.waitForLoadState('domcontentloaded').catch(() => {}); await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {}); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(500); };
  const navigate = async (page: Page, url: string) => {
    publicUrl(url); const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await settlePage(page); publicUrl(page.url());
    if (await detectLogin(page)) return;
    if (response && response.status() >= 400) throw new Error(`Website returned HTTP ${response.status()}. Try a direct feature URL.`);
    const body = (await page.locator('body').innerText()).slice(0, 4000);
    if (/verify (you are|you're) human|checking your browser|just a moment\.\.\.|access denied/i.test(body)) throw new Error('This page has a browser challenge. Use an accessible demo or a direct feature URL.');
  };
  try {
    let storageState: Awaited<ReturnType<BrowserContext['storageState']>> | undefined;
    if (options.credentials) {
      const credentials = options.credentials;
      publicUrl(credentials.url); if (new URL(credentials.url).origin !== credentials.origin || new URL(credentials.url).protocol !== 'https:') throw new Error('Invalid login origin.');
      const loginContext = await browser.newContext(contextOptions); await configure(loginContext);
      try {
        report('Signing in securely', 4); const loginPage = await loginContext.newPage(); loginPage.setDefaultTimeout(12000);
        authOrigin = credentials.origin; await navigate(loginPage, credentials.url);
        credentialsInFlight = true; await authenticatePage(loginPage, credentials, () => settlePage(loginPage));
        storageState = await loginContext.storageState();
      } finally { credentialsInFlight = false; authOrigin = undefined; await loginContext.close(); }
    }
    const context = await browser.newContext({ ...contextOptions, storageState, recordVideo: { dir: recordingDir, size: { width: 1440, height: 1000 } } }); await configure(context);
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    context.on('page', popup => { if (popup !== page) void popup.close(); });
    const settle = () => settlePage(page);
    const capture = async (step: z.infer<typeof CaptureStepSchema>) => {
      if (await detectLogin(page)) throw new LoginRequired(page.url());
      const target = step.selector ? page.locator(step.selector) : undefined;
      if (target) await target.scrollIntoViewIfNeeded();
      const bytes = target ? await target.screenshot({ animations: 'disabled', timeout: 15000 }) : await page.screenshot({ animations: 'disabled', timeout: 15000 });
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      if (assets.some(a => a.sha256 === hash)) return false;
      const meta = await sharp(bytes).metadata();
      if ((meta.width ?? 0) < 100 || (meta.height ?? 0) < 100) throw new Error(`Capture "${step.label}" is too small. Select a larger panel.`);
      const id = `capture-${assets.length + 1}`, file = `${id}.png`; await fs.writeFile(path.join(directory, file), bytes);
      assets.push({ id, file, url: page.url(), title: await page.title(), label: step.label, selector: step.selector, width: meta.width!, height: meta.height!, sha256: hash, capturedAt: new Date().toISOString() }); return true;
    };
    report('Opening product in a headless browser', 5); const started = Date.now(); await navigate(page, input.url);
    let discovery: DiscoveryReport | undefined;
    if (!input.steps.length) {
      discovery = await discoverFeature({ page, input, settle, capture, report, planner: options.planner, saveReport: async result => { await fs.writeFile(path.join(directory, 'discovery.json'), JSON.stringify(result, null, 2)); } });
    } else {
      for (const [index, step] of input.steps.entries()) {
        report(`Capturing ${index + 1}/${input.steps.length}: ${step.label}`, 10 + Math.round(index / input.steps.length * 75));
        if (step.url) await navigate(page, step.url);
        if (await detectLogin(page)) throw new LoginRequired(page.url());
        for (const action of step.actions) {
          if (action.type === 'drag') { await page.mouse.move(action.from.x, action.from.y); await page.mouse.down(); try { await page.mouse.move(action.to.x, action.to.y, { steps: 18 }); } finally { await page.mouse.up(); } }
          else if (action.type === 'scroll') await page.evaluate(y => window.scrollTo(0, y), action.y);
          else { const target = page.locator(action.selector); if (action.type === 'click') await target.click(); else if (action.type === 'fill') { if (await target.getAttribute('type') === 'password') throw new LoginRequired(page.url()); await target.fill(action.value); } else if (action.type === 'select') await target.selectOption(action.value); else await target.press(action.key); }
        }
        await settle(); if (!await capture(step)) warnings.push(`Skipped duplicate capture: ${step.label}.`);
      }
    }
    const recording = page.video(); await context.close();
    if (!recording) throw new Error('Browser recording was not created.');
    await recording.saveAs(path.join(directory, 'session.webm'));
    let takes: Awaited<ReturnType<typeof filmCleanTakes>> = { assets: [], clips: [] };
    const clean = await browser.newContext({ ...contextOptions, reducedMotion: 'no-preference', storageState }); await configure(clean);
    try {
      const takePage = await clean.newPage(); takePage.setDefaultTimeout(8000); clean.on('page', popup => { if (popup !== takePage) void popup.close(); });
      await navigate(takePage, input.url);
      takes = await filmCleanTakes(takePage, discovery?.recipe ?? input.steps, directory, url => navigate(takePage, url), report);
    } catch (error) { warnings.push(`Clean replay could not complete: ${error instanceof Error ? error.message.slice(0, 240) : 'Unknown error'}. The director can only use verified still captures.`); }
    finally { await clean.close(); }
    warnings.push('The separate exploration recording includes planning pauses. Directed scenes use clean replay clips when available.');
    return { assets: [...assets, ...takes.assets], clips: takes.clips, warnings: [...new Set(warnings)], discovery, recording: { file: 'session.webm', seconds: Math.round((Date.now() - started) / 1000) } };
  } finally { clearTimeout(deadline); await browser.close(); proxy.close(); await fs.rm(recordingDir, { recursive: true, force: true }); }
}
