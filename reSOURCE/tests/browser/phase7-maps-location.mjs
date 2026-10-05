/**
 * Phase 7 browser suite: maps, location and geographic discovery.
 *
 * Drives a real Chromium against the running app and covers the phase brief:
 *
 *   browsing with no location at all, sharing a location, the distance the
 *   backend calculates, the 1/5/10/25 km radius options, the map view with its
 *   own markers and popups, the space map and the material map staying
 *   independent, the location section on a details page with "Get Directions",
 *   the location picker on create and edit (click on the map, use my current
 *   location, clear the pin), listings without coordinates, the AI radius intent
 *   feeding the real backend search, validation of coordinates and radius on the
 *   API, and the fact that authentication, the space marketplace, the material
 *   marketplace, requests and bookings still work.
 *
 * Usage (the app and API must be running):
 *   APP_URL=http://localhost:5174 API_URL=http://localhost:8081/api \
 *     node phase7-maps-location.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.APP_URL ?? 'http://localhost:5174';
const API = process.env.API_URL ?? 'http://localhost:8081/api';

const OWNER = { email: 'phase7.owner@resource.local', password: 'StrongPass123', name: 'Phase Seven Owner' };
const NEIGHBOUR = { email: 'phase7.neighbour@resource.local', password: 'StrongPass123', name: 'Phase Seven Neighbour' };

/** The visitor browsing the site: Bhimavaram town centre. */
const VIEWER = { latitude: 16.5449, longitude: 81.5212 };

/**
 * What the browser actually sends: the location service rounds a shared position
 * to two decimals before it reaches the API, so every visible distance is the
 * backend's calculation for *these* coordinates.
 */
const SENT = {
  latitude: Math.round(VIEWER.latitude * 100) / 100,
  longitude: Math.round(VIEWER.longitude * 100) / 100,
};

/**
 * Fixture listings north of the viewer, at distances that fall clearly inside one
 * radius option and clearly outside the next: ~0.3 km, ~4 km, ~24 km.
 */
const OFFSETS = {
  near: { latitude: 16.543, longitude: 81.5212 },
  mid: { latitude: 16.576, longitude: 81.5212 },
  far: { latitude: 16.754, longitude: 81.5212 },
};

/** The same calculation the backend does, used only to check its answers. */
function haversineKm(from, to) {
  const radius = 6371.0088;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2;

  return 2 * radius * Math.asin(Math.sqrt(a));
}

const stamp = Date.now();
const SHOTS = process.env.SHOT_DIR ?? '/home/user/preview';

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

/** Waits until the results on the page belong to the current filters. */
async function settle(page, milliseconds = 1200) {
  await page.waitForTimeout(milliseconds);
}

/** The titles on screen, narrowed to this run's own fixtures. */
async function fixtureTitles(page) {
  const titles = await page.locator('article h3').allInnerTexts();

  return titles.filter((title) => title.includes(String(stamp)));
}

function spacePayload(title, coordinates) {
  return {
    title,
    description: 'A listing created by the Phase 7 browser suite to check distances and maps.',
    address: 'Suite Lane, Bhimavaram, Andhra Pradesh',
    ...(coordinates
      ? { latitude: coordinates.latitude, longitude: coordinates.longitude }
      : {}),
    area: 1200,
    areaUnit: 'SQ_FT',
    capacity: 60,
    availability: 'Weekends',
    ownerNote: 'Suite fixture.',
    facilities: ['PARKING', 'WATER'],
    pricing: [{ activityType: 'MEETING', price: 0, isFree: true }],
  };
}

function materialPayload(title, coordinates) {
  return {
    title,
    category: 'BRICKS',
    description: 'A listing created by the Phase 7 browser suite to check distances and maps.',
    quantity: 200,
    unit: 'pieces',
    condition: 'GOOD',
    price: 0,
    isFree: true,
    address: 'Suite Yard, Bhimavaram, Andhra Pradesh',
    ...(coordinates
      ? { latitude: coordinates.latitude, longitude: coordinates.longitude }
      : {}),
    ownerNote: 'Suite fixture.',
  };
}

const browser = await chromium.launch();

// ---------------------------------------------------------------------------
console.log('\n== fixtures ==');

const ownerToken = await tokenFor(OWNER);
await tokenFor(NEIGHBOUR);

// A previous run must never influence this one.
for (const space of (await api('/spaces/mine', { token: ownerToken })).body ?? []) {
  await api(`/spaces/${space.id}`, { method: 'DELETE', token: ownerToken });
}
for (const material of (await api('/materials/mine', { token: ownerToken })).body ?? []) {
  await api(`/materials/${material.id}`, { method: 'DELETE', token: ownerToken });
}

const spaces = {};
for (const [key, coordinates] of Object.entries(OFFSETS)) {
  const created = await api('/spaces', {
    method: 'POST',
    token: ownerToken,
    body: JSON.stringify(spacePayload(`Phase 7 ${key} hall ${stamp}`, coordinates)),
  });
  spaces[key] = created.body;
}

const unmappedSpace = await api('/spaces', {
  method: 'POST',
  token: ownerToken,
  body: JSON.stringify(spacePayload(`Phase 7 unmapped shed ${stamp}`, null)),
});

const materials = {};
for (const [key, coordinates] of Object.entries(OFFSETS)) {
  const created = await api('/materials', {
    method: 'POST',
    token: ownerToken,
    body: JSON.stringify(materialPayload(`Phase 7 ${key} bricks ${stamp}`, coordinates)),
  });
  materials[key] = created.body;
}

const unmappedMaterial = await api('/materials', {
  method: 'POST',
  token: ownerToken,
  body: JSON.stringify(materialPayload(`Phase 7 unmapped pipes ${stamp}`, null)),
});

ok(
  'fixture listings exist at known distances',
  Object.values(spaces).every((space) => space?.id) &&
    unmappedSpace.status === 201 &&
    Object.values(materials).every((material) => material?.id) &&
    unmappedMaterial.status === 201,
  `spaces ${Object.values(spaces).map((space) => space?.id).join(',')} materials ${Object.values(materials)
    .map((material) => material?.id)
    .join(',')}`,
);
ok(
  'a listing without coordinates is accepted',
  unmappedSpace.body?.latitude === null &&
    unmappedMaterial.body?.latitude === null &&
    unmappedSpace.body?.distanceKm === null,
);

// ---------------------------------------------------------------------------
console.log('\n== API: distance and radius ==');

const nearSearch = await api(
  `/spaces/search?latitude=${SENT.latitude}&longitude=${SENT.longitude}&radiusKm=25&sort=distance&size=50`,
);
const nearRow = (nearSearch.body?.content ?? []).find((space) => space.id === spaces.near.id);
const midRow = (nearSearch.body?.content ?? []).find((space) => space.id === spaces.mid.id);
const farRow = (nearSearch.body?.content ?? []).find((space) => space.id === spaces.far.id);

ok('the API returns a distance per listing', typeof midRow?.distanceKm === 'number', String(midRow?.distanceKm));
ok(
  'the distances match an independent haversine calculation',
  Math.abs(nearRow.distanceKm - haversineKm(SENT, OFFSETS.near)) < 0.02 &&
    Math.abs(midRow.distanceKm - haversineKm(SENT, OFFSETS.mid)) < 0.02 &&
    Math.abs(farRow.distanceKm - haversineKm(SENT, OFFSETS.far)) < 0.02,
  `${nearRow?.distanceKm} / ${midRow?.distanceKm} / ${farRow?.distanceKm}`,
);
ok(
  'sorting by distance starts with the nearest',
  (nearSearch.body?.content ?? []).findIndex((space) => space.id === spaces.near.id) <
    (nearSearch.body?.content ?? []).findIndex((space) => space.id === spaces.far.id),
);
ok(
  'a listing without coordinates is never in a radius search',
  !(nearSearch.body?.content ?? []).some((space) => space.id === unmappedSpace.body.id),
);

for (const radius of [1, 5, 10, 25]) {
  const result = await api(
    `/spaces/search?latitude=${SENT.latitude}&longitude=${SENT.longitude}&radiusKm=${radius}&size=50`,
  );
  const ids = (result.body?.content ?? []).map((space) => space.id);
  const expected = {
    1: [spaces.near.id],
    5: [spaces.near.id, spaces.mid.id],
    10: [spaces.near.id, spaces.mid.id],
    25: [spaces.near.id, spaces.mid.id, spaces.far.id],
  }[radius];

  ok(
    `radius ${radius} km keeps exactly the listings inside it`,
    expected.every((id) => ids.includes(id)) &&
      !ids.includes(spaces.far.id) === radius < 25 &&
      !ids.includes(unmappedSpace.body.id),
    `kept ${ids.filter((id) => [spaces.near.id, spaces.mid.id, spaces.far.id].includes(id)).join(',')}`,
  );
}

const materialRadius = await api(
  `/materials/search?latitude=${SENT.latitude}&longitude=${SENT.longitude}&radiusKm=5&size=50`,
);
const materialIds = (materialRadius.body?.content ?? []).map((material) => material.id);
ok(
  'the material search applies the same radius',
  materialIds.includes(materials.near.id) &&
    materialIds.includes(materials.mid.id) &&
    !materialIds.includes(materials.far.id) &&
    !materialIds.includes(unmappedMaterial.body.id),
);

const combined = await api(
  `/materials/search?latitude=${SENT.latitude}&longitude=${SENT.longitude}&radiusKm=10&category=BRICKS&unit=pieces&minQuantity=100&freeOnly=true&size=50`,
);
ok(
  'a radius combines with the existing material filters',
  (combined.body?.content ?? []).some((material) => material.id === materials.near.id) &&
    !(combined.body?.content ?? []).some((material) => material.id === materials.far.id),
);

const combinedSpace = await api(
  `/spaces/search?latitude=${SENT.latitude}&longitude=${SENT.longitude}&radiusKm=10&activity=MEETING&maxPrice=0&minCapacity=50&size=50`,
);
ok(
  'a radius combines with the existing space filters',
  (combinedSpace.body?.content ?? []).some((space) => space.id === spaces.near.id) &&
    !(combinedSpace.body?.content ?? []).some((space) => space.id === spaces.far.id),
);

const noRadiusWithCoordinates = await api(
  `/spaces/search?latitude=${SENT.latitude}&longitude=${SENT.longitude}&size=50`,
);
ok(
  'a position without a radius still reports distances but filters nothing',
  (noRadiusWithCoordinates.body?.content ?? []).some((space) => space.id === spaces.far.id) &&
    (noRadiusWithCoordinates.body?.content ?? []).every((space) => space.distanceKm !== undefined),
);
ok(
  'a listing without coordinates still appears without a radius',
  (noRadiusWithCoordinates.body?.content ?? []).some((space) => space.id === unmappedSpace.body.id) &&
    (noRadiusWithCoordinates.body?.content ?? []).find((space) => space.id === unmappedSpace.body.id).distanceKm === null,
);

const loneRadius = await api(`/spaces/search?radiusKm=5&size=50`);
ok(
  'a radius with no coordinates filters nothing',
  (loneRadius.body?.content ?? []).some((space) => space.id === spaces.far.id),
);

const malformedRadius = await api(
  `/spaces/search?latitude=${SENT.latitude}&longitude=${SENT.longitude}&radiusKm=abc&size=50`,
);
ok('a radius that is not a number is rejected', malformedRadius.status === 400, `status ${malformedRadius.status}`);
ok(
  'the rejection is a clean error, not a stack trace',
  !/Exception|at com\.|\.java:/.test(JSON.stringify(malformedRadius.body)),
  JSON.stringify(malformedRadius.body).slice(0, 120),
);

for (const badRadius of ['-5', '0', '100000']) {
  const result = await api(
    `/spaces/search?latitude=${SENT.latitude}&longitude=${SENT.longitude}&radiusKm=${badRadius}&size=50`,
  );
  const ids = (result.body?.content ?? []).map((space) => space.id);

  ok(
    `an out-of-range radius ("${badRadius}") filters nothing rather than guessing`,
    result.status === 200 && ids.includes(spaces.far.id) && ids.includes(unmappedSpace.body.id),
    `status ${result.status}`,
  );
}

const outOfRangeCoordinates = await api(`/spaces/search?latitude=91&longitude=200&radiusKm=5&size=50`);
ok(
  'out-of-range coordinates are ignored, not obeyed',
  outOfRangeCoordinates.status === 200 &&
    (outOfRangeCoordinates.body?.content ?? []).some((space) => space.id === spaces.far.id),
);

// ---------------------------------------------------------------------------
console.log('\n== API: validation ==');

const badLatitude = await api('/spaces', {
  method: 'POST',
  token: ownerToken,
  body: JSON.stringify(spacePayload(`Phase 7 invalid latitude ${stamp}`, { latitude: 91, longitude: 81.5 })),
});
const badLongitude = await api('/spaces', {
  method: 'POST',
  token: ownerToken,
  body: JSON.stringify(spacePayload(`Phase 7 invalid longitude ${stamp}`, { latitude: 16.5, longitude: 181 })),
});
const badMaterialLatitude = await api('/materials', {
  method: 'POST',
  token: ownerToken,
  body: JSON.stringify(materialPayload(`Phase 7 invalid material latitude ${stamp}`, { latitude: -95, longitude: 81.5 })),
});

ok('a latitude outside -90..90 is rejected', badLatitude.status === 400, `status ${badLatitude.status}`);
ok('a longitude outside -180..180 is rejected', badLongitude.status === 400, `status ${badLongitude.status}`);
ok('the same limits apply to materials', badMaterialLatitude.status === 400, `status ${badMaterialLatitude.status}`);
ok(
  'the coordinate error is explained without a stack trace',
  typeof badLatitude.body?.message === 'string' && !/Exception|at com\.|\.java:/.test(JSON.stringify(badLatitude.body)),
  JSON.stringify(badLatitude.body).slice(0, 120),
);

// ---------------------------------------------------------------------------
console.log('\n== a visitor who shares nothing ==');

const silentContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await silentContext.addInitScript(() => {
  // A browser that refuses: the visitor pressed the button and said no.
  navigator.geolocation.getCurrentPosition = (_ok, fail) =>
    fail({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 2, POSITION_UNAVAILABLE: 3, message: 'denied' });
});
const silent = await silentContext.newPage();
await silent.goto(`${BASE}/spaces`, { waitUntil: 'domcontentloaded' });
await silent.waitForSelector('article', { timeout: 20000 });
await settle(silent);

ok('the marketplace is browsable with no location', (await silent.locator('article').count()) >= 1);
ok('no distance is invented without a position', !/km away/.test(await silent.locator('article').first().innerText()));

await silent.click('button:has-text("Use my location")');
await settle(silent, 800);
const refusal = await silent.locator('[data-testid="location-message"]').innerText();
ok(
  'refusing location is explained in plain words',
  /refused|unavailable|manually/i.test(refusal) && !/GeolocationPositionError|code 1/.test(refusal),
  refusal,
);
ok('the results are still there after a refusal', (await silent.locator('article').count()) >= 1);

await silent.click('[data-testid="view-map"]');
await silent.waitForSelector('[data-testid="map-view"]', { timeout: 20000 });
await settle(silent, 3000);
ok('the map still opens without a visitor position', (await silent.locator('[data-testid="map-view"]').count()) === 1);
ok('no "You" marker is drawn for a visitor who refused', (await silent.locator('text=📍 You').count()) === 0);
ok(
  'the listing is still marked on the map',
  (await silent.locator('.leaflet-marker-icon').count()) >= 1,
);
ok(
  'a listing without coordinates is counted out loud instead of vanishing',
  /without coordinates, visible in the list/.test(await silent.locator('body').innerText()),
);
await silent.screenshot({ path: `${SHOTS}/phase7-05-map-refused-location.png` });
await silentContext.close();

// ---------------------------------------------------------------------------
console.log('\n== a visitor who shares a location ==');

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ['geolocation'],
  geolocation: VIEWER,
});
const page = await context.newPage();
page.on('pageerror', (error) => console.log('    ! page error:', error.message));

await page.goto(`${BASE}/spaces`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('article', { timeout: 20000 });
await page.click('button:has-text("Use my location")');
await settle(page, 1500);

const summary = await page.locator('[data-testid="location-summary"]').innerText();
ok('the radius in use is stated in words', /within \d+ km of your location/i.test(summary), summary);

await settle(page, 1600);

const titles = await fixtureTitles(page);
ok(
  'the default 10 km radius keeps the near and mid listings',
  titles.some((title) => title.includes('near hall')) && titles.some((title) => title.includes('mid hall')),
  titles.join(' | '),
);
ok('the default 10 km radius drops the 25 km listing', !titles.some((title) => title.includes('far hall')));
ok('a listing without coordinates is missing from a radius search', !titles.some((title) => title.includes('unmapped shed')));

const midCard = page.locator('article', { hasText: 'mid hall' });
await midCard.first().waitFor();
const midText = await midCard.first().innerText();
ok(
  'the card shows the distance the backend calculated',
  midText.includes(`${midRow.distanceKm.toFixed(1)} km away`),
  `${midText.replace(/\s+/g, ' ').slice(0, 120)} (API said ${midRow.distanceKm})`,
);

for (const [radius, expected] of [
  ['1', ['near hall']],
  ['5', ['near hall', 'mid hall']],
  ['25', ['near hall', 'mid hall', 'far hall']],
]) {
  await page.selectOption('#filter-radius', radius);
  await settle(page, 1600);
  const shown = await fixtureTitles(page);

  ok(
    `the ${radius} km option shows exactly what is inside it`,
    expected.every((needle) => shown.some((title) => title.includes(needle))) &&
      (radius === '25' || !shown.some((title) => title.includes('far hall'))),
    shown.join(' | '),
  );
}

await page.selectOption('#filter-radius', '25');
await settle(page, 1600);

// ---------------------------------------------------------------------------
console.log('\n== the space map ==');

await page.click('[data-testid="view-map"]');
await page.waitForSelector('[data-testid="map-view"]', { timeout: 20000 });
await settle(page, 3500);

ok('the map is drawn', (await page.locator('[data-testid="map-view"]').count()) === 1);
ok('the tiles loaded', (await page.locator('[data-testid="map-unavailable"]').count()) === 0);
ok('the visitor is marked as 📍 You', (await page.locator('text=📍 You').count()) === 1);

const spaceMarkers = await page.locator('.leaflet-marker-icon span').allInnerTexts();
ok(
  'only listings with coordinates are marked',
  spaceMarkers.some((label) => label.includes('near hall')) &&
    spaceMarkers.some((label) => label.includes('far hall')) &&
    !spaceMarkers.some((label) => label.includes('unmapped shed')),
  spaceMarkers.join(' | '),
);
ok(
  'the listing without coordinates is simply absent from a radius search',
  !(await page.locator('body').innerText()).includes('unmapped shed'),
);

// Markers are keyboard-reachable as well as clickable, which also makes this
// check independent of how densely the labels overlap.
const targetMarker = page
  .locator('.leaflet-marker-icon', { hasText: 'near hall' })
  .first();
await targetMarker.focus();
await targetMarker.press('Enter');
await page.waitForSelector('[data-testid="map-popup"]', { timeout: 10000 });
const popup = await page.locator('[data-testid="map-popup"]').innerText();
ok('a marker opens a popup with the listing', popup.includes('near hall'), popup.replace(/\s+/g, ' '));
ok('the popup carries the address and the distance', /Suite Lane/.test(popup) && /km away/.test(popup));
ok('the popup carries basic facts', /sq ft|Capacity/i.test(popup), popup.replace(/\s+/g, ' '));
ok(
  'the popup never shows the owner\'s contact details',
  !/phase7\.owner@|90000 12345|\+91/.test(popup),
  popup.replace(/\s+/g, ' '),
);

await page.locator('[data-testid="map-popup"] a', { hasText: 'View details' }).click();
await page.waitForURL(/\/spaces\/\d+$/, { timeout: 20000 });
ok('a marker leads to the listing', /\/spaces\/\d+$/.test(page.url()), page.url());
await page.screenshot({ path: `${SHOTS}/phase7-06-space-map.png` });

// ---------------------------------------------------------------------------
console.log('\n== the details page ==');

await page.waitForSelector('[data-testid="listing-location"]', { timeout: 20000 });
await settle(page, 2500);
ok('the details page has a location section', (await page.locator('[data-testid="listing-location"]').count()) === 1);

const detailDistance = await page.locator('[data-testid="listing-distance"]').innerText();
ok(
  'the details page shows how far away it is',
  /km away/.test(detailDistance),
  `${detailDistance} (API said ${nearRow.distanceKm})`,
);
ok('the location section has its own map', (await page.locator('[data-testid="listing-location"] [data-testid="map-view"]').count()) === 1);

const directions = await page.locator('[data-testid="get-directions"]');
const href = await directions.getAttribute('href');
ok(
  'Get Directions is built from the listing coordinates',
  href.includes(String(nearRow.latitude)) && href.includes(String(nearRow.longitude)) && /openstreetmap\.org/.test(href),
  href,
);
ok('Get Directions opens outside the app', (await directions.getAttribute('target')) === '_blank');
ok(
  'the location section shows no contact details',
  !/phase7\.owner@|90000 12345/.test(await page.locator('[data-testid="listing-location"]').innerText()),
);

// A listing with no coordinates must still be complete.
await page.goto(`${BASE}/spaces/${unmappedSpace.body.id}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="listing-location"]', { timeout: 20000 });
ok('a listing without coordinates says so instead of guessing', (await page.locator('[data-testid="listing-no-map"]').count()) === 1);
ok('a listing without coordinates has no directions link', (await page.locator('[data-testid="get-directions"]').count()) === 0);
ok('the address is still shown', /Suite Lane/.test(await page.locator('[data-testid="listing-location"]').innerText()));

// ---------------------------------------------------------------------------
console.log('\n== the material map is its own ==');

await page.goto(`${BASE}/materials`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('article', { timeout: 20000 });
await page.click('button:has-text("Use my location")');
await settle(page, 1500);
await page.selectOption('#material-radius', '25');
await settle(page, 1600);
await page.fill('#material-search', String(stamp));
await settle(page, 1800);

const materialTitles = await fixtureTitles(page);
ok(
  'materials are filtered by the same radius',
  materialTitles.some((title) => title.includes('near bricks')) &&
    materialTitles.some((title) => title.includes('far bricks')),
  materialTitles.join(' | '),
);

await page.selectOption('#material-radius', '5');
await settle(page, 1800);
const tightMaterials = await fixtureTitles(page);
ok(
  'a tighter radius drops the far material',
  tightMaterials.some((title) => title.includes('near bricks')) &&
    !tightMaterials.some((title) => title.includes('far bricks')),
  tightMaterials.join(' | '),
);

await page.click('[data-testid="view-map"]');
await page.waitForSelector('[data-testid="map-view"]', { timeout: 20000 });
await settle(page, 3500);

const materialLabels = await page.locator('.leaflet-marker-icon span').allInnerTexts();
ok(
  'the material map marks materials',
  materialLabels.some((label) => /brick/.test(label)),
  materialLabels.join(' | '),
);
ok(
  'no space listing appears on the material map',
  !materialLabels.some((label) => /hall|shed/.test(label)),
  materialLabels.join(' | '),
);
ok(
  'the material map has its own visitor marker',
  (await page.locator('text=📍 You').count()) === 1,
);
await page.screenshot({ path: `${SHOTS}/phase7-07-material-map.png` });

await page.goto(`${BASE}/spaces`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('article', { timeout: 20000 });
await page.click('button:has-text("Use my location")');
await settle(page, 1400);
await page.click('[data-testid="view-map"]');
await page.waitForSelector('[data-testid="map-view"]', { timeout: 20000 });
await settle(page, 3000);
const spaceLabels = await page.locator('.leaflet-marker-icon span').allInnerTexts();
ok(
  'no material appears on the space map',
  !spaceLabels.some((label) => /bricks|pipes/.test(label)),
  spaceLabels.join(' | '),
);

// ---------------------------------------------------------------------------
console.log('\n== nothing nearby ==');

await page.goto(`${BASE}/materials`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('article', { timeout: 20000 });
// A position on the other side of the country, with the tightest radius.
await context.setGeolocation({ latitude: 28.6139, longitude: 77.209 });
await page.goto(`${BASE}/materials`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('article', { timeout: 20000 });
await page.click('button:has-text("Use my location")');
await settle(page, 1600);
await page.selectOption('#material-radius', '1');
await settle(page, 1800);

const emptyText = await page.locator('body').innerText();
ok(
  'an empty nearby search says so with the radius',
  /No nearby materials found within 1 km\./.test(emptyText) ||
    /No materials match your filters/.test(emptyText),
  emptyText.replace(/\s+/g, ' ').slice(0, 160),
);
ok('the way out is offered', /wider radius|Clear filters/.test(emptyText));
ok('the page is still usable', (await page.locator('[data-testid="view-list"]').count()) === 1);

// ---------------------------------------------------------------------------
console.log('\n== the location picker ==');

await context.setGeolocation(VIEWER);
const pickerContext = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ['geolocation'],
  geolocation: VIEWER,
});
const pickerPage = await pickerContext.newPage();
pickerPage.on('pageerror', (error) => console.log('    ! page error:', error.message));

await signIn(pickerPage, OWNER);
await pickerPage.goto(`${BASE}/spaces/create`, { waitUntil: 'domcontentloaded' });
await pickerPage.waitForSelector('#title', { timeout: 20000 });

ok('the create form offers the map picker', (await pickerPage.locator('[data-testid="location-select-on-map"]').count()) === 1);
ok(
  'the form says a pin is optional',
  /Optional — an address on its own is enough/.test(await pickerPage.locator('body').innerText()),
);
ok(
  'the form explains what happens without a pin',
  /No map pin yet/.test(await pickerPage.locator('[data-testid="location-no-pin"]').innerText()),
);
ok('no map is loaded until the picker is opened', (await pickerPage.locator('[data-testid="map-view"]').count()) === 0);
ok(
  'the address field is still there for people who prefer typing',
  (await pickerPage.locator('#address').count()) === 1,
);

await pickerPage.click('[data-testid="location-select-on-map"]');
await pickerPage.waitForSelector('[data-testid="map-view"]', { timeout: 20000 });
ok('the map only loads when asked for', (await pickerPage.locator('[data-testid="map-view"]').count()) === 1);

await pickerPage.locator('[data-testid="map-view"]').scrollIntoViewIfNeeded();
await settle(pickerPage, 800);
const mapBox = await pickerPage.locator('[data-testid="map-view"]').boundingBox();
await pickerPage.mouse.click(mapBox.x + mapBox.width / 2 + 60, mapBox.y + mapBox.height / 2);
await settle(pickerPage, 800);

const pinText = await pickerPage.locator('[data-testid="location-pin-coordinates"]').innerText();
const pinned = pinText.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
ok('clicking the map drops a pin', Boolean(pinned), pinText);
ok('the pin can be cleared from the form', (await pickerPage.locator('[data-testid="location-clear"]').count()) === 1);

const pickerTitle = `Phase 7 pinned hall ${stamp}`;
await pickerPage.fill('#title', pickerTitle);
await pickerPage.fill('#description', 'Created by the Phase 7 suite with a pin placed on the map.');
await pickerPage.fill('#address', 'Pinned Lane, Bhimavaram');
await pickerPage.fill('#area', '900');
await pickerPage.fill('#capacity', '40');
await pickerPage.click('#facility-PARKING');
await pickerPage.selectOption('#pricing-0-activity', 'MEETING');
await pickerPage.click('#pricing-0-free');
await pickerPage.getByRole('button', { name: 'List space' }).click();
await pickerPage.waitForURL(/\/spaces\/\d+$/, { timeout: 25000 });
await settle(pickerPage, 800);

const pinnedId = Number(pickerPage.url().match(/\/spaces\/(\d+)/)[1]);
const pinnedStored = await api(`/spaces/${pinnedId}`);
ok(
  'the pin is saved with the listing',
  pinnedStored.body?.latitude !== null &&
    Math.abs(pinnedStored.body.latitude - Number(pinned[1])) < 0.0001 &&
    Math.abs(pinnedStored.body.longitude - Number(pinned[2])) < 0.0001,
  `stored ${pinnedStored.body?.latitude},${pinnedStored.body?.longitude} vs pin ${pinned[1]},${pinned[2]}`,
);
ok(
  'the published listing shows the pinned map',
  (await pickerPage.locator('[data-testid="listing-no-map"]').count()) === 0,
);
await pickerPage.screenshot({ path: `${SHOTS}/phase7-08-location-picker.png` });

// The picker on edit: move the pin, then take it away again.
await pickerPage.goto(`${BASE}/spaces/${pinnedId}/edit`, { waitUntil: 'domcontentloaded' });
await pickerPage.waitForSelector('#title', { timeout: 20000 });
await settle(pickerPage, 500);
ok('editing shows the existing pin', (await pickerPage.locator('[data-testid="location-pin-coordinates"]').count()) === 1);

// On edit the pin already exists, so the map is open from the start - the toggle
// would close it.
await pickerPage.waitForSelector('[data-testid="map-view"]', { timeout: 20000 });
await pickerPage.locator('[data-testid="map-view"]').scrollIntoViewIfNeeded();
await settle(pickerPage, 800);
const editBox = await pickerPage.locator('[data-testid="map-view"]').boundingBox();
await pickerPage.mouse.click(editBox.x + editBox.width / 2, editBox.y + editBox.height / 2 + 70);
await settle(pickerPage, 800);
const movedText = await pickerPage.locator('[data-testid="location-pin-coordinates"]').innerText();
const moved = movedText.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
ok('the pin can be moved', moved && (Number(moved[1]) !== Number(pinned[1]) || Number(moved[2]) !== Number(pinned[2])), movedText);

await pickerPage.getByRole('button', { name: 'Save changes' }).click();
await settle(pickerPage, 1500);
const movedStored = await api(`/spaces/${pinnedId}`);
ok(
  'the moved pin is what the backend now holds',
  Math.abs(movedStored.body.latitude - Number(moved[1])) < 0.0001,
  `stored ${movedStored.body?.latitude} vs pin ${moved[1]}`,
);

await pickerPage.goto(`${BASE}/spaces/${pinnedId}/edit`, { waitUntil: 'domcontentloaded' });
await pickerPage.waitForSelector('#title', { timeout: 20000 });
await pickerPage.click('[data-testid="location-clear"]');
await settle(pickerPage, 400);
ok('clearing the pin is offered and taken', (await pickerPage.locator('[data-testid="location-no-pin"]').count()) === 1);
await pickerPage.getByRole('button', { name: 'Save changes' }).click();
await settle(pickerPage, 1500);

const cleared = await api(`/spaces/${pinnedId}`);
ok('a cleared pin is saved as no coordinates', cleared.body?.latitude === null && cleared.body?.longitude === null);
ok(
  'the listing still exists without coordinates',
  cleared.status === 200 && cleared.body?.title === pickerTitle,
);
const clearedSearch = await api(
  `/spaces/search?latitude=${SENT.latitude}&longitude=${SENT.longitude}&radiusKm=25&size=50`,
);
ok(
  'a listing without coordinates drops out of radius results',
  !(clearedSearch.body?.content ?? []).some((space) => space.id === pinnedId),
);
const clearedPlain = await api(`/spaces/search?q=${encodeURIComponent(pickerTitle)}&size=50`);
ok(
  'and is still found by name',
  (clearedPlain.body?.content ?? []).some((space) => space.id === pinnedId),
);

await api(`/spaces/${pinnedId}`, { method: 'DELETE', token: ownerToken });

// ---------------------------------------------------------------------------
console.log('\n== the picker can use the device position ==');

await pickerPage.goto(`${BASE}/materials/create`, { waitUntil: 'domcontentloaded' });
await pickerPage.waitForSelector('#material-title', { timeout: 20000 });
await pickerPage.click('[data-testid="location-use-my-location"]');
await pickerPage.waitForSelector('[data-testid="location-pin-coordinates"]', { timeout: 20000 });
const gpsText = await pickerPage.locator('[data-testid="location-pin-coordinates"]').innerText();
ok(
  'the device position becomes the pin',
  gpsText.includes(VIEWER.latitude.toFixed(5)) && gpsText.includes(VIEWER.longitude.toFixed(5)),
  gpsText,
);

const gpsTitle = `Phase 7 gps bales ${stamp}`;
await pickerPage.fill('#material-title', gpsTitle);
await pickerPage.selectOption('#material-category', 'OTHER');
await pickerPage.selectOption('#material-condition', 'GOOD');
await pickerPage.fill('#material-description', 'Created by the Phase 7 suite from the device position.');
await pickerPage.fill('#material-quantity', '12');
await pickerPage.fill('#material-unit', 'bundles');
await pickerPage.fill('#material-address', 'Device Lane, Bhimavaram');
await pickerPage.check('#material-is-free');
await pickerPage.getByRole('button', { name: 'Publish listing' }).click();
await pickerPage.waitForURL(/\/materials\/\d+$/, { timeout: 25000 });
const gpsId = Number(pickerPage.url().match(/\/materials\/(\d+)/)[1]);
const gpsStored = await api(`/materials/${gpsId}`);
ok(
  'the material keeps the coordinates from the device position',
  Math.abs(gpsStored.body.latitude - VIEWER.latitude) < 0.0001 &&
    Math.abs(gpsStored.body.longitude - VIEWER.longitude) < 0.0001,
  `${gpsStored.body?.latitude},${gpsStored.body?.longitude}`,
);
await api(`/materials/${gpsId}`, { method: 'DELETE', token: ownerToken });

// ---------------------------------------------------------------------------
console.log('\n== AI asks for a radius, the backend does the filtering ==');

await pickerPage.goto(`${BASE}/materials`, { waitUntil: 'domcontentloaded' });
await pickerPage.waitForSelector('article', { timeout: 20000 });
await pickerPage.click('button:has-text("Use my location")');
await settle(pickerPage, 1400);
await pickerPage.fill('[data-testid="ai-search-input"]', 'free bricks within 5 km');
await pickerPage.locator('[data-testid="ai-search-submit"]').click();
await pickerPage.waitForSelector('[data-testid="ai-search-summary"], [data-testid="ai-search-message"]', { timeout: 40000 });
await settle(pickerPage, 1200);

const aiChips = await pickerPage.locator('[data-testid="ai-search-chips"] li').allInnerTexts();
const aiBody = await pickerPage.locator('body').innerText();
ok(
  'a distance asked for in words becomes a radius',
  aiChips.some((chip) => /within 5 km/i.test(chip)),
  aiChips.join(' | '),
);
ok(
  'the AI search returns real listings inside that radius',
  aiBody.includes('near bricks'),
  aiBody.replace(/\s+/g, ' ').slice(0, 160),
);
ok(
  'a listing beyond the radius is not returned',
  !aiBody.includes('far bricks'),
  aiBody.replace(/\s+/g, ' ').slice(0, 160),
);
ok(
  'the AI summary never claims a distance it did not measure',
  !/I (measured|calculated|found it) [\d.]+ km/i.test(aiBody),
);

// ---------------------------------------------------------------------------
console.log('\n== the rest of the app still works ==');

await signOut(pickerPage);
await signIn(pickerPage, NEIGHBOUR);
ok('signing in still works', /\/dashboard$/.test(pickerPage.url()), pickerPage.url());

const neighbourToken = (await api('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: NEIGHBOUR.email, password: NEIGHBOUR.password }),
})).body.accessToken;

const request = await api('/requests', {
  method: 'POST',
  token: neighbourToken,
  body: JSON.stringify({
    resourceType: 'SPACE',
    resourceId: spaces.near.id,
    purpose: 'MEETING',
    requestDate: '2027-03-14',
    startTime: '10:00',
    endTime: '13:00',
    expectedPeople: 25,
    message: 'May we use the hall for a residents meeting?',
  }),
});
ok('a space request can still be created', request.status === 201, `status ${request.status} ${JSON.stringify(request.body).slice(0, 100)}`);

if (request.status === 201) {
  const before = await api(`/requests/${request.body.id}`, { token: neighbourToken });
  ok(
    'no contact details are revealed while the request is pending',
    before.body?.contact === null || before.body?.contact === undefined,
    JSON.stringify(before.body?.contact ?? null).slice(0, 80),
  );

  const accepted = await api(`/requests/${request.body.id}/accept`, { method: 'POST', token: ownerToken });
  ok('the owner can still accept it', accepted.status === 200, `status ${accepted.status}`);

  const reveal = await api(`/requests/${request.body.id}`, { token: neighbourToken });
  ok(
    'contacts are still revealed only after acceptance',
    typeof reveal.body?.contact?.email === 'string' && typeof reveal.body?.contact?.phone === 'string',
    JSON.stringify(reveal.body?.contact ?? null).slice(0, 120),
  );

  const bookings = await api('/bookings/my', { token: neighbourToken });
  ok(
    'the accepted request still produces a booking',
    (Array.isArray(bookings.body) ? bookings.body : (bookings.body?.content ?? [])).length >= 1,
  );
}

const stranger = await api('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: OWNER.email, password: OWNER.password }),
});
ok('authentication still issues a token', stranger.status === 200 && Boolean(stranger.body?.accessToken));
ok(
  'the search response still carries no private data',
  !/email|phone|passwordHash/.test(JSON.stringify(nearSearch.body ?? {})),
);

const stillListed = await api('/materials/mine', { token: ownerToken });
ok('the material marketplace is intact', (stillListed.body ?? []).length >= 4);

// ---------------------------------------------------------------------------
console.log('\n== cleanup ==');

for (const space of (await api('/spaces/mine', { token: ownerToken })).body ?? []) {
  await api(`/spaces/${space.id}`, { method: 'DELETE', token: ownerToken });
}
for (const material of (await api('/materials/mine', { token: ownerToken })).body ?? []) {
  await api(`/materials/${material.id}`, { method: 'DELETE', token: ownerToken });
}
const leftoverSpaces = (await api('/spaces/mine', { token: ownerToken })).body ?? [];
const leftoverMaterials = (await api('/materials/mine', { token: ownerToken })).body ?? [];
ok('every fixture listing was removed', leftoverSpaces.length === 0 && leftoverMaterials.length === 0);

await pickerContext.close();
await context.close();
await browser.close();

console.log(`\n== result ==\n  ${passed} checks passed, ${failures.length} failed`);

if (failures.length > 0) {
  console.log('  failures:');
  failures.forEach((failure) => console.log(`   - ${failure}`));
  process.exit(1);
}
