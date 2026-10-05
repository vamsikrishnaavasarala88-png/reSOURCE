# reSOURCE

**Reuse. Reimagine. Reconnect.**

A local marketplace for **underused spaces** and **surplus construction materials**.
The two modules stay independent: spaces are one marketplace, materials are another.

> **Status: Phase 7 — Maps, Location & Geographic Discovery.**
> Both marketplaces are live: spaces with requests and bookings, and surplus
> material with its own listings, filters, photos and material requests. The two
> modules stay independent — nothing links a material to a space.
> An optional AI layer turns a sentence into filters, and both marketplaces can be
> explored by distance and on a map. Voice search, notifications, payments and
> blockchain are still to come.

---

## Tech stack

| Layer     | Stack                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------- |
| Frontend  | React 19, TypeScript (strict), Vite, Tailwind CSS 4, React Router, Lucide                       |
| Backend   | Java 21, Spring Boot, Spring Web (MVC), Spring Security, Spring Data JPA, Validation, Flyway     |
| Auth      | Stateless JWT (HS512 via jjwt), BCrypt password hashing                                        |
| Database  | PostgreSQL 17                                                                                  |
| Dev tools | Docker Compose (PostgreSQL), Maven Wrapper, npm                                                |

---

## Project structure

```
reSOURCE/
├── frontend/                        # React + TypeScript + Vite app
│   ├── src/
│   │   ├── api/                     # fetch wrapper (+ bearer token) and endpoint paths
│   │   ├── components/              # Navbar, Footer, FormField, Alert, ProtectedRoute, cards…
│   │   ├── context/                 # AuthProvider + authContext (session state)
│   │   ├── hooks/                   # useAuth, useBackendStatus
│   │   ├── layouts/                 # MainLayout (navbar + content + footer)
│   │   ├── pages/                   # Home, Spaces, Materials, Login, Register, Dashboard, …
│   │   ├── services/                # authService, userService, healthService
│   │   ├── types/                   # auth, api, navigation types
│   │   ├── utils/                   # cn(), validation, tokenStorage
│   │   ├── App.tsx                  # route table (public + protected)
│   │   ├── main.tsx                 # React root, Router, AuthProvider
│   │   └── index.css                # Tailwind import + design tokens
│   ├── .env.example
│   └── vite.config.ts
├── backend/                         # Spring Boot API
│   ├── src/main/java/com/resource/backend/
│   │   ├── config/                  # SecurityConfig, WebConfig (CORS), JwtProperties
│   │   ├── controller/              # AuthController, UserController, HealthController
│   │   ├── dto/                     # request/response records (never expose hashes)
│   │   ├── entity/                  # User, Role
│   │   ├── exception/               # GlobalExceptionHandler + domain exceptions
│   │   ├── repository/              # UserRepository
│   │   ├── security/                # JwtService, JwtAuthenticationFilter, entry point…
│   │   └── service/                 # AuthService, UserService, HealthService
│   ├── src/main/resources/
│   │   ├── application.properties   # env-var driven configuration
│   │   └── db/migration/            # Flyway migrations (V1__create_users_table.sql)
│   ├── src/test/java/com/resource/backend/
│   │   ├── AuthenticationFlowTest.java   # end-to-end register/login/protected/profile
│   │   ├── security/JwtServiceTest.java
│   │   └── service/HealthServiceTest.java
│   ├── .env.example
│   └── pom.xml
├── docker-compose.yml               # PostgreSQL for local development
├── .gitignore
└── README.md
```

---

## Prerequisites

- Node.js 20+ and npm
- Java 21 (JDK)
- Docker (for PostgreSQL) — or any local PostgreSQL 17 instance

---

## Getting started

### 1. Environment files

```bash
cd reSOURCE
cp backend/.env.example .env          # docker compose reads this file
```

Set a real JWT secret (the backend refuses to start without one):

```bash
# macOS / Linux
openssl rand -base64 48
```

Paste the result into `JWT_SECRET` in both `.env` files (root and `backend/.env`).

### 2. Start PostgreSQL

```bash
docker compose up -d
```

Flyway creates the `users` table on the first backend start. Using an existing
local PostgreSQL instead of Docker? Create the database and role matching your
`.env` values:

```sql
CREATE USER resource_user WITH PASSWORD 'resource_pass';
CREATE DATABASE resource_db OWNER resource_user;
```

### 3. Run the backend

```bash
cd reSOURCE/backend
cp .env.example .env                  # loaded automatically (spring.config.import)
./mvnw spring-boot:run                # Windows: mvnw.cmd spring-boot:run
```

API on <http://localhost:8080>:

```bash
curl http://localhost:8080/api/health
# {"status":"UP","service":"reSOURCE"}
```

### 4. Run the frontend

```bash
cd reSOURCE/frontend
cp .env.example .env
npm install
npm run dev
```

App on <http://localhost:5173>. Register an account, or log in with one you created.

---

## API

| Method | Path                 | Access    | Purpose                                      |
| ------ | -------------------- | --------- | -------------------------------------------- |
| GET    | `/api/health`        | Public    | Service status                               |
| POST   | `/api/auth/register` | Public    | Create an account (`201`, user without hash) |
| POST   | `/api/auth/login`    | Public    | Exchange credentials for a JWT               |
| GET    | `/api/auth/me`       | Bearer    | The account behind the token                 |
| GET    | `/api/users/me`      | Bearer    | Current profile                              |
| PUT    | `/api/users/me`      | Bearer    | Update name, email and phone                 |

Signed-in calls send the access token twice - in `Authorization: Bearer <token>` and
in `X-Auth-Token: <token>` - and the API accepts either. Both are verified the same
way; a missing or invalid token is still `401`. The second header exists because
some hosting and preview proxies strip `Authorization` on the way to the API, which
otherwise makes every signed-in request arrive anonymous.

| GET    | `/api/spaces`        | Public    | Browse active listings (paginated)           |
| GET    | `/api/spaces/search` | Public    | Same filters, structured search              |
| GET    | `/api/spaces/mine`   | Bearer    | Listings owned by the caller (no deletes)    |
| GET    | `/api/spaces/{id}`   | Public    | One listing with photos, facilities, pricing |
| POST   | `/api/spaces`        | Bearer    | Create a listing (`201`)                     |
| PUT    | `/api/spaces/{id}`   | Owner     | Update a listing, including pause/resume     |
| DELETE | `/api/spaces/{id}`   | Owner     | Soft delete (`204`), hidden from search      |
| GET    | `/api/spaces/{id}/pricing` | Public | Activity pricing of one listing         |
| POST   | `/api/spaces/{id}/photos`  | Owner  | Upload 1–6 photos (multipart `files`)   |
| DELETE | `/api/spaces/{id}/photos/{photoId}` | Owner | Remove a photo                 |
| PUT    | `/api/spaces/{id}/photos/order` | Owner | Persist photo order (`[1,2,3]`)    |
| GET    | `/api/files/spaces/{file}` | Public | Serve an uploaded photo               |
| POST   | `/api/requests`      | Bearer    | Send a request for a space (`201`, starts `PENDING`) |
| GET    | `/api/requests/my`   | Bearer    | Requests the caller sent, newest first  |
| GET    | `/api/requests/incoming` | Bearer | Requests for the callers' spaces        |
| GET    | `/api/requests/{id}` | Party     | One request, for its requester or owner |
| POST   | `/api/requests/{id}/accept` | Owner | Accept (`200`) and create the `CONFIRMED` booking |
| POST   | `/api/requests/{id}/reject` | Owner | Reject a pending request                |
| POST   | `/api/requests/{id}/cancel` | Requester | Cancel a pending request              |
| GET    | `/api/materials`     | Public    | Browse active listings (paginated, same filters as search) |
| GET    | `/api/materials/search` | Public | Structured search: `q`, `category`, `condition`, `minQuantity` + `unit`, `maxPrice`, `freeOnly`, location + `radiusKm`, `sort` |
| POST   | `/api/ai/search-intent` | Public (rate limited) | A sentence plus optional `latitude`/`longitude` → validated filters, then the ordinary search. Answers with a fallback message when no AI key is configured. |
| POST   | `/api/ai/material-recognition` | Signed in | A photo → suggested category, condition and description for review. |
| POST   | `/api/ai/listing-extraction` | Signed in | A free-text description → suggested fields for review. |
| POST   | `/api/ai/generate-description` | Signed in | Drafts a listing description from the fields already filled in. |
| GET    | `/api/materials/mine` | Bearer   | The caller's own listings, paused ones included         |
| GET    | `/api/materials/{id}` | Public  | One active listing; its owner may also read a paused or deleted one |
| POST   | `/api/materials`     | Bearer    | Create a listing (`201`)                                |
| PUT    | `/api/materials/{id}` | Owner    | Update a listing, including pause/resume                |
| DELETE | `/api/materials/{id}` | Owner    | Soft delete (`204`), hidden from discovery              |
| POST   | `/api/materials/{id}/photos` | Owner | Upload 1–6 photos (multipart `files`)             |
| DELETE | `/api/materials/{id}/photos/{photoId}` | Owner | Remove a photo                          |
| PUT    | `/api/materials/{id}/photos/order` | Owner | Persist photo order (`[1,2,3]`)              |
| GET    | `/api/bookings/my`   | Bearer    | Bookings the caller made as requester   |
| GET    | `/api/bookings/owner` | Bearer   | Bookings on the caller's spaces         |
| GET    | `/api/bookings/{id}` | Party     | One booking, with the other party's contact details |

Errors use one shape everywhere and never contain stack traces:

```json
{
  "status": 400,
  "error": "Bad Request",
  "message": "Please correct the highlighted fields.",
  "errors": { "email": "Enter a valid email address." },
  "timestamp": "2026-10-03T10:52:53.839Z",
  "path": "/api/auth/register"
}
```

| Status | When                                                            |
| ------ | --------------------------------------------------------------- |
| 400    | Bean Validation failure (field messages in `errors`)            |
| 401    | Bad credentials, missing/invalid/expired token                  |
| 403    | Authenticated but not allowed                                   |
| 404    | Unknown record                                                  |
| 409    | Email already registered / already taken; slot already booked; request already answered |

Request bodies:

```jsonc
// POST /api/auth/register
{ "name": "Ada Lovelace", "email": "ada@example.com", "phone": "+91 98765 43210", "password": "StrongPass123" }

// POST /api/auth/login  ->  200
{ "email": "ada@example.com", "password": "StrongPass123" }
// { "accessToken": "eyJ…", "tokenType": "Bearer", "user": { "id": 1, "name": "Ada Lovelace",
//   "email": "ada@example.com", "phone": "+91 98765 43210", "role": "USER" } }

// PUT /api/users/me   (name, email, phone only — passwords are not editable here)
{ "name": "Ada Byron", "email": "ada.byron@example.com", "phone": "+91 90000 11111" }
```

### Authentication rules

- Passwords are hashed with **BCrypt** before storage and are never returned.
- Emails are stored lower-cased and **unique** (`uk_users_email`); duplicates are
  rejected with `409` regardless of casing.
- Every account gets the single role **`USER`**. Owners and requesters are not
  separated, because one person may both list and request resources later.
- Tokens are stateless: HS512, subject = user id, `exp` from
  `JWT_EXPIRATION_MINUTES` (default 120). Missing, tampered and expired tokens all
  return `401` with a clean message.
- `JWT_SECRET` is required and must be at least 32 characters; the app fails to
  start otherwise. No secret is committed to the repository.

---

### Space marketplace rules

- **Ownership comes from the token.** `POST`/`PUT`/`DELETE /api/spaces…` take the
  owner from the authenticated principal; an `ownerId` in a request body is
  ignored. Editing or deleting someone else's listing returns
  `403 {"message": "You are not authorized to modify this space."}`.
- **Pricing is per activity, never a single `space.price`.** `space_pricing`
  holds one row per activity (`MARKET`, `BLOOD_DONATION`, …). Only the owner
  decides what is free: `isFree: true` stores a price of `0` and shows a `FREE`
  badge. A paid activity without a price is rejected with
  `400 "Enter a price for Blood Donation Camp or mark it as free."`.
- **Deletes are soft.** `DELETE` sets `status = DELETED`; the row and its photos
  stay in the database but the listing disappears from `/api/spaces`,
  `/api/spaces/search` and `/api/spaces/{id}` (which answers `404`).
- **Search is structured.** `activity`, `minCapacity`, `minArea`, `maxArea`
  (square feet), `maxPrice`, repeated `facilities` (all must match),
  `latitude`/`longitude`/`radiusKm` and `sort` (`newest`, `capacity`,
  `area`, `distance`). `maxPrice=0` returns only listings whose selected
  activity is free.
- **Distance.** Coordinates in metres-free decimal degrees, compared with the
  Haversine formula after a bounding-box prefilter. The UI sends a location
  rounded to ~1 km and never shows anyone else's position. `distanceKm` comes back
  in the response: rounded for display, exact for filtering.
- **The bounding box is a prefilter, never the filter.** It is derived from the
  same sphere the Haversine measures on and drawn 1% wider than the circle, so a
  listing sitting exactly on the radius is handed to the distance check rather
  than filtered away by the database. Where no longitude range can cover the
  circle — very near a pole, or across the antimeridian — the longitude bound is
  dropped instead of drawn too narrow; the Haversine still decides who is inside.
- **Radius filtering is the backend's job.** `radiusKm` (1/5/10/25 in the UI, up
  to 500 accepted) is applied by the API together with every other filter. A
  radius without coordinates filters nothing, an out-of-range radius is ignored,
  a radius that is not a number is rejected with `400`, and a frontend-supplied
  distance is never trusted.
- **Maps need no key.** OpenStreetMap tiles through Leaflet, configured in one
  component. Leaflet is code-split and only fetched when a map is actually opened;
  the list is always the default view and stays complete when tiles cannot load
  ("Map could not be loaded. You can still browse the list.").
- **Location is optional everywhere.** Publishing, browsing, searching and
  requesting all work with no position at all. Refusing the browser prompt is
  answered with a plain sentence, never a browser error, and listings without
  coordinates simply do not appear in radius results — they are still found by
  every other filter and by name.
- **One visitor position, never published.** The browser's fix is used for the
  visitor's own distance, radius and "📍 You" marker. It is not stored, not shown
  to anyone else, and never sent to the AI provider: an AI search passes the
  radius words, and the backend does the geographic filtering against its own
  coordinates. The AI cannot invent a coordinate, an address or a distance.
- **No private data.** Listing responses expose the owner's `id` and `name`
  only — never email, phone or password hash.
- **Photos.** Stored on disk (`STORAGE_LOCAL_DIR`, default `backend/uploads/spaces`)
  with UUID file names; JPEG/PNG/WebP only, 5 MB per file. No blobs in PostgreSQL,
  and the storage layer is swappable for an object store later.

### Request, acceptance and booking rules

- **A request is always sent by the authenticated user.** `POST /api/requests`
  takes the requester from the token; a `requesterId` in the body is ignored.
  A user may own spaces *and* request other people's spaces - there are no
  permanent roles.
- **The requester can never be the owner.**
  `400 "You cannot request your own space."`.
- **Validation is server-side:** the space must exist and be `ACTIVE`, the date
  must not be in the past, both times are present and `endTime > startTime`,
  `expectedPeople >= 1`, the purpose must be an activity the owner actually
  offers for that space, and the message is capped at 500 characters.
- **Availability.** Several `PENDING` requests may sit on the same slot - that is
  a queue, not a booking. A *confirmed* booking blocks new requests with
  `409 "This space is already booked for the requested time."`, and acceptance
  re-checks the conflict immediately before confirming.
- **Double booking is enforced by the backend**, in two layers: `accept` runs in
  one transaction, locks the space row (`SELECT … FOR UPDATE`) and re-checks the
  confirmed bookings with the half-open rule `start1 < end2 AND start2 < end1`
  on the same date; PostgreSQL additionally rejects overlap at the storage level
  with `ex_bookings_no_overlap` (`EXCLUDE USING gist … tsrange(…, '[)')` on
  `btree_gist`). The database constraint is the second line of defence - H2,
  which the tests run on, cannot express it.
- **Acceptance creates the booking atomically.** The request becomes `ACCEPTED`
  and a `CONFIRMED` booking is written in the same transaction; if anything
  fails, neither is kept. Rejection and cancellation never create a booking.
- **Pricing comes from the owner.** The booking amount is the owner's configured
  price for that activity (`0` when the activity is free); `platformFee` is
  `0.00` because payments are not part of this phase, so `totalAmount` equals
  the amount. A free activity still produces a real confirmed booking.
- **Contact details are private until a booking exists.** Request lists return
  the counterpart's *name* only - no phone, no email - and `GET
  /api/requests/{id}` returns `contact: null` while the request is `PENDING`.
  Once a request is `ACCEPTED` and the booking is `CONFIRMED`, the requester
  sees the owner's phone and email and the owner sees the requester's; nobody
  else sees anything (`403`). The API never sends a hidden-by-CSS field.
- **Only the two parties can act.** Accept/reject are owner-only, cancel is
  requester-only and pending-only; every violation is `403` or `409`, decided
  server-side from the token, never from the UI.
- **Transitions are one-way:** `PENDING → ACCEPTED | REJECTED | CANCELLED`, and
  `ACCEPTED`/`REJECTED`/`CANCELLED` are final. Anything else is `409`.

---

### Material marketplace rules

- **Ownership comes from the token.** `POST`/`PUT`/`DELETE /api/materials…` take
  the owner from the authenticated principal; an `ownerId` in a request body is
  ignored. Another user editing or deleting a listing gets
  `403 {"message": "You are not authorized to modify this material."}`.
- **Paused and deleted listings leave discovery.** A listing is `ACTIVE`,
  `INACTIVE` or `DELETED`. Only `ACTIVE` listings appear in `/api/materials`,
  `/api/materials/search` and `GET /api/materials/{id}`; the owner still sees a
  paused one (`/mine` and by id) and deleting is a soft delete, so the row and
  its photos stay in the database. `PUT … {"status":"DELETED"}` is refused -
  deletion has exactly one door, `DELETE /api/materials/{id}`.
- **Quantity and unit are the owner's words.** The unit is free text with common
  suggestions (`pieces`, `bags`, `kg`, `tonnes`, …) and never inferred. A
  quantity filter is only applied together with a unit, so `200 kg` is never
  compared with `200 pieces`: `minQuantity` without `unit` is
  `400 "Choose a unit as well: quantities in different units cannot be compared."`.
- **Pricing is FREE or PAID, nothing in between.** `isFree: true` stores a price
  of `0` and shows the `FREE` badge; otherwise the price must be `>= 0`. The
  `freeOnly=true` filter uses `isFree`, not the price. `maxPrice` keeps free
  listings and returns the paid ones at or below it.
- **Condition is chosen by the owner** (`NEW`, `GOOD`, `USED`, `DAMAGED`) and is
  never guessed; categories are `BRICKS`, `CEMENT`, `TILES`, `WOOD`, `METAL`,
  `PIPES`, `SAND`, `STONE`, `OTHER`.
- **Photos use the same storage as spaces** (`LocalPhotoStorageService`,
  `/api/files/spaces/…`), JPEG/PNG/WebP only, 1–6 per listing, first photo on
  the card, with upload, removal and ordering from the edit page.
- **No private data.** Listing responses expose the owner's `id` and `name`
  only; phone and email appear only through the material request below.
- **Material requests reuse the Phase 4 request workflow** with
  `resourceType = MATERIAL` and `resourceId` = the material id. The requested
  quantity must be positive and may not exceed the listing's available quantity
  (`400 "You cannot request more than the available quantity. This listing has
  300 pieces."`), and an owner cannot request their own material. Accepting a
  material request creates **no booking** - the request becomes `ACCEPTED` and
  both parties can then see each other's contact details, which stay hidden
  while it is pending. Space requests and bookings are untouched by all of this.

---

## Frontend ↔ backend

The frontend calls the API through one small client (`src/api/client.ts`) which:

- attaches `Authorization: Bearer <token>` to protected requests automatically,
- raises a single `ApiError` type carrying the HTTP status and field level messages,
- ends the session when the API answers `401` to a request that carried a token.

Session handling (`AuthProvider`):

1. Only the **access token** is persisted (`localStorage`, key
   `resource.accessToken`). Passwords are never stored.
2. On startup the token is restored and verified with `GET /api/auth/me`; an
   invalid or expired token is discarded, a valid one keeps the user signed in.
3. Logout clears the token and the in-memory user.

Two ways to wire the two halves; pick one:

| Setup                 | Frontend `.env`                               | How it works                                                      |
| --------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| Direct call (default) | `VITE_API_BASE_URL=http://localhost:8080/api` | Straight to Spring Boot; CORS allows `localhost:5173`.             |
| Dev-server proxy      | `VITE_API_BASE_URL=` (empty)                  | Same-origin `/api` requests are proxied to `VITE_PROXY_TARGET`.    |

---

## Routes

| Route            | Access    | Status                                                             |
| ---------------- | --------- | ------------------------------------------------------------------ |
| `/`              | Public    | Landing page — hero, two marketplace cards, List → Discover → Request → Reuse |
| `/spaces`        | Public    | Space marketplace: filterable card grid, pagination, free filter    |
| `/spaces/:id`    | Public    | Photo gallery, facilities, per-activity pricing, owner actions      |
| `/spaces/create` | Protected | Create form: details, location, facilities, photos, pricing         |
| `/spaces/:id/edit` | Protected | Same form prefilled; owner-only, others see a clear refusal       |
| `/spaces/mine`   | Protected | The owner's listings, active and paused, with view/edit/delete      |
| `/materials`     | Public    | Material marketplace: search, filters, sorting, pagination          |
| `/materials/:id` | Public    | Gallery, every listing field, owner actions, "Request Material"     |
| `/materials/create` | Protected | Create form: basic information, quantity, condition, pricing, location |
| `/materials/:id/edit` | Protected | Same form prefilled, plus pause/resume and the photo manager    |
| `/materials/:id/request` | Protected | Ask the owner for a quantity of a material                   |
| `/login`         | Public    | Login form                                                          |
| `/register`      | Public    | Registration form                                                   |
| `/spaces/:id/request` | Protected | Request form: activity (with its price), date, times, people, message |
| `/requests`      | Protected | My requests: what the user asked for, cancel while pending           |
| `/requests/incoming` | Protected | Incoming requests for the user's spaces, accept/reject           |
| `/requests/:id`  | Protected | One request: accept/reject/cancel, booking and contact after acceptance |
| `/bookings`      | Protected | "My Bookings" and "Bookings I host", contact details on confirmed bookings |
| `/dashboard`     | Protected | Greeting, the owner's spaces, incoming requests and my requests; redirects to `/login` when signed out |
| `/profile`       | Protected | Profile view, edit, logout                                          |
| `*`              | Public    | Not-found page                                                      |

Signed-out users who open a protected page are sent to `/login` and returned to
the page they asked for after logging in.

---

## Environment variables

Kept out of version control; `.env.example` documents every variable.

**`frontend/.env`**

| Variable            | Default                 | Purpose                              |
| ------------------- | ----------------------- | ------------------------------------ |
| `VITE_API_BASE_URL` | `/api` (proxy)          | Base URL of the reSOURCE API.        |
| `VITE_PROXY_TARGET` | `http://localhost:8080` | Backend URL used by the Vite proxy.  |

**`backend/.env`** (the project-root `.env` is used by `docker-compose.yml`)

| Variable                | Default                 | Purpose                                    |
| ----------------------- | ----------------------- | ------------------------------------------ |
| `POSTGRES_DB`           | `resource_db`           | Database name.                             |
| `POSTGRES_USER`         | `resource_user`         | Database role.                             |
| `POSTGRES_PASSWORD`     | – (required)            | Database password.                         |
| `POSTGRES_HOST`         | `localhost`             | Database host.                             |
| `POSTGRES_PORT`         | `5432`                  | Database port.                             |
| `SERVER_PORT`           | `8080`                  | API port.                                  |
| `CORS_ALLOWED_ORIGINS`  | `http://localhost:5173` | Origins allowed to call the API.           |
| `JWT_SECRET`            | – (**required**)        | HS512 signing key, at least 32 characters. |
| `JWT_EXPIRATION_MINUTES`| `120`                   | Access token lifetime.                     |
| `STORAGE_TYPE`          | `local`                 | Photo storage backend (`local`).           |
| `STORAGE_LOCAL_DIR`     | `uploads/spaces`        | Folder for uploaded photos (relative to the backend). |
| `STORAGE_PUBLIC_PATH`   | `/api/files/spaces`     | URL prefix photos are served from.         |
| `STORAGE_MAX_FILE_BYTES`| `5242880`               | Maximum size of one photo (5 MB).          |
| `SEED_DEMO_DATA`        | `false`                 | Development only: seed a demo owner and three example spaces. |
| `SEED_DEMO_EMAIL`       | `demo@resource.local`   | Demo owner email (used when seeding).      |
| `SEED_DEMO_PASSWORD`    | `DemoPass123`           | Demo owner password (used when seeding).   |
| `AI_API_KEY`            | – (empty)              | Key for the OpenAI-compatible provider. Unset = AI features answer with their fallback message; the marketplaces are unaffected. Used server-side only. |
| `AI_BASE_URL`           | `https://api.openai.com/v1` | Provider endpoint (any OpenAI-compatible gateway). |
| `AI_MODEL`              | `gpt-4o-mini`          | Model used for text and vision calls.      |
| `AI_MAX_IMAGE_EDGE`     | `1024`                 | Longest side a photo is scaled to before it is sent for recognition. |
| `AI_SEARCH_REQUESTS_PER_MINUTE` | `20`           | Per-client cap on AI searches.             |

Maps and location need **no** environment variables: OpenStreetMap tiles are
fetched by the browser with no key, and the geographic filtering runs in the
database-backed API.

---

## Database

Schema is owned by **Flyway**; Hibernate runs with `ddl-auto=validate`, so a
mismatch between entity and schema fails fast instead of altering the database.

```sql
-- V1__create_users_table.sql
CREATE TABLE users (
    id            BIGSERIAL    PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    phone         VARCHAR(20),
    password_hash VARCHAR(100) NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'USER',
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uk_users_email UNIQUE (email)
);
```

```sql
-- V2__create_space_marketplace_tables.sql
spaces            (id, owner_id → users, title, description, address, latitude, longitude,
                   area, area_unit, area_sqft, capacity, availability, owner_note,
                   status, created_at, updated_at)
space_photos      (id, space_id → spaces, image_url, storage_key, display_order, created_at)
space_facilities  (id, space_id → spaces, facility)          -- UNIQUE (space_id, facility)
space_pricing     (id, space_id → spaces, activity_type, price, is_free, owner_note)
                                                            -- UNIQUE (space_id, activity_type)
```

Indexes: `idx_spaces_owner_id`, `idx_spaces_status`, `idx_spaces_area_sqft`,
`idx_spaces_coordinates`. Child rows cascade on delete.

```sql
-- V3__create_request_booking_tables.sql
requests (id, requester_id → users, space_id → spaces, resource_type, purpose,
          request_date, start_time, end_time, expected_people, message, status,
          created_at, updated_at)          -- CHECKs: end_time > start_time, expected_people >= 1, status
bookings (id, request_id → requests (UNIQUE), space_id → spaces, owner_id → users,
          requester_id → users, resource_type, booking_date, start_time, end_time,
          amount, platform_fee, total_amount, status, created_at, updated_at)
                                           -- one booking per request (uk_bookings_request)
```

```sql
-- V4__prevent_overlapping_bookings.sql  (PostgreSQL only)
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE bookings ADD CONSTRAINT ex_bookings_no_overlap
  EXCLUDE USING gist (space_id WITH =, booking_date WITH =,
                      tsrange(booking_date + start_time, booking_date + end_time, '[)') WITH &&)
  WHERE (status = 'CONFIRMED');
```

```sql
-- V5__create_material_marketplace_tables.sql
materials       (id, owner_id → users, title, category, description, quantity, unit,
                 material_condition, price, is_free, address, latitude, longitude,
                 owner_note, status, created_at, updated_at)
                 -- CHECKs: quantity > 0, price >= 0, NOT is_free OR price = 0, enums
material_photos (id, material_id → materials, image_url, storage_key, display_order, created_at)

-- V6__requests_support_material_targets.sql
requests ... material_id → materials, quantity_requested
             -- CHECK ck_requests_target: SPACE ⇒ space_id set, MATERIAL ⇒ material_id set
```

Indexes on `materials`: `idx_materials_owner_id`, `idx_materials_category`,
`idx_materials_condition`, `idx_materials_status`, `idx_materials_is_free`,
`idx_materials_coordinates`, `idx_materials_unit_quantity`; photo rows cascade.

V4 is PostgreSQL-specific (H2 cannot create an extension or an exclusion
constraint), so it lives in `db/migration-postgresql/`. Flyway loads
`db/migration` always and `db/migration-postgresql` only where
`FLYWAY_LOCATIONS` says so - the tests pin
`spring.flyway.locations=classpath:db/migration` so H2 never sees it.

Add changes as new `V<n>__description.sql` files in
`backend/src/main/resources/db/migration`.

---

## Scripts

**Frontend** (`frontend/`)

```bash
npm run dev        # dev server on :5173
npm run build      # tsc -b && vite build
npm run preview    # preview the production build
npm run lint       # oxlint
```

**Backend** (`backend/`)

```bash
./mvnw test                 # unit + MockMvc integration tests (H2, PostgreSQL mode)
./mvnw package              # build the jar
./mvnw spring-boot:run      # run locally
```

**Browser suites** (`tests/browser/`, needs both servers running)

```bash
npm install playwright && npx playwright install chromium-headless-shell
node phase4-request-workflow.mjs   # request -> accept -> booking, contacts, conflicts
node phase3-space-marketplace.mjs  # spaces: browse, filter, create, edit, photos, delete
node phase3-session-recovery.mjs   # a slow, stale 401 must not undo a fresh login
node phase2-auth-flow.mjs          # accounts: register, login, profile, logout, restore
```

**Database** (project root)

```bash
docker compose up -d        # start PostgreSQL
docker compose ps           # check status
docker compose down         # stop (add -v to drop the volume)
```

---

## Scope

**Implemented so far**

- Phase 1: project structure, responsive layout, routing, landing page, health
  endpoint, PostgreSQL wiring, API client with offline handling.
- Phase 2: user entity + `users` table, register, login, JWT authentication,
  protected API endpoints, protected frontend routes, profile view/edit, logout,
  session restore on refresh, migrations, tests.
- Phase 3: space marketplace — `spaces`, `space_photos`, `space_facilities` and
  `space_pricing`; owner-controlled create/edit/soft delete; photo upload,
  ordering and serving; structured search with activity, price, capacity, area,
  facility and distance filters; per-activity pricing with FREE listings; the
  `/spaces` grid, details page, create/edit forms and the owner's dashboard.
- Phase 4: request, acceptance and booking workflow — `requests` and `bookings`;
  requesting a space from its details page, the owner's inbox, accept/reject,
  requester cancellation, one confirmed booking per accepted request with the
  owner's price, server-side double-booking prevention, status badges, and
  contact details that appear on both sides only after confirmation.

- Phase 5: surplus material marketplace — `materials` and `material_photos`;
  owner-controlled create/edit/pause/soft delete; free-or-paid pricing with a
  clear FREE badge; quantity with an owner-written unit; the nine material
  categories and four conditions; photo upload, ordering and serving through the
  Phase 3 storage; search with text, category, condition, quantity + unit, price,
  free-only and location + radius; the `/materials` marketplace, details page,
  create/edit forms, the dashboard's "My Materials" section and material
  requests (`resourceType = MATERIAL`) with quantity validation and contacts
  that unlock on acceptance.

- Phase 6: AI intelligence layer — one OpenAI-compatible provider behind
  `AIService`; natural-language search intent for both marketplaces, material
  recognition from a photo, listing extraction from a description, and
  description drafting. The AI only ever proposes: the backend validates every
  field, unknown values stay `null`, the browser never sees the key, and with no
  `AI_API_KEY` set every AI endpoint answers with its fallback message while the
  marketplaces keep working.
- Phase 7: maps, location and geographic discovery — a location service and hook
  for the browser's position, OpenStreetMap + Leaflet maps (no key) with
  `[ List ] [ Map ]` views for spaces and materials, a location picker on the
  create/edit forms ("use my location", "select on map", clear the pin), Haversine
  distance and radius filtering enforced by the backend for 1/5/10/25 km alongside
  every existing filter, a location section with "Get Directions" on both details
  pages, and an AI radius intent that feeds the ordinary, backend-filtered search.

**Not implemented yet:** payments, notifications, voice search, blockchain, QR
codes, admin, and anything that links a material to a space (no matching, no
bundles, no recommendations). Payments in particular: `platformFee` is `0.00` and
no money moves through reSOURCE.
