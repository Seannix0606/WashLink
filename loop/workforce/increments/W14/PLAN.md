# W14 - Platform moderation, oversight reads & admin audit (super_admin) - PLAN

**No further split.** W14 fits one increment: 9 migrations and about 45 frontend files, each <= 350 lines (the W11 shape). Fallback for the orchestrator, only on a
re-plan after the fix-cycle limit: move items 2, 3, 4 (standard-template UI, audit reads / UI, relationship lookups) to a "W14b"; items 1 and 5 are untouched by that.
**Item 6 (admin take-over of overdue / stranded shop review requests) is OUT:** D-44 is unchanged (`ADOPTED-DEFAULT (loop, 2026-10-29)`, "admin take-over without
the worker only via W14 if a human changes this row"). Admin power over certificates stays as W11 built it.

Spec: A (administrator reviews reports, moderates; server-side permissions), B (accurate job information; owners manage only their own openings), H (admin queues,
reported items, audit logs, policy enforcement), I (audit; notifications without private details), J2, J3, J17, J18. Depends on W11 (`passed`, HEAD a880331; W0-W11
all `passed` in STATE.md). Decisions used: D-10 (standing, non-blocking), D-13, D-14, D-28, D-37, D-38, D-42, D-44 (unchanged -> item 6 out), D-45..D-48, all
ADOPTED-DEFAULT. **No dependency on an OPEN decision** other than D-10. New decisions D-50..D-58 (section 5). Not BLOCKED.
Carry-forwards closed: W4 REVIEW moderation of discriminatory postings (W4-L4 / L7 / L8 / L9, W5-L8 takedown limits); W8 REVIEW super_admin publishing UI; W3 PLAN
redacted per-user audit reads + admin audit UI; W10 PLAN / D-38 super_admin relationship reads; W4 REVIEW + D-10 rows 14 / 22 approved shops without a recorded reviewer
(queue, re-review, runbook); W11 REVIEW N6 flag long-open disputes with repeated case reads.

## 1. Scope / out of scope
In: (1) worker reports of job openings (categories `age_requirement`, `other_discriminatory_requirement`, `worker_fee_or_deposit`, `unpaid_trial_or_training`,
`misleading_terms`, `other`) feeding super_admin moderation cases; an audited takedown that pauses (with a hold until WashLink lifts it) or closes the opening, with a
reason kind and a message to the owner; the owner may ask WashLink to check changes; reported content snapshotted write-once; no opening content or application
snapshot ever edited. (2) super_admin UI for `publish_platform_contract_template_version` (W8; frontend only, reuses W8 reads). (3) `my_workforce_activity()` (redacted
per-user audit read, every role), `admin_workforce_audit_log(...)` + admin audit log tab (every search audited), `admin_oversight_access_flags()` (N6). (4) Audited
super_admin relationship lookups per worker / per owner with a recorded purpose and note (D-38 outside disputes). (5) Queue of approved shops without a recorded
super_admin review, re-review from it (confirm / request changes / reject), runbook. Plus `admin_moderation_summary()`, fixed-text notifications, pgTAP, Vitest,
`w14-api-smoke.mjs`, docs, legal register.
Out (reason): item 6 (D-44 unchanged); any super_admin edit, archive, delete or re-publish of an opening (D-51: pause / close only); automatic or keyword moderation
and admin-initiated cases without a report (D-50; W9 keyword flags are contract-only); reporter identity or statements shown to owners (D-53); any `job_applications`
change beyond the W5 auto-close on close; dropping the W3 `wae_select_super_admin` raw policy (D-54 keeps it; W13 may harden); email / SMS / push and de-duplication
(W12); retention periods (W13, W3-L1). Never: production apply, `.env`, SQLAlchemy / Alembic, an edited committed migration, a replaced W4 / W5 / W8 / W10 / W11 body.

## 2. Design principles (continue P1-P71)
- P72 Moderation is a platform action on a listing, not a legal finding. Only effects: opening status `published|paused -> paused|closed` plus a hold. Content,
  snapshots, applications (beyond the W5 auto-close) and shop verification are untouched. Reason = fixed kind + admin message read only by the owner.
- P73 Reporter protection: owners never read report rows, statements, reporter ids or counts; the admin case shows `Reporter 1..n`; reporters read only their own
  reports and the outcome kind.
- P74 No W4 body replaced. The W4 guard trigger is split into `job_openings_guard_write` (BEFORE INSERT OR DELETE) and `job_openings_guard_write_update` (BEFORE
  UPDATE, WHEN the transaction-local `washlink.job_opening_moderation` is not the row id); both call the unchanged `job_openings_guard_write()`. New
  `job_openings_guard_moderation` (BEFORE UPDATE, WHEN that flag = row id) requires super_admin (`auth.uid()` + `is_super_admin()` + role `super_admin`),
  `washlink.job_opening_moderation_case` = an open / changes_submitted / paused case of that opening, only `status`, `status_changed_at`, `updated_at` changed, and only
  `published|paused -> paused|closed`; anything else 42501.
- P75 Hold: `job_openings_moderation_hold` (BEFORE UPDATE WHEN status changes to `published`) refuses while a case is `paused_by_washlink` / `changes_submitted`: 23514
  `WashLink paused this job opening. Edit it and ask WashLink to check it before publishing again.` Trusted sessions bypass (audited repair). An owner close / archive
  moves the case to `resolved_owner_closed` (AFTER trigger).
- P76 Redacted audit reads: `my_workforce_activity` returns events where the caller is actor, `subject_profile_id`, or a party of the subject `worker_contract` (worker
  only once sent): `event_id`, `created_at`, `action`, `subject_type`, `actor_label` (`you` / `washlink` / `washlink_system` / `shop_owner` / `worker` / `someone`),
  `details` (allow-listed payload keys; uuid-shaped values dropped). Never `actor_id`, `subject_id`, `subject_profile_id`.
- P77 Every super_admin read of personal data outside a party view is audited (moderation case reads, relationship lookups with stored purpose + note, audit-log
  searches with filter names + profile filter id). VOLATILE; the audit row is written first and its failure aborts the read.
- P78 New tables (`job_opening_reports`, `job_opening_moderation_cases`, `job_opening_moderation_actions`, `admin_access_records`): RLS on; deny-all select for every
  client role incl. super_admin (W11 N3); deny-all write policies; no client write grant (incl. service_role); writes only in definer RPCs under transaction-local flags
  `washlink.job_opening_report_write` / `washlink.job_opening_moderation_write` / `washlink.admin_access_write` (= row id); FK set-null passes via
  `is_orphaned_fk_set_null`; not in Realtime; free text only in its row, never in audit payloads or notifications.
- P79 Re-review stamps without a status flip: W2b `prevent_owner_verification_mutation` keeps the old reviewer when status is unchanged, so new
  `shops_zz_rereview_stamp` (BEFORE UPDATE, sorts after it) sets `verification_reviewed_by = auth.uid()`, `verification_reviewed_at = now()` only under
  `washlink.shop_rereview` = shop id, for a super_admin, with status still `approved`. W2b / W3 / W10 bodies unchanged; W10 `shops_sync_owner_relationships` refreshes
  pairs because the reviewer columns change.

## 3. Migrations (`2026_10_29_w14<x>_<snake>.sql`, staged 20261029000010..18; 87 after W14; each ends with `-- ROLLBACK`; each <= 350 lines)
Idempotent; the PostgREST schema-reload notify last; definer functions `set search_path = public, pg_temp`; comments start `W14:`; `revoke all ... from public, anon`
(plus `authenticated`, `service_role` for internal / trigger functions); client RPCs granted to `authenticated` only. Lock order: job_openings row -> case row -> report
rows; a shops row locks nothing else.
### 3.1 `2026_10_29_w14a_moderation_preflight.sql` (creates nothing)
Abort naming each missing item: `job_openings.{id, shop_id, owner_id, status, title, updated_at, status_changed_at}`, `job_applications.{job_opening_id, status,
opening_snapshot}`, `shops.{id, owner_id, name, is_active, verification_status, verification_reviewed_by, verification_reviewed_at, verification_notes}`,
`worker_owner_relationships.{worker_id, owner_id, status, status_reason, owner_name_snapshot, worker_name_snapshot}`, `worker_contract_disputes.{id, contract_id, status,
created_at}`, `workforce_audit_events.{id, actor_id, actor_role, actor_kind, action, subject_type, subject_id, subject_profile_id, payload, created_at}`; functions
`job_openings_guard_write()`, `job_opening_application_snapshot(job_openings)`, `worker_has_applied_to_job_opening(uuid)`, `shop_has_recorded_verification`,
`is_super_admin`, `current_user_profile_role`, `is_trusted_db_session`, `is_orphaned_fk_set_null`, `record_workforce_audit_event`, `enqueue_notification_safely`,
`notification_safe_label`, `worker_distinct_qualifying_owner_count(uuid, date)`, `publish_platform_contract_template_version(integer, jsonb)`; the W4 row trigger
`job_openings_guard_write`. Abort (D-10) if any `public.job_opening_report%`, `job_opening_moderation%`, `admin_access_record%` object lacks a `W14` comment, or a
trigger `job_openings_guard_write_update`, `job_openings_guard_moderation`, `job_openings_moderation_%` or `shops_zz_rereview_stamp` exists. Rollback: nothing.
### 3.2 `2026_10_29_w14b_job_opening_moderation_tables.sql`
- `job_opening_moderation_cases`: id uuid PK; job_opening_id FK job_openings ON DELETE SET NULL; shop_id FK shops SET NULL; owner_id, decided_by FK profiles SET NULL;
  opening_title_snapshot, shop_name_snapshot; status CHECK in (`open`, `dismissed`, `paused_by_washlink`, `changes_submitted`, `lifted`, `closed_by_washlink`,
  `resolved_owner_closed`); reason_kind (the 6 categories); owner_message 20..500; admin_note 20..1000 (admin only); owner_change_note 0..500; opened_at,
  status_changed_at, revision >= 1, created_at, updated_at. CHECK `jomc_status_consistency` (paused / changes_submitted / lifted / closed need reason_kind +
  owner_message; dismissed needs admin_note). Partial UNIQUE (job_opening_id) where status in (open, paused_by_washlink, changes_submitted); indexes (status,
  opened_at), (owner_id, status).
- `job_opening_reports`: id; case_id NOT NULL FK cases CASCADE; job_opening_id FK SET NULL; reporter_id NOT NULL FK worker_profiles(profile_id) CASCADE; category (6);
  statement 20..1000; `reported_snapshot` jsonb NOT NULL (`job_opening_application_snapshot` at report time, write-once); opening_status_at_report; status (open,
  closed, withdrawn); outcome (`no_action`, `opening_paused`, `opening_closed`, `pause_lifted_after_changes`) required when closed; created_at, closed_at,
  withdrawn_at. Partial UNIQUE (reporter_id, job_opening_id) where open; indexes (case_id), (reporter_id, status).
- `job_opening_moderation_actions` (append-only, owner-visible history): id; case_id FK CASCADE; action in (`paused`, `closed`, `dismissed`, `changes_submitted`,
  `pause_kept`, `lifted`, `owner_closed`); actor_role; reason_kind; owner_message; `opening_snapshot` jsonb (write-once content at that moment); created_at.
- Guards (BEFORE, every session, P78) `job_opening_moderation_cases_guard_write`, `job_opening_reports_guard_write`, `job_opening_moderation_actions_guard_write`:
  INSERT only under the flag = row id; UPDATE only along section 4, with ids, opening / reporter, category, statement, snapshots, created_at immutable (42501
  `Moderation records cannot be edited.`); actions never update; DELETE only by cascade; FK set-null passes.
- RLS enabled; deny-all select + write policies; `revoke all from public, anon, authenticated, service_role`, then `grant select to authenticated` (policy still
  denies); Realtime exclusion (abort on FOR ALL TABLES). ROLLBACK: drop guards and the three tables (IRREVERSIBLE: trusted `copy` first).
### 3.3 `2026_10_29_w14c_job_opening_moderation_guard_and_holds.sql`
Trigger split (P74): drop `job_openings_guard_write`; re-create it BEFORE INSERT OR DELETE plus `job_openings_guard_write_update` BEFORE UPDATE with the WHEN skip,
both on the unchanged W4 function. Internal definer `job_openings_guard_moderation()` + trigger (P74); `job_openings_moderation_hold()` + trigger (P75);
`job_openings_moderation_resolve()` AFTER UPDATE WHEN new status closed / archived and no moderation flag (active case -> `resolved_owner_closed`, `owner_closed`
action). BEFORE order: `guard_moderation` < `guard_write` < `guard_write_update` < `moderation_hold` < `normalize`. ROLLBACK: drop the W14 triggers and functions
FIRST, then re-create `job_openings_guard_write` BEFORE INSERT OR UPDATE OR DELETE exactly as w4c (block included).
### 3.4 `2026_10_29_w14d_job_opening_moderation_rpcs.sql`
Constants (immutable, D-50): `job_opening_report_max_open_per_worker()` = 10, `job_opening_report_max_per_opening()` = 3.
- `report_job_opening(p_job_opening_id uuid, p_category text, p_statement text)`: a worker who can read the opening (published at a shop passing
  `shop_has_recorded_verification`, or non-draft and `worker_has_applied_to_job_opening`) else 42501 `Job opening not found.`; opening FOR SHARE; unknown category
  22023 `Choose a report reason.`; statement 20..1000 else 23514 `Write 20 to 1000 characters.`; open report exists 23505 `You already reported this job opening.`;
  limits 23514 `You have reached the report limit. Wait for WashLink to review your reports.` Attaches to the active case or inserts an `open` case with snapshots.
- `withdraw_job_opening_report(p_report_id uuid)`: the reporter; open -> withdrawn (23514 `This report is no longer open.`); case unchanged.
- `moderate_job_opening(p_case_id uuid, p_expected_revision integer, p_action text, p_reason_kind text, p_owner_message text, p_admin_note text)`: super_admin else
  42501 `Only a platform administrator can moderate job openings.`; case then opening FOR UPDATE; stale revision 55000 `This case changed. Refresh and try again.`;
  allowed: from open `dismiss` / `pause` / `close`, from changes_submitted `keep_paused` / `lift` / `close`, from paused_by_washlink `lift` / `close`, else 23514
  `This action is not available for this case.`; reason_kind required for pause / close / keep_paused (22023); owner_message 20..500 (23514); admin_note 20..1000
  required for dismiss; opening gone -> only dismiss (23514 `This job opening no longer exists.`); pausing a draft / closed / archived opening 23514. Pause on a
  published opening sets both flags and updates status to paused (already paused: no update); close sets status closed (W5 auto-close fires). Inserts an action with
  `opening_snapshot`, closes open reports with the outcome, clears the flags.
- `submit_job_opening_changes(p_case_id uuid, p_note text default null)`: the current owner (role owner); case `paused_by_washlink`; `job_openings.updated_at` must be
  later than the case `status_changed_at` else 23514 `Edit the job opening before asking WashLink to check it.`; note 0..500 -> `changes_submitted` + action.
ROLLBACK: drop the six functions.
### 3.5 `2026_10_29_w14e_job_opening_moderation_reads.sql` (definer)
- `my_job_opening_reports()` (worker): report_id, job_opening_id, opening_title_snapshot, shop_name_snapshot, category, statement, status, outcome, created_at,
  closed_at, can_withdraw.
- `owner_job_opening_moderation()` (owner; cases whose opening has `owner_id = auth.uid()`): case_id, job_opening_id, status, reason_kind, owner_message,
  owner_change_note, status_changed_at, can_submit_changes, history [{action, reason_kind, owner_message, created_at}]. Never reports, counts, statements, admin_note
  or the admin id.
- `admin_job_opening_moderation_queue(p_status text)` (default status `active`; super_admin; `active` = open + changes_submitted + paused; unknown status 22023): case_id,
  status, revision, report_count, open_report_count, categories text[], opening_status, opening_present, shop_name_snapshot, opened_at, status_changed_at; oldest
  first; limit 200; no statements.
- `admin_job_opening_moderation_case(p_case_id uuid) returns jsonb` (VOLATILE; super_admin; audits `job_opening_moderation.case_viewed`): case incl. admin_note;
  current opening content (all non-draft columns); shop name, current verification, is_active; reports as `Reporter n` (category, statement, status, created_at,
  reported_snapshot); actions with snapshots; application counts by status. No reporter ids, names or contacts.
ROLLBACK: drop the four functions.
### 3.6 `2026_10_29_w14f_unreviewed_approved_shops.sql`
- `shop_lacks_recorded_super_admin_review(p_shop_id uuid)` (internal, stable) = the D-10 row 14 predicate: approved AND (reviewed_by null OR reviewed_at null OR the
  reviewer role is not super_admin).
- `admin_unreviewed_approved_shops()` (super_admin; stable; not audited, shop data only): shop_id, shop_name, owner_display_name (trimmed full_name or `Owner`),
  is_active, reviewer_state (`reviewer_missing` / `review_time_missing` / `reviewer_not_super_admin`), verification_reviewed_at, last_decision_at (latest
  `shop.verification_decided`), published_opening_count, current_certification_count, active_contract_count, suspended_relationship_count; oldest first; limit 200.
- `rereview_approved_shop(p_shop_id uuid, p_decision text, p_notes text default null)`: super_admin else 42501 `Only a platform administrator can review shops.`; shop
  FOR UPDATE; predicate false 23514 `This shop already has a recorded review.`; decision in (`confirm_approval`, `request_changes`, `reject`) else 22023; notes
  20..1000 required for request_changes / reject (23514). confirm: set flag, update `verification_reviewed_at = now()` (P79 stamps both), clear flag.
  request_changes / reject: status + notes update through the W2b super_admin branch (stamped; W3 audits `shop.verification_decided` and notifies).
- `shops_zz_rereview_stamp()` + trigger (P79); `shops_audit_rereview()` AFTER UPDATE (WHEN reviewer columns change and flag = id) writes
  `shop.verification_rereviewed` (from_reviewer_state, to_status, changed_by) and notifies the owner. ROLLBACK: drop the triggers, then the functions.
### 3.7 `2026_10_29_w14g_admin_relationship_lookups.sql`
- `admin_access_records`: id uuid PK; admin_id FK profiles ON DELETE SET NULL; access_kind in (`worker_relationships`, `owner_relationships`); subject_profile_id uuid
  NOT NULL, NO FK (P11: outlives the subject); purpose in (`party_support_request`, `reported_problem_follow_up`, `moderation_follow_up`, `policy_monitoring`,
  `legal_or_regulatory_request`); note 20..300; row_count; created_at. Guard: insert-only under the flag, no update, delete only by trusted retention; deny-all RLS
  (P78); Realtime exclusion.
- `admin_worker_relationships(p_worker_id uuid, p_purpose text, p_note text) returns jsonb` (VOLATILE; super_admin): unknown purpose 22023; note 20..300 else 23514;
  an unknown / non-worker id returns `{found:false}` and is still recorded (no unaudited existence oracle); returns worker display name,
  distinct_qualifying_owner_count, current minimum, rows {relationship_id, owner_name_snapshot, owner_present, status, status_reason, counts_toward_goal,
  qualifying_contract_count, first_accepted_at, last_active_at, ended_at}. No contract text.
- `admin_owner_relationships(p_owner_id uuid, p_purpose text, p_note text)`: same keyed by owner, with worker_name_snapshot; never a worker count or other owners.
- Both insert an access record and audit `admin_access.relationships_viewed` (subject_profile_id = the looked-up profile; payload access_record_id, access_kind,
  purpose, row_count). ROLLBACK: drop functions, guard, table (IRREVERSIBLE: `copy` first).
### 3.8 `2026_10_29_w14h_workforce_audit_reads.sql`
- `my_workforce_activity(p_before_id bigint default null, p_limit integer default 50)` (any authenticated role; stable; P76): limit 1..100 (22023); newest first;
  details allow-list: from_status, to_status, status, decision, result, category, reason_kind, basis, resolution_kind, changed_by, deleted_by, ended_by, party_role,
  version_number, version_kind, scope, purpose, access_kind, outcome.
- `admin_workforce_audit_log(p_action_prefix text, p_subject_type text, p_subject_id uuid, p_profile_id uuid, p_actor_id uuid, p_from timestamptz, p_to timestamptz,
  p_before_id bigint, p_limit integer)` (VOLATILE; super_admin): limit 1..200, prefix `^[a-z_.]{1,64}$`, from <= to (22023); full rows plus access_purpose /
  access_note joined for `admin_access.*` events; audits `workforce_audit.log_searched` (filters = names of non-null filters, profile_id, actor_id, result_count).
- `admin_oversight_access_flags()` (super_admin; stable; N6): one row per OPEN contract dispute with opened_days >= `oversight_flag_open_days()` (30) AND
  case_view_count >= `oversight_flag_read_count()` (5): dispute_id, contract_id, opened_days, case_view_count, distinct_viewer_count, last_viewed_at; counted from
  `worker_contract_dispute.case_viewed` events by the payload key `dispute_id`.
- `admin_moderation_summary()` (super_admin; one row, else 0 rows): open_report_case_count, changes_submitted_count, paused_by_washlink_count, oldest_open_case_at,
  unreviewed_approved_shop_count, oversight_flag_count, relationship_lookups_last_30_days.
ROLLBACK: drop the six functions.
### 3.9 `2026_10_29_w14i_moderation_audit_and_notifications.sql`
Producers (AFTER; definer; internal); never statements, messages, notes, names or dates in payloads:
- `job_opening_reports_audit` -> `job_opening_report.submitted` / `.withdrawn` / `.closed` / `.deleted` (subject job_opening, subject_profile = reporter; payload
  report_id, case_id, job_opening_id, category, outcome, changed_by).
- `job_opening_moderation_cases_audit` -> `job_opening_moderation.opened` / `.paused` / `.closed` / `.dismissed` / `.changes_submitted` / `.pause_kept` / `.lifted` /
  `.resolved_owner_closed` / `.deleted` (subject job_opening, subject_profile = owner; payload case_id, job_opening_id, shop_id, from_status, to_status, reason_kind,
  report_count, changed_by).
Notifications (`enqueue_notification_safely`; keys `job_opening_moderation:<case>:<event>`, `job_opening_report:<report>:<event>`; `notification_safe_label` on the
title with fallback "A job opening"):
| Event | Recipient | Text |
|---|---|---|
| paused | owner | `WashLink paused <opening>. Open it to read why and what to change.` |
| closed | owner | `WashLink closed <opening>. Open it to read why.` |
| pause kept | owner | `WashLink kept the pause on <opening>. Open it to read why.` |
| lifted | owner | `WashLink lifted the pause on <opening>. You can publish it again.` |
| report closed | each reporter | `WashLink reviewed a job opening you reported.` |
| re-review confirmed (w14f) | owner | `WashLink confirmed the verification of <shop>.` |
None for report submitted / withdrawn, changes submitted, case views, lookups, log searches; W5 applicant pause / close notices fire unchanged. Then a `W14` comment
on every W14 function (a missing one aborts). ROLLBACK: drop producers (audit rows and notifications stay).

## 4. State machines
Moderation case (`job_opening_moderation_cases`):
| From | To | Who | Condition / effect |
|---|---|---|---|
| (none) | open | system via worker `report_job_opening` | no active case for the opening |
| open | dismissed | super_admin | admin_note; open reports -> closed `no_action` |
| open | paused_by_washlink | super_admin | opening published / paused -> paused; hold on; reports -> `opening_paused` |
| open, paused_by_washlink, changes_submitted | closed_by_washlink | super_admin | opening -> closed (W5 auto-close); final; reports -> `opening_closed` |
| paused_by_washlink | changes_submitted | current owner | opening edited after the pause |
| changes_submitted | paused_by_washlink (`pause_kept`) | super_admin | new reason + message; reports -> `opening_paused` |
| paused_by_washlink, changes_submitted | lifted | super_admin | hold off; opening stays paused; owner may resume via W4 (verification re-checked); reports -> `pause_lifted_after_changes` |
| paused_by_washlink, changes_submitted | resolved_owner_closed | system (trigger) | owner closed / archived the opening |
| any | (opening_id null) | FK set null | opening removed; only `dismiss` remains for an active case |
Report: (none) -> open (worker); open -> withdrawn (reporter); open -> closed (system, with the case decision); removed by reporter-account cascade.
Job opening (W4 unchanged for owners): super_admin only causes `published -> paused`, `published|paused -> closed`, only via `moderate_job_opening`. While held, the
owner `paused -> published` is refused 23514; edit, close and archive stay allowed.
Shop re-review: approved (unreviewed) -> approved (reviewer stamped) | changes_requested | rejected; super_admin only, via `rereview_approved_shop`.
Refused for everyone: direct writes on the four W14 tables (incl. service_role and a trusted INSERT without the flag); raw selects (incl. super_admin); super_admin
content edit, publish, archive or delete of an opening; moderation of a draft; any W14 write to `job_applications`.

## 5. Decisions taken in this plan (RECORD adds them to DECISIONS.md as ADOPTED-DEFAULT (loop, 2026-10-29))
- D-50 Reports: worker accounts only, on openings they can read; six categories; statement 20..1000; one open report per worker and opening, at most 3 per opening
  and 10 open overall; reports drive cases; no admin-initiated case and no automatic keyword moderation.
- D-51 Takedown: super_admin pause (with a hold) or close, with a reason kind and a 20..500 owner message; never edit, archive, delete or re-publish; snapshots never
  edited; a close uses the W5 auto-close.
- D-52 Hold: the owner edits, then asks WashLink to check (one submission at a time); WashLink lifts, keeps the pause or closes; the owner may close at any time
  (resolves the case).
- D-53 Reporter protection: owners never see reports, statements, counts or reporter identity; reporters see their own report and the outcome kind only; applicants get
  only the existing W5 pause / close notices, without a reason.
- D-54 Audit reads: redacted per-user read for every role (P76) in an account "Your activity" drawer; admin log via an audited RPC; the W3 raw super_admin select
  policy is kept (W13 decides); N6 flag = open >= 30 days and >= 5 case reads.
- D-55 Relationship lookups: super_admin only, per worker or owner id, purpose from a fixed list + 20..300 note; every lookup recorded and audited; parties not
  notified, but it appears in their "Your activity" as "WashLink looked up your workforce relationships".
- D-56 Unreviewed approved shops (D-10 row 14 predicate): super_admin confirms (stamps the reviewer without a status change; owner notified) or requests changes /
  rejects via the existing decision path; runbook in the new doc.
- D-57 Console tabs (extends D-42): Overview, Shop verification (with an "Approved without a recorded review" view), Posting reports, Certification reviews,
  Contract disputes, Standard contract, Relationships, Audit log, Policies.
- D-58 W14 notifications: the fixed texts in 3.9, in-app only; W12 de-duplicates and schedules. Item 6 stays out until a human changes D-44.

## 6. Tests (pgTAP `plan(n)` = actual; 0 `todo_start(`; each file <= 350 lines)
- Helpers: NEW `scripts/supabase-test/baseline/test_helpers_moderation.sql` (7th `HELPERS_SOURCE_NAMES` entry; update `stager_seeds_every_helper_file_in_order`;
  stager still 19 pass): `report_test_job_opening` (real RPC), `make_test_shop_legacy_unreviewed(p_shop)` (TEST-ONLY trusted update nulling the reviewer columns, as a
  pre-W2 production row), `delete_test_admin_profile` (real FK cascade). No helper inserts a case, report, action or access record directly.
- `j2_w14_job_opening_reports.test.sql` (J2): w14_worker_reports_published_opening, w14_worker_reports_applied_paused_opening,
  w14_report_refused_for_unreadable_or_draft_opening, w14_report_category_22023_and_statement_23514, w14_duplicate_open_report_23505, w14_report_limits_23514,
  w14_reported_snapshot_write_once, w14_second_reporter_joins_active_case, w14_reporter_withdraws_open_report, w14_owner_customer_trainer_cannot_report.
- `j2_w14_job_opening_takedown.test.sql` (J2, J3): w14_super_admin_pauses_published_opening_with_reason, w14_pause_holds_owner_republish_23514,
  w14_owner_edits_and_submits_changes, w14_submit_refused_without_edit, w14_super_admin_lifts_then_owner_resumes_with_verification_check,
  w14_pause_kept_with_new_reason, w14_super_admin_closes_opening_and_w5_auto_closes_applications, w14_application_snapshots_unchanged_after_takedown,
  w14_opening_content_unchanged_after_takedown, w14_owner_close_resolves_case, w14_dismiss_needs_admin_note, w14_moderate_stale_revision_55000,
  w14_action_not_available_23514, w14_removed_opening_only_dismiss, w14_non_admin_cannot_moderate, w14_moderation_flag_without_case_refused_42501,
  w14_w4_guard_body_unchanged_and_trigger_order (`pg_get_functiondef` of `job_openings_guard_write()` equals the w4c text; BEFORE `tgname` order),
  w14_super_admin_still_cannot_edit_or_transition_directly.
- `j3_w14_unreviewed_approved_shops.test.sql` (J3): w14_queue_lists_reviewer_missing_after_admin_deleted, w14_queue_lists_legacy_null_review_time,
  w14_queue_lists_reviewer_not_super_admin, w14_confirm_stamps_reviewer_without_status_change, w14_confirm_restores_publish_and_worker_visibility,
  w14_confirm_refreshes_owner_relationships, w14_request_changes_and_reject_use_decision_path, w14_rereview_refused_for_reviewed_shop, w14_rereview_notes_required,
  w14_non_admin_cannot_rereview_or_read_queue, w14_stamp_trigger_inert_without_flag.
- `j17_w14_audit_reads.test.sql` (J17): w14_activity_returns_own_actor_and_subject_events_only, w14_activity_includes_contract_events_for_sent_party_only,
  w14_activity_never_returns_ids (column scan + uuid-value scan), w14_activity_details_allow_list_only, w14_activity_actor_labels,
  w14_activity_hides_reports_from_owner, w14_admin_log_filters_and_paging, w14_admin_log_search_is_audited, w14_admin_log_refused_for_non_admin,
  w14_n6_flag_long_open_dispute_with_repeated_reads, w14_n6_flag_ignores_closed_or_short_disputes.
- `j17_w14_relationship_lookups.test.sql` (J17): w14_worker_lookup_returns_rows_count_and_minimum, w14_owner_lookup_has_no_worker_counts_or_other_owners,
  w14_lookup_requires_purpose_and_note, w14_every_lookup_records_access_and_audit, w14_unknown_id_lookup_still_recorded, w14_lookup_visible_in_subject_activity,
  w14_owner_worker_cannot_lookup, w14_access_records_deny_raw_select.
- `j17_w14_moderation_authorization.test.sql` (J17): j17_w14_tables_rls_enabled_and_no_client_write_privileges, j17_w14_select_and_write_policies_deny_all,
  j17_w14_direct_writes_refused_for_every_role_including_trusted_insert, j17_w14_internal_functions_not_client_executable, j17_w14_rpcs_denied_to_anon,
  j17_w14_definer_functions_pin_pg_temp_last, j17_w14_tables_not_in_realtime_publication, j17_w14_admin_functions_refuse_owner_worker_customer,
  j17_w14_owner_reads_no_report_data (column scan of `owner_job_opening_moderation`), j17_w14_no_w14_function_writes_job_applications_or_opening_content (`prosrc`).
- `j17_w14_moderation_audit_and_notifications.test.sql`: w14_audit_actions_for_each_transition, w14_audit_payload_has_no_statements_messages_notes_or_names,
  w14_notifications_fixed_text_one_per_event, w14_reporter_and_case_views_notify_nobody, w14_refused_action_writes_nothing.
- `j18_w14_flows.test.sql` (J18): j18_w14_owner_account_deletion_keeps_case_with_null_opening, j18_w14_worker_deletion_cascades_reports_and_audits,
  j18_w14_platform_publish_leaves_owner_versions_and_contract_hashes_unchanged, j18_w14_w4_w5_lifecycles_unchanged_without_moderation,
  j18_w14_booking_quote_rating_and_verification_unchanged.
- Changed existing file (only this): `001_migration_replay.test.sql` (87 migrations, + 20261029000010..18; renamed `replay_schema_migrations_has_baseline_w2_to_w14`;
  add `replay_w14_moderation_tables_rls_enabled`).
- Smoke `scripts/supabase-test/w14-api-smoke.mjs` (W11 rules: loopback only, keys from local `supabase status` in memory, `smoke14-*@local.test` users deleted and
  asserted, no `.env`; TEST-ONLY legacy-unreviewed fixture via `docker exec` psql): direct insert / patch / delete / select on the 4 W14 tables denied for owner,
  worker, service_role, super_admin; worker report, duplicate 23505, owner reads no report; admin queue + case (audit row), pause, owner resume 23514, owner edit +
  submit, lift, owner resume ok; second report, close, applications closed with byte-equal snapshots; admin publishes the standard template with the UI payload
  shape, owner sees "newer standard", a sent contract hash unchanged; `my_workforce_activity` has no id fields; admin log search audited; relationship lookup needs a
  purpose, owner / worker denied; unreviewed-shop queue + confirm makes the opening visible to workers; `set_config`, guard and stamp functions not callable. Must
  end `0 failed`.
- Vitest (mocked; suffixes `.j2`, `.j3`, `.j17`, `.w14`): j2_w14_report_modal_validates_and_maps_errors, j2_w14_report_button_only_for_workers_on_readable_openings,
  j2_w14_my_reports_list_shows_outcome_without_owner_data, j2_w14_owner_notice_shows_reason_and_history_without_reports, j2_w14_owner_submit_changes_flow,
  j2_w14_resume_refusal_message_mapped, w14_admin_posting_queue_and_case_drawer, w14_moderate_form_requires_reason_and_message,
  w14_decide_changes_form_actions_by_status, j3_w14_unreviewed_shops_panel_and_rereview_drawer, w14_standard_contract_editor_builds_publish_payload,
  w14_standard_contract_publish_modal_says_still_draft_for_legal_review, w14_standard_contract_stale_version_message, j17_w14_activity_drawer_renders_labels_not_ids,
  w14_admin_audit_log_filters_and_paging, w14_admin_access_flags_list, w14_relationship_lookup_requires_purpose_and_note,
  w14_super_admin_console_nine_tabs_default_overview, w14_admin_overview_moderation_counts, j17_w14_repositories_use_rpcs_only, w14_error_messages_mapped. The
  existing 233 stay green unchanged.

## 7. Frontend (UI -> hooks -> services -> repositories -> Supabase; each file <= 350 lines) and docs
Add: `domain/models/{JobOpeningModeration, WorkforceActivity, AdminOversight, PlatformContractTemplateDraft}.ts`; `domain/repositories/{JobOpeningModerationRepository,
WorkforceActivityRepository, AdminOversightRepository, PlatformContractTemplateRepository}.ts`; `domain/utilities/platformContractTemplateDraft.ts` (pure: version
clauses -> editable draft -> publish payload; client change counts); `infrastructure/supabase/{supabaseJobOpeningModerationRows, supabaseWorkforceActivityRows,
supabaseAdminOversightRows, supabaseModerationErrorMessages}.ts`; `infrastructure/repositories/Supabase{JobOpeningModeration, WorkforceActivity, AdminOversight,
PlatformContractTemplate}Repository.ts` (RPCs only; platform repo reuses `platform_contract_template_current`, `contract_template_version_history`,
`contract_template_version_clauses`); `application/validation/moderationSchemas.ts` (zod); `application/services/{JobOpeningModerationService,
WorkforceActivityService, AdminOversightService, PlatformContractTemplateService}.ts`; `dependencyInjection/createModerationDependencies.ts`;
`presentation/utilities/{jobOpeningModerationCopy, workforceActivityCopy, adminOversightCopy, standardContractCopy}.ts` (e.g. "WashLink paused this opening because it
may not follow the WashLink posting rules. This is not a legal finding."; "Publishing does not make the standard template legally reviewed. It stays a draft that
needs review by a qualified Philippine labor-law professional."); hooks `useMyJobOpeningReports`, `useOwnerJobOpeningModeration`, `useAdminModerationQueue`,
`useAdminModerationCase`, `useMyWorkforceActivity`, `useAdminAuditLog`, `useAdminAccessFlags`, `useAdminRelationshipLookup`, `useUnreviewedApprovedShops`,
`useStandardContractEditor`; components `worker/marketplace/{ReportOpeningModal, MyOpeningReportsList}.tsx`, `owner/jobOpenings/{OpeningModerationNotice,
SubmitOpeningChangesModal}.tsx`, `superAdmin/moderation/{PostingReportQueuePanel, PostingReportCaseDrawer, ModerateOpeningForm, DecideOpeningChangesForm}.tsx`,
`superAdmin/shops/{UnreviewedApprovedShopsPanel, RereviewShopDrawer}.tsx` (reuses `ShopReviewDocumentList`), `superAdmin/standardContract/{StandardContractPanel,
StandardContractEditor, PublishStandardContractModal}.tsx` (reuses `ContractTemplatePreview`, `ContractTemplateVersionHistory`; locked clauses read-only in the UI,
the server still checks), `superAdmin/audit/{AdminAuditLogPanel, AdminAuditFilters, AdminAccessFlagsList}.tsx`, `superAdmin/relationships/RelationshipLookupPanel.tsx`,
`account/{WorkforceActivityDrawer, WorkforceActivityList}.tsx`. States: `Skeleton`, `EmptyState`, `LoadErrorNotice`, `applicationToast`.
Change: `superAdmin/{superAdminTabs.ts, AdminOverviewPanel.tsx (second summary), ShopVerificationSection.tsx (view toggle)}`,
`features/superAdmin/SuperAdminDashboardPage.tsx` (lazy panels), `domain/utilities/workforceNextActions.ts` (admin targets),
`dependencyInjection/createSuperAdminDependencies.ts`, `worker/marketplace/{MarketplaceOpeningDetail, WorkerMarketplacePanel}.tsx`,
`owner/jobOpenings/JobOpeningListItem.tsx` (notice; `OwnerJobOpeningsPanel.tsx`, 301 lines, only passes the moderation map), `UserAccountMenu.tsx` ("Your activity").
Unchanged on purpose: `ApplicationSnapshotView.tsx`, `JobOpeningTransitionConfirmModal.tsx`, `owner/contractTemplates/*`, every W9 contract component (J10, J16).
Docs: add `docs/workforce/PLATFORM_MODERATION_AND_AUDIT.md` (P72-P79, D-50..D-58, tables, state machines, RPCs / messages, audit and notifications, limitations,
rollback, and the unreviewed-shop **Runbook**: run the row 14 query, work the queue, record accepted exceptions, never stamp from SQL without a super_admin JWT).
Update `JOB_OPENINGS.md`, `MARKETPLACE_AND_APPLICATIONS.md` (moderation), `CONTRACT_TEMPLATES.md` (admin UI), `OWNER_RELATIONSHIPS.md` (D-38 lookups),
`AUDIT_AND_NOTIFICATIONS.md` (pointer only; at 350 lines), `DASHBOARDS_AND_OVERSIGHT.md` (split done; N6), `ROLE_AND_PROFILE_SECURITY.md` (rows 14 / 22 -> queue;
new D-10 rows 46-48: w14a preflight; W4 trigger split and new `job_openings` / `shops` triggers must match production and sort the same way; the four new tables),
`LOCAL_TEST_HARNESS.md` (at 349: condense the W11 smoke paragraph first; 87 migrations, 7th helper, W14 smoke), `LEGAL_REVIEW_REGISTER.md` (W14-L1..L12; W4-L4 / L7 /
L8 / L9 -> notes). RECORD: W14 smoke row in LOOP.md, D-50..D-58 in DECISIONS.md.

## 8. Acceptance criteria (repo root, local only: `cd frontend && npm run lint / build / test`; `backend/.venv/Scripts/python.exe -m pytest -q`; `node --test scripts/supabase-test/stage-local-workdir.test.mjs`; `node scripts/supabase-test/run-db-tests.mjs`; `w2-`..`w14-api-smoke.mjs`; never `--linked`, `--db-url`, `db push`, `.env`)
| AC | Criterion | Evidence |
|---|---|---|
| AC1 | 9 new migrations `2026_10_29_w14[a-i]_<snake>.sql`, each with `-- ROLLBACK`; nothing committed changed | `ls supabase/migrations/2026_10_29_w14*`; `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_29_w14*` empty; `git diff --name-status a880331 -- supabase/migrations` only `A` |
| AC2 | Clean replay of 87 migrations; PASS; 0 TODO | runner `Result: PASS`; `replay_schema_migrations_has_baseline_w2_to_w14`, `replay_w14_moderation_tables_rls_enabled`; `grep -c "todo_start(" supabase/tests/database/*.sql` all 0 |
| AC3 | Worker reports with limits, write-once snapshot, reporter isolation | every name in `j2_w14_job_opening_reports`; Vitest `j2_w14_report_*`, `j2_w14_my_reports_*`; smoke report checks |
| AC4 | Audited takedown: pause with hold / close, reason to owner, content and snapshots unchanged, W4 body unchanged | every name in `j2_w14_job_opening_takedown`; Vitest `j2_w14_owner_*`, `w14_moderate_*`, `w14_decide_*`; smoke takedown checks |
| AC5 | J2 / J3 hold: owners manage only own openings; held / unreviewed shops cannot publish | every pre-W14 `j2_*`, `j3_*`, `j17_w4_*`, `j17_w5_*` file `ok`; `w14_pause_holds_owner_republish_23514`, `w14_confirm_restores_publish_and_worker_visibility` |
| AC6 | Unreviewed approved shops queue, re-review, runbook | every name in `j3_w14_unreviewed_approved_shops`; Vitest `j3_w14_*`; `grep -n "Runbook" docs/workforce/PLATFORM_MODERATION_AND_AUDIT.md` |
| AC7 | Standard-template publishing UI; template stays draft for legal review; contracts unchanged | Vitest `w14_standard_contract_*`; `j18_w14_platform_publish_leaves_owner_versions_and_contract_hashes_unchanged`; smoke publish checks; `git diff a880331 -- frontend/src/presentation/components/owner/contractTemplates` empty |
| AC8 | Redacted per-user audit reads, audited admin log, N6 flag | every name in `j17_w14_audit_reads`; Vitest `j17_w14_activity_*`, `w14_admin_audit_log_*`, `w14_admin_access_flags_list`; smoke activity / log checks |
| AC9 | Audited relationship lookups with purpose (D-38 outside disputes) | every name in `j17_w14_relationship_lookups`; Vitest `w14_relationship_lookup_*`; smoke lookup checks |
| AC10 | J17 on W14 objects | every name in `j17_w14_moderation_authorization`; `w14-api-smoke.mjs` ends `0 failed`; W2-W11 smokes `0 failed` |
| AC11 | Audit and notifications private, fixed texts | every name in `j17_w14_moderation_audit_and_notifications` |
| AC12 | J18 and retention | every name in `j18_w14_flows`; every pre-W14 pgTAP file `ok`; `git diff --stat a880331 -- supabase/tests/database` only new files + `001_migration_replay.test.sql`; pytest `4 passed`; stager 19 pass |
| AC13 | Frontend | every section-6 Vitest name and the existing 233 pass; lint and build exit 0; `grep -rn "service_role" frontend/src` empty; `w14_super_admin_console_nine_tabs_default_overview` |
| AC14 | Size, safety, docs, legal; item 6 out | `wc -l` of every added / changed code and doc file <= 350; no `.env` read; `git diff --stat a880331 -- backend` empty; section-7 docs exist; `grep -c "W14-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` >= 12; `grep -rni "take_over\|takeover" supabase/migrations/2026_10_29_w14*` empty |

## 9. Rollback, risks and legal-review flags
Rollback (local only, reverse i..a): i producers (audit rows / notifications stay); h reads; g lookups + access table (IRREVERSIBLE: `copy` first); f re-review
triggers / functions (stamped reviewers stay: real super_admin decisions); e, d moderation reads / RPCs; c hold / resolve / moderation triggers FIRST, then restore the
single W4 `job_openings_guard_write` trigger (block in c; a held paused opening becomes resumable); b the three tables (IRREVERSIBLE: `copy` first); a nothing. Stager:
drop the 7th helper. Frontend: revert. W4 / W5 rollbacks are invalid while the w14c triggers exist.
Risks: R1 production drift (D-10): the W4 trigger split and the new BEFORE triggers on `job_openings` / `shops` must exist in production in the same name order; a
production trigger sorting between them could bypass or undo them. R2 the WHEN skip relies on the moderation flag never being client-settable, as every earlier flag
(D-10 row 10); the moderation guard re-checks everything. R3 a WashLink close closes live applications through W5 and notifies applicants without a reason (D-53). R4
VOLATILE admin reads write an audit row per call (StrictMode doubles them in development, W11 N7); audit volume grows. R5 `my_workforce_activity` scans actor /
subject_profile indexes plus a contract join; paged at 100. R6 report brigading is limited only per worker (no IP / rate limit). R7 one super_admin decides alone;
a DB superuser can disable triggers (W3-L3). R8 `LOCAL_TEST_HARNESS.md` (349) and `AUDIT_AND_NOTIFICATIONS.md` (350) are at the limit; the new doc holds W14 detail.
Legal (to `LEGAL_REVIEW_REGISTER.md`, all OPEN; nothing in UI or docs claims compliance, that a posting is lawful, or that a takedown has legal effect):
- W14-L1 publisher duties (W4-L4 / L7 / L9; RA 10911 and other anti-discrimination rules): WashLink acts only on reports with no written legal standard; an opening not
  taken down must never be presented as lawful or vetted.
- W14-L2 fee, deposit and unpaid-trial postings (W4-L8, W5-L8 / L9): WashLink cannot verify them; referral to DOLE; wording of the owner message.
- W14-L3 fairness to owners: no hearing before a pause or close, owner never sees the reports (D-53); whether a notice-and-response step is needed before closing.
- W14-L4 reporter protection versus the right to know the complaint; retaliation risk; whether anonymity can be kept under a legal request.
- W14-L5 effect on applicants: a WashLink close ends live applications (W5) without a reason; whether to tell them more or keep applications open.
- W14-L6 free-text reports, owner messages and admin notes may be defamatory or hold sensitive data (W11-L8); no correction route.
- W14-L7 per-user activity read (RA 10173 access rights): a redacted operational view, not a complete data-subject access response; showing "WashLink viewed /
  looked up" events; labels for other parties.
- W14-L8 relationship lookups: purpose limitation and the fixed purpose list; parties not notified (activity view only); retention of `admin_access_records` (W3-L1).
- W14-L9 audit-log searches are logged but the W3 raw super_admin select remains; internal log, not evidence-grade (W3-L3).
- W14-L10 unreviewed approved shops: a confirmation needs no fresh documents; certificates, contracts and relationships created while unreviewed stay (D-23);
  whether earlier decisions need review (W2-L4, W3-L5, W7-L6).
- W14-L11 standard-template publishing by a single super_admin: the template stays "draft requires legal review" (D-28); owner versions and sent contracts unchanged;
  whether a second reviewer or a recorded human legal sign-off step is required (never fabricated).
- W14-L12 the N6 thresholds (30 days / 5 reads) and continued admin contract access while a dispute stays open (W11-L5, W11-L10).
