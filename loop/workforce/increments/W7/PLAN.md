# W7 - Certifications: issue, expire, suspend, revoke - PLAN

Spec: D (certification decision, approver + time, expiry / renewal, revoke / suspend with audit and review; never government-recognized),
A (only verified shops issue), B / C (certification-required openings; no unverified qualification claims), H, I, J3 (certification half),
J6 (certification part), J8 (certification half), J17, J18. Depends on W6 (`passed`, STATE.md, HEAD d26865d). Decisions: D-5 ADOPTED-DEFAULT
(12 months, renewal by re-assessment, configurable per shop), D-12 (W7 decides enforcement -> D-20 below), D-18 (retain worker-facing records
on shop / owner deletion), D-4 / D-16 (trainers record evidence, never issue). D-10 (local proof only) and D-11 (staged 14-digit copies) apply.
D-3 / D-6 not needed. Not BLOCKED. Closes carry-forwards: W0 C1 (NOT NULL enrollment link, approved_by / approved_at, assessor), W2 R-4 (shop
verification snapshot at issue; later loss does not void), W3 C-W3-1 (certification evidence in its own immutable tables; payload rules),
W4 J3 certification half, W5 (real `applicant_verified_certifications`; real state for `describeWorkerCertificationWarning` /
`describeNoVerifiedCertifications`; D-12 enforcement), W6 (completion is not monotonic: re-check inside the issuing transaction under locks).

## 1. Scope / out of scope
In: `shop_certification_policies` (D-5 per-shop validity), `certifications`, `certification_status_events`, `certification_review_requests`,
`certification_reassessments` (renewal by re-assessment); RPC-only writes under a flag; issue / renew / transition / review state machines in
DB functions; effective status DERIVED (expiry never stored); D-20 apply gate for certification-required openings; real
`applicant_verified_certifications`; owner and worker reads; audit + notifications (W3 pattern) and an expiry-notice function; worker and owner
UI; pgTAP J3 / J6 / J8 / J17 / J18 + lifecycle / audit / D-20 files, Vitest, w7 smoke, docs, legal register.
Out (reason): public or third-party certificate verification, QR codes, PDFs (spec does not require it; W7-L11); super_admin suspension,
review queue or moderation (W11 admin dashboard, spec H); scheduling the expiry-notice function (no scheduler exists; W12 wires it, D-25);
email / SMS / push / Realtime (W12); contracts (W9); any certification or renewal fee (none exists, P35); training model changes (W6 untouched
except one AFTER trigger, 3.8). No production apply, no `.env`, no SQLAlchemy/Alembic tables.

## 2. Design principles (continue P1-P29)
P30. Every write to a W7 table goes through a definer RPC under the transaction-local flag `washlink.certification_write` = row id. No client
role (anon, authenticated, service_role) has INSERT / UPDATE / DELETE; write policies are deny-all. There is NO trusted-session bypass for
inserts or status changes (an issuance is only ever the issuing function); trusted SQL can only be told apart by the audit `actor_kind`.
The only UPDATE accepted without the flag is a D-18 FK set-null (`is_orphaned_fk_set_null`, only that column changes).
P31. Issued facts are write-once for EVERY session, trusted included (42501 `Certification records cannot be edited.`): worker, enrollment,
program, assessment, title, issuer kind, issued / approved stamps, approver, assessor, validity, expiry, attestation, shop-verification
snapshot and evidence snapshot. Only `status`, `status_reason`, `status_changed_at`, `status_changed_by`, `updated_at` change (under the flag).
P32. No backdating: a BEFORE INSERT trigger sets `issued_at = approved_at = now()`, `validity_months = shop_certification_validity_months(shop)`
and `expires_at = ((now() at time zone 'Asia/Manila') + make_interval(months => validity_months)) at time zone 'Asia/Manila'`, ignoring any
supplied value, for every session. No RPC takes a date or a validity parameter. Functions that take `p_as_of` refuse `p_as_of < now()` (22023).
P33. Expiry is derived, never stored: `certification_effective_status(status, expires_at, at)` = `expired` when status = `active` and
`at >= expires_at`, else status. "Current" means effective `active`. Time alone never changes a stored row.
P34. Label: `issuer_kind` CHECK = `shop_issued`. Copy always says "Shop-issued certification" and "Not a government-recognized credential."
No string in DB comments, notifications or UI claims government recognition, accreditation, a licence, TESDA status or legal compliance.
P35. No fee: no W7 table has a fee / charge / price / deduction column; no W7 function has such a parameter or mentions `bookings`,
`shop_pricing` or `quoted_price` (W6 j7 scans stay green; J17 file adds W7 assertions).
P36. Audit payloads carry ids, status words, booleans and small counts only (never reasons, statements, comments, names or ISO dates);
reasons and statements live only in their own tables, readable by the certificate's worker and the issuing shop's current owner.

## 3. Migrations (staged 20261026000001..08; each ends with `-- ROLLBACK`; each <= 350 lines)
Names `2026_10_26_w7<x>_<snake>.sql`, idempotent, `notify pgrst, 'reload schema';` last; every function `set search_path = public, pg_temp`;
`revoke all ... from public, anon` (+ `authenticated`, `service_role` for trigger / internal); client RPCs `grant execute ... to authenticated`.
Table comments start `W7:`. All five tables dropped from / refused in `supabase_realtime` (raise like w6d on FOR ALL TABLES).
Global lock order: `shops` row FOR SHARE -> `training_programs` FOR SHARE -> `training_enrollments` FOR SHARE -> advisory
`training_evidence:<enrollment_id>` (same key as W6 recorders, so a correction and an issue serialise) -> advisory `certifications:<worker_id>`
-> `certifications` row FOR UPDATE. Status / review RPCs take only the certification row FOR UPDATE (then the review row).
### 3.1 `2026_10_26_w7a_certifications_preflight.sql` (creates nothing)
Abort naming every missing item: `shops.{id, owner_id, name, verification_status, verification_reviewed_by, verification_reviewed_at,
is_active}`, `training_enrollments.{id, program_id, shop_id, owner_id, worker_id, status, accepted_at}`, `training_programs.{id, title,
min_training_days, assessment_checklist, status}`, `training_assessments.{id, enrollment_id, result, assessed_by, assessor_role,
assessor_display_name, assessed_on, items_met, checklist_snapshot, supersedes_id}`, `training_attendance_records.{id, session_date, supersedes_id}`,
`job_openings.applicant_requirement`, `job_applications.submitted_at`; functions `training_enrollment_is_completed(uuid)`,
`training_enrollment_attended_days(uuid)`, `lock_training_enrollment_for_recorder(uuid)`, `shop_has_recorded_verification(uuid)`,
`is_verified_shop_owner(uuid)`, `job_application_apply_checks(uuid,uuid,uuid)`, `applicant_verified_certifications(uuid)`,
`record_workforce_audit_event(...)`, `enqueue_notification_safely(...)`, `notification_safe_label(text,text)`, `is_orphaned_fk_set_null(...)`.
Abort if any `public.certification*` / `shop_certification_policies` table exists without a `W7` comment (D-10 row 33). Rollback: nothing.
### 3.2 `2026_10_26_w7b_certifications.sql`
`shop_certification_policies`: shop_id PK FK shops on delete cascade; validity_months smallint not null default 12 CHECK 1..36; updated_by FK
profiles on delete set null; updated_at. Absent row = 12 (`shop_certification_validity_months(uuid)`, internal, coalesce(..., 12)).
`certifications`: id uuid PK; worker_id FK worker_profiles(profile_id) on delete cascade; enrollment_id uuid NOT NULL FK training_enrollments
on delete cascade (C1); program_id NOT NULL FK training_programs on delete restrict; assessment_id NOT NULL FK training_assessments on delete
cascade (the assessment the decision rests on); renews_certification_id FK certifications on delete cascade, null for an original;
reassessment_id (FK added in w7c), required exactly for renewals; shop_id / owner_id FK on delete set null (D-18); `shop_name_snapshot`,
`program_title_snapshot`, `certification_title` (= program title snapshot, 3..160); `issuer_kind` text not null default 'shop_issued'
CHECK = 'shop_issued'; issued_at, approved_at (= issued_at); approved_by FK profiles on delete set null + `approved_by_role` CHECK = 'owner'
+ `approver_display_name` (C1); `assessor_id` uuid not null (no FK, P11 style), `assessor_role` CHECK owner / trainer,
`assessor_display_name`; `attended_training_days` smallint CHECK >= 3, `required_training_days` smallint CHECK >= 3, CHECK attended >=
required; `issuer_attestation_version` CHECK 'w7_issuer_v1'; validity_months CHECK 1..36; expires_at CHECK > issued_at; shop verification
snapshot (R-4): `shop_verification_status_at_issue` CHECK = 'approved', `shop_verified_by_at_issue` uuid not null (no FK: survives the
reviewer's deletion, W2-L4), `shop_verified_at_at_issue` timestamptz not null, `shop_verification_event_id` bigint null (latest
`shop.verification_decided` audit id to approved; null for pre-W3 approvals; W3-L5: both kept); `evidence_snapshot` jsonb object <= 32 KB
(3.4); status CHECK in (active, suspended, revoked, superseded) default active; status_reason 20..500, set exactly when status is suspended or
revoked (`cert_status_reason_consistency`); status_changed_at, status_changed_by (FK set null); created_at, updated_at.
Indexes: unique `certifications_one_original_per_enrollment (enrollment_id) where renews_certification_id is null`; unique
`(renews_certification_id)`; unique `(reassessment_id)`; `(worker_id, status)`, `(shop_id, status)`, `(program_id, worker_id)`, `(expires_at)`.
`certification_status_events` (append-only history): id bigint identity; certification_id FK cascade; event CHECK in (issued, renewed,
suspended, revoked, reinstated, superseded, review_upheld); from_status / to_status; reason 20..500 (required for suspended, revoked,
reinstated, review_upheld); actor_id uuid (no FK), actor_role, actor_display_name; review_request_id null; created_at = now().
Guards (BEFORE, every session): insert only under the flag; P31 immutability; status only under the flag; events UPDATE / DELETE -> 42501
`Certification records cannot be edited.` except DELETE when the parent certification is already gone; certifications DELETE only when the
worker profile or enrollment row is already gone (cascade), else 42501. RLS: select for the row worker (role worker), or the issuing shop
current owner (`owner_id = auth.uid()` and `shops.owner_id = auth.uid()`); events through the parent rule; policies table owner-only;
deny-all writes. Normaliser trims reasons.
### 3.3 `2026_10_26_w7c_certification_reviews_and_reassessments.sql`
`certification_review_requests`: id; certification_id FK cascade; worker_id FK worker_profiles cascade; status CHECK open / reinstated /
upheld / withdrawn; worker_statement 20..1000; requested_at; decided_at, decided_by FK set null, decider_display_name, decision_reason 20..500;
withdrawn_at; consistency CHECK per status. Unique `one_open_per_certification where status = 'open'`; <= 3 rows per certification (RPC).
`certification_reassessments` (renewal by re-assessment, D-5): id; certification_id FK cascade; checklist_snapshot text[] (= the program
frozen `assessment_checklist`); items_met boolean[] same length, no nulls; result passed / failed; pass needs every item; failure_reason 10..300
exactly for failed; assessor_comment <= 500; assessed_by, assessor_role, assessor_designation_id, assessor_display_name (server-derived
through `lock_training_enrollment_for_recorder`); assessed_on (Manila today); recorded_at = now(). Append-only for every session; no
corrections: a mistake is followed by a new row; the latest row per certification is the current one. Then `alter table certifications add
constraint ... foreign key (reassessment_id)` and CHECK `(renews_certification_id is null) = (reassessment_id is null)`. RLS as 3.2.
### 3.4 `2026_10_26_w7d_certification_rules.sql` (helpers; internal unless stated)
`certification_effective_status(text, timestamptz, timestamptz)` (immutable, granted to authenticated); `certification_issuer_attestation_version()`
= 'w7_issuer_v1'; `shop_certification_validity_months(uuid)`; `certification_renewal_window_open(expires_at, at)` = at between expires_at - 60
days and expires_at + 90 days (D-22); `worker_holds_current_certification(p_worker uuid, p_at timestamptz default now())` (any shop, any
program, effective active; refuses a past p_at); `worker_has_live_certification_for_program(p_worker, p_program)` (active and not expired, or
suspended); `certification_evidence_snapshot(p_enrollment_id, p_assessment_id)` -> jsonb {snapshot_version 1, enrollment_id, program_id,
program_title, required_training_days, attended_training_days, attended_dates[], attendance_record_ids[], assessment_id, assessment_result,
assessed_on, assessor_role, assessor_display_name, checklist_snapshot[], items_met[], accepted_at} built from CURRENT (non-superseded) rows only;
renewal snapshots add {renews_certification_id, reassessment_id, reassessed_on, reassessor_role, reassessor_display_name, reassessment_items_met}.
`current_training_assessment_id(uuid)`; `certification_shop_verification_snapshot(uuid)`; `lock_certification_for_owner(uuid)` (row FOR UPDATE;
42501 `Certification not found.` unless role owner and current owner of the certification shop).
### 3.5 `2026_10_26_w7e_certification_issue_and_renew_rpcs.sql`
`issue_certification(p_enrollment_id uuid, p_expected_assessment_id uuid, p_issuer_attestation_version text) returns certifications`. Takes the
locks in global order, then checks IN THIS ORDER: role owner else 42501 `Only the shop owner can issue certifications.`; enrollment exists and
caller is the CURRENT owner of the program shop (`enrollment.owner_id = shops.owner_id = auth.uid()`) else 42501 `Training enrollment not
found.` (trainers, other owners, super_admin, workers, customers); `is_verified_shop_owner(shop)` else 23514 `Only a verified shop can issue
certifications.` (J3); attestation = 'w7_issuer_v1' else 23514 `Confirm the certification statement before issuing.`; enrollment `accepted`
AND `training_enrollment_is_completed` AND attended >= greatest(3, min_training_days) AND current assessment `passed`, all re-read after the
locks, else 23514 `This training is not completed. A certification needs at least 3 attended training days and a passed assessment.`;
current assessment id = p_expected_assessment_id else 55000 `The training record changed. Review it again.`; no original for this enrollment
else 23505 `A certification was already issued for this training.`; no live certification of this worker for this program else 23505 `This
worker already holds a current certification from this program.` Inserts with the evidence and verification snapshots; approver = auth.uid(),
assessor copied from the assessment row; status event `issued`.
`set_shop_certification_validity(p_shop_id uuid, p_validity_months integer) returns shop_certification_policies`: the current shop owner (role
owner) else 42501 `Shop not found.`; 1..36 else 23514 `Validity must be 1 to 36 months.`; affects only future issues and renewals.
`record_certification_reassessment(p_certification_id, p_items_met boolean[], p_result text, p_assessor_comment text default null,
p_failure_reason text default null)`: recorder through `lock_training_enrollment_for_recorder(certification.enrollment_id)` (current owner or
designated linked trainer, never the worker; W6 errors); certification status `active` (effective active or expired; not suspended, revoked,
superseded) else 23514 `This certification cannot be renewed.`; window open else 23514 `Re-assessment opens 60 days before expiry and closes
90 days after it.`; checklist rules as W6 (22023 / 23514).
`renew_certification(p_certification_id, p_reassessment_id, p_issuer_attestation_version)`: the issue owner, verification and attestation
checks; old row FOR UPDATE with status `active` and window open (else as above); latest reassessment = p_reassessment_id else 55000; it
`passed`, was recorded within the last 30 Manila days and is unused, else 23514 `Record a passed re-assessment first.`; original training
still completed else 23514 `The training record no longer shows completion.`; inserts the new row (same worker / enrollment / program /
assessment, new validity and snapshots, starts now), old row -> `superseded`; events `renewed` (new) and `superseded` (old).
### 3.6 `2026_10_26_w7f_certification_status_and_review_rpcs.sql`
`transition_certification(p_certification_id, p_from_status, p_to_status, p_reason)`; a stale `p_from_status` -> 55000 `This certification
changed. Refresh and try again.`; reason 20..500 else 23514 `Give a reason of 20 to 500 characters.`; anything else 42501 `This certification
status change is not allowed.`; a caller who is neither the worker nor the current owner of the issuing shop -> 42501 `Certification not found.`
| From (stored / effective) | To | Who | Condition |
|---|---|---|---|
| (none) | active | current owner of a verified program shop | `issue_certification` only |
| active, effective active | suspended | current owner of the issuing shop | reason; verification NOT required (protective action) |
| active (also effective expired), suspended | revoked | same | reason |
| suspended | active (reinstate) | same | reason; `shop_has_recorded_verification`; expiry unchanged (may then be effective expired) |
| active, renewal window open | superseded | same, verified | `renew_certification` only |
| revoked | active | same, verified | only through `decide_certification_review(..., 'reinstate', ...)` |
Everything else (out of revoked or superseded, same status, worker / trainer / other owner / super_admin / customer actor) is refused.
`request_certification_review(p_certification_id, p_statement)`: the certificate worker only; status suspended or revoked; within 30 days of
the latest suspended / revoked event else 23514 `The review period for this decision has ended.`; no open request (23505); <= 3 per
certification (23514). `withdraw_certification_review(p_request_id)`: worker; open -> withdrawn.
`decide_certification_review(p_request_id, p_decision, p_reason)`: current owner of the issuing shop; open -> `reinstated` (certification ->
active, event `reinstated`; needs a recorded verification) or `upheld` (no status change; event `review_upheld`); reason 20..500. A request on
a removed shop stays open (W11 admin queue, D-21).
### 3.7 `2026_10_26_w7g_certification_reads_and_apply_gate.sql`
Reads (definer, authenticated, `effective_status` computed with now(); no contact columns; display names = trimmed full_name else a role
label): `my_certifications()` (worker: every own row, status reason, shop and verification snapshots, `issuing_shop_present`,
`issuing_shop_currently_verified` (null when removed), `renewal_window_open`, `training_record_changed_after_issue` (originals: not
`training_enrollment_is_completed`), open review id); `certification_history(p_certification_id)` (events + review requests; worker or issuing
owner); `owner_certifications(p_shop_id)` (current owner; worker display name, effective status, flags, latest reassessment, open review);
`certifiable_enrollments(p_program_id)` (current owner; accepted enrollments with progress `completed` and no original certification: attended /
required days, current assessment id, assessed_on, assessor display name, validity months that would apply).
`applicant_verified_certifications(uuid)`: SAME signature, SAME authorisation (W5 window unchanged); body returns the applicant CURRENT
(effective active) certifications from any shop, ordered by issued_at desc; never suspended, revoked, expired or superseded rows, reasons or
history (D-20, W7-L4). `create or replace` of `job_application_apply_checks(uuid,uuid,uuid)`: SAME signature, every W5 check in the same
order, one new check right after the deadline check: `applicant_requirement = 'certification_required' and not
worker_holds_current_certification(p_worker_id)` -> 23514 `This opening needs a current shop-issued certification recorded on WashLink.`
(create and draft -> submit; trainees_welcome unaffected; no lock: a concurrent suspension is the documented race R3).
### 3.8 `2026_10_26_w7h_certification_audit_and_notifications.sql`
AFTER INSERT / UPDATE / DELETE producers on the five tables (definer, pinned, revoked). subject_type `certification` (subject_id certification,
subject_profile_id worker) and `shop_certification_policy`. Actions: `certification.issued`, `.renewed`, `.status_changed` (from_status,
to_status, changed_by owner / review_decision / trusted_session), `.review_requested`, `.review_decided` (decision word), `.review_withdrawn`,
`.reassessment_recorded` (result, item counts), `.deleted` (deleted_by `worker_profile_deleted` / `trusted_session`), `.shop_removed`
(shop_id -> null), `.training_record_changed`, `shop_certification_policy.updated` (validity_months). Payload keys only: certification_id,
enrollment_id, program_id, shop_id, renews_certification_id, from_status, to_status, decision, result, validity_months, attended_training_days,
required_training_days, items_met_count, items_total, changed_by, deleted_by.
New AFTER INSERT trigger `training_evidence_flag_certifications` on `training_attendance_records` and `training_assessments` (the only W6-side
object): when the enrollment has an active or suspended certification and `training_enrollment_is_completed` is now false -> audit
`certification.training_record_changed` + owner notification. It never changes the certification (D-24).
`enqueue_certification_expiry_notices(p_as_of timestamptz default now()) returns integer` (internal: revoked from every client role; trusted
or a future scheduler only; p_as_of < now() -> 22023): worker notice for effective active rows expiring within 30 days
(`certification_expiry:<id>:due`) and for rows expired at p_as_of (`certification_expiry:<id>:expired`); idempotent; W12 schedules it (D-25).
| Category | Recipient | Body (labels via `notification_safe_label`; never reasons, statements, names or dates) |
|---|---|---|
| certification.issued | worker | `<shop> issued you a shop-issued certification for <program>.` |
| certification.renewed | worker | `<shop> renewed your shop-issued certification for <program>.` |
| certification.suspended / .revoked | worker | `<shop> suspended / revoked your certification for <program>. Open it to see the reason and ask for a review.` |
| certification.reinstated | worker | `<shop> reinstated your certification for <program>.` |
| certification.review_requested | owner | `A worker asked for a review of a certification decision for <program>.` |
| certification.review_decided | worker | `<shop> reviewed your request for <program>: reinstated.` or `: decision kept.` |
| certification.training_record_changed | owner | `A training record for <program> changed after a certification was issued. Review it.` |
| certification.expiring / .expired | worker | `Your certification for <program> expires within 30 days.` / `Your certification for <program> has expired.` |
Keys `certification:<id>:<audit event id>`; trusted fixtures notify nobody; refused actions write nothing.

## 4. Decisions taken in this plan (RECORD adds D-20..D-25 to DECISIONS.md as ADOPTED-DEFAULT (loop, 2026-10-26))
D-20 (D-12 enforcement) `certification_required` openings refuse create and submit unless the worker holds a CURRENT shop-issued certification
from ANY shop (openings name no program). Existing applications are not touched: no auto-close, no transition block; owners see current
certifications only. Workers see the requirement and their own state before Apply.
D-21 Suspension / revocation: the current owner of the issuing shop, reason 20..500; suspension is reversible by reinstatement; revocation is
final except through a worker review request (30 days, <= 3 per certificate) decided by that owner (reinstate / uphold, with reason). Trainers
never issue or change status. super_admin review / escalation is W11.
D-22 Renewal (D-5): re-assessment against the original program checklist by the owner or a designated trainer, inside the window expiry - 60
days .. expiry + 90 days; renewal issues a NEW row starting now with the current shop validity; the old row is superseded. After the window
a new training enrollment is needed. Suspended / revoked certificates cannot be renewed.
D-23 (R-4) Loss of shop verification or shop / owner deletion does not change issued certificates; the issue-time snapshot stays; workers are
not notified (nothing changed for them); the worker sees "issuing shop no longer verified / no longer on WashLink" from live state.
D-24 Evidence corrected after issue never auto-suspends; the owner is notified and sees the flag; suspending is a human decision.
D-25 Expiry notices: function in W7, scheduling in W12; until then the UI shows expiry and "Expires soon" (<= 30 days).

## 5. Tests (pgTAP `plan(n)` = actual; 0 `todo_start(`; each file <= 350 lines)
Helpers in NEW `scripts/supabase-test/baseline/test_helpers_certifications.sql` (test_helpers.sql is at 347 lines): `test_helpers.complete_training
(p_shop, p_worker, p_owner_email) returns uuid` (program, 3 past supervised sessions, open, `create_accepted_enrollment` with a past accepted_at,
then attendance x3 + passed assessment through the REAL W6 RPCs as the owner) and `test_helpers.issue_test_certification(p_shop, p_worker,
p_owner_email) returns uuid` (calls `issue_certification` as the owner). The stager seeds both files in order (`sql_paths` gains the second
path; new stager test `stager_seeds_every_helper_file_in_order`).
`j6_worker_cannot_be_certified_without_three_days_and_assessment.test.sql` (J6 certification part): j6_no_certification_for_enrollment_only,
j6_no_certification_with_two_attended_days, j6_no_certification_while_awaiting_assessment, j6_no_certification_after_failed_assessment,
j6_no_certification_after_attendance_corrected_to_absent, j6_no_certification_after_pass_corrected_to_fail, j6_stale_assessment_id_rejected,
j6_certification_issued_after_three_days_and_pass, j6_certification_records_approver_assessor_enrollment_and_time,
j6_evidence_snapshot_matches_current_records, j6_issue_and_expiry_stamps_server_set_no_backdating, j6_default_validity_is_twelve_months,
j6_shop_validity_applies_to_new_issues_only, j6_issue_requires_attestation, j6_one_original_certification_per_enrollment,
j6_no_second_current_certification_for_same_program, j6_withdrawn_cancelled_or_shop_removed_enrollment_cannot_be_certified,
j6_issuer_kind_is_shop_issued_only, j6_no_issue_path_except_the_rpc (trusted insert without the flag -> 42501).
`j3_unverified_owner_cannot_issue_shop_certifications.test.sql` (J3 certification half): j3_pending_rejected_changes_requested_shop_cannot_issue,
j3_inactive_or_unreviewed_approved_shop_cannot_issue, j3_other_owner_cannot_issue_for_foreign_enrollment, j3_trainer_cannot_issue,
j3_worker_customer_super_admin_anon_cannot_issue, j3_owner_who_lost_verification_cannot_issue_renew_or_reinstate,
j3_owner_who_lost_verification_can_still_suspend_or_revoke, j3_issued_certification_survives_later_loss_of_verification,
j3_verification_snapshot_records_status_reviewer_time_and_event.
`j6_w7_certification_lifecycle.test.sql`: w7_suspend_and_revoke_require_reason, w7_reinstate_only_from_suspended_by_issuing_owner,
w7_revoked_is_final_without_review, w7_disallowed_transitions_rejected, w7_stale_status_rejected, w7_review_request_by_worker_within_30_days,
w7_one_open_review_and_at_most_three, w7_review_decision_reinstate_or_uphold_with_reason, w7_effective_status_expired_after_expiry (pure
function, future `at`), w7_reassessment_only_in_renewal_window_and_by_authorised_recorder, w7_renewal_requires_latest_recent_passed_reassessment,
w7_renewal_supersedes_old_and_starts_now, w7_suspended_or_revoked_cannot_be_renewed, w7_renewal_refused_when_training_no_longer_completed,
w7_status_history_append_only, w7_evidence_correction_after_issue_flags_and_never_suspends, w7_expiry_notice_function_idempotent_and_refuses_past.
`j8_unauthorized_users_cannot_alter_certification_records.test.sql` (J8 certification half): j8_cert_direct_writes_denied_for_clients_and_service_role,
j8_cert_issue_fields_and_snapshots_immutable_for_every_session, j8_other_owner_cannot_change_or_renew, j8_worker_cannot_change_own_certification,
j8_trainer_cannot_issue_or_change_status, j8_events_reviews_reassessments_append_only, j8_review_request_only_by_certificate_worker,
j8_review_decision_only_by_issuing_owner, j8_customer_super_admin_anon_cannot_change_certifications, j8_certifications_deleted_only_by_cascade.
`j4_w7_certification_required_openings.test.sql` (D-20): w7_certification_required_create_refused_without_current_certification,
w7_certification_required_draft_submit_refused_without_current_certification, w7_current_certification_from_any_shop_allows_apply,
w7_suspended_revoked_or_superseded_certification_does_not_allow_apply, w7_trainees_welcome_openings_unaffected,
w7_existing_application_unchanged_after_certification_revoked, w7_applicant_verified_certifications_returns_current_only,
w7_applicant_verified_certifications_authorisation_unchanged, w7_w5_apply_checks_keep_order_and_messages.
`j6_w7_certification_audit_and_notifications.test.sql`: w7_audit_written_for_every_certification_action, w7_audit_payload_has_no_reasons_names_or_dates,
w7_worker_notified_on_issue_renew_suspend_revoke_reinstate_and_decision, w7_owner_notified_on_review_request_and_record_change,
w7_notifications_idempotent_one_per_event, w7_notification_text_has_no_reason_statement_or_name, w7_refused_action_writes_nothing.
`j17_w7_certification_authorization.test.sql` (J17): j17_w7_tables_rls_enabled_and_no_client_write_privileges, j17_worker_reads_only_own_certifications,
j17_issuing_owner_reads_only_own_shop_certifications, j17_other_owner_sees_only_current_certs_inside_w5_window,
j17_reasons_and_statements_not_visible_to_other_owners, j17_customer_anon_super_admin_read_no_certification_rows, j17_w7_reads_have_no_contact_columns,
j17_w7_internal_functions_not_client_executable, j17_w7_rpcs_denied_to_anon, j17_w7_definer_functions_pin_pg_temp_last,
j17_w7_tables_not_in_realtime_publication, j17_w7_no_fee_columns_parameters_or_booking_references (P35).
`j18_w7_flows.test.sql` (J18): j18_w7_certifications_survive_shop_deletion, j18_w7_certifications_survive_owner_account_deletion,
j18_w7_worker_deletion_cascades_certifications_and_keeps_audit, j18_w7_training_flow_unchanged, j18_w7_trainees_welcome_apply_unchanged,
j18_w7_booking_quote_rating_and_verification_unchanged, j18_w7_shop_verification_decision_still_works.
Changed existing files (only these): `001_migration_replay.test.sql` (44 migrations, versions + 20261026000001..08, renamed
`replay_schema_migrations_has_baseline_w2_to_w7`, add `replay_w7_certification_tables_rls_enabled`);
`j4_worker_can_browse_and_apply_without_duplicates.test.sql` FIXTURE ONLY: the worker(s) applying to opening `b` (certification_required)
first receive a certification via `test_helpers.issue_test_certification`; no assertion text, count or name changes. Every other file
stays green unchanged.
Smoke `scripts/supabase-test/w7-api-smoke.mjs` (W6 rules: loopback, keys from `supabase status` in memory, synthetic local.test users deleted,
TEST-ONLY time shift of training evidence via `docker exec` psql as in W6, no `.env`): anon error / 0 rows per table; direct insert / patch /
delete denied for worker, owner, service_role; issue refused before completion, for an unverified shop and for a trainer; stale assessment
55000; issue ok with attestation; issued_at server-set, expires_at +12 months, patch denied; other owner reads nothing; cert-required apply
refused without, allowed with a current certificate; applicant RPC lists it; suspend needs a reason; apply then refused; review request +
reinstate; revoke; reassessment + renew supersedes; notifications carry no reason; `set_config` not exposed; owner deleteUser keeps the
certificate (D-18); worker deleteUser cascades + audit. Must end `0 failed`.
Vitest (mocked; suffixes `.j6`, `.j8`, `.j17`, `.w7`): j6_issue_button_only_for_completed_enrollments_without_certificate,
j6_issue_modal_shows_evidence_summary_and_requires_attestation, j6_stale_record_error_reloads_enrollment, j8_status_change_modal_requires_reason,
j8_worker_view_has_no_status_change_controls, j17_certification_repository_writes_only_through_rpcs,
w7_certification_copy_says_shop_issued_never_government_recognized (scans every copy constant), w7_my_certifications_shows_status_expiry_and_reason,
w7_expired_and_expiring_labels_from_server_status, w7_review_request_offered_only_within_window, w7_owner_actions_match_lifecycle,
w7_renew_offered_only_in_window_after_passed_reassessment, w7_training_record_changed_flag_shown_to_owner,
w7_apply_blocked_for_certification_required_without_current_certificate, w7_worker_certification_warning_uses_real_state,
w7_applicant_section_lists_current_certifications, w7_shop_validity_setting_validates_1_to_36, w7_certification_panels_loading_empty_error_states,
w7_certification_error_messages_mapped. Updated W5 tests (W5 REVIEW asked W7 to replace the "not available yet" state; names kept,
expectations switch to real-state copy): `ApplyOpeningRequirements.w5.test.tsx`, `MarketplaceOpeningDetail.w5.test.tsx`,
`ApplicantProfileDrawer.w5.test.tsx` (`w5_applicant_verified_certifications_shows_none_yet`). The other existing tests stay green unchanged.
## 6. Frontend (UI -> hooks -> services -> repositories -> Supabase; each file <= 350 lines)
Add: `domain/models/Certification.ts` (Certification, effective status, status event, review request, reassessment, certifiable enrollment,
shop policy); `domain/utilities/certificationLifecycle.ts` (per-actor actions from the SERVER effective status, mirroring 3.6; never computes
expiry); `domain/repositories/CertificationRepository.ts`; `infrastructure/supabase/supabaseCertificationRows.ts`;
`infrastructure/repositories/SupabaseCertificationRepository.ts` (reads) + `SupabaseCertificationActionRepository.ts` (RPC writes only,
`toUserFacingError`); `application/validation/certificationSchemas.ts` (reason 20..500, statement 20..1000, failure reason 10..300, validity
1..36); `application/services/{CertificationService, CertificationReviewService}.ts`; `presentation/utilities/{certificationDisplay,
certificationCopy}.ts` (labels Active, Expires soon, Expired, Suspended, Revoked, Renewed; badge "Shop-issued certification"; line "Issued by
SHOP through WashLink. Not a government-recognized credential."; attestation `w7_issuer_v1`: "I reviewed this worker's training record: the
required training days were attended and the assessment was passed. My shop issues this certification on WashLink. It is a shop-issued
certification, not a government-recognized credential or licence." = the owner confirmation, not a signature);
`presentation/dependencyInjection/createCertificationDependencies.ts`; hooks `useMyCertifications`, `useOwnerCertifications`,
`useCertifiableEnrollments`, `useCertificationHistory`, `useCertificationActions`, `useShopCertificationPolicy` (`usePollWhileVisible`, 60 s).
Components: shared `components/certifications/{CertificationStatusBadge, CertificationCard, CertificationHistoryList, ShopIssuedNotice}`;
owner `components/owner/certifications/{OwnerCertificationsPanel (per shop, status filter, "Training record changed after issue" flag, open
reviews first), IssueCertificationModal (days attended of required, assessment result / assessor / date, checklist, validity that applies,
attestation checkbox), CertificationStatusChangeModal (suspend / revoke / reinstate + reason), RecordReassessmentModal, RenewCertificationModal,
CertificationReviewDecisionModal, ShopCertificationValiditySection}`; worker `components/worker/certifications/{MyCertificationsPanel (status,
expiry, issuing shop, verification at issue, reason when suspended / revoked, history; empty "No certifications yet. A shop issues one after
you complete its required training and pass the assessment."), RequestCertificationReviewModal}`.
Change: `features/worker/{workerWorkspaceView.ts, WorkerWorkspaceTabs.tsx}` (tab "My certifications"); `owner/OwnerDashboardContent.tsx` (lazy
"Certifications" tab); `components/training/TrainingRosterPanel.tsx` ("Issue certification" on certifiable rows);
`owner/applicants/ApplicantVerifiedCertificationsSection.tsx` + `utilities/jobApplicationDisplay.ts` (real list; empty "Verified
certifications: none" / "No current shop-issued certification is recorded on WashLink for this applicant. Skills above are self-reported.");
`domain/models/VerifiedCertification.ts` (drop the W5 "unavailable" constant); `utilities/workforceNoticeCopy.ts` (real state; D-20 copy "This
opening needs a current shop-issued certification recorded on WashLink. You do not have one, so you cannot apply yet. Openings that welcome
trainees are open to you."); `worker/marketplace/{ApplyToOpeningModal, MarketplaceOpeningDetail}.tsx` (Apply disabled with that copy);
`createDashboardDependencies.ts`, `createWorkerMarketplaceDependencies.ts`; `supabaseErrorMessages.ts` (every section-3 message).
## 7. Docs
Add `docs/workforce/CERTIFICATIONS.md` (P30-P36, tables, state machine, issue checks, renewal, review, D-18 retention, visibility, D-20,
limitations, rollback). Update `AUDIT_AND_NOTIFICATIONS.md` (3.8); `MARKETPLACE_AND_APPLICATIONS.md` (P22 now real; D-20 refusal row);
`TRAINING.md` (W7 carry-forward closed; new evidence trigger); `ROLE_AND_PROFILE_SECURITY.md` (guard matrix; D-10 rows 33 no pre-existing
certification objects, 34 w7a columns, 35 replaced W5 function bodies vs production); `LOCAL_TEST_HARNESS.md` (44 migrations, second helper
file, W7 smoke); `LEGAL_REVIEW_REGISTER.md` (W7-L1..L11 OPEN; notes on W0-L5, W2-L4, W3-L4, W3-L5, W4-L5, W5-L5, W5-L11, W6-L6, W6-L13, all
still OPEN). RECORD adds the W7 smoke row and the stager count to LOOP.md and D-20..D-25 to DECISIONS.md.
## 8. Check commands (repo root, local only)
`cd frontend && npm run lint`, `npm run build`, `npm test`; `backend/.venv/Scripts/python.exe -m pytest -q`; `node --test scripts/supabase-test/stage-local-workdir.test.mjs`;
`node scripts/supabase-test/run-db-tests.mjs`; then `w2-` .. `w7-api-smoke.mjs`; stop with `--workdir .local-supabase-test --no-backup`. Never `--linked`, `--db-url`, `db push`.
## 9. Acceptance criteria
| AC | Criterion | Evidence |
|---|---|---|
| AC1 | 8 new migrations `2026_10_26_w7[a-h]_<snake>.sql`, each with `-- ROLLBACK`; no committed migration changed | `ls supabase/migrations/2026_10_26_w7*`; `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_26_w7*` empty; `git diff --name-status d26865d -- supabase/migrations` only `A` |
| AC2 | Clean replay of 44 migrations; suite PASS; 0 TODO | runner `Result: PASS`; `replay_schema_migrations_has_baseline_w2_to_w7`, `replay_w7_certification_tables_rls_enabled`; `grep -c "todo_start(" supabase/tests/database/*.sql` all 0 |
| AC3 | J6 certification part: only from >= 3 distinct attended days + current passed assessment, re-checked under locks; approver, time, enrollment, assessor, snapshots | every `j6_*` name in the J6 certification file; Vitest `j6_*` |
| AC4 | J3 certification half: only the current owner of a shop with a recorded verification issues / renews / reinstates; later loss does not void | every `j3_*` name in the J3 certification file; smoke unverified-shop check |
| AC5 | J8 certification half: no client writes; issued facts immutable for every session; only the authorised actor changes status | every `j8_*` name in the J8 certification file; Vitest `j8_*`; smoke patch / delete denied |
| AC6 | Expiry derived; renewal by re-assessment (D-5, D-22); suspend / revoke / reinstate / review with reasons (D-21); no backdating | every `w7_*` name in `j6_w7_certification_lifecycle`; `j6_issue_and_expiry_stamps_server_set_no_backdating` |
| AC7 | D-20 apply gate and real applicant read path | every `w7_*` name in `j4_w7_certification_required_openings`; j4 file passes and `git diff d26865d -- supabase/tests/database/j4_worker_can_browse_and_apply_without_duplicates.test.sql` changes no `is(` / `ok(` / `throws_ok(` / `plan(` line |
| AC8 | Audit and notifications idempotent; no reasons, names or dates | every name in `j6_w7_certification_audit_and_notifications` |
| AC9 | J17 authorization and PostgREST surface | every name in `j17_w7_certification_authorization`; Vitest `j17_certification_repository_writes_only_through_rpcs`; `w7-api-smoke.mjs` ends `0 failed`; W2 48, W3 33, W4 43, W5 39, W6 40 still `0 failed` |
| AC10 | Shop-issued label, never government-recognized | `j6_issuer_kind_is_shop_issued_only`; Vitest `w7_certification_copy_says_shop_issued_never_government_recognized`; `grep -rniE "government[- ]recogni[sz]ed" frontend/src supabase/migrations/2026_10_26_w7*` hits only the negated disclaimer |
| AC11 | D-18 retention and J18 regression | every name in `j18_w7_flows`; every pre-W7 pgTAP file `ok`; `git diff --stat d26865d -- supabase/tests/database` only new files plus the two named files; pytest `4 passed`; stager 18 + 1 new pass |
| AC12 | Frontend | every section-5 Vitest name and the existing 128 pass (3 W5 files updated as listed); lint and build exit 0; `grep -rn "service_role" frontend/src` empty |
| AC13 | Size, safety, docs, legal | `wc -l` of every added / changed file <= 350; no `.env` read; `git diff --stat d26865d -- backend` empty; section 7 docs exist; `grep -c "W7-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` >= 11 |
## 10. Rollback
Per-file `-- ROLLBACK` blocks in reverse order h..a, local stack only. h: producers, the training evidence trigger, the expiry function (audit
rows and notifications stay). g: drop the reads; restore the W5 bodies of `applicant_verified_certifications` (zero rows) and
`job_application_apply_checks` (verbatim copies in the block; re-opens D-12). f, e: RPCs. d: helpers. c: reviews and reassessments (drop the
certifications FK first). b: certifications, events, policies (IRREVERSIBLE loss of issued records; export with a trusted `copy` first).
a: nothing. Stager: revert the second `sql_paths` entry. Frontend: revert.
## 11. Risks and legal-review flags
R1 (D-10 rows 33-35) production drift; w7a aborts on missing objects. R2 effective status uses the DB clock; expiry notices unscheduled until
W12 (D-25). R3 the D-20 apply check reads certificate state without a lock. R4 an audit failure aborts the action, cascades included. R5 flags
rely on PostgREST not exposing `set_config`; trusted SQL can set the flag (not tamper-proof, W6-L5). R6 worker account deletion removes their
certificates (audit stays). R7 time-shift fixtures exist only in test helpers and the smoke. R8 a certificate whose training record was later
corrected stays valid until the owner acts (D-24).
Legal (to `LEGAL_REVIEW_REGISTER.md`, all OPEN; no compliance claim in UI or docs): W7-L1 whether a private shop may issue something called a
"certification"; naming vs TESDA National Certificates; adequacy of the disclaimer (W0-L5, W4-L5). W7-L2 validity 12 months, per-shop 1..36,
renewal by re-assessment only, window -60 / +90 days. W7-L3 suspension / revocation fairness: the issuing owner decides and reviews (no
independent review until W11); 30-day window; reasons may defame or hold sensitive personal data. W7-L4 other owners see only current
certificates, never suspensions or revocations (privacy vs safety disclosure). W7-L5 D-20 hiring gate and cross-shop recognition: fairness
and discrimination (W5-L5, W5-L11). W7-L6 later loss of shop verification never voids certificates and workers are not told (W2-L4, W3-L4);
authoritative approver record (W3-L5, both kept). W7-L7 corrected evidence after issue: no auto-suspension; workers cannot dispute records
(W6-L13). W7-L8 retention after shop / owner deletion with name snapshots; removal with the worker account; export rights (RA 10173). W7-L9
issuer attestation `w7_issuer_v1` is the owner confirmation, never a signature or a WashLink compliance statement. W7-L10 unscheduled expiry
notices; an expired certificate silently stops counting for D-20. W7-L11 no public or third-party verification channel.
