# WASHLINK DEVELOPMENT STATE

## Current objective
Transform WashLink into a B2C mobile car wash marketplace: React web and Expo mobile on one Supabase backend, with shared TypeScript.

## Current phase
MSG-1 (booking messages between customer and washer) built on `feature/messaging`, local only, on top of the visual redesign
(`feature/visual-redesign`). Migration `2026_11_13_msa_booking_messages.sql` is applied to the local stack only; the live database
still needs it. Design and rules: the migration's header and `docs/site/04-design-system.md`.

Earlier: B2C-7 (washer verification documents) passed independent verification on `feature/b2c`, local only. Commit tag `[B2C-7]`; base `5a3f769`. Record: `loop/workforce/increments/B2C-7/` (PLAN, LOG, REVIEW, VERDICT). Overall status: docs/b2c/FINAL_REPORT.md.

## Tested
- Backend, web customer, washer and admin flows against the local stack.
- B2C-7 in a browser on the local stack, synthetic images only: upload, refusals, admin open and review, verify, replace, revoke with a job held, suspend, delete. Driven by script against the real controls and not repeated independently.
- Mobile worker documents in the browser preview only, through the picker's web input.

## MSG-1 tested
- pgTAP `j19_msg1_booking_messages` (43 checks): access, hand-over privacy, closing after 24 hours, photos, admin audit.
- Two signed-in browsers on the Docker dev site: live delivery, typing, online, Seen, photo, phone layout.

## MSG-1 not verified
Realtime and the private channel on hosted Supabase; the photo removal job (photos are already unreadable after 90 days, but files are
only queued); web push (not built: in-app bell and badges only, by the owner's choice).

## Not verified
Native builds, camera and photo library, permissions, HEIC, secure storage on a device, push, production deploy. The removal job's Deno wrapper, deployment and scheduling have never run. Nothing has run on hosted Supabase, including the Storage operation names the admin read and upload policies rely on. Whether a browser honours `no-store` wasn't observed. Two-session concurrency beyond the upload race smoke.

## Decisions
- B2C uses its own tables; B2B `bookings` is untouched.
- Repo keeps `frontend/`; adds `packages/shared` and `mobile/`.
- Dark cinematic look on the landing page only.
- Draft prices, 0% commission, cash, bookings closed until set in admin.
- Defaults D-90 to D-124 in `loop/workforce/DECISIONS.md`, each changeable.
- Uploads are off until a person turns them on with SQL (D-123). With them off, no washer can be verified.

## Latest test results (B2C-7 verifier, from a clean reset)
- DB: 129 files, 3782 tests pass. API smokes: 17 pass (b2c 72, b2c7 75). Stager: 19 pass.
- Frontend: lint 0, build 0, 162 files / 508 tests pass. Mobile: tsc clean, 33 tests pass, Expo Doctor 20/20. Backend: 4 pass.

## Files changed in B2C-7
Migrations `2026_11_06_b2c{l,m,n}`; new `j19_b2c7_*` pgTAP files; `supabase/functions/purge-worker-documents/`; `b2c7-api-smoke.mjs` and its helpers; `packages/shared` (`workerDocuments.ts`, `b2cTypes.ts`, `b2cRequest.ts`); web and mobile washer and admin screens; `mobile/package.json` (expo-image-picker); `docs/b2c/*`, including 17 new legal items.

## Next action
Owner's choice. Open engineering work: M3 release-loop caps, M5 slot probing, evidence before a job is marked complete, and the flaky B2B test below.

## Known blockers
Before real IDs are collected:
- Deploy and schedule the removal job, repeat the Storage route attacks on staging, then turn uploads on.
- Legal review: open items in `docs/b2c/LEGAL_REVIEW_REGISTER.md`, a privacy notice, controller details and consent.
- A contact channel and written procedure for manual account closure and appeals.

Also: real prices, logo files, photos, map provider, production migration approval, an Expo account and devices. Workforce W17 parked unverified on `feature/workforce`; W18 not started.

## Known issues
- Existing: booking notifications whose reference has 7 or more digits in a row (e.g. WL-81904306) are silently skipped, because
  `notification_text_is_safe` treats the run as a phone number. About 1 booking in 20. MSG-1 message notifications avoid it by
  naming the service; the booking status notifications still need a fix.
`j2_job_opening_lifecycle` test 46 fails rarely by chance: it searches audit payloads for `4321`, and each payload holds a random `shop_id`.

## Housekeeping
- The refactoring audit was interrupted before it produced a report, so no refactoring standards exist yet.
- The context file is misnamed `CALUDE.md`; there is no `CLAUDE.md`. `${to}` at the root is an empty stray file. Both are untracked and were left alone.
