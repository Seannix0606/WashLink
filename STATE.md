# WASHLINK DEVELOPMENT STATE

## Current objective
Transform WashLink into a B2C mobile car wash marketplace: React web and Expo mobile on one Supabase backend, with shared TypeScript.

## Current phase
Phase 4-5: Expo mobile app (`mobile/`).

## Completed and tested
- Phase 0-1: audit, `packages/shared`, B2B flag (`VITE_FEATURE_B2B`, off by default), B2C flag.
- Phase 3: migrations `2026_11_06_b2c{a..e}`, pgTAP J19, 49-check API smoke using the shared client (includes a two-worker acceptance race).
- Phase 2: landing, customer wizard and bookings, washer screens, admin operations. Checked in the browser against the local stack at 375px and desktop. Live status update seen.

## Decisions
- B2C uses its own tables; B2B `bookings` is untouched.
- Repo keeps `frontend/`; adds `packages/shared` and `mobile/`.
- Dark cinematic look on the landing page only.
- Draft prices, 0% commission, cash, bookings closed until set in admin.

## Latest test results
- DB at 733d186: 115 files, 3471 tests pass. No migrations have changed since.
- API smokes at 733d186: 15 pass. b2c smoke: 49 pass.
- Frontend: lint 0, 155 files / 352 tests pass, build passes.
- One B2B test (J9 contract editor) timed out at 5s under parallel load; passes alone. Its timeout is now 15s.

## Next action
Build `mobile/`: Expo Router, SecureStore session, customer and washer tabs, native wizard, push token registration, EAS config.

## Known blockers (need a person or a device)
- No Android SDK, adb, Java or Expo account here; iOS builds need EAS or a Mac.
- Push needs real devices and an Expo account.
- Real prices, photography, logo files, map provider and production migration approval.
- Workforce W17 is parked unverified on `feature/workforce`; W18 not started.
