import type { Page } from 'playwright';
import type { LoginCredentials } from './credentials';
import { LoginRequired } from './discovery';

/** Credentials never enter the agent, capture context, recording, or action history. */
export async function authenticatePage(page: Page, credentials: LoginCredentials, settle: () => Promise<void>) {
  const checkOrigin = () => { if (new URL(page.url()).origin !== credentials.origin) throw new LoginRequired(credentials.url, 'The login moved to another domain. Open a direct password login URL; SSO is not supported yet.'); };
  try {
    checkOrigin();
    const username = page.locator('input[type="email"]:visible, input[autocomplete="username"]:visible, input[name*="user" i]:visible, input[name*="email" i]:visible').first();
    if (!await username.count()) throw new Error('No username field');
    await username.fill(credentials.username);
    let password = page.locator('input[type="password"]:visible').first();
    if (!await password.count()) {
      const next = page.getByRole('button', { name: /^(continue|next|sign in|log in)$/i }).first();
      if (!await next.count()) throw new Error('No next button'); await next.click(); await settle(); checkOrigin();
      password = page.locator('input[type="password"]:visible').first();
    }
    if (!await password.count()) throw new Error('No password field');
    await password.fill(credentials.password); checkOrigin();
    const form = password.locator('xpath=ancestor::form[1]');
    if (await form.count()) {
      const action = await form.getAttribute('action');
      if (action && new URL(action, page.url()).origin !== credentials.origin) throw new Error('Cross-origin login form');
    }
    const submit = (await form.count() ? form : page).locator('button[type="submit"], input[type="submit"]').filter({ visible: true }).first();
    if (await submit.count()) await submit.click(); else await password.press('Enter');
    await settle();
    if (await page.locator('input[type="password"]:visible, input[autocomplete="one-time-code"]:visible').count()) throw new Error('Login or verification remains');
    const body = (await page.locator('body').innerText()).slice(0, 4000);
    if (/verification code|two.factor|authenticator|check your (email|inbox)|invalid (credentials|password)|incorrect password/i.test(body)) throw new Error('Verification required');
  } catch (error) {
    if (error instanceof LoginRequired) throw error;
    // Never propagate Playwright errors from credential filling: they can include values.
    throw new LoginRequired(credentials.url, 'Login did not complete. Check the credentials. MFA, CAPTCHA, magic links and SSO need an interactive login flow, which is not supported yet.');
  }
}
