# W12 - Notification wiring for all events and scheduling - VERDICT

**Overall: PASS** (independent verifier, 2026-10-30; uncommitted tree on `feature/workforce`, HEAD 8c84bf8, after fix cycle 1)

Graded against PLAN.md section 8 (AC1..AC12), the section-6 test names and REVIEW.md (no BLOCKING findings; fix cycle 1 applied N2-N4, N6-N9,
S1, C1, C3-C5; C2 routed to W13). LOG.md, TEST_RESULTS.md and REVIEW.md were read only to see what was claimed. Every number below comes
from the verifier's own re-run. Note: LOG.md is 449 lines (> 350); it is a log, not a deliverable, so it is noted, not failed.

## Check suite (re-run by the verifier; at the start Docker was up and 0 supabase containers were running)

| Check | Exit | Actual output |
|---|---|---|
| `cd frontend && npm run lint` | 0 | `eslint .`, no problems |
| `cd frontend && npm run build` | 0 | `tsc -b && vite build`, `built in 641ms` |
| `cd frontend && npm test` (also run as `vitest run --reporter=verbose`) | 0 | `Test Files 137 passed (137)`, `Tests 282 passed (282)` (263 existing + 19 W12: 10 section-6 names + 1 extra build test + 8 fix-cycle); the only existing `*.test.*` files in `git diff --name-only 8c84bf8` are `stage-local-workdir.test.mjs` and `001_migration_replay.test.sql` (both planned); no frontend test file modified |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | `4 passed, 1 warning` |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` (from a stopped stack; `db reset` recreated the DB and replayed) | 0 | 92 `Applying migration` lines (90 repo + 2 local-test baseline; w12a..e = 20261030000001..05 in a..e order); 8 helper seeds incl. `test_helpers_scheduling.sql`; `All tests successful.` `Files=99, Tests=3051`, `Result: PASS`; 99/99 files `ok`, 0 `not ok`; WARNINGs only `j17_w12_notification_registry:140/148` (intended skips) and `j17_w3_notifications:238` (pre-existing `test.safe`) |
| w2 / w3 / w4 / w5 / w6 / w7 / w8 / w9 / w10 / w11 / w14 smokes (same stack, in order) | 0 each | 48 / 33 / 43 / 39 / 40 / 38 / 30 / 34 / 39 / 36 / 33 passed, 0 failed each |
| `w12-api-smoke.mjs` (same stack, after w14) | 0 | `22 passed, 0 failed` (incl. `no_smoke12_users_left`) |
| `npx supabase stop --workdir . --no-backup` (run inside `.local-supabase-test`) | 0 | "Stopped supabase local development setup." (`washlink-local-test`, backup false); 0 supabase containers and 0 supabase volumes after |

Plans of the new pgTAP files: registry 31, dedup 21, privacy 12, j13 scheduled jobs 31, j16 locking 18, j16 fix1 liveness 20,
j17 authorization 25, j18 flows 16 (sum 174); `001_migration_replay` 26 (was 25). 2876 + 174 + 1 = 3051. 91 + 8 = 99 files.
`todo_start(` is 0 in all 99 files.

## Verifier-run local checks (local DB container `supabase_db_washlink-local-test`, `docker exec psql -U postgres`, each inside `begin; ... rollback;`)
- **Register / unregister scripts** (both contain no COMMIT): `current_user = postgres`, pg_cron before 0; register -> 3 jobs
  (`washlink_workforce_certification_expiry_notices` `17 * * * *`, `..._worker_contract_expiry` `*/10 * * * *`, `..._owner_relationship_refresh`
  `5-59/10 * * * *`, each `select public.run_workforce_scheduled_job(<key>)`); `jobs_in_tx=3`; second register `jobs_after_rerun=3`;
  unregister printed `Unregistered ... (jobid 1/3/2)`, `jobs_after_unregister=0`; after ROLLBACK `pg_cron_after_rollback=0`, `cron.job` absent.
- **Repeated scheduler runs**: fixture (1 active contract backdated past its end, 1 certificate due, 1 expired; `vfy12-*` users). Run 1:
  contracts `processed 1`, notices `processed 2`; notifications 7 -> 11 (`Contract expired` x2 = one per party, `certification.expiring` 1,
  `certification.expired` 1). Run 2 (job flag cleared as D13): both `processed 0`; notifications stay 11. After ROLLBACK 0 `vfy12-%` users.

## Acceptance criteria

All section-6 pgTAP names were checked by `grep -F` in their planned files: 11/11 registry, 11/11 dedup, 12/12 j13, 5/5 j16 locking,
7/7 j17 authorization, 4/4 j18, 2/2 replay; privacy 4/5 (see AC5). All 10 section-6 Vitest names pass in the verbose run.

| AC | Result | Evidence |
|---|---|---|
| AC1 | PASS | 5 files `2026_10_30_w12[a-e]_<snake>.sql`; `grep -L -- "-- ROLLBACK"` returns nothing (ROLLBACK line / length: a 101/103, b 219/225, c 150/154, d 186/190, e 206/212); `git diff --name-status 8c84bf8 -- supabase/migrations` is empty; all 5 untracked (0 tracked w12 files) |
| AC2 | PASS | 92 migrations replayed, `Result: PASS`; `001_migration_replay.test.sql` (plan 26, `ok`) contains `replay_schema_migrations_has_baseline_w2_to_w14_and_w12` (old name 0 occurrences) and `replay_w12_registry_and_job_state_rls_enabled`; 0 `todo_start(` in all files |
| AC3 | PASS | all 11 names in `j17_w12_notification_registry` (`ok`, plan 31); `external_delivery` CHECK `= never` (w12b:43); Vitest `w12_every_registered_category_has_an_area` passes; smoke `every_delivered_category_is_registered` ok |
| AC4 | PASS | all 11 names in `j17_w12_notification_dedup` (`ok`, plan 21), incl. `w12_repeated_runs_create_nothing_new`; the w12 smoke has NO "second run nothing" check (see observations), so the verifier ran it locally: second runs `processed 0`, notifications 11 -> 11 |
| AC5 | PASS (name deviation noted) | `j17_w12_notification_privacy` `ok` (plan 12): `w12_no_notification_contains_marker`, `w12_no_notification_has_at_sign_or_phone_shape`, `w12_labels_only_from_allow_list`, `w12_recipient_reads_only_own_notifications` present; planned `w12_notification_columns_have_no_payload` is absent, replaced under C4 by `w12_notification_columns_are_the_fixed_list` (exact 10-column list, privacy:180-183) + `w12_notification_columns_have_no_json_or_binary_type` (privacy:184-185), same assertion intent; marker sweep covers scheduler-written notices (`w12_privacy_fixture_scheduled_jobs_wrote_notices`, `w12_privacy_fixture_covers_categories`); smoke `application_creates_exactly_one_owner_notice_without_free_text` ok; Vitest `w12_repository_selects_no_subject_or_key_columns` passes |
| AC6 | PASS | all 12 names in `j13_w12_scheduled_jobs` (`ok`, 31) and 5 in `j16_w12_scheduler_locking` (`ok`, 18); fix-cycle `j16_w12_fix1_scheduler_liveness` `ok` (20); w12d: no date parameter, pair try-lock before `FOR UPDATE SKIP LOCKED` (w12d:73-78), per-item subtransaction, 22023 bounds (w12d:57-58, 132-133) |
| AC7 | PASS | `j17_w12_no_migration_creates_extension_or_cron_job` in an `ok` file; `grep -rniE "pg_cron or cron.schedule" supabase/migrations` (the AC pattern) empty, exit 1; no `create extension` in w12 migrations; both script heads line 1 `-- HUMAN-RUN ONLY, after human approval. NOT a migration`; register-rollback verified by the verifier (3 jobs inside, 0 and no pg_cron after); smoke `rolled_back_run_left_no_job_state_and_no_pg_cron` ok |
| AC8 | PASS | all 7 names in `j17_w12_scheduler_authorization` (`ok`, 25); w12 smoke 22 passed / 0 failed (incl. `direct_writes_and_selects_denied_*` x2, `runner_batches_raw_jobs_and_set_config_not_callable`, `admin_scheduled_jobs_3_rows_for_super_admin_only`, `notification_tables_not_in_realtime`); w2..w11, w14 smokes 0 failed; only grant is `admin_workforce_scheduled_jobs()` to `authenticated` (w12e:175) |
| AC9 | PASS | `w12_expired_contract_stops_counting` (j13, `ok`), `w12_worker_terminate_and_decline_succeed_after_runs` (j16 locking, `ok`); every pre-W12 `j13_*`..`j16_*` file `ok` |
| AC10 | PASS | all 4 names in `j18_w12_flows` (`ok`, 16), incl. `j18_w12_booking_quote_rating_and_verification_unchanged`; the AC10 `create or replace function public.(enqueue_notification ...)` grep over the w12 files is empty (exit 1); `git diff --stat 8c84bf8 -- supabase/tests/database` = only `001_migration_replay.test.sql` (10+, 5-); pytest 4 passed; stager 19 pass |
| AC11 | PASS | all 10 section-6 Vitest names plus the existing 263 pass (282 total); lint and build exit 0; `grep -rn "service_role" frontend/src` = 0 lines (exit 1) |
| AC12 | PASS | of the added / changed files, the longest deliverables are 350 (`PLATFORM_MODERATION_AND_AUDIT.md`, `AUDIT_AND_NOTIFICATIONS.md`), 349 (`stage-local-workdir.mjs`, `.test.mjs`, `NOTIFICATIONS_AND_SCHEDULING.md`), 344, 324, 322 (`useNotifications.ts`); only `W12/LOG.md` (449) is over 350 (log, noted); `git diff --stat 8c84bf8 -- backend frontend/smtp-test.js frontend/smtp-test.cjs` empty and nothing untracked there; `NOTIFICATIONS_AND_SCHEDULING.md:224` `## Runbook: registering the scheduled jobs (HUMAN-RUN ONLY)`; `grep -c "W12-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` = 12 (W12-L1..L8 present) |

## Safety
- No committed migration was edited: `git diff --name-status 8c84bf8 -- supabase/migrations` is empty; the 5 w12 files are untracked.
- No `.env*` change: `.env` and `frontend/.env` are git-ignored; mtimes 2026-10-23 / 2026-10-21, older than HEAD (2026-10-29 19:09);
  no `.env` path in the diff or untracked list. The verifier did not read either file.
- No remote DB commands: `--linked`, `--db-url`, `db push`, `project-ref` appear in no untracked non-doc file and in no added line under
  `scripts/` or `supabase/`. The supabase CLI ran only through the runner (`--workdir .local-supabase-test`) and from inside `.local-supabase-test`.
  The register script was run only on the local container inside a rolled-back transaction, as `postgres`.
- Unchanged on purpose (`git diff 8c84bf8` empty): TerminateContractModal.tsx, DeclineContractModal.tsx, AcceptContractModal.tsx,
  WorkerContractReview.tsx, RequestCertificationReviewModal.tsx (all 5 tracked), ApplicationSnapshotView.tsx, JobOpeningTransitionConfirmModal.tsx,
  NotificationBell.tsx, both `SuperAdminDashboardPage.tsx`, `createSuperAdminDependencies.ts`, `owner/contractTemplates/`, `worker/contracts/`,
  `owner/workerContracts/`, `contracts/`, `frontend/src/test/`, `backend/`, `frontend/smtp-test.js` and `.cjs`. No polling-interval line changed in `useNotifications.ts`.
- No copy claims email / SMS / push: the only matches in the W12 copy / components are a disclaimer comment (`notificationAreaCopy.ts:4-5`) and a
  negative test assertion; panel copy "Notifications appear here in the app only." (`notificationAreaCopy.ts:26`); no added frontend line mentions email / SMS / push.
- Booking regression: `j18_w12_booking_quote_rating_and_verification_unchanged`, `j18_existing_flows`, `j17_w2_shop_booking_guards` and every
  earlier J18 file `ok`; w2 smoke 48 / 0.
- Changed infrastructure: the stager adds `test_helpers_scheduling.sql` as the 8th helper (stager test still 19).

## Review findings
- No BLOCKING findings were raised (REVIEW.md). C2 is routed to W13 (W12-L9) because it would replace a committed W9 producer (AC10).
- Fix cycle 1 spot checks:
  - N2: the w12c guard computes `trusted` (w12c:67) and requires it on the runner-flag path (w12c:83).
  - N3: the pair try-lock comes before the row lock (w12d:73-78). `lock_timeout` is `1s` (w12e:73).
  - N4: per-item subtransactions with `when others` -> `skipped_failed` and SQLSTATE only (w12d:94-104, 158-166). Also `cursor_contract_id` with an expiry-only CHECK (w12c:43) and the CHECK on `failed_sqlstates` (w12c:44-46).
  - N6: unregister by `jobid` (unregister:17-18). Both headers say "Run both scripts as the same role (postgres)". Verified in the rolled-back run.
  - N7: `ROLE_AND_PROFILE_SECURITY.md:154` (row 52, `puballtables`) and `NOTIFICATIONS_AND_SCHEDULING.md:236-237`.
  - N8: `buildNotificationKeysetFilter` throws `invalidNotificationKeysetCursorMessage` (`SupabaseNotificationRepository.ts:37,47`). Covered by Vitest `w12_keyset_filter_validates_its_own_cursor`.
  - N9: `test_helpers_scheduling.sql:48` "LOCAL DEFAULT, local test stack only".
  - S1 / C5: privacy fixtures k7 (amendment + scheduled expiry) and c3 / c4 (scheduled certificate notices), swept after `run_workforce_scheduled_job` (privacy:102-163).
  - C4: all 12 privacy assertion names are distinct.
  - C3: `LEGAL_REVIEW_REGISTER.md:319` W12-L3 "on the first run inside the window (not a fixed 30 days before)".
  - C1: `scheduledJobCopy.ts:18,49-50` ("Enabled in WashLink", registration note, "Not run recently"). The 2-hour threshold is in `ScheduledJobService.ts:9`. Covered by 4 card tests and 3 service tests, all passing.

## Non-blocking observations (not grounds for FAIL; for RECORD)
- **Smoke narrower than PLAN section 6, unrecorded.** `w12-api-smoke.mjs` does NOT run the planned PostgREST contract send / accept / activate
  flow, the TEST-ONLY backdate + runner expiry with one notice per party, the "second run nothing" check, the certification notice run, or the
  register script inside the smoke (its header says it registers no cron job). TEST_RESULTS.md lists no deviation for this. The DB behaviour is
  covered by pgTAP (j13 / dedup / privacy) and the verifier's own rolled-back runs above; the register check was done by hand (LOG, TEST_RESULTS) and by the verifier.
- **Planned test name split, unrecorded**: `w12_notification_columns_have_no_payload` became two names under C4 (AC5).
- `j13_w12_scheduled_jobs` reuses `w12_contract_expiry_job_expires_past_end_and_notifies_each_party_once` for 3 assertions (lines 64-71).
  This is the same pattern C4 fixed in the privacy file.
- RECORD items still open in the tree:
  - D-59..D-69 are not yet in `DECISIONS.md` (count 0).
  - LOOP.md has no W12 smoke row (count 0).
  - W12-L9..L12 are in `W12/LEGAL_FLAGS.md` but not in `LEGAL_REVIEW_REGISTER.md` (count 0).
- Not verified by any test (as LOG states): row-level `SKIP LOCKED` / `NOWAIT` contention (source-order test only); a real pg_cron firing and its runtime identity (R6); the duplicate-jobid unschedule path.
- Recorded deviations accepted:
  - D1..D14 (DB) and F1..F6 (frontend).
  - Under F3 the card is wired through a new `createScheduledJobDependencies.ts` instead of a change to `createSuperAdminDependencies.ts`.
  - Four docs outside the plan list were updated for W12 carry-forwards (DASHBOARDS, PLATFORM_MODERATION, TRAINING, MARKETPLACE).
- The runner's `supabase start` printed "Starting database from backup..." (a leftover volume). `db reset` then recreated the database and replayed all 92 migrations, so the replay was clean. After stop, 0 volumes remain.
