# WashLink security remediation report

Date: 2026-11-20. Findings: `docs/SECURITY_AUDIT_REPORT.md`. All work is in the isolated audit copy
`C:\Users\PC\WashLink-audit`, branch `security/remediation`; no live system was touched during the remediation itself.
**Afterwards, with your approval, the three database migrations were applied to the live project on 2026-11-20 and the
fixes were merged to `main`** (section 7). The original repository `C:\Users\PC\WashLink` was not modified.

## Summary

| Finding | Severity | Status | Commit |
| --- | --- | --- | --- |
| F1 Washer base location and range recoverable by customers | High | **Fixed and verified** on the audit stack, **applied on the live project 2026-11-20** (section 7) | `4606675` [SEC-2] |
| F2 Washer ID documents kept after account deletion | Medium | **Fixed and verified**; needs GitHub secrets to run in production | `11e6c6d` [SEC-5] |
| F3 Legacy FastAPI data routes unauthenticated | Low (latent) | **Fixed and verified** | `d102b3e` [SEC-4] |
| F4 "As soon as possible" accepted by the server | Low | **Fixed and verified**; mobile app updated | `6a31468` [SEC-3] |
| Mobile test broken by B2C-8 (found while verifying) | — | Fixed | `6bd680b` |

Every control that blocked an attack in the assessment was re-attacked after the changes and still holds (section 6).

## 1. F1: washer location privacy [SEC-2]

**Root cause:** booking times (`service_booking_available_slots`) and booking creation (`create_service_booking`, via
`independent_worker_is_eligible`) answered "is this exact point within `service_radius_km` of the washer's exact base?"
for any coordinates, without limit. That is an exact oracle, and 61 lookups recovered the base to 0 m.

**Design.** Rounding alone was rejected, because repeated queries average rounding away. The fix has three layers:

1. **Private service centre** (`public.independent_worker_service_areas`, RLS on, no grants to `anon` or
   `authenticated`). Each washer gets a secret, persistent vector: a 0.8–1.5 km offset in a random direction, plus a
   0–1 km range margin. Coverage is measured from the shifted centre with radius + offset + margin, so the washer's own
   neighbourhood stays covered. A persistent bias cannot be averaged out by repeated queries: the most an unlimited
   attacker can learn is the shifted centre. The vector is kept when the base moves, so two centres reveal only the
   move, not the base. A trigger keeps the centre in step with the base, and the migration backfills every existing
   washer.
2. **Grid snapping.** The customer's point is rounded to 0.01° (about 1.1 km) before the check.
3. **Location cap.** `public.service_location_checks` counts distinct grid cells per customer per 24 hours
   (`platform_settings.max_location_checks_per_day`, default 20; SQL only). The calendar's 28 per-day lookups at one
   address count once. Over the cap: "You have checked too many different places today…".

`independent_worker_is_eligible` and `service_booking_available_slots` both use the private centre, so booking
times, booking creation, dispatch and acceptance stay consistent. Dispatch ranking and the distance band shown to
washers still use the real base, which customers never see. All client-callable signatures are unchanged, so the web
and mobile apps need no change. The slots function is now `VOLATILE`, because it records the check; both apps already
call it with POST.

**Files:** `supabase/migrations/2026_11_21_sec2_washer_location_privacy.sql`,
`supabase/tests/database/j19_sec2_washer_location_privacy.test.sql`, `j17_…` table list.

**Verification:**

| Check | Before | After |
| --- | --- | --- |
| Real attack, default cap (`audit/attack/06-locate-washer.mjs`) | Base found, **0 m**, range 20.00 km, 61 lookups | **Refused after 38 lookups** (20 distinct places), no estimate |
| Same attack, cap lifted to 1,000 (attacker with many accounts) | — | Estimate **1,147 m** from the base, range reported 21.24 km (true 20) |
| Same attack on the **live** function definition | **0 m** (`06b-…json`) | Fixed by the same migration |
| pgTAP `j19_sec2` (19 checks) | — | 19/19 pass: centres and checks unreadable by customers and washers; helper functions not callable; centre 0.8–1.5 km from base; offset survives a base move; **unlimited triangulation misses the base by >500 m** (worst case pinned); configured range not returned; times at the base and 2 km away; none 33 km away; booking and dispatch work; 28 days at one address = 1 check; 21st place refused; checks expire after 24 h |
| Real browser, web app on the fixed stack (Playwright, desktop and phone) | — | 26/26: sign-up with Home, booking at Home and at another place, **times shown (11 open days)**, change Home. Each customer used 1 of 20 checks |

**Residual risk (documented, not hidden):**
- `create_service_booking` refuses out-of-range points, and a refused call is rolled back, so the cap does not count
  it. It now answers against the private centre, so it can reveal at most the shifted centre, the same as an unlimited
  attacker. Booking spam limits still apply to successful calls.
- An attacker with many accounts can collect the coarse covered area and estimate the shifted centre (about 1.1 km from
  the base in the test). The washer's home then lies somewhere 0.8–1.5 km from that point, in an unknown direction.
- A washer may now receive requests beyond their configured range: up to about 4.8 km in the direction of their secret
  shift (the centre moves up to 1.5 km and the range grows by offset + margin, up to 2.5 km, plus up to 0.8 km of grid
  rounding) and up to about 1.8 km in the opposite direction (margin + grid). They can decline them.
- Strongest additional protection: ask washers to set their base to a public landmark near home.

## 2. F2: deleted washers' ID documents [SEC-5]

**Root cause:** the database already queued every file of a deleted document row, but nothing removed queued files,
because the edge function `purge-worker-documents` was never deployed or scheduled.

**Fix:** no database change; it reuses the existing tested logic.
- `supabase/functions/purge-worker-documents/drainWorkerDocumentQueue.ts`: repeats the existing
  `purgeWorkerDocumentFiles` (claim → Storage API remove → database confirms what is really gone) until the queue is
  empty. A round that confirms nothing stops the run (no hot loop), and failed files stay queued for the next run.
  It returns counts only.
- `scripts/jobs/purge-worker-documents.mjs`: Node runner for the same TypeScript modules. It reads the service-role key
  from the environment, never prints it, and logs counts only, never file names. Exit codes: 0 = queue empty,
  1 = something stayed queued, 2 = not configured.
- `.github/workflows/purge-worker-documents.yml`: hourly. It is dormant until the repository variable
  `PURGE_WORKER_DOCUMENTS_ENABLED=true` and the secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
  Permissions are `contents: read`, and the actions are pinned to commit SHAs.

**Verification (audit stack, `audit/f2-documents-after-deletion.mjs`):** two washers uploaded both required documents,
and one deleted their account.

| | Deleted washer's files in storage | Queue | Other washer's files |
| --- | --- | --- | --- |
| After deletion (bug reproduced) | **2/2** | 2 | 2/2 |
| After the job | **0/2** | 0 | **2/2** (untouched) |
| Second run | claimed 0, exit 0 (idempotent) | 0 | 2/2 |

Vitest `drainWorkerDocumentQueue.test.ts`: 5 cases, all passing (450-file backlog over 4 rounds, empty queue, a file
that keeps failing stops and stays queued, partial batch failure keeps only the failed file, claim error surfaces). The
existing `purgeWorkerDocumentFiles` tests (6) still pass.

## 3. F3: legacy FastAPI endpoints [SEC-4]

**Exposure check:** not deployed (`render.yaml` is web-only), no web or mobile code calls it, it starts only with
`docker compose --profile legacy-backend`, and it defaults to its own SQLite file. The repository's `.env` files have no
`DATABASE_URL` (key names checked, values not read). The missing authentication was proven in-process: `GET
/api/v1/profiles` with no credentials returned 200 with a name and phone number.

**Fix:**
- `backend/app/api/dependencies/auth.py`: every data route requires `Authorization: Bearer <ADMIN_API_TOKEN>`,
  compared in constant time (SHA-256 digests with `hmac.compare_digest`). If the token is unset or under 32 characters,
  the routes are **disabled** (503, fail closed). A missing or wrong token gets 401. `/api/v1/health` stays public.
  The routes list everyone's data, so the only role allowed is operator; there are no per-user routes to scope.
- `config.py`: `debug` defaults to false; the placeholder `secret_key` default is removed.
- `compose.yaml`: port 8000 published on `127.0.0.1` only; `APP_DEBUG` defaults to false; `ADMIN_API_TOKEN` passed
  through. `.env.example` and `.env.sample` updated.

**Verification:** the same request now returns **503** with no data. pytest: **24/24** (4 existing updated to send the
operator token, 20 new: disabled without a token, short token, no credentials, five kinds of wrong credentials, operator
success, health public, debug off). Ruff: 77 issues before and after, all pre-existing; the new files are clean.
`pip-audit`: no known vulnerabilities.

**Recommendation:** delete `backend/` (already pending your decision in `STATE.md`).

## 4. F4: "as soon as possible" bookings [SEC-3]

**Decision:** obsolete as a customer option. Commit `19fbafe` states "customers always pick a day and time" because
washers work fixed hours. The online-washer dispatch path is kept, so the option can return without code changes.

**Fix:**
- `supabase/migrations/2026_11_21_sec3_immediate_bookings_gate.sql`: `platform_settings.immediate_bookings_open`
  (default false), enforced by a `BEFORE INSERT` trigger on `service_bookings`. Only SQL can turn it on (no RPC), like
  document uploads.
- `mobile/app/book.tsx`: the "As soon as possible" choice and the copy suggesting it are removed, matching the web.
  The shared step message is now "Choose a day and time."
- The 7 pgTAP files and 2 smoke scripts that book immediately turn the switch on in their setup.

**Verification:** the real attack (`create_service_booking` with `p_is_immediate: true` as customer A) now returns
400 "Booking as soon as possible is not available. Choose a day and time." pgTAP `j19_sec3`: 6/6 (off by default,
refused, scheduled still works, customer cannot turn it on, works when turned on, stored as immediate). Mobile Jest
35/35, mobile `tsc` clean.

## 5. Tests run (all on the audit copy)

| Suite | Result |
| --- | --- |
| Database, **fresh stack** `washlink-verify-local-test` (all migrations applied from scratch; nothing reset) | 137 files, 3,904 tests. **2 failures, both pre-existing and identical on `main` before any change**: `j18` test 1 (`j18_customer_books_with_server_quote`) and `j19_b2c6_dispatch_rounds_and_distance`. New `j19_sec2` 19/19, `j19_sec3` 6/6; migration replay `001` passes. **Both fixed afterwards (2026-11-20): 137 files, 3,913 tests, all pass.** They were not time dependent: `j18` hard-coded exactly 114 migrations (now "at least 114"; `001` pins the exact list), and the dispatch test predates the 2026-11-12 rule that a live offer holds a washer, so its back-to-back "now" bookings found no free washer (it now lets the earlier offers lapse first) and its offer-length check reads the configured TTL instead of assuming 180 seconds |
| Web: `tsc -b`, `eslint .`, Vitest, `vite build` | Clean, clean, **595/595** (178 files), built |
| Mobile: `tsc --noEmit`, Jest | Clean, **35/35** |
| Backend: pytest, ruff, pip-audit | **24/24**, no new issues (77 pre-existing), no vulnerabilities |
| `npm audit` | Web shipped packages 0; 7 moderate in lint tooling; mobile 4 moderate in Expo build tooling (unchanged) |
| Browser (Playwright, web on the fixed stack) | 26/26 desktop and phone |
| Attack re-run | Section 6 |

Not run: the API smoke scripts (`b2c-api-smoke`, `b2c7-api-smoke`). They were updated for SEC-3 and syntax-checked,
but they expect the standard project name and a freshly reset stack.

## 6. Preserved controls: attack re-run after the changes

| Attack set | Before | After |
| --- | --- | --- |
| Anonymous (`01-anon`) | Catalog only, 0 writes, 2 harmless functions | Same |
| RLS, 58 tables × 5 accounts (`02-rls`) | 0 cross-user rows (4 by-design washer offers), 0 of 9 updates | Same |
| IDOR, every function with victim ids (`03-idor`) | 471 calls, 0 leaks | 471 calls, 0 leaks, **no call newly succeeds** |
| Escalation, verification, booking integrity, tokens (`04`) | 1 worked (ASAP) | **27 blocked, 0 worked** |
| Chat, Realtime, storage, offers (`05`, `05b`) | 20 blocked; owners receive their data | 20 blocked; owners receive their data |
| Owner-column tampering, spam cap, stored markup (`07`) | 6 blocked; markup stored but never rendered | Same |

Evidence: `audit/evidence/*-after-fix.json`, `06c`/`06d`/`06e`. Message text is still only rendered as text (no
`dangerouslySetInnerHTML`, `innerHTML` or WebView anywhere).

## 7. Production

**F1 is closed on the live project.** Applied on 2026-11-20, with your approval, in the Supabase SQL Editor:
`2026_11_20_ssr_slots_within_service_range.sql` (B2C-8), `2026_11_21_sec2_washer_location_privacy.sql` and
`2026_11_21_sec3_immediate_bookings_gate.sql`, in that order, each as one transaction. The editor text was checked
against each file (SHA-256, ignoring whitespace) before every run.

- **Pre-check (read-only):** none of the new tables, columns, functions or triggers existed, and the two replaced
  functions matched the `2026_11_06_b2cc` definitions byte for byte (md5 of the function body). So
  `docs/security/SEC2_SEC3_LIVE_ROLLBACK.sql` restores the exact previous state. It was tested on the audit stack:
  rolled back to the same fingerprints as live, then re-applied cleanly.
- **Post-check (read-only):** the same as the audit stack. The one washer with a base has a private centre (offset and
  margin within bounds); RLS is on the new tables and signed-in users have no grants on them and cannot run the helper
  functions; the cap is 20; "as soon as possible" is off and its trigger is in place; the slot lookup counts checks and
  is still callable by signed-in users only.
- **Customer test** as the live customer account, inside a block that raises at the end so everything is rolled back:
  37 open times over the next 7 days near the washer, none 573 km away, and the 21st different place refused with the
  cap message. Afterwards 0 location checks were stored. (A first "far" point turned out to be 11 km from the washer,
  inside their 15 km range, so it rightly showed times; the test was repeated with the 573 km point.)

**If the live database ever needs to go back:** close bookings in the admin first (the rollback restores the leak),
then run `docs/security/SEC2_SEC3_LIVE_ROLLBACK.sql` in the SQL Editor.

**Remaining manual steps:**

1. **Database migrations:** done (above).
2. **Code:** the fixes and these reports are on `main`, without the audit-only commits (`8b2d6d4`, `d184536`,
   `f8555ce`) or the `audit/` folder. The push redeploys the website (the web change is only the shared step message).
3. **Mobile app:** rebuild to ship the removal of "As soon as possible". Older builds that choose it get the server's
   "Choose a day and time" refusal.
4. **Document purge:** in GitHub, set the secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` and the variable
   `PURGE_WORKER_DOCUMENTS_ENABLED=true`, then run the workflow once by hand. Its first run removes the existing
   backlog.
5. **Legacy backend:** nothing to deploy. If it is ever run, set `ADMIN_API_TOKEN` (32+ random characters).
6. **Optional:** `update public.platform_settings set immediate_bookings_open = true;` only if "as soon as possible"
   should return.

## 8. Remaining risks and recommendations

- F1 residuals in section 1 (the fix is live since 2026-11-20).
- **Live security headers are missing (checked 2026-11-20).** The live site sends only `Strict-Transport-Security` and
  `X-Content-Type-Options`; there is no `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy` or
  `Permissions-Policy`, so other sites can frame WashLink (clickjacking) and a script injection would not be contained.
  `render.yaml` defines all of them, but the live service does not use it. **Proven safe to add:** the live site was
  loaded with exactly the `render.yaml` headers injected (Playwright, desktop and phone, signed-out pages: landing,
  sign-in, create account with the home map, an address search answered locally): 0 policy violations, 0 page errors,
  fonts, map tiles, address search and Supabase all working. A positive control (an injected inline script and an image
  from an unlisted host) was refused, so the policy was really enforced. Signed-in pages were not walked; they use only
  the same hosts (`*.supabase.co` for data, Realtime and photos), which the policy allows. Add them in Render →
  washlink → Settings → Headers (values in `render.yaml`), or connect the service to `render.yaml` as a Blueprint.
- I3 (HTTP 500 instead of 4xx): **left as is, by decision.** SQLSTATE `55000` ("wrong state") is used for about 18
  refusals across 8 migrations, and PostgREST maps the whole `55` class to HTTP 500, not only
  `decline_dispatch_request`. Changing it means redefining all of those functions and another live migration, to change
  a status code; the messages are generic and reveal nothing. If it is ever done, use PostgREST's `PT4xx` codes.
- I2 (PostgREST hints) and I4 (dev defaults) are unchanged; low value, no data exposure.
- Not verified: Auth settings on the live project (email confirmation, rate limits; the dashboard session had expired),
  edge functions running on Deno, the mobile app on a device, Realtime presence beyond the booking chat, and B2B
  workforce objects in the IDOR sweep.
- Moderate advisories remain in lint and Expo build tooling; updating Expo needs an Expo upgrade.

## Files changed on `security/remediation`

- Database: `supabase/migrations/2026_11_21_sec2_washer_location_privacy.sql`,
  `supabase/migrations/2026_11_21_sec3_immediate_bookings_gate.sql`; tests `j19_sec2_…`, `j19_sec3_…` (new),
  `001_migration_replay`, `j17_database_constraints_…`, `j19_b2c6_{account_deletion_reauth, closed_bookings_and_sweep,
  dispatch_rounds_and_distance, price_audit_and_commission, schedule_window_and_overdue_cancel, write_limits}`,
  `j19_b2c_booking_engine`.
- Purge job: `supabase/functions/purge-worker-documents/drainWorkerDocumentQueue.ts`,
  `scripts/jobs/purge-worker-documents.mjs`, `.github/workflows/purge-worker-documents.yml`,
  `frontend/src/features/b2c/drainWorkerDocumentQueue.test.ts` (new).
- Backend: `backend/app/api/dependencies/auth.py`, `backend/tests/conftest.py`, `backend/tests/test_auth.py` (new);
  `backend/app/api/api_v1/api.py`, `backend/app/core/config.py`, `backend/tests/test_routes.py`,
  `backend/tests/test_bookings.py`, `backend/.env.example`, `backend/.env.sample`, `compose.yaml`.
- Apps and shared: `mobile/app/book.tsx`, `mobile/src/__tests__/mobileLogic.test.ts`,
  `packages/shared/src/bookingDraft.ts`.
- Smokes: `scripts/supabase-test/{b2c-api-smoke, b2c7-api-smoke, smoke-worker-documents}.mjs`.
- Reports: `docs/SECURITY_AUDIT_REPORT.md`, `docs/SECURITY_REMEDIATION_REPORT.md`.
