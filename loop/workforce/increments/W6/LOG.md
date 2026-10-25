# W6 - LOG

## BUILD (database), 2026-10-25
Local Docker stack only (staged `.local-supabase-test`); no `.env` read, no `db push` / `link` / remote
connection, no CLI run from the repo root, no committed migration touched (w5 and earlier unchanged), no
frontend code, no commit.

### D-18 override (orchestrator; replaces PLAN 4.4 and R4)
Shop or owner deletion RETAINS worker-facing training evidence (consistent with W5-L10):
- FKs: `training_programs.shop_id` / `owner_id`, `training_enrollments.shop_id` / `owner_id` / `job_application_id`,
  `training_program_trainers.roster_worker_id` -> `on delete set null`; `training_enrollments.program_id` and
  `training_attendance_records.session_id` -> `on delete restrict`; `worker_id` and evidence `enrollment_id` still
  cascade (the worker's own account deletion).
- Every W6 UPDATE guard accepts the FK set-null cascade through the W2 `is_orphaned_fk_set_null` first (GoTrue's
  untrusted session passes); evidence tables have no set-null FK and stay append-only.
- New BEFORE DELETE trigger `shops_remove_unenrolled_training_programs` (w6c) deletes only the shop's programs
  that have no enrollment (drafts, unused programs); audited `training_program.deleted` / `deleted_by = shop_removed`.
- Snapshot columns: `training_enrollments.shop_name_snapshot`, `program_title_snapshot`,
  `owner_display_name_snapshot` (set at invite); `recorder_display_name` / `assessor_display_name` on evidence.
- Progress shows `shop_removed` for unfinished training of a removed shop (completed / failed stay); nobody can
  record any more; the worker can still read and withdraw; the C7 gate lifts; audit
  `training_enrollment.shop_removed`; no notification.
- Tests: `j18_w6_d18_training_evidence_retention.test.sql` (30) incl. untrusted owner-account deletion and
  trusted program delete restricted (23503); `j18_shop_and_account_deletion_still_succeed_with_training`; smoke
  `owner_account_delete_retains_worker_training_d18`. W2 `j17_w2_fix1_fk_cascades` and all W3 audit files green.
- Docs: `docs/workforce/TRAINING.md` (D-18 section), D-10 row 32, W6-L5.

### Other deviations from PLAN (all recorded in the docs)
- `designate_training_trainer` / `revoke_training_trainer` live in w6f (not w6e) to keep files <= 350 lines.
- The Realtime exclusion of all six tables is one block in w6d (w6b / w6c point to it).
- A trainer's authority (and read of rosters / evidence) requires a non-draft program (found by
  `j17_draft_programs_owner_only`).
- Extra internal helpers: `lock_owned_training_program`, `training_upcoming_supervised_days`,
  `touch_training_schedule` (w6e), `lock_training_enrollment_for_actor` (w6f), `lock_training_enrollment_for_recorder`,
  `insert_training_assessment` (w6g), `training_labels` (w6i), `training_enrollment_attended_days`,
  `training_enrollment_progress_status_of` (w6d); policy helpers `worker_holds_training_enrollment`,
  `can_read_training_program`, `can_read_training_evidence`, `is_designated_training_trainer`; pure
  `training_progress_status` (shared by the view and the predicate). `is_authorised_training_recorder` stays internal.
- Extra test file `j18_w6_d18_training_evidence_retention.test.sql` (D-18). `test_helpers.sql` reformatted (blank
  lines / separators removed, header shortened, no behaviour change) to stay <= 350 lines with the W6 fixtures;
  added `manila_today()` besides the five planned fixtures.
- Smoke time shift: through `docker exec supabase_db_<staged project_id> psql` (trusted local session, seeded
  `test_helpers`, validated uuids / dates only); a trusted cleanup removes the program D-18 retains.

### Files
Migrations: `supabase/migrations/2026_10_25_w6a_training_preflight.sql`, `..._w6b_training_programs_and_trainers.sql`,
`..._w6c_training_sessions_and_enrollments.sql`, `..._w6d_training_evidence_and_progress.sql`,
`..._w6e_training_program_rpcs.sql`, `..._w6f_training_enrollment_rpcs.sql`, `..._w6g_training_evidence_rpcs_and_reads.sql`,
`..._w6h_training_booking_assignment_gate.sql`, `..._w6i_training_audit_and_notifications.sql` (each with `-- ROLLBACK`).
Tests: `j6_worker_cannot_complete_training_without_three_days_and_assessment` (40), `j6_w6_training_program_and_enrollment_lifecycle`
(53), `j6_w6_training_audit_and_notifications` (23), `j7_required_initial_training_is_free_to_the_worker` (23),
`j8_unauthorized_users_cannot_alter_training_evidence` (41), `j17_w6_training_authorization` (45), `j18_w6_flows` (24),
`j18_w6_d18_training_evidence_retention` (30); changed `001_migration_replay` (19: `replay_schema_migrations_has_baseline_w2_to_w6`,
`replay_w6_training_tables_rls_enabled`). Harness: `scripts/supabase-test/baseline/test_helpers.sql`,
`scripts/supabase-test/w6-api-smoke.mjs`. Docs: `docs/workforce/TRAINING.md` (new), `LEGAL_REVIEW_REGISTER.md`
(W6-L1..L10 OPEN, W0-L2 / W5-L9 note), `ROLE_AND_PROFILE_SECURITY.md` (D-10 rows 29-32, W6 guard matrix),
`LOCAL_TEST_HARNESS.md`, `AUDIT_AND_NOTIFICATIONS.md`, `loop/workforce/LOOP.md`.

### Actual output
Final clean run (in this order):
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: tests 18, pass 18, fail 0.
- `node scripts/supabase-test/run-db-tests.mjs`: exit 0; 36 migrations applied (2 baseline + 34 copies, W6 =
  `20261025000006..14`); `Files=37, Tests=1374` (1094 before + 1 replay + 279 W6), `Result: PASS`; 0 `todo_start(`.
- `w2-api-smoke: 48 passed, 0 failed`; `w3-api-smoke: 33 passed, 0 failed`; `w4-api-smoke: 43 passed, 0 failed`;
  `w5-api-smoke: 39 passed, 0 failed`; `w6-api-smoke: 40 passed, 0 failed`.
- `npx supabase stop --workdir .local-supabase-test --no-backup`: "Stopped supabase local development setup."
- `git diff --name-status caca376 -- supabase/migrations`: empty (the 9 W6 files are new, untracked); every W6
  migration has `-- ROLLBACK`; every added / changed SQL and script file <= 350 lines.

Not verified: concurrency (lock order and advisory locks checked structurally, not with parallel sessions);
the ROLLBACK blocks were not executed; production parity (D-10 rows 29-32); frontend / Vitest (not in this
step).

## API for the frontend (W6)
All writes are RPCs (`supabase.rpc`); tables are read-only through RLS. Errors keep the W2..W5 convention:
42501 not found / not allowed, 23514 refused rule, 23505 duplicate, 55000 stale, 22023 bad checklist array.

Constants: notice version `training_enrollment_notice_version()` = `'w6_v1'`; owner attestation `'w6_owner_v1'`.

Owner (program, sessions, trainers):
| RPC | Params | Returns | Notable errors |
|---|---|---|---|
| `create_training_program` | `p_shop_id, p_title` | `training_programs` row (draft) | 42501 `You can create training programs only for your own shop.`; 23514 50-limit |
| `update_training_program_draft` | `p_program_id, p_title, p_objectives, p_skills_to_learn text[], p_terms, p_min_training_days, p_assessment_checklist text[], p_training_pay_amount, p_training_pay_currency, p_training_pay_period, p_training_pay_details, p_reimbursement_details, p_expected_updated_at` | row | 55000 `This training program changed. Refresh and try again.`; 42501 `An open training program cannot be edited.`; 23514 CHECKs (pay all-or-nothing, lengths, min days 3..30) |
| `delete_training_program_draft` | `p_program_id` | void | 42501 `Only draft training programs can be deleted.` |
| `add_training_session` | `p_program_id, p_session_date, p_session_kind ('supervised_training' / 'competency_assessment'), p_start_time?, p_end_time?, p_location?` | `training_sessions` row | 23514 `Choose a session date from today up to one year ahead.`, `Sessions can be added only while the program is a draft or open.`; 23505 `A session is already scheduled on this date.` |
| `cancel_training_session` | `p_session_id, p_reason (10..300)` | row | 42501 `Attendance was recorded for this session; it cannot be cancelled.`; 23514 `Give a reason of 10 to 300 characters.` / `This session cannot be cancelled.` |
| `delete_training_session_draft` | `p_session_id` | void | 42501 `Sessions can be deleted only while the program is a draft. Cancel it instead.` |
| `transition_training_program` | `p_program_id, p_from_status, p_to_status, p_owner_attestation_version?` | row | allowed: draft>open, open>closed, closed>archived; 42501 `Only a verified shop can open training programs.`, `This training program status change is not allowed.`; 23514 `Add objectives, terms and at least one checklist item before opening.`, `Schedule at least N upcoming supervised training days (and no past sessions) before opening.`, `Confirm the free-training statement before opening.`, `Training is still in progress in this program.`; 55000 |
| `designate_training_trainer` | `p_program_id, p_roster_worker_id` (a roster row linked to a worker account) | `training_program_trainers` row | 23514 `Choose a worker linked to your roster.`, `A worker enrolled in this program cannot be its trainer.`, `Trainers cannot be changed on an archived program.`; 23505 `This worker is already a trainer for this program.` |
| `revoke_training_trainer` | `p_designation_id` | row | 23514 `This trainer role was already revoked.` |
Any non-owner caller of these: 42501 `Training program not found.`

Enrollment:
| RPC | Who | Params | Notable errors |
|---|---|---|---|
| `invite_to_training` | owner | `p_program_id, p_job_application_id` (an `accepted` application of the same shop) | 23514 `Invitations can be sent only while the program is open.`, `Invite only an applicant you accepted for this shop.`, `A trainer of this program cannot be enrolled in it.`, `This program does not have enough upcoming training days.`, `This worker has reached the limit of 10 live trainings.`, `This training program is full.`; 42501 `Only a verified shop can invite workers to training.`; 23505 `This worker already has a live enrollment in this program.` |
| `respond_to_training_invitation` | worker | `p_enrollment_id, p_accept boolean, p_notice_version?, p_expected_schedule_changed_at?` (pass the program's `schedule_changed_at` the worker reviewed) | 23514 `Review the free-training notice before enrolling.`, `This training program is not open.`, `This program does not have enough upcoming training days.`; 55000 `This training program changed. Review it again.` (refresh the program and sessions, show them again) |
| `withdraw_from_training` | worker | `p_enrollment_id` | 42501 `This training enrollment change is not allowed.` (not accepted, or completed / failed) |
| `cancel_training_enrollment` | owner | `p_enrollment_id, p_reason?` (required 10..300 for accepted) | 23514 `Give a reason of 10 to 300 characters.`; 42501 not allowed |
Callers who are neither the worker nor the current owner: 42501 `Training enrollment not found.`

Evidence (owner or designated trainer; never the trainee):
| RPC | Params | Notable errors |
|---|---|---|
| `record_training_attendance` | `p_enrollment_id, p_session_id, p_attendance_status ('present' / 'absent'), p_progress_note? (<= 500)` | 42501 `Only the shop owner or a designated trainer can record training.`; 23514 `Attendance can be recorded only for an accepted enrollment.`, `Choose a scheduled session of this program.`, `This session has not happened yet.`, `This session was before the worker enrolled.`; 23505 `Attendance for this day is already recorded. Record a correction instead.` |
| `correct_training_attendance` | `p_attendance_id, p_attendance_status, p_progress_note, p_correction_reason (10..300)` | 23505 `This record was already corrected.`; 23514 `Give a correction reason of 10 to 300 characters.`, `A correction must change the attendance or the note.`, `Records can be corrected only for an accepted enrollment.` |
| `record_training_assessment` | `p_enrollment_id, p_items_met boolean[] (one per checklist item, in order), p_result ('passed' / 'failed'), p_assessor_comment? (<= 500)` | 23514 `The worker has not attended the required training days yet.`, `A pass needs every checklist item met.`, `An assessment can be recorded only for an accepted enrollment.`; 22023 `Mark every checklist item as met or not met.`; 23505 `An assessment is already recorded. Record a correction instead.` |
| `correct_training_assessment` | `p_assessment_id, p_items_met, p_result, p_assessor_comment, p_correction_reason` | as above + 23505 `This record was already corrected.` (also the re-assessment path after a fail) |

Reads:
- Tables (select only, RLS): `training_programs`, `training_sessions`, `training_enrollments`,
  `training_program_trainers`, `training_attendance_records`, `training_assessments` (audiences in
  `docs/workforce/TRAINING.md`). `worker_fee` is read-only and always 0: never send it.
- View `training_enrollment_progress` (`enrollment_id, program_id, worker_id, enrollment_status,
  required_training_days, attended_training_days, has_recorded_attendance, current_assessment_id,
  current_assessment_result, progress_status`). Labels: invited, scheduled, in_progress, awaiting_assessment,
  completed, failed, declined, withdrawn (Left), cancelled, shop_removed (suggested "Shop no longer on WashLink").
  Never compute progress client-side.
- `training_roster_for_program(p_program_id)` (owner: every enrollment; trainer: accepted only): `enrollment_id,
  display_name, enrollment_status, accepted_at, required_training_days, attended_training_days,
  has_recorded_attendance, current_assessment_id, current_assessment_result, progress_status`.
- `training_evidence_for_enrollment(p_enrollment_id)` (worker self, owner, trainer): `evidence_kind ('attendance' /
  'assessment'), evidence_id, supersedes_id, is_current, session_id, session_date, session_kind, attendance_status,
  progress_note, checklist_snapshot, items_met, result, assessor_comment, recorder_role, recorded_by_display_name,
  recorded_at, correction_reason` (superseded rows included: show history with the reason).
- `trainers_for_training_program(p_program_id)` (owner, trainers, enrolled workers): `designation_id, display_name,
  designated_at, revoked_at`.
- After a D-18 shop removal, use `training_enrollments.shop_name_snapshot` / `program_title_snapshot` /
  `owner_display_name_snapshot` when the shop is gone.
- Booking gate errors to map (owner assign / worker start, 23514): `This worker is in required training with your
  shop and cannot be assigned to customer bookings until the training ends.` / `You are in required training with
  this shop and cannot start customer bookings until the training ends.`
- Notification categories: `training.invited`, `training.response`, `training.cancelled`, `training.schedule_changed`,
  `training.trainer_role`, `training.record_corrected`, `training.assessment` (subject_type `training_enrollment` or
  `training_program`).

## BUILD (frontend), 2026-10-26
Frontend only (`frontend/src`); no `supabase/` or `scripts/` change, no `.env` read, no commit.

### What was added
- Domain: `models/{TrainingProgram,TrainingSession,TrainingEnrollment,TrainingEvidence,TrainingTrainer}.ts`;
  `utilities/{trainingProgramLifecycle,trainingEnrollmentLifecycle}.ts` (per-actor actions; open readiness; progress never computed).
- Repositories (RPC writes only, `toUserFacingError`, a missing / all-null RPC row is a failure):
  `Supabase{TrainingProgram,TrainingEnrollment,TrainingEvidence}Repository.ts`; rows in `supabaseTrainingRows.ts` +
  `supabaseTrainingEnrollmentRows.ts` (explicit columns, `worker_fee` read only); `supabaseSessionUser.ts`.
- Validation / services: `trainingProgramSchemas.ts`, `trainingProgramDraft.ts`, `trainingSessionDraft.ts`,
  `trainingEvidenceSchemas.ts`; `Training{Program,Enrollment,Evidence}Service.ts`; DI `createTrainingDependencies.ts`.
- Hooks: generic `useLatestResource` (latest-request + 60 s poll) used by `useOwnerTrainingPrograms`, `useTrainingProgramEditor`,
  `useTrainingSessions`, `useTrainingTrainers`, `useTrainingRoster`, `useTrainingEvidence`, `useMyTrainings`,
  `useTrainingInvitation` (55000 -> refresh + re-acknowledge), `useTrainerPrograms`, `useInviteToTraining`.
- UI: shared `components/training/*` (progress, pay+fee, sessions, notices, attendance sheet, correction modal, assessment
  sign-off, evidence history, records panel, roster panel, confirm/reason modals, program details view); owner
  `owner/training/*` (lazy Training tab: programs, editor without fee input and no pre-fill, days, trainers from linked roster,
  open modal with `w6_owner_v1` attestation, invite from accepted application in the applicant drawer); worker
  `worker/training/*` (lazy "My training" with notice `w6_v1` first, agreed-terms snapshot, decline/leave confirmations,
  `shop_removed` view with snapshot names; "Training I run" tab only when designated).
- `supabaseErrorMessages.ts`: every W6 message incl. both C7 gate messages, plus a pattern list for the numbered open message.

### Deviations from PLAN section 6
- `TrainingProgramPreview` became shared `components/training/TrainingProgramDetailsView.tsx` (owner preview and worker invitation);
  `TrainingRosterPanel` moved to shared `components/training/` (owner + trainer); `LeaveTrainingConfirmModal` /
  `CancelEnrollmentModal` are the generic `TrainingConfirmModal` / `ReasonConfirmModal`; row mapping split into two files.
- New program: create (title) then `update_training_program_draft` against its first `updated_at`; a failed second step leaves a draft.
- Extra hooks `useLatestResource`, `useTrainingTrainers`, `useInviteToTraining`; test double gained `.is()`.

### Actual output (frontend/)
- `npm run lint`: exit 0, no problems.
- `npm run build`: `tsc -b` clean, `vite build` "built in 798ms"; Training panels are separate lazy chunks.
- `npm test`: `Test Files 70 passed (70)`, `Tests 117 passed (117)` (92 existing + 25 W6: all 22 planned names plus
  `j17_training_rpc_without_a_row_is_a_failure`, `j6_assessment_button_shown_once_server_reports_days_attended`,
  `w6_shop_removed_training_shows_snapshot_names_and_leave`).
- `grep -rn "service_role" frontend/src`: empty; `worker_fee` appears in repositories only in the read select list and tests.

Not verified: against the local Supabase stack (mocked tests only); visual review in a browser.

## Review polish (frontend), 2026-10-26
Frontend only (`frontend/src`); no `supabase/` or `scripts/` change, no `.env` read, no commit. The "Review polish (DB)"
section was not in this log yet; the shape was taken from the current `w6d` / `w6g` migrations (`failure_reason` column,
`p_failure_reason text default null` on both assessment RPCs, `failure_reason` in `training_evidence_for_enrollment`,
23514 `Give a reason for the fail of 10 to 300 characters.`). Re-check if the DB section names anything different.

- Copy: `trainingVersusPaidWorkText` now reads "Training is not productive work for customers. ... Terms for any later
  customer work are agreed separately ..." (no "not paid work"; optional training pay, D-7, stays consistent).
- Evidence history: each assessment lists every checklist item from the stored snapshot with Met / Not met (a missing
  snapshot entry is shown as "Item n", never invented) plus the stored fail reason; the "n of m" summary stays.
- Assessment sign-off: choosing Not passed shows a required "Reason for not passing (10 to 300 characters)" field; the
  optional comment stays. Domain inputs gained `failureReason`; zod refine (fail: trimmed 10..300; pass: null);
  repository sends `p_failure_reason` (null for a pass) via `toAssessmentTextParams`; evidence model / row mapping gained
  `failureReason`; the DB message was added to `supabaseErrorMessages.ts`.
- Program editor: `application/validation/trainingTermsFeeWording.ts` flags fee-like words (fee, bayad, deposit, bond,
  deduct, kaltas, repay, multa, penalty, charge; case-insensitive) in terms / pay details / reimbursement and the
  Pay-and-terms section shows a polite `role="status"` warning naming the words. Saving is never blocked; no legal claim.
- Tests (+11): `trainingNoticeCopy.w6.test.ts`, `trainingTermsFeeWording.w6.test.ts`, `trainingEvidenceSchemas.w6.test.ts`,
  `TrainingProgramPayAndTermsSection.w6.test.tsx`, extra cases in `TrainingEvidenceHistory.w6.test.tsx` and
  `AssessmentSignOffModal.w6.test.tsx`.

Actual output (frontend/): `npm run lint` exit 0, no problems; `npm run build` `tsc -b` clean, vite "built in 430ms";
`npm test` `Test Files 74 passed (74)`, `Tests 128 passed (128)`.
Not verified: against the local Supabase stack (mocked tests only); visual review in a browser.

## Review polish (DB), 2026-10-26
Local Docker stack only (staged `.local-supabase-test`); no `.env` read, no `db push` / `link` / remote, w5 and
earlier untouched (`git diff --name-status caca376 -- supabase/migrations` empty), no `frontend/` change, no commit.
The uncommitted W6 migrations were edited in place.

1. w6g `lock_training_enrollment_for_recorder`: for a trainer, locks the designation's `workers` row FOR SHARE (after
   program and enrollment) and re-checks `is_authorised_training_recorder`. New w6f trigger
   `workers_revoke_unlinked_trainers` (BEFORE UPDATE OF user_id OR DELETE on `workers`, definer) revokes every
   unrevoked designation through the row (flag `roster_unlinked:<row>`, accepted by the w6b guard; revoked_by =
   caller or roster owner; skipped when the trainer profile is already gone, since the cascade removes it). w6i audits it as
   `changed_by = roster_unlinked` and notifies the trainer. A re-link does not revive the designation (tested).
2. w6c `shops_remove_unenrolled_training_programs`: `perform ... for update` on the shop's programs before the
   not-exists delete. Orphan program (kept at shop removal, last enrollment later removed) is documented as a
   limitation in `TRAINING.md` (no cleanup added: a delete inside the enrollment cascade would hit the session /
   attendance RESTRICT ordering).
3. w6h: `roster_worker_in_required_training(p_worker_row_id uuid, p_shop_id uuid)` requires
   `workers.owner_id = shops.owner_id` of `new.shop_id`; trigger renamed `bookings_guard_update_training_gate`
   (fires after W2 `bookings_guard_update`; the old trigger name is dropped; function name unchanged).
4. w6d comments now say: no trusted-session bypass, but not tamper-proof (W6-L5).
5. w6d realtime block: RAISE EXCEPTION if `supabase_realtime` is FOR ALL TABLES or lists any `training_*` table.
6. w6f: new internal `training_enrollment_is_live(uuid)` = progress in (invited, scheduled, in_progress,
   awaiting_assessment); both limits use it (invitations still count, so the 100 cap still bounds invitations).
   `withdraw_from_training` / `cancel_training_enrollment` refuse only `completed` (failed may leave / be cancelled);
   close / archive already allowed failed.
7. `training_assessments.failure_reason text` + CHECK `ta_failure_reason_check` (set exactly when result = 'failed',
   10..300). RPCs: `record_training_assessment(p_enrollment_id, p_items_met, p_result, p_assessor_comment default null,
   p_failure_reason default null)`, `correct_training_assessment(p_assessment_id, p_items_met, p_result,
   p_assessor_comment, p_correction_reason, p_failure_reason default null)`; fail without a 10..300 reason -> 23514
   `Give a reason for the fail of 10 to 300 characters.`; a pass stores null.
   Worker read shape (own enrollments only; others get 0 rows / 42501):
   - table `training_assessments` (RLS `can_read_training_evidence`): `checklist_snapshot text[]`, `items_met boolean[]`
     (same order and length), `result`, `failure_reason`, `assessor_comment`, `assessor_display_name`, `signed_off_at`,
     `supersedes_id`, `correction_reason`;
   - `training_evidence_for_enrollment(p_enrollment_id)` returns, in order: `evidence_kind, evidence_id, supersedes_id,
     is_current, session_id, session_date, session_kind, attendance_status, progress_note, checklist_snapshot,
     items_met, result, assessor_comment, failure_reason, recorder_role, recorded_by_display_name, recorded_at,
     correction_reason` (`failure_reason` new, null for attendance and passes).
8. `LEGAL_REVIEW_REGISTER.md`: W6-L11, W6-L12, W6-L13 added (OPEN; L13 notes the partial DB mitigation).
9. `TRAINING.md`: W7 carry-forward (completion can go backwards after corrections; re-check at issue time in the
   issuing transaction), limits, fail exits, fail reason, trainer auto-revoke, gate scope / name, realtime abort,
   orphan-program limitation; `ROLE_AND_PROFILE_SECURITY.md` D-10 row 31 and the guard matrix use the new trigger name.

Tests: new `supabase/tests/database/j17_w6_review_polish.test.sql` (34): `w6rp_ten_live_trainings_block_an_invite`,
`w6rp_failed_assessment_requires_reason`, `w6rp_completed_and_failed_are_not_live`, `w6rp_worker_reads_own_checklist_items`,
`w6rp_failed_trainee_can_leave`, `w6rp_owner_can_cancel_or_close_after_fail`, `w6rp_gate_fires_after_w2_guard`,
`w6rp_gate_message_not_returned_to_non_owner`, `w6rp_gate_still_blocks_own_trainee`, `w6rp_gate_scoped_to_booking_shop_owner`,
`w6rp_shop_removal_locks_programs_first` (structural), `w6rp_trainer_unlink_revokes_and_relink_does_not_revive`,
`w6rp_roster_row_delete_revokes_trainer`. Changed: `j17_w6_training_authorization` (signatures, 28 internal functions),
`j6_worker_cannot_complete_training_without_three_days_and_assessment` (the fail passes a reason).
First run found one regression, fixed: the trainer account deletion cascade (`j17_cascades_remove_training_and_keep_audit`)
hit the trainers FK (23503) from the new revoke trigger; the trigger now skips designations whose profile is gone.

### Actual output (final run)
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: tests 18, pass 18, fail 0.
- `node scripts/supabase-test/run-db-tests.mjs`: exit 0; W6 migrations `20261025000006..14` applied; `Files=38,
  Tests=1408` (1374 + 34), `Result: PASS`; 0 `todo_start(`.
- `w2-api-smoke: 48 passed, 0 failed`; `w3-api-smoke: 33 passed, 0 failed`; `w4-api-smoke: 43 passed, 0 failed`;
  `w5-api-smoke: 39 passed, 0 failed`; `w6-api-smoke: 40 passed, 0 failed`.
- `npx supabase stop --workdir .local-supabase-test --no-backup`: "Stopped supabase local development setup."
- Every W6 migration has `-- ROLLBACK`; every W6 migration / test file <= 350 lines (w6c, w6d, w6f exactly 350).

Not verified: real concurrency (recorder vs unlink, shop delete vs invite: lock order checked structurally only);
the w6d realtime abort path (local publication is not FOR ALL TABLES and lists no training table); ROLLBACK blocks
not executed; production parity; the frontend against the local stack.

## Orchestrator record (2026-10-26)
- D-18 overridden by orchestrator (retain training evidence on shop/owner deletion).
- Frontend build interrupted once by a usage limit and resumed.
- REVIEW: security and compliance no BLOCKING; review polish applied (DB + frontend). REVIEW.md.
- VERIFY: PASS (VERDICT.md). Fix cycles: 0 (polish only).
