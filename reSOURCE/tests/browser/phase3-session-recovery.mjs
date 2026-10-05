/**
 * Regression test for the reported problem: a stale token in storage must not
 * sign the user out after they log in or register again.
 */
import { chromium } from 'playwright';

const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const stamp = Date.now();
const email = `race.${stamp}@example.com`;
const password = 'StrongPass123';

let passed = 0;
const failures = [];
const ok = (name, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const token = () => page.evaluate(() => window.localStorage.getItem('resource.accessToken'));

// 1. Create the account first (fresh context, no stale token).
console.log('\n== a fresh account ==');
await page.goto(`${BASE}/register`, { waitUntil: 'load' });
await page.fill('#name', 'Race User');
await page.fill('#email', email);
await page.fill('#phone', '+91 90000 54321');
await page.fill('#password', password);
await page.fill('#confirmPassword', password);
await page.getByRole('button', { name: /Create Account/ }).click();
await page.waitForTimeout(2000);
ok('register lands on the dashboard', new URL(page.url()).pathname === '/dashboard', page.url());
ok('token stored', Boolean(await token()));

await page.getByRole('link', { name: 'Profile' }).first().click();
await page.waitForTimeout(1500);
ok('profile opens', new URL(page.url()).pathname === '/profile', page.url());

// 2. The reported scenario: a stale token is in storage, the restore is slow,
//    and the user signs in while it is still in flight.
console.log('\n== stale token + slow session check + fresh login ==');
await page.evaluate(() => window.localStorage.setItem('resource.accessToken', 'stale.token.value'));
await page.route('**/api/auth/me', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 4000));
  await route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ status: 401, error: 'Unauthorized', message: 'Your session has expired.' }),
  });
});

await page.goto(`${BASE}/login`, { waitUntil: 'load' });
// The route stays in place: the stale answer must arrive *while* the user is
// signing in, which is exactly the reported situation.
await page.fill('#email', email);
await page.fill('#password', password);
await page.click('button[type="submit"]');
await page.waitForTimeout(1000);
const afterLogin = new URL(page.url()).pathname;
const tokenAfterLogin = await token();
ok('login is accepted', afterLogin === '/dashboard' || afterLogin === '/profile', afterLogin);
ok('a real token replaced the stale one', Boolean(tokenAfterLogin) && tokenAfterLogin !== 'stale.token.value');

// Wait for the slow, stale 401 to land - it must not end the new session.
await page.waitForTimeout(6000);
ok('slow stale 401 does not sign the user out', new URL(page.url()).pathname !== '/login', page.url());
ok('token still present after the stale answer', (await token()) === tokenAfterLogin);

await page.unroute('**/api/auth/me');
await page.goto(`${BASE}/profile`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
ok('profile opens after a full page load', new URL(page.url()).pathname === '/profile', page.url());
const profileText = await page.locator('body').innerText();
ok('profile shows the account', profileText.includes(email));

await page.goto(`${BASE}/spaces/create`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
ok('create space stays available', new URL(page.url()).pathname === '/spaces/create', page.url());

// 3. An expired/invalid token on a cold start is cleared, not looped.
console.log('\n== genuinely expired session ==');
await page.evaluate(() => window.localStorage.setItem('resource.accessToken', 'expired.token.value'));
await page.goto(`${BASE}/dashboard`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
ok('expired token sends the user to the login page once', new URL(page.url()).pathname === '/login', page.url());
ok('the unusable token is cleared', (await token()) === null, String(await token()));

// 4. The bounce is explained on the login page.
console.log('\n== the user is told why ==');
await page.evaluate(() => window.localStorage.setItem('resource.accessToken', 'expired.token.value'));
await page.goto(`${BASE}/dashboard`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const loginText = await page.locator('body').innerText();
ok(
  'login page explains the expired session',
  /session ended because the saved sign-in expired/i.test(loginText),
  loginText.split('\n').slice(0, 8).join(' / '),
);

await browser.close();
console.log(`\n${passed} checks passed, ${failures.length} failed`);
failures.forEach((f) => console.log('  - ' + f));
if (failures.length) process.exitCode = 1;
