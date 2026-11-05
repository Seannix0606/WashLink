# B2C-6 verification verdict

**Verdict: PASS, with one documentation inaccuracy (N1) and other non-blocking items listed below.**

Earlier verifier: FAIL, because four pgTAP lines had `$$` collapsed to `$` and one web test expected old copy. Both are gone (see "The two earlier failures").

Verified by an independent agent that did not see the build. Base `dc91724`, uncommitted, branch `feature/b2c`. Local stack only. Nothing was committed or pushed. No repo file other than this one changed: the status list and a content hash of the diff and untracked files were identical before and after all checks.

## Check output (actual, run in this order)

| Command | Exit | Result |
|---|---|---|
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | 19 pass, 0 fail |
| `node scripts/supabase-test/run-db-tests.mjs` (includes `db reset --local`) | 0 | `Files=123, Tests=3580`, `All tests successful.`, `Result: PASS` |
| `node scripts/supabase-test/run-api-smokes.mjs` | 0 | `run-api-smokes: PASS (16 smokes)`. Each 0 failed: w2 48, w3 33, w4 43, w5 39, w6 40, w7 38, w8 30, w9 34, w10 39, w11 36, w14 33, w12 22, w15 17, w16 17, b2c 72, w13 17 |
| `cd frontend && npm run lint` | 0 | No findings |
| `cd frontend && npm run build` | 0 | Built |
| `cd frontend && npm test` | 0 | 157 files, 398 tests passed |
| `cd mobile && npx tsc --noEmit` | 0 | No errors |
| `cd mobile && npx jest` and `npm test` | 0 | 1 suite, 11 passed (both) |
| `cd backend && .venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |

## Acceptance criteria (PLAN section 9)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Migrations replay; DB tests pass with named assertions | PASS | `Result: PASS`, 123 files (floor 123), 3580 tests (baseline 3482). Names: see below |
| 2 | Real flow through GoTrue and PostgREST | PASS | `PASS (16 smokes)`, `b2c-api-smoke: 72 passed, 0 failed`. All 11 new check names are in the source. The runner prints counts, not names |
| 3 | Stager unchanged | PASS | 19 pass; no diff on the stager test |
| 4 | Web | PASS | Lint, build and test all exit 0; 398 tests (floor above 356) |
| 5 | Mobile | PASS | `npm test` exit 0; 11 tests (floor above 5) |
| 6 | Backend regression | PASS | 4 passed |
| 7 | No committed migration edited | PASS | `git diff --diff-filter=MD --name-only dc91724 -- supabase/migrations` is empty |
| 8 | File size | PASS | b2cg 153, b2ch 276, b2ci 301, b2cj 138, b2ck 97 |
| 9 | Rollback present | PASS | `grep -L ROLLBACK` is empty. Every source function named in the rollback blocks that I checked exists in the named file |
| 10 | Function list unchanged | PASS | `git diff --quiet` on the j17 list exits 0; the file is ok in the run |
| 11 | No test removed; only pinned files modified | PASS | `--diff-filter=D` is empty. `--diff-filter=M -- supabase/tests` lists exactly `001_migration_replay`, the j18 pin and `j19_b2c_account_deletion` |
| 12 | B2B untouched | PASS | The only `public.bookings` match is `b2ck:50`, the `exists` read. No unqualified `bookings` table reference |
| 13 | Audit rule unchanged | PASS | `audit_rule_still_rejects_large_number` ok; criterion 7 holds |
| 14 | No `.env` read, no linked project | PASS for the diff | No `--linked`, `--db-url`, `db push` or `supabase link` in the diff or new files. No `.env` file changed or read by me. The new smoke fixture targets a container named from the asserted `*-local-test` project id (`b2c-api-smoke.mjs:29-30`) and accepts only validated uuids. Whether a build agent read `.env`: NOT-VERIFIABLE |

## The two earlier failures

- **Dollar-quote lines:** all four are back to `$$`: `j19_b2c6_dispatch_rounds_and_distance.test.sql:109`, `j19_b2c6_schedule_window_and_overdue_cancel.test.sql:50`, `j19_b2c6_write_limits.test.sql:52-53`. A scan of the j19 files for lone-dollar quoting finds none. Every `j19_b2c6` file runs its full plan.
- **Web test:** `DeleteAccountSection.test.tsx:71` now expects `Only WashLink can close these accounts.`, matching `DeleteAccountSection.tsx:46`. The title on line 69 is stale (L1).

## Named assertions

I ran the 7 `j19_b2c6` files and `j19_b2c_account_deletion` through `psql` in the local DB container, each in its own rolled-back transaction, and collected per-assertion TAP. That gives names, which the suite summary does not.

| File | ok | not ok | Plan |
|---|---|---|---|
| `j19_b2c6_account_deletion_reauth` | 15 | 0 | 15 |
| `j19_b2c6_closed_bookings_and_sweep` | 15 | 0 | 15 |
| `j19_b2c6_dispatch_rounds_and_distance` | 15 | 0 | 15 (at the 180-second default; see below) |
| `j19_b2c6_price_audit_and_commission` | 9 | 0 | 9 |
| `j19_b2c6_schedule_window_and_overdue_cancel` | 11 | 0 | 11 |
| `j19_b2c6_suspended_worker` | 19 | 0 | 19 |
| `j19_b2c6_write_limits` | 14 | 0 | 14 |
| `j19_b2c_account_deletion` | 11 | 0 | 11 |

All 96 required names pass: 91 from PLAN section 8, plus `arrival_refused_before_arrival_window`, `arrival_allowed_in_arrival_window`, `arrival_window_default_is_30`, `base_change_allowed_while_offers_hidden_by_closed_bookings` and `cap_count_not_revealed_to_other_customer`.

**One thing I saw on the way.** My first standalone run was after the smokes and gave `not ok immediate_offer_uses_request_ttl` (have +300 seconds, want +180). The b2c smoke leaves `request_ttl_seconds` at 300 (`b2c-api-smoke.mjs:392`, same behaviour at `dc91724`). The product code is right: the file passes in the full run from reset, and passes 15 of 15 when I set the value back to 180 inside the transaction. See L2.

## Mutation probes

Each changed one function with `create or replace` inside a transaction, ran the test file in that transaction, then rolled back. Definitions hashed the same before and after (`b0c6a87e2944c615d6c38d9464485bbb`), `auth.users` held 0 rows both times, and no repo file was touched. A negative control with a pattern that matches nothing raised `MUTATION_NOT_APPLIED`.

| Fix | Mutation | Tests that failed |
|---|---|---|
| H1 | Remove the password check in `delete_my_account` | `delete_refused_without_amr` (then the file aborted, the user being already deleted) |
| H2 | Remove the block in `advance_service_booking` | `suspended_worker_cannot_advance`, `rejected_worker_cannot_advance`, `pending_worker_cannot_advance` |
| H3 | Remove the `public.bookings` check | `delete_refused_with_b2b_booking`, `delete_refused_with_cancelled_b2b_booking`, `b2b_booking_untouched_after_refusal` |

## Other confirmations

- **Nothing deleted, weakened or renamed.**
  - Set difference against `dc91724`: no smoke `check(` name removed (11 added), no assertion name removed from `j19_b2c_account_deletion`, no `it`, `test` or `describe` title removed from the 4 modified client test files.
  - Changed expectations are stricter or match an intended change: the 2 deletion refusals now pin the exact message instead of `null`, the 2 smoke refusals require code 55000, the replay pin gains 5 versions, j18 goes from 105 to 110, `anonymous record` becomes `keeps a record`, and one fixture time is now relative to now.
  - `test_helpers.sql` only adds lines.
- **B2B:** all 123 files ok, including every j17 and j18 file, and all w-smokes 0 failed. `docs/workforce` has no diff.
- **Reviewer BLOCKING findings closed:** B1 and B2 confirmed in code. No `must keep` anywhere checked, and `anonymous` remains only in `OPERATIONS.md:96`, saying the records are not. See `DeleteAccountSection.tsx:42-46`, `AccountScreen.tsx:45-49`, `b2ck:51`.
- **REVIEW.md status claims that match the code:**
  - Fixed: N2 `for no key update` (`b2ch:186`, `b2ci:275`), N3 (`b2cj:51`), N5 (`b2ci:279`), N6 (`AccountScreen.tsx:24`, cascade at `b2cb:166`), N7 (`PLAN.md:299`), S2 (`secretsMatch.ts`), arrival window (`b2ci:106-109`), paused button disabled on web and mobile.
  - Honestly open: `completed` with no evidence of work (`b2ci:97-110` has no such check), S1 (`config.toml:230` still false; `DEPLOYMENT.md:13` says untested), N4 radius probing, hard-coded `2 hours` and `30 minutes` (`b2ci:103,108`), and `Contact WashLink` with no channel (`b2ci:92`, `bookingStatus.ts:113`).
- **FINAL_REPORT.md vs OPERATIONS.md:** the earlier contradictions are gone. Line 24 now notes the kept account ID, lines 61 and 92 say 11 migrations and describe the row changes, and lines 115-117 match the counts I measured. Its "five roll-up tests" claim at line 63 matches the diff against the parent of `733d186`. No false deployment claim found: no remote branch contains `dc91724`. The state of the production project cannot be checked from here.

## Findings

### MEDIUM, non-blocking

**N1. `docs/b2c/OPERATIONS.md:95` is wrong for a deleting washer.** So the docs check is not fully met.

Line 92 covers `Customers and washers`, and line 95 says `Location, vehicle make, model and year, notes and review text are cleared.` The redaction only applies `where customer_id = caller` (`b2ck:63-66`, `:76`). When a washer deletes, the bookings they worked keep the address, vehicle and notes of the customer, and review text that customers wrote about that washer stays. Keeping the address and vehicle is reasonable, since they belong to a customer who still has an account. But review text can name the washer, and neither this doc nor `LEGAL_REVIEW_REGISTER.md` says so. I found this by reading the code; no test covers it either way. The in-app copy is not false, because it says `your` name, location and vehicle details. Fix before commit: state the customer and washer cases separately, and add the review text to B2C6-L4.

### LOW

- **L1.** `DeleteAccountSection.test.tsx:69`: the title says `how to close the account instead`, but the copy gives no way to do that.
- **L2.** `j19_b2c6_dispatch_rounds_and_distance.test.sql:82` hard-codes 180 seconds instead of reading the setting, so the file fails standalone after the smokes. The runner always resets first, so the suite is unaffected.
- **L3.** The kept-data lists are incomplete, though nothing in them is false. `DeleteAccountSection.tsx:42-43`, `AccountScreen.tsx:45-46` and `OPERATIONS.md:95` omit the reference, service and add-on names, and earnings figures. B2C6-L4 lists only the reference.
- **L4.** `FINAL_REPORT.md`:
  - Line 32 lists admin price editing as not clicked through, while `REVIEW.md:48` says an add-on price was saved in a browser.
  - Line 68 leaves out `LEGAL_REVIEW_REGISTER.md`.
  - Line 122 reports Expo Doctor under `Latest run on this code`, but it is not in the B2C-6 log and I did not re-run it. `mobile/package.json` has no diff in this increment.
- **L5.** `REVIEW.md:33` says the hard-coded-message limit is documented beside the constants. `bookingStatus.ts` comments mention a client release, but not the message text or the server messages.

### Earlier low findings

| Earlier | Status |
|---|---|
| F3 record incomplete | Closed. `LOG.md` and `REVIEW.md` now exist with reviews and the fix cycle |
| F4 FINAL_REPORT contradictions | Closed |
| F5 base-lock exception | Doc closed (`OPERATIONS.md:22`). **Left open:** D-97 in `DECISIONS.md` and D-102 still do not record the exception that `b2ci:279` implements |
| F6 plan deviations | Mostly closed, recorded in `LOG.md:63-68`, `REVIEW.md:18`, D-107. **Left open:** `PLAN.md:62,81,173,198,315` and section 4 are not amended, and PLAN has no mention of D-107. The `unregisterPush` removal has no test |
| F7 refusal untrue for admins | Closed. `b2ck:51` is neutral and the tests pin it |
| F8 30-minute default unpinned | DB closed (`arrival_window_default_is_30`, `schedule_window:39`). **Left open:** no test names `WORKER_ARRIVAL_WINDOW_MINUTES`, though `sharedPackage.b2c.test.ts:117` and `mobileLogic.test.ts:86` test the boundary by behaviour |
| F9 stray root files | **Open, still present:** the empty file named as a literal unexpanded `to` shell variable, `CALUDE.md`, `.claude/launch.json`. None is ignored, so stage files by name and keep these out of the `[B2C-6]` commit |
| `secure_password_change` observation | Closed as a doc issue: `DEPLOYMENT.md:13` now hedges. The behaviour remains untested (S1) |

## Not exercised

- Real concurrency: the `for share` lock on accept, the profile lock against a new B2B booking, and the cap and token locks. I read them and the ordering holds; no two-session test was run.
- The browser checks in `REVIEW.md:41-50`: NOT-VERIFIABLE by me. I ran component tests only.
- The edge function on Deno, and real devices.
- The production `amr` shape (D-10 gate).

## Before commit

Fix N1. Keep the F9 files out of the commit. The rest can be follow-ups.
