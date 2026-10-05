import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('/home/user/preview', { recursive: true });

const base = process.env.APP_URL ?? 'http://localhost:5173';
const stamp = Date.now();
const email = `phase2.user.${stamp}@example.com`;
const password = 'StrongPass123';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(String(e)));

const log = (...args) => console.log(...args);
const path = () => new URL(page.url()).pathname;

// ------------------------------------------------------- 1. protected redirect
await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
log('01. /dashboard while signed out   ->', path(), '| login page shown:', await page.locator('h1').innerText());

// ---------------------------------------------------------- 2. client validation
await page.getByRole('button', { name: 'Login' }).click();
await page.waitForTimeout(200);
log('02. empty login form              ->', await page.locator('p#email-error').innerText());

// --------------------------------------------------------------- 3. register flow
await page.goto(`${base}/register`, { waitUntil: 'networkidle' });
await page.fill('#name', 'Grace Hopper');
await page.fill('#email', email);
await page.fill('#phone', '+91 91234 56789');
await page.fill('#password', password);
await page.fill('#confirmPassword', 'DifferentPass1');
await page.getByRole('button', { name: /Create Account/ }).click();
await page.waitForTimeout(250);
log('03. password mismatch blocked     ->', await page.locator('p#confirmPassword-error').innerText());

await page.fill('#confirmPassword', password);
await page.screenshot({ path: '/home/user/preview/register-desktop.png', fullPage: true });
await page.getByRole('button', { name: /Create Account/ }).click();
await page.waitForURL(`${base}/dashboard`, { timeout: 15000 });
const token = await page.evaluate(() => window.localStorage.getItem('resource.accessToken'));
log('04. register -> login -> JWT      -> landed on', path(), '| token in localStorage:', token ? `${token.slice(0, 16)}… (${token.length} chars)` : 'NONE');
log('    navbar greeting               ->', await page.locator('header').getByRole('link', { name: 'Grace' }).innerText());

// ------------------------------------------------- 5. signed-in users skip auth pages
await page.goto(`${base}/register`, { waitUntil: 'networkidle' });
log('05. /register while signed in     ->', path());
await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
log('    /login while signed in        ->', path());

// ------------------------------------------------------------------ 6. profile
await page.goto(`${base}/profile`, { waitUntil: 'networkidle' });
await page.waitForSelector('dl');
const rows = async () => page.locator('dl dd').allInnerTexts();
log('06. profile from GET /users/me    ->', JSON.stringify(await rows()));
await page.screenshot({ path: '/home/user/preview/profile-desktop.png', fullPage: true });

// -------------------------------------------------------------- 7. refresh keeps session
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('dl');
log('07. after browser refresh         ->', path(), '| still signed in:', JSON.stringify(await rows()));

// ------------------------------------------------------------- 8. edit the profile
await page.getByRole('button', { name: /Edit Profile/ }).click();
await page.waitForSelector('#name');
await page.fill('#phone', '+91 90000 22222');
await page.fill('#email', `grace.${stamp}@example.com`);
await page.screenshot({ path: '/home/user/preview/profile-edit-desktop.png', fullPage: true });
await page.getByRole('button', { name: /Save changes/ }).click();
await page.waitForSelector('dl');
log('08. PUT /users/me (edit saved)     ->', JSON.stringify(await rows()));
log('    success notice                ->', (await page.locator('[role="status"]').innerText()).replace(/\s+/g, ' '));

// ------------------------------------------------- 9. server side duplicate email
await page.getByRole('button', { name: /Edit Profile/ }).click();
await page.waitForSelector('#email');
await page.fill('#email', 'ada@example.com');
await page.getByRole('button', { name: /Save changes/ }).click();
await page.waitForSelector('[role="alert"]');
log('09. duplicate email rejected (409) ->', (await page.locator('[role="alert"]').innerText()).replace(/\s+/g, ' '));
log('    field level error              ->', await page.locator('p#email-error').innerText());
await page.getByRole('button', { name: /Cancel/ }).click();

// ------------------------------------------------------------------ 10. logout
await page.getByRole('main').getByRole('button', { name: /^Logout$/ }).click();
await page.waitForURL(`${base}/login`, { timeout: 15000 });
const tokenAfterLogout = await page.evaluate(() => window.localStorage.getItem('resource.accessToken'));
log('10. logout from /profile           ->', path(), '| token:', tokenAfterLogout ?? 'cleared');

// --------------------------------------------------- 11. protected routes again
for (const route of ['/dashboard', '/requests', '/profile']) {
  await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
  log(`11. ${route.padEnd(11)} signed out ->`, path());
}

// -------------------------------------------------- 12. wrong password + retry
// Use the navbar link so the router state from the previous redirect is dropped.
await page.getByRole('banner').getByRole('link', { name: 'Login' }).click();
await page.waitForURL(`${base}/login`);
await page.fill('#email', `grace.${stamp}@example.com`);
await page.fill('#password', 'WrongPassword1');
await page.getByRole('button', { name: 'Login' }).click();
await page.waitForSelector('[role="alert"]');
log('12. wrong password (401)           ->', (await page.locator('[role="alert"]').innerText()).replace(/\s+/g, ' '));
await page.screenshot({ path: '/home/user/preview/login-error-desktop.png', fullPage: true });

await page.fill('#password', password);
await page.getByRole('button', { name: 'Login' }).click();
await page.waitForURL(`${base}/dashboard`, { timeout: 15000 });
log('13. login succeeds                 ->', path());

// ------------------------------------------------ 14. logout entry points
await page.getByRole('banner').getByRole('button', { name: 'Logout' }).click();
await page.waitForURL(`${base}/login`, { timeout: 15000 });
log('14. logout on a protected page      ->', path(), '(session gone:', (await page.evaluate(() => window.localStorage.getItem('resource.accessToken'))) === null, ')');

await page.fill('#email', `grace.${stamp}@example.com`);
await page.fill('#password', password);
await page.getByRole('button', { name: 'Login' }).click();
await page.waitForURL(`${base}/dashboard`, { timeout: 15000 });
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.getByRole('banner').getByRole('button', { name: 'Logout' }).click();
await page.waitForTimeout(900);
log('    logout on a public page stays   ->', path());

// ------------------------------------------ 15. login returns to requested page
await page.goto(`${base}/requests`, { waitUntil: 'networkidle' });
log('15. /requests signed out            ->', path());
await page.fill('#email', `grace.${stamp}@example.com`);
await page.fill('#password', password);
await page.getByRole('button', { name: 'Login' }).click();
await page.waitForURL(`${base}/requests`, { timeout: 15000 });
log('    after login, returned to        ->', path());
await page.screenshot({ path: '/home/user/preview/requests-desktop.png', fullPage: true });

// ---------------------------------------------- 16. expired/invalid stored token
await page.evaluate(() =>
  window.localStorage.setItem('resource.accessToken', 'eyJhbGciOiJIUzI1NiJ9.bogus.signature'),
);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForURL(`${base}/login`, { timeout: 15000 });
const tokenAfterExpiry = await page.evaluate(() => window.localStorage.getItem('resource.accessToken'));
log('16. invalid stored token cleared    ->', path(), '| token:', tokenAfterExpiry ?? 'cleared');

// ------------------------------------------------------------------ 17. mobile
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mobilePage = await mobile.newPage();
const mobileErrors = [];
mobilePage.on('pageerror', (e) => mobileErrors.push(String(e)));
mobilePage.on('console', (m) => {
  if (m.type() === 'error') mobileErrors.push(`console: ${m.text()}`);
});

await mobilePage.goto(`${base}/login`, { waitUntil: 'networkidle' });
await mobilePage.screenshot({ path: '/home/user/preview/login-mobile.png', fullPage: true });

await mobilePage.goto(`${base}/register`, { waitUntil: 'networkidle' });
await mobilePage.fill('#name', 'Mobile Tester');
await mobilePage.fill('#email', `mobile.${stamp}@example.com`);
await mobilePage.fill('#phone', '+91 90000 33333');
await mobilePage.fill('#password', password);
await mobilePage.fill('#confirmPassword', password);
await mobilePage.getByRole('button', { name: /Create Account/ }).click();
await mobilePage.waitForURL(`${base}/dashboard`, { timeout: 15000 });
log('17. mobile register -> dashboard    ->', new URL(mobilePage.url()).pathname);

await mobilePage.getByRole('button', { name: /open navigation menu/i }).click();
await mobilePage.waitForTimeout(250);
log('    mobile menu (signed in)         ->', (await mobilePage.locator('#mobile-navigation').innerText()).replace(/\s+/g, ' ').slice(0, 140));
await mobilePage.screenshot({ path: '/home/user/preview/nav-mobile-signed-in.png' });

await mobilePage.goto(`${base}/profile`, { waitUntil: 'networkidle' });
await mobilePage.waitForSelector('dd');
await mobilePage.screenshot({ path: '/home/user/preview/profile-mobile.png', fullPage: true });
log('    horizontal overflow on 390px    ->', await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));

await mobilePage.goto(`${base}/`, { waitUntil: 'networkidle' });
const badge = await mobilePage.locator('header').getByText(/Backend (Connected|Offline)/).first().innerText();
log('18. phase 1 health badge            ->', badge.trim());

log('\nDESKTOP CONSOLE ERRORS:', JSON.stringify(consoleErrors));
log('DESKTOP PAGE ERRORS:', JSON.stringify(pageErrors));
log('MOBILE ERRORS:', JSON.stringify(mobileErrors));

await browser.close();
