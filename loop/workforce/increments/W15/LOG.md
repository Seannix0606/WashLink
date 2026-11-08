# W15 - LOG

## BUILD (frontend + docs) - 2026-11-03 (frontend builder; branch feature/workforce, HEAD 3967f32; not committed)

Scope: PLAN sections 5 (D-81), 6 (Vitest) and 7 (Frontend, Docs). No file under `supabase/` or `scripts/` touched (the
DB agent works there in parallel). `.env` not read.

Frontend:
- `frontend/src/presentation/utilities/trainingNoticeCopy.ts`: only `trainingVersusPaidWorkText` changed (line 36; double
  quotes because the text has an apostrophe, as in `certificationCopy.ts`). `w6_v1` notice and owner attestation unchanged.
  Before: "Training is not productive work for customers. Trainees cannot be assigned to customer bookings while their
  required training is unfinished. Terms for any later customer work are agreed separately and are not part of this training."
  After (D-81): "Training is not productive work for customers. While your required training is unfinished, WashLink refuses
  the training shop's requests to assign you to its customer bookings through a roster entry that is or was linked to your
  account. WashLink cannot detect a roster entry that was never linked to your account, or work arranged outside WashLink.
  Terms for any later customer work are agreed separately and are not part of this training."
- New `frontend/src/presentation/utilities/trainingNoticeCopy.w15.test.ts`: `w15_trainee_notice_states_only_what_the_platform_enforces`
  (exact D-81 text; contains the three plan phrases; not `/Trainees cannot be\s+assigned/` (written with `\s+` so the AC10
  grep stays empty), `/\b(guarantee|always|never be assigned)\b/i`, `/not paid work|unpaid/`). `trainingNoticeCopy.w6.test.ts` unchanged.
- `frontend/src/test/workforceDocs.w13.test.ts`: 164 -> 165, `toContain('W15-L1')`, part rows also not `W15-`, comment updated.

Docs (`docs/workforce/`, all <= 350 lines):
- `LEGAL_REVIEW_REGISTER.md` (310 lines): title / scope W0-W15; status row W15 1 / 1 / index; Total 165 / 165, "index: 12";
  sign-off row "W15 items in this index (1 item)"; topic "Free training" adds W15-L1; ID list renames W6-L12 to "Training vs
  productive work copy (source updated W15)" and adds `index | W15-L1`; new "## W15 items" section with the W15-L1 row (OPEN).
- `legal/REGISTER_PART_1_W0_W8.md`: W6-L12 text kept, note appended ("W15 source update: the copy now reads" + D-81 text +
  "'Training is not paid work.' was removed in the W6 review polish (F-C3)." + "See W15-L1."); source cell adds
  `trainingVersusPaidWorkText`. Still OPEN. No other row changed (1 line in the diff).
- `TRAINING.md` (212): C7 section adds the W15 history rule, D-79 / D-80, the P6 limit (W15-L1), D-81 copy; limitation bullet
  and rollback paragraph updated.
- `ARCHITECTURE.md` (176): W15 increment row, apply order ends W15, key data rule "a roster row that is or was linked",
  `roster_link_history` in the W2 data row, tests section (97th migration; counts pending the W15 test run).
- `LIMITATIONS.md` (144): free-training paragraph says what W15 closes; new first gap bullet (never-linked / re-created
  rows, P6; pre-audit links; W15-L1); smoke count note; 165 items; W15-L1 in open legal topics.
- `ROLLBACK_GUIDE.md` (161): `Order: W15 -> W13 -> W12 -> ...`; W15 row (restores the w6h body first, then drops trigger,
  function, table; re-opens F-C2); D-11 version `20261103000001`. Line number of the w15a ROLLBACK header not pinned (DB
  file still in progress).
- `ACCEPTANCE_TESTS.md` (163): J7 / J16 / J18 rows name the W15 files and the w15 smoke; J18 roll-up note; new "W15 tests"
  section; K10 165 items.
- `LOCAL_TEST_HARNESS.md` (334): 97 migrations (W15 `20261103000001`), 3 new pgTAP rows, 001 / J18 roll-up planned plans
  28 / 26, runner order with w15 before w13, 14 smokes, W15 smoke bullet.
- `DEPLOYMENT_READINESS.md`: 164 -> 165.
- Every pgTAP, smoke and assertion count for W15 is written as "pending the W15 test run"; none was invented.
- `grep -rn "Trainees cannot be assigned" frontend/src docs`: no output (exit 1).

New `loop/workforce/increments/W15/LEGAL_FLAGS.md` (W13 format) with W15-L1.

Checks (in `frontend/`, 2026-11-03):
- `npm run lint`: `eslint .`, exit 0, no output.
- `npm run build`: `tsc -b && vite build`, `built in 518ms`, exit 0.
- `npm test`: `Test Files  146 passed (146)`, `Tests  300 passed (300)`, exit 0 (includes
  `w15_trainee_notice_states_only_what_the_platform_enforces`, `w6_polish_training_copy_does_not_contradict_optional_training_pay`
  and `w13_legal_register_index_matches_parts_and_all_open` with 165 rows, all OPEN).

Not done here (orchestrator at RECORD): DECISIONS D-79..D-82, LOOP.md, STATE.md. No legal item resolved; no human gate ticked.

## BUILD (DB) + TEST - 2026-11-03 (DB builder; branch feature/workforce, HEAD 3967f32; not committed)

Scope: PLAN sections 3, 6 (pgTAP + smoke) and 7 (DB, Tests, Scripts). Nothing under `frontend/` or `docs/` touched. Local
Docker stack only (`--local --workdir .local-supabase-test`); no `--linked`, `--db-url`, `db push` or `link`; `.env` not read.

Files:
- NEW `supabase/migrations/2026_11_03_w15a_training_gate_roster_link_history.sql` (163 lines; staged `20261103000001`):
  preflight; `roster_link_history` (PK (worker_row_id, user_id), FKs on delete cascade to workers / profiles, source CHECK,
  `roster_link_history_user_id_idx`, RLS on, no policies, `revoke all ... from public, anon, authenticated, service_role`);
  `record_roster_link_history()` (definer, `search_path = public, pg_temp`, execute revoked from all four) + trigger
  `workers_record_link_history` AFTER INSERT OR UPDATE OF user_id WHEN (new.user_id is not null), writes only its own table;
  backfill (current links -> `backfill_current`; `roster.linked` / `roster_entry` audit rows whose row and profile exist ->
  `backfill_audit`, min(created_at)) with a RAISE NOTICE of both counts; `create or replace` of
  `roster_worker_in_required_training(uuid, uuid)` (same signature / attributes / revokes; history OR current link; the
  `w.user_id is not null` filter removed). ROLLBACK block: w6h body verbatim first, then trigger, function, table.
- NEW pgTAP: `j7_w15_training_gate_survives_roster_unlink.test.sql` plan(45), `j16_w15_worker_unlink_and_decline_still_succeed.test.sql`
  plan(12), `j18_w15_flows.test.sql` plan(16).
- EDITED pgTAP: `001_migration_replay.test.sql` plan 27 -> 28 (`('20261103000001')` added to
  `replay_schema_migrations_has_baseline_w2_to_w14_w12_and_w13`; new `replay_w15_link_history_table_trigger_and_backfill_present`;
  header 95 migrations / 97 staged); J18 roll-up plan 25 -> 26 (`= 96` -> `= 97`; new `j18_trainee_not_assignable_after_owner_unlink`).
  DEVIATION: also `j17_database_constraints_and_authorization_prevent_unauthorized_access.test.sql` (not in the plan's file list):
  its `j17_workforce_table_list_is_complete` failed on the new table, so `roster_link_history` is added to the explicit table list
  (43 -> 44) with NO expected grant for `authenticated` (like `worker_roster_link_codes`), header "96" -> "97". Plan unchanged (37).
- NEW `scripts/supabase-test/w15-api-smoke.mjs` (217 lines); `run-api-smokes.mjs` SMOKE_ORDER `..., 'w12', 'w15', 'w13'` + header comment.

Static checks:
- AC1: `git status --short supabase/migrations` -> only `?? .../2026_11_03_w15a_training_gate_roster_link_history.sql`;
  `git diff --name-status 3967f32 -- supabase/migrations` -> empty (no committed migration changed; w2d / w6h untouched).
- Rollback body: `diff` of the w6h function text vs the uncommented ROLLBACK text -> identical ("VERBATIM").
- AC14: `grep -niE "before (insert or )?update|guard_worker_roster_write|unlink_my_roster_entry" supabase/migrations/2026_11_03_w15a*.sql`
  -> no output (exit 1).
- `grep -c "todo_start(" supabase/tests/database/*.sql` -> every file 0.

Local runs:
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs` -> `tests 19`, `pass 19`, `fail 0`.
- `node scripts/supabase-test/run-db-tests.mjs` -> 97 `Applying migration` lines (last `20261103000001_w15a_training_gate_roster_link_history.sql`),
  every file `ok`, `All tests successful.`, `Files=108, Tests=3273`, `Result: PASS`, exit 0. (First run: FAIL on
  j17 table list, j18_w15 customer insert, j7_w15 P5; fixed as described below.)
- `node scripts/supabase-test/run-api-smokes.mjs`:
  w2 48/0, w3 33/0, w4 43/0, w5 39/0, w6 40/0, w7 38/0, w8 30/0, w9 34/0, w10 39/0, w11 36/0, w14 33/0, w12 22/0,
  `w15-api-smoke: 17 passed, 0 failed`, `w13-api-smoke: 17 passed, 0 failed`, `run-api-smokes: PASS (14 smokes)`.
- Verifier probe `probe_fc2.sql` after a fresh `supabase db reset --local` (its own begin ... rollback):
  `not ok 1 - j18_customer_books_with_server_quote` (the probe's `= 96` pin; count is now 97, as the plan expects),
  `probe_assign_linked_trainee=23514`, `probe_owner_unlinks_trainee=succeeded`, **`probe_assign_after_unlink=23514`** (AC3),
  `probe_state=accepted,<rk id>,rt=<rt id>` (b2 holds rk from the probe's earlier step, not rt), `ROLLBACK`. Afterwards
  schema_migrations = 97, roster_link_history = 0 rows, no j18r-* users (rolled back).
- Extra local checks (rolled-back transactions): (a) j7_w15 run with the ROLLBACK w6h body restored -> 10 of 45 fail
  (probe, P2, P3, P4, P5 ...), i.e. the tests detect the bypass; (b) the ROLLBACK block executes (function, DROP FUNCTION,
  DROP TABLE); (c) the backfill DO block on synthetic data: `current links: 1, from roster.linked audit rows: 1`, re-run `0, 0`
  (idempotent; an audit row for a deleted roster row is skipped).
- Stack stopped (`supabase stop --workdir .local-supabase-test`); 0 washlink-local-test containers running.

Deviations from PLAN section 6 (behaviour found, not invented):
- P5 (`w15_preassigned_booking_cannot_start_after_unlink`): the plan expected super_admin `in_progress` -> 23514 and the former
  worker -> 42501. Actual: `bookings` has NO super_admin update policy and the former worker no longer passes
  `bookings_update_assigned_worker`, so both API-style updates match 0 rows (`succeeded`, booking stays `accepted`). The test pins
  that, then exercises the w6h START branch with a session carrying the super_admin JWT but bypassing RLS (not trusted because it
  has a JWT) -> 23514, and asserts `roster_worker_in_required_training(r5, s1)` = true after the unlink.
- `j18_w15_customer_booking_insert_unchanged`: w2c `guard_booking_insert` REFUSES (42501 "New bookings start as pending,
  unassigned and unrated.") an insert carrying `assigned_worker_id`; it does not force it to null. The test pins 42501 plus the
  normal insert (server quote 250.00, no worker).
- `w15_relinked_row_to_other_account_still_gated`: "a fresh row for that worker" needs the second worker to unlink rt first
  (`workers_owner_user_unique`); the test does that, then a trusted insert of the fresh row; assign `succeeded`.
- j17 roll-up edited (see Files).
- Generic DB-builder rules vs this plan: `roster_link_history` follows the plan (composite PK, no uuid id, no created_at /
  updated_at, no policies = deny-all) rather than the generic "uuid PK / explicit policies" rule; it is internal derived data.

Frontend impact: NO new error message. The gate raises the existing w6h texts with SQLSTATE 23514 ("This worker is in
required training with your shop and cannot be assigned to customer bookings until the training ends." / the worker's start
text). The smoke checks `/required training/` on the refusal after unlink.

Not verified: production backfill on real data / orphaned links (R2), concurrency of link vs assignment (R3), unknown production
triggers on `workers` (R4); the NOTICE text is not shown by `supabase db reset` (verified only in the manual backfill run).

## BUILD (frontend + docs) - docs counts - 2026-11-03

After the W15 DB step, every "pending the W15 test run" in `docs/workforce` was replaced with the results in "BUILD (DB) +
TEST" above. Line numbers were read from the files.
- `ACCEPTANCE_TESTS.md`:
  - The "W15 tests" section now uses the real `.test.sql` names with plan and line numbers: j7_w15 plan 45, j16_w15
    plan 12, j18_w15 plan 16, 001 plan 28 (`replay_w15_...`:252), J18 roll-up plan 26.
  - `j18_trainee_not_assignable_after_owner_unlink` is at line 124; `j18_booking_tables_gain_no_workforce_columns` moved
    to 130.
  - It records the P5 deviation (0-row updates under RLS, then the start check in an RLS-bypassing session with a
    super_admin JWT: 23514) and the 42501 customer-insert deviation (w2c guard).
  - J17 table list now 44 tables + 2 views (plan 37). K3, K5 and K9 updated.
- `ARCHITECTURE.md`: 44 tables; 108 files / 97 migrations / `Tests=3273`; 14 smokes.
- `LIMITATIONS.md`: 14 smokes, PASS.
- `ROLLBACK_GUIDE.md`: W15 row is `...w15a_training_gate_roster_link_history.sql:135`.
- `LOCAL_TEST_HARNESS.md`: 108 / 3273, plans 28 / 26 / 45 / 12 / 16, 44 tables, w15 smoke 17 checks, runner `PASS (14 smokes)`.
- Checks:
  - `grep -rni "pending the W15" docs`: no output (exit 1).
  - Largest workforce docs: 350 lines (unchanged files). Edited docs: LOCAL_TEST_HARNESS 334, ACCEPTANCE_TESTS 174.
  - `npm test`: `Test Files 146 passed (146)`, `Tests 300 passed (300)`.

## FIX CYCLE 1 (frontend + docs) - 2026-11-03

Scope: W15 REVIEW items C-SF-1, C-SF-2 / SEC-3, C-SF-3, SEC-4, SEC-6 / C-SF-4, SEC-8 and C-N-3. Nothing under
`supabase/` or `scripts/` was touched, `.env` was not read, and nothing is committed. The J16 files are unchanged.

### Frontend (C-SF-1, W15-L2)
- `trainingNoticeCopy.ts`: new `shopTrainingVersusPaidWorkText`. The trainee text `trainingVersusPaidWorkText`
  (D-81) is unchanged.
  - Before: owner and trainer views showed the D-81 trainee text.
  - After: "Training is not productive work for customers. The training shop may not assign trainees to customer
    bookings while their required training is unfinished. WashLink refuses such assignments through roster entries
    that are or were linked to the trainee's account. Terms for any later customer work are agreed separately and
    are not part of this training."
- `TrainingNotices.tsx`: `TrainingVersusPaidWorkNote` takes `audience?: 'trainee' | 'shop'` (default `trainee`).
- `TrainingProgramDetailsView.tsx`: takes the same `audience` prop and passes it to the note.
- `audience="shop"` is set in these places:
  - `OwnerTrainingProgramsPanel.tsx`, line 112 (the note) and line 184 (the preview);
  - `TrainingProgramManageView.tsx`, line 54;
  - `TrainingProgramEditorModal.tsx`, line 94 (the preview);
  - `TrainerProgramsPanel.tsx`, line 83.
- Trainee views keep the default: `MyTrainingsPanel`, `MyTrainingProgress`, and `TrainingInvitationDetail` (through
  the details view).
- New `TrainingVersusPaidWorkNote.w15.test.tsx` has 6 tests:
  - the shop text has no second person, no detection limits and no "unpaid";
  - the owner panel and its preview modal, the manage view, the editor preview and the trainer panel show only the
    shop text;
  - `MyTrainingsPanel`, `TrainingInvitationDetail` and the default details view show only the D-81 text.
- `workforceDocs.w13.test.ts` now pins 167 rows, including W15-L1, W15-L2 and W15-L3.

### Docs
- `TRAINING.md`: D-80 side effects:
  - the misleading w6h owner and start messages;
  - the workaround: unlink the old row first (`workers_owner_user_unique`), then the owner adds a new row;
  - a leaked link code taints a row;
  - SEC-4 (a booking in progress can be completed by a trainee who links later);
  - the shop text.
- `LIMITATIONS.md`:
  - the lead sentence now says "through a roster row that is or was linked to the trainee";
  - new gaps: other owners' bookings, trusted SQL, SEC-4, and the D-80 side effects;
  - the ROLLBACK line now records the one local w15a run;
  - the count is 167, and W15-L2 and W15-L3 are added to the open legal topics.
- `ROLLBACK_GUIDE.md`:
  - the w15a block ran once, locally, inside a rolled-back transaction, and nowhere else;
  - the W15 row now cites line 154, where the DB fix cycle moved the ROLLBACK header.
- `DEPLOYMENT_READINESS.md`:
  - 97 staged migrations and D-10 rows 1-57;
  - a new gate for the `public.workers` triggers (row 57, R4 / SEC-8);
  - the rollback note is updated and the count is 167.
- `ROLE_AND_PROFILE_SECURITY.md`: new D-10 row 57 for W15 R4 / SEC-8. It lists the triggers on `workers` that the repo
  creates and the backfill NOTICE counts (R2).
- `ACCEPTANCE_TESTS.md`: the K3 rollback wording, K10 at 167, and the fix-cycle Vitest file.
- `LEGAL_REVIEW_REGISTER.md`:
  - the W15 status row is 3 / 3; the total is 167 (index 14);
  - sign-off rows for labor law (3 items) and data privacy (W15-L3);
  - topics: W15-L2 under free training, W15-L3 under retention and under personal data;
  - ID list rows for W15-L2 and W15-L3;
  - W15-L1 gains the fix-cycle additions; W15-L2 and W15-L3 rows are added.
- W15-L2 register row:
  - It records the shop text as shipped.
  - The reviewer's quote of the old W6 sentence is replaced there by a pointer to the "Copy before" in LEGAL_FLAGS,
    so `grep -rn "Trainees cannot be assigned" frontend/src docs` stays empty (AC10).
  - The `TrainingProgramDetailsView.tsx` reference moved from line 48 to line 51.
- `LEGAL_FLAGS.md`: W15-L1 and W15-L2 updated to match, plus a fix-cycle note.
- pgTAP and smoke counts are unchanged, pending the DB agent's totals.

### Checks
- `npm run lint`: exit 0.
- `npm run build`: `built in 755ms`, exit 0.
- `npm test`: `Test Files 147 passed (147)`, `Tests 306 passed (306)`, exit 0.
- `grep -rn "Trainees cannot be assigned" frontend/src docs`: exit 1 (no output).
- The largest docs file is 350 lines (unchanged files); `LEGAL_REVIEW_REGISTER.md` is 316.

## FIX CYCLE 1 (DB) - 2026-11-03 (DB builder; REVIEW.md SEC-1, SEC-2, SEC-7; not committed)

Changes (w15a edited in place; still the only W15 migration, now 183 lines):
- SEC-1: `record_roster_link_history()` returns early when `tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id`,
  and inserts only when a `public.profiles` row exists for `new.user_id` (an orphaned production link no longer fails the roster
  write with 23503).
- SEC-7: the backfill also reads `roster.unlinked` audit rows (`subject_profile_id = old.user_id`, w3d:173 / 204), source
  `backfill_audit` (CHECK unchanged). To make it testable it is now `public.backfill_roster_link_history(out current_count, out
  audit_count)` (definer, `search_path = public, pg_temp`, execute revoked from public, anon, authenticated, service_role); the
  migration calls it once in a DO block and RAISEs the NOTICE with both counts. Idempotent (`on conflict do nothing`).
- ROLLBACK block: also `drop function if exists public.backfill_roster_link_history();` (after the w6h body, before the
  table). The w6h body is still verbatim (`diff` -> identical); the block runs in a rolled-back transaction (2x DROP FUNCTION,
  DROP TABLE, 0 W15 functions left, table gone).
- Tests:
  - `j7_w15_training_gate_survives_roster_unlink.test.sql` plan 45 -> 51 (225 lines):
    - SEC-2: `user_id is null` after the owner's unlink.
    - new `w15_noop_user_id_update_writes_no_history`, 2 checks: a no-op update by the owner and by a trusted session is
      `succeeded` and writes no history.
    - new `w15_backfill_uses_linked_and_unlinked_audit_rows`, 3 checks: after rt's history is deleted, the backfill returns
      `1,2` and restores wt and w2 as `backfill_audit`. wt is found only through its `roster.unlinked` row, because a trusted
      insert writes no `roster.linked` row. A re-run returns `0,0`.
    - `w15_gate_functions_not_client_executable` now also covers `backfill_roster_link_history()` (9 x false).
  - J18 roll-up plan 26 -> 27 (138 lines): `user_id is null` after the probe unlink (`j18_trainee_not_assignable_after_owner_unlink`).
  - Other plans unchanged: 001 28, j16_w15 12, j18_w15 16, j17 roll-up 37.
- `w15-api-smoke.mjs` (218 lines): `w15_gate_functions_not_callable` also calls `backfill_roster_link_history` (count of checks unchanged).

Local runs:
- Stager test: `tests 19`, `pass 19`, `fail 0`.
- `run-db-tests.mjs`: 97 `Applying migration`, `All tests successful.`, `Files=108, Tests=3280`, `Result: PASS`. The first fix run
  failed 1 test, because `pg_temp.history` (stable) and the backfill call were in the same statement and shared one snapshot.
  They are now split. 0 `todo_start(` in every file.
- `run-api-smokes.mjs`: w2 48, w3 33, w4 43, w5 39, w6 40, w7 38, w8 30, w9 34, w10 39, w11 36, w14 33, w12 22,
  `w15-api-smoke: 17 passed, 0 failed`, `w13-api-smoke: 17 passed, 0 failed`, `run-api-smokes: PASS (14 smokes)`.
- probe_fc2.sql after a fresh local reset: `not ok 1` (its `= 96` pin), `probe_assign_linked_trainee=23514`,
  `probe_owner_unlinks_trainee=succeeded`, `probe_assign_after_unlink=23514`, `probe_state=accepted,<rk>,rt=<rt>`, `ROLLBACK`.
- AC14 grep: no output. Stack stopped (0 containers).
- Frontend: still no new error message.

## FIX CYCLE 1 docs counts - 2026-11-03

The docs now match "FIX CYCLE 1 (DB)". Only `docs/workforce` and W15 `LEGAL_FLAGS.md` were edited.

Counts:
- pgTAP total is `Files=108, Tests=3280`, in ACCEPTANCE_TESTS, ARCHITECTURE and LOCAL_TEST_HARNESS. The older figure
  of 3273 was removed from LOCAL_TEST_HARNESS's history list, so the grep for it is empty.
- j7_w15 is plan 51. The new `w15_noop_user_id_update_writes_no_history` is at line 171 and the new
  `w15_backfill_uses_linked_and_unlinked_audit_rows` at line 179. The other assertions moved to 59, 71, 85, 100, 118,
  124, 144, 150, 159, 185, 211, 215 and 219; the first is still at 47.
- J18 roll-up is plan 27. `j18_trainee_not_assignable_after_owner_unlink` is still at line 124 (SEC-2 added).
  `j18_booking_tables_gain_no_workforce_columns` moved from 130 to 131.
- K5 and K9 updated.

Descriptions:
- TRAINING, ARCHITECTURE, DEPLOYMENT_READINESS and ROLE_AND_PROFILE_SECURITY row 57 describe the private
  `backfill_roster_link_history()` and the SEC-1 no-op / orphan guard. The function runs as definer and is not
  executable by any client role or service_role. The backfill reads `roster.linked` and `roster.unlinked` audit rows.
- ROLLBACK_GUIDE: the w15a `-- ROLLBACK` header is still at line 154 of 183. The W15 row and the TRAINING rollback
  paragraph now say the block also drops `backfill_roster_link_history()`.
- W15-L3 source refs, in both the register and LEGAL_FLAGS, are now `:38-52` (table), `:54-84` (recorder trigger) and
  `:86-123` (backfill function and call).

Checks:
- `grep -rni "3273\|plan 45\|plan(45)" docs/workforce`: no output.
- AC10 grep: no output.
- Every docs file is 350 lines or fewer.
- `npm test`: 147 files, 306/306 passed.

## VERIFY, RECORD - 2026-11-04

- VERIFY (interrupted once by an API rate limit; Docker was down on resume, restarted; everything re-run from a clean stack): lint 0,
  build 0, Vitest 147 / 306, pytest 4, stager 19/19, `Files=108, Tests=3280`, `Result: PASS` (97 migrations), run-api-smokes PASS
  (14 smokes, 0 failed), probe `probe_assign_after_unlink=23514`; stack stopped. AC1-AC14 PASS (`VERDICT.md`), AC4 graded on the planned P1-P5 scope.
- Verifier reproduced SEC-5: deleting the training shop lifts the gate with the enrollment still accepted. Routed to W16 by name.
- RECORD: LOOP.md W15 smoke row and counts; STATE.md W15 passed; DECISIONS D-79..D-82 added.
