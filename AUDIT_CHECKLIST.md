# WashLink Audit Checklist

## Scope
- Backend: FastAPI service with SQLAlchemy async repository layer and health/bookings routes
- Frontend: Vite + React + TypeScript UI backed by Supabase
- Database: local SQLite fallback for development/tests; Supabase migrations for production schema

## Status
- [x] Initial repository structure and project instructions reviewed
- [x] Core backend runtime issue isolated to missing settings defaults and missing SQLAlchemy async dependencies
- [x] Frontend build validated successfully
- [x] Remaining backend edge cases reviewed and fixed for the local scaffold/test path
- [x] Frontend lint issues cleared for the project
- [x] Worker profile display issue fixed to prefer the resolved worker name over the auth user fallback
- [x] Final smoke validation completed for backend API, frontend dev server, frontend lint, and production build
- [x] Product QA improved worker availability and job-loading error states
- [x] Booking flow rejects invalid or past scheduled times
- [x] Booking location map displays nearby shop pins and synchronizes map/list selection

## Findings by severity
- [x] High: missing environment defaults prevented backend startup in local/dev/test environments
- [x] High: SQLAlchemy asyncio dependency missing (`greenlet` / `sqlalchemy[asyncio]`) caused import failure
- [x] Medium: local SQLite fallback should be explicit for non-production runs
- [x] Medium: worker dashboard could display the wrong display name when the authenticated user profile differed from the worker profile
- [x] Medium: worker availability and assigned-job fetch failures were logged or presented ambiguously instead of clearly to the worker
- [x] Medium: booking scheduling accepted past or malformed timestamps
- [x] Medium: customer booking map had no shop markers, making it difficult to identify nearby car washes

## Fixes implemented
- Added safe local defaults for database URL, Redis URL, and secret key in backend settings
- Added SQLAlchemy asyncio dependency support to backend install manifest
- Added SQLite-aware booking dependency fallback to keep local scaffold/test flows functional
- Corrected the booking schema serialization to emit `status` instead of the database alias `booking_status`
- Cleaned the remaining frontend lint and TypeScript issues across booking, verification, and worker UI flows
- Updated the worker profile resolution hook to carry the worker display name and prefer it in the jobs page banner
- Added visible worker availability and assigned-job loading/error states, and availability update success/error feedback
- Added a future-time minimum to the booking date picker and validated future ISO timestamps at both the flow and service-validation boundaries
- Added the 12 closest geocoded car-wash markers (plus the selected shop when outside that set), bookability styling, tap-to-select behavior, selected-shop details, viewport fitting, map legend, and clearer touch guidance

## Verification
- [x] Backend pytest suite executed successfully: 4 passed
- [x] Frontend lint executed successfully: `npm run lint` passed
- [x] Frontend production build executed successfully with Vite
- [x] Frontend lint and production build rerun successfully after product QA fixes
- [x] Backend pytest suite rerun successfully after product QA fixes: 4 passed
- [x] Frontend lint and production build passed after map usability improvements
- [x] Backend health endpoint responds successfully at http://127.0.0.1:8000/api/v1/health
- [x] Frontend dev server serves the app successfully at http://localhost:4173

## Final state
- The repo is now working locally and validated with the checks that were blocking progress.
- The product flow audit can proceed from a clean baseline without redoing startup or lint repair work.
- The backend root route returning `{ "detail": "Not Found" }` is expected 404 behavior; valid API routes live under `/api/v1`.
- Commit `9b1563a` was pushed to `origin/main`; subsequent product QA changes remain to be committed and pushed.
