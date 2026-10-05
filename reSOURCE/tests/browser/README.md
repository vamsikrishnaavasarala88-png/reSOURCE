# Browser suites

Node scripts that drive a real Chromium against the running app. They are not
part of the app build; run them by hand after the servers are up.

```bash
# prerequisites: backend on :8080, app on :5173 (see the note below)
npm install playwright && npx playwright install chromium-headless-shell

node phase2-auth-flow.mjs               # accounts: register, login, profile, logout, restore
node phase3-space-marketplace.mjs       # spaces: browse, filter, create, edit, photos, delete
node phase3-session-recovery.mjs        # a slow, stale 401 must not undo a fresh login
node phase4-request-workflow.mjs        # requests: ask, accept, reject, cancel, bookings
node phase5-material-marketplace.mjs    # materials: browse, filter, create, photos, request
node phase6-ai-intelligence.mjs         # AI: search intent, image recognition, listing assist
node phase7-maps-location.mjs           # maps, location, distance and radius filtering
```

Every suite prints one line per check and exits non-zero on failure. Unless it is
listed under "needs" below, a suite creates its own accounts, cleans up what it
created before and after the run, and needs no manual setup.

| Suite | Needs | Default target |
| --- | --- | --- |
| phase2-auth-flow | `ada@example.com` to exist (register it once on a fresh database) | `APP_URL` → :5173 |
| phase3-space-marketplace | `ada@example.com`; removes leftover `Test Ground …` listings at start | `APP_URL` → :5173 |
| phase3-session-recovery | – | `APP_URL` → :5173 |
| phase4-request-workflow | – | `APP_URL`/`API_URL` → :5173 / :8080 |
| phase5-material-marketplace | writes PNG fixtures to `/tmp/resource-phase5-fixtures` | `APP_URL`/`API_URL` → :5173 / :8080 |
| phase6-ai-intelligence | the AI stack below | :5174 → :8081 **and** :5173 → :8080 |
| phase7-maps-location | the AI stack below (the AI radius check needs the provider); outbound access to OpenStreetMap for tiles | :5174 → :8081 |

Every suite takes its target from `APP_URL` (and `API_URL` where it calls the API
directly), so the whole set can run against the AI stack alone - `APP_URL=http://localhost:5174
API_URL=http://localhost:8081/api`. Phase 6 is the one exception: its
"provider is unavailable" checks call a backend that has no `AI_API_KEY` set, so
it also needs the AI-free backend on `:8080` and a second preview on `:5173`
(or any other pair passed through `PLAIN_APP_URL` / `PLAIN_API_URL`).

## Environment variables

| Variable | Default | Used by |
| --- | --- | --- |
| `APP_URL` | `http://localhost:5173` | all suites |
| `API_URL` | `http://localhost:8080/api` (`:8081/api` for phase 6) | all suites |
| `PLAIN_APP_URL` / `PLAIN_API_URL` | `http://localhost:5173` / `:8080/api` | phase 6 only |
| `SHOT_DIR` | `/home/user/preview` | phase 3, 5, 6, 7 |

## The Phase 7 checks

`phase7-maps-location.mjs` builds its own fixtures through the API — spaces and
materials at ~0.3 km, ~4 km and ~24 km from a known visitor position, plus one of
each with no coordinates at all — then drives the browser against them:

* browsing with no location, and refusing the prompt (the marketplace stays usable);
* the distance the backend calculated, checked against an independent Haversine
  calculation for the same coordinates the browser sent;
* the 1/5/10/25 km options keeping exactly what falls inside them, on both
  marketplaces and combined with the existing filters;
* the map view: markers only for listings with coordinates, popups with title,
  address, distance and facts but no contact details, and a marker that opens the
  listing;
* the space map and the material map staying independent of each other;
* the details page: location section, "X km away", "Get Directions" built from the
  listing's own coordinates, and the graceful state for a listing with no pin;
* the picker on create and edit — click the map, use the device position, move the
  pin, clear it — with the stored coordinates verified through the API;
* an AI sentence ("free bricks within 5 km") producing a radius chip and real,
  backend-filtered results;
* validation on the API: out-of-range coordinates rejected, a malformed radius
  rejected with a clean `400`, an out-of-range radius treated as no radius, and an
  impossible radius from the AI dropped rather than applied;
* the edge of the circle: a listing built exactly on the radius line is returned,
  and the same search a metre tighter excludes it (the backend test suite pins
  this down to the metre; see `LocationSearchTest`);
* the rest of the app still working: sign-in, a space request from creation to
  acceptance, contacts revealed only after acceptance, and the booking it creates.

It cleans up every listing it created, before and after the run. The marker labels
in the demo data overlap where listings sit at the same coordinates; the suite
activates a marker from the keyboard so a check never depends on which pill is on
top.

## The Phase 6 stack

Phase 6 needs two backends: one with AI configured (against the mock provider)
and one without, to prove the marketplaces and every manual path still work when
the AI layer is switched off.

```bash
# 1. the test-only provider stand-in (OpenAI compatible, no key, no network)
node reSOURCE/tests/mock-ai-provider.mjs            # :8787

# 2. the API with AI configured, against the stand-in
cd reSOURCE/backend
AI_API_KEY=mock-provider-key-for-tests \
AI_BASE_URL=http://127.0.0.1:8787/v1 \
AI_MODEL=mock-vision-model \
AI_MAX_IMAGE_EDGE=4096 \
java -Xmx256m -jar target/resource-backend-0.0.1-SNAPSHOT.jar --server.port=8081

# 3. the same API without AI (the deployment default), on :8080
java -Xmx256m -jar target/resource-backend-0.0.1-SNAPSHOT.jar

# 4. the app twice, each proxying to its own API
cd reSOURCE/frontend && npm run build
npx vite preview --port 5173 --strictPort                        # → :8080
VITE_PROXY_TARGET=http://localhost:8081 \
  npx vite preview --port 5174 --strictPort                      # → :8081
```

`mock-ai-provider.mjs` answers by reading the prompt as words, so its replies
track the sentence the suite typed instead of a fixed script: a material or
space noun becomes a category or activity, `500 pieces` / `900 people` become a
quantity or a capacity, `under ₹500` becomes a price cap. It still always
includes a bogus `quantity` in image answers (the app must drop it), an unknown
category and a negative price in a deliberately absurd search, and it answers
`500` to any prompt containing `FAIL` so the fallback path is exercised for
real. Restart it whenever it changes - and note that a running backend caches
one intent per query for five minutes, so a query typed before the restart keeps
its old filters; restart the backend too when verifying a changed reply.

### Development server or built app?

The suites work against either. `npx vite dev` is the normal development
server; `npm run build && npx vite preview` serves the built bundle on the same
port with the same `/api` proxy (`preview.proxy` in `vite.config.ts`). The built
bundle is much lighter, so it is the better choice on a small machine: a dev
server that has to transform every module on demand can stall under memory
pressure and make `page.goto(..., { waitUntil: 'networkidle' })` time out —
which looks like an application bug but is not one.

## Known behaviour the suites encode

- `phase3-session-recovery` answers a stored-session check with a `401` *after*
  a fresh login has succeeded. The client must ignore that stale answer and keep
  the new session; the suite fails if the user is signed out again.
- Phase 4 and later suites must never assert `statusLabel == "Booking confirmed"`
  for a material request: an accepted material request is "Request accepted".
- On `/spaces` and `/materials` the first `<h2>` is the AI search panel heading;
  the results heading carries `data-testid="results-heading"`.
- Real filter ids on `/spaces`: `#filter-activity`, `#filter-max-price`,
  `#filter-min-capacity`, `#filter-min-area`, `#filter-max-area`,
  `#filter-facility-<value>`, `#filter-radius`, `#filter-sort`. The space form's
  first field is `#title` (there is no `#space-title`).
- On `/materials/create` the photo chosen in the AI card is the listing's **main
  image** and the "More photos (optional)" section below it is a second, optional
  picker (`#material-extra-photos`). The edit form's `#material-photos` manager
  therefore starts with whatever the create form uploaded. Space and material
  listings hold at most 6 photos, and a material detail response has no
  `primaryImageUrl` - use `/materials/mine` or a space summary for that.
- The space AI search understands facilities and area, so its chips can read
  "With Electricity, Water" or "From 5000 sq ft"; `mock-ai-provider.mjs` reads
  those from the sentence too, and ignores sizes/distances when looking for a
  price. When a criterion has to be relaxed, the space results are reordered
  closest-first - do not assert "newest first" on a relaxed AI search.
