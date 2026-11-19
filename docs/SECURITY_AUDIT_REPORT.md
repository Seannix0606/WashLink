# WashLink security audit report

Date: 2026-11-20. Code assessed: `a857251` (GitHub `main`, the code running on the live site). Assessment environment:
an isolated clone (`C:\Users\PC\WashLink-audit`) with its own local Supabase stack (`washlink-audit-local-test`, API on
`127.0.0.1:55321`), rebuilt from every migration, with synthetic accounts and data. **No live system was attacked or
scanned.** The live project (`wkkqlugwuvenzapitkdt`, `washlink-h7rc.onrender.com`) was never contacted.

Fixes are described in `docs/SECURITY_REMEDIATION_REPORT.md`.

## Executive summary

WashLink's server-side security is largely sound. It rests on row level security and security-definer database
functions, and it held up under real attacks: 58 tables tested across five attacker accounts, 471 function calls made
with other people's ids, and attempts at role escalation, verification bypass, price tampering, forged tokens, chat
eavesdropping and storage access were all refused.

One serious problem was found and proven:

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| F1 | A customer can recover a washer's exact base location (often their home) and private service range | **High** | Confirmed, 0 m error in 61 requests. **Affects the live site.** |
| F2 | Washer ID documents stay in storage after account deletion (cleanup job never runs) | Medium | Confirmed in code and on the audit stack |
| F3 | Legacy FastAPI list endpoints have no authentication (profiles include phone numbers) | Low (latent) | Confirmed in code; not deployed, no real data connected |
| F4 | "As soon as possible" bookings are still accepted by the server after being removed as a product rule | Low | Confirmed |
| I1–I5 | Informational items (error detail, status codes, stored markup, dev defaults) | Info | See below |

## Scope and method

- **Source**: web app (`frontend/`), shared package, Expo app (`mobile/`), 117 migrations, 2 edge functions, legacy
  FastAPI `backend/`, Docker Compose, `render.yaml`, GitHub workflows.
- **Live attack on the isolated stack**, through the public API gateway exactly as a real user would, with six accounts:
  customer A, customer B, washer A (verified), washer B (verified), a pending washer, an admin. Victim data: customer A's
  Home address (with a gate code), a booking accepted by washer A with chat messages and a chat photo, customer B's open
  booking.
- Attack scripts and JSON evidence: `audit/attack/*.mjs`, `audit/evidence/*.json`.
- Baseline database suite on the audit stack: 135 files, 3,879 tests, the same two failures as `main` (pre-existing,
  date/time dependent: `j18` test 1, `j19_b2c6_dispatch_rounds_and_distance`).
- Dependency audit (`npm audit`): web shipped packages 0 vulnerabilities; 7 moderate in lint tooling only; mobile 4
  moderate in Expo build tooling.
- Not used: Strix (it could not run on the ChatGPT subscription; no run started).

---

## High

### F1. Washer base location and service range can be recovered by any customer

- **Severity:** High. **Confirmed.** Affects production.
- **Affected:** `public.service_booking_available_slots` (live definition in
  `supabase/migrations/2026_11_06_b2cc_booking_engine.sql`; replaced, with the same leak, in
  `2026_11_20_ssr_slots_within_service_range.sql`), `public.independent_worker_is_eligible` (`2026_11_06_b2cc`), and
  `public.create_service_booking`, which refuses with "That time is no longer available" for the same reason.
- **Why it is vulnerable:** the functions never return coordinates, but they answer an exact yes/no question for any
  coordinates the caller chooses: "is this point within `service_radius_km` of a washer's `base_latitude/longitude`?"
  The live version answers through `is_available`, the new one by listing times at all. An unlimited, exact,
  attacker-controlled oracle reveals the circle, and the circle's centre is the washer's base.
- **Evidence (`audit/evidence/06-locate-washer.json`, `06b-locate-washer-live-definition.json`):** signed in as customer B,
  a binary search for the edge of the covered area in four directions took **61 lookups** and returned
  `14.55470, 121.02440` with a range of `20.00 km`. Washer A's real base is `14.5547, 121.0244`: **0 m error**. The same
  attack against the live function definition gave the same result.
- **Exploitation:** sign up as a customer (free), call the booking-times function through the public API with chosen
  coordinates, and compute the centre. The work is scriptable and takes seconds per washer.
- **Impact:** washers often use home as their base, so a stalker, an aggrieved customer or a competitor can locate a
  washer's home. This is a physical-safety risk and personal data under the Data Privacy Act. Customers are not exposed.
- **Remediation:** never answer coverage against the exact base and range. Compare against a privacy-preserving service
  area (a secret, persistent offset from the base that repeated queries cannot average away), on a coarse grid, and cap
  how many distinct locations one account can check per day.
- **Verification:** re-run `audit/attack/06-locate-washer.mjs`. The search must be stopped by the location cap, and
  with the cap lifted the recovered point must be at least 0.8 km from the real base. Legitimate booking times and
  dispatch must still work.

## Medium

### F2. Washer identity documents are kept after account deletion

- **Severity:** Medium (privacy and retention; not an exposure). **Confirmed.**
- **Affected:** `supabase/functions/purge-worker-documents/index.ts` ("NOT DEPLOYED, NOT SCHEDULED AND NEVER RUN"),
  queue `public.independent_worker_document_file_queue`, functions `worker_document_files_claim` and
  `worker_document_files_confirm_removed` (`2026_11_06_b2cn_worker_verification_gate.sql`).
- **Why:** deleting a document row (including through account deletion) queues its file correctly, but SQL cannot delete
  a file, and nothing ever runs the job that removes queued files through the Storage API.
- **Evidence:** the code says so itself, and the admin console reports the queue's size and age. Reproduced on the audit
  stack (`audit/f2-documents-after-deletion.mjs`): after a washer deleted their account, **2 of 2** of their ID files
  were still in storage and queued.
- **Impact:** government IDs and selfies of washers who deleted their account stay in a private bucket indefinitely.
  They are not reachable through the app (bucket private, admin read window bound to a document row), but retention
  breaks the deletion promise and widens the damage of any future storage breach.
- **Remediation:** run the existing, tested purge logic on a schedule with the service role, and keep it idempotent and
  per-file.
- **Verification:** delete a washer with documents, run the job, and confirm their files are gone, another washer's files
  are intact, and a second run changes nothing.

## Low

### F3. Legacy FastAPI endpoints have no authentication

- **Severity:** Low (latent). **Confirmed in code; not exploitable against real data today.**
- **Affected:** `backend/app/api/api_v1/routers/{bookings,profiles,shops,workers}.py` (GET `/api/v1/bookings`,
  `/profiles`, `/shops`, `/workers`), `backend/app/core/config.py` (`debug` defaults to `True`, placeholder
  `secret_key` default), `compose.yaml` (publishes port 8000 on all interfaces).
- **Why:** no route has an authentication dependency. `/api/v1/profiles` returns every profile's `full_name` and
  `phone_number`.
- **Reachability check:** not deployed (`render.yaml` is web-only), not called by the web or mobile apps, starts only
  with `docker compose --profile legacy-backend`, and defaults to its own SQLite file. The repository's `.env` files
  hold no `DATABASE_URL` (key names checked, values not read).
- **Exploitation (if enabled with a real `DATABASE_URL`):** anyone who can reach port 8000 lists everyone's names and
  phone numbers.
- **Remediation:** fail-closed authentication and admin-only authorization on every data route; debug off by default.
- **Verification:** requests without a valid credential get 401/503; backend tests pass.

### F4. "As soon as possible" bookings are still accepted by the server

- **Severity:** Low (business rule bypass). **Confirmed.**
- **Affected:** `public.create_service_booking` (`p_is_immediate`); `mobile/app/book.tsx` still offers the option.
- **Evidence (`audit/evidence/04-escalation-and-booking.json`):** `create_service_booking` with `p_is_immediate: true`
  returned 200 and a booking in `searching_for_worker`. Commit `19fbafe` removed the option because "customers always
  pick a day and time".
- **Impact:** customers can push instant requests to online washers outside the agreed workflow, including the travel
  and start windows that only apply to scheduled bookings. There is no data exposure.
- **Remediation:** gate immediate bookings on the server behind a setting that is off by default, and remove the option
  from the mobile app as the web did.

## Informational

- **I1. Stored markup in chat** (`07-misc`): `<img onerror>` and `<script>` are stored as message text. Not exploitable:
  no `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML` or WebView rendering exists in web, mobile or shared
  code, and React escapes text. Keep it that way.
- **I2. PostgREST hints name tables and grants** in refusals ("Grant the required privileges … GRANT UPDATE ON
  public.independent_workers"). This is standard Supabase behaviour and reveals no data.
- **I3. `decline_dispatch_request` returns HTTP 500** (SQLSTATE 55000) for another washer's request. The message is
  generic, so ownership does not leak, but a client error comes back as a 5xx.
- **I4. Development defaults:** the local Supabase stack binds ports on all interfaces (dev only), and the backend's
  `secret_key` placeholder default is unused.
- **I5. Dependencies:** no vulnerable shipped web package. 7 moderate (web lint tooling) and 4 moderate (Expo build
  tooling) remain; updating Expo tooling needs an Expo upgrade.

---

## Security controls tested and holding

| Area | Attack | Result |
| --- | --- | --- |
| Anonymous access | OpenAPI discovery, read and insert on every visible table, every visible function, bucket listing | Only the catalog (services, prices, add-ons) is readable; 0 writes; 2 harmless functions; bucket list empty |
| Row level security | 58 tables read by customer A/B, washer A/B and the pending washer; direct updates of customer A's rows in 9 tables by three attackers | No cross-user rows. Washers see their own offers and notifications by design. 0 updates succeeded |
| IDOR / function auth | **471** calls to every signed-in function with victim ids as customer B, washer B and the pending washer | 0 calls returned or changed victim data; ownership refusals ("Booking not found", "Conversation not found", "Only a platform administrator…") |
| Dispatch | Washer B declines or accepts washer A's open offer | Refused; offer still `offered` |
| Role escalation | `profiles.role` update; `user_metadata.role = super_admin`; sign-up with role `super_admin`; washer sign-up while closed | All refused or sanitised to `customer` |
| Washer verification | Pending washer sets `verified` or `is_platform_operator`; customer inserts itself as a verified washer | Refused (no grants) |
| Booking integrity | Customer edits price, fees, commission, status, worker, schedule on own booking; review before completion; car priced as motorcycle; booking out of range | All refused; prices only from the server |
| Booking steps | `advance_service_booking` | One step at a time, assigned washer only, time windows enforced |
| Tokens | `alg: none` token claiming `service_role`; real signature with altered `sub` | Rejected (401) |
| Chat privacy | Strangers on Realtime for messages, bookings, read receipts, dispatch; joining the private `booking-chat:<id>` channel; sending fake typing | 0 events (control: the rightful customer and washer each received the new message); channel join refused |
| Chat photos | Download, signed URL, public URL, list, overwrite by strangers | All refused; owner can download |
| Other buckets | Listing worker and shop verification documents | 0 items |
| Owner-column tampering | Address, vehicle, message or notification created in another user's name; moving own address to another account | Refused |
| Spam limit | Burst of bookings | Stopped at 5 open bookings |
| Edge functions | Code review | Constant-time secret comparison; empty secret never matches |

## Unconfirmed risks needing further work

- **Live configuration** (email confirmation, Auth rate limits, CSP header on Render) was not re-tested; the
  2026-11-13 report covers it and noted the CSP header is not applied by Render.
- **Edge functions** were reviewed but not executed (not served locally).
- **Mobile app** reviewed as code only; no device testing.
- **Realtime presence and broadcast** beyond the booking-chat channel were not exhaustively enumerated.
- **The workforce (B2B) feature set** was included in the IDOR sweep with victim ids from B2C data only; B2B-specific
  objects (contracts, roster links) were not seeded.
