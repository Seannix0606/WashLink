# B2C-6 - launch-safety hardening - LOG

## BUILD (web, mobile, shared) - 2026-11-06

No commit, push or branch switch. No `.env` read. No supabase, docker, run-db-tests or run-api-smokes command was run, because a DB test run was in progress. This section has no database results.

**Shared**
- `packages/shared/src/bookingStatus.ts`: `WORKER_START_WINDOW_MINUTES`, `OVERDUE_CANCEL_GRACE_MINUTES`, `canWorkerAdvanceNow`, `canCustomerCancelOverdue`. Added beyond the plan so web and mobile do not duplicate them: `workerEarlyStartNotice`, `customerOverdueCancelNotice`, `workerPausedNotice`, `distanceBandLabel`. `canCustomerCancel` is unchanged. Exported through the existing `export *`.
- `packages/shared/src/b2cApi.ts`: doc comment on `distanceKm`.

**Web**
- New: `frontend/src/features/b2c/admin/AdminCancelBookingControl.tsx`, `frontend/src/features/b2c/useCurrentTime.ts`.
- Changed: `DeleteAccountSection.tsx`, `admin/B2cOperationsPanel.tsx`, `worker/RequestCard.tsx`, `worker/AssignedJobCard.tsx`, `worker/IndependentWorkerPage.tsx`, `customer/BookingCard.tsx`.

**Mobile**
- New: `mobile/src/lib/useCurrentTime.ts`.
- Changed: `mobile/src/features/AccountScreen.tsx`, `mobile/app/worker/index.tsx`, `mobile/src/features/customer/BookingCard.tsx`.

**Tests**
- New: `frontend/src/features/b2c/pushWebhookSecret.test.ts`. The test config imports `secretsMatch.ts` from outside `frontend/` without a config change.
- Extended: `sharedPackage.b2c.test.ts`, `b2cScreens.test.tsx`, `DeleteAccountSection.test.tsx`, `mobile/src/__tests__/mobileLogic.test.ts`.
- One existing line changed: in `b2cScreens.test.tsx`, the `worker job` fixture's fixed `scheduledAt` became a time relative to now. The fixed date was outside the new start window when run on this machine's clock, so the button was correctly disabled. The assertions are unchanged.

**Docs**
- `docs/b2c/OPERATIONS.md`, `docs/b2c/ARCHITECTURE.md`, `docs/b2c/DEPLOYMENT.md`.

**Deviations from the plan**
1. The plan says mobile does not display distance. It did: `mobile/app/worker/index.tsx:59` showed `N km away`. With bands stored, that would state an upper bound as a distance, so it now shows `Within N km`.
2. `docs/b2c/DEPLOYMENT.md` did not actually state that the function has never been deployed or run, so there was nothing to keep. That statement is now in step 4.
3. `DEPLOYMENT.md` said the migrations "only add things", which is false for `b2cg` to `b2ck` because they rewrite existing B2C rows. Corrected. Also added the plan's check of the production `amr` shape.

**Client data**
- No RPC change. `my_service_bookings` already returns `duration_minutes` and `is_immediate`. `my_assigned_service_bookings` does not return `is_immediate`, so `canWorkerAdvanceNow` works from `scheduled_at` alone, which is about now for an immediate booking.

**Limits**
- A paused washer with a started job: the next-step button was enabled at this point. Disabled in fix cycle 1 after the browser check.
- The time rules read the device clock, so a wrong clock can disable or offer an action the server would rule on differently.
- `useCurrentTime` exists in both apps because `packages/shared` has no React dependency.
- `packages/shared/src/b2cApi.ts` is 458 lines. It was already 457 before this increment.
- Screens were covered by component tests only. They were not checked in a browser or on a device, because the local stack was in use.

**Results (actual)**
| Command | Exit | Result |
| --- | --- | --- |
| `cd frontend && npm run lint` | 0 | no findings |
| `cd frontend && npm run build` | 0 | built in 775ms |
| `cd frontend && npm test` | 0 | 157 files, 397 tests passed |
| `cd mobile && npx tsc --noEmit` | 0 | no errors |
| `cd mobile && npx jest` | 0 | 1 suite, 11 tests passed |

## 2026-11-06: database build, fix cycle 1 and re-run (orchestrator)

**Interruptions.** The database build stopped twice (usage limit, then session end) before writing a log. Its files were complete. Docker Desktop had also stopped and was restarted with `docker desktop start`.

**First orchestrator run on the built code.** pgTAP FAIL, 123 files, 3575 tests, one failure: `j18_customer_books_with_server_quote`. Root cause: a migration count pin of 105 that the plan had missed. Now 110. The other three conditions and the B2B flow assertions are unchanged.

**Reviews and browser check.** See `REVIEW.md`.

**Fix cycle 1.** Files: the b2ch, b2ci, b2cj and b2ck migrations, `secretsMatch.ts`, `bookingStatus.ts`, `AssignedJobCard.tsx`, `IndependentWorkerPage.tsx`, `DeleteAccountSection.tsx`, `mobile/app/worker/index.tsx`, `AccountScreen.tsx`, their tests, three j19_b2c6 test files, `docs/b2c/*` and the new `docs/b2c/LEGAL_REVIEW_REGISTER.md`. D-107 and D-108 added.

**First verifier: FAIL.** Causes are in `REVIEW.md`. Its mutation probes on H1, H2, H3 and the fix-cycle rules all made tests fail, as they should.

**Plan deviations.**
- Arrival window added beyond the plan (D-107).
- B2C legal items live in their own register (D-108).
- The j18 count pin is also modified (criterion 11 amended).
- Mobile did display distance, contrary to the plan, and now shows the band.
- The refusal message is neutral, because admins reach it too.

**Results after the repair (actual output):**

| Check | Result |
|---|---|
| Stager | exit 0 |
| `run-db-tests.mjs` | `Files=123, Tests=3580`, `Result: PASS` |
| `run-api-smokes.mjs` | `PASS (16 smokes)`, b2c 72 passed, 0 failed |
| Web lint | exit 0 |
| Web build | exit 0 |
| Web tests | 157 files, 398 tests pass |
| Mobile `tsc` | exit 0 |
| Mobile `jest` | 11 pass |
| Backend `pytest` | 4 passed, 1 warning |

The smokes ran before the last two test-file quote fixes, which touched only web test files.
