# W6 - Training programs, attendance, assessment, free-training rule - PLAN

Spec: D (training; free-training requirement), A (verified shop), C (accepted offers -> required training), G, I, J6 (training part), J7, J8,
J17, J18. Depends on W5 (`passed`, STATE.md, HEAD caca376). Decisions: D-4 ADOPTED-DEFAULT (owner + owner-designated trainers recorded per
program), D-7 ADOPTED-DEFAULT (optional training pay / reimbursement, owner-entered, shown verbatim); D-3/D-5/D-6 not needed. D-10 (local proof
only) and D-11 (staged 14-digit copies) apply. Not BLOCKED. Closes carry-forwards C2 (attendance keyed by enrollment + session, one row per
date, >= 3 distinct attended days), C6 (notice acknowledgement, agreed-terms snapshot, optional pay on the enrollment; no charge path), C7 (W6
half: no customer-booking assignment during required training), C-W3-1 (attendance / assessment evidence in their own immutable tables).

## 1. Scope / out of scope
In: `training_programs`, `training_program_trainers` (D-4), `training_sessions`, `training_enrollments`, `training_attendance_records`,
`training_assessments`; RPC-only writes with BEFORE guards and RLS; program and enrollment state machines in DB functions; progress DERIVED
from evidence (security-invoker view + internal completion predicate for W7); append-only evidence with corrections as superseding rows plus a
reason; free-training CHECKs; booking-assignment gate (C7); audit + notifications (W3 pattern); owner, trainer and worker UI; pgTAP J6/J7/J8/
J17/J18, Vitest, w6 smoke, docs, legal register.
Out (reason): certifications and their issuance (W7 consumes `training_enrollment_is_completed`); contracts and paid-work terms (W9; an
accepted enrollment is not a contract); roster-sourced or open self-enrollment (decision 4.1); optional / refresher training kinds and any
non-zero training fee (legal review first, 4.5); occupational-safety modelling (W6-L7); super_admin read / moderation (W11); email/SMS/push and
Realtime (W12; polling stays); scheduler-driven reminders. No production apply, no `.env`, no SQLAlchemy/Alembic tables.

## 2. Design principles (continue P1-P23)
P24. Every write to a training table goes through a definer RPC under a transaction-local flag `washlink.training_write` = row id (P6/P19).
No client role (anon, authenticated, service_role) has INSERT/UPDATE/DELETE; write policies are deny-all. Trusted SQL may repair programs,
sessions and enrollments (audited `trusted_session`), never evidence (P26) and never a written snapshot (P27).
P25. Completion is never stored. `training_enrollments.status` has no `completed`/`failed` value; progress is computed from current evidence
rows only: >= `min_training_days` (CHECK >= 3) DISTINCT dates of `present` attendance on non-cancelled `supervised_training` sessions AND the
current assessment `passed`. Passage of calendar time, enrollment or a generic button never completes anything.
P26. Evidence (`training_attendance_records`, `training_assessments`) is append-only for EVERY session (trusted, service_role, superuser
via the trigger): UPDATE -> 42501 `Training records cannot be edited. Record a correction instead.`; DELETE only when the parent enrollment is
already gone (FK cascade). A correction is a new row with `supersedes_id` and a required `correction_reason`; a row can be superseded once.
P27. `terms_snapshot` on an enrollment is write-once (null -> value at acceptance), for every session, trusted included.
P28. Required initial training is free to the worker: `worker_fee` is forced to 0 by CHECK for every session; no fee, charge, deduction or
price column or RPC parameter exists; no training object references `bookings` or `shop_pricing` except the read-only C7 gate.
P29. Recorder identity is server-derived (`auth.uid()`, role `owner`/`trainer`, the authorising designation id); dates are server-derived
(attendance date = the session date, assessment date = Manila today). Audit payloads carry ids, status words and counts only, never ISO dates
(phone-shaped under the W3 rule), notes, comments, reasons, terms or names.

## 3. Migrations (staged 20261025000006..14; each ends with `-- ROLLBACK`; each <= 350 lines)
Names `2026_10_25_w6<x>_<snake>.sql`, idempotent, `notify pgrst, 'reload schema';` last. Every function `set search_path = public, pg_temp`;
`revoke all ... from public, anon` (+ `authenticated`, `service_role` for trigger/internal); client RPCs `grant execute ... to authenticated`.
Lock order everywhere: training_programs row -> training_enrollments row -> advisory `training_evidence:<enrollment_id>`. All six tables are
dropped from `supabase_realtime` if present (NOTICE on FOR ALL TABLES). Table comments start `W6:`.
### 3.1 `2026_10_25_w6a_training_preflight.sql` (creates nothing)
Abort naming every missing item: `shops.{id, owner_id, name, address}`, `workers.{id, owner_id, user_id}`, `bookings.{id, shop_id,
assigned_worker_id, booking_status}`, `worker_profiles.profile_id`, `profiles.{id, role, full_name}`, `job_applications.{id, shop_id,
owner_id, worker_id, status}`, `workforce_audit_events.{id, action, subject_type, subject_id}`; functions `record_workforce_audit_event(text,
text,uuid,uuid,jsonb)`, `enqueue_notification_safely(uuid,text,text,text,text,text,uuid)`, `notification_safe_label(text,text)`,
`is_verified_shop_owner(uuid)`, `shop_has_recorded_verification(uuid)`, `current_user_profile_role()`, `is_trusted_db_session()`,
`is_orphaned_fk_set_null(regclass,jsonb,jsonb)`, `normalize_worker_text_list(text[],integer,text)`. Abort if any `public.training_*` table
exists without a `W6` comment (D-10 row 29). Rollback: nothing.
### 3.2 `2026_10_25_w6b_training_programs_and_trainers.sql`
`training_programs`: id uuid PK; shop_id FK shops on delete cascade, immutable; owner_id FK profiles on delete cascade, copied from the shop;
title 3..120; objectives 1..2000; skills_to_learn text[] (normalised, <= 20 x 80); terms 1..4000 (agreed training terms as typed by the owner);
`training_kind` text not null default 'required_initial' CHECK in ('required_initial') (4.5); `min_training_days` smallint not null default 3
CHECK (between 3 and 30); assessment_checklist text[] (1..30 items, each 3..200); `worker_fee numeric(10,2) not null default 0` with
`tp_required_initial_training_is_free CHECK (training_kind <> 'required_initial' or worker_fee = 0)` and `tp_worker_fee_is_zero CHECK
(worker_fee = 0)`; optional pay (D-7, NO defaults, stored exactly as entered): training_pay_amount numeric(10,2) > 0, training_pay_currency
CHECK ('PHP'), training_pay_period CHECK in ('day','session','program'), training_pay_details <= 500, reimbursement_details <= 500;
`tp_pay_all_or_nothing` (amount, currency, period all null or all set; details may stand alone); status CHECK in (draft, open, closed,
archived) default draft; owner_attestation_version CHECK ('w6_owner_v1') and owner_attested_at, both set when status is not draft;
schedule_changed_at, status_changed_at, opened_at, created_at, updated_at (server stamps). Indexes (shop_id, status), (owner_id, status). At
most 50 non-archived per shop (23514). Content columns change only while draft (42501 `An open training program cannot be edited.`).
`training_program_trainers` (D-4): id; program_id FK cascade; trainer_id FK profiles cascade; roster_worker_id FK workers on delete set null (P9 orphan null; authority ends);
designated_by, designated_at, revoked_by, revoked_at (one-way null -> value; nothing else ever changes). UNIQUE (program_id, trainer_id)
where revoked_at is null. Designation needs: caller is the current shop owner; the roster row belongs to that owner and has `user_id` set
(worker-consented link, C8) with role worker; that worker has no live enrollment in the program. `is_authorised_training_recorder(
p_program_id) returns text` (internal, definer): `owner` when role owner AND `shops.owner_id = auth.uid()` = program.owner_id; `trainer` when
role worker AND an unrevoked designation exists AND the roster link (workers.id, user_id = auth.uid(), owner_id = program.owner_id) still
exists; else null. Guards `training_programs_guard_write`, `training_program_trainers_guard_write` (flag / trusted / cascade as P24; ids and
stamps frozen). RLS select on programs: owner, own rows in every status; trainer with an unrevoked designation (non-draft); a worker holding
any enrollment row in the program. Trainers table: the program owner; the trainer self. Rollback: drop policies, triggers, functions, tables.
### 3.3 `2026_10_25_w6c_training_sessions_and_enrollments.sql`
`training_sessions`: id; program_id FK cascade; session_date date; start_time, end_time time (optional; end > start); location <= 200
(optional); `session_kind` CHECK in ('supervised_training','competency_assessment') (records the training vs work distinction per day; no
productive-work value exists); status CHECK in (scheduled, cancelled); cancel_reason 10..300 (set exactly when cancelled); cancelled_by,
cancelled_at, created_at. UNIQUE (program_id, session_date) where status = 'scheduled'. Added only with session_date between Manila today and
today + 365; <= 30 scheduled per program; never edited (cancel + add); cancel refused once any attendance row references it (42501 `Attendance
was recorded for this session; it cannot be cancelled.`); delete only while the program is draft. Every add / cancel stamps the program `schedule_changed_at`.
`training_enrollments`: id; program_id FK cascade; shop_id, owner_id copied, immutable; worker_id FK worker_profiles(profile_id) cascade;
job_application_id FK job_applications on delete set null (P9 passes the orphan null); status CHECK in (invited, accepted, declined,
withdrawn, cancelled) default invited (no completed / failed value, P25); invited_by, invited_at, responded_at, accepted_at, ended_at,
status_changed_at; notice_version CHECK ('w6_v1'), notice_acknowledged_at; terms_snapshot jsonb object <= 64 KB, terms_snapshot_taken_at
(P27); cancel_reason 10..300; created_at, updated_at. `te_lifecycle_consistency`: accepted_at, notice_version, notice_acknowledged_at,
terms_snapshot, terms_snapshot_taken_at all null or all set; set for accepted and withdrawn, null for invited and declined; declined has
responded_at; withdrawn and cancelled have ended_at; cancelled after acceptance has cancel_reason. UNIQUE (program_id, worker_id) where
status in ('invited','accepted'); indexes (worker_id, status), (program_id, status), (owner_id, status). <= 100 live per program, <= 10 live
per worker (23514). Snapshot `training_enrollment_terms_snapshot(program)` (internal): snapshot_version 1, shop name / address, every program
content column under its name (worker_fee included, always 0), owner_attestation_version, notice_version, scheduled sessions [{session_id,
session_date, start_time, end_time, session_kind, location}], schedule_changed_at. RLS select: worker own rows; the program owner; trainers of
the program (accepted rows only). Sessions select: same audience as the program. Rollback: drop policies, triggers, functions, tables.
### 3.4 `2026_10_25_w6d_training_evidence_and_progress.sql`
`training_attendance_records`: id; enrollment_id FK cascade; session_id FK training_sessions (no action: a program cascade removes attendance in the same statement); session_date (copied from the session; the
trigger rejects a mismatch); attendance_status CHECK in ('present','absent'); progress_note <= 500 (optional per-day progress, spec D);
recorded_by uuid not null (no FK, P11), recorder_role CHECK in ('owner','trainer'), recorder_designation_id (plain uuid, no FK; set exactly for trainers);
recorded_at forced now(); supersedes_id FK self; correction_reason 10..300, set exactly when supersedes_id is set. UNIQUE (enrollment_id,
session_id) where supersedes_id is null; UNIQUE (enrollment_id, session_date) where supersedes_id is null (C2); UNIQUE (supersedes_id)
(linear chain); a correction copies enrollment, session and date of the row it supersedes (trigger).
`training_assessments`: id; enrollment_id FK cascade; checklist_snapshot text[] (= program checklist at recording); items_met boolean[]
(same length); result CHECK in ('passed','failed'); `ta_pass_requires_every_item` CHECK (result = 'failed' or not (false = any(items_met)));
assessor_comment <= 500; assessed_by, assessor_role, assessor_designation_id (plain uuids, no FK), assessed_on date (Manila today, server), signed_off_at forced
now(); supersedes_id, correction_reason (as above); UNIQUE (supersedes_id). "Signed off" means recorded by an authorised owner or trainer;
it is never an electronic signature and the UI never calls it one.
Guards (every session, P26): UPDATE -> 42501; DELETE only when the enrollment row no longer exists; INSERT only under the flag. Current row =
not superseded by any other row. View `training_enrollment_progress` (`security_invoker = true`, RLS applies): enrollment_id, program_id,
worker_id, enrollment_status, required_training_days, attended_training_days, has_recorded_attendance, current_assessment_id,
current_assessment_result, progress_status. progress_status: invited -> `invited`; declined / withdrawn / cancelled -> the same word;
accepted with attended < required -> `scheduled` if no current attendance row exists, else `in_progress`; attended >= required -> no current
assessment `awaiting_assessment`, passed `completed`, failed `failed`. `training_enrollment_is_completed(p_enrollment_id) returns boolean`
(internal, definer, same rule; used by W7 and the C7 gate). Rollback: drop view, functions, triggers, tables (evidence loss; export first).
### 3.5 `2026_10_25_w6e_training_program_rpcs.sql`
`create_training_program(p_shop_id, p_title)`; `update_training_program_draft(p_program_id, p_title, p_objectives, p_skills_to_learn,
p_terms, p_min_training_days, p_assessment_checklist, p_training_pay_amount, p_training_pay_currency, p_training_pay_period,
p_training_pay_details, p_reimbursement_details, p_expected_updated_at)` (no fee argument, P28; stale -> 55000 `This training program
changed. Refresh and try again.`); `delete_training_program_draft(p_program_id)`; `add_training_session(p_program_id, p_session_date,
p_session_kind, p_start_time, p_end_time, p_location)`; `cancel_training_session(p_session_id, p_reason)`;
`delete_training_session_draft(p_session_id)`; `transition_training_program(p_program_id, p_from_status, p_to_status,
p_owner_attestation_version default null)`; `designate_training_trainer(p_program_id, p_roster_worker_id)`;
`revoke_training_trainer(p_designation_id)`. Any caller other than the current owner of the program shop -> 42501 `Training program not found.`

| From | To | Who | Condition |
|---|---|---|---|
| (none) | draft | shop owner (role owner) | own shop; <= 50 non-archived |
| draft | (deleted) | owning owner | draft only (no enrollments can exist) |
| draft | open | owning owner | `is_verified_shop_owner`; title, objectives, terms, >= 1 checklist item; >= min_training_days distinct scheduled `supervised_training` dates, all >= Manila today; `p_owner_attestation_version = 'w6_owner_v1'` else 23514 `Confirm the free-training statement before opening.` |
| open | closed | owning owner | none (no new invitations; enrolled workers continue; evidence can still be recorded) |
| closed | archived | owning owner | no enrollment that is invited, or accepted with progress scheduled / in_progress / awaiting_assessment |

Everything else (same status, backwards, reopening, draft -> closed / archived) -> 42501 `This training program status change is not
allowed.` for every end user, super_admin included. Sessions: add and cancel while draft or open. Owner attestation (shown at open, stored by
version only): "I confirm this required initial training is free for the worker: no training fee and no deduction from any pay. Trainees do
supervised practice and assessment only; my shop will not assign them to customer bookings or use them in place of paid staff during the
training. Any training pay or reimbursement shown is what my shop will provide." It is the owner's own confirmation, not a signature and not a WashLink compliance statement.
### 3.6 `2026_10_25_w6f_training_enrollment_rpcs.sql`
`training_enrollment_notice_version()` = 'w6_v1' (immutable, authenticated). `invite_to_training(p_program_id, p_job_application_id)`,
`respond_to_training_invitation(p_enrollment_id, p_accept boolean, p_notice_version default null, p_expected_schedule_changed_at default
null)`, `withdraw_from_training(p_enrollment_id)`, `cancel_training_enrollment(p_enrollment_id, p_reason default null)`. A caller who is
neither the row worker nor the current program owner -> 42501 `Training enrollment not found.`

| From | To | Who | Condition / stamps |
|---|---|---|---|
| (none) | invited | owning owner | program open; `is_verified_shop_owner`; application `accepted` at the same shop and owner (4.1); worker is not an unrevoked trainer of the program; >= min_training_days distinct scheduled supervised dates >= Manila today; no live enrollment (23505 `This worker already has a live enrollment in this program.`); limits |
| invited | accepted | worker (self) | program open; `p_notice_version = 'w6_v1'` else 23514 `Review the free-training notice before enrolling.`; `p_expected_schedule_changed_at` equals the program value else 55000 `This training program changed. Review it again.`; enough upcoming days (23514 `This program does not have enough upcoming training days.`); stamps accepted_at, notice_acknowledged_at, terms snapshot |
| invited | declined | worker (self) | any program status; responded_at |
| invited | cancelled | owning owner | invitation withdrawn; ended_at |
| accepted | withdrawn | worker (self) | progress not completed / failed (a worker may always leave unfinished training); ended_at |
| accepted | cancelled | owning owner | progress not completed / failed; `p_reason` 10..300 else 23514; ended_at |

Everything else -> 42501 `This training enrollment change is not allowed.` (super_admin included). An invitation or an acceptance is not a
contract, an employment offer or a certification.
### 3.7 `2026_10_25_w6g_training_evidence_rpcs_and_reads.sql`
`record_training_attendance(p_enrollment_id, p_session_id, p_attendance_status, p_progress_note default null)`: recorder per
`is_authorised_training_recorder`, and never the enrollment worker, else 42501 `Only the shop owner or a designated trainer can record
training.`; enrollment accepted (23514 `Attendance can be recorded only for an accepted enrollment.`); session scheduled, same program;
session_date <= Manila today (23514 `This session has not happened yet.`) and >= the Manila date of accepted_at (23514 `This session was
before the worker enrolled.`); duplicate -> 23505 `Attendance for this day is already recorded. Record a correction instead.`
`correct_training_attendance(p_attendance_id, p_attendance_status, p_progress_note, p_correction_reason)`: current row only (23505 `This
record was already corrected.`); reason 10..300; must change the status or the note; same recorder rule; enrollment accepted.
`record_training_assessment(p_enrollment_id, p_items_met boolean[], p_result, p_assessor_comment default null)`: recorder rule; accepted
enrollment; attended_training_days >= min (23514 `The worker has not attended the required training days yet.`); no current assessment
(23505 `An assessment is already recorded. Record a correction instead.`); array length = checklist length (22023); pass needs every item
(23514 `A pass needs every checklist item met.`). `correct_training_assessment(p_assessment_id, p_items_met, p_result, p_assessor_comment,
p_correction_reason)`: current row; reason; same checks; also the re-assessment path after more training (4.6).
Reads (definer, authenticated): `training_roster_for_program(p_program_id)` (owner / authorised trainer: enrollment_id, display_name =
trimmed full_name else 'Trainee', progress columns; no contact or profile fields); `training_evidence_for_enrollment(p_enrollment_id)`
(worker self, owner, authorised trainer: attendance and assessment rows incl. superseded ones, `recorded_by_display_name` = trimmed full_name
else 'Shop owner' / 'Trainer'); `trainers_for_training_program(p_program_id)` (owner, trainers, enrolled worker: designation id,
display_name, designated_at, revoked_at). Anyone else -> 42501 `Training program not found.` / `Training enrollment not found.`
### 3.8 `2026_10_25_w6h_training_booking_assignment_gate.sql` (C7)
`roster_worker_in_required_training(p_worker_row_id uuid) returns boolean` (internal, definer, stable): the roster row has user_id set AND an
`accepted` enrollment exists with `owner_id = workers.owner_id`, training_kind `required_initial` and progress scheduled / in_progress /
awaiting_assessment. New trigger `bookings_guard_training_assignment` BEFORE UPDATE on bookings, WHEN (assigned_worker_id changes to a
non-null value, or booking_status changes to `in_progress`); separate from `guard_booking_update` (W2c body untouched). Trusted sessions
bypass; everyone else, super_admin included: assigning such a roster row -> 23514 `This worker is in required training with your shop and
cannot be assigned to customer bookings until the training ends.`; the assigned worker starting such a booking -> 23514 `You are in required
training with this shop and cannot start customer bookings until the training ends.` Read-only: never writes bookings, prices or training
rows. Unlinked roster rows, other owners' trainees and invited / declined / withdrawn / cancelled / completed / failed enrollments are not
affected. Rollback: drop the trigger and both functions.
### 3.9 `2026_10_25_w6i_training_audit_and_notifications.sql`
AFTER INSERT / UPDATE / DELETE producers on all six tables (definer, internal). subject_type `training_program` or `training_enrollment`;
subject_profile_id = the worker (enrollment and evidence events), the trainer (designation events), else the owner. Payload keys only:
training_program_id, shop_id, enrollment_id, session_id, from_status, to_status, session_kind, attendance_status, result, recorder_role,
is_correction, attended_training_days, required_training_days, items_met_count, items_total, changed_by, deleted_by. Notification keys
`training_<kind>:<row id>:<audit id>`; labels `notification_safe_label(title, 'A training program')` and `(shop name, 'The shop')`; texts
carry no dates, pay, terms, notes, comments, reasons or names.

| Event | Audit action | Notification (recipient: title / body) |
|---|---|---|
| program created / status changed / draft deleted | `training_program.created`, `.status_changed`, `.deleted` | none |
| session added / cancelled while open | `training_session.added`, `.cancelled` | each invited or accepted worker: "Training schedule changed" / "<program> at <shop> has a schedule change. Check the dates." |
| trainer designated / revoked | `training_trainer.designated`, `.revoked` | trainer: "Trainer role" / "You are a trainer for <program>." or "You are no longer a trainer for <program>." |
| invited | `training_enrollment.invited` | worker: "Training invitation" / "<shop> invited you to <program>. Read the free-training notice before you decide." |
| accepted / declined / withdrawn | `training_enrollment.status_changed` (changed_by worker) | owner: "Training response" / "A worker accepted / declined / left <program>." |
| cancelled by owner | same (changed_by owner) | worker: "Training cancelled" / "<shop> cancelled your enrollment in <program>." |
| attendance recorded / corrected | `training_attendance.recorded` / `.corrected` | correction only, worker: "Training record corrected" / "A training record for <program> was corrected." |
| assessment recorded / corrected | `training_assessment.recorded` / `.corrected` | worker: "Training assessment" / "<program>: assessment recorded, Passed. Training completed." or "Not passed."; owner too when a trainer recorded it |
| cascade / trusted deletes | `.deleted`, deleted_by = worker_profile_deleted / program_removed / trusted_session | none (W6-L5) |

Final block: the w3a pin assertion repeated (abort on a miss). Rollback: drop triggers and functions (audit rows, notifications stay).

## 4. Decisions taken in this plan (RECORD adds D-15..D-19 to DECISIONS.md as ADOPTED-DEFAULT)
4.1 (D-15) Enrollment source: an owner invitation from an `accepted` W5 application at the same shop and owner, then worker acceptance after
the notice (spec C: accepted offers lead to required training). No roster-sourced or self-enrollment in W6.
4.2 (D-16) Trainers (D-4): a worker account linked to the owner roster (consented link), designated per program; revocation is one-way;
unlinking ends authority; past evidence keeps its designation id. No trainer acceptance step (W6-L4).
4.3 (D-17) C7 gate: same owner, required initial, accepted, progress not completed / failed; assigning and starting a booking refused;
a booking already in progress may still complete. Contract gating of paid work is W9.
4.4 (D-18) Evidence follows the W5 cascade (shop, owner or worker profile deletion removes it; audit rows stay); retention is W5-L10 / W6-L5.
4.5 (D-19) Only `required_initial` exists and every fee is 0; another kind or any fee needs legal review and a new migration.
4.6 Re-assessment after a fail is a correction row with a reason; a new program run is the other path. No separate retake flow.
## 5. Tests (pgTAP `plan(n)` = actual; 0 `todo_start(`; each file <= 350 lines)
Seed helpers (test_helpers.sql only, trusted session, never a migration): `create_training_program(p_shop, p_days default 3)`,
`add_training_session(p_program, p_date, p_kind default 'supervised_training')`, `open_training_program(p_program)`,
`designate_trainer(p_program, p_roster_row)`, `create_accepted_enrollment(p_program, p_worker, p_accepted_at)` (time-shift fixture: past
sessions and acceptance, so evidence is then recorded through the real RPCs as the owner or a trainer).
`j6_worker_cannot_complete_training_without_three_days_and_assessment.test.sql` (J6 training part): j6_enrollment_alone_is_scheduled_not_completed,
j6_calendar_time_alone_does_not_complete, j6_two_attended_days_cannot_be_assessed, j6_same_day_counts_once (second session or second
attendance on that date refused), j6_absent_days_do_not_count, j6_assessment_sessions_do_not_count_as_training_days,
j6_three_days_without_assessment_awaits_assessment, j6_three_days_and_passed_assessment_completes, j6_failed_assessment_is_failed,
j6_pass_requires_every_checklist_item_met, j6_status_has_no_completed_value_and_no_completion_rpc, j6_attendance_correction_to_absent_removes_completion,
j6_reassessment_correction_with_reason_completes, j6_attendance_not_recordable_for_future_session, j6_attendance_not_recordable_before_enrollment,
j6_attendance_requires_accepted_enrollment, j6_assessment_records_assessor_role_and_time, j6_completion_predicate_matches_progress_view,
j6_min_training_days_cannot_be_below_three.
`j6_w6_training_program_and_enrollment_lifecycle.test.sql`: w6_program_cannot_open_with_fewer_than_three_distinct_days,
w6_open_requires_verified_shop_and_attestation, w6_open_program_content_is_frozen, w6_disallowed_program_transitions_rejected,
w6_archive_refused_with_training_in_progress, w6_session_dates_not_in_past_and_cancel_refused_after_attendance,
w6_invite_requires_accepted_application_same_shop, w6_accept_requires_notice_and_current_schedule (23514, 55000),
w6_terms_snapshot_records_dates_shop_terms_and_pay, w6_terms_snapshot_write_once_for_every_session, w6_worker_can_decline_or_withdraw_unfinished_training,
w6_owner_cancel_needs_reason, w6_disallowed_enrollment_transitions_rejected, w6_duplicate_live_enrollment_rejected, w6_stale_program_edit_rejected.
`j7_required_initial_training_is_free_to_the_worker.test.sql` (J7): j7_worker_fee_check_forces_zero_for_required_initial (insert and update
to 1.00 as a trusted session -> 23514 naming `tp_required_initial_training_is_free` / `tp_worker_fee_is_zero`),
j7_training_rpcs_have_no_fee_charge_or_deduction_parameter (pg_proc argument names), j7_training_tables_have_no_charge_or_deduction_columns,
j7_no_training_foreign_key_to_bookings_or_pricing, j7_only_the_read_only_gate_references_training_and_bookings (prosrc scan; no training
function mentions `shop_pricing` or `quoted_price`), j7_training_flow_creates_no_booking_or_price_rows (counts before / after invite,
accept, attendance, assessment), j7_pay_and_reimbursement_have_no_defaults_and_are_stored_verbatim, j7_pay_is_optional_and_all_or_nothing,
j7_snapshot_records_fee_zero_and_pay_as_entered, j7_enrollment_requires_free_training_notice_acknowledgement, j7_trainee_not_assignable_to_customer_bookings.
`j8_unauthorized_users_cannot_alter_training_evidence.test.sql` (J8 training part; the certification half is W7): j8_other_owner_cannot_record_or_correct,
j8_trainee_cannot_record_own_attendance_or_assessment, j8_undesignated_worker_cannot_record, j8_revoked_trainer_cannot_record,
j8_unlinked_trainer_cannot_record, j8_customer_super_admin_anon_cannot_record, j8_designated_trainer_can_record_for_own_program_only,
j8_trainer_cannot_be_trainee_of_same_program, j8_recorder_identity_and_dates_server_stamped, j8_correction_requires_reason_and_authorised_recorder,
j8_correction_chain_is_linear, j8_direct_writes_denied_for_clients_and_service_role, j8_evidence_append_only_for_every_session (trusted
UPDATE / DELETE -> 42501), j8_evidence_deleted_only_by_cascade, j8_owner_cannot_rewrite_assessment_result_in_place.
`j6_w6_training_audit_and_notifications.test.sql`: w6_audit_written_for_every_program_enrollment_and_evidence_action,
w6_audit_payload_has_no_dates_notes_reasons_terms_or_names, w6_worker_notified_on_invite_cancel_correction_and_assessment,
w6_owner_notified_on_response_and_trainer_assessment, w6_trainer_notified_on_designation, w6_schedule_change_notifies_enrolled_workers_once,
w6_notifications_idempotent_one_per_event, w6_notification_text_has_no_dates_pay_or_names, w6_refused_action_writes_no_audit_or_notification.
`j17_w6_training_authorization.test.sql` (J17): j17_training_tables_rls_enabled_and_no_client_write_privileges, j17_draft_programs_owner_only,
j17_owner_reads_only_own_programs_and_enrollments, j17_trainer_reads_only_designated_programs, j17_worker_reads_only_own_enrollments_and_evidence,
j17_customer_anon_super_admin_read_no_training_rows, j17_training_reads_have_no_contact_columns, j17_progress_view_is_security_invoker,
j17_w6_internal_functions_not_client_executable, j17_w6_rpcs_denied_to_anon, j17_w6_definer_functions_pin_pg_temp_last,
j17_training_tables_not_in_realtime_publication, j17_cascades_remove_training_and_keep_audit.
`j18_w6_flows.test.sql` (J18): j18_booking_assignment_unchanged_for_roster_worker_without_training,
j18_assignment_allowed_after_completion_withdrawal_or_cancellation, j18_other_owners_training_does_not_block_assignment,
j18_assigned_trainee_cannot_start_booking_during_training, j18_booking_quote_and_rating_unchanged_with_training_rows,
j18_w5_application_flow_unchanged, j18_shop_and_account_deletion_still_succeed_with_training. Changed `001_migration_replay.test.sql`:
versions gain 20261025000006..14 (36 migrations; renamed `replay_schema_migrations_has_baseline_w2_to_w6`), add
`replay_w6_training_tables_rls_enabled`. Every other existing file stays green with unchanged assertions.
Smoke `scripts/supabase-test/w6-api-smoke.mjs` (W5 smoke safety rules: loopback only, keys from `supabase status` in memory, synthetic
local.test users deleted, no `.env`): anon gets an error or 0 rows on each table; direct insert / patch / delete denied for worker, owner and
service_role; a worker cannot see a draft program; open refused without attestation; invite from an accepted application; accept refused
without the notice, then accepted with it; worker_fee patch denied and still 0; trainee self-record and other-owner record denied; trainer
record ok; same-day duplicate 23505; assessment before 3 days refused; correction without reason refused; progress view `completed` only
after 3 days plus a pass; evidence PATCH / DELETE denied; booking assignment of the trainee refused; notifications carry no dates or names;
`set_config` not exposed; GoTrue deleteUser of the worker cascades the enrollment and keeps audit. Must end `0 failed`.
Vitest (mocked, no network; suffixes `.j6`, `.j7`, `.j8`, `.j17`, `.w6`): j7_training_invitation_shows_free_training_notice_before_accept,
j7_accept_disabled_until_notice_acknowledged, j7_training_display_shows_no_fee_and_pay_as_entered, j7_program_editor_has_no_fee_input,
j7_training_repository_never_sends_worker_fee, j6_progress_view_uses_server_progress_not_dates, j6_my_training_shows_days_attended_of_required,
j6_assessment_button_hidden_until_required_days_attended, j8_attendance_sheet_correction_requires_reason, j8_trainer_panel_lists_only_designated_programs,
j17_training_repositories_write_only_through_rpcs, w6_program_lifecycle_offers_only_allowed_transitions,
w6_enrollment_lifecycle_offers_only_allowed_actions, w6_open_program_modal_requires_attestation, w6_assessment_copy_never_says_signature_or_certificate,
w6_evidence_history_shows_superseded_rows_with_reason, w6_session_kind_labels_training_vs_assessment_not_work,
w6_invite_offered_only_for_accepted_applicants, w6_training_panels_loading_empty_error_states, w6_stale_schedule_error_refreshes_invitation,
w6_notice_version_constant_is_w6_v1, w6_trainee_assignment_error_message_mapped. The existing 92 stay green.
## 6. Frontend (UI -> hooks -> services -> repositories -> Supabase; each file <= 350 lines)
Add: `domain/models/{TrainingProgram, TrainingSession, TrainingEnrollment, TrainingEvidence, TrainingTrainer}.ts`; `domain/utilities/{trainingProgramLifecycle,
trainingEnrollmentLifecycle}.ts` (per-actor actions mirroring 3.5 / 3.6; progress is read from the view, never computed); `domain/repositories/{TrainingProgram,
TrainingEnrollment, TrainingEvidence}Repository.ts`; `infrastructure/supabase/supabaseTrainingRows.ts` (explicit columns; `worker_fee` read only);
`infrastructure/repositories/Supabase{TrainingProgram, TrainingEnrollment, TrainingEvidence}Repository.ts` (RPC writes only, `toUserFacingError`);
`application/validation/{trainingProgramSchemas, trainingEvidenceSchemas}.ts` (DB limits; reason 10..300); `application/services/{TrainingProgram,
TrainingEnrollment, TrainingEvidence}Service.ts`; `presentation/utilities/trainingDisplay.ts` (labels Invited, Scheduled, In progress, Awaiting
assessment, Completed, Not passed, Declined, Left, Cancelled; "Training fee: none. Required initial training is free for you."; pay as entered
like W4, else "Not specified by the shop", with "As entered by the shop. WashLink does not verify pay."; kinds "Supervised training" /
"Competency assessment") and `trainingNoticeCopy.ts` (`trainingEnrollmentNoticeVersion = 'w6_v1'`, notice, owner attestation);
`presentation/dependencyInjection/createTrainingDependencies.ts`; hooks `useOwnerTrainingPrograms`, `useTrainingProgramEditor`, `useTrainingSessions`,
`useTrainingRoster`, `useTrainingEvidence`, `useMyTrainings`, `useTrainingInvitation`, `useTrainerPrograms` (`usePollWhileVisible`, 60 s).
Shared `presentation/components/training/`: `TrainingProgressSummary` ("3 of 3 training days attended", from the view), `AttendanceSheet`
(Present / Absent, optional note, "Correct" with required reason), `AssessmentSignOffModal` (checklist; Passed only when every item is met;
"This records your assessment decision. It is not a certificate or a signature."), `TrainingEvidenceHistory` (superseded rows with reason,
"Recorded by NAME"), `TrainingSessionList`, `TrainingPayAndFeeView`. Owner `presentation/components/owner/training/`: `OwnerTrainingProgramsPanel`,
`TrainingProgramEditorModal` + `TrainingProgramBasicsSection` + `TrainingProgramPayAndTermsSection` (no fee input; pay never pre-filled),
`TrainingProgramPreview`, `TrainingSessionsEditor`, `TrainingTrainersSection` (pick from linked roster), `OpenTrainingProgramConfirmModal`
(attestation checkbox), `TrainingRosterPanel` (enrollees, progress, attendance, assessment), `InviteToTrainingModal`, `CancelEnrollmentModal`.
Worker `presentation/components/worker/training/`: `MyTrainingsPanel` ("Not enrolled" empty state, invitations first), `TrainingInvitationDetail`
(notice FIRST, then shop, objectives, skills, dates with kinds, terms, fee none, pay as entered; acknowledgement checkbox; Accept / Decline),
`MyTrainingProgress`, `LeaveTrainingConfirmModal`, `TrainerProgramsPanel` (designated programs only; reuses the shared sheet and modal).
Notice `w6_v1` (WashLink product rule, no legal claim): "WashLink rule: this required initial training is free for you. The shop may not charge
you a training fee or deduct one from any pay. Training days and the assessment are supervised learning, not productive work: the shop may not
assign you to customer bookings during this training. Any training pay or reimbursement below is as entered by the shop; WashLink does not
verify it. Completion needs at least 3 attended training days and a passed assessment recorded by the shop owner or a designated trainer.
Enrolling is not a contract or a job offer, and you may leave unfinished training at any time."
Change: `features/worker/WorkerWorkspaceTabs.tsx` + `workerWorkspaceView.ts` ("My training"; "Training I run" only when designated);
`owner/OwnerDashboardContent.tsx` (lazy Training tab); `owner/applicants/ApplicantProfileDrawer.tsx` ("Invite to training" for accepted);
`createDashboardDependencies.ts`; `supabaseErrorMessages.ts` (every section-3 message incl. the C7 gate).
## 7. Docs
Add `docs/workforce/TRAINING.md` (P24-P29, tables, matrices, progress rule, corrections, C7 gate, visibility, limitations, rollback). Update
`AUDIT_AND_NOTIFICATIONS.md` (3.9); `ROLE_AND_PROFILE_SECURITY.md` (guard matrix; D-10 rows 29 no pre-existing `training_*` or same-named
functions, 30 w6a columns, 31 new trigger `bookings_guard_training_assignment` vs production booking clients); `LOCAL_TEST_HARNESS.md` (36
migrations, W6 smoke); `LEGAL_REVIEW_REGISTER.md` (W6 section W6-L1..L10 OPEN; note on W0-L2 and W5-L9 of what W6 now enforces, still OPEN).
RECORD adds the W6 smoke row to LOOP.md and D-15..D-19 to DECISIONS.md.
## 8. Check commands (repo root, local only)
`cd frontend && npm run lint`, `npm run build`, `npm test`; `backend/.venv/Scripts/python.exe -m pytest -q`; `node --test scripts/supabase-test/stage-local-workdir.test.mjs`;
`node scripts/supabase-test/run-db-tests.mjs`; then `w2-` .. `w6-api-smoke.mjs`; stop with `--workdir .local-supabase-test --no-backup`. Never `--linked`, `--db-url`, `db push`.
## 9. Acceptance criteria
| AC | Criterion | Evidence |
|---|---|---|
| AC1 | 9 new migrations `2026_10_25_w6[a-i]_<snake>.sql`, each with `-- ROLLBACK`; no committed migration changed | `ls supabase/migrations/2026_10_25_w6*`; `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_25_w6*` empty; `git diff --name-status caca376 -- supabase/migrations` only `A` |
| AC2 | Clean replay of 36 migrations; suite PASS; 0 TODO | runner `Result: PASS`; `replay_schema_migrations_has_baseline_w2_to_w6`, `replay_w6_training_tables_rls_enabled`; `grep -c "todo_start(" supabase/tests/database/*.sql` all 0 |
| AC3 | J6 training part and C2: completed only from >= 3 distinct attended days + passed assessment | every `j6_*` name in the J6 file; Vitest `j6_*` |
| AC4 | J7 and C6: fee forced to 0, no charge path, pay optional and verbatim, notice + snapshot on the enrollment | every `j7_*` pgTAP and Vitest name; `w6_terms_snapshot_records_dates_shop_terms_and_pay`, `w6_terms_snapshot_write_once_for_every_session`; smoke worker_fee check |
| AC5 | J8: only the owner or a designated trainer records; evidence append-only; corrections with reason (D-4) | every `j8_*` pgTAP and Vitest name; smoke evidence PATCH / DELETE denied |
| AC6 | Program and enrollment state machines per actor | every `w6_*` name in the lifecycle file; Vitest `w6_program_lifecycle_offers_only_allowed_transitions`, `w6_enrollment_lifecycle_offers_only_allowed_actions` |
| AC7 | C7 gate without breaking bookings | `j7_trainee_not_assignable_to_customer_bookings`; every `j18_*` name in `j18_w6_flows`; smoke assignment check |
| AC8 | Audit and notifications idempotent, no dates / notes / names / pay | every name in `j6_w6_training_audit_and_notifications` |
| AC9 | J17 authorization and PostgREST surface | every name in `j17_w6_training_authorization`; Vitest `j17_training_repositories_write_only_through_rpcs`; `w6-api-smoke.mjs` ends `0 failed`; W2 48, W3 33, W4 43, W5 39 still `0 failed` |
| AC10 | Frontend | every section-5 Vitest name and the existing 92 pass; lint and build exit 0; `grep -rn "worker_fee" frontend/src/infrastructure/repositories` has no write payload; `grep -rn "service_role" frontend/src` empty |
| AC11 | J18 regression | every pre-W6 pgTAP file `ok`; `git diff --stat caca376 -- supabase/tests/database` only new files plus `001_migration_replay.test.sql`; pytest `4 passed`; stager 18/18 |
| AC12 | Size, safety, docs, legal | `wc -l` of every added / changed file <= 350; no `.env` read; `git diff --stat caca376 -- backend` empty; section 7 docs exist; `grep -c "W6-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` >= 10 |

## 10. Rollback
Per-file `-- ROLLBACK` blocks in reverse order i..a, local stack only. i: producers (audit rows, notifications stay). h: the bookings trigger
and its functions (bookings behave as after W5). g, f, e: RPCs, reads, notice-version function. d: view, predicate, evidence guards and
tables (evidence loss; export with a trusted `copy` first). c: enrollments and sessions. b: trainers and programs. a: nothing. Frontend: revert.

## 11. Risks and legal-review flags
R1 (D-10 rows 29-31) production drift or booking clients that assign workers outside the app; w6a aborts on missing objects. R2 the C7 gate
covers only roster-linked trainees and on-platform bookings. R3 time-shift fixtures are test-only; real evidence needs the session day to have
passed and an earlier acceptance. R4 evidence and snapshots cascade on shop / owner / worker deletion (4.4). R5 flags rely on PostgREST not
exposing `set_config`. R6 an audit failure aborts the action, cascades included. R7 the progress view aggregates per row (<= 100 x 30).
Legal (to `LEGAL_REVIEW_REGISTER.md`, all OPEN; no compliance claim in UI or docs):
- W6-L1 the arrangement: free training of at least 3 days at a commercial shop before any contract; trainee status under Philippine law
  (apprenticeship / learnership rules, TESDA), whether unpaid supervised training is lawful, duration and compensation treatment.
- W6-L2 training vs productive work: owner attestation `w6_owner_v1` and the booking gate are the only controls; off-platform work.
- W6-L3 owner-entered training pay / reimbursement shown verbatim, unchecked against wage orders; "Not specified by the shop" wording.
- W6-L4 trainer designation: qualifications, no trainer consent step, trainers acting for the shop (their own pay and status).
- W6-L5 record-keeping: operational evidence, not tamper-proof or evidence-grade (W3-L3); cascade deletion and retention (W5-L10).
- W6-L6 assessment checklists and pass / fail: fairness, discrimination, no appeal or review before W7 certification.
- W6-L7 occupational safety during training (chemicals, equipment, PPE) is not modelled.
- W6-L8 personal data: progress notes and assessor comments may hold sensitive data; trainee names shown to trainers.
- W6-L9 notice `w6_v1` wording ("free", "may leave at any time", "not productive work"): a product rule, not legal advice; versioned.
- W6-L10 after completion or a fail the gate lifts while no contract exists (W9): whether assignment then needs a contract first.
