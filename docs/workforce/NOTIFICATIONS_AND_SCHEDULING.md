# Notification wiring and scheduled workforce jobs (W12)

Spec I (notify the right parties; no duplicates; no private contract details on insecure channels; audit trail), F
(relationship counting stays correct over time); journeys J13-J18. Local Docker proof only (D-10): nothing here was
applied to a linked or production project, and **no scheduled job has been registered anywhere**. The database part
describes the w12a..w12e migrations as built (W12 LOG "BUILD (DB)" D1..D14, "FIX CYCLE 1 (DB)", "Not verified"); the
frontend part the built files ("BUILD (frontend)" F1..F6, "FIX CYCLE 1 (frontend)"). Legal: `LEGAL_REVIEW_REGISTER.md` W12-L1..L8, all OPEN.

**A notice is an in-app message, not a legal notice.** Nothing in WashLink states that a worker or owner was legally
notified, warned or served, that a contract legally ended when the scheduler recorded it as expired, or that any feature
is compliant.

Migrations (staged `20261030000001..05`; 92 staged migrations in total; each <= 350 lines with a commented `-- ROLLBACK`
block; no committed migration changed; no W3..W14 producer and no W7 / W9 / W10 function body replaced; no migration
creates an extension or registers a cron job): `2026_10_30_w12a_notification_wiring_preflight.sql` (creates nothing),
`w12b_notification_category_registry.sql`, `w12c_workforce_scheduled_jobs.sql`, `w12d_scheduled_job_batches.sql`,
`w12e_scheduled_job_runner_and_reads.sql`. Nine functions carry a `W12:` comment (all SECURITY DEFINER with
`search_path = public, pg_temp`, D14); one is a client RPC (`admin_workforce_scheduled_jobs`, `authenticated` only), the
other eight are internal (revoked from `public`, `anon`, `authenticated` and `service_role`). Human-run scripts (NOT
migrations): `scripts/supabase-scheduling/register_workforce_jobs.sql` and `unregister_workforce_jobs.sql` (Runbook below).

## Principles (P80-P85, continue P1-P79)

- **P80** One path: every notification row is written by `enqueue_notification` (definer producer or trusted SQL) AND
  matches a registry row: the category exists, `idempotency_key` starts with one of its `key_prefixes` + `:`, and
  `subject_type` is one of its `subject_types` (or both are null). Violation = 23514, so `enqueue_notification_safely`
  skips the notice with a WARNING and the business action still succeeds (P14 unchanged).
- **P81** De-duplication: per-event keys end with the audit event id (at most one notice per recipient per event);
  time-driven keys are state-based (`certification_expiry:<id>:due|expired`; contract expiry fires once because the
  status changes once); re-runs create nothing; cross-event pairs below (D-66).
- **P82** Notification text = fixed copy + labels from an allow-list only: shop name, opening title, program title
  (owner-authored, already visible to the recipient) and the owner's own roster label. Never the other person's name,
  statements, reasons, notes, cover notes, contract text, pay, dates or contacts.
- **P83** The scheduled path never takes a date: the runner uses the database clock (Manila date for contracts). The raw
  W7 / W9 / W10 functions keep their test-clock parameter, stay revoked from every client role, and the runbook forbids
  calling them with a date in production.
- **P84** Never wait, never mix: one job per transaction; job try-lock; candidates read without a row lock; per item, in
  its own subtransaction, the W10 pair lock is tried first, then the contract row `FOR UPDATE SKIP LOCKED` and its
  versions `FOR UPDATE NOWAIT` (fix cycle 1 N3); `lock_timeout` 1 s local backstop; batch 1..200. A busy or failing item
  is skipped, holds no lock, and is retried on the next pass (N4; bound and skip rules below).
- **P85** Registration is human: migrations create no extension and no cron job; the scripts in
  `scripts/supabase-scheduling/` are HUMAN-RUN and live outside `supabase/migrations/`.

## Decisions (W12 PLAN section 5; RECORD adds them to DECISIONS.md as ADOPTED-DEFAULT)

- D-59 Relationship changes notify nobody (closes D-39): the worker progress card shows live state; contract and
  verification events already notify.
- D-60 A newer standard template notifies nobody (closes the D-30 question): owners keep the live "A newer standard
  template is available" flag.
- D-61 Channels: in-app only; `external_delivery` fixed to `never` by CHECK (hook below).
- D-62 Realtime: keep 60 s polling (W3); no Realtime Broadcast until production Realtime / RLS settings are known (D-10).
- D-63 Scheduler: pg_cron; migrations register nothing; HUMAN-RUN register / unregister scripts; schedules in UTC.
- D-64 The scheduled path takes no date; the W7 / W9 / W10 functions keep their test-clock parameter, internal only.
- D-65 Batching: one job per transaction; skip / try-lock / nowait; batch sizes 25 (contracts) and 50 (relationships),
  1..200 via trusted SQL; skipped (busy) and failed items retried on the next pass, behind a cursor (fix cycle 1).
- D-66 De-duplication rules: P81 plus the cross-event pairs below; on the first production run the backlog sends each
  true notice once.
- D-67 Closing an opening keeps enqueuing up to 500 applicant notices inside the owner transaction (bounded by the W5
  cap; closes W5 PLAN R2 without batching).
- D-68 Inbox: area chips, unread / area filters, "Load older" 50 per page; no deep links into dashboard tabs.
- D-69 No interview-scheduling notices: no interview feature exists.

## Category registry (w12b)

`notification_categories`: `id uuid` PK (D1: `category` is `NOT NULL UNIQUE`, not the planned text PK), `category`
(same shape as `notifications_category_check`), `source_increment` (`^W[0-9]{1,2}$`), `key_prefixes text[]` (1..4,
`^[a-z_]+$`), `subject_types text[]` (null = notice without subject), `recipient_kind` (`owner`, `worker`, `trainer`,
`reporter`, `either_party`), `external_delivery` (default and CHECK `= 'never'`), `description` (1..200), `created_at`,
`updated_at`. RLS on, deny-all select / insert / update / delete policies, `revoke all` from `public`, `anon`,
`authenticated` and `service_role` (a client gets 42501 `permission denied`); never in `supabase_realtime` (w12b aborts on
a FOR ALL TABLES publication). Guard `notification_categories_guard_write` (rows and TRUNCATE): only a trusted session
without `auth.uid()` and without a service_role JWT may change it, else 42501 `The notification registry is changed only
by migrations.` The seed is an upsert (re-running w12b updates changed rows, never duplicates).

Insert guard `notifications_guard_registered_category` (BEFORE INSERT on `notifications`; sorts after the W3
`notifications_guard_insert`, so the W3 writer check (42501) fires first): checks P80, raising 23514 `W12: notification
category or key is not registered.` It never touches existing rows. D2: a repeat of an EXISTING `(recipient_id,
idempotency_key)` passes the trigger and is left to the W3 unique constraint (`ON CONFLICT DO NOTHING` returns the old
row; a plain insert fails 23505), because BEFORE triggers fire before ON CONFLICT; an unregistered row can still never
be written. After the seed, w12b raises a NOTICE (no abort) listing existing `notifications.category` values that are
not in the registry (D4; production rows stay, but new notices of such a category would be skipped).

The 37 categories (key prefix in brackets; per-event keys end with the audit event id):

| Increment | Category -> recipient |
|---|---|
| W3 | `shop_verification.status_changed` -> owner [`shop_verification`]; `roster.linked` -> owner, `roster.unlinked` -> either party [`roster_link`] |
| W5 | `job_application.submitted`, `.withdrawn` -> owner; `.status_changed`, `.closed` -> worker; `.removed` -> either party [`job_application`]; `job_opening.paused` -> worker [`job_opening`] |
| W6 | `training.schedule_changed` -> worker [`training_schedule`]; `.trainer_role` -> trainer [`training_trainer`]; `.invited` -> worker [`training_invite`]; `.response` -> owner [`training_response`]; `.cancelled` -> worker [`training_cancel`]; `.record_corrected` -> worker [`training_attendance`, `training_assessment`]; `.assessment` -> either party [`training_assessment`] |
| W7 | `certification.issued`, `.renewed`, `.suspended`, `.revoked`, `.reinstated`, `.review_decided` -> worker; `.review_requested`, `.training_record_changed` -> owner [`certification`]; `.expiring`, `.expired` -> worker [`certification_expiry`] |
| W9 | `worker_contract` -> either party [`worker_contract`] |
| W11 | `certification_platform_review.opened` -> owner, `.decided` -> either party [`certification_platform_review`]; `worker_contract_dispute.raised`, `.closed` -> either party [`contract_dispute`] |
| W14 | `job_opening_moderation.paused`, `.closed`, `.pause_kept`, `.lifted` -> owner [`job_opening_moderation`]; `job_opening_report.closed` -> reporter [`job_opening_report`]; `shop_verification.rereviewed` -> owner [`shop_rereview`] |

Texts per event are in `AUDIT_AND_NOTIFICATIONS.md` (W3..W9), `DASHBOARDS_AND_OVERSIGHT.md` (W11) and
`PLATFORM_MODERATION_AND_AUDIT.md` (W14). Events that notify **nobody** by decision: every W4 job-opening action, every W8
template action (D-30, D-60), every W10 relationship change (D-39, D-59), trusted SQL repairs and cascades (W3 rule),
audited admin reads (case views, lookups, log searches), W14 report filing, interviews (none exist, D-69).

D3 (local only): the unchanged W3 test `j17_w3_notifications` enqueues the synthetic categories `test.notice`,
`test.dup` and `test.text` (prefix `test`, no subject). They are registered by a plain INSERT, as a trusted session, in
the local seed `scripts/supabase-test/baseline/test_helpers_scheduling.sql`; no migration writes them and production never
has them. `j17_w12_notification_registry` counts 37 rows excluding `test.%`.

R1 / R2 guard (`j17_w12_notification_registry`): it scans the body of every function that calls
`enqueue_notification(_safely)(` for literal categories, `'family.' || ...` families, `category := case ... end` literals
and key prefixes, and fails if one is missing from the registry or if a registry row has no producer. It also compares
all 37 rows with a fixed list. A future producer that forgets the registry therefore fails that test instead of quietly
losing notices in production (where the skip is only a WARNING).

## De-duplication rules (D-66)

- Within an event: one notice per recipient per audit event (key ends with the audit event id;
  `w12_at_most_one_notice_per_recipient_per_audit_event`).
- Time-driven: `certification_expiry:<id>:due` and `:expired` are each written once; a superseded certificate gets none;
  contract expiry notifies each party once because the W9 status change happens once.
- Cross-event pairs (already suppressed in the existing producers; W12 proves them, `j17_w12_notification_dedup`):
  a WashLink or owner review reinstatement sends only the review decision (no extra `certification.reinstated`); a
  termination or scheduled expiry with an open amendment sends one notice per party (no "withdrawn"); a WashLink close
  sends the owner one notice and each applicant only the W5 `job_application.closed`; a relationship change sends nothing.
- Re-runs: repeated scheduler runs create nothing new; a notice marked read is never sent again.

## Privacy guarantees (P82)

`j17_w12_notification_privacy` puts a marker (`test_helpers.notification_marker()` = `ZQXW12PRIVATE`) into worker and
owner full names, a cover note, training notes, suspension / revocation reasons, review and dispute statements, review
decision reasons, contract clause text and pay, a decline note, a termination reason, a report statement, the WashLink
owner message, the admin note and a dispute closing note, runs every event through its real RPC, then proves: no notice
contains the marker, an `@` or a phone-shaped run; dynamic labels come only from the allow-list; `notifications` has no
payload column; a recipient reads only their own notices. The inbox never selects `subject_type`, `subject_id` or
`idempotency_key`. The registry and the job state are not readable by any client.

## Channels: in-app only, with a documented external-delivery hook (D-61, D-62)

Only the in-app inbox exists. `external_delivery` is `never` for every category, enforced by CHECK, and the insert guard
also refuses a row whose category is not `never`. No email, SMS or push path exists in the app; the standalone
`frontend/smtp-test.{js,cjs}` scripts stay untouched and unused. Delivery stays 60 s polling plus focus (up to 60 s late);
no table is added to `supabase_realtime`.

Hook for a later, separately reviewed increment (NOT built): (1) human-provisioned credentials, a per-channel consent
record and legal review (W3-L2, W12-L1) come first; (2) a reviewed migration widens the CHECK for named categories only;
(3) an outbox table filled by an AFTER INSERT trigger on `notifications` carries the title and fixed body only (never
subject ids, keys or any private text); (4) a sender outside the database reads the outbox. Contract text, pay terms and
contact data never leave the app.

## Scheduler design (w12c..w12e)

**Job state** `workforce_scheduled_jobs` (D1: `id uuid` PK, `job_key` `NOT NULL UNIQUE`): one seeded row per job
(`certification_expiry_notices` batch 200, ignored; `worker_contract_expiry` 25; `owner_relationship_refresh` 50);
`enabled`, `batch_size` 1..200, `cursor_worker_id` / `cursor_owner_id` (refresh; both null or both set, no FK),
`cursor_contract_id` (contract expiry only, no FK), `last_started_at`, `last_finished_at`, `last_outcome` (`completed` |
`disabled`), last processed / changed / skipped-locked / skipped-failed counts, `last_failed_sqlstates` (at most 10
distinct 5-character SQLSTATE codes, CHECK), `last_pass_completed_at`, `run_count`, `updated_at`. RLS on, deny-all, no grants, never in
Realtime. Guard (every session, rows and TRUNCATE): DELETE and TRUNCATE refused; INSERT only by a trusted session under
`washlink.scheduled_job_state_write = 'seed:<job_key>'`, which only w12c uses (D12); UPDATE only by a trusted session,
either under that flag = the job key (the runner; trusted required since fix cycle 1 N2) or changing nothing but
`enabled` / `batch_size` (runbook); else 42501
`Scheduled job state is written only by the runner.`

**Batch functions** (w12d; internal; no date parameter):
- `worker_owner_pair_try_lock(p_worker, p_owner)`: `pg_try_advisory_xact_lock` on the exact w10e key expression
  `hashtextextended('w10:' || worker || ':' || owner, 0)`; true when either id is null. R3: a later w10e change must
  change both; `j16_w12_scheduler_locking` checks the two expressions are identical.
- `expire_worker_contracts_batch(p_after_contract, p_limit)`: Manila today; candidates `status in (accepted, active) and
  end_date < today` with id after the cursor, ordered by id, `limit p_limit`, read WITHOUT a row lock. Per candidate, in
  its own subtransaction: pair try-lock (busy -> 55P03), then the row `FOR UPDATE SKIP LOCKED` (busy -> 55P03; no longer
  due -> dropped silently), the versions `FOR UPDATE NOWAIT`, the W9 write flag, `worker_contract_close_open_versions`,
  and the same update as w9g (`expired`, `ended_at now()`, `ended_by 'system'`, `pending_version_id null`). The W9
  producers audit and notify each party once; the W10 sync trigger refreshes the pair (re-entrant). Returns processed,
  skipped_locked, skipped_failed, failed_sqlstates, the last contract looked at, `pass_completed` and remaining.
- `refresh_worker_owner_relationships_batch(p_after_worker, p_after_owner, p_limit)`: distinct pairs with an accepted
  contract after the cursor, in `(worker_id, owner_id)` order, at most `p_limit`; per pair, in its own subtransaction,
  try-lock (busy -> 55P03) and `refresh_worker_owner_relationship(w, o)` with its default date. Returns processed,
  changed, skipped_locked, skipped_failed, failed_sqlstates, the last pair and `pass_completed`.
- **Skip rules (fix cycle 1 N4).** 55P03 (busy pair, busy row, or any lock that hits `lock_timeout`) -> skipped_locked.
  Any other error of one item (`others`) -> skipped_failed, and only its SQLSTATE is kept (at most 10 distinct codes;
  no ids, no message text). Either way the subtransaction rolls back: nothing of that item is written and every lock it
  took is released. Both cursors move past every item looked at, so the rest of the backlog is processed; a busy or
  failing item is retried once per pass (when the cursor wraps), never blocking the items after it. `pass_completed`
  when fewer than `p_limit` candidates were left after the cursor; the runner then resets the cursor.
- Batch size outside 1..200: 22023 `Batch size must be between 1 and 200.`

**Runner** `run_workforce_scheduled_job(p_job text) returns jsonb` (w12e) is the **only scheduled entry point**. It
takes no date and no batch parameter. Steps: refuse unless `auth.uid()` is null, `is_trusted_db_session()` and the JWT
role is not `service_role` (42501 `Scheduled jobs run only from a trusted database session.`); unknown job 22023
`Unknown scheduled job.` (D5); flag `washlink.scheduled_job` already set -> 55000 `W12: one scheduled job per
transaction.`; set the flag and `lock_timeout = 1s` (local); job try-lock `hashtextextended('w12:job:<key>', 0)` (busy ->
`already_running`, nothing written); state row `FOR UPDATE NOWAIT` (a runbook UPDATE holding it -> `already_running`,
D6); missing row 22023 `Scheduled job state is missing.` (D5). A disabled job records `disabled`. Otherwise: notices ->
`enqueue_certification_expiry_notices(now())`; contracts and relationships -> their batch from the stored cursor, which
is reset to null when a pass completes (`last_pass_completed_at = now()`). It then updates the state row under the flag
and, when processed + changed + skipped + failed > 0, audits `workforce_scheduled_job.ran` (subject_type
`workforce_scheduled_job`, `subject_id` and `subject_profile_id` null, D7; payload `job_key`, `processed_count`,
`changed_count`, `skipped_locked_count`, `skipped_failed_count`, `failed_sqlstates`, `pass_completed`, `changed_by =
system`; `actor_kind = trusted_session`). Returns `{job, outcome: completed | disabled | already_running, processed,
changed, skipped_locked, skipped_failed, failed_sqlstates, remaining}` (outcome values unchanged; a run with failed items
is still `completed`). For the
notices job processed = changed = new notices, and `remaining` is the pending backlog after the run; it is null for the
relationship refresh (D8). `already_running` is returned, never stored.

**How this closes W10 REVIEW S2 / S3 / C8.** S2 / C8 (bulk refresh holds blocking pair locks in one long transaction and
could make a worker's terminate or decline wait): the scheduled path never calls the bulk
`refresh_worker_owner_relationships(date)` or `expire_worker_contracts(date)`; it processes small batches, try-locks
each pair, skips busy rows and retries them next run, so the scheduler never waits (`w12_worker_terminate_and_decline_succeed_after_runs`).
**Worker wait bound (fix cycle 1 N3).** A worker or owner action never waits for an item the run skipped or failed (its
subtransaction released what it took) nor for an item the run has not reached (the run try-locks it and skips it if the
worker holds it). It waits only when it touches an item this run has already locked (that contract row, or that pair's
W10 lock), and then only until this run commits. Each item waits at most `lock_timeout` (1 s) on any incidental lock, a
run handles at most `batch_size` items (25 / 50), and runs are one transaction each. S3 (a future `p_as_of` could pre-expire or mis-count): the runner
has no date parameter (`w12_runner_has_no_date_parameter`), and the raw functions remain internal test-clock tools. C8
(keep expiry separate from refresh): they are separate jobs, never in the same transaction (55000).

**Pending backlog** `workforce_scheduled_job_pending(p_job)` (internal): contracts accepted / active with a Manila end
date passed but not recorded expired; active certificates expiring within 30 days that still lack their due / expired
notice; null for the relationship refresh.

**super_admin read** `admin_workforce_scheduled_jobs()`: stable, `authenticated` only (anon and service_role 42501). A
super_admin gets 3 rows (notices, contracts, relationships, in that order): `job_key, enabled, batch_size,
last_started_at, last_finished_at, last_outcome, last_processed_count, last_changed_count, last_skipped_locked_count,
last_pass_completed_at, run_count, pending_count, last_skipped_failed_count, last_failed_sqlstates` (the last two added
at the end in fix cycle 1). Every other signed-in role gets 0 rows (no error). No ids, names, cursor or contract data;
not audited. "Never ran" = `run_count = 0` and `last_started_at` null.

## Runbook: registering the scheduled jobs (HUMAN-RUN ONLY)

The loop never registers jobs outside the local stack, and **a migration never registers a cron job or creates the
pg_cron extension** (`grep -rniE "pg_cron|cron\.schedule" supabase/migrations` is empty;
`j17_w12_no_migration_creates_extension_or_cron_job`). Until a person completes these steps, no expiry notice is sent,
contract expiry is only derived on read, and relationship rows refresh only through the W10 sync triggers (W12-L4).

1. **Approval.** The project owner approves in writing, after: the W12 migrations are applied through the normal reviewed
   path, the D-10 rows 49-52 (`ROLE_AND_PROFILE_SECURITY.md`) are answered, and the backlog is understood (step 3). The
   person running the script records who approved, when, and on which project.
2. **Pre-checks** (trusted SQL, read-only): `select * from public.workforce_scheduled_jobs;` shows 3 rows;
   `select jobid, jobname, username from cron.job where jobname like 'washlink\_%';` (if `cron` exists) is empty or
   known. Before the W12 migrations are applied (D-10 row 52): `select pubname, puballtables from pg_publication where
   pubname = 'supabase_realtime';` must return no row or `puballtables = false` (w12b / w12c abort otherwise).
3. **Backlog check.** As a super_admin, the Overview card (or `admin_workforce_scheduled_jobs()`) shows `pending_count`.
   The first run records every past-end contract as expired and sends each true due / expired notice once (R5, W12-L8).
   To soften the first contract run, pause it first: `update public.workforce_scheduled_jobs set enabled = false where
   job_key = 'worker_contract_expiry';` (allowed only for `enabled` / `batch_size`), then re-enable it later.
4. **Register.** In the SQL editor (or psql) of the approved project, as `postgres` (run both scripts as the same role), run
   `scripts/supabase-scheduling/register_workforce_jobs.sql`. It runs `create extension if not exists pg_cron` and three
   `cron.schedule` calls (UTC): `washlink_workforce_certification_expiry_notices` `17 * * * *`,
   `washlink_workforce_worker_contract_expiry` `*/10 * * * *`, `washlink_workforce_owner_relationship_refresh`
   `5-59/10 * * * *`, each `select public.run_workforce_scheduled_job('<job key>')`. It is idempotent (same name =
   replaced) and lists the three jobs at the end. Never copy it into `supabase/migrations/`.
5. **Verify.** `select * from cron.job_run_details order by start_time desc limit 20;` shows successful runs; the Overview
   card shows `last_started_at`, `last_outcome = completed`, a falling "Still due" and no "Not run recently" warning
   ("Enabled in WashLink" alone does not prove registration); audit gets `workforce_scheduled_job.ran` rows.
6. **Pause or resize** one job (trusted SQL): `update public.workforce_scheduled_jobs set enabled = false where job_key =
   '<key>';` or `set batch_size = <1..200>`. A disabled job records `disabled` and does nothing else.
7. **Unregister.** Run `scripts/supabase-scheduling/unregister_workforce_jobs.sql` as `postgres`: it selects the `jobid`
   of every `washlink_workforce_%` job and calls `cron.unschedule(jobid)` (also removes duplicates of one name), prints
   `Unregistered <name> (jobid <n>)` per job, does nothing (NOTICE `pg_cron is not installed;
   nothing to unregister.`) without pg_cron, and does not drop the extension. **Always unregister BEFORE rolling back
   any W12 migration**, or cron keeps calling a function that no longer exists.
8. **Never** call `expire_worker_contracts(date)`, `refresh_worker_owner_relationships(date)` or
   `enqueue_certification_expiry_notices(timestamptz)` with a date in production (D-64); they are test-clock tools.

Local evidence (W12 LOG): inside `begin; ... rollback;` on the local stack the register script created the extension and
job ids 1..3 with the schedules above; a second run kept 3 jobs; unregister left 0; after `ROLLBACK` neither pg_cron nor a
`cron` schema remained. pg_cron's runtime identity in production (R6) and a real cron firing were not observed.

## Frontend (built; W12 LOG "BUILD (frontend)" F1..F6 and fix cycle 1)

Paths below are under `frontend/src/`. Mocked Vitest only: no browser run against the local stack, and the keyset
`.or(...)` string and the admin RPC were checked only with mocked clients (PostgREST acceptance is for the W12 smoke).

- **Area map** `domain/utilities/notificationAreas.ts`: pure category -> area map (a `Map`, 37 categories; unknown ->
  `other`), needed because the registry is not client-readable. Labels (`presentation/utilities/notificationAreaCopy.ts`,
  F5): Applications, Job openings, Training, Shop-issued certificates, Contracts, Shop verification, Roster, WashLink
  reviews, Other updates (generic fallback). Each item shows a plain-text chip "Area: <label>"; no deep links (D-68).
- **Inbox model and service** (F1): `domain/models/AppNotification.ts` keeps `AppNotification` unchanged and adds
  `InboxNotification extends AppNotification` with `area`; `application/services/NotificationService.ts` adds
  `listMyInboxPage()`. The W3 `listMyNotifications(limit)` path is unchanged.
- **Repository paging** (F2): `infrastructure/repositories/SupabaseNotificationRepository.ts`
  `listMyNotifications(limit, pageRequest?)` with `{ before: cursor | null, isUnreadOnly }`. Without a page request the
  query is the W3 query. With one: order `created_at desc, id desc`, 50 rows; "Load older" adds the keyset
  `created_at.lt.<ts>,and(created_at.eq.<ts>,id.lt.<id>)` from the last loaded row (timestamp kept as stored text and
  validated with zod before any request); unread only = `read_at is null` in the database (the unread count is not
  affected). Select columns stay `id, category, title, body, created_at, read_at`.
- **Hook and UI**: `presentation/hooks/useNotifications.ts` merges pages and de-duplicates by id; a poll / focus refresh
  merges the new first page on top and keeps older pages; Retry reloads from the start. The area filter is client-side
  over loaded rows. `presentation/components/notifications/NotificationFilterBar.tsx`: All / Unread toggle
  (`aria-pressed`, group "Show notifications") and a labelled Area select ("Filters the notifications loaded so far.").
  The panel says "Notifications appear here in the app only." `NotificationBell.tsx` and the 60 s polling are unchanged.
- **Scheduled-jobs card** (F3): `presentation/components/superAdmin/ScheduledJobsCard.tsx` through
  `presentation/hooks/useWorkforceScheduledJobs.ts`, `application/services/ScheduledJobService.ts` and
  `infrastructure/repositories/SupabaseScheduledJobRepository.ts` (RPC `admin_workforce_scheduled_jobs` only).
  `presentation/components/superAdmin/AdminOverviewPanel.tsx` (optional `scheduledJobService`; in the W14 console built by
  `presentation/dependencyInjection/createScheduledJobDependencies.ts`; `createSuperAdminDependencies.ts` and
  `features/superAdmin/SuperAdminDashboardPage.tsx` unchanged) shows it below the Overview body, even if the W11 summary fails.
- **Card states and copy** (`presentation/utilities/scheduledJobCopy.ts`; fix cycle 1 C1): loading, error with retry,
  empty ("No scheduled job status to show"), success. The badge reads "Enabled in WashLink" (info tone), with the note
  "Enabled in WashLink only means the job may run when called. Registering it with the database cron scheduler is a
  separate step done by a person, and that registration is not visible here." When every job never ran: "Scheduled jobs
  are not running yet. A person must approve and register them." Otherwise a summary "N of M scheduled jobs have not run
  in the last 2 hours." Per job, "Not run recently" when `run_count = 0`, the last start is missing or unreadable, or
  older than 2 hours (`scheduledJobNotRunRecentlyThresholdMilliseconds` in `ScheduledJobService.ts`, judged at load
  time): "This job has never run. A person must approve and register it." or "... Its cron registration may be missing
  or stopped; a person must check it." Counts read "processed N, changed N, skipped while busy N, skipped after an error
  N"; "Error codes in the last run" lists the stored SQLSTATEs ("None" if empty, "Not recorded" if absent). The contract
  job adds "Expired contracts are shown from their end date even before this job records them."; a null `pending_count`
  shows "Not counted for this job"; unknown keys or outcomes are shown as stored. Read only (no buttons); loads once per
  Overview visit, no polling (F6); not audited.

## Tests (local stack)

pgTAP (8 new files, 174 tests after fix cycle 1; 0 `todo_start(`): `j17_w12_notification_registry` (31),
`j17_w12_notification_dedup` (21), `j17_w12_notification_privacy` (12), `j13_w12_scheduled_jobs` (31),
`j16_w12_scheduler_locking` (18, dblink), `j16_w12_fix1_scheduler_liveness` (20, dblink), `j17_w12_scheduler_authorization`
(25), `j18_w12_flows` (16); `001_migration_replay` covers 92 migrations (26 tests). Helpers: `test_helpers_scheduling.sql`
(8th helper file). Full run: `Files=99, Tests=3051`, `Result: PASS`.
Vitest (mocked): 137 files / 282 tests after fix cycle 1 (19 W12 tests); `w12_every_registered_category_has_an_area`
parses the 37 w12b seed rows (`node:fs`, F4) and requires the client map to equal that set. Smoke `w12-api-smoke.mjs`: 22.

TEST-ONLY techniques (W12 LOG D9..D13): contract backdating under `session_replication_role = replica` (also skips the
W10 sync trigger); dblink to the container alias `db` with local default credentials; the sync trigger disabled in
`j16_w12_scheduler_locking` before any fixture; `washlink.scheduled_job` cleared between two runner calls.

## Not verified (W12 LOG)

- The row-level `FOR UPDATE SKIP LOCKED` / `FOR UPDATE NOWAIT` paths (55P03 -> skipped) were checked by reading the code
  and a source-order test only: a dblink session cannot see the test transaction's rows, so only advisory-lock
  contention (pair and job locks) and the release of a failed item's pair lock are tested.
- No cron job actually fired; registration was checked only in a rolled-back local transaction and the runner was called
  directly as a trusted session. pg_cron's production identity (R6) is not observed.
- Production categories (R1, D-10 row 50) and Realtime settings are unknown; the w12b NOTICE and the Realtime aborts
  cover them at apply time.

## Limitations and risks

- R1 a production category missing from the seed makes its new notices silently skipped (WARNING only); the w12b
  NOTICE lists them at apply time. R2 a future producer must add its registry row in the same increment (the registry
  test fails otherwise). R3 the pair try-lock copies the w10e key. R5 backlog on the first production run. R6 cron runs
  as the database owner, so audit shows `system` / `trusted_session`, not a person. R7 polling up to 60 s late. R8
  `enqueue_certification_expiry_notices` is unbatched (bounded by active certificates within 30 days). Not tamper-proof:
  a database superuser can disable the triggers (W3-L3).
- Expiry warnings (W12-L3), no relationship / verification-loss notice (W12-L5), Asia/Manila date (W12-L8), no notice
  retention period (W12-L6); admin queue paging and retention are W13.

## Rollback (local test stack only; reverse order e..a)

**First**, wherever the jobs were registered, a human runs `unregister_workforce_jobs.sql`. e: drop the admin read, the
runner and the pending function (audit rows stay). d: drop the two batch functions and the pair try-lock. c: drop the job
state table and its guard (job history loss only). b: drop the registry trigger and function, then the table and its
guard (notices are unchecked again; rows stay). a: nothing. Stager: drop the 8th helper from `HELPERS_SOURCE_NAMES`.
Contracts already recorded expired stay expired (true records, D-40 forward-only).
