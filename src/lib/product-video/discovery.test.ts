import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { discoverFeature, observePage, groundedTarget, LoginRequired, type DiscoveryReport } from './discovery';
import { authenticatePage } from './login';
import { VideoInputSchema } from './schema';
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });
const input = VideoInputSchema.parse({ url: 'https://fixture.example', feature: 'Search for a planet and show its details.' });
describe('grounded discovery in a real browser', () => {
  it('observes live controls, recovers from an invalid target, interacts and captures the actual result', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.setContent('<main><h1>Planet finder</h1><input aria-label="Search planets"><button onclick="document.querySelector(\'h1\').textContent=document.querySelector(\'input\').value;this.textContent=\'Result found\'">Search</button><input type="password" style="display:none"></main>');
    let calls = 0; const shots: string[] = []; let saved: DiscoveryReport | undefined;
    const result = await discoverFeature({ page, input, settle: async () => {}, report: () => {}, saveReport: async r => { saved = structuredClone(r); }, capture: async () => { shots.push(await page.locator('main').innerText()); return true; }, planner: async observation => {
      calls++; const find = (tag: string) => observation.elements.find(e => e.tag === tag)!.id;
      if (calls === 1) return { type: 'click', target: 'invented', reason: 'Unobserved ID must fail' };
      if (calls === 2) return { type: 'capture', label: 'Find a planet', reason: 'Starting search screen' };
      if (calls === 3) return { type: 'fill', target: find('input'), value: 'Saturn', reason: 'Enter sample query' };
      if (calls === 4) return { type: 'click', target: find('button'), reason: 'Run search' };
      if (calls === 5) return { type: 'capture', label: 'Explore Saturn', reason: 'Search result visible' };
      expect(observation.text).toContain('Saturn'); return { type: 'done', evidence: 'Saturn result is visible.' };
    } });
    expect(result.recipe).toHaveLength(2); expect(result.recipe[1].actions.map(a => a.type)).toEqual(['fill', 'click']); expect(result.events[0].outcome).toContain('not in'); expect(shots[1]).toContain('Saturn'); expect(saved?.summary).toContain('Saturn'); await page.close();
  });
  it('pauses before any model call or screenshot on a password login page', async () => {
    const page = await browser.newPage(); await page.setContent('<input type="email"><input type="password">');
    const planner = vi.fn(); const capture = vi.fn();
    await expect(discoverFeature({ page, input, planner, capture, settle: async () => {}, report: () => {}, saveReport: async () => {} })).rejects.toBeInstanceOf(LoginRequired);
    expect(planner).not.toHaveBeenCalled(); expect(capture).not.toHaveBeenCalled(); await page.close();
  });
  it('refuses destructive controls and requires observed targets', async () => {
    const page = await browser.newPage(); await page.setContent('<button>Delete account</button><button>Search</button>');
    const observation = await observePage(page);
    expect(() => groundedTarget(observation, observation.elements[0].id, 'click')).toThrow('outside');
    expect(() => groundedTarget(observation, 'fake', 'fill')).toThrow('not in'); await page.close();
  });
  it('discovers nonsemantic controls while excluding controls under an overlay', async () => {
    const page = await browser.newPage();
    await page.setContent('<div style="position:relative;width:300px;height:200px"><button>Hidden action</button><div style="position:absolute;inset:0;background:white"><span>New Project</span></div></div>');
    const observation = await observePage(page);
    expect(observation.elements.some(e => e.text === 'New Project')).toBe(true);
    expect(observation.elements.some(e => e.text === 'Hidden action')).toBe(false); await page.close();
  });
  it('cannot finish with duplicate or insufficient screenshots', async () => {
    const page = await browser.newPage(); await page.setContent('<h1>Search</h1>');
    await expect(discoverFeature({ page, input, maxSteps: 2, planner: async () => ({ type: 'done', evidence: 'Claim without captures' }), capture: async () => false, settle: async () => {}, report: () => {}, saveReport: async () => {} })).rejects.toThrow('limit'); await page.close();
  });
});
describe('isolated login', () => {
  it('submits credentials directly and handles login without a model', async () => {
    const context = await browser.newContext(); const page = await context.newPage(); let received = '';
    await context.route('https://fixture.example/**', async route => {
      if (route.request().method() === 'POST') { received = route.request().postData() || ''; return route.fulfill({ contentType: 'text/html', body: '<h1>Signed in workspace</h1>' }); }
      return route.fulfill({ contentType: 'text/html', body: '<form method="post" action="/session"><input name="username" autocomplete="username"><input type="password" name="password"><button type="submit">Sign in</button></form>' });
    });
    await page.goto('https://fixture.example/login');
    await authenticatePage(page, { origin: 'https://fixture.example', url: page.url(), username: 'demo@example.com', password: 'fixture-secret' }, async () => { await page.waitForLoadState('networkidle'); });
    expect(received).toContain('fixture-secret'); expect(await page.locator('h1').innerText()).toContain('Signed in'); await context.close();
  });
  it('rejects cross-origin forms and sanitizes login errors', async () => {
    const page = await browser.newPage(); await page.route('https://fixture.example/**', route => route.fulfill({ contentType: 'text/html', body: '<form action="https://other.example"><input type="email"><input type="password"><button>Sign in</button></form>' })); await page.goto('https://fixture.example/login');
    const failure = await authenticatePage(page, { origin: 'https://fixture.example', url: page.url(), username: 'private-user', password: 'private-password' }, async () => {}).catch(e => e);
    expect(failure).toBeInstanceOf(LoginRequired); expect(failure.message).not.toContain('private-'); await page.close();
  });
});
