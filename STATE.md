# WASHLINK DEVELOPMENT STATE

## Current objective
Transform WashLink into a B2C mobile car wash marketplace: React web and Expo mobile on one Supabase backend, with shared TypeScript.

## Current phase
Phases 0-7 implemented on `feature/b2c`, local only. Full status: docs/b2c/FINAL_REPORT.md.

## Tested
- Backend, web customer, washer and admin flows against the local stack.
- Mobile screens in the browser preview only; Android and iOS JS bundles compile.

## Not verified
Native builds, maps, location, secure storage on a device, push, production deploy.

## Decisions
- B2C uses its own tables; B2B `bookings` is untouched.
- Repo keeps `frontend/`; adds `packages/shared` and `mobile/`.
- Dark cinematic look on the landing page only.
- Draft prices, 0% commission, cash, bookings closed until set in admin.

## Latest test results
- DB: 116 files, 3482 tests pass. API smokes: 16 pass (b2c 57 checks).
- Frontend: lint 0, 156 files / 356 tests pass. Mobile: tsc clean, 5 tests pass, Expo Doctor 20/20.

## Next action
Needs the owner: an Expo account and devices for a first Android build, then fix what real devices show.

## Known blockers
- Real prices, logo files, photos, map provider, production migration approval.
- Legal review of what is kept after account deletion.
- Workforce W17 parked unverified on `feature/workforce`; W18 not started.
