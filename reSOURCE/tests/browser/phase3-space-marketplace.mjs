/**
 * Phase 3 browser suite: the space marketplace in a real browser against the
 * running Vite dev server and Spring Boot API.
 *
 *   node space-marketplace.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const SHOTS = '/home/user/preview';

const OWNER = { email: 'demo@resource.local', password: 'DemoPass123' };
const OTHER = { email: 'ada@example.com', password: 'StrongPass123' };

mkdirSync(SHOTS, { recursive: true });

let passed = 0;
const failures = [];

function ok(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function login(page, account) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', account.email);
  await page.fill('#password', account.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
}

async function logout(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
}

function cardTitles(page) {
  return page.locator('article h3').allTextContents();
}

const API = process.env.API_URL ?? 'http://localhost:8080/api';

/**
 * Removes leftovers from earlier runs so the filter assertions see only the
 * seeded listings.
 */
async function cleanupTestListings() {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(OWNER),
  });

  if (!login.ok) {
    console.log('! could not sign in for cleanup, leaving existing listings alone');
    return;
  }

  const { accessToken } = await login.json();
  const mine = await fetch(`${API}/spaces/mine`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const listings = await mine.json();

  for (const listing of listings.filter((entry) => entry.title.startsWith('Test Ground'))) {
    await fetch(`${API}/spaces/${listing.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log(`  cleaned up leftover listing ${listing.id} (${listing.title})`);
  }
}

async function main() {
  await cleanupTestListings();

  const browser = await chromium.launch({ headless: true });

  try {
  const context = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  console.log('\n== public browsing ==');
  await page.goto(`${BASE}/spaces`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('article h3', { timeout: 15000 });

  const titles = await cardTitles(page);
  ok('spaces page lists seeded spaces', titles.length >= 3, titles.join(' | '));
  ok('seeded Community Ground is listed', titles.some((title) => title.includes('Community Ground')));
  ok(
    'cards show the FREE badge or a price',
    (await page.locator('article').first().locator('text=/FREE|₹/').count()) > 0,
  );
  ok(
    'cards label free activities in readable words',
    /Free for Blood Donation Camp/.test(await page.locator('article').first().locator('xpath=..').innerText().catch(() => '')) ||
      /Free for Blood Donation Camp/.test((await page.locator('body').innerText())),
  );
  ok(
    'cards show area and capacity',
    (await page.locator('article').first().getByText(/acres|sq ft|sq m/).count()) > 0 &&
      (await page.locator('article').first().getByText(/Up to/).count()) > 0,
  );
  await page.screenshot({ path: `${SHOTS}/phase3-01-spaces-desktop.png`, fullPage: true });

  console.log('\n== filters ==');
  await page.selectOption('#filter-activity', 'BLOOD_DONATION');
  await page.waitForTimeout(1200);
  const bloodTitles = await cardTitles(page);
  ok(
    'activity filter narrows to spaces offering that activity',
    bloodTitles.length === 2 && bloodTitles.every((title) => /Community Ground|Sunrise/.test(title)),
    bloodTitles.join(' | '),
  );

  await page.selectOption('#filter-activity', 'MARKET');
  await page.fill('#filter-max-price', '600');
  await page.waitForTimeout(1200);
  const marketTitles = await cardTitles(page);
  ok('activity + maximum price filter works', marketTitles.length === 1, marketTitles.join(' | '));

  await page.selectOption('#filter-activity', '');
  await page.fill('#filter-max-price', '0');
  await page.waitForTimeout(1200);
  const freeCount = await page.locator('article').count();
  ok('maximum price 0 shows free-only listings', freeCount === 3, String(freeCount));
  await page.screenshot({ path: `${SHOTS}/phase3-02-filters-free.png`, fullPage: true });

  await page.fill('#filter-max-price', '');
  await page.fill('#filter-min-capacity', '400');
  await page.waitForTimeout(1200);
  const bigTitles = await cardTitles(page);
  ok(
    'minimum capacity filter works',
    bigTitles.length === 1 && bigTitles[0].includes('Community Ground'),
    bigTitles.join(' | '),
  );

  await page.fill('#filter-min-capacity', '');
  await page.click('#filter-facility-STAGE');
  await page.fill('#filter-min-area', '');
  await page.waitForTimeout(1200);
  const stagedTitles = await cardTitles(page);
  ok('facility filter works', stagedTitles.length === 1, stagedTitles.join(' | '));

  console.log('\n== empty and error states ==');
  await page.selectOption('#filter-activity', 'SPORTS');
  await page.waitForTimeout(1200);
  const emptyVisible = await page
    .getByText('No spaces found.')
    .isVisible()
    .catch(() => false);
  ok('empty state appears when nothing matches', emptyVisible);
  await page.screenshot({ path: `${SHOTS}/phase3-03-empty-state.png`, fullPage: true });

  await page.getByRole('button', { name: /^Clear filters/ }).first().click();
  await page.waitForSelector('article h3');

  // Error state: fail the next space request, then retry.
  await page.route('**/api/spaces**', (route) => route.abort());
  await page.reload({ waitUntil: 'domcontentloaded' });
  const errorVisible = await page
    .locator('h2', { hasText: 'Unable to load spaces.' })
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  ok('error state appears when the API fails', errorVisible);
  await page.screenshot({ path: `${SHOTS}/phase3-04-error-state.png`, fullPage: true });

  await page.unroute('**/api/spaces**');
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.waitForSelector('article h3', { timeout: 15000 });
  ok('retry loads the spaces again', (await page.locator('article').count()) >= 3);

  // Loading skeleton: delay the response and check the placeholder renders.
  await page.route('**/api/spaces**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    try {
      await route.continue();
    } catch {
      // The navigation may have aborted the request already.
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const skeletonVisible = await page
    .locator('[aria-label="Loading spaces"]')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  ok('loading skeleton appears while fetching', skeletonVisible);
  await page.screenshot({ path: `${SHOTS}/phase3-05-loading-skeleton.png` });
  await page.unroute('**/api/spaces**');
  await page.waitForSelector('article h3');

  console.log('\n== space details ==');
  await page.waitForTimeout(800);
  const detailLink = page.getByRole('link', { name: /View details.*Community Ground/ }).first();
  await detailLink.waitFor({ state: 'visible' });
  await detailLink.click();
  await page.waitForURL(/\/spaces\/\d+$/, { timeout: 15000 });
  // Wait for the details view itself, not just the URL: the heading is the
  // first thing that proves the listing rendered.
  await page
    .locator('h1', { hasText: 'Community Ground' })
    .waitFor({ state: 'visible', timeout: 15000 });
  const detailHeading = await page.locator('h1').textContent();
  ok('details page opens', detailHeading?.includes('Community Ground') === true, detailHeading ?? '');

  const detailText = await page.locator('body').innerText();
  ok('details show facilities', /Road Access/.test(detailText));
  ok('details show per-activity pricing', /Market/.test(detailText) && /Medical Camp/.test(detailText));
  ok('details mark free activities', /FREE/.test(detailText));
  ok('details show the owner note', /free/i.test(detailText) && /Owner note/.test(detailText));
  ok('details show the owner name only', /Listings by/.test(detailText) && !/@/.test(detailText));
  ok(
    'no edit or delete buttons for anonymous visitors',
    (await page.getByRole('link', { name: 'Edit listing' }).count()) === 0 &&
      (await page.getByRole('button', { name: 'Delete listing' }).count()) === 0,
  );
  await page.screenshot({ path: `${SHOTS}/phase3-06-detail-anonymous.png`, fullPage: true });

  console.log('\n== create flow (validation + success) ==');
  await login(page, OWNER);
  await page.goto(`${BASE}/spaces/create`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1');

  // A create page must offer a way back without losing the site navigation.
  // (Checked before the empty submit below, so leaving and returning does not
  // wipe the validation state the next checks read.)
  const createBack = page.getByRole('link', { name: /Back to spaces/i }).first();
  ok('the create form offers a way back to the marketplace',
    (await createBack.count()) === 1 && (await createBack.getAttribute('href')) === '/spaces');
  await createBack.click();
  await page.waitForURL(/\/spaces$/, { timeout: 15000 });
  ok('and following it returns to the space marketplace', new URL(page.url()).pathname === '/spaces');

  await page.goto(`${BASE}/spaces/create`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#title', { timeout: 20000 });

  await page.getByRole('button', { name: 'List space' }).click();
  await page.waitForTimeout(400);

  let formText = await page.locator('body').innerText();
  ok('create form rejects an empty submission', /Title is required\./.test(formText));
  ok('create form requires a description', /Description is required\./.test(formText));
  ok('create form requires an address', /Address is required\./.test(formText));
  ok(
    'the form asks for an address and no GPS numbers',
    (await page.locator('#address').count()) === 1 &&
      (await page.locator('#latitude').count()) === 0 &&
      (await page.locator('#longitude').count()) === 0,
  );
  await page.screenshot({ path: `${SHOTS}/phase3-07-create-validation.png`, fullPage: true });

  const uniqueTitle = `Test Ground ${Date.now().toString().slice(-5)}`;
  await page.fill('#title', uniqueTitle);
  await page.fill('#description', 'A test ground created by the Phase 3 browser suite.');
  await page.fill('#address', 'Test Road, Bhimavaram');
  await page.fill('#area', '0.75');
  await page.selectOption('#areaUnit', 'ACRES');
  await page.fill('#capacity', '150');
  await page.fill('#availability', 'Weekends');
  await page.fill('#ownerNote', 'Test listing.');
  await page.click('#facility-PARKING');
  await page.click('#facility-WATER');

  await page.selectOption('#pricing-0-activity', 'MARKET');
  await page.fill('#pricing-0-price', '350');
  await page.getByRole('button', { name: 'Add activity' }).click();
  await page.selectOption('#pricing-1-activity', 'BLOOD_DONATION');
  await page.click('#pricing-1-free');
  await page.fill('#pricing-1-note', 'Free for camps');

  // Photo picker: a non-image is rejected, a real photo is previewed.
  await page.setInputFiles('#space-photos', '/tmp/pw2/fixtures/not-an-image.txt');
  await page.waitForTimeout(300);
  ok(
    'photo picker rejects a file that is not an image',
    /not a JPEG, PNG or WebP image/.test(await page.locator('body').innerText()),
  );

  await page.setInputFiles('#space-photos', [
    '/tmp/pw2/fixtures/ground-a.png',
    '/tmp/pw2/fixtures/ground-b.png',
  ]);
  await page.waitForTimeout(400);
  const pickerText = await page.locator('body').innerText();
  ok('photo picker shows the selected photos', /2 of 6 selected/.test(pickerText));
  await page.screenshot({ path: `${SHOTS}/phase3-07b-create-photos.png`, fullPage: true });

  await page.getByRole('button', { name: 'List space' }).click();
  await page.waitForURL(/\/spaces\/\d+$/, { timeout: 20000 });
  await page.waitForTimeout(600);
  const createdText = await page.locator('body').innerText();
  ok('success message after creating a space', /Space listed successfully\./.test(createdText));
  ok('new listing shows the entered title', createdText.includes(uniqueTitle));
  ok('new listing keeps the free activity free', /BLOOD_DONATION|Blood Donation/.test(createdText));

  const uploadedPhotos = await page
    .locator('img[src*="/api/files/spaces/"]')
    .count();
  ok('photos uploaded with the listing are shown', uploadedPhotos >= 2, String(uploadedPhotos));
  await page.screenshot({ path: `${SHOTS}/phase3-08-created.png`, fullPage: true });

  const createdUrl = page.url();
  const createdId = createdUrl.split('/').pop();

  console.log('\n== owner actions ==');
  ok(
    'owner sees edit and delete actions',
    (await page.getByRole('link', { name: 'Edit listing' }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Delete listing' }).count()) === 1,
  );

  await page.getByRole('link', { name: 'Edit listing' }).click();
  await page.waitForSelector('#title');
  ok('edit form is prefilled', (await page.inputValue('#title')) === uniqueTitle);
  ok('edit form prefills pricing', (await page.inputValue('#pricing-0-price')) === '350');

  // Photo tools on the edit page.
  const photoCountText = async () => (await page.locator('body').innerText()).match(/\d+ of 6 photos used/)?.[0] ?? '';
  ok('edit page shows the uploaded photos', /2 of 6 photos used/.test(await photoCountText()));

  await page.setInputFiles('#edit-space-photos', ['/tmp/pw2/fixtures/ground-c.png']);
  await page
    .locator('text=3 of 6 photos used')
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => undefined);
  ok('a photo can be added while editing', /3 of 6 photos used/.test(await photoCountText()));

  await page.getByRole('button', { name: 'Delete photo 2' }).click();
  await page
    .locator('text=2 of 6 photos used')
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => undefined);
  ok('a photo can be deleted while editing', /2 of 6 photos used/.test(await photoCountText()));

  await page.getByRole('button', { name: 'Move photo 1 later' }).click();
  await page.waitForTimeout(1200);
  ok(
    'photos can be reordered',
    !/could not be saved|not saved/.test(await page.locator('body').innerText()),
  );
  await page.screenshot({ path: `${SHOTS}/phase3-08b-edit-photos.png`, fullPage: true });

  const renamed = `${uniqueTitle} (edited)`;
  await page.fill('#title', renamed);
  await page.fill('#capacity', '180');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.waitForTimeout(2500);
  console.log(`  (after save: ${page.url()})`);

  if (!/\/spaces\/\d+$/.test(page.url())) {
    console.log(
      `  (form state: ${(await page.locator('body').innerText()).slice(0, 500).replace(/\n/g, ' ')})`,
    );
  }

  await page.waitForTimeout(500);
  const editedText = await page.locator('body').innerText();
  ok('success message after editing', /Space updated successfully\./.test(editedText));
  ok('edited title is shown', editedText.includes(renamed));
  await page.screenshot({ path: `${SHOTS}/phase3-09-edited.png`, fullPage: true });

  console.log('\n== ownership enforcement in the UI ==');
  await logout(page);
  await login(page, OTHER);
  await page.goto(`${BASE}/spaces/${createdId}/edit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const otherText = await page.locator('body').innerText();
  ok(
    'another user cannot open the edit form',
    /You can only edit spaces you listed\./.test(otherText),
  );

  await page.goto(`${BASE}/spaces/${createdId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  ok(
    'another user sees no delete action',
    (await page.getByRole('button', { name: 'Delete listing' }).count()) === 0,
  );

  // The other user must not see the owner's listing anywhere.
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=My Spaces', { timeout: 15000 });
  await page.waitForTimeout(1200);
  const otherDashboard = await page.locator('body').innerText();
  ok(
    'another user does not see the listing on their dashboard',
    !otherDashboard.includes(renamed) && /You have not listed a space yet\./.test(otherDashboard),
  );

  console.log('\n== dashboard and my spaces (owner) ==');
  await logout(page);
  await login(page, OWNER);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=My Spaces', { timeout: 15000 });
  await page.waitForTimeout(1200);
  const dashboardText = await page.locator('body').innerText();
  ok('dashboard lists the owner spaces section', /My Spaces/.test(dashboardText));
  ok('dashboard shows the created listing', dashboardText.includes(renamed));
  ok('dashboard shows the paused/active badge', /Active|Paused/.test(dashboardText));
  await page.screenshot({ path: `${SHOTS}/phase3-10-dashboard-my-spaces.png`, fullPage: true });

  await page.goto(`${BASE}/spaces/mine`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=My spaces', { timeout: 15000 });
  await page.waitForTimeout(1200);
  ok(
    'my spaces page lists the owner listings',
    (await page.locator('li').filter({ hasText: renamed }).count()) > 0,
  );
  await page.screenshot({ path: `${SHOTS}/phase3-11-my-spaces.png`, fullPage: true });

  console.log('\n== delete flow (confirmation dialog) ==');
  await page.goto(`${BASE}/spaces/${createdId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1');
  await page.getByRole('button', { name: 'Delete listing' }).click();
  await page.waitForSelector('[role="dialog"]');
  const dialogText = await page.locator('[role="dialog"]').innerText();
  ok(
    'delete confirmation uses the required wording',
    /Are you sure you want to delete this space\? This listing will no longer appear in search\./.test(
      dialogText,
    ),
    dialogText.replace(/\n/g, ' '),
  );
  await page.screenshot({ path: `${SHOTS}/phase3-12-delete-dialog.png` });

  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(300);
  ok(
    'cancelling keeps the listing',
    (await page.locator('[role="dialog"]').count()) === 0 &&
      (await page.locator('h1').textContent())?.includes(renamed) === true,
  );

  await page.getByRole('button', { name: 'Delete listing' }).click();
  await page.getByRole('button', { name: 'Delete space' }).click();
  await page.waitForURL(/\/spaces\/mine$/, { timeout: 20000 });
  await page.waitForTimeout(800);
  const afterDelete = await page.locator('body').innerText();
  ok('success message after deleting', /Space deleted successfully\./.test(afterDelete));
  ok('deleted space is gone from my spaces', !afterDelete.includes(renamed));
  await page.screenshot({ path: `${SHOTS}/phase3-13-after-delete.png`, fullPage: true });

  await page.goto(`${BASE}/spaces/${createdId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  ok(
    'deleted space is not reachable',
    /no longer available/.test(await page.locator('body').innerText()),
  );

  await page.goto(`${BASE}/spaces`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('article h3');
  ok(
    'deleted space disappears from search',
    !(await cardTitles(page)).some((title) => title.includes('Test Ground')),
  );

  console.log('\n== responsive layout ==');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/spaces`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('article h3');
  await page.waitForTimeout(600);
  const boxes = await page.locator('article').evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect()).map((rect) => ({ x: rect.x, y: rect.y })),
  );
  const singleColumn = new Set(boxes.map((box) => Math.round(box.x))).size === 1;
  ok('mobile shows a single column of cards', singleColumn, JSON.stringify(boxes.slice(0, 3)));
  await page.screenshot({ path: `${SHOTS}/phase3-14-spaces-mobile.png`, fullPage: true });

  await page.goto(`${BASE}/spaces/1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/phase3-15-detail-mobile.png`, fullPage: true });
  ok('mobile details page renders', (await page.locator('h1').count()) === 1);

  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto(`${BASE}/spaces`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('article h3');
  const desktopBoxes = await page.locator('article').evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().x),
  );
  ok(
    'desktop shows a multi column grid',
    new Set(desktopBoxes.map((x) => Math.round(x))).size >= 2,
    JSON.stringify(desktopBoxes.slice(0, 4)),
  );

  console.log('\n== protected routes ==');
  await logout(page);
  await page.goto(`${BASE}/spaces/create`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/login/, { timeout: 15000 });
  ok('create page redirects anonymous visitors to login', page.url().includes('/login'));

  const realErrors = consoleErrors.filter(
    (message) =>
      !message.includes('Failed to load resource') &&
      !message.includes('net::ERR_FAILED') &&
      !message.includes('The user aborted a request'),
  );
  ok('no unexpected console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  } finally {
    await browser.close();
  }

  console.log(`\n${passed} checks passed, ${failures.length} failed`);
  failures.forEach((failure) => console.log(`  - ${failure}`));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Suite crashed:', error);
  process.exitCode = 1;
});
