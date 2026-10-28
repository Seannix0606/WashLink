# Audit events and notifications (W3, job openings W4, job applications W5, training W6, certifications W7, contract templates W8, worker contracts W9, owner relationships W10)

Scope: what `supabase/migrations/2026_10_24_w3a..w3d_*.sql` add. Everything here was proven on the local Docker stack
only (pgTAP files `j17_w3_*`, `j18_w3_flows`, and `scripts/supabase-test/w3-api-smoke.mjs`). It says nothing about
production until the D-10 rows 17-20 in `ROLE_AND_PROFILE_SECURITY.md` are answered (D-10).

## Design principles (continue P1-P9 of ROLE_AND_PROFILE_SECURITY.md)

| | Principle |
|---|---|
| P10 | Every SECURITY DEFINER function pins `set search_path = public, pg_temp` (storage helper `public, auth, pg_temp`). If `pg_temp` is not listed, Postgres searches the temp schema FIRST for relations, so a session that can create temp tables could shadow `profiles` / `shops`. W3a re-pins the W2 and pre-W2 functions with `alter function` only (a listed signature that does not exist aborts the migration), then aborts if any SECURITY DEFINER function in `public` / `washlink_private` still lacks `pg_temp`; W3 functions are created with it. A later `create or replace` must keep it. The local-only `handle_new_user()` is not altered and is the only exclusion (D-10 row 17). |
| P11 | Audit rows have NO foreign keys: `actor_id`, `subject_id`, `subject_profile_id` are plain uuids plus a role snapshot. Deleting a user, shop or roster row never nulls or removes history (R-4) and the table takes no part in cascades (P9 untouched). |
| P12 | Writes to `workforce_audit_events` / `notifications` happen only inside definer functions that set a transaction-local flag (`washlink.audit_writer` / `washlink.notification_writer` = `on`), checked by a BEFORE INSERT trigger in every session (superuser and service_role included). No client role has a write privilege, and the write policies are explicit deny-all. PostgREST does not expose `set_config` (smoke `rpc_set_config_not_exposed`). |
| P13 | Payloads and notification texts carry identifiers, statuses and field NAMES only: never contact data, notes, document paths, link codes or hashes, or contract text. Enforced by CHECK functions (below), not only by convention. |
| P14 | Producers are AFTER triggers on the W2 tables, not edits of W2 RPC bodies: one place catches every path (RPC, direct update, FK cascade, trusted SQL). A notification DATA problem never fails the business action: `enqueue_notification_safely` catches only `check_violation`, `unique_violation`, `foreign_key_violation` and `not_null_violation`, logs a WARNING and returns null (a null/unknown recipient already returns null); every other class (42501, 42703, ...) is a defect and is re-raised. Free-text names go through `notification_safe_label`. An audit write failure does fail the action (the trail is required), so the separate migration `2026_10_24_w3d0_producer_schema_preflight.sql` (applied right before w3d) aborts if any column or function the producers read is missing (D-10 row 20). |

## workforce_audit_events

Columns: `id` bigint identity (insertion order), `created_at` (forced to `now()`), `actor_id`, `actor_role`,
`actor_kind` (`user` / `trusted_session` / `system`), `action` (`^[a-z_]+(\.[a-z_]+)+$`, max 64), `subject_type`
(`^[a-z_]{1,40}$`), `subject_id`, `subject_profile_id` (the person the event is about), `payload` (jsonb object).

| Operation | Rule |
|---|---|
| INSERT | Only `record_workforce_audit_event(p_action, p_subject_type, p_subject_id, p_subject_profile_id, p_payload)` (definer, revoked from public, anon, authenticated, service_role). Actor fields are derived: `actor_id = auth.uid()`; `actor_kind` = user if uid, else trusted_session if `is_trusted_db_session()`, else system (e.g. GoTrue `deleteUser`); a trusted SQL session that sets `request.jwt.claims` is recorded as `user` (see Limitations); `actor_role = current_user_profile_role()`. Direct INSERT -> 42501 `Audit events are written only by the server.` (trigger) or permission denied. |
| UPDATE | Never: 42501 `Audit events are append-only.` for every session, super_admin, service_role and trusted SQL included. |
| DELETE / TRUNCATE | 42501 unless the trusted retention path below holds. |
| SELECT | super_admin only (`wae_select_super_admin`). An event about one party may carry the other party's id (reviewer, owner), so W11 adds redacted per-user functions instead of widening this policy. |

Payload rule `workforce_audit_payload_is_safe(jsonb)` (CHECK, 23514 on violation): at most 2048 bytes, nesting depth
at most 3; no key (recursive) matching
`phone|e_?mail|contact|address|note|password|token|secret|code|storage_path|document_path|body|message|text|clause|signature`
(case-insensitive); no string over 120 chars, containing `@`, or phone-shaped (spaces, parentheses and hyphens
removed, matches `^\+?[0-9]{7,15}$`); no number with absolute value 1e6 or more. Times are emitted as timestamptz
strings (they contain `:`).

### Trusted retention purge (human procedure, W13 defines the period)

Only in the SQL editor / psql (a trusted session; PostgREST clients, service_role JWTs and end users cannot do this),
inside one transaction:

```sql
begin;
set local washlink.audit_retention_purge = on;
delete from public.workforce_audit_events where created_at < '<cut-off chosen by the retention policy>';
commit;
```

No retention period is claimed (W3-L1). Export before purging if a record is required.

## Action catalogue (W3d producers)

| Trigger | Condition | Action; subject_type / subject_id / subject_profile_id | Payload | Notification |
|---|---|---|---|---|
| `shops_audit_verification` AFTER UPDATE (WHEN status or submitted_at changed, or the submit flag names the row) | flag `washlink.submit_shop` = shop id | `shop.verification_submitted`; shop / shop id / owner_id | from_status, to_status | none |
| same | status changed by super_admin or trusted session | `shop.verification_decided`; same | from_status, to_status, reviewed_by, reviewed_at (the W2b server-stamped columns: for a super_admin decision reviewed_by = `auth.uid()` = actor_id, whatever the client sent; for a trusted session it is whatever that SQL set) | owner: `shop_verification.status_changed` |
| same | approved -> pending by a non-admin (S6 reset; W2b skips S6 for super_admin and trusted sessions, so it can never land in the decided row) | `shop.verification_reset_by_identity_change`; same | from_status, to_status, changed_fields (`name`, `address`) | none (the owner made the edit; never a `verification_decided` event or a "Pending review" decision notice) |
| `worker_roster_link_codes_audit_issue` AFTER INSERT | always | `roster.link_code_issued`; roster_entry / workers.id / null | expires_at (never the code or code_hash) | none |
| `workers_audit_link` AFTER UPDATE (WHEN user_id changed) | null -> account | `roster.linked`; roster_entry / workers.id / new user_id | owner_id | owner: `roster.linked` |
| same | account -> null | `roster.unlinked`; roster_entry / workers.id / old user_id | owner_id, unlinked_by = `account_deleted` (profile gone; checked first) / `worker` / `owner` / `trusted_session` | worker unlinked: owner; owner unlinked: worker; others: none |
| `workers_audit_linked_delete` AFTER DELETE (WHEN old user_id not null) | always | `roster.unlinked`; same | owner_id, unlinked_by = `owner_account_deleted` (owner profile gone, cascade) / `roster_entry_deleted` | worker (distinct neutral text when the owner account was closed) |
| `worker_profiles_audit_delete` AFTER DELETE | always | `worker_profile.deleted`; worker_profile / profile_id / profile_id | deleted_by = `account_deleted` / `self` / `trusted_session` / `other` | none |
| `profiles_audit_role_change` AFTER UPDATE (WHEN role changed) | only trusted sessions can (W2a) | `profile.role_changed`; profile / id / id | from_role, to_role | none |
| `job_openings_audit` AFTER INSERT (W4d) | always | `job_opening.created`; job_opening / job_openings.id / owner_id | shop_id, status | none |
| `job_openings_audit` AFTER UPDATE | status changed (RPC or trusted repair) | `job_opening.status_changed`; same | shop_id, from_status, to_status | none |
| same | content changed while not draft, status unchanged | `job_opening.updated`; same | shop_id, status, changed_fields (column NAMES only) | none |
| `job_openings_audit` AFTER DELETE | always (draft delete or cascade) | `job_opening.deleted`; same | shop_id, from_status, deleted_by = `owner_account_deleted` / `shop_deleted` / `owner` / `trusted_session` (checked in that order) | none |

WHEN clauses are used instead of `UPDATE OF <column>`: a BEFORE trigger change (S6 sets the status to pending on a
name edit) is not in the UPDATE target list, so `UPDATE OF` would miss it. FK `on delete set null` cascades (reviewing
admin deleted) change neither status nor submitted_at and write no shop event.

`shop_verification_review_log` (view, `security_invoker = true`, super_admin only through the base-table RLS):
`event_id, shop_id, action, from_status, to_status, reviewed_by (= actor_id), actor_role, created_at` over
`shop.verification_%` events. This is the R-4 append-only review log; it survives deletion of the reviewer, the owner
and the shop. W7/W10 still snapshot verification at issue time.

## notifications

Columns: `id` uuid, `recipient_id` (FK profiles, `on delete cascade`: the recipient's own data), `category`, `title`
(1..120), `body` (1..400), `subject_type` / `subject_id` (no FK, future deep link), `idempotency_key`
(`^[a-z_]+:[A-Za-z0-9:_-]{1,180}$`, unique per recipient), `created_at` (forced to `now()`), `read_at`. No jsonb
payload column.

State machine: `unread (read_at null) -> read (read_at = now())`, recipient only, through `mark_notifications_read`.
Any other UPDATE -> 42501 `Notifications cannot be edited.` (trigger, every session). No client DELETE; rows go with
the recipient's profile; trusted SQL may purge (retention, W13).

Text rule `notification_text_is_safe(text)` (CHECK on title and body, 23514): no `@`, and no run of `[+0-9 ()-]`
holding 7 or more digits. `notification_safe_label(label, fallback)` returns the trimmed label if it is 1..60 chars
and safe, else the fallback, so an owner-typed roster name holding a phone number becomes "A roster entry" and the
link still succeeds.

| Function | Who | Contract |
|---|---|---|
| `enqueue_notification(p_recipient_id, p_category, p_title, p_body, p_idempotency_key, p_subject_type default null, p_subject_id default null) returns uuid` | definer producers and trusted SQL only (revoked from public, anon, authenticated, service_role) | Null and no write if the recipient profile does not exist. `on conflict (recipient_id, idempotency_key) do nothing`; a repeat returns the existing id (first write wins). |
| `mark_notifications_read(p_notification_ids uuid[] default null) returns integer` | authenticated | 42501 if `auth.uid()` is null; 22023 for more than 200 ids; null = every unread row of the caller; only `recipient_id = auth.uid() and read_at is null` rows change; returns the number changed; foreign or unknown ids are silently ignored. |

Producer idempotency keys embed the audit event id (`shop_verification:<shop>:<event>`, `roster_link:<row>:<event>`),
so one event yields at most one notification per recipient.

Notification texts (in-app only, W3-L2):

| Category | Recipient | Title | Body |
|---|---|---|---|
| `shop_verification.status_changed` | shop owner | Shop verification updated | `<shop name or "Your shop"> is now Approved.` / `Rejected.` / `Changes requested.` / `Pending review.` |
| `roster.linked` | roster owner | Roster worker linked | `<roster name or "A roster entry"> is now linked to a worker account.` |
| `roster.unlinked` (worker unlinked) | roster owner | Roster link removed | `<roster name or "A roster entry"> is no longer linked to a worker account.` |
| `roster.unlinked` (owner unlinked, or owner deleted the linked row) | worker | Roster link removed | `A shop removed the link between your account and its roster.` |
| `roster.unlinked` (owner account closed, row cascade-deleted) | worker | Roster link removed | `A roster link ended because the shop's account was closed.` |

### Realtime decision

Neither table is in `supabase_realtime` (W3b/W3c drop them if present; a FOR ALL TABLES publication is NOTICE-logged
for D-10 row 19). Reason: postgres_changes authorization depends on production Realtime/RLS settings that are unknown
(D-10), and one missed check would broadcast inboxes. The client polls (W3 PLAN section 5: every 60 s while visible,
and on focus). W12 may add Realtime Broadcast with `realtime.messages` policies, proven by tests.

## Limitations

- Rejected actions are not audited (e.g. a refused role change): the guard raises, which rolls back any audit row in
  the same transaction. Needs an autonomous transaction (new extension surface); not done.
- Append-only holds for every application role and service_role, not for a database superuser or table owner, who can
  disable triggers or drop the table (W3 R2). Not a tamper-proof, hash-chained or certified legal record (W3-L3);
  never present it as evidence-grade.
- `actor_kind` is derived from `auth.uid()` first: a trusted SQL session (SQL editor, psql, test harness) that sets
  `request.jwt.claims` to impersonate a user is recorded as `actor_kind = 'user'` with that user's id and role, not as
  `trusted_session`. The trail cannot tell such impersonation apart from the real user (W3-L3: internal operational
  log only).
- The decision payload `reviewed_by` equals `actor_id` only for super_admin decisions (W2b stamps it); for a
  trusted-session decision it is whatever that SQL wrote. The review-log view uses `actor_id` (W3-L5).
- Payload and text filters are heuristics (keys, `@`, phone shapes), not complete (R5); producers stay hand-written
  and reviewed, and no client can write.
- Up to 60 s polling delay (R6). Audit rows keep pseudonymous user ids after account deletion (R7, by design for R-4;
  retention is a legal question, W3-L1).
- Audit read for actors/subjects and an admin audit UI are W11; email/SMS/push and W4-W10 events are W12.

## Rollback

Per-file `-- ROLLBACK` blocks in reverse order d..a, local stack only. d: drop the producer triggers, their functions
and the view (rows already written stay). c: drop the notification objects (inbox loss). b: drop the audit objects
(history loss; export first with a trusted `copy`; apart from the purge above this is the only way audit rows
disappear). a: set `search_path = public` again (re-opens R-1).

## W4 job openings

Job opening payloads never carry titles, descriptions, amounts, benefits or terms (C-W3-1; test `j2_audit_payload_has_no_opening_content`). Draft content edits are not audited. A rejected transition writes nothing. W4 enqueues no notifications: every W4 action is the owner acting on their own opening and there is no counterparty until W5 applications (`w4_job_opening_actions_enqueue_no_notifications`). W5 notifies applicants when an opening they applied to is paused (`job_opening:<id>:<audit_id>`) or closed (through the application events below).

## W5 job applications (`2026_10_25_w5e`)

Producers: `job_applications_audit` AFTER INSERT / UPDATE / DELETE on `job_applications`;
`job_openings_close_applications` and `job_openings_notify_applicants_on_pause` AFTER UPDATE on
`job_openings` (names sort after `job_openings_audit`, so the opening event exists first). All are
definer, pinned, revoked from every client role. subject_type `job_application`, subject_id the
application id, subject_profile_id the worker. Payload keys only: `job_opening_id`, `shop_id`,
`status`, `from_status`, `to_status`, `changed_by`, `deleted_by` (P23; test
`j5_audit_payload_has_no_cover_note_or_opening_content`). `changed_by` is derived from the write
flag: `worker` / `owner` (flag = row id and `auth.uid()` matches), `opening_closed` (flag
`opening:<id>`), else `trusted_session`. Draft cover-note edits and refused actions write nothing.
Owner recipients (fix cycle 1): the CURRENT `shops.owner_id` of the opening's shop, and only when
it equals the application's `owner_id`; otherwise no owner notification (the audit row is still
written). Test `j5_w5_fix1_owner_notifications_and_lock_order`.

| Event | Action; payload | Notification (category: recipient) |
|---|---|---|
| insert as draft (or a trusted insert in a later status) | `job_application.created`; job_opening_id, shop_id, status, changed_by | none |
| insert as submitted, or draft -> submitted | `job_application.submitted`; job_opening_id, shop_id, from_status (null on insert), changed_by | `job_application.submitted`: owner (worker actions only) |
| owner transition | `job_application.status_changed`; job_opening_id, shop_id, from_status, to_status, changed_by = owner | `job_application.status_changed`: worker |
| worker withdraw | same, changed_by = worker | `job_application.withdrawn`: owner |
| opening closed / archived (auto-close) | same, changed_by = opening_closed | `job_application.closed`: worker, sent rows only (`submitted_at` set; a draft becomes a never-sent closed draft, no notification) |
| trusted repair | same, changed_by = trusted_session | none |
| draft or closed-draft delete | `job_application.deleted`; job_opening_id, shop_id, from_status (`draft` / `closed`), deleted_by = worker | none |
| cascade / trusted delete | same, deleted_by = `worker_profile_deleted` (checked first) / `opening_removed` (opening, shop or owner profile gone) / `trusted_session` | `worker_profile_deleted` and row was submitted / under_review / shortlisted / accepted: owner `job_application.removed`; `opening_removed` and row sent (`submitted_at` set) and not withdrawn: worker `job_application.removed` |
| opening published -> paused | (the W4 `job_opening.status_changed` event) | `job_opening.paused`: each worker with a submitted / under_review / shortlisted application, key `job_opening:<opening>:<event>` |

Application keys are `job_application:<application id>:<audit event id>`. Labels:
`notification_safe_label(title, 'A job opening')`, `notification_safe_label(shop name, 'The shop')`
(`'the shop'` mid-sentence).

| Category | Recipient | Title | Body |
|---|---|---|---|
| `job_application.submitted` | owner | New job application | `<opening> has a new application.` |
| `job_application.status_changed` | worker | Application update | `<shop>: your application for <opening> is now Under review.` / `Shortlisted.` / `Accepted. This is not a contract.` / `Not selected.` |
| `job_application.withdrawn` | owner | Application withdrawn | `An applicant withdrew from <opening>.` |
| `job_application.closed` | worker | Application closed | `<opening> at <shop> has closed, so your application was closed.` |
| `job_opening.paused` | worker | Opening paused | `<opening> at <shop> is paused. Your application stays open.` |
| `job_application.removed` | owner | Application removed | `An application was removed because the applicant deleted their profile.` |
| `job_application.removed` | worker | Application ended | `An application ended because the shop or its job opening was removed.` |

Texts never contain the cover note, snapshot, pay, terms, the applicant's name or contact data
(`j5_notification_text_has_no_cover_note_pay_name_or_contact`). Closing an opening writes up to
500 application events and notifications in the owner's transaction (W5 R2).

## W6 training (`2026_10_25_w6i`)

Producers: `training_programs_audit`, `training_sessions_audit`, `training_program_trainers_audit`,
`training_enrollments_audit` and `training_evidence_audit` (attendance and assessments) AFTER INSERT /
UPDATE / DELETE on the six training tables; definer, pinned, revoked from every client role. Labels come
from `training_labels` (`notification_safe_label(title, 'A training program')`, `(shop name, 'The shop')`,
falling back to the enrollment's snapshots after a D-18 shop removal). subject_type `training_program`
(program, session and trainer events; subject_profile_id = owner, or the trainer for designation events)
or `training_enrollment` (enrollment and evidence events; subject_profile_id = worker). Payload keys only:
`training_program_id`, `shop_id`, `enrollment_id`, `session_id`, `from_status`, `to_status`, `session_kind`,
`attendance_status`, `result`, `recorder_role`, `is_correction`, `attended_training_days`,
`required_training_days`, `items_met_count`, `items_total`, `changed_by`, `deleted_by` (never ISO dates,
notes, comments, reasons, terms, pay or names; test `w6_audit_payload_has_no_dates_notes_reasons_terms_or_names`).
`changed_by`: `owner` / `worker` when the write flag is the row id and `auth.uid()` matches, else
`trusted_session`. Draft content edits, stamp-only updates and refused actions write nothing.

| Event | Audit action | Notification (category: recipient, body) |
|---|---|---|
| program created / status changed / deleted | `training_program.created`, `.status_changed`, `.deleted` (deleted_by owner / shop_removed / trusted_session) | none |
| session added / cancelled (owner, program open) | `training_session.added`, `.cancelled`; `.deleted` (owner / program_removed / trusted_session) | `training.schedule_changed`: each invited or accepted worker, `<program> at <shop> has a schedule change. Check the dates.` |
| trainer designated / revoked (owner) | `training_trainer.designated`, `.revoked`; `.deleted` (program_removed / trainer_account_deleted / trusted_session) | `training.trainer_role`: trainer, `You are a trainer for <program>.` / `You are no longer a trainer for <program>.` |
| invited (owner) | `training_enrollment.invited` | `training.invited`: worker, `<shop> invited you to <program>. Read the free-training notice before you decide.` |
| accepted / declined / withdrawn (worker) | `training_enrollment.status_changed`, changed_by worker | `training.response`: current shop owner (= enrollment owner), `A worker accepted / declined / left <program>.` |
| cancelled (owner) | same, changed_by owner | `training.cancelled`: worker, `<shop> cancelled your enrollment in <program>.` |
| attendance recorded / corrected | `training_attendance.recorded` / `.corrected` | correction only, `training.record_corrected`: worker, `A training record for <program> was corrected.` |
| assessment recorded / corrected | `training_assessment.recorded` / `.corrected` | `training.assessment`: worker, `<program>: assessment recorded, Passed. Training completed.` / `Not passed.`; owner too when a trainer recorded it, `A trainer recorded an assessment for <program>.` |
| D-18 shop removal (enrollment shop_id -> null) | `training_enrollment.shop_removed` (from_status) | none |
| worker account deletion | `training_enrollment.deleted` (worker_profile_deleted), `training_attendance.deleted` / `training_assessment.deleted` (enrollment_removed) | none (W6-L5) |

Keys: `training_invite:`, `training_response:`, `training_cancel:`, `training_schedule:<session>:`,
`training_trainer:`, `training_attendance:`, `training_assessment:` + `<row id>:<audit event id>`, so every
recipient gets one notification per event (`w6_notifications_idempotent_one_per_event`). Trusted fixtures and
repairs notify nobody.

## W7 certifications (`2026_10_26_w7h`)

Producers: `certifications_audit`, `certification_review_requests_audit`, `certification_reassessments_audit`
and `shop_certification_policies_audit` AFTER INSERT / UPDATE / DELETE on those four tables, plus the
AFTER INSERT trigger `training_evidence_flag_certifications` on `training_attendance_records` and
`training_assessments` (the only W6-side object W7 adds, D-24). All definer, pinned `public, pg_temp`,
revoked from every client role. `certification_status_events` is itself the per-certificate history; its rows
mirror audited `certifications` changes and are not audited a second time. subject_type `certification`
(subject_id = certification, subject_profile_id = worker) or `shop_certification_policy` (subject_id = shop,
subject_profile_id = current shop owner). Payload keys only: `certification_id`, `enrollment_id`,
`program_id`, `shop_id`, `renews_certification_id`, `from_status`, `to_status`, `decision`, `result`,
`validity_months`, `attended_training_days`, `required_training_days`, `items_met_count`, `items_total`,
`changed_by`, `deleted_by` (never reasons, statements, comments, names or ISO dates; test
`w7_audit_payload_has_no_reasons_names_or_dates`). `changed_by`: `owner` (an RPC with `auth.uid()`),
`review_decision` (status change made by `decide_certification_review`, transaction-local
`washlink.certification_change_source`), `trusted_session` (no `auth.uid()`), `shop_removed`. Refused actions
write nothing (`w7_refused_action_writes_nothing`).

| Event | Audit action | Notification (category: recipient, body) |
|---|---|---|
| issued (owner) | `certification.issued` | `certification.issued`: worker, `<shop> issued you a shop-issued certification for <program>.` |
| renewed (owner) | `certification.renewed` (old row: `.status_changed` active -> superseded, no notification) | `certification.renewed`: worker, `<shop> renewed your shop-issued certification for <program>.` |
| suspended / revoked (owner) | `certification.status_changed` | `certification.suspended` / `.revoked`: worker, `<shop> suspended / revoked your certification for <program>. Open it to see the reason and ask for a review.` |
| reinstated from suspended (owner) | `certification.status_changed` | `certification.reinstated`: worker, `<shop> reinstated your certification for <program>.` |
| review requested (worker) | `certification.review_requested` | `certification.review_requested`: current issuing owner, `A worker asked for a review of a certification decision for <program>.` |
| review decided (owner) | `certification.review_decided` (decision reinstated / upheld); a reinstatement also writes `.status_changed` with changed_by review_decision | `certification.review_decided`: worker, `<shop> reviewed your request for <program>: reinstated.` / `: decision kept.` (no separate reinstated notice) |
| review withdrawn (worker) | `certification.review_withdrawn` | none |
| re-assessment recorded | `certification.reassessment_recorded` (result, item counts, changed_by owner / trainer) | none |
| training record changed after issue (D-24) | `certification.training_record_changed` | `certification.training_record_changed`: current issuing owner, `A training record for <program> changed after a certification was issued. Review it.` |
| shop validity set | `shop_certification_policy.updated` (validity_months) | none |
| D-23 shop removal (shop_id -> null) | `certification.shop_removed` | none (nothing changed for the worker) |
| worker account deletion (cascade) | `certification.deleted` (deleted_by worker_profile_deleted / trusted_session) | none |
| expiry notices (D-25, `enqueue_certification_expiry_notices`) | none | `certification.expiring`: worker, `Your certification for <program> expires within 30 days.`; `certification.expired`: `Your certification for <program> has expired.` |

Labels: `notification_safe_label(program_title_snapshot, 'your training')` and
`(shop_name_snapshot, 'The shop')`. Keys: `certification:<certification id>:<audit event id>` (one notification
per recipient per event, `w7_notifications_idempotent_one_per_event`) and, for expiry notices,
`certification_expiry:<id>:due` / `:expired` (idempotent: the function counts only newly created notices and
refuses a past `p_as_of`, 22023). The expiry function is internal (no client role may execute it); W12 schedules
it. Trusted SQL (no `auth.uid()`) and cascades notify nobody.

## W8 contract templates (`2026_10_26_w8h`)

Producers: `contract_templates_audit` (AFTER INSERT / UPDATE / DELETE on `contract_templates`) and
`contract_template_versions_audit` (AFTER INSERT on `contract_template_versions`); helper
`contract_template_changed_by()`. All definer, pinned `public, pg_temp`, revoked from every client role. Clauses
are not audited separately (they belong to their version, which is). subject_type `contract_template`,
subject_id = template id, subject_profile_id = owner_id (null for the platform template). Payload keys only:
`template_id`, `version_id`, `scope`, `version_number`, `base_platform_version_number`, `edited_count`,
`added_count`, `from_status`, `to_status`, `derived_from_version_id`, `changed_by`, `deleted_by` (never names,
headings, bodies, clause keys or hashes; test `w8_audit_payload_has_no_names_headings_bodies_or_hashes`).
`changed_by`: `owner`, `super_admin` (platform publish) or `trusted_session` (no `auth.uid()`). An audit failure
aborts the action (W3 rule); refused actions write nothing (`w8_refused_action_writes_nothing`).

| Event | Audit action | Notification |
|---|---|---|
| owner creates a template (from the standard or from an own version) | `contract_template.created` (scope, version_number 1, derived_from_version_id) and `contract_template.version_saved` for v1 | none |
| owner saves a version | `contract_template.version_saved` (version_number, base_platform_version_number, edited_count, added_count) | none |
| super_admin publishes a platform version | `contract_template.version_saved` (scope platform, changed_by super_admin) | none |
| rename | `contract_template.renamed` (no name in the payload) | none |
| archive / restore | `contract_template.status_changed` (from_status, to_status) | none |
| owner account deletion (cascade) | `contract_template.deleted` (deleted_by `owner_account_deleted`; `trusted_session` is reserved, the guard refuses any other delete) | none |
| platform starter seed (w8e, before the producers existed) | w8h records `contract_template.created` and `.version_saved` once (changed_by trusted_session) | none |

No notifications in W8 (D-30): the owner acts on their own data; the owner list shows "A newer standard template
is available" from live state (`owner_contract_templates().newer_standard_available`). W12 decides whether a
newer standard ever notifies owners.

## W9 worker contracts (`2026_10_26_w9j`)

Producers: `worker_contracts_audit` (AFTER INSERT / UPDATE / DELETE on `worker_contracts`), `contract_versions_audit`
(AFTER INSERT / UPDATE / DELETE on `contract_versions`, amendment versions only; the initial version's events are the
contract's own status changes) and `retained_job_application_records_audit` (AFTER INSERT); helpers
`worker_contract_changed_by()` and `worker_contract_notify(...)`. All definer, pinned `public, pg_temp`, revoked from
every client role. Clauses, flags and acceptance records are not audited separately (they are sealed with their
version; the owner's acceptance is part of `.sent`). subject_type `worker_contract` (subject_id = contract id,
subject_profile_id = owner_id, or worker_id once the owner is gone) or `job_application_record` (subject_id =
application id, subject_profile_id = worker). Payload keys only: `contract_id`, `version_id`, `version_number`,
`version_kind`, `shop_id`, `from_status`, `to_status`, `flag_count`, `classification_key`, `party_role`, `ended_by`,
`changed_by`, `deleted_by`, `removed_party`, `origin` (created), `application_id`, `record_id`, `removal_reason`
(retained); never contract text, names, reasons, decline notes, pay, dates or hashes (test
`w9_audit_payload_has_no_text_names_reasons_dates_or_hashes`). `changed_by`: `owner` / `worker` (an RPC with
`auth.uid()`), `system` (expiry, cascades from GoTrue), `trusted_session` (trusted SQL; a status change without the
write flag is a trusted repair). Draft saves are not audited (W5 / W6 rule); refused actions write nothing
(`w9_refused_action_writes_nothing`); an audit failure aborts the action (W3 rule).

| Event | Audit action | Notification (category `worker_contract`: recipient, body) |
|---|---|---|
| draft created | `worker_contract.created` (origin) | none |
| offer sent (v1) | `worker_contract.sent` (version_kind initial, flag_count, classification_key, party_role owner) | worker: `<shop> sent you a contract draft to review. It applies only if you accept it.` |
| amendment created | `worker_contract.amendment_created` | none |
| amendment sent | `worker_contract.sent` (version_kind amendment) | worker: `<shop> proposed a change to your contract. Your current terms stay until you accept it.` |
| offer / amendment withdrawn by the owner | `worker_contract.withdrawn` | worker: `<shop> withdrew a contract offer.` / `<shop> withdrew a proposed contract change. Your current terms stay.` (none when the withdrawal is part of a termination, expiry or party removal) |
| accepted (worker) | `worker_contract.accepted` (party_role worker) | owner: `A worker accepted your contract offer.` / `A worker accepted your proposed contract change.` |
| declined (worker) | `worker_contract.declined` | owner: `A worker declined your contract offer.` / `A worker declined your proposed contract change.` |
| start recorded (owner) | `worker_contract.activated` | worker: `<shop> recorded that your contract has started.` |
| terminated | `worker_contract.terminated` (ended_by worker / owner) | the other party: `A worker ended a contract. Open it to see the reason.` / `<shop> ended a contract. Open it to see the reason.` |
| expired (`expire_worker_contracts`) | `worker_contract.expired` (ended_by system) | worker: `Your contract with <shop> reached its end date and has expired.`; owner: `A contract reached its end date and has expired.` |
| unsent draft discarded | `worker_contract.draft_discarded` (version_kind initial / amendment, deleted_by owner_discarded / system) | none |
| owner / shop / worker removed, contract kept (D-32, D-35) | `worker_contract.party_removed` (removed_party owner / shop / worker; once for owner + shop) | the remaining party: `A contract's other party left WashLink. Your contract record is kept.` (worker only if the offer was sent) |
| contract removed by retention | `worker_contract.deleted` (deleted_by owner_account_deleted / shop_deleted / worker_account_deleted) | none |
| trusted status repair | the matching action with changed_by trusted_session | none |
| accepted application copied before a shop / owner cascade | `job_application_record.retained` | none |

Label: `notification_safe_label(shop_name_snapshot, 'The shop')`. Keys: `worker_contract:<contract id>:<audit event
id>` (at most one notification per recipient per event; `w9_notifications_one_per_event_idempotent`). No W9 table is
published to Realtime; clients poll.

## W10 owner relationships and workforce policies (`2026_10_28_w10c`, `w10g`; details in `OWNER_RELATIONSHIPS.md`)

Producers (definer, pinned, revoked from every client role): `worker_owner_relationships_audit` (AFTER INSERT / UPDATE /
DELETE) and `workforce_policies_audit` (AFTER UPDATE when `integer_value` changes); `changed_by` via `worker_contract_changed_by()`.

| Event | Audit action (subject_type) | Payload keys |
|---|---|---|
| first accepted contract with an owner, or the w10g backfill | `worker_owner_relationship.created` (`worker_owner_relationship`, subject_profile_id = worker) | relationship_id, worker_id, owner_id, to_status, status_reason, counts_toward_goal, qualifying_contract_count, changed_by |
| status, reason or qualifying count changed by a refresh / owner account deleted (FK set null) | `.status_changed` / `.owner_removed` | the same plus from_status |
| worker account deleted (cascade) | `.deleted` | relationship_id, worker_id, owner_id, from_status, deleted_by `worker_account_deleted` |
| minimum changed (RPC or trusted SQL) | `workforce_policy.changed` (`workforce_policy`) | policy_key, from_value, to_value, revision, changed_by |

Never names, free text, dates or another owner's ids; the policy reason stays on the policy row (`last_change_reason`). A
refresh that changes nothing writes no event; refused actions write nothing. No notifications for any W10 event (D-39) and
no W10 table in Realtime. An audit failure aborts the causing action (W3 rule), including a decline or termination (R2).
