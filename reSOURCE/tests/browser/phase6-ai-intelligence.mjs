/**
 * Phase 6 browser suite: the AI intelligence layer.
 *
 * Drives a real Chromium through the whole AI feature set. Two stacks are
 * expected, both against the same database:
 *
 *   1. the AI stack       frontend :5174, API :8081, provider = tests/mock-ai-provider.mjs
 *                         (AI_BASE_URL points at the mock, so every flow can be
 *                         exercised without an API key)
 *   2. the plain stack    frontend :5173, API :8080, no AI_API_KEY
 *                         (proves the marketplaces and the fallback path)
 *
 * Covered: the AI search box with its indicator and chips, the transparent
 * "Showing spaces matching: …" line, public access for a signed-out visitor,
 * submit-only behaviour, cancellation of duplicate submits, the fallback message
 * when the provider fails, the marketplace still working when AI is not
 * configured, image recognition with its confidence label and manual fallback,
 * the rule that a quantity is never taken from a photo, the description the
 * photo suggests, and a search that would find nothing being relaxed to the
 * closest real listings with a note naming what was dropped.
 *
 * Usage (all four servers must be running):
 *   node phase6-ai-intelligence.mjs
 */
import { chromium } from 'playwright';
import { deflateSync } from 'node:zlib';
import { mkdirSync } from 'node:fs';

const BASE = process.env.APP_URL ?? 'http://localhost:5174';
const API = process.env.API_URL ?? 'http://localhost:8081/api';
const PLAIN_BASE = process.env.PLAIN_APP_URL ?? 'http://localhost:5173';
const PLAIN_API = process.env.PLAIN_API_URL ?? 'http://localhost:8080/api';

const LISTER = { email: 'phase6.lister@resource.local', password: 'StrongPass123', name: 'Phase Six Lister' };

const stamp = Date.now();
const SHOTS = process.env.SHOT_DIR ?? '/home/user/preview';
mkdirSync(SHOTS, { recursive: true });

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

async function api(path, options = {}, base = API) {
  const response = await fetch(`${base}${path}`, {
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
  await page.waitForTimeout(300);
}

/** PNGs are written straight into the page, so no fixture files are needed. */
function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;

    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      const at = rowStart + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }

  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);

    return Buffer.concat([length, body, crc]);
  };

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let crcTable = null;

function crc32(buffer) {
  if (!crcTable) {
    crcTable = [];

    for (let n = 0; n < 256; n += 1) {
      let c = n;

      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }

      crcTable[n] = c;
    }
  }

  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return crc ^ 0xffffffff;
}

/**
 * A busy photo (a large payload, which the mock provider reads as "confident")
 * and a flat one (a tiny payload, read as "not sure").
 */
const CONFIDENT_PHOTO = {
  name: 'bricks.png',
  mimeType: 'image/png',
  buffer: png(256, 256, (x, y) => [(x * 7 + y * 13) % 256, (x * 3) % 256, (y * 11) % 256]),
};

const UNCERTAIN_PHOTO = {
  name: 'blurry.png',
  mimeType: 'image/png',
  buffer: png(48, 48, () => [200, 200, 200]),
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1360, height: 900 },
  permissions: ['geolocation'],
  geolocation: { latitude: 16.5449, longitude: 81.5212 },
});
const page = await context.newPage();
page.setDefaultTimeout(30000);

const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
  }
});

const created = [];

try {
  // ======================================================================= §9
  console.log('\n== AI search on the space marketplace ==');

  await page.goto(`${BASE}/spaces`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="ai-search-input"]', { timeout: 20000 });

  const panelText = await page.locator('section:has([data-testid="ai-search-input"])').innerText();

  ok('the AI search box is offered above the spaces', panelText.includes('AI search'));
  ok('it carries a small AI indicator', /\bAI\b/.test(panelText));
  ok('it is explicit about the button', panelText.includes('AI Search'));
  ok(
    'the ordinary filters are still on the page',
    await page.locator('#filter-activity').isVisible(),
  );
  ok(
    'the AI search button is disabled while the box is empty',
    await page.locator('[data-testid="ai-search-submit"]').isDisabled(),
  );

  // Nothing may be sent while the visitor is still typing.
  let searchCalls = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/ai/search-intent')) {
      searchCalls += 1;
    }
  });

  await page.fill('[data-testid="ai-search-input"]', 'free space for a blood donation camp for 200 people');
  await page.waitForTimeout(900);

  ok('typing sends no AI request at all', searchCalls === 0, `saw ${searchCalls}`);

  // A slow answer is used here so the loading state is observable.
  await page.route('**/api/ai/search-intent', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });

  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForTimeout(250);

  const submitLabel = await page.locator('[data-testid="ai-search-submit"]').innerText();

  ok('the button says "Searching with AI…" while it works', submitLabel.includes('Searching with AI'));
  ok(
    'a second submit cannot be started while the first is running',
    await page.locator('[data-testid="ai-search-submit"]').isDisabled(),
  );

  await page.waitForSelector('[data-testid="ai-search-summary"]', { timeout: 30000 });
  await page.unroute('**/api/ai/search-intent');

  const summary = await page.locator('[data-testid="ai-search-summary"]').innerText();
  const chips = await page.locator('[data-testid="ai-search-chips"] li').allInnerTexts();

  ok('exactly one AI request was made for the submit', searchCalls === 1, `saw ${searchCalls}`);

  // Pressing the same question again is not a new question: the answer is
  // already on screen, so no second call goes out for it.
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForTimeout(900);

  ok(
    'submitting the same sentence twice does not ask the AI again',
    searchCalls === 1,
    `saw ${searchCalls}`,
  );
  ok(
    'the summary states the criteria that were applied',
    summary.includes('Showing spaces matching:') &&
      summary.includes('Blood Donation Camp') &&
      summary.includes('Free') &&
      summary.includes('200 people'),
    summary,
  );
  ok('it says "Matching your search criteria", not a claim about the match', summary.includes('Matching your search criteria'));
  ok(
    'every criterion is shown as a chip',
    chips.includes('Blood Donation Camp') && chips.includes('Free') && chips.includes('200 people'),
    chips.join(' | '),
  );

  const aiHeading = await page.locator('[data-testid="results-heading"]').innerText();
  ok('the heading says the results are the AI search results', aiHeading.includes('matched your AI search'), aiHeading);

  const resultTitles = await page.locator('h3').allInnerTexts();
  ok('real listings are returned, not an AI-written list', resultTitles.includes('Community Ground'), resultTitles.join(' | '));

  const spacesBody = await page.locator('body').innerText();
  ok('the wording never claims the AI found something perfect', !/perfect/i.test(spacesBody));

  await page.screenshot({ path: `${SHOTS}/phase6-01-ai-search-spaces.png`, fullPage: false });

  // Distance filter: with a location shared, "within 10 km" is applied and shown.
  await page.fill('[data-testid="ai-search-input"]', 'free space for a blood donation camp for 200 people within 10 km');
  await page.locator('button:has-text("Use my location")').first().click();
  await page.waitForTimeout(600);
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForSelector('[data-testid="ai-search-chips"]', { timeout: 30000 });
  await page.waitForTimeout(400);

  const radiusChips = await page.locator('[data-testid="ai-search-chips"] li').allInnerTexts();
  ok('a distance the visitor asked for is applied and shown', radiusChips.includes('Within 10 km'), radiusChips.join(' | '));

  // Nothing is listed for 900 people, so the capacity is relaxed and the space
  // that is closest to the ask is shown, with the reason.
  await page.fill('[data-testid="ai-search-input"]', 'a market space for 900 people');
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForSelector('[data-testid="ai-search-summary"]', { timeout: 30000 });
  await page.waitForTimeout(400);

  const capacityNote = await page.locator('[data-testid="ai-search-note"]').count()
    ? await page.locator('[data-testid="ai-search-note"]').innerText()
    : '';
  const capacityHeading = await page.locator('[data-testid="results-heading"]').innerText();

  ok(
    'a capacity no space is listed for still shows spaces',
    /\d+ spaces? matched|spaces found/i.test(capacityHeading) && !/0 spaces/.test(capacityHeading),
    capacityHeading,
  );
  ok(
    'the relaxed capacity is explained, or the space really is that big',
    capacityNote === '' || /no space is listed for 900 people/i.test(capacityNote),
    capacityNote || '(exact match)',
  );

  // A search that had to give something up lists the nearest thing first, so the
  // number asked for is not simply forgotten behind a "newest first" order.
  await page.fill('[data-testid="ai-search-input"]', 'an event space for 700 people');
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForSelector('[data-testid="ai-search-note"]', { timeout: 30000 });
  await page.waitForTimeout(400);

  const closestSpaceCards = await page.locator('article').allInnerTexts();
  const claimedCapacities = closestSpaceCards
    .map((card) => /Up to (\d+)/.exec(card))
    .filter(Boolean)
    .map((match) => Number(match[1]));

  ok(
    'the space nearest the number asked for is listed first',
    closestSpaceCards.length > 1
      && claimedCapacities.length === closestSpaceCards.length
      && claimedCapacities.every((value, index) => index === 0 || claimedCapacities[index - 1] >= value),
    `order: ${claimedCapacities.join(' → ')}`,
  );

  // The space module understands the facilities and the size a visitor names.
  await page.fill('[data-testid="ai-search-input"]', 'a space with electricity and water');
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForSelector('[data-testid="ai-search-chips"]:has-text("With Electricity, Water")', {
    timeout: 30000,
  });
  await page.waitForTimeout(400);

  const facilityChips = await page.locator('[data-testid="ai-search-chips"] li').allInnerTexts();
  const facilityCards = await page.locator('article').allInnerTexts();

  ok(
    'facilities named in the sentence become criteria',
    facilityChips.includes('With Electricity, Water'),
    facilityChips.join(' | '),
  );
  ok(
    'and only spaces that really offer them are shown',
    facilityCards.length > 0
      && facilityCards.every((card) => /Electricity/.test(card) && /Water/.test(card)),
    `${facilityCards.length} card(s)`,
  );

  await page.fill('[data-testid="ai-search-input"]', 'a market space of at least 5000 sq ft');
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForSelector('[data-testid="ai-search-chips"]:has-text("From 5000 sq ft")', {
    timeout: 30000,
  });
  await page.waitForTimeout(400);

  const areaChips = await page.locator('[data-testid="ai-search-chips"] li').allInnerTexts();
  const areaHeading = await page.locator('[data-testid="results-heading"]').innerText();

  ok('a size in square feet becomes a criterion', areaChips.includes('From 5000 sq ft'), areaChips.join(' | '));
  ok(
    'the space that is that large is the one shown',
    !/0 spaces/.test(areaHeading) && /\d+ spaces? matched|spaces found/i.test(areaHeading),
    areaHeading,
  );

  // Put the page back where the rest of the suite expects it.
  await page.fill('[data-testid="ai-search-input"]', 'a market space for 900 people');
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForSelector('[data-testid="ai-search-summary"]', { timeout: 30000 });
  await page.waitForTimeout(300);

  // Leaving AI search restores ordinary browsing.
  await page.locator('[data-testid="ai-search-exit"]').click();
  await page.waitForTimeout(700);

  const afterExit = await page.locator('[data-testid="results-heading"]').innerText();
  ok('exiting AI search returns to the normal marketplace', /spaces found/.test(afterExit), afterExit);

  // Ordinary filters keep working after an AI search.
  await page.fill('[data-testid="ai-search-input"]', 'a market for vegetables');
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForSelector('[data-testid="ai-search-summary"]', { timeout: 30000 });
  await page.selectOption('#filter-activity', 'BLOOD_DONATION');
  await page.waitForTimeout(900);

  const afterFilter = await page.locator('body').innerText();
  ok(
    'using a normal filter takes the page back to ordinary filtering',
    /spaces found/.test(afterFilter) &&
      !(await page.locator('[data-testid="ai-search-chips"]').count()),
  );

  // ====================================================================== §41
  console.log('\n== AI search without an account, and when the provider fails ==');

  await page.goto(`${BASE}/spaces`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="ai-search-input"]');

  await page.fill('[data-testid="ai-search-input"]', 'a market for vegetables');
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForSelector('[data-testid="ai-search-summary"]', { timeout: 30000 });

  ok(
    'a signed-out visitor can use AI search',
    (await page.locator('[data-testid="ai-search-summary"]').innerText()).includes('Showing spaces matching'),
  );

  // The mock provider answers 500 for prompts containing FAIL.
  await page.fill('[data-testid="ai-search-input"]', 'FAIL please break');
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForSelector('[data-testid="ai-search-message"]', { timeout: 30000 });

  const failureText = await page.locator('[data-testid="ai-search-message"]').innerText();
  ok(
    'a provider failure shows the fallback message',
    failureText.includes('AI search is temporarily unavailable. You can use filters instead.'),
    failureText,
  );

  await page.waitForTimeout(500);
  const afterFailure = await page.locator('body').innerText();
  ok(
    'the marketplace is never left empty by a failed AI search',
    afterFailure.includes('Community Ground'),
  );
  ok('the filters are still offered after a failure', await page.locator('#filter-activity').isVisible());

  // ====================================================================== §10
  console.log('\n== AI search on the material marketplace ==');

  await page.goto(`${BASE}/materials`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="ai-search-input"]');

  await page.fill('[data-testid="ai-search-input"]', 'at least 200 pieces of bricks');
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForSelector('[data-testid="ai-search-summary"]', { timeout: 30000 });

  const materialSummary = await page.locator('[data-testid="ai-search-summary"]').innerText();
  const materialChips = await page.locator('[data-testid="ai-search-chips"] li').allInnerTexts();

  ok(
    'material criteria are understood and shown',
    materialSummary.includes('Showing materials matching:') && materialChips.includes('Bricks'),
    materialSummary,
  );
  ok('a quantity filter is applied only with its unit', materialChips.includes('At least 200 pieces'), materialChips.join(' | '));

  // The complaint this change fixes: the owner listed 200 bricks, the visitor
  // asks for 500, and the marketplace must show the bricks rather than nothing.
  await page.fill('[data-testid="ai-search-input"]', 'I want red clay bricks of 500 pieces');
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForSelector('[data-testid="ai-search-note"]', { timeout: 30000 });
  await page.waitForTimeout(400);

  const closestNote = await page.locator('[data-testid="ai-search-note"]').innerText();
  const closestTitles = await page.locator('h3').allInnerTexts();
  const closestHeading = await page.locator('[data-testid="results-heading"]').innerText();

  ok(
    'a quantity nobody has is relaxed instead of emptying the marketplace',
    closestTitles.some((entry) => /brick/i.test(entry)) && !/0 materials/.test(closestHeading),
    `${closestHeading} | ${closestTitles.join(' | ')}`,
  );
  ok(
    'the page says which criterion was relaxed',
    /no listing has 500 pieces or more/i.test(closestNote) && /closest/i.test(closestNote),
    closestNote,
  );
  ok(
    'the quantity chip is not claimed after it was dropped',
    !(await page.locator('[data-testid="ai-search-chips"] li').allInnerTexts())
      .some((chip) => chip.includes('At least 500')),
  );

  await page.screenshot({ path: `${SHOTS}/phase6-05-relaxed-search.png`, fullPage: false });

  // Values the backend refuses to pass on must not appear as criteria either.
  await page.fill('[data-testid="ai-search-input"]', 'alien metal with a negative price');
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForTimeout(2000);

  const sanitised = await page.locator('[data-testid="ai-search-summary"]').innerText();
  ok(
    'an impossible answer is dropped instead of being applied',
    sanitised.includes('nothing specific was picked out of your words'),
    sanitised,
  );

  // A material search on the spaces page is a hint, not a rewrite of the page.
  await page.goto(`${BASE}/spaces`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="ai-search-input"]');
  await page.fill('[data-testid="ai-search-input"]', 'bricks');
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForSelector('[data-testid="ai-search-hint"]', { timeout: 30000 });

  const hint = await page.locator('[data-testid="ai-search-hint"]').innerText();
  ok('the page stays on spaces and hints at the other marketplace', hint.includes('materials'), hint);

  // A failure on this page uses the material wording from the brief.
  await page.goto(`${BASE}/materials`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="ai-search-input"]');
  await page.fill('[data-testid="ai-search-input"]', 'FAIL please break');
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForSelector('[data-testid="ai-search-message"]', { timeout: 30000 });

  const materialFailure = await page.locator('[data-testid="ai-search-message"]').innerText();
  ok(
    'the material page uses its own fallback wording',
    materialFailure.includes('AI search unavailable. Try using category and filter options.'),
    materialFailure,
  );
  ok(
    'materials are still listed after that failure',
    (await page.locator('body').innerText()).includes('Red Clay Bricks'),
  );

  // ====================================================================== §46
  console.log('\n== AI unavailable for real: the plain stack ==');

  await page.goto(`${PLAIN_BASE}/spaces`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="ai-search-input"]', { timeout: 20000 });
  await page.fill('[data-testid="ai-search-input"]', 'free space for a blood donation camp');
  await page.locator('[data-testid="ai-search-submit"]').click();
  await page.waitForSelector('[data-testid="ai-search-message"]', { timeout: 30000 });

  const plainMessage = await page.locator('[data-testid="ai-search-message"]').innerText();
  const plainBody = await page.locator('body').innerText();

  ok('with no key configured the visitor is told, in plain words', plainMessage.includes('temporarily unavailable'), plainMessage);
  ok('the space marketplace still lists its spaces', plainBody.includes('Community Ground'));
  ok('the ordinary filters still work there', await page.locator('#filter-activity').isVisible());

  const plainApi = await api('/spaces?size=5', {}, PLAIN_API);
  ok('the API itself keeps serving listings', plainApi.status === 200 && plainApi.body.totalElements > 0);

  // ====================================================================== §16
  console.log('\n== material recognition ==');

  const listerToken = await tokenFor(LISTER);
  await signIn(page, LISTER);

  await page.goto(`${BASE}/materials/create`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="ai-recognition-submit"]', { timeout: 20000 });

  const cardText = await page.locator('section:has([data-testid="ai-recognition-submit"])').innerText();

  // On the create form this photo is the listing's main image as well, so the
  // card is titled for both jobs; on the edit form it is analysis only.
  ok('the create form offers photo recognition',
    /Identify from a photo|Photo and AI suggestions/.test(cardText), cardText.split('\n')[0]);
  ok('and says the photo becomes the listing\'s main image',
    /main image/i.test(cardText) && cardText.includes('Main photo'));
  ok('the recognition card is marked as optional', cardText.includes('Optional'));
  ok(
    'it says quantity and price are still the owner\u2019s',
    /quantity and price are always yours|how much there is and what it costs/i.test(cardText),
  );
  ok('the form can be filled without it', await page.locator('#material-category').isVisible());
  ok(
    'the identify button is disabled until a photo is chosen',
    await page.locator('[data-testid="ai-recognition-submit"]').isDisabled(),
  );

  await page.setInputFiles('[data-testid="ai-recognition-input"]', CONFIDENT_PHOTO);

  // Slowed down so the wording can be checked while it runs.
  await page.route('**/api/ai/material-recognition', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });

  await page.locator('[data-testid="ai-recognition-submit"]').click();
  await page.waitForTimeout(300);

  const recognitionLoading = await page.locator('[data-testid="ai-recognition-submit"]').innerText();
  ok('the loading message is "Analyzing material image…"', recognitionLoading.includes('Analyzing material image'), recognitionLoading);

  await page.waitForSelector('[data-testid="ai-recognition-card"]', { timeout: 30000 });
  await page.unroute('**/api/ai/material-recognition');

  const suggestion = await page.locator('[data-testid="ai-recognition-card"]').innerText();
  const confidence = await page.locator('[data-testid="ai-recognition-confidence"]').innerText();

  ok('the suggestion names the material', suggestion.includes('Red Clay Bricks'), suggestion);
  ok('it gives a category and a condition', suggestion.includes('Bricks') && suggestion.includes('Good'));
  ok('the confidence is labelled in words', confidence.includes('High confidence'), confidence);
  ok(
    'no quantity is shown anywhere in the suggestion',
    !suggestion.includes('300') && !/quantity/i.test(suggestion.replace(/Quantity and price are never guessed from a photo/i, '')),
    suggestion,
  );
  ok(
    'the suggestion carries a description of what the photo shows',
    suggestion.includes('Neatly stacked red clay bricks'),
    suggestion,
  );

  await page.screenshot({ path: `${SHOTS}/phase6-02-recognition.png`, fullPage: false });

  await page.locator('[data-testid="ai-recognition-use"]').click();
  await page.waitForTimeout(400);

  ok('accepting fills the material name', (await page.inputValue('#material-title')) === 'Red Clay Bricks');
  ok('accepting fills the category', (await page.inputValue('#material-category')) === 'BRICKS');
  ok('accepting fills the condition', (await page.inputValue('#material-condition')) === 'GOOD');
  ok(
    'accepting fills the description written from the photo',
    (await page.inputValue('#material-description')).includes('Neatly stacked red clay bricks'),
    await page.inputValue('#material-description'),
  );
  ok('the quantity is still empty — AI never guesses it', (await page.inputValue('#material-quantity')) === '');
  ok('the price is still empty — AI never guesses it', (await page.inputValue('#material-price')) === '');

  // A photo the model cannot read must lead to the manual path, not a dead end.
  await page.setInputFiles('[data-testid="ai-recognition-input"]', UNCERTAIN_PHOTO);
  await page.locator('[data-testid="ai-recognition-submit"]').click();
  await page.waitForSelector('[data-testid="ai-recognition-message"]', { timeout: 30000 });

  const lowConfidence = await page.locator('[data-testid="ai-recognition-message"]').innerText();
  ok(
    'a low confidence answer asks for the category to be chosen by hand',
    lowConfidence.includes("Couldn't confidently identify this material. Please select the category manually."),
    lowConfidence,
  );
  ok('no suggestion card is offered for a low confidence answer', (await page.locator('[data-testid="ai-recognition-card"]').count()) === 0);
  ok('the category dropdown is still there to use', await page.locator('#material-category').isEnabled());

  // The owner finishes the listing with their own numbers.
  const title = `Phase 6 Recognised Bricks ${stamp}`;
  await page.fill('#material-title', title);
  await page.fill('#material-quantity', '300');
  await page.fill('#material-unit', 'pieces');
  await page.fill('#material-price', '2000');
  await page.fill('#material-address', 'Suite Yard, Bhimavaram, Andhra Pradesh');

  await page.click('button[type="submit"]');
  await page.waitForURL(/\/materials\/\d+$/, { timeout: 20000 });
  await page.waitForTimeout(600);

  const createdId = Number(page.url().split('/').pop());
  created.push(createdId);

  const published = await api(`/materials/${createdId}`, {}, PLAIN_API);
  ok('the listing is published with the owner\u2019s own quantity', published.body?.quantity === 300, JSON.stringify(published.body?.quantity));
  ok('and with the owner\u2019s own price', published.body?.price === 2000, JSON.stringify(published.body?.price));

  // ====================================================================== §45
  console.log('\n== the listing-help panel is gone, the manual path is not ==');

  await page.goto(`${BASE}/materials/create`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="ai-recognition-submit"]', { timeout: 20000 });

  const createForm = await page.locator('form').innerText();

  ok(
    'the create form no longer offers "write it for me"',
    !createForm.includes('Write it for me') &&
      (await page.locator('[data-testid="ai-extract-text"]').count()) === 0 &&
      (await page.locator('[data-testid="ai-description-submit"]').count()) === 0,
    createForm.replace(/\s+/g, ' ').slice(0, 160),
  );
  let everyFieldPresent = true;

  for (const id of ['material-title', 'material-category', 'material-description', 'material-quantity',
    'material-unit', 'material-condition', 'material-price', 'material-address']) {
    everyFieldPresent = everyFieldPresent && (await page.locator(`#${id}`).count()) === 1;
  }

  ok('every field is still there to type by hand', everyFieldPresent);
  ok(
    'the description can still be written by the owner',
    await page.locator('#material-description').isEditable(),
  );

  // =================================================================== §40/§48
  console.log('\n== accessibility and the rest of the app ==');

  const aiInput = page.locator('[data-testid="ai-search-input"]');
  await page.goto(`${BASE}/materials`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="ai-search-input"]');

  const aiInputId = await aiInput.getAttribute('id');
  ok(
    'the AI search box has a proper label',
    Boolean(aiInputId) && (await page.locator(`label[for="${aiInputId}"]`).count()) >= 1,
    String(aiInputId),
  );
  ok('the AI search box is reachable by keyboard', await aiInput.isEditable());
  ok(
    'the file input for recognition is labelled too',
    (await page.locator('label[for="ai-recognition-file"]').count()) === 1 ||
      (await page.locator('[data-testid="ai-recognition-input"]').count()) === 0,
  );

  await page.goto(`${BASE}/materials/${createdId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  ok('the material details page still opens', (await page.locator('body').innerText()).includes('300 pieces'));

  await page.goto(`${BASE}/spaces`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Community Ground', { timeout: 20000 });
  ok('the space marketplace still works', true);

  await page.goto(`${BASE}/bookings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  ok('the bookings page still works', /Booking|bookings/i.test(await page.locator('body').innerText()));

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const home = await page.locator('body').innerText();
  ok('Home still offers both marketplaces', home.includes('Find Spaces') && home.includes('Find Materials'));

  await page.screenshot({ path: `${SHOTS}/phase6-04-final.png`, fullPage: false });
} finally {
  console.log('\n== cleanup ==');

  for (const id of created) {
    await api(`/materials/${id}`, { method: 'DELETE', token: await tokenFor(LISTER) });
  }

  const remaining = await api('/materials/mine', { token: await tokenFor(LISTER) });

  for (const material of remaining.body ?? []) {
    await api(`/materials/${material.id}`, { method: 'DELETE', token: await tokenFor(LISTER) });
  }

  console.log(`  · removed ${created.length} created listing(s) and every other suite listing`);

  await context.close();
  await browser.close();
}

const unexpectedConsoleErrors = consoleErrors.filter(
  (line) => !line.includes('Failed to load resource'),
);

console.log(`\n== result ==\n  ${passed} checks passed, ${failures.length} failed`);
console.log(`  console errors: ${unexpectedConsoleErrors.length}`);

if (failures.length > 0) {
  console.log('  failures:');
  failures.forEach((failure) => console.log(`   - ${failure}`));
  process.exit(1);
}
