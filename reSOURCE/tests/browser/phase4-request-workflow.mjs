/**
 * Phase 4 browser suite: the space request -> acceptance -> booking workflow.
 *
 * Drives a real Chromium against the running app (frontend on :5173, API on
 * :8080) and covers the frontend checklist of the phase brief:
 *
 *   request button, request form, activity pricing incl. FREE, submission,
 *   my requests, incoming requests, accept, reject, cancel, bookings page,
 *   contact details hidden before acceptance, visible after confirmation,
 *   loading / empty / error states and the responsive layout.
 *
 * Usage (both servers must be running):
 *   npm install playwright && npx playwright install chromium-headless-shell
 *   node phase4-request-workflow.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:8080/api';

const OWNER = { email: 'demo@resource.local', password: 'DemoPass123', name: 'reSOURCE Demo Owner' };
const REQUESTER = { email: 'phase4.requester@resource.local', password: 'StrongPass123', name: 'Phase Four Requester' };
const STRANGER = { email: 'phase4.stranger@resource.local', password: 'StrongPass123', name: 'Phase Four Stranger' };

const stamp = Date.now();
const SHOTS = process.env.SHOT_DIR ?? '/home/user/preview';

let passed = 0;
let removed = 0;
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

/** Days from today as yyyy-mm-dd, so the form never sends a past date. */
function dayPlus(days) {
  const date = new Date(Date.now() + days * 86400000);
  return date.toISOString().slice(0, 10);
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
      phone: '+91 98877 66554',
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

const browser = await chromium.launch();

// ---------------------------------------------------------------- data setup

console.log('\n== setup: accounts and a space of our own ==');

const ownerToken = await tokenFor(OWNER);
const requesterToken = await tokenFor(REQUESTER);
await tokenFor(STRANGER);

// A dedicated space for this run keeps the free/paid pricing predictable.
// Remove leftovers from earlier runs so the shared database stays tidy and the
// Phase 3 suite (which counts the seeded spaces) is unaffected.
async function removeSpacesOwnedByDemoOwner() {
  const mine = await api('/spaces/mine', { token: ownerToken });
  const leftovers = (mine.body ?? []).filter((space) =>
    space.title.startsWith('Phase 4 Ground'),
  );

  for (const space of leftovers) {
    await api(`/spaces/${space.id}`, { method: 'DELETE', token: ownerToken });
  }

  return leftovers.length;
}

removed = await removeSpacesOwnedByDemoOwner();

const created = await api('/spaces', {
  method: 'POST',
  token: ownerToken,
  body: JSON.stringify({
    title: `Phase 4 Ground ${stamp}`,
    description: 'Space created by the Phase 4 browser suite.',
    address: 'Suite Road, Bhimavaram',
    area: 2,
    areaUnit: 'ACRES',
    capacity: 300,
    availability: 'Weekends',
    facilities: ['PARKING', 'WATER'],
    pricing: [
      { activityType: 'BLOOD_DONATION', isFree: true, price: null, ownerNote: 'Free for camps' },
      { activityType: 'STUDENT_FEST', isFree: false, price: 500, ownerNote: null },
    ],
  }),
});

ok('a space exists to request', created.status === 201, `status ${created.status}`);
const spaceId = created.body?.id;
const spaceTitle = `Phase 4 Ground ${stamp}`;

const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();

// ------------------------------------------------------ 1. request from a space

console.log('\n== the requester asks for the space ==');
await signIn(page, REQUESTER);

await page.goto(`${BASE}/spaces/${spaceId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Request This Space', { timeout: 20000 });
ok('space details offers "Request This Space"', true);

await page.click('text=Request This Space');
await page.waitForURL(/\/spaces\/\d+\/request$/, { timeout: 20000 });
await page.waitForSelector('#purpose', { timeout: 20000 });
ok('the request form opens', true);

// Asking for someone else's space must not trap the visitor on the form.
const requestBack = page.getByRole('link', { name: /Back to/i }).first();
ok('the request form offers a way back',
  (await requestBack.count()) === 1 && /\/spaces\/\d+$/.test(await requestBack.getAttribute('href')));
ok('and the way back is a link, not a dead end',
  (await page.locator('a[href$="/spaces/' + spaceId + '"]').count()) >= 1);

const bodyText = await page.locator('body').innerText();
ok('the form asks for purpose, date, times, people and a message',
  ['Purpose / Activity', 'Date', 'Start time', 'End time', 'Expected people', 'Message']
    .every((label) => bodyText.includes(label)),
  bodyText.replace(/\s+/g, ' ').slice(0, 120));

// FREE pricing must show up as soon as the free activity is chosen.
await page.selectOption('#purpose', 'BLOOD_DONATION');
await page.waitForTimeout(300);
const freeText = await page.locator('body').innerText();
ok('a free activity shows FREE', /FREE/.test(freeText));
ok('the activity label is friendly', freeText.includes('Blood Donation Camp'));

await page.selectOption('#purpose', 'STUDENT_FEST');
await page.waitForTimeout(300);
const paidText = await page.locator('body').innerText();
ok('a paid activity shows the owner’s price', paidText.includes('₹500'));

await page.selectOption('#purpose', 'BLOOD_DONATION');
await page.fill('#requestDate', dayPlus(20));
await page.fill('#startTime', '09:00');
await page.fill('#endTime', '14:00');
await page.fill('#expectedPeople', '200');
await page.fill('#message', 'Local blood donation camp.');
await page.screenshot({ path: `${SHOTS}/phase4-01-request-form.png`, fullPage: false });

await page.click('button[type="submit"]');
await page.waitForURL(/\/requests\/\d+$/, { timeout: 20000 });
await page.waitForTimeout(600);
const afterSubmit = await page.locator('body').innerText();
ok('submitting shows "Request sent successfully."', afterSubmit.includes('Request sent successfully.'));
ok('the new request is pending', afterSubmit.includes('Awaiting owner response'));
ok('the requester sees the amount as FREE', afterSubmit.includes('FREE'));
ok('no owner contact is shown while pending', !/Owner details/i.test(afterSubmit));

const requestUrl = page.url();
const requestId = Number(requestUrl.split('/').pop());
await page.screenshot({ path: `${SHOTS}/phase4-02-request-pending.png`, fullPage: false });

// ------------------------------------------------------------- 2. my requests

console.log('\n== the requester tracks it ==');
await page.goto(`${BASE}/requests`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector(`text=${spaceTitle}`, { timeout: 20000 });
ok('my requests lists the request', true);
ok('my requests card names the owner', /To reSOURCE Demo Owner/.test(await page.locator('body').innerText()));
ok('my requests shows a cancel action', await page.locator('text=Cancel Request').first().isVisible());
await page.screenshot({ path: `${SHOTS}/phase4-03-my-requests.png`, fullPage: false });

// ------------------------------------------------------------ 3. owner inbox

console.log('\n== the owner answers it ==');
await signOut(page);
await signIn(page, OWNER);

await page.goto(`${BASE}/requests`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector(`text=${spaceTitle}`, { timeout: 20000 });
const inbox = await page.locator('body').innerText();
ok('the requests page shows incoming and outgoing together',
  inbox.includes('Incoming requests') && inbox.includes('Requests you sent'));
ok('incoming requests shows the request', true);
ok('the inbox card names who asked', inbox.includes(`From ${REQUESTER.name}`));
ok('the inbox offers accept and reject',
  (await page.locator('text=Accept').first().isVisible()) &&
    (await page.locator('text=Reject').first().isVisible()));
ok('no requester contact is shown before acceptance', !inbox.includes('Phase Four Requester\nPhone'));
await page.screenshot({ path: `${SHOTS}/phase4-04-incoming.png`, fullPage: false });

// Accept through the details page, which is where the booking appears.
await page.goto(`${BASE}/requests/${requestId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Accept', { timeout: 20000 });
const ownerDetail = await page.locator('body').innerText();
ok('the owner sees the request details', ownerDetail.includes('Blood Donation Camp'));
ok('the owner sees no contact details while pending', !/Requester details/i.test(ownerDetail));

await page.click('button:has-text("Accept")');
await page.waitForSelector('text=Accept this request?', { timeout: 10000 });
await page.screenshot({ path: `${SHOTS}/phase4-05-accept-dialog.png`, fullPage: false });
await page.getByRole('button', { name: 'Accept request', exact: true }).click();
await page.waitForTimeout(1500);

const afterAccept = await page.locator('body').innerText();
ok('accepting confirms the booking', /Booking confirmed/i.test(afterAccept));
ok('the owner now sees the requester’s contact details',
  /Requester details/i.test(afterAccept) && afterAccept.includes(REQUESTER.email),
  afterAccept.replace(/\s+/g, ' ').slice(0, 140));
ok('the free booking is ₹0', /Total/i.test(afterAccept) && afterAccept.includes('₹0'));
await page.screenshot({ path: `${SHOTS}/phase4-06-accepted-owner.png`, fullPage: false });

// --------------------------------------------------------------- 4. bookings

console.log('\n== bookings ==');
await page.goto(`${BASE}/bookings`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Bookings I host', { timeout: 20000 });
await page.waitForTimeout(800);
const bookingsPage = await page.locator('body').innerText();
ok('the bookings page lists the hosted booking',
  bookingsPage.includes(spaceTitle) && bookingsPage.includes(REQUESTER.name));
ok('the booking shows the requester contact', bookingsPage.includes(REQUESTER.email));
await page.screenshot({ path: `${SHOTS}/phase4-07-bookings-owner.png`, fullPage: false });

await signOut(page);
await signIn(page, REQUESTER);
await page.goto(`${BASE}/bookings`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=My Bookings', { timeout: 20000 });
await page.waitForTimeout(800);
const requesterBookings = await page.locator('body').innerText();
ok('the requester sees the booking', requesterBookings.includes(spaceTitle));
ok('the requester sees the owner’s contact details', requesterBookings.includes(OWNER.email));
ok('the requester sees the owner name', requesterBookings.includes(OWNER.name));
await page.screenshot({ path: `${SHOTS}/phase4-08-bookings-requester.png`, fullPage: false });

// ------------------------------------------------------------ 5. conflict path

console.log('\n== a second request for the same slot cannot be accepted ==');

// A second requester asks for the slot that is now booked.
const second = await api('/requests', {
  method: 'POST',
  token: requesterToken,
  body: JSON.stringify({
    resourceType: 'SPACE',
    resourceId: spaceId,
    purpose: 'BLOOD_DONATION',
    requestDate: dayPlus(20),
    startTime: '13:00',
    endTime: '16:00',
    expectedPeople: 50,
  }),
});
ok('requesting an already booked slot is refused (409)', second.status === 409, `status ${second.status}`);
ok('the refusal explains why',
  second.body?.message === 'This space is already booked for the requested time.',
  second.body?.message);

// Two pending requests for the same free slot: only one can be accepted.
const pendingA = await api('/requests', {
  method: 'POST', token: requesterToken,
  body: JSON.stringify({ resourceType: 'SPACE', resourceId: spaceId, purpose: 'BLOOD_DONATION',
    requestDate: dayPlus(21), startTime: '09:00', endTime: '12:00', expectedPeople: 30 }),
});
const pendingB = await api('/requests', {
  method: 'POST', token: requesterToken,
  body: JSON.stringify({ resourceType: 'SPACE', resourceId: spaceId, purpose: 'BLOOD_DONATION',
    requestDate: dayPlus(21), startTime: '11:00', endTime: '15:00', expectedPeople: 40 }),
});
ok('two pending requests for one free slot are allowed',
  pendingA.status === 201 && pendingB.status === 201);

const acceptA = await api(`/requests/${pendingA.body.id}/accept`, { method: 'POST', token: ownerToken });
const acceptB = await api(`/requests/${pendingB.body.id}/accept`, { method: 'POST', token: ownerToken });
ok('the first one is accepted', acceptA.status === 200);
ok('the overlapping one is refused with 409', acceptB.status === 409, `status ${acceptB.status}`);
ok('the refused request stays pending',
  (await api(`/requests/${pendingB.body.id}`, { token: ownerToken })).body.status === 'PENDING');

// -------------------------------------------------------- 6. reject and cancel

console.log('\n== reject and cancel ==');
const toReject = await api('/requests', {
  method: 'POST', token: requesterToken,
  body: JSON.stringify({ resourceType: 'SPACE', resourceId: spaceId, purpose: 'STUDENT_FEST',
    requestDate: dayPlus(22), startTime: '10:00', endTime: '13:00', expectedPeople: 60 }),
});

// Rejecting is the owner's decision, so answer it as the owner.
await signOut(page);
await signIn(page, OWNER);
await page.goto(`${BASE}/requests`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector(`text=${spaceTitle}`, { timeout: 20000 });
await page.goto(`${BASE}/requests/${toReject.body.id}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('button:has-text("Reject")', { timeout: 20000 });
await page.click('button:has-text("Reject")');
await page.waitForSelector('text=Reject this request?', { timeout: 10000 });
await page.getByRole('button', { name: 'Reject request', exact: true }).click();
await page.waitForTimeout(1200);
const afterReject = await page.locator('body').innerText();
ok('rejecting works and is reported', afterReject.includes('Request rejected.'));
ok('a rejected request shows no booking', !/Booking/i.test(afterReject.split('Message')[1] ?? ''));
await page.screenshot({ path: `${SHOTS}/phase4-09-rejected.png`, fullPage: false });

// The requester cancels one of their own pending requests.
await signOut(page);
await signIn(page, REQUESTER);
await page.goto(`${BASE}/requests/${pendingB.body.id}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('button:has-text("Cancel Request")', { timeout: 20000 });
await page.click('button:has-text("Cancel Request")');
await page.waitForSelector('text=Cancel this request?', { timeout: 10000 });
await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
await page.waitForTimeout(1200);
const afterCancel = await page.locator('body').innerText();
ok('cancelling works and is reported', afterCancel.includes('Request cancelled.'));
await page.screenshot({ path: `${SHOTS}/phase4-10-cancelled.png`, fullPage: false });

// ------------------------------------------------------------- 7. authorization

console.log('\n== authorization in the browser ==');
const stranger = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const strangerPage = await stranger.newPage();
await signIn(strangerPage, STRANGER);

await strangerPage.goto(`${BASE}/requests/${requestId}`, { waitUntil: 'domcontentloaded' });
await strangerPage.waitForTimeout(1200);
const strangerView = await strangerPage.locator('body').innerText();
ok('an unrelated user is refused the request',
  /not yours to view/i.test(strangerView), strangerView.replace(/\s+/g, ' ').slice(0, 120));
ok('an unrelated user never sees contact details',
  !strangerView.includes(REQUESTER.email) && !strangerView.includes(OWNER.email));

await strangerPage.goto(`${BASE}/spaces/${spaceId}`, { waitUntil: 'domcontentloaded' });
await strangerPage.waitForSelector('text=Request This Space', { timeout: 20000 });
ok('an unrelated user can still ask for the space they do not own', true);
await stranger.close();

// --------------------------------------------------------------- 8. states

console.log('\n== loading, empty and error states ==');
const emptyContext = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const emptyPage = await emptyContext.newPage();
await signIn(emptyPage, STRANGER);
await emptyPage.goto(`${BASE}/requests`, { waitUntil: 'domcontentloaded' });
await emptyPage.waitForTimeout(1500);
const emptyText = await emptyPage.locator('body').innerText();
// The outgoing panel now covers spaces and materials alike, so its empty copy
// speaks of "anything" rather than "a space".
ok(
  'an empty my-requests list explains itself',
  /You have not requested anything yet/i.test(emptyText),
  emptyText.replace(/\s+/g, ' ').slice(0, 120),
);

await emptyPage.route('**/api/requests/my', (route) => route.abort('failed'));
await emptyPage.goto(`${BASE}/requests`, { waitUntil: 'domcontentloaded' });
await emptyPage.waitForTimeout(1500);
const errorText = await emptyPage.locator('body').innerText();
ok('a failed list shows an error with retry',
  /Unable to load requests/i.test(errorText) && /Retry/i.test(errorText));
await emptyPage.screenshot({ path: `${SHOTS}/phase4-11-error-state.png`, fullPage: false });
await emptyPage.unroute('**/api/requests/my');
await emptyContext.close();

// The two other errors a requester can meet: a slot that got taken while the
// form was open (409) and a request id that does not exist (404).
const errorContext = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const errorPage = await errorContext.newPage();
await signIn(errorPage, REQUESTER);

await errorPage.goto(`${BASE}/requests/99999999`, { waitUntil: 'domcontentloaded' });
await errorPage.waitForTimeout(1200);
ok('a missing request shows "Request not found."',
  /Request not found\./i.test(await errorPage.locator('body').innerText()));

await errorPage.route('**/api/requests', (route) =>
  route.request().method() === 'POST'
    ? route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 409,
          message: 'This space is already booked for the requested time.',
        }),
      })
    : route.continue(),
);
await errorPage.goto(`${BASE}/spaces/${spaceId}/request`, { waitUntil: 'domcontentloaded' });
await errorPage.waitForSelector('#purpose', { timeout: 20000 });
await errorPage.selectOption('#purpose', 'STUDENT_FEST');
await errorPage.fill('#requestDate', dayPlus(23));
await errorPage.fill('#startTime', '09:00');
await errorPage.fill('#endTime', '12:00');
await errorPage.fill('#expectedPeople', '20');
await errorPage.click('button[type="submit"]');
await errorPage.waitForTimeout(1200);
const conflictText = await errorPage.locator('body').innerText();
ok('a refused submission is explained, not swallowed',
  /This space is already booked for the requested time\./i.test(conflictText));
await errorPage.screenshot({ path: `${SHOTS}/phase4-14-conflict-message.png`, fullPage: false });
await errorPage.unroute('**/api/requests');
await errorContext.close();

// ------------------------------------------------------------- 9. responsive

console.log('\n== responsive ==');
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const mobilePage = await mobile.newPage();
await signIn(mobilePage, REQUESTER);
await mobilePage.goto(`${BASE}/bookings`, { waitUntil: 'domcontentloaded' });
await mobilePage.waitForTimeout(1200);
const overflow = await mobilePage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
ok('the bookings page does not overflow a 390px screen', overflow <= 1, `overflow ${overflow}px`);
await mobilePage.screenshot({ path: `${SHOTS}/phase4-12-mobile-bookings.png`, fullPage: false });

await mobilePage.goto(`${BASE}/spaces/${spaceId}/request`, { waitUntil: 'domcontentloaded' });
await mobilePage.waitForSelector('#purpose', { timeout: 20000 });
const formOverflow = await mobilePage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
ok('the request form does not overflow a 390px screen', formOverflow <= 1, `overflow ${formOverflow}px`);
await mobilePage.screenshot({ path: `${SHOTS}/phase4-13-mobile-request-form.png`, fullPage: false });
await mobile.close();

await browser.close();

// Leave the database as we found it: the space goes, its requests and booking
// disappear with it.
await api(`/spaces/${spaceId}`, { method: 'DELETE', token: ownerToken });
console.log(`\nleftovers removed at setup: ${removed}; suite space deleted at the end`);
console.log(`${passed} checks passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log(failures.map((failure) => `  - ${failure}`).join('\n'));
  process.exit(1);
}
