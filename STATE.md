# WASHLINK DEVELOPMENT STATE

## Current objective
Transform WashLink into a B2C mobile car wash marketplace: React web and Expo mobile on one Supabase backend, with shared TypeScript.

## Current phase
B2C-6 (launch-safety hardening) passed independent verification on `feature/b2c`, local only. Commit tag `[B2C-6]`; base `dc91724`. Record: `loop/workforce/increments/B2C-6/` (PLAN, LOG, REVIEW, VERDICT). Overall status: docs/b2c/FINAL_REPORT.md.

## Tested
- Backend, web customer, washer and admin flows against the local stack.
- B2C-6 in a browser at 375px: distance band, address reveal, suspension mid-job, admin cancel, ₱10,000 price save.
- Mobile screens in the browser preview only, before B2C-6; Android and iOS JS bundles compiled then.

## Not verified
Native builds, maps, location, secure storage on a device, push, production deploy. Also: two-session concurrency, the edge function on Deno, the production `amr` claim shape, and B2C-6's mobile screens beyond type-check and logic tests.

## Decisions
- B2C uses its own tables; B2B `bookings` is untouched.
- Repo keeps `frontend/`; adds `packages/shared` and `mobile/`.
- Dark cinematic look on the landing page only.
- Draft prices, 0% commission, cash, bookings closed until set in admin.
- B2C-6 defaults: D-90 to D-108 in `loop/workforce/DECISIONS.md`, each changeable.

## Latest test results (B2C-6 verifier, from a clean reset)
- DB: 123 files, 3580 tests pass. API smokes: 16 pass (b2c 72 checks). Stager: 19 pass.
- Frontend: lint 0, build 0, 157 files / 398 tests pass. Mobile: tsc clean, 11 tests pass. Backend: 4 pass.
- Expo Doctor not re-run since B2C-5.

## Files changed in B2C-6
Migrations `2026_11_06_b2c{g..k}`; 7 new `j19_b2c6_*` pgTAP files; `test_helpers.sql`; pins in `001_migration_replay`, `j19_b2c_account_deletion` and one j18 count; `b2c-api-smoke.mjs`; `send-service-push/secretsMatch.ts`; `packages/shared/bookingStatus.ts`; web and mobile B2C screens; `docs/b2c/*`, including the new `LEGAL_REVIEW_REGISTER.md`.

## Next action
B2C-7: washer verification documents. Today an admin verifies a washer with one click and no evidence, and that is the only gate before customer addresses are revealed. Also open from B2C-6: M3 release-loop caps, M5 slot probing, evidence before a job is marked complete (`REVIEW.md`).

## Known blockers
- Real prices, logo files, photos, map provider, production migration approval.
- Expo account and devices for a first Android build.
- Legal review: 9 open B2C items in `docs/b2c/LEGAL_REVIEW_REGISTER.md`, including what is kept after deletion.
- A contact channel and written procedure for manual account closure, before launch.
- Workforce W17 parked unverified on `feature/workforce`; W18 not started.

## Housekeeping
- The refactoring audit was interrupted before it produced a report, so no refactoring standards exist yet.
- The context file is misnamed `CALUDE.md`; there is no `CLAUDE.md`. `${to}` at the root is an empty stray file. Both are untracked and were left alone.
