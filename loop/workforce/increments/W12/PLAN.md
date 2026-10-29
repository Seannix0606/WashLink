# W12 - Notification wiring for all events - PLAN

**No split.** W12 fits one increment: 5 migrations, about 16 frontend files, 7 pgTAP files, one smoke script, two human-run SQL scripts and docs, each <= 350
lines. Fallback for the orchestrator, only on a re-plan after the fix-cycle limit: "W12a" = 3.2 registry, tests 1-3, inbox UI; "W12b" = scheduling (3.3-3.6,
tests 4-6, admin card). The halves share only the w12a preflight.

Spec: I (notify the right parties; no duplicates; no private contract details on insecure channels; audit trail), F (relationship counting stays correct over
time), J13-J17 (scheduled expiry keeps counting right; decline / terminate never blocked), J18. Depends on W11 and W14: both `passed` in STATE.md (HEAD 8c84bf8;
W0-W11 and W14 all `passed`). Decisions used: D-3, D-23, D-24, D-25, D-30, D-36, D-39, D-40, D-48, D-53, D-58 (all ADOPTED-DEFAULT) and D-10 (standing,
non-blocking). **No dependency on an OPEN decision** other than D-10. New decisions D-59..D-69 (section 5). Not BLOCKED.
Carry-forwards closed: W10 REVIEW S2 / S3 / C8 (bulk refresh one pair at a time with try-locks, no date parameter on the scheduled path, separate from expiry);
D-25 / W7 REVIEW / W7-L10 (schedule `enqueue_certification_expiry_notices`); W9 REVIEW (schedule `expire_worker_contracts`); D-39 (relationship notices); D-30
(newer-standard notices); D-48 / D-58 (W11 / W14 de-duplication and scheduling); W3 REVIEW C-W3-2 (Realtime); W3-L2 channels; W5 PLAN R2 (bulk close batching).

## 0. Findings from reading the code (drive the design)
- Every W3-W14 notifying event ALREADY goes through one path: AFTER-trigger producer -> `enqueue_notification_safely` -> `enqueue_notification` (writer flag,
  `notification_text_is_safe` CHECK, `unique (recipient_id, idempotency_key)`). 37 categories exist (list in 3.2). W4, W8, W10 notify nobody by decision. W12
  rewrites no producer; it adds a registry every insert must match, proves de-duplication and privacy across events, and schedules the time-driven jobs.
- Cross-event duplicates are already suppressed in code (proven by test 2): WashLink / owner review reinstatement sets `washlink.certification_change_source`, so
  no extra `certification.reinstated`; W9 sends no "withdrawn" inside termination / expiry / party removal; a W14 close sends the owner one notice and applicants
  only the W5 `job_application.closed`; W10 refresh notifies nobody.
- Time-driven internal functions exist, unscheduled, revoked from every client role: `enqueue_certification_expiry_notices(timestamptz)` (w7h; idempotent by key
  `certification_expiry:<id>:due|expired`), `expire_worker_contracts(date)` (w9g; locks every candidate FOR UPDATE in one transaction),
  `refresh_worker_owner_relationships(date)` (w10e; blocking pair advisory lock `hashtextextended('w10:'||worker||':'||owner, 0)` held to commit). All three accept
  a FUTURE date (W10 S3) and existing pgTAP files use that as a test clock (`j9_w9_worker_contract_rules`, `j15_*`, `j13_w10_*`, `j6_w7_*`), so bodies stay.
- Local stack: image `public.ecr.aws/supabase/postgres:17.11.0.006` ships `pg_cron` and `dblink`; `shared_preload_libraries` includes `pg_cron`, `pg_net`. No
  migration creates either extension. Email: only the standalone `frontend/smtp-test.{js,cjs}` nodemailer scripts reading `SMTP_*` (W0 audit); no app path.
- Frontend inbox (W3): `NotificationBell / Center / Panel / ListItem`, `useNotifications` (60 s polling + focus); the repository selects `id, category, title,
  body, created_at, read_at` only. Dashboard tabs are local state (no URL), so deep links are not planned.

## 1. Scope / out of scope
In: (1) `notification_categories` registry (37 rows) + BEFORE INSERT trigger on `notifications` enforcing registered category, key prefix and subject type;
external delivery fixed to `never`. (2) Cross-event de-duplication and private-text-leak proofs over every notifying event (pgTAP + smoke). (3) Scheduled jobs
`certification_expiry_notices`, `worker_contract_expiry`, `owner_relationship_refresh` through one internal runner: small batches, never waiting on a lock, one
job per transaction, state + audit; human-run pg_cron register / unregister scripts, verified locally only inside a rolled-back transaction. (4) super_admin read
of job status and pending backlog; Overview card. (5) Inbox: area chips, unread / area filters, "Load older" keyset paging. Docs, legal register.
Out (reason): email / SMS / push / outbox (D-61: human-provisioned credentials, consent and legal review W3-L2); Realtime (D-62); relationship-change and
newer-standard notices (D-59, D-60); interview scheduling (no interview feature exists, D-69); deep links into dashboard tabs (D-68); auto-closing openings at the
deadline (W5 refuses late applications instead); changing any W3-W14 producer, W7 / W9 / W10 function body or existing test; admin queue paging (W14 N3 -> W13);
retention periods (W13, W3-L1). Never: production apply, production cron registration, `.env`, SQLAlchemy / Alembic, an edited committed migration.

## 2. Design principles (continue P1-P79)
- P80 One path: every notification row is written by `enqueue_notification` (definer producer or trusted SQL) AND matches a registry row: the category exists,
  `idempotency_key` starts with one of its `key_prefixes` + `:`, `subject_type` is one of its `subject_types` (or both null). Violation = 23514, so
  `enqueue_notification_safely` skips it with a WARNING and the business action still succeeds (P14 unchanged). Existing count tests catch a skipped notice.
- P81 De-duplication: per-event keys `<prefix>:<row id>:<audit event id>` (at most one notice per recipient per event); time-driven keys are state-based
  (`certification_expiry:<id>:due|expired`; contract expiry fires once because the status changes once); re-runs create nothing; cross-event pairs in D-66.
- P82 Notification text = fixed copy + labels from an allow-list only: shop name, opening title, program title (owner-authored, already visible to the recipient),
  the owner's own roster label. Never the other person's name, statements, reasons, notes, cover notes, contract text, pay, dates or contacts (marker sweep).
- P83 The scheduled path never takes a date: the runner uses the DB clock (Manila date for contracts). The raw W7 / W9 / W10 functions keep their test-clock
  parameter, stay revoked from every client role, and the runbook forbids calling them with a date in production (closes W10 S3 for every automated path).
- P84 Never wait, never mix: one job per transaction (55000 otherwise); job lock `pg_try_advisory_xact_lock`; candidates `FOR UPDATE SKIP LOCKED`; the W10 pair
  lock taken by `pg_try_advisory_xact_lock` on the same key BEFORE any trigger takes it blocking (re-entrant in the session); version rows `FOR UPDATE NOWAIT` in a
  per-item subtransaction (55P03 -> skipped); `lock_timeout` 5 s local backstop; batch 1..200. Skipped items are retried next run (closes S2 / C8).
- P85 Registration is human: migrations create no extension and no cron job; `scripts/supabase-scheduling/*.sql` are HUMAN-RUN, outside `supabase/migrations/`.

## 3. Migrations (`2026_10_30_w12<x>_<snake>.sql`, staged 20261030000001..05; 92 after W12; each ends with `-- ROLLBACK`; each <= 350 lines)
Idempotent; PostgREST schema-reload notify last; definer functions `set search_path = public, pg_temp`; comments start `W12:`; internal functions
`revoke all ... from public, anon, authenticated, service_role`; the one client RPC granted to `authenticated` only.
### 3.1 `2026_10_30_w12a_notification_wiring_preflight.sql` (creates nothing)
Abort naming each missing item: `notifications.{id, recipient_id, category, title, body, subject_type, subject_id, idempotency_key, created_at, read_at}`, trigger
`notifications_guard_insert`, functions `enqueue_notification(uuid,text,text,text,text,text,uuid)`, `enqueue_notification_safely(...)`,
`enqueue_certification_expiry_notices(timestamptz)`, `expire_worker_contracts(date)`, `worker_contract_close_open_versions(uuid)`,
`refresh_worker_owner_relationship(uuid,uuid,date)`, `record_workforce_audit_event`, `is_trusted_db_session`, `is_super_admin`; columns
`worker_contracts.{id, worker_id, owner_id, status, end_date, accepted_at, pending_version_id, ended_at, ended_by}`, `contract_versions.{contract_id,
version_number}`, `certifications.{id, worker_id, status, expires_at}`. Abort (D-10) if any `public.notification_categor%` or `public.workforce_scheduled_job%`
object lacks a `W12` comment, or trigger `notifications_guard_registered_category` exists. NOTICE (no abort) listing existing `notifications.category` values not
in the 3.2 seed (production data; the insert-only trigger leaves old rows alone) and any `cron.job` named `washlink_%` if a `cron` schema exists. Rollback: nothing.
### 3.2 `2026_10_30_w12b_notification_category_registry.sql`
- `notification_categories`: category text PK (same regex as `notifications_category_check`); source_increment (`^W[0-9]{1,2}$`); key_prefixes text[] NOT NULL,
  1..4 entries each `^[a-z_]+$`; subject_types text[] (null = notice without subject); recipient_kind in (`owner`, `worker`, `trainer`, `reporter`,
  `either_party`); external_delivery text NOT NULL default `never` CHECK (`= 'never'`; D-61: only a later reviewed migration may widen it); description 1..200;
  created_at.
- Seed 37 rows (builder copies prefixes / subject types from the producers; test 1 checks them): W3 `shop_verification.status_changed`, `roster.linked`,
  `roster.unlinked`; W5 `job_application.submitted`, `.status_changed`, `.withdrawn`, `.closed`, `.removed`, `job_opening.paused`; W6 `training.schedule_changed`,
  `.trainer_role`, `.invited`, `.response`, `.cancelled`, `.record_corrected` (prefixes `training_attendance`, `training_assessment`), `.assessment`; W7
  `certification.issued`, `.renewed`, `.suspended`, `.revoked`, `.reinstated`, `.review_requested`, `.review_decided`, `.training_record_changed`, `.expiring`,
  `.expired` (prefix `certification_expiry`); W9 `worker_contract`; W11 `certification_platform_review.opened`, `.decided`, `worker_contract_dispute.raised`,
  `.closed` (prefix `contract_dispute`); W14 `job_opening_moderation.paused`, `.closed`, `.pause_kept`, `.lifted`, `job_opening_report.closed`,
  `shop_verification.rereviewed` (prefix `shop_rereview`).
- `notifications_guard_registered_category()` + BEFORE INSERT trigger `notifications_guard_registered_category` (sorts after `notifications_guard_insert`): P80,
  23514 `W12: notification category or key is not registered.`. Registry guard: INSERT / UPDATE / DELETE only for a trusted session without `auth.uid()`, else
  42501 `The notification registry is changed only by migrations.`. RLS on, deny-all policies, `revoke all from public, anon, authenticated, service_role`; not in
  Realtime (abort on FOR ALL TABLES, W3 rule). ROLLBACK: drop the trigger and function, then the table (configuration only).
### 3.3 `2026_10_30_w12c_workforce_scheduled_jobs.sql`
- `workforce_scheduled_jobs` (one seeded row per job): job_key PK in (`certification_expiry_notices`, `worker_contract_expiry`, `owner_relationship_refresh`);
  enabled boolean default true; batch_size 1..200 (seeds 200 / 25 / 50; ignored for notices); cursor_worker_id, cursor_owner_id uuid (no FK; both null or both
  set); last_started_at, last_finished_at; last_outcome in (`completed`, `disabled`); last_processed_count, last_changed_count, last_skipped_locked_count >= 0;
  last_pass_completed_at; run_count bigint; updated_at.
- Guard (every session): INSERT / DELETE refused (rows are seeded); UPDATE only under the transaction flag `washlink.scheduled_job_state_write` = job_key, or by a
  trusted session without `auth.uid()` changing only `enabled` / `batch_size` (runbook pause), else 42501 `Scheduled job state is written only by the runner.`.
  RLS on, deny-all, no grants, not in Realtime. ROLLBACK: drop guard and table (job history loss only).
### 3.4 `2026_10_30_w12d_scheduled_job_batches.sql` (internal; no W7 / W9 / W10 body replaced)
- `worker_owner_pair_try_lock(p_worker uuid, p_owner uuid) returns boolean`: true when either id is null, else `pg_try_advisory_xact_lock(hashtextextended('w10:'
  || worker || ':' || owner, 0))` (the exact w10e key; test 5 proves it collides with the W10 lock).
- `expire_worker_contracts_batch(p_limit integer) returns table(processed integer, skipped_locked integer, remaining integer)`: Manila today; candidates `status in
  (accepted, active) and end_date < today order by id limit p_limit for update skip locked`; per row: pair try-lock (false -> skipped); subtransaction: versions
  `for update nowait`, write flag, `worker_contract_close_open_versions`, the same update as w9g (`expired`, `ended_at now()`, `ended_by 'system'`,
  `pending_version_id null`), clear flag; `lock_not_available` -> skipped. The W9 producers audit and notify each party once; the W10 sync refreshes the pair.
  `remaining` = candidates still due after the batch.
- `refresh_worker_owner_relationships_batch(p_after_worker uuid, p_after_owner uuid, p_limit integer) returns table(processed, changed, skipped_locked,
  last_worker_id, last_owner_id, pass_completed)`: distinct accepted pairs `> (cursor)` in order, limit; per pair try-lock, then
  `refresh_worker_owner_relationship(w, o)` (default date only); `pass_completed` when fewer than p_limit pairs were left.
- p_limit outside 1..200 -> 22023 `Batch size must be between 1 and 200.`. ROLLBACK: drop the three functions.
### 3.5 `2026_10_30_w12e_scheduled_job_runner_and_reads.sql`
- `run_workforce_scheduled_job(p_job text) returns jsonb` (internal; NO date or batch parameter): 42501 `Scheduled jobs run only from a trusted database session.`
  unless `auth.uid()` is null, `is_trusted_db_session()` and the JWT role is not `service_role`; unknown job 22023; flag `washlink.scheduled_job` already set ->
  55000 `W12: one scheduled job per transaction.`; set it; `lock_timeout` 5 s local; job try-lock `w12:job:<key>` false -> `{outcome: already_running}` with no
  state write; disabled -> state `disabled`; else run: notices -> `enqueue_certification_expiry_notices(now())`; contracts -> batch; relationships -> batch from
  the stored cursor (reset on pass_completed). Updates the state row under the flag; when processed + changed + skipped_locked > 0, audits
  `workforce_scheduled_job.ran` (subject_type `workforce_scheduled_job`, subject_profile null; payload job_key, processed_count, changed_count,
  skipped_locked_count, pass_completed, changed_by `system`). Returns `{job, outcome, processed, changed, skipped_locked, remaining}`.
- `admin_workforce_scheduled_jobs()` (super_admin else 0 rows; stable; counts only, not audited): job_key, enabled, batch_size, last_started_at,
  last_finished_at, last_outcome, last_processed_count, last_changed_count, last_skipped_locked_count, last_pass_completed_at, run_count, pending_count (contracts
  past end not recorded expired; active certificates within 30 days lacking their due / expired notice; null for relationships). No ids, names or contract data.
- Then a `W12` comment on every W12 function and table (a missing one aborts). ROLLBACK: humans run the unregister script FIRST, then drop both functions.
### 3.6 Human-run scripts (NOT migrations; the loop runs them only on the local stack inside `begin; ... rollback;`)
`scripts/supabase-scheduling/register_workforce_jobs.sql`: header "HUMAN-RUN ONLY, after human approval"; `create extension if not exists pg_cron;` and three
`cron.schedule` calls: `washlink_workforce_certification_expiry_notices` `17 * * * *`, `washlink_workforce_worker_contract_expiry` `*/10 * * * *`,
`washlink_workforce_owner_relationship_refresh` `5-59/10 * * * *`, each calling `public.run_workforce_scheduled_job` with its job key.
`unregister_workforce_jobs.sql`: `cron.unschedule` of every `washlink_workforce_%` job. Both idempotent.

## 4. State machines
Scheduled job run (per call, one transaction): `idle -> already_running` (job lock busy; no write) | `disabled` | `completed` (state row updated). Relationship
refresh cursor: `null -> (worker, owner) -> ... -> null` with `last_pass_completed_at = now()`. `enabled` / `batch_size`: trusted SQL only (runbook).
Worker contract (W9 unchanged): only `accepted|active -> expired` (system; end date before Manila today) by the batch; terminated / declined / expired rows are
never touched; a worker decline / terminate is never refused, and waits at most one batch for a pair lock (J16).
Relationship (W10 unchanged): status recomputed by `refresh_worker_owner_relationship`; no notification (D-59).
Notification (W3 unchanged): `unread -> read` by the recipient only. Registry rows: changed only by migrations / trusted SQL.
Refused for everyone: client access to the registry, job state, runner and batch functions (incl. service_role); two jobs in one transaction; a date on the
scheduled path (no parameter exists); `external_delivery <> 'never'`; an unregistered category, key prefix or subject type.

## 5. Decisions taken in this plan (RECORD adds them to DECISIONS.md as ADOPTED-DEFAULT (loop, <date>))
- D-59 Relationship notices (D-39): none. The worker progress card shows live state; contract and verification events already notify; consistent with D-23.
- D-60 Newer standard template (D-30): no notice; owners keep the live "A newer standard template is available" flag (avoids a fan-out to every owner).
- D-61 Channels: in-app only; `external_delivery` fixed to `never` by CHECK. Email / SMS / push need human-provisioned credentials, per-channel consent records
  and legal review (W3-L2). Documented hook: a later reviewed migration widens the CHECK for named categories and adds an outbox filled by an AFTER INSERT trigger
  on `notifications`, carrying title + fixed body only. `frontend/smtp-test.*` stay untouched and unused.
- D-62 Realtime: keep 60 s polling; no Realtime Broadcast until production Realtime / RLS settings are known (D-10).
- D-63 Scheduler: pg_cron (present locally); migrations register nothing; HUMAN-RUN register / unregister scripts; schedules in 3.6 (UTC).
- D-64 The scheduled path takes no date; the W7 / W9 / W10 functions keep their test-clock parameter, internal only; never called with a date in production.
- D-65 Batching: one job per transaction; skip / try-lock / nowait; batch sizes 25 (contracts) and 50 (relationships), 1..200 via trusted SQL; skipped retried.
- D-66 De-duplication rules: P81 plus the cross-event pairs in test 2; on the first production run the backlog sends each true notice once.
- D-67 W5 R2: closing an opening keeps enqueuing up to 500 applicant notices inside the owner transaction (bounded by the W5 cap); no batching.
- D-68 Inbox: area chips, unread / area filters, "Load older" 50 per page; no deep links into tabs (tab state is not addressable; W13 may add).
- D-69 Interview scheduling notices: none; no interview feature exists. Application status and training schedule notices cover spec I.

## 6. Tests (pgTAP `plan(n)` = actual; 0 `todo_start(`; each file <= 350 lines; existing files unchanged except replay)
Helpers: NEW `scripts/supabase-test/baseline/test_helpers_scheduling.sql` (8th `HELPERS_SOURCE_NAMES` entry; update `stager_seeds_every_helper_file_in_order`;
stager still 19 pass): `backdate_test_worker_contract(p_contract, p_days)` (TEST-ONLY, the W7 / W11 technique: disable the W9 guard for one statement inside the
test transaction and shift start / end dates), `hold_lock_in_second_session(p_key bigint)` / `release_second_session()` (TEST-ONLY dblink to the local DB, the
extension created inside the test transaction), `notification_marker()` = `ZQXW12PRIVATE`. No helper writes the registry, job state or notifications directly.
1. `j17_w12_notification_registry.test.sql`: w12_registry_has_37_categories_matching_producers, w12_external_delivery_is_never_and_check_refuses_other,
   w12_unregistered_category_refused_23514, w12_wrong_key_prefix_refused_23514, w12_wrong_subject_type_refused_23514,
   w12_safe_enqueue_skips_unregistered_and_action_succeeds, w12_registry_trigger_runs_after_writer_guard, w12_registry_not_client_readable_or_writable,
   w12_registry_changed_only_by_trusted_sql, w12_registry_not_in_realtime, w12_w4_w8_w10_actions_notify_nobody.
2. `j17_w12_notification_dedup.test.sql`: w12_at_most_one_notice_per_recipient_per_audit_event (last key segment = audit id),
   w12_washlink_reinstate_sends_review_decided_only, w12_owner_review_reinstate_sends_review_decided_only, w12_termination_with_open_amendment_one_notice_per_party,
   w12_scheduled_expiry_with_open_amendment_one_notice_per_party, w12_washlink_close_owner_one_applicants_one_each, w12_relationship_change_sends_no_extra_notice,
   w12_superseded_certificate_gets_no_expiry_notice, w12_expiry_due_then_expired_once_each, w12_repeated_runs_create_nothing_new, w12_mark_read_never_resends.
3. `j17_w12_notification_privacy.test.sql`: the marker goes into worker / owner full names, cover note, training notes, suspension / revocation reasons, review
   and dispute statements, contract clause text, decline note, termination reason, report statement, owner message, admin note; then
   w12_no_notification_contains_marker, w12_no_notification_has_at_sign_or_phone_shape, w12_labels_only_from_allow_list, w12_notification_columns_have_no_payload,
   w12_recipient_reads_only_own_notifications.
4. `j13_w12_scheduled_jobs.test.sql`: w12_contract_expiry_job_expires_past_end_and_notifies_each_party_once, w12_expired_contract_stops_counting (J15),
   w12_contract_expiry_ignores_terminated_declined_and_future, w12_certification_notice_job_sends_due_and_expired, w12_relationship_refresh_cursor_walks_all_pairs,
   w12_relationship_refresh_pass_completed_resets_cursor, w12_disabled_job_does_nothing, w12_one_job_per_transaction_55000, w12_runner_has_no_date_parameter,
   w12_batch_limit_bounds_22023, w12_job_state_updated_and_audited_without_ids, w12_runner_refused_for_authenticated_and_service_role_jwt.
5. `j16_w12_scheduler_locking.test.sql` (dblink): w12_pair_try_lock_key_collides_with_w10_lock, w12_contract_skipped_while_pair_locked_then_expired,
   w12_relationship_skipped_while_pair_locked, w12_job_already_running_writes_nothing, w12_worker_terminate_and_decline_succeed_after_runs (J16).
6. `j17_w12_scheduler_authorization.test.sql`: j17_w12_tables_rls_enabled_no_client_privileges, j17_w12_internal_functions_not_client_executable,
   j17_w12_admin_scheduled_jobs_super_admin_only, j17_w12_admin_read_has_no_ids_or_names, j17_w12_definer_functions_pin_pg_temp_last,
   j17_w12_no_migration_creates_extension_or_cron_job (no `pg_cron` in `pg_extension` after replay), j17_w12_state_guard_refuses_direct_update.
7. `j18_w12_flows.test.sql`: j18_w12_w3_to_w14_notice_counts_unchanged_for_each_flow, j18_w12_booking_quote_rating_and_verification_unchanged,
   j18_w12_mark_notifications_read_unchanged, j18_w12_raw_w7_w9_w10_functions_still_internal_and_accept_test_clock.
Changed existing file (only this): `001_migration_replay.test.sql` (92 migrations, + 20261030000001..05; rename `replay_schema_migrations_has_baseline_w2_to_w14`
-> `replay_schema_migrations_has_baseline_w2_to_w14_and_w12`; add `replay_w12_registry_and_job_state_rls_enabled`).
Smoke `scripts/supabase-test/w12-api-smoke.mjs` (W14 rules: loopback only, keys from local `supabase status` in memory, `smoke12-*@local.test` users deleted and
asserted, no `.env`; TEST-ONLY `docker exec supabase_db_<project_id> psql`): registry / job state select, insert, patch, delete denied for anon, owner, worker,
super_admin, service_role; `run_workforce_scheduled_job`, both batch functions, `worker_owner_pair_try_lock`, `enqueue_notification`, `set_config` not callable
through PostgREST; owner sends / worker accepts / owner activates a contract through PostgREST -> exactly one notice per step to the right party, no marker
text; TEST-ONLY backdate, runner via psql expires it, each party one notice, second run nothing; certification notice run; `admin_workforce_scheduled_jobs`
super_admin only, no id columns; the register script inside `begin; ... rollback;` registers exactly 3 `washlink_workforce_%` jobs, after rollback 0 jobs and no
`pg_cron` extension remain; notifications not in `supabase_realtime`; mark-read works. Must end `0 failed`.
Vitest (mocked): w12_every_registered_category_has_an_area (reads the w12b migration file), w12_unknown_category_shows_other_area, w12_inbox_unread_only_filter,
w12_inbox_area_filter, w12_inbox_load_older_uses_keyset_and_dedupes, w12_repository_selects_no_subject_or_key_columns, w12_list_item_area_chip_plain_text,
w12_admin_scheduled_jobs_card_states, w12_scheduled_jobs_card_says_registration_is_a_human_step, j17_w12_repositories_use_rpcs_or_recipient_reads_only.
The existing 263 stay green unchanged.

## 7. Frontend (UI -> hooks -> services -> repositories -> Supabase; each file <= 350 lines) and docs
Add: `domain/utilities/notificationAreas.ts` (pure: category -> area `applications`, `job_openings`, `training`, `certifications`, `contracts`, `shop`, `roster`,
`washlink_reviews`, `other`); `domain/models/WorkforceScheduledJob.ts`; `domain/repositories/ScheduledJobRepository.ts`;
`infrastructure/repositories/SupabaseScheduledJobRepository.ts` (RPC `admin_workforce_scheduled_jobs` only); `application/services/ScheduledJobService.ts`;
`presentation/hooks/useWorkforceScheduledJobs.ts`; `presentation/utilities/{notificationAreaCopy, scheduledJobCopy}.ts` (e.g. "Scheduled jobs are not running
yet. A person must approve and register them."; "Expired contracts are shown from their end date even before this job records them.");
`presentation/components/notifications/NotificationFilterBar.tsx`; `presentation/components/superAdmin/ScheduledJobsCard.tsx`.
Change: `domain/models/AppNotification.ts` (+ `area`); `domain/repositories/NotificationRepository.ts` and `infrastructure/repositories/
SupabaseNotificationRepository.ts` (`listMyNotifications(limit, before?)` keyset on created_at, id; same select columns); `application/services/
NotificationService.ts`; `presentation/hooks/useNotifications.ts` (load older, filters; now 216 lines); `notifications/{NotificationPanel,
NotificationListItem}.tsx`; `superAdmin/AdminOverviewPanel.tsx` (card); `dependencyInjection/createSuperAdminDependencies.ts`. States: `Skeleton`, `EmptyState`,
`LoadErrorNotice`. Unchanged on purpose: every W4-W14 feature component, `NotificationBell.tsx`, the polling interval.
Docs: add `docs/workforce/NOTIFICATIONS_AND_SCHEDULING.md` (P80-P85, D-59..D-69, the 37-category catalogue with recipients / keys / de-dup pairs, the "none"
events, scheduler design, **Runbook**: approval, register, check `cron.job_run_details`, pause via `enabled`, unregister before rollback, never call the raw
functions with a date; external-channel hook spec; limitations; rollback). Update `AUDIT_AND_NOTIFICATIONS.md` (line 134 pointer only; file at 350),
`CERTIFICATIONS.md`, `WORKER_CONTRACTS.md`, `OWNER_RELATIONSHIPS.md` (scheduled; D-59), `LOCAL_TEST_HARNESS.md` (92 migrations, 8th helper, dblink, W12 smoke),
`ROLE_AND_PROFILE_SECURITY.md` (new D-10 rows 49-51: w12a preflight; registry trigger order on `notifications`; production pg_cron registration is a human gate),
`LEGAL_REVIEW_REGISTER.md` (W12-L1..L8; notes on W3-L2, W7-L10). RECORD: W12 smoke row in LOOP.md, D-59..D-69 in DECISIONS.md.

## 8. Acceptance criteria (repo root, local only: `cd frontend && npm run lint / build / test`; `backend/.venv/Scripts/python.exe -m pytest -q`; `node --test scripts/supabase-test/stage-local-workdir.test.mjs`; `node scripts/supabase-test/run-db-tests.mjs`; `w2-`..`w11-`, `w14-`, then `w12-api-smoke.mjs`; never `--linked`, `--db-url`, `db push`, `.env`)
| AC | Criterion | Evidence |
|---|---|---|
| AC1 | 5 new migrations `2026_10_30_w12[a-e]_<snake>.sql`, each with `-- ROLLBACK`; nothing committed changed | `ls supabase/migrations/2026_10_30_w12*`; `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_30_w12*` empty; `git diff --name-status 8c84bf8 -- supabase/migrations` only `A` |
| AC2 | Clean replay of 92 migrations; PASS; 0 TODO | runner `Result: PASS`; `replay_schema_migrations_has_baseline_w2_to_w14_and_w12`, `replay_w12_registry_and_job_state_rls_enabled`; `grep -c "todo_start(" supabase/tests/database/*.sql` all 0 |
| AC3 | One consistent path: every notice matches the registry; external delivery never | every name in `j17_w12_notification_registry`; Vitest `w12_every_registered_category_has_an_area` |
| AC4 | No duplicates within or across events, incl. repeated scheduler runs | every name in `j17_w12_notification_dedup`; smoke "second run nothing" check |
| AC5 | No private-text leak in any notice | every name in `j17_w12_notification_privacy`; smoke marker check; Vitest `w12_repository_selects_no_subject_or_key_columns` |
| AC6 | Scheduled jobs correct and safe: no date parameter, separate jobs, batches, never waiting (W10 S2 / S3 / C8) | every name in `j13_w12_scheduled_jobs` and `j16_w12_scheduler_locking` |
| AC7 | No production registration: migrations create no extension or cron job; scripts are human-run, verified only in a rolled-back local transaction | `j17_w12_no_migration_creates_extension_or_cron_job`; `grep -rniE "pg_cron|cron\.schedule" supabase/migrations` empty; smoke register-rollback check; `head -5 scripts/supabase-scheduling/register_workforce_jobs.sql` shows HUMAN-RUN |
| AC8 | J17 on W12 objects | every name in `j17_w12_scheduler_authorization`; `w12-api-smoke.mjs` ends `0 failed`; W2-W11, W14 smokes `0 failed` |
| AC9 | J13 / J15 / J16 hold after scheduling | `w12_expired_contract_stops_counting`, `w12_worker_terminate_and_decline_succeed_after_runs`; every pre-W12 `j13_*`..`j16_*` file `ok` |
| AC10 | J18; no producer and no W7 / W9 / W10 body replaced | every name in `j18_w12_flows`; `grep -nE "create or replace function public\.(enqueue_notification|enqueue_certification|expire_worker_contracts\(|refresh_worker_owner_relationships?\(|[a-z_]+_audit\()" supabase/migrations/2026_10_30_w12*` empty; `git diff --stat 8c84bf8 -- supabase/tests/database` only new files + `001_migration_replay.test.sql`; pytest `4 passed`; stager 19 pass |
| AC11 | Frontend inbox and admin card | every section-6 Vitest name and the existing 263 pass; lint and build exit 0; `grep -rn "service_role" frontend/src` empty |
| AC12 | Size, safety, docs, legal | `wc -l` of every added / changed code and doc file <= 350; no `.env` read; `git diff --stat 8c84bf8 -- backend frontend/smtp-test.js frontend/smtp-test.cjs` empty; `grep -n "Runbook" docs/workforce/NOTIFICATIONS_AND_SCHEDULING.md`; `grep -c "W12-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` >= 8 |

## 9. Rollback, risks and legal-review flags
Rollback (local only; wherever the jobs were registered, a human runs `unregister_workforce_jobs.sql` FIRST, else cron calls a missing function): e runner +
admin read; d batch functions + pair try-lock; c job state table (history loss only); b registry trigger, then table (notices are unchecked again; rows stay);
a nothing. Stager: drop the 8th helper. Frontend: revert. Contracts already expired by the job stay expired (true records, D-40 forward-only).
Risks: R1 production drift (D-10): the registry trigger must sort after `notifications_guard_insert`; a production category missing from the seed makes its
notices silently skipped (w12a NOTICE lists existing categories; test 1 fixes the seed). R2 a future producer that forgets the registry loses notices quietly
(WARNING only); per-increment count tests and the registry test catch it. R3 the pair try-lock copies the w10e key expression; a later w10e change must change
both (test 5 detects divergence). R4 dblink in pgTAP needs the local default credentials inside the container; if the harness blocks it, test 5 moves to the
smoke with two `docker exec psql` sessions (same names). R5 the first production run sends a backlog of true "expired" notices and records past-end contracts as
expired at once. R6 pg_cron runs as the database owner; audit shows `system` / `trusted_session`, not a person. R7 polling stays up to 60 s late (D-62). R8
`enqueue_certification_expiry_notices` is unbatched (bounded by active certificates within 30 days). R9 `AUDIT_AND_NOTIFICATIONS.md` is at 350 lines.
Legal (to `LEGAL_REVIEW_REGISTER.md`, all OPEN; nothing in UI or docs claims a worker was legally notified or warned, or that a contract legally ended):
- W12-L1 in-app only (D-61): whether offers, termination, expiry or certificate revocation need notice through a durable or external channel; consent per channel
  and minimum content before any email / SMS / push (RA 10173; extends W3-L2).
- W12-L2 scheduled expiry records `expired` by `system` from the end date; the legal end of work is set by the contract and law, not by this record.
- W12-L3 one 30-day certificate expiry notice plus one on expiry (W7-L10): whether earlier or more warnings are needed when expiry blocks applications (D-20).
- W12-L4 until a human registers the jobs, no expiry notices are sent and expiry is only derived; the product must not say workers were warned.
- W12-L5 no notice when a relationship stops counting (D-59) or a shop loses verification (D-23): transparency about the informational count.
- W12-L6 notification retention after account deletion (W3-L1): notices are deleted with the recipient; no retention period defined (W13).
- W12-L7 owner-authored labels (shop name, opening title, program title) appear in worker notices; offensive labels rely on W14 reports.
- W12-L8 backlog notices on the first production run (R5) and the Asia/Manila date used for contract expiry for workers in other time zones.
