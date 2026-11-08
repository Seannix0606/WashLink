# W12 - LOG

## BUILD (DB) - 2026-10-29

Branch `feature/workforce`, base HEAD 8c84bf8. Nothing committed. Local Docker stack only (`.local-supabase-test`, project
`washlink-local-test`). No `--linked`, `--db-url` or `db push`, no `.env` read, and the supabase CLI was never run from the repo root.
No producer and no W7 / W9 / W10 function body was replaced. No migration creates an extension or registers a cron job.
Out of scope for this step: `w12-api-smoke.mjs`, the frontend and the docs.

### Files
Added 5 migrations. Each has a commented `-- ROLLBACK` block, each is <= 350 lines, and they are staged as 20261030000001..05:
- `supabase/migrations/2026_10_30_w12a_notification_wiring_preflight.sql` (103): creates nothing.
- `supabase/migrations/2026_10_30_w12b_notification_category_registry.sql` (225): `notification_categories` (37 seeded rows), its
  guard, and the `notifications_guard_registered_category` BEFORE INSERT trigger.
- `supabase/migrations/2026_10_30_w12c_workforce_scheduled_jobs.sql` (142): `workforce_scheduled_jobs` (3 seeded rows) and its guard.
- `supabase/migrations/2026_10_30_w12d_scheduled_job_batches.sql` (143): `worker_owner_pair_try_lock`, `expire_worker_contracts_batch`
  and `refresh_worker_owner_relationships_batch`.
- `supabase/migrations/2026_10_30_w12e_scheduled_job_runner_and_reads.sql` (192): `workforce_scheduled_job_pending`,
  `run_workforce_scheduled_job`, `admin_workforce_scheduled_jobs`, and the `W12:` comments.

Added HUMAN-RUN scripts. These are not migrations and the loop never runs them outside the local stack:
- `scripts/supabase-scheduling/register_workforce_jobs.sql` (23). The header says "HUMAN-RUN ONLY, after human approval". It runs
  `create extension if not exists pg_cron` and then 3 `cron.schedule` calls (UTC): `washlink_workforce_certification_expiry_notices`
  `17 * * * *`, `washlink_workforce_worker_contract_expiry` `*/10 * * * *` and `washlink_workforce_owner_relationship_refresh`
  `5-59/10 * * * *`.
- `scripts/supabase-scheduling/unregister_workforce_jobs.sql` (19): runs `cron.unschedule` on every `washlink_workforce_%` job. It
  does nothing when pg_cron is absent.

Added the 8th helper, `scripts/supabase-test/baseline/test_helpers_scheduling.sql` (78):
- `backdate_test_worker_contract(p_contract uuid, p_days integer)`: TEST-ONLY time shift.
- `hold_lock_in_second_session(p_key bigint) returns boolean`: TEST-ONLY dblink.
- `release_second_session() returns boolean`.
- `notification_marker()` = `ZQXW12PRIVATE`.
- The local-only registration of 3 `test.*` categories (deviation D3).

Changed files:
- `scripts/supabase-test/stage-local-workdir.mjs` (349 lines): 8th `HELPERS_SOURCE_NAMES` entry.
- `scripts/supabase-test/stage-local-workdir.test.mjs` (349 lines): `stager_seeds_every_helper_file_in_order` now checks 8 suffixes.
- `supabase/tests/database/001_migration_replay.test.sql`:
  - It now covers 92 staged migrations, adding 20261030000001..05.
  - `replay_schema_migrations_has_baseline_w2_to_w14` is renamed to `..._w2_to_w14_and_w12`.
  - Added `replay_w12_registry_and_job_state_rls_enabled`.
  - Plan goes from 25 to 26.

Added 7 pgTAP files. In each, plan = actual, there are 0 `todo_start(` and the file is <= 350 lines. Every section-6 name is used.

| File | Tests |
|---|---|
| `j17_w12_notification_registry` | 31 |
| `j17_w12_notification_dedup` | 21 |
| `j17_w12_notification_privacy` | 10 |
| `j13_w12_scheduled_jobs` | 31 |
| `j16_w12_scheduler_locking` | 18 |
| `j17_w12_scheduler_authorization` | 24 |
| `j18_w12_flows` | 16 |
| **Total** | **151** |

`git diff --name-status 8c84bf8 -- supabase/migrations supabase/tests/database` lists only `M 001_migration_replay.test.sql`. Everything
else is new and untracked.

R1/R2 guard: `j17_w12_notification_registry` scans the body of every function that calls `enqueue_notification(_safely)(`. The scan
finds:
- the literal category arguments (31);
- `'family.' || ...` category families (2: `certification.`, `job_opening_moderation.`);
- literals in `category := case ... end`;
- key prefixes from `format('<prefix>:...` / `'<prefix>:' ||` / `*key := format(...)` (19).

The test fails if any of these is missing from the registry or if a registry row has no producer. It also compares all 37 rows
(category, increment, prefixes, subject types, recipient kind) with a fixed expected list.

Negative check, run once and then discarded: deleting `job_opening.paused` and `certification.expired` from the registry made tests
1, 2 and 4 fail and named `category:job_opening.paused in job_openings_notify_applicants_on_pause()`.

### Actual results (local stack)
- Before the new pgTAP files were written, the existing 91 files ran with the W12 migrations applied: `Files=91, Tests=2877`
  `Result: PASS`. The only WARNING was the expected `test.safe` skip in `j17_w3_notifications`.
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: tests 19, pass 19, fail 0.
- `node scripts/supabase-test/run-db-tests.mjs` (fresh stage, `db reset`, `test db`; final run after the last migration edit): 92
  staged migrations applied, `Files=98, Tests=3028`, `Result: PASS`, exit 0. That is +7 files and +151 tests.
- `grep -c "todo_start(" supabase/tests/database/*.sql`: total 0.
- WARNINGs in the run, all expected: `j17_w3_notifications:238` (`test.safe`, pre-existing), and `j17_w12_notification_registry:140`
  and `:148` (intended unregistered / deleted-category skips).
- Smokes on the same stack, each 0 failed:

  | Smoke | Passed |
  |---|---|
  | w2 | 48 |
  | w3 | 33 |
  | w4 | 43 |
  | w5 | 39 |
  | w6 | 40 |
  | w7 | 38 |
  | w8 | 30 |
  | w9 | 34 |
  | w10 | 39 |
  | w11 | 36 |
  | w14 | 33 |

- Register script, local stack only, inside `begin; ... rollback;`:
  - `CREATE EXTENSION`, then job ids 1, 2 and 3 with the three schedules and commands above; `jobs_in_tx=3`.
  - Running it a second time in the same transaction gave `jobs_after_rerun=3` (idempotent).
  - The unregister script gave `jobs_after_unregister=0`.
  - After `ROLLBACK`: `pg_cron_after_rollback=0` and `cron_schema_after_rollback=false`.
  - Unregister run without pg_cron (rolled back) printed `NOTICE: pg_cron is not installed; nothing to unregister.`
- Idempotency: all five W12 migrations applied again in one `begin ... rollback` on the migrated DB, with no error: 40 registry rows
  (37 + 3 local test rows) and 3 job rows.
- AC greps:
  - `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_30_w12*`: empty.
  - `grep -rniE "pg_cron|cron\.schedule" supabase/migrations`: empty, exit 1. I reworded two comments and one NOTICE to get there,
    then re-ran the full suite.
  - The AC10 `create or replace function public.(enqueue_notification|...)` grep over the w12 files: empty.
- The local stack was stopped with `npx supabase stop --workdir . --no-backup`, run from `.local-supabase-test`. Output: "Stopped
  supabase local development setup." 0 `supabase_` containers remain.

### Deviations
- **D1 Primary keys.** Both tables have a `uuid` primary key `id`. `category` and `job_key` are `NOT NULL UNIQUE` instead of the text
  PK in the plan, because the standing rule is that every new table has a uuid PK. The registry also got `updated_at`. No client
  sees `id`.
- **D2 Repeats of an existing key.** The registry trigger lets a repeat of an EXISTING `(recipient_id, idempotency_key)` through and
  leaves it to the W3 unique constraint: `ON CONFLICT DO NOTHING` returns the old row and a plain insert fails with 23505.
  - Why: BEFORE INSERT triggers fire before ON CONFLICT. Two unchanged tests replay existing keys with a null subject:
    `j5_application_audit_and_notifications:170` and `j17_w3_idempotency_and_leaks:64`.
  - An unregistered row can still never be written.
- **D3 Local-only test categories.** `j17_w3_notifications` (unchanged) enqueues the synthetic categories `test.notice`, `test.dup`
  and `test.text` (key `test:`, no subject).
  - They are registered by a plain INSERT in the local seed `test_helpers_scheduling.sql`, as a trusted session. No migration and
    no helper function writes them, and production never has them.
  - The registry test counts 37 rows excluding `test.%` and asserts that the test rows have prefix `test` only.
  - The plan's "no helper writes the registry" is kept for helper functions only.
- **D4 Where the unregistered-category NOTICE lives.** The NOTICE that lists existing `notifications.category` values missing from
  the registry is in w12b, right after the seed, so the 37-row list exists only once. w12a keeps the NOTICE for existing
  `washlink_%` cron jobs (via `to_regclass('cron.job')`, without the word pg_cron).
- **D5 New messages.** Unknown job: 22023 `Unknown scheduled job.` Missing state row: 22023 `Scheduled job state is missing.` The
  plan only gave the codes.
- **D6 State row lock.** The runner locks its state row `FOR UPDATE NOWAIT`. If a runbook UPDATE holds the row, the runner returns
  `already_running` and writes nothing, so it never waits.
- **D7 Audit row.** `workforce_scheduled_job.ran` has `subject_id` null as well as `subject_profile_id` null, so it carries no ids.
  `actor_kind` is `trusted_session`.
- **D8 Notices job counts.** For the notices job, processed = changed = notices created (that is all the W7 function returns).
  `remaining` = the pending backlog after the run, and is null for the relationship refresh.
- **D9 Backdate technique.** `backdate_test_worker_contract` uses `SET LOCAL session_replication_role = replica` for the one UPDATE
  (the j13_w10 technique), not `ALTER TABLE ... DISABLE TRIGGER`.
  - `ALTER TABLE` raised `cannot ALTER TABLE "worker_contracts" because it has pending trigger events` (deferred W9 FKs).
  - `set_config('session_replication_role', ...)` is refused by supautils (`permission denied to set parameter`).
  - Side effect: the W10 sync trigger is also skipped, so the stored relationship stays stale, as it would after a real day.
- **D10 dblink host (R4 not triggered).** dblink connects with `host=db port=5432 dbname=postgres user=postgres password=postgres`,
  the local default credentials. `db` is the local Docker network alias of the same container and uses scram.
  - Loopback is `trust` in pg_hba, and dblink refused it for the non-superuser `postgres` (`password or GSSAPI delegated credentials
    required`).
  - The lock tests stay in pgTAP, so nothing moved to a smoke.
- **D11 Sync trigger off in the lock test.** `j16_w12_scheduler_locking` disables `worker_contracts_sync_owner_relationship` at the
  top of the file, before any fixture contract exists; it is rolled back with the test.
  - Without that, the test transaction already holds every fixture pair's W10 lock (the sync trigger takes it), so a second session
    can never hold it.
  - The collision is checked both ways: the second session holds the key, so `worker_owner_pair_try_lock` returns false; and our
    `refresh_worker_owner_relationship` holds the key, so the second session's `pg_try_advisory_lock` returns false. The test also
    checks that the key expression text is identical in both function bodies (R3).
- **D12 Seeding the job state.** A job state INSERT is allowed only for a trusted session with
  `washlink.scheduled_job_state_write = 'seed:<job_key>'`, which only w12c uses.
- **D13 Several runs in one test.** pgTAP runs each file in one transaction, so the tests clear `washlink.scheduled_job` between two
  runner calls (TEST-ONLY, documented in each file header).
- **D14 Definer functions.** `worker_owner_pair_try_lock` is `security definer` like every other W12 function, and all pin
  `search_path = public, pg_temp`. Tested: 9 `W12:` functions.

### Not verified
- **Row-lock paths.** The `FOR UPDATE SKIP LOCKED` candidate path and the `FOR UPDATE NOWAIT` per-contract subtransaction (55P03 ->
  skipped) were checked by reading the code only. A dblink second session cannot see the test transaction's uncommitted rows, so
  only advisory-lock contention (pair lock and job lock) is tested.
- **Real cron runs.** No cron job actually fired. Registration was checked only inside a rolled-back local transaction, and the
  runner was called directly as a trusted session. pg_cron's runtime identity (R6) is not observed.
- **Production.** Production categories (R1 / D-10) and Realtime settings are unknown. The w12b NOTICE and the Realtime abort cover
  them at apply time.
- **Out of this step.** The frontend, `w12-api-smoke.mjs` and the docs were not built.

### RPCs and reads for the frontend
**Inbox (W3 table, no new RPC).** The repository keeps reading `public.notifications` directly. RLS returns only the caller's rows,
and the table is `authenticated` select-only.
- Columns: keep `id, category, title, body, created_at, read_at`. Never select `subject_type`, `subject_id` or `idempotency_key`.
- First page: `.select('id, category, title, body, created_at, read_at').order('created_at', { ascending: false })
  .order('id', { ascending: false }).limit(50)`.
- "Load older" keyset (`before = last row`): add `.or('created_at.lt.<ts>,and(created_at.eq.<ts>,id.lt.<id>)')`. Dedupe by `id`. The
  index used is `notifications_recipient_created_idx (recipient_id, created_at desc)`.
- Unread only: `.is('read_at', null)`. The area filter is client-side from `category`. The registry is NOT readable by any client
  (no grant, deny-all policies; errors 42501 `permission denied`), so `notificationAreas.ts` must map categories itself.
- Mark read (unchanged): `mark_notifications_read(p_notification_ids uuid[] default null) returns integer`. Null means all of the
  caller's unread rows. Unknown or foreign ids are ignored.
  - Errors: 42501 `Sign in to manage notifications.` and 22023 `Mark at most 200 notifications at a time.`

The 37 categories (they are in the w12b migration file, which Vitest can read), with their suggested area:

| Area | Categories |
|---|---|
| `shop` | `shop_verification.status_changed`, `shop_verification.rereviewed` |
| `roster` | `roster.linked`, `roster.unlinked` |
| `applications` | `job_application.submitted`, `.status_changed`, `.withdrawn`, `.closed`, `.removed`, `job_opening.paused` |
| `job_openings` | `job_opening_moderation.paused`, `.closed`, `.pause_kept`, `.lifted`, `job_opening_report.closed` |
| `training` | `training.schedule_changed`, `.trainer_role`, `.invited`, `.response`, `.cancelled`, `.record_corrected`, `.assessment` |
| `certifications` | `certification.issued`, `.renewed`, `.suspended`, `.revoked`, `.reinstated`, `.review_requested`, `.review_decided`, `.training_record_changed`, `.expiring`, `.expired` |
| `contracts` | `worker_contract`, `worker_contract_dispute.raised`, `worker_contract_dispute.closed` |
| `washlink_reviews` | `certification_platform_review.opened`, `.decided` |
| `other` | any unknown category |

**super_admin scheduled-jobs card.**
- Signature: `admin_workforce_scheduled_jobs() returns table (job_key text, enabled boolean, batch_size integer, last_started_at
  timestamptz, last_finished_at timestamptz, last_outcome text, last_processed_count integer, last_changed_count integer,
  last_skipped_locked_count integer, last_pass_completed_at timestamptz, run_count bigint, pending_count integer)`.
- Access: stable, granted to `authenticated` only. A super_admin gets 3 rows. Every other signed-in role gets 0 rows (no error);
  anon and service_role have no execute (42501 `permission denied`). It returns no ids, names or cursor and is not audited.
- Row order: `certification_expiry_notices`, `worker_contract_expiry`, `owner_relationship_refresh`.
- `last_outcome`: null (never ran), `completed` or `disabled`. `already_running` is never stored.
- "Never ran" means `run_count = 0` and `last_started_at` is null. Show "Scheduled jobs are not running yet. A person must approve
  and register them."
- `pending_count`:
  - notices: active certificates expiring within 30 days that still lack their due / expired notice;
  - contracts: accepted / active contracts whose Manila end date has passed but are not recorded expired. Copy: "Expired contracts
    are shown from their end date even before this job records them.";
  - relationships: always null.
- `batch_size`: 200 for notices (ignored), 25 for contracts, 50 for relationships. `enabled` and `batch_size` change only through
  trusted SQL (runbook); there is no RPC.

**Internal only (never call from the frontend; revoked from anon, authenticated and service_role):**
- `run_workforce_scheduled_job(p_job text) returns jsonb` returns `{job, outcome: completed|disabled|already_running, processed,
  changed, skipped_locked, remaining}`. Errors:
  - 42501 `Scheduled jobs run only from a trusted database session.`
  - 22023 `Unknown scheduled job.`
  - 55000 `W12: one scheduled job per transaction.`
- `expire_worker_contracts_batch(p_limit integer)` and `refresh_worker_owner_relationships_batch(p_after_worker uuid, p_after_owner
  uuid, p_limit integer)`: 22023 `Batch size must be between 1 and 200.`
- `worker_owner_pair_try_lock(uuid, uuid)` and `workforce_scheduled_job_pending(text)`.
- Registry violations: 23514 `W12: notification category or key is not registered.` Registry writes: 42501 `The notification
  registry is changed only by migrations.` Job state writes: 42501 `Scheduled job state is written only by the runner.`

## BUILD (docs) - 2026-10-29

Docs only; nothing committed, no `.env` read, no code, migration, test or script touched. Added `docs/workforce/NOTIFICATIONS_AND_SCHEDULING.md`
(302 lines): P80-P85, D-59..D-69, the registry and the 37-category catalogue, de-duplication rules, privacy guarantees, the in-app-only channel
with the documented (unbuilt) external-delivery hook, the scheduler design as built (D1..D14 reflected; one job per transaction, no lock waits,
batches, cursor, the date-free runner closing W10 S2 / S3 / C8), the HUMAN-RUN Runbook for `scripts/supabase-scheduling/{register,
unregister}_workforce_jobs.sql`, the "Not verified" list and rollback; the frontend is described as planned. Updated `AUDIT_AND_NOTIFICATIONS.md`
(pointer and in-place wording only, still 350 lines), `CERTIFICATIONS.md`, `WORKER_CONTRACTS.md`, `OWNER_RELATIONSHIPS.md`,
`ROLE_AND_PROFILE_SECURITY.md` (D-10 rows 49-51 incl. the production-category parity check, W12 guard matrix), `LOCAL_TEST_HARNESS.md` (92
migrations, 8 helper files, 98 files / 3028 tests, 7 W12 pgTAP rows, replay row 26, W12 smoke and Vitest marked planned) and
`LEGAL_REVIEW_REGISTER.md` (W12-L1..L8 OPEN; W3-L2 and W7-L10 text updated, still OPEN); every other "W12" carry-forward in `DASHBOARDS_AND_OVERSIGHT.md`,
`PLATFORM_MODERATION_AND_AUDIT.md` (in place, still 350), `TRAINING.md` and `MARKETPLACE_AND_APPLICATIONS.md` now says what W12 delivered or
decided. Wrote `LEGAL_FLAGS.md` (W14 format). Every changed doc is <= 350 lines; no doc claims legal validity or that anyone was legally notified.

## BUILD (frontend) - 2026-10-29

Branch `feature/workforce`, base HEAD 8c84bf8. Nothing committed. Only `frontend/src` and this LOG were changed; no `docs/`, `supabase/` or `scripts/`
edit, no `.env` read, and no `service_role` anywhere (`grep -rn "service_role" frontend/src`: no match, exit 1).

### Files
Added (lines):
- `domain/utilities/notificationAreas.ts` (82): pure category -> area map (37 categories; a `Map`, so `constructor` / `__proto__` cannot hit a
  prototype key); unknown -> `other`.
- `domain/models/WorkforceScheduledJob.ts` (31), `domain/repositories/ScheduledJobRepository.ts` (10).
- `infrastructure/repositories/SupabaseScheduledJobRepository.ts` (56): RPC `admin_workforce_scheduled_jobs` only (no args); bigint `run_count`
  accepted as number or text.
- `application/services/ScheduledJobService.ts` (24): `hasScheduledJobNeverRun` (`run_count = 0` and `last_started_at` null),
  `areScheduledJobsNotRunning`.
- `presentation/hooks/useWorkforceScheduledJobs.ts` (19, `useLatestResource`, no polling).
- `presentation/utilities/notificationAreaCopy.ts` (39), `presentation/utilities/scheduledJobCopy.ts` (68).
- `presentation/components/notifications/NotificationFilterBar.tsx` (97): All / Unread toggle (`aria-pressed`, group "Show notifications") and a
  labelled Area select ("Filters the notifications loaded so far.").
- `presentation/components/superAdmin/ScheduledJobsCard.tsx` (169): loading / error (retry) / empty (0 rows) / success. When every job never ran it
  shows "Scheduled jobs are not running yet. A person must approve and register them." The contract job shows "Expired contracts are shown from
  their end date even before this job records them." A null `pending_count` shows "Not counted for this job". An unknown job key or outcome is
  shown as stored. No buttons (read only).
- `presentation/dependencyInjection/createScheduledJobDependencies.ts` (11).
- 5 test files (below).

Changed (lines now): `domain/models/AppNotification.ts` (43), `domain/repositories/NotificationRepository.ts` (17),
`infrastructure/repositories/SupabaseNotificationRepository.ts` (95), `application/services/NotificationService.ts` (137),
`presentation/hooks/useNotifications.ts` (322), `notifications/NotificationPanel.tsx` (195), `notifications/NotificationListItem.tsx` (74),
`notifications/NotificationCenter.tsx` (75), `superAdmin/AdminOverviewPanel.tsx` (187). Largest file 322 lines; all <= 350.

Inbox behaviour:
- First page: 50 rows ordered `created_at desc, id desc`.
- "Load older": the LOG keyset `.or('created_at.lt.<ts>,and(created_at.eq.<ts>,id.lt.<id>)')` from the last loaded row. The timestamp is kept as
  the stored text and validated (zod regex + uuid) before any request. Pages are merged and de-duplicated by id.
- A poll / focus refresh merges the new first page on top and keeps the older pages. A full reload (Retry) starts again.
- Unread only: `.is('read_at', null)` in the database; the unread count is not affected. The area filter is client-side over the loaded rows.
- Each item shows a plain-text area chip ("Area: <label>"); no deep links (D-68). Panel copy: "Notifications appear here in the app only."
- Select columns unchanged: `id, category, title, body, created_at, read_at`.

Unchanged (`git diff 8c84bf8 -- frontend` lists only the 9 changed files above): `NotificationBell.tsx`, the 60 s polling interval,
`features/superAdmin/SuperAdminDashboardPage.tsx`, `createSuperAdminDependencies.ts`, every W4-W14 feature component, the five J16 files
(TerminateContractModal, DeclineContractModal, AcceptContractModal, WorkerContractReview, RequestCertificationReviewModal), `test/fixtures.ts` and
every existing test file.

### Tests (Vitest, mocked; 11 new)
| File | Tests |
|---|---|
| `domain/utilities/notificationAreas.w12.test.ts` | `w12_every_registered_category_has_an_area`, `w12_unknown_category_shows_other_area` |
| `presentation/hooks/useNotifications.w12.test.ts` | `w12_inbox_unread_only_filter`, `w12_inbox_area_filter`, `w12_inbox_load_older_uses_keyset_and_dedupes` |
| `infrastructure/repositories/SupabaseNotificationRepository.w12.test.ts` | `w12_repository_selects_no_subject_or_key_columns`, `j17_w12_repositories_use_rpcs_or_recipient_reads_only` |
| `presentation/components/notifications/NotificationListItem.w12.test.tsx` | `w12_list_item_area_chip_plain_text`, `w12_inbox_panel_filters_and_load_older_controls` (extra) |
| `presentation/components/superAdmin/ScheduledJobsCard.w12.test.tsx` | `w12_admin_scheduled_jobs_card_states`, `w12_scheduled_jobs_card_says_registration_is_a_human_step` |

- `w12_every_registered_category_has_an_area` checks the 37 LOG categories, with their LOG areas, against the client map. It also parses the 37 seed
  rows of `supabase/migrations/2026_10_30_w12b_notification_category_registry.sql` and requires the client map to list exactly the same set.
- Negative check (run once, file restored): deleting `job_opening.paused` from the map failed it with
  `job_opening.paused: expected 'other' to be 'applications'`.
- `j17_w12_repositories_use_rpcs_or_recipient_reads_only` also scans every `infrastructure/repositories/Supabase*Repository.ts` source for the
  registry / job-state tables, the runner, the batch functions, `worker_owner_pair_try_lock`, `enqueue_*` and the service-role name. None found.

### Actual results (in `frontend/`)
- Baseline before any change: `npx vitest run` 131 files / 263 tests passed.
- `npm run lint`: `eslint .`, no findings, exit 0.
- `npm run build`: `tsc -b && vite build`, "2875 modules transformed", "built in 621ms", exit 0.
- `npm test`: `Test Files 136 passed (136)`, `Tests 274 passed (274)` (263 existing + 11 new), exit 0.

### Deviations
- **F1 `AppNotification` has no `area`.** The unchanged W3 test `w3_notification_service_maps_rows_to_app_notifications` compares the
  `listMyNotifications()` output with `toEqual` on objects without `area`. So `area` is on a new `InboxNotification extends AppNotification` in the
  same file, returned by the new `NotificationService.listMyInboxPage()`. The W3 `listMyNotifications(limit)` is unchanged.
- **F2 Repository paging signature.** `listMyNotifications(limit, pageRequest?)` with `{ before: cursor | null, isUnreadOnly }`, not
  `(limit, before?)`, so the database applies the unread filter.
  - Without a page request the query is the W3 query, unchanged (one `created_at` order). The unchanged W3 test
    `w3_supabase_notification_repository_selects_explicit_columns` asserts exactly one `order` call.
  - Every inbox call from the hook passes a page request and gets the `created_at desc, id desc` order that the keyset needs.
- **F3 Card wiring without changing the page.** `SuperAdminDashboardPage.tsx` is a W11/W14 feature component (unchanged on purpose). It passes only
  `workforceDashboardService` / `adminOversightService` to the Overview.
  - `AdminOverviewPanel` takes an optional `scheduledJobService` prop. In the W14 nine-tab console (when `adminOversightService` is given) it
    creates the production service through the new `createScheduledJobDependencies.ts`, the same pattern as `AuthenticatedTopBar` /
    `UserAccountMenu`.
  - `createSuperAdminDependencies.ts` is NOT changed. The W14 page tests mock that module with only `createSuperAdminDependencies`, so a new export
    there would be undefined in them.
  - The card sits below the Overview body, outside it, so it shows even when the W11 summary fails. W11 callers without the W14 service (e.g. the
    W11 overview test) do not show it.
  - In the two mocked W14 page tests the card reaches the blocked network and shows its error state; their assertions are unaffected. In
    `w14_production_di_gives_super_admin_nine_tabs` (real DI, RPC mocked to `[]`) it shows the empty state; the tab list is unchanged.
- **F4 Migration read in Vitest.** The w12b file is outside the Vite root, and a `?raw` import was refused ("Denied ID"). The test reads it with
  `node:fs` from `process.cwd()/../supabase/migrations` (`/// <reference types="node" />` in that test only; `npm test` runs in `frontend/`).
- **F5 Wording.** Area labels: Applications, Job openings, Training, Shop-issued certificates, Contracts, Shop verification, Roster, WashLink
  reviews, Other updates (the generic fallback). No copy says an email / SMS / push was sent, that anyone was warned, or that a contract legally
  ended.
- **F6 No polling for the card.** It loads once per Overview visit, with a retry on error (counts only, not audited).

### Not verified
- No browser run against the local stack. The keyset `.or(...)` string, the `id` tie-break order and `admin_workforce_scheduled_jobs` were checked
  only with mocked clients. PostgREST acceptance belongs to `w12-api-smoke.mjs`, which is not part of this step.

## BUILD (docs reconcile) - 2026-10-29

Docs only (`docs/workforce/`, W12 `LEGAL_FLAGS.md`, this note); nothing committed, no `.env` read. Source: W12 LOG "BUILD (frontend)" F1..F6.
`NOTIFICATIONS_AND_SCHEDULING.md` (now 328 lines): the "as planned" frontend section is replaced by the built files (`InboxNotification` +
`listMyInboxPage`, F1; repository paging `{ before, isUnreadOnly }`, F2; card wired through `AdminOverviewPanel` and
`createScheduledJobDependencies.ts` with `createSuperAdminDependencies.ts` unchanged, F3; registry-parity Vitest via `node:fs`, F4; area labels incl.
"Shop-issued certificates" / "Other updates", F5; no polling on the card, F6), plus the mocked-only "Not verified" note. `LOCAL_TEST_HARNESS.md`:
Vitest 136 files / 274 tests (11 new); W12 smoke count left for the test step. `LEGAL_REVIEW_REGISTER.md` and `LEGAL_FLAGS.md`: W12-L4 now quotes
the built copy from `frontend/src/presentation/utilities/scheduledJobCopy.ts:11-14` (checked verbatim; card copy in the docs matches). Every
`frontend/src/...` path cited in `docs/workforce` and every frontend path in the new frontend section was checked to exist. All files <= 350 lines.

## TEST & RUN - 2026-10-29

Local stack only (`.local-supabase-test`), no `--linked`, `--db-url`, `db push`, no `.env` read, no commit, docs untouched.
- Added `scripts/supabase-test/w12-api-smoke.mjs` (230 lines, loopback only, `smoke12-*` users deleted and asserted, no cron registered; the
  trusted psql runner call is inside `begin ... rollback`). It checks the F2 keyset query over real rows (including rows sharing one
  `created_at`): passes.
- Confirmed every PLAN section 6 test name exists; 0 `todo_start(`.
- Results: lint 0, build 0, Vitest 274/274 (136 files), pytest 4 passed, stager 19/19, run-db-tests Files=98 Tests=3028 Result: PASS,
  smokes w2..w11, w14 all 0 failed (48, 33, 43, 39, 40, 38, 30, 34, 39, 36, 33), w12 22 passed 0 failed. Stack stopped, 0 containers.
- Register script re-run in a rolled-back local transaction: 3 jobs inside, pg_cron absent afterwards.
- AC greps and details: see `TEST_RESULTS.md`. No failures; no product code changed.

## FIX CYCLE 1 (frontend) - 2026-10-30

Frontend only (`frontend/src`), nothing committed, no `.env` read. Routes from REVIEW.md: C1 and N8.
- **C1 scheduled-jobs card.** Badge "Enabled" -> "Enabled in WashLink" (tone `info`, no longer green `success`); the card header adds
  "Enabled in WashLink only means the job may run when called. Registering it with the database cron scheduler is a separate step done by
  a person, and that registration is not visible here." New per-job "Not run recently" warning when `run_count = 0`, `last_started_at` is
  null or unreadable, or the last start is older than `scheduledJobNotRunRecentlyThresholdMilliseconds` (2 h, one constant in
  `application/services/ScheduledJobService.ts`; the copy derives "2 hours" from it). Never-run jobs keep "A person must approve and
  register it."; stale jobs say "Its cron registration may be missing or stopped; a person must check it." When not every job is
  never-run, a summary "N of M scheduled jobs have not run in the last 2 hours." is shown above the list; the all-never-ran notice is unchanged.
  Health is judged in the service (`loadScheduledJobStatuses`, injectable clock) against the load time; the hook now returns
  `ScheduledJobStatus[]`. `createScheduledJobDependencies.ts` unchanged (the clock parameter is optional).
- **w12e re-read.** `admin_workforce_scheduled_jobs()` now also returns `last_skipped_failed_count` and `last_failed_sqlstates`; no new
  `last_outcome` values (still `completed` / `disabled`; unknown values still shown as stored). The model, mapper and card show them as
  plain text: counts gain "skipped after an error N"; a new "Error codes in the last run" field shows the stored codes joined by ", ",
  "None" for an empty list, "Not recorded" when the column is absent (mapped to null, never defaulted).
- **N8 keyset filter.** New `domain/utilities/notificationCursor.ts` holds the strict ISO timestamp and uuid patterns (uuid pattern equal to
  zod `z.uuid()`); `NotificationService` uses them, and `buildNotificationKeysetFilter` throws `invalidNotificationKeysetCursorMessage`
  on an invalid cursor before any filter is built (the repository rejects before `.or` / `.limit`).
- **Tests (8 new).** `ScheduledJobsCard.w12.test.tsx` +4 (badge wording, partial registration 1 recent + 2 never ran, stale all > 2 h,
  all healthy) and N4 fields in the existing states test; `ScheduledJobService.w12.test.ts` +3 (threshold boundary, run_count 0 / missing /
  unreadable start, load-time judgement); `SupabaseNotificationRepository.w12.test.ts` +1 (`w12_keyset_filter_validates_its_own_cursor`)
  and mapper coverage of the new columns.
- **Results.** `npm run lint`: 0 problems. `npm run build`: built (tsc + vite). `npm test`: 137 files, 282 tests passed (was 136 / 274).
- Unchanged on purpose: `SuperAdminDashboardPage.tsx`, `createSuperAdminDependencies.ts`, `NotificationBell.tsx`, J16 files (not in git
  status). No copy claims email / SMS / push delivery or legal validity.

## FIX CYCLE 1 (DB) - 2026-10-30

DB / scripts / docs only; W12 migrations w12c..w12e edited in place (uncommitted); no pre-W12 migration, producer or
W7 / W9 / W10 function body touched (AC10); nothing committed; no `.env` read; local stack only (no `--linked`,
`--db-url`, `db push`). Routes from REVIEW.md: N2, N3, N4, N6, N7 (docs), N9, S1 / C5 / C4, C3 (docs).
- **N4 liveness (w12c / w12d / w12e).** Each expiry contract and each refresh pair runs in its own subtransaction;
  55P03 -> `skipped_locked`, `others` -> `skipped_failed` with only the SQLSTATE kept (`failed_sqlstates`, at most 10
  distinct codes, CHECK `^[0-9A-Z]{5}$`; no ids, no text). The expiry batch is now
  `expire_worker_contracts_batch(p_after_contract uuid, p_limit integer)` and the runner keeps a new
  `cursor_contract_id` (CHECK: expiry job only), so a failing contract is retried once per pass and never holds back the
  rest; the refresh cursor already moved past every pair looked at. New state columns `last_skipped_failed_count`,
  `last_failed_sqlstates`. The expiry job now also sets `last_pass_completed_at` when a pass completes.
- **N3 locking.** Candidates read without a row lock; per item: pair try-lock, then row `FOR UPDATE SKIP LOCKED`, then
  versions `NOWAIT`; a busy or no-longer-due row raises inside the subtransaction, so the pair lock is released.
  `lock_timeout` 5 s -> 1 s. Bound documented: an action waits only for an item this run already locked, until the run
  commits; never for a skipped / failed / unreached item. (A literal "one item in flight" bound is not achievable in a
  one-transaction run: processed items keep their row / pair locks until commit.)
- **N2.** `workforce_scheduled_jobs_guard_write`: the runner-flag path now also requires `trusted`.
- **Run result / admin read (frontend impact).** Runner jsonb adds `skipped_failed` and `failed_sqlstates` (also on
  `already_running`: 0 / []); outcome values unchanged (`completed` | `disabled` | `already_running`). Audit payload adds
  `skipped_failed_count`, `failed_sqlstates`. `admin_workforce_scheduled_jobs()` (dropped and re-created) appends
  `last_skipped_failed_count integer, last_failed_sqlstates text[]` after `pending_count`.
- **N6.** Unregister selects `jobid` and calls `cron.unschedule(jobid)`; both scripts say "Run both scripts as the same
  role (postgres)". Re-verified inside `begin; ... rollback;` on the local stack as `postgres`: register -> 3 jobs, second
  register -> 3, unregister -> `Unregistered <name> (jobid 1..3)`, 0 jobs, second unregister no-op; after ROLLBACK no
  pg_cron, `cron.job` absent. A duplicate-name job could not be planted (`permission denied for table job` for
  `postgres`), so the duplicate path is by reading only.
- **N9.** dblink credential string labelled "LOCAL DEFAULT, local test stack only".
- **S1 / C5 / C4.** `j17_w12_notification_privacy` (10 -> 12): k7 with marker clauses / pay gets an amendment proposal
  and is backdated; c3 / c4 (W12LABEL program, marker-named workers) due / expired; the notices and contract expiry jobs
  run through `run_workforce_scheduled_job` (flag cleared as D13) before the sweep; 19 categories plus 6 worker_contract
  titles swept; every assertion uniquely named (`w12_privacy_fixture_covers_categories`, ...); header maps every other
  producer to its earlier file. Interpretation: the program title stays the allow-listed W12LABEL label (it is shown in
  the notice by design, P82); the marker sits in the worker names, clauses and pay.
- **Tests.** New `j16_w12_fix1_scheduler_liveness` (20; planted 23514 contract and pair, dblink lock-release check,
  cursors, retry next pass, audit SQLSTATE only, try-lock-before-row-lock source order, `lock_timeout` 1 s). Updated
  `j13_w12_scheduled_jobs` (31), `j16_w12_scheduler_locking` (18, all J16 green), `j17_w12_scheduler_authorization`
  (24 -> 25, N2), `w12-api-smoke.mjs` (new batch signature).
- **Docs.** C3 W12-L3 wording (register and LEGAL_FLAGS); N7 D-10 row 52 (`puballtables`) and runbook step 2; N3 / N4
  bound and skip rules, new columns and payload in NOTIFICATIONS_AND_SCHEDULING.md (349 lines); harness counts.
- **Results (local).** Stager test 19 / 19 pass. `run-db-tests.mjs`: 92 migrations, `Files=99, Tests=3051`, `Result:
  PASS` (was 98 / 3028), 0 `todo_start(`. Smokes on the same stack: w2 48, w3 33, w4 43, w5 39, w6 40, w7 38, w8 30,
  w9 34, w10 39, w11 36, w14 33, w12 22 passed, all 0 failed (run before the final confirming reset + pgTAP run).
  Stack stopped, 0 containers.
- Not verified: row-level SKIP LOCKED / NOWAIT contention (dblink cannot see test rows; source-order test only); a real
  cron firing; the duplicate-jobid unschedule path. LOG.md itself is over 350 lines (365 before this cycle).

## FIX CYCLE 1 (docs reconcile) - 2026-10-30

Docs only (`docs/workforce/`, W12 `LEGAL_FLAGS.md`, this note); nothing committed, no `.env` read. Card copy re-read from
`frontend/src/presentation/utilities/scheduledJobCopy.ts`: `NOTIFICATIONS_AND_SCHEDULING.md` now describes the "Enabled in WashLink" badge and
its registration note, the per-job "Not run recently" warning (2 h, `scheduledJobNotRunRecentlyThresholdMilliseconds`), the "N of M" summary,
"skipped after an error N" and "Error codes in the last run"; runbook step 5 no longer treats "enabled" as proof of registration. W12-L4 in
`LEGAL_REVIEW_REGISTER.md` and `LEGAL_FLAGS.md` quotes the new copy and cites `scheduledJobCopy.ts:15-20, 49-60` (checked). Counts: Vitest 137 / 282
(`LOCAL_TEST_HARNESS.md`, NOTIFICATIONS doc), pgTAP 99 / 3051 and W12 smoke 22 (already set by the DB fix step; confirmed). NOTIFICATIONS doc trimmed
to 349 lines (header, TEST-ONLY paragraph, F3 bullet, limitations); every doc <= 350.

## REVIEW, VERIFY, RECORD - 2026-10-30

- REVIEW: security (S1, N1–N9) and compliance (C1–C5) in parallel; no BLOCKING. Fix cycle 1 (DB + frontend in parallel, then
  docs reconcile): N2–N4, N6–N9, S1, C1, C3–C5. C2 routed to W13 (W9 producer wording). New legal flags W12-L9..L12. Fix cycles: 1.
- VERIFY: fresh verifier re-ran the suite from a clean state: lint 0, build 0, Vitest 137 / 282, pytest 4, stager 19/19,
  `Files=99, Tests=3051`, `Result: PASS` (92 migrations), smokes w2..w11 and w14 0 failed, w12 22 passed; own rolled-back
  second-run and register / unregister checks; stack stopped. AC1–AC12 PASS (`VERDICT.md`).
- Deviations recorded at RECORD (found by the verifier): privacy test `w12_notification_columns_have_no_payload` split into
  `..._are_the_fixed_list` and `..._have_no_json_or_binary_type` (C4 fix, same assertion); w12 smoke narrower than PLAN section 6
  (no contract send / accept / expire, no second-run, no certification notice run, no register script) - covered by pgTAP and the
  verifier's rolled-back runs; `j13_w12_scheduled_jobs` repeats one name for 3 assertions (W13). LOG.md exceeds 350 lines (log only).
- RECORD: DECISIONS D-59..D-69 ADOPTED-DEFAULT (loop, 2026-10-30); LOOP.md W12 smoke row and counts; register W12-L9..L12;
  STATE.md W12 passed (W10 S2/S3/C8 closed); next W13.
