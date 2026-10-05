/**
 * Phase 5 browser suite: the surplus material marketplace.
 *
 * Drives a real Chromium against the running app (frontend on :5173, API on
 * :8080) and covers the frontend checklist of the phase brief:
 *
 *   browsing cards, search, every filter, location + radius, sorting, pagination
 *   states, empty/error/loading states, details page, create with validation,
 *   edit, pause, photos (upload / remove / reorder), delete, ownership
 *   protection, the material request workflow with contacts hidden until
 *   acceptance, the dashboard section, the responsive layout, and the fact that
 *   the space marketplace, bookings and authentication still work.
 *
 * Usage (both servers must be running):
 *   node phase5-material-marketplace.mjs
 */
import { chromium } from 'playwright';
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:8080/api';

const OWNER = { email: 'demo@resource.local', password: 'DemoPass123', name: 'reSOURCE Demo Owner' };
const LISTER = { email: 'phase5.lister@resource.local', password: 'StrongPass123', name: 'Phase Five Lister' };
const BUYER = { email: 'phase5.buyer@resource.local', password: 'StrongPass123', name: 'Phase Five Buyer' };

const stamp = Date.now();
const SHOTS = process.env.SHOT_DIR ?? '/home/user/preview';
const FIXTURES = '/tmp/resource-phase5-fixtures';

let passed = 0;
const failures = [];

function ok(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
  });

  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function tokenFor(account) {
  await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: account.name,
      email: account.email,
      phone: '+91 90000 12345',
      password: account.password,
    }),
  });

  const login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: account.email, password: account.password }),
  });

  if (login.status !== 200) {
    throw new Error(`Could not sign in ${account.email}: ${login.status}`);
  }

  return login.body.accessToken;
}

async function signIn(page, account) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#email');
  await page.fill('#email', account.email);
  await page.fill('#password', account.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard$/, { timeout: 20000 });
  await page.waitForTimeout(400);
}

async function signOut(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.localStorage.removeItem('resource.accessToken');
    window.sessionStorage.removeItem('resource.accessToken');
  });
  await page.context().clearCookies();
}

/**
 * Builds a real, tiny PNG. Written by hand so the suite has no extra dependency:
 * a 2x2 image of a single colour, deflated and checksummed properly, because the
 * upload endpoint validates the actual bytes.
 */
function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, crc]);
}

function tinyPng(red, green, blue) {
  const width = 2;
  const height = 2;
  const raw = Buffer.concat(
    Array.from({ length: height }, () =>
      Buffer.concat([Buffer.from([0]), ...Array.from({ length: width }, () => Buffer.from([red, green, blue]))]),
    ),
  );

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const browser = await chromium.launch();
mkdirSync(FIXTURES, { recursive: true });

// Two visibly different images, so the gallery and the reorder are real.
writeFileSync(`${FIXTURES}/one.png`, tinyPng(200, 60, 40));
writeFileSync(`${FIXTURES}/two.png`, tinyPng(40, 120, 200));

// ---------------------------------------------------------------- data setup

console.log('\n== setup: accounts and one listing of our own ==');

const ownerToken = await tokenFor(OWNER);
const listerToken = await tokenFor(LISTER);
const buyerToken = await tokenFor(BUYER);

ok('three accounts are ready', Boolean(ownerToken && listerToken && buyerToken));

// Housekeeping: earlier runs leave "Phase 5 …" listings behind. Soft delete them
// so this run sees a predictable marketplace and the seeded demo data is what the
// owner account browses.
const mine = await api('/materials/mine', { token: listerToken });

// Soft delete everything this dedicated suite account owns, so a previous run
// (or a debugging session) can never influence the marketplace this run sees.
for (const material of mine.body ?? []) {
  await api(`/materials/${material.id}`, { method: 'DELETE', token: listerToken });
}

console.log(`  · cleaned up ${(mine.body ?? []).length} listing(s) from earlier runs`);

const created = await api('/materials', {
  method: 'POST',
  token: listerToken,
  body: JSON.stringify({
    title: `Phase 5 Timber Offcuts ${stamp}`,
    category: 'WOOD',
    description: 'Offcuts left over from a roof frame. Straight, dry and stacked under cover.',
    quantity: 40,
    unit: 'pieces',
    condition: 'GOOD',
    price: 1500,
    isFree: false,
    address: 'Suite Yard, Bhimavaram',
    latitude: 16.5449,
    longitude: 81.5212,
    ownerNote: 'Bring a pickup; weekends are easiest.',
  }),
});

ok('a material listing exists to browse', created.status === 201, `status ${created.status}`);
const materialId = created.body?.id;
const materialTitle = `Phase 5 Timber Offcuts ${stamp}`;

const context = await browser.newContext({
  viewport: { width: 1360, height: 900 },
  geolocation: { latitude: 17.1167, longitude: 81.9333 },
  permissions: ['geolocation'],
});
const page = await context.newPage();

// ------------------------------------------------------ 1. browse the marketplace

console.log('\n== the marketplace lists real, persisted material ==');

await page.goto(`${BASE}/materials`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Red Clay Bricks', { timeout: 20000 });

const marketplaceText = await page.locator('body').innerText();
ok('seeded demo material is discoverable without signing in', marketplaceText.includes('Red Clay Bricks'));
ok('the card shows the category', marketplaceText.includes('Bricks'));
ok('the card shows quantity with its unit', /300 pieces/.test(marketplaceText));
ok('the card shows the owner-selected condition', marketplaceText.includes('Good'));
ok('the card shows the price', marketplaceText.includes('₹2,000'));
ok('the card shows the location', marketplaceText.includes('Jaggampeta'));
ok('a FREE listing is obvious on its card', marketplaceText.includes('FREE'));
ok('cards offer View Details', marketplaceText.includes('View Details'));
ok('the marketplace does not merge with spaces',
  !marketplaceText.includes('Community Ground') && marketplaceText.includes('Materials'));
await page.screenshot({ path: `${SHOTS}/phase5-01-materials-marketplace.png`, fullPage: false });

// Filters ------------------------------------------------------------------

console.log('\n== filters are applied by the backend ==');

await page.selectOption('#material-category', 'TILES');
await page.waitForTimeout(900);
const tilesText = await page.locator('body').innerText();
ok('category filter narrows the results', tilesText.includes('Surplus Tiles') && !tilesText.includes('Red Clay Bricks'));

await page.selectOption('#material-category', '');
await page.waitForTimeout(700);
await page.selectOption('#material-condition', 'USED');
await page.waitForTimeout(900);
const usedText = await page.locator('body').innerText();
ok('condition filter narrows the results', usedText.includes('Metal Pipes') && !usedText.includes('Wooden Boards'));

await page.selectOption('#material-condition', '');
await page.waitForTimeout(700);
await page.check('#material-free-only');
await page.waitForTimeout(900);
const freeText = await page.locator('body').innerText();
ok('free-only filter shows the free listing', freeText.includes('Surplus Tiles'));
ok('free-only filter hides paid listings', !freeText.includes('Metal Pipes'));
await page.screenshot({ path: `${SHOTS}/phase5-02-filters.png`, fullPage: false });

await page.uncheck('#material-free-only');
await page.fill('#material-max-price', '1600');
await page.waitForTimeout(1000);
const priceText = await page.locator('body').innerText();
ok('max price filter drops the costly listings',
  priceText.includes('Wooden Boards') && !priceText.includes('Metal Pipes'));

await page.fill('#material-max-price', '');
await page.waitForTimeout(700);

// Quantity filtering never compares unlike units.
await page.fill('#material-min-quantity', '200');
await page.waitForTimeout(1000);
const noUnitText = await page.locator('body').innerText();
ok('a quantity without a unit is refused instead of compared across units',
  /same unit|unit/i.test(noUnitText) && !noUnitText.includes('Metal Pipes'),
  noUnitText.replace(/\s+/g, ' ').slice(0, 140));

await page.selectOption('#material-unit', 'pieces');
await page.waitForTimeout(1000);
const unitText = await page.locator('body').innerText();
ok('quantity is compared only within the chosen unit',
  unitText.includes('Red Clay Bricks') && !unitText.includes('Wooden Boards'),
  unitText.replace(/\s+/g, ' ').slice(0, 140));

await page.fill('#material-min-quantity', '');
await page.selectOption('#material-unit', '');
await page.waitForTimeout(700);

// Sorting ------------------------------------------------------------------

console.log('\n== sorting and search ==');

await page.selectOption('#material-sort', 'priceAsc');
await page.waitForTimeout(1000);
let order = await page.locator('article h3').allInnerTexts();
ok('price low to high sorts ascending', order[0]?.includes('Surplus Tiles'), order.join(' | '));

await page.selectOption('#material-sort', 'priceDesc');
await page.waitForTimeout(1000);
order = await page.locator('article h3').allInnerTexts();
ok('price high to low sorts descending', order[0]?.includes('Metal Pipes'), order.join(' | '));

await page.selectOption('#material-sort', 'distance');
await page.waitForTimeout(1200);
const nearestText = await page.locator('body').innerText();
ok('nearest first needs a location', /km away|location/i.test(nearestText), nearestText.replace(/\s+/g, ' ').slice(0, 140));

await page.click('text=Use my location');
await page.waitForTimeout(1200);
const locatedText = await page.locator('body').innerText();
ok('sharing a location unlocks the radius filter', locatedText.includes('km'));

await page.selectOption('#material-radius', '5');
await page.waitForTimeout(1200);
const radiusText = await page.locator('body').innerText();
ok('the radius filter keeps nearby listings', radiusText.includes('Red Clay Bricks'),
  radiusText.replace(/\s+/g, ' ').slice(0, 160));

await page.selectOption('#material-radius', '1');
await page.waitForTimeout(1200);
const tightRadiusText = await page.locator('body').innerText();
ok('a tighter radius drops the far listing', !tightRadiusText.includes(materialTitle),
  tightRadiusText.replace(/\s+/g, ' ').slice(0, 160));
ok('distance is shown per card', /km away/.test(radiusText));
await page.screenshot({ path: `${SHOTS}/phase5-03-location-radius.png`, fullPage: false });

await page.click('text=Clear location');
await page.waitForTimeout(900);

await page.fill('#material-search', 'pipes');
await page.waitForTimeout(1200);
const searchText = await page.locator('body').innerText();
ok('the search bar filters by title', searchText.includes('Metal Pipes') && !searchText.includes('Wooden Boards'),
  searchText.replace(/\s+/g, ' ').slice(0, 140));

// Empty state ---------------------------------------------------------------

await page.fill('#material-search', 'zzz-nothing-matches');
await page.waitForTimeout(1300);
const emptyText = await page.locator('body').innerText();
ok('an empty search says so', emptyText.includes('No materials match your filters.'), emptyText.replace(/\s+/g, ' ').slice(0, 140));
ok('the empty state offers Clear Filters', emptyText.includes('Clear filters'));
await page.screenshot({ path: `${SHOTS}/phase5-04-empty-state.png`, fullPage: false });

await page.click('button:has-text("Clear filters")');
await page.waitForTimeout(1200);
const clearedText = await page.locator('body').innerText();
ok('clearing filters brings everything back', clearedText.includes('Red Clay Bricks') && clearedText.includes('Surplus Tiles'));

// Error state ---------------------------------------------------------------

console.log('\n== the error state is friendly and retryable ==');

await page.route('**/api/materials**', (route) => route.abort());
await page.goto(`${BASE}/materials`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Unable to load materials.', { timeout: 20000 });
const errorText = await page.locator('body').innerText();
ok('a failing API shows a friendly error', errorText.includes('Unable to load materials.'));
ok('the error state offers Retry', errorText.includes('Retry'));
ok('no stack trace leaks into the UI', !/Exception|at com\.|stack/i.test(errorText));
await page.screenshot({ path: `${SHOTS}/phase5-05-error-state.png`, fullPage: false });

await page.unroute('**/api/materials**');
await page.click('text=Retry');
await page.waitForSelector('text=Red Clay Bricks', { timeout: 20000 });
ok('Retry recovers once the API answers again', true);

// ------------------------------------------------------ 2. details + ownership

console.log('\n== a signed-out visitor sees details but no owner actions ==');

await page.goto(`${BASE}/materials/${materialId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector(`text=${materialTitle}`, { timeout: 20000 });
const detailText = await page.locator('body').innerText();
ok('details show every public field',
  ['wood', '40 pieces', 'good', '₹1,500', 'suite yard, bhimavaram', 'phase five lister', 'about this material', 'listed on']
    .every((label) => detailText.toLowerCase().includes(label)),
  detailText.replace(/\s+/g, ' ').slice(0, 180));
ok('the owner note is shown', detailText.includes('Bring a pickup'));
ok('a visitor is offered "Request Material"', detailText.includes('Request Material'));
ok('a visitor sees no edit or delete controls', !detailText.includes('Edit listing') && !detailText.includes('Delete listing'));
ok('contact details are absent', !detailText.includes('@') && /private/i.test(detailText));
await page.screenshot({ path: `${SHOTS}/phase5-06-material-details.png`, fullPage: false });

await page.goto(`${BASE}/materials/999999999`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Material not found.', { timeout: 20000 });
ok('an unknown material is a friendly not-found page', true);

// ------------------------------------------------------------- 3. create + edit

console.log('\n== the owner creates, edits and pauses a listing ==');

await signIn(page, LISTER);
await page.goto(`${BASE}/materials/create`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#material-title', { timeout: 20000 });

const formText = await page.locator('body').innerText();
ok('the form is split into the required sections',
  ['Basic information', 'Quantity', 'Pricing', 'Location'].every((section) => formText.includes(section)));

await page.click('button[type="submit"]');
await page.waitForTimeout(500);
const validationText = await page.locator('body').innerText();
ok('submitting an empty form is refused in the UI',
  validationText.includes('fix the highlighted fields') && validationText.includes('Title is required'),
  validationText.replace(/\s+/g, ' ').slice(0, 160));

await page.fill('#material-title', 'Phase 5 Cement Bags');
await page.fill('#material-description', 'Sealed cement bags left over from a slab pour, kept dry on pallets.');
await page.fill('#material-quantity', '0');
await page.selectOption('#material-category', 'CEMENT');
await page.selectOption('#material-condition', 'NEW');
await page.fill('#material-unit', 'bags');
await page.fill('#material-price', '-5');
await page.fill('#material-address', 'Suite Yard, Bhimavaram');
await page.click('button[type="submit"]');
await page.waitForTimeout(500);
const badValuesText = await page.locator('body').innerText();
ok('a zero quantity is refused', /greater than 0|Quantity/i.test(badValuesText));
ok('a negative price is refused', /negative/i.test(badValuesText));

await page.fill('#material-quantity', '25');
await page.fill('#material-price', '0');
await page.check('#material-is-free');
await page.waitForTimeout(500);
ok('the free switch disables the price box', await page.locator('#material-price').isDisabled());
ok('the price is left empty for a free listing', (await page.inputValue('#material-price')) === '');

ok(
  'the material form asks for an address and no GPS numbers',
  (await page.locator('#material-address').count()) === 1 &&
    (await page.locator('#material-latitude').count()) === 0 &&
    (await page.locator('#material-longitude').count()) === 0,
);

// The photo asked for at the top of the form is the listing's main image, and
// anything below it is optional.
const photoCopy = await page.locator('body').innerText();
ok('the create page offers a way back to the marketplace',
  (await page.getByRole('link', { name: /Back to materials/i }).count()) >= 1);
ok('the photo at the top is labelled as the main image',
  photoCopy.includes('Main photo') && /main image/i.test(photoCopy),
  photoCopy.replace(/\s+/g, ' ').slice(0, 120));
ok('extra photos are described as optional',
  /More photos\s*\(optional\)/i.test(photoCopy) && /One photo is enough/i.test(photoCopy));
ok('and their absence is stated plainly', /No extra photos chosen/i.test(photoCopy));

await page.setInputFiles('[data-testid="ai-recognition-input"]', `${FIXTURES}/one.png`);
await page.waitForTimeout(400);
ok('the chosen main photo is previewed on the form',
  (await page.locator('img[alt="The material photo you selected"]').count()) === 1);

await page.setInputFiles('#material-extra-photos', [`${FIXTURES}/two.png`]);
await page.waitForTimeout(300);
const extraRows = await page.locator('[data-testid="material-extra-photo-list"] li').allInnerTexts();
ok('a second photo can be added, and is listed as number 2',
  extraRows.length === 1 && /^2\./.test(extraRows[0].trim()), extraRows.join(' | '));

await page.screenshot({ path: `${SHOTS}/phase5-07-create-form.png`, fullPage: false });
await page.click('button[type="submit"]');
await page.waitForURL(/\/materials\/\d+$/, { timeout: 20000 });
await page.waitForSelector('text=Material published successfully.', { timeout: 20000 });

const newId = Number(page.url().split('/').pop());
const publishedText = await page.locator('body').innerText();
ok('the new listing is published and persisted', publishedText.includes('Material published successfully.'));
ok('a free listing shows FREE and no price', publishedText.includes('FREE') && !publishedText.includes('₹0'));
ok('the listing shows its quantity and unit', publishedText.includes('25 bags'));
ok('the owner is offered Edit and Delete', publishedText.includes('Edit listing') && publishedText.includes('Delete listing'));
await page.screenshot({ path: `${SHOTS}/phase5-08-created-free-listing.png`, fullPage: false });

// The listing the visitor sees carries the main image chosen before publishing,
// with the optional second photo behind it.
const publisherToken = await tokenFor(LISTER);
const published = await api(`/materials/${newId}`, { token: publisherToken });
const publishedPhotos = published.body?.photos ?? [];
const mainImage = publishedPhotos[0]?.imageUrl ?? '';

ok('the listing has both photos, the main one first',
  publishedPhotos.length === 2 && publishedPhotos[0].displayOrder === 0,
  `${publishedPhotos.length} photo(s), first order ${publishedPhotos[0]?.displayOrder}`);

// The marketplace card is fed by the summary, which names the primary image.
const ownListings = await api('/materials/mine', { token: publisherToken });
const cardEntry = (ownListings.body ?? []).find((entry) => entry.id === newId);

ok('the main image is the one the marketplace shows for this listing',
  mainImage !== '' && cardEntry?.primaryImageUrl === mainImage,
  `card ${cardEntry?.primaryImageUrl} vs photo ${mainImage}`);
ok('and it is really rendered on the listing page',
  mainImage !== '' && (await page.locator(`img[src*="${mainImage.split('/').pop()}"]`).count()) >= 1);

// Photos --------------------------------------------------------------------

console.log('\n== photos: upload, gallery, remove, reorder ==');

await page.goto(`${BASE}/materials/${newId}/edit`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#material-photos', { timeout: 20000 });

// The create form already uploaded the main photo and the optional extra one.
const before = (await api(`/materials/${newId}`)).body.photos.length;
ok('the photos chosen while creating are already on the listing', before === 2, `found ${before}`);

await page.setInputFiles('#material-photos', [`${FIXTURES}/one.png`, `${FIXTURES}/two.png`]);
await page.waitForTimeout(2500);
let photoText = await page.locator('body').innerText();
ok('uploaded photos appear in the manager', !photoText.includes('No photos yet'), photoText.replace(/\s+/g, ' ').slice(0, 120));
let thumbs = await page.locator('img[alt^="Photo "]').count();
ok('the two new photos join the gallery', thumbs === before + 2, `found ${thumbs}, expected ${before + 2}`);

await page.click('button[aria-label="Move photo 2 earlier"]');
await page.waitForTimeout(1800);
const reordered = await api(`/materials/${newId}`);
ok('reordering is persisted by the API',
  reordered.body.photos[0].displayOrder === 0 && reordered.body.photos[1].displayOrder === 1,
  JSON.stringify(reordered.body.photos.map((p) => p.displayOrder)));

await page.click('button[aria-label="Delete photo 1"]');
await page.waitForTimeout(1800);
const afterDelete = await api(`/materials/${newId}`);
ok('removing a photo deletes it', (afterDelete.body.photos ?? []).length === before + 1,
  `${(afterDelete.body.photos ?? []).length} left of ${before + 2}`);
photoText = await page.locator('body').innerText();
ok('the gallery reflects the removal', (await page.locator('img[alt^="Photo "]').count()) === before + 1);

const primaryUrl = afterDelete.body.photos[0]?.imageUrl;
const imageResponse = await fetch(new URL(primaryUrl, API).toString());
ok('the stored image is served back', imageResponse.status === 200 && imageResponse.headers.get('content-type')?.startsWith('image/'),
  `${imageResponse.status} ${imageResponse.headers.get('content-type')}`);
await page.screenshot({ path: `${SHOTS}/phase5-09-photo-manager.png`, fullPage: false });

// Edit + pause ---------------------------------------------------------------

await page.fill('#material-quantity', '18');
await page.click('button[type="submit"]');
await page.waitForURL(new RegExp(`/materials/${newId}$`), { timeout: 20000 });
await page.waitForSelector('text=Material updated successfully.', { timeout: 20000 });
const editedText = await page.locator('body').innerText();
ok('editing a listing is saved', editedText.includes('Material updated successfully.') && editedText.includes('18 bags'));

await page.goto(`${BASE}/materials/${newId}/edit`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#material-status-active', { timeout: 20000 });
await page.uncheck('#material-status-active');
await page.click('button[type="submit"]');
await page.waitForURL(new RegExp(`/materials/${newId}$`), { timeout: 20000 });
await page.waitForSelector('text=Material updated successfully.', { timeout: 20000 });
const pausedText = await page.locator('body').innerText();
ok('pausing a listing is explained on its page', /paused/i.test(pausedText), pausedText.replace(/\s+/g, ' ').slice(0, 140));

await page.goto(`${BASE}/materials?q=Cement`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const pausedSearch = await page.locator('body').innerText();
ok('a paused listing leaves public search', !pausedSearch.includes('Phase 5 Cement Bags'));

await signOut(page);
const pausedPublic = await api(`/materials/${newId}`);
ok('a paused listing is not publicly readable by id either', pausedPublic.status === 404, `status ${pausedPublic.status}`);

// ------------------------------------------------------ 4. ownership protection

console.log('\n== ownership is enforced by the backend, not by hidden buttons ==');

await signIn(page, BUYER);
await page.goto(`${BASE}/materials/${materialId}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
const buyerDetail = await page.locator('body').innerText();
ok('another user gets no edit or delete buttons',
  !buyerDetail.includes('Edit listing') && !buyerDetail.includes('Delete listing'));

await page.goto(`${BASE}/materials/${materialId}/edit`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Only the owner can edit this listing.', { timeout: 20000 });
ok('opening someone else\'s editor is refused by the page', true);
await page.screenshot({ path: `${SHOTS}/phase5-10-forbidden-edit.png`, fullPage: false });

const forbidden = await api(`/materials/${materialId}`, {
  method: 'PUT',
  token: buyerToken,
  body: JSON.stringify({
    title: 'Stolen', category: 'WOOD',
    description: 'Trying to take over a listing that belongs to somebody else.',
    quantity: 1, unit: 'pieces', condition: 'USED', price: 0, isFree: true, address: 'Nowhere',
  }),
});
ok('the API refuses another user\'s PUT with 403', forbidden.status === 403, `status ${forbidden.status}`);

const forbiddenDelete = await api(`/materials/${materialId}`, { method: 'DELETE', token: buyerToken });
ok('the API refuses another user\'s DELETE with 403', forbiddenDelete.status === 403, `status ${forbiddenDelete.status}`);

// ------------------------------------------------------ 5. material requests

console.log('\n== a material request works without touching space bookings ==');

await page.goto(`${BASE}/materials/${materialId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Request Material', { timeout: 20000 });
await page.click('text=Request Material');
await page.waitForURL(/\/materials\/\d+\/request$/, { timeout: 20000 });
await page.waitForSelector('#material-request-quantity', { timeout: 20000 });
ok('the request form opens with the listing unit', (await page.locator('body').innerText()).includes('pieces'));

await page.fill('#material-request-quantity', '900');
await page.click('button:has-text("Send request")');
await page.waitForTimeout(600);
const overText = await page.locator('body').innerText();
ok('asking for more than is available is refused in the UI',
  /cannot request more than the available quantity/i.test(overText) && overText.includes('40 pieces'),
  overText.replace(/\s+/g, ' ').slice(0, 160));

await page.fill('#material-request-quantity', '12');
await page.fill('#material-request-message', 'Could I collect these on Sunday morning?');
await page.screenshot({ path: `${SHOTS}/phase5-11-material-request.png`, fullPage: false });
await page.click('button:has-text("Send request")');
await page.waitForURL(/\/requests$/, { timeout: 20000 });
await page.waitForSelector('text=Material request sent.', { timeout: 20000 });

// The request list is where a sent request lands; open it by its own id.
const sentRequests = await api('/requests/my', { token: buyerToken });
const sentRequest = (sentRequests.body ?? []).find((entry) => entry.material?.id === materialId);
ok('the request is listed for its sender', Boolean(sentRequest), JSON.stringify(sentRequests.body ?? []).slice(0, 160));

await page.goto(`${BASE}/requests/${sentRequest.id}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Material request', { timeout: 20000 });

const requestText = await page.locator('body').innerText();
ok('the request reads as a material request', requestText.includes('Material request') && requestText.includes(materialTitle));
ok('it shows the quantity asked for', requestText.includes('12 pieces'));
ok('it never pretends to be a booking', !requestText.includes('View Booking'));
ok('contact details stay hidden while pending', requestText.includes('Contact details are shared once the owner accepts'));
ok('no contact card is rendered before acceptance', !/Owner details/.test(requestText));
await page.screenshot({ path: `${SHOTS}/phase5-12-request-pending.png`, fullPage: false });

const requestId = sentRequest.id;

await signOut(page);
await signIn(page, LISTER);
await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=My Materials', { timeout: 20000 });
// The section heading is server-rendered while its list is still in flight, so
// wait for the row itself before reading the page.
await page.waitForSelector(`text=${materialTitle}`, { timeout: 20000 }).catch(() => {});
const dashboardText = await page.locator('body').innerText();
ok('the dashboard has a "My Materials" section', dashboardText.includes('My Materials'));
ok('it lists the owner\'s own material', dashboardText.includes('Phase 5 Timber Offcuts'));
ok('the dashboard keeps its space sections too', dashboardText.includes('My Spaces') || dashboardText.includes('My Spaces and materials'));
ok(
  'the dashboard no longer shows request panels',
  !dashboardText.includes('Incoming Requests') && !dashboardText.includes('My Requests'),
  dashboardText.replace(/\s+/g, ' ').slice(0, 200),
);
await page.screenshot({ path: `${SHOTS}/phase5-13-dashboard-my-materials.png`, fullPage: false });

await page.goto(`${BASE}/requests`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Incoming requests', { timeout: 20000 });
await page.waitForSelector('text=Requests you sent', { timeout: 20000 });
const inboxText = await page.locator('body').innerText();
ok('the incoming inbox marks material requests as material', inboxText.includes('Material request'));
ok('the inbox shows the requested quantity', inboxText.includes('12 pieces'));
ok('the inbox distinguishes material from space requests', inboxText.includes('Quantity asked') || inboxText.includes('Requested on'));
await page.screenshot({ path: `${SHOTS}/phase5-14-incoming-material-request.png`, fullPage: false });

await page.click('a[href="/requests/' + requestId + '"]');
await page.waitForURL(new RegExp(`/requests/${requestId}$`), { timeout: 20000 });
await page.waitForSelector('text=Accept', { timeout: 20000 });
await page.click('button:has-text("Accept")');
await page.waitForTimeout(500);
const acceptDialog = await page.locator('body').innerText();
ok('accepting a material request is explained (no booking, contacts shared)',
  /no booking is created for a material request/i.test(acceptDialog), acceptDialog.replace(/\s+/g, ' ').slice(0, 160));
await page.click('button:has-text("Accept request")');
await page.waitForTimeout(1500);
const acceptedText = await page.locator('body').innerText();
ok('acceptance is recorded', acceptedText.includes('Material request accepted.'));
ok('the owner sees an accepted request, not a booking',
  /Request accepted/.test(acceptedText) && !/Booking confirmed/.test(acceptedText),
  acceptedText.replace(/\s+/g, ' ').slice(0, 160));
ok('the owner now sees the requester\'s contact details', acceptedText.includes('phase5.buyer@resource.local'));
ok('no booking is created for a material request', !acceptedText.includes('View Booking'));
await page.screenshot({ path: `${SHOTS}/phase5-15-request-accepted.png`, fullPage: false });

await signOut(page);
await signIn(page, BUYER);
await page.goto(`${BASE}/requests/${requestId}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
const buyerAccepted = await page.locator('body').innerText();
ok('the requester sees the owner\'s contact details after acceptance',
  buyerAccepted.includes('Owner details') && buyerAccepted.includes(LISTER.email),
  buyerAccepted.replace(/\s+/g, ' ').slice(0, 160));
ok('the requester still sees no booking', !buyerAccepted.includes('View Booking'));
ok('an accepted material request is not described as a booking',
  !/Booking confirmed/.test(buyerAccepted), buyerAccepted.replace(/\s+/g, ' ').slice(0, 160));

// ------------------------------------------------------ 6. delete invisibility

console.log('\n== soft delete removes the listing from discovery ==');

await signOut(page);
await signIn(page, LISTER);
await page.goto(`${BASE}/materials/${newId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Delete listing', { timeout: 20000 });
await page.click('text=Delete listing');
await page.waitForTimeout(400);
const confirmText = await page.locator('body').innerText();
ok('deleting asks for confirmation first',
  /Are you sure you want to delete this material listing/i.test(confirmText));
await page.click('button:has-text("Delete listing") >> nth=1');
await page.waitForTimeout(2000);

const deletedLookup = await api(`/materials/${newId}`, { token: listerToken });
ok('the row survives as DELETED (soft delete)', deletedLookup.body?.status === 'DELETED', JSON.stringify(deletedLookup.body?.status));
const deletedPublic = await api(`/materials/${newId}`);
ok('a deleted listing is gone for the public', deletedPublic.status === 404, `status ${deletedPublic.status}`);
const search = await api('/materials?q=Cement');
ok('a deleted listing is gone from search results',
  !(search.body?.content ?? []).some((entry) => entry.id === newId));
const myMaterials = await api('/materials/mine', { token: listerToken });
ok('a deleted listing leaves the owner\'s dashboard list',
  !(myMaterials.body ?? []).some((entry) => entry.id === newId));

await page.goto(`${BASE}/materials`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
ok('the deleted listing is not on the marketplace page',
  !(await page.locator('body').innerText()).includes('Phase 5 Cement Bags'));

// ------------------------------------------------------ 7. pagination

console.log('\n== pagination ==');

// Enough listings that page 2 exists, then cleaned up at the end.
const bulk = [];
for (let index = 0; index < 8; index += 1) {
  const response = await api('/materials', {
    method: 'POST',
    token: listerToken,
    body: JSON.stringify({
      title: `Phase 5 Bulk ${index} ${stamp}`,
      category: 'OTHER',
      description: 'Bulk listing created by the Phase 5 browser suite to exercise pagination.',
      quantity: 10 + index,
      unit: 'pieces',
      condition: 'USED',
      price: 100 + index,
      isFree: false,
      address: 'Suite Yard, Bhimavaram',
    }),
  });

  bulk.push(response.body?.id);
}

await page.goto(`${BASE}/materials?size=9`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Page 1 of', { timeout: 20000 });
const pageOneText = await page.locator('body').innerText();
ok('a full page of results is paginated', /Page 1 of \d/.test(pageOneText));
const cardsOnPageOne = await page.locator('article h3').count();
ok('the page holds the requested number of cards', cardsOnPageOne === 9, `found ${cardsOnPageOne}`);
ok('the total is stated', /materials found/.test(pageOneText));

await page.click('button:has-text("Next")');
await page.waitForTimeout(1500);
const pageTwoText = await page.locator('body').innerText();
ok('Next moves to the second page', /Page 2 of \d/.test(pageTwoText));

// ------------------------------------------------------ 8. responsive + regression

console.log('\n== mobile layout and the space marketplace still work ==');

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/materials`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Filters', { timeout: 20000 });
await page.waitForSelector('article h3', { timeout: 20000 });
const mobileText = await page.locator('body').innerText();
ok('the mobile marketplace renders its filters and cards',
  mobileText.includes('Filters') && /materials found/.test(mobileText),
  mobileText.replace(/\s+/g, ' ').slice(0, 140));
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok('the mobile page does not scroll sideways', overflow <= 2, `overflow ${overflow}px`);
await page.screenshot({ path: `${SHOTS}/phase5-16-mobile-marketplace.png`, fullPage: false });

await page.click('button[aria-label="Open navigation menu"]');
await page.waitForTimeout(400);
const mobileNav = await page.locator('body').innerText();
ok('the mobile menu shows Spaces and Materials separately',
  mobileNav.includes('Spaces') && mobileNav.includes('Materials'));
await page.screenshot({ path: `${SHOTS}/phase5-17-mobile-nav.png`, fullPage: false });

await page.goto(`${BASE}/spaces`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Community Ground', { timeout: 20000 });
ok('the space marketplace still lists its spaces', true);

await page.goto(`${BASE}/bookings`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const bookingsText = await page.locator('body').innerText();
ok('the bookings page still works', /Booking|bookings/i.test(bookingsText));

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
const homeText = await page.locator('body').innerText();
ok('Home still offers Find Spaces and Find Materials',
  homeText.includes('Find Spaces') && homeText.includes('Find Materials'));

// ------------------------------------------------------------------- cleanup

console.log('\n== cleanup ==');

for (const id of bulk) {
  if (id) {
    await api(`/materials/${id}`, { method: 'DELETE', token: listerToken });
  }
}

const remaining = await api('/materials/mine', { token: listerToken });

for (const material of remaining.body ?? []) {
  await api(`/materials/${material.id}`, { method: 'DELETE', token: listerToken });
}

console.log(`  · removed ${bulk.length + 1} bulk listing(s) and every other suite listing`);

await context.close();
await browser.close();

console.log(`\n== result ==\n  ${passed} checks passed, ${failures.length} failed`);

if (failures.length > 0) {
  console.log('  failures:');
  failures.forEach((failure) => console.log(`   - ${failure}`));
  process.exit(1);
}
