# Training programs, attendance and assessment (W6)

Migrations `2026_10_25_w6a` .. `w6i` (staged `20261025000006..14`). Spec D (training, free-training
requirement), A (verified shop), C (accepted offers lead to required training), G, I; acceptance tests
J6 (training part), J7, J8, J17, J18. Decisions: D-4, D-7, D-15..D-19 (`loop/workforce/DECISIONS.md`).
Verified on the local Docker stack only (D-10); nothing here says anything about the linked project.
No item in this document is a compliance claim; open legal questions are W6-L1..L13 in
`LEGAL_REVIEW_REGISTER.md`.

## Principles (continue P1-P23)

| | Rule |
|---|---|
| P24 | Every write to a training table goes through a definer RPC under the transaction-local flag `washlink.training_write` = row id. No client role (anon, authenticated, service_role) has INSERT / UPDATE / DELETE; write policies are deny-all. Trusted SQL may repair programs, sessions, designations and enrollments (audited `trusted_session`), never evidence and never a written snapshot. |
| P25 | Completion is never stored. `training_enrollments.status` has no `completed` / `failed` value. Progress is computed from current evidence rows only: >= `min_training_days` (CHECK 3..30) DISTINCT dates of `present` attendance on scheduled `supervised_training` sessions AND the current assessment `passed`. Time, enrollment or a button never completes anything. |
| P26 | Evidence (`training_attendance_records`, `training_assessments`) is append-only for EVERY session: UPDATE -> 42501 `Training records cannot be edited. Record a correction instead.`; DELETE only when the enrollment row is already gone (FK cascade); INSERT only under the flag. A correction is a new row with `supersedes_id` and a required `correction_reason` (10..300); a row can be superseded once (linear chain). |
| P27 | `terms_snapshot` / `terms_snapshot_taken_at` on an enrollment are write-once (null -> value at acceptance) for every session, trusted included. |
| P28 | Required initial training is free to the worker: `worker_fee` is forced to 0 by `tp_required_initial_training_is_free` and `tp_worker_fee_is_zero` for every session; no fee, charge, deduction or price column or RPC parameter exists; no training object writes or references `bookings` / `shop_pricing` except the read-only C7 gate. |
| P29 | Recorder identity, role, designation id and display-name snapshot are server-derived (`auth.uid()`); dates are server-derived (attendance date = the session date, assessment date = Manila today). Audit payloads carry ids, status words, booleans and counts only. |

### D-18 retention (orchestrator override of the plan's 4.4)

Deleting a shop or an owner account must succeed, but must NOT delete the worker's training record
(consistent with W5-L10):

- `training_programs.shop_id` / `owner_id`, `training_enrollments.shop_id` / `owner_id` / `job_application_id`
  and `training_program_trainers.roster_worker_id` are `on delete set null`. Every W6 UPDATE guard first
  accepts the FK cascade through the W2 helper `is_orphaned_fk_set_null` (only the FK column may change),
  so GoTrue deletions (an untrusted session) pass.
- `training_enrollments.program_id` is `on delete restrict` and `training_attendance_records.session_id`
  is `on delete restrict`: a program or session holding evidence cannot be deleted, also not by trusted SQL.
- BEFORE DELETE trigger `shops_remove_unenrolled_training_programs` deletes the shop's programs that have
  NO enrollment (drafts, unused programs), so no orphan clutter remains; their sessions and designations
  cascade. Audited `training_program.deleted` with `deleted_by = shop_removed`.
- Snapshots keep the record meaningful: `shop_name_snapshot`, `program_title_snapshot`,
  `owner_display_name_snapshot` (set at invitation), `recorder_display_name` / `assessor_display_name` on
  every evidence row (trimmed `full_name`, else `Shop owner` / `Trainer`), plus the terms snapshot.
- After removal nobody can record (the recorder rule needs the current shop owner), the worker still reads
  the enrollment, program, sessions and evidence, may still withdraw, and progress shows `shop_removed`
  for unfinished training (`completed` / `failed` stay). Audit `training_enrollment.shop_removed`; no
  notification. The C7 gate lifts for such enrollments.
- The worker's OWN account deletion still removes their enrollments and evidence (cascade from
  `worker_profiles`); audit rows stay.
- Tests: `j18_w6_d18_training_evidence_retention.test.sql` (30), `j18_shop_and_account_deletion_still_succeed_with_training`,
  smoke `owner_account_delete_retains_worker_training_d18`. W2 cascade tests (`j17_w2_fix1_fk_cascades`) and
  the W3 audit tests stay green.

## Tables

| Table | Key columns | Notes |
|---|---|---|
| `training_programs` | shop_id, owner_id (set null), title 3..120, objectives, skills_to_learn (<= 20 x 80), terms (<= 4000), `training_kind` = `required_initial` only, `min_training_days` 3..30, `assessment_checklist` (1..30 items of 3..200 to open), `worker_fee` = 0, optional pay (amount > 0, `PHP`, `day` / `session` / `program`, details <= 500, reimbursement <= 500; amount / currency / period all or nothing; NO defaults), status draft / open / closed / archived, `owner_attestation_version` `w6_owner_v1` + stamps | content frozen once not draft (42501 `An open training program cannot be edited.`); <= 50 non-archived per shop |
| `training_program_trainers` | program_id, trainer_id (cascade), roster_worker_id (set null), designated_by / at, revoked_by / at (one-way) | one live designation per (program, trainer) |
| `training_sessions` | program_id (cascade), session_date, optional start / end time and location (<= 200), `session_kind` supervised_training / competency_assessment, status scheduled / cancelled, cancel reason 10..300 | one scheduled session per date per program; never edited (cancel + add); added only for Manila today .. +365; <= 30 scheduled |
| `training_enrollments` | program_id (restrict), shop_id / owner_id / job_application_id (set null), worker_id (cascade), name snapshots, status invited / accepted / declined / withdrawn / cancelled, notice `w6_v1` + acknowledgement, terms snapshot, cancel reason | `te_lifecycle_consistency`; one live (invited / accepted) per (program, worker); <= 100 live per program, <= 10 live per worker |
| `training_attendance_records` | enrollment_id (cascade), session_id (restrict), session_date (= session), present / absent, progress_note <= 500, recorder fields, supersedes_id, correction_reason | one original row per (enrollment, session) and per (enrollment, date) (C2) |
| `training_assessments` | enrollment_id (cascade), checklist_snapshot, items_met (same length, no nulls), passed / failed (`ta_pass_requires_every_item`), assessor_comment <= 500, assessor fields, assessed_on (Manila), signed_off_at | one original per enrollment; "signed off" = recorded by an authorised owner / trainer, never an electronic signature or a certificate |
| view `training_enrollment_progress` | enrollment_id, program_id, worker_id, enrollment_status, required / attended training days, has_recorded_attendance, current assessment id / result, progress_status | `security_invoker = true`: the caller's RLS on every table applies |

## Program state machine (`transition_training_program`, w6e)

| From | To | Who | Condition |
|---|---|---|---|
| (none) | draft | shop owner (role owner) | own shop; <= 50 non-archived (`create_training_program`) |
| draft | (deleted) | owning owner | draft only (`delete_training_program_draft`) |
| draft | open | owning owner | `is_verified_shop_owner`; objectives, terms, >= 1 checklist item; >= `min_training_days` distinct scheduled supervised dates >= Manila today and no past scheduled session; `p_owner_attestation_version = 'w6_owner_v1'` else 23514 `Confirm the free-training statement before opening.` |
| open | closed | owning owner | none (enrolled workers continue; evidence can still be recorded) |
| closed | archived | owning owner | no invited enrollment and no accepted one with progress scheduled / in_progress / awaiting_assessment |

Everything else -> 42501 `This training program status change is not allowed.`; stale `p_from_status` ->
55000; any caller other than the CURRENT owner of the program shop (super_admin included) -> 42501
`Training program not found.` Sessions can be added and cancelled while draft or open; a session with
attendance cannot be cancelled (42501). Owner attestation text (shown at open, stored by version):
"I confirm this required initial training is free for the worker: no training fee and no deduction from
any pay. Trainees do supervised practice and assessment only; my shop will not assign them to customer
bookings or use them in place of paid staff during the training. Any training pay or reimbursement shown is
what my shop will provide." It is the owner's own confirmation, not a signature and not a WashLink
compliance statement.

## Enrollment state machine (w6f)

| From | To | Who | Condition / stamps |
|---|---|---|---|
| (none) | invited | owning owner | program open; verified shop; application `accepted` at the same shop and owner (D-15); worker is not an unrevoked trainer of the program; enough upcoming supervised days; no live enrollment (23505); limits 10 per worker / 100 per program count only live rows (`training_enrollment_is_live`: invited, or accepted with progress scheduled / in_progress / awaiting_assessment; completed and failed do not count) |
| invited | accepted | worker (self) | program open and shop present; `p_notice_version = 'w6_v1'` else 23514; `p_expected_schedule_changed_at` = program value else 55000 `This training program changed. Review it again.`; enough upcoming days; stamps accepted_at, notice, terms snapshot |
| invited | declined | worker (self) | any program status |
| invited | cancelled | owning owner | invitation withdrawn (reason optional) |
| accepted | withdrawn | worker (self) | progress not completed (a failed trainee may leave) |
| accepted | cancelled | owning owner | progress not completed (a failed enrollment may be cancelled); reason 10..300 |

A program with failed (or completed) enrollments can be closed (open -> closed has no enrollment condition) and
archived (closed -> archived refuses only invitations and unfinished accepted training).

Everything else -> 42501 `This training enrollment change is not allowed.`; a caller who is neither the row
worker nor the current program owner -> 42501 `Training enrollment not found.` An invitation or an
acceptance is not a contract, an employment offer or a certification.

## Progress and corrections

`progress_status`: invited -> `invited`; declined / withdrawn / cancelled -> the same word; accepted with
attended < required -> `scheduled` (no attendance row) or `in_progress`; attended >= required -> no current
assessment `awaiting_assessment`, passed `completed`, failed `failed`; unfinished training whose shop was
removed -> `shop_removed` (D-18). `training_enrollment_is_completed(uuid)` (internal, used by W7 and the C7
gate) applies the same rule through the shared pure function `training_progress_status` (test
`j6_completion_predicate_matches_progress_view`).

Recording rules (w6g): the recorder is the current shop owner or a designated trainer whose roster link
(`workers.user_id`, same owner) still exists, on a non-draft program of an existing shop, and never the
enrollment worker; else 42501 `Only the shop owner or a designated trainer can record training.`
Attendance: accepted enrollment; scheduled session of the program; session date <= Manila today and >= the
Manila date of `accepted_at`; duplicate day -> 23505. Assessment: attended >= required (23514); no current
assessment (23505; re-assessment is a correction); one value per checklist item (22023); a pass needs every
item (23514); a fail needs `p_failure_reason` 10..300 (23514 `Give a reason for the fail of 10 to 300 characters.`,
also CHECK `ta_failure_reason_check`: failure_reason is set exactly for `failed`); on a pass the reason is
ignored (stored null). The worker reads `checklist_snapshot`, `items_met` (same order) and `failure_reason` of
their own assessments (table RLS and `training_evidence_for_enrollment`). Corrections: current row only (23505 otherwise), reason 10..300, attendance corrections must
change the status or the note.

Trainer authority (D-16): the recorder lock takes the designation's `workers` roster row FOR SHARE and
re-checks the link. Trigger `workers_revoke_unlinked_trainers` (w6f, BEFORE UPDATE OF user_id or DELETE on
`workers`) revokes every unrevoked designation through that row when the link changes or the row is deleted
(audit `training_trainer.revoked`, `changed_by = roster_unlinked`, trainer notified); a re-link never revives it.

Carry-forward to W7: completion is NOT monotonic. A correction (attendance to absent, a passed assessment
corrected to failed) can move `completed` back to `in_progress` / `awaiting_assessment` / `failed`. W7 must
re-check `training_enrollment_is_completed` at issue time, inside the issuing transaction (and lock the
enrollment), and must not rely on an earlier read or a notification.

## C7 booking gate (w6h, D-17)

`roster_worker_in_required_training(worker_row, shop)`: the roster row belongs to the booking shop's owner
(`workers.owner_id = shops.owner_id`), has `user_id` set and that worker holds an
ACCEPTED enrollment with the same `owner_id`, required initial training, an existing shop and progress
scheduled / in_progress / awaiting_assessment. Trigger `bookings_guard_update_training_gate` (BEFORE UPDATE,
function `bookings_guard_training_assignment`; named to fire after the W2c `bookings_guard_update`, so a
caller W2 refuses gets the W2 error, never the training message) refuses with 23514 assigning such a roster row (`This worker is in required
training with your shop and cannot be assigned to customer bookings until the training ends.`) and the
assigned worker starting the booking (`You are in required training with this shop and cannot start customer
bookings until the training ends.`). Trusted sessions bypass; super_admin does not. A booking already in
progress may complete. Unlinked rows, other owners' trainees and invited / declined / withdrawn / cancelled /
completed / failed / shop_removed enrollments are not affected.

## Visibility (RLS and read RPCs)

| Who | Programs | Sessions | Enrollments | Evidence | Designations |
|---|---|---|---|---|---|
| current shop owner | own, every status | own programs | own programs | own programs | own programs |
| designated linked trainer | non-draft designated programs | same | accepted ones of those programs | of those enrollments | own designation rows |
| worker | programs where they hold any enrollment | same | own rows | own rows | via `trainers_for_training_program` (names only) |
| customer, super_admin (until W11), anon | none | none | none | none | none |

Read RPCs: `training_roster_for_program`, `training_evidence_for_enrollment`, `trainers_for_training_program`
(no contact or profile fields; names = trimmed `full_name` or a role label). The progress view follows the
caller's RLS. No training table may be in `supabase_realtime`: w6d aborts the migration if the publication
is FOR ALL TABLES or lists a `training_*` table.

## Limitations

- Local proof only (D-10 rows 29-32 in `ROLE_AND_PROFILE_SECURITY.md`); production drift is caught only by
  the w6a preflight.
- The gate covers roster-linked trainees and on-platform bookings only; off-platform work is invisible.
- Evidence is operational, not tamper-proof (a DB superuser can disable triggers); no electronic signatures.
- Time-shift fixtures (past sessions, backdated acceptance) exist only in `test_helpers` and the smoke; real
  evidence needs the session day to have passed and an earlier acceptance.
- An audit failure aborts the action, cascades included (W3 rule). The progress view aggregates per row
  (bounded by 100 enrollments x 30 sessions per program).
- Orphan program (D-18): a program kept at shop removal (it had enrollments; `shop_id` / `owner_id` null)
  stays when its last enrollment is later removed (the worker's account deletion). It holds only the shop's
  program text and sessions, no worker data, and nobody can read or change it (no owner, no enrollment);
  a trusted cleanup can delete it. The shop-removal trigger locks the shop's programs FOR UPDATE before the
  no-enrollment check, so a concurrent invite cannot make the delete hit the RESTRICT FK (23503).
- No reminders, email / SMS / push or Realtime (W12); no optional / refresher training kinds or fees (D-19).
- W7 carry-forward closed: completion is not monotonic, so `issue_certification` / `renew_certification`
  re-read `training_enrollment_is_completed` AFTER taking the W6 lock chain (program FOR SHARE, enrollment
  FOR SHARE, advisory `training_evidence:<enrollment>`), which serialises an issue with any concurrent
  evidence write or correction (`docs/workforce/CERTIFICATIONS.md`).
- W7 adds ONE object on the W6 side: the AFTER INSERT trigger `training_evidence_flag_certifications` on
  `training_attendance_records` and `training_assessments`. When the enrollment holds an active or suspended
  certification and the new evidence leaves it not completed, it writes `certification.training_record_changed`
  and notifies the issuing owner. It never changes the certificate (D-24) and does nothing for enrollments
  without a certification (every W6 test stays unchanged).

## Rollback

Per-file `-- ROLLBACK` blocks in reverse order i..a, local stack only. i: producers (audit rows and
notifications stay). h: the bookings trigger and its functions (bookings behave as after W5). g, f, e: RPCs,
reads, notice-version function. d: view, predicate, evidence guards and tables (IRREVERSIBLE evidence loss;
export with a trusted `copy` first). c: the shops trigger, enrollments and sessions. b: trainers and
programs. a: nothing. Frontend: revert.
