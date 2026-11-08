# W15 - Close the required-training booking-gate bypass (unlink path) and fix the trainee notice - VERDICT

**Overall: PASS, with one material finding** (independent verifier, 2026-11-04; uncommitted tree on `feature/workforce`, HEAD 3967f32, after fix cycle 1)

All 14 acceptance criteria and every check pass. The F-C2 unlink bypass is closed. **The finding:** the verifier reproduced SEC-5 on the local stack. The training owner can still lift the gate by deleting the training shop, then assign the trainee at another of its shops. No W15 document or W16 plan line records this yet. AC4 passes only as scoped to the plan's paths P1-P5; see "SEC-5" below. This does not reverse the REVIEW routing to W16, but that routing currently exists only in `REVIEW.md`.

Graded against PLAN.md section 8 (AC1..AC14), plus the coordinator's additions: 167 register items, and owner / trainer copy from fix cycle 1. REVIEW.md has no BLOCKING findings. LOG.md and REVIEW.md were read only to see what was claimed. Note: LOG.md is 289 lines (under 350).

**Two runs.** The suite first ran on 2026-11-03 (23:43-23:48), and a rate limit then interrupted the verification. On resuming, Docker was down, so the state of the stack could not be confirmed. Docker was started once, as the brief allows, and every check was re-run from a clean stack. All numbers below come from the second run (2026-11-04, from 22:11). Both runs gave the same counts. No W15 file changed after the first run's lint log was written (mtime check, repeated after the second run).

## Check suite (re-run by the verifier; Docker 29.9.2, 0 `washlink-local-test` containers and 0 volumes at the start)

| Check | Exit | Actual output |
|---|---|---|
| `cd frontend && npm run lint` | 0 | `eslint .`, no problems |
| `cd frontend && npm run build` | 0 | `built in 667ms` |
| `cd frontend && npm test -- --reporter=verbose` | 0 | `Test Files 147 passed (147)`, `Tests 306 passed (306)`, 0 failure lines |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | `4 passed, 1 warning` |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | `db reset --local --workdir` applied 97 migrations, the last being `20261103000001_w15a_training_gate_roster_link_history.sql`. `All tests successful.` `Files=108, Tests=3280`, `Result: PASS`; 108 files `ok`, 0 `not ok`, 0 `todo_start(` in the log and in `supabase/tests/database/*.sql` |
| `node scripts/supabase-test/run-api-smokes.mjs` (same stack) | 0 | w2 48, w3 33, w4 43, w5 39, w6 40, w7 38, w8 30, w9 34, w10 39, w11 36, w14 33, w12 22, w15 17, w13 17 passed; each `0 failed` (469 checks); `run-api-smokes: PASS (14 smokes)` |
| `probe_fc2.sql` after a fresh `npx supabase db reset --local --workdir .` (run inside `.local-supabase-test`, 97 applied; psql through `docker exec`; its own `begin ... rollback`) | 0 | `probe_assign_linked_trainee=23514`, `probe_owner_unlinks_trainee=succeeded`, **`probe_assign_after_unlink=23514`**, `probe_state=accepted,<rk id>,rt=<rt id>`, `ROLLBACK`. 22 `ok`, and the 1 expected `not ok 1 - j18_customer_books_with_server_quote` (its `= 96` pin; the count is now 97). Afterwards: schema_migrations 97, `roster_link_history` 0 rows, 0 `j18r*` users |
| `npx supabase stop --workdir . --no-backup` (run inside `.local-supabase-test`, project_id `washlink-local-test`) | 0 | `"backup":false,"message":"Stopped supabase local development setup."`; 0 containers and 0 volumes after |

Notes on reading the output:
- The runner log has 194 `Applying migration` lines because a stack with no volumes applies them twice: 97 on `supabase start`, then 97 on `db reset` (split at the reset line; 97 distinct files). The first run reused a leftover volume and printed 97.
- pgTAP and the smoke runner report per file or per smoke, not per assertion. "ok" for a named test below means its name is in a file reported `ok`, with `plan(n)` met. The w15 smoke check names were confirmed in the source, and the smoke ended `17 passed, 0 failed`.
- The stop was run from inside the workdir with `--workdir .` so the CLI never ran from the repo root, the same as the W13 verifier.

### Verifier-run extra local checks (each in a rolled-back transaction except the catalog selects)
- **Mutation.** j7_w15 run with the w6h gate body restored from the ROLLBACK block: 41 `ok`, 10 `not ok` (`w15_probe_...` 2, P2 1, P3 1, P4 1, P5 2, `w15_unassigning...` 2, `w15_gate_lifts...` 1). So the tests do detect the bypass. The live gate was still the W15 body afterwards.
- **ROLLBACK block executed** (lines 158-183, uncommented): CREATE FUNCTION, REVOKE, DROP TRIGGER, 2x DROP FUNCTION, DROP TABLE. Then `tbl=gone`, `fn_left=0`, `gate_has_history=false`.
- **Catalog.** `roster_link_history`: `relrowsecurity` true, 0 policies, 0 table privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) for anon / authenticated / service_role, not in any publication. `roster_worker_in_required_training`, `record_roster_link_history` and `backfill_roster_link_history`: 0 EXECUTE for the same roles.
- **SEC-5 probe:** see below.

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC1 | PASS | `ls supabase/migrations/2026_11_03_w15*` = 1 file (183 lines); `grep -c ROLLBACK` = 1 (:154). `git diff --name-status 3967f32 -- supabase/migrations` is empty; the only `git status` entry there is the untracked w15a (so the plan's "only `A`" is met as "only one new file"). w2d and w6h: `git diff --quiet` exit 0. `diff` of w6h:19-40 (blank line removed) against the uncommented w15a:158-178 is empty, exit 0, 21 lines each. Repo migrations 95 (+2 local baseline = 97) |
| AC2 | PASS | 97 replayed from a clean reset, `Files=108`, `Result: PASS`. `001_migration_replay` `ok`, plan 28; holds `replay_schema_migrations_has_baseline_w2_to_w14_w12_and_w13` and `replay_w15_link_history_table_trigger_and_backfill_present`. 0 `todo_start(` |
| AC3 | PASS | `w15_probe_owner_unlinks_trainee_then_assign_refused` (5 assertions, incl. `user_id is null` after the unlink) and `j18_trainee_not_assignable_after_owner_unlink` are in `ok` files. Probe prints `probe_assign_after_unlink=23514` |
| AC4 | PASS (P1-P5 scope) | `w15_worker_self_unlink_then_owner_assign_refused`, `w15_link_before_training_then_unlink_still_gated`, `w15_relinked_row_to_other_account_still_gated`, `w15_preassigned_booking_cannot_start_after_unlink` are in `j7_w15` (`ok`, plan 51). **Scope:** the criterion is worded "every other detectable path", and the evidence column names these four. Graded against the plan's section-0 / section-1 scope. SEC-5 is a further path the database could detect; it was not in that scope and is routed to W16 (see below) |
| AC5 | PASS | `w15_gate_lifts_after_withdraw_or_completion`, `w15_unassigning_trainee_row_still_allowed`, `w15_other_owner_rows_unaffected`, `w15_trusted_session_still_bypasses` in `j7_w15` `ok` |
| AC6 | PASS | `w15_limitation_never_linked_name_only_row_not_detected` in `j7_w15` `ok`. W15-L1 hits in `LIMITATIONS.md` (:53, :54, :55, :57, :60, :147) and `LEGAL_REVIEW_REGISTER.md` (incl. :269, :314) |
| AC7 | PASS | `w15_link_history_has_rls_and_no_client_access` (10), `w15_link_history_cascades_with_roster_row_and_account` (2), `w15_gate_functions_not_client_executable` in `j7_w15` `ok`, plus the catalog check above. Also `w15_noop_user_id_update_writes_no_history` and `w15_backfill_uses_linked_and_unlinked_audit_rows` (fix cycle 1) |
| AC8 | PASS | All five `j16_w15_*` names in `j16_w15_worker_unlink_and_decline_still_succeed` (`ok`, plan 12). `j16_three_owner_rule_never_blocks_decline_or_termination` `ok` |
| AC9 | PASS | All five `j18_w15_*` names in `j18_w15_flows` (`ok`, plan 16). `j18_existing_flows` `ok`. J18 roll-up `ok` at **plan(27)**, not the AC's plan(26): fix cycle 1 (SEC-2) added one assertion, recorded in LOG. Graded on the current plan |
| AC10 | PASS | Vitest `w15_trainee_notice_states_only_what_the_platform_enforces` and `w6_polish_training_copy_does_not_contradict_optional_training_pay` pass, plus the 6 `TrainingVersusPaidWorkNote.w15` tests. `grep -rn "Trainees cannot be assigned" frontend/src docs`: no output, exit 1. `trainingNoticeCopy.ts:36` is the D-81 text, compared against PLAN section 5. Call sites: trainee views default to D-81 (`MyTrainingsPanel:57`, `MyTrainingProgress:62,71`, `TrainingInvitationDetail:79`). Shop views pass `audience="shop"` (`OwnerTrainingProgramsPanel:112,184`, `TrainingProgramManageView:54`, `TrainingProgramEditorModal:94`, `TrainerProgramsPanel:83`) |
| AC11 | PASS | `w13_legal_register_index_matches_parts_and_all_open` passes. Verifier count: part 1 81, part 2 72, index 14 = **167** rows, all `OPEN` (the AC's 165 was raised to 167 by C-N-3, W15-L2 and W15-L3). `grep trainingVersusPaidWorkText REGISTER_PART_1_W0_W8.md` hits :100, the W6-L12 row |
| AC12 | PASS | `w15-api-smoke: 17 passed, 0 failed` prints before `w13-api-smoke: 17 passed, 0 failed`, then `run-api-smokes: PASS (14 smokes)`. `SMOKE_ORDER` ends `'w12', 'w15', 'w13'` (`run-api-smokes.mjs:18`). All 10 planned check names are in the smoke source |
| AC13 | PASS | Lint 0, build 0, Vitest 306 / 306, pytest `4 passed`, stager 19 pass |
| AC14 | PASS | The AC14 grep prints nothing, exit 1. `j16_w15_owner_unlink_during_required_training_not_refused` and `j16_w15_worker_unlinks_own_row_during_required_training` confirm the behaviour |

## Safety
- **Migrations:** no committed migration was edited (see AC1). The w15a file has never been committed, so its fix-cycle edit is not a migration edit.
- **`.env`:** no `.env*` path in the diff. `.env` and `frontend/.env` are git-ignored, with mtimes 2026-10-23 and 2026-10-21. The verifier did not read either.
- **Remote DB commands:** in the added lines under `scripts/` and `supabase/`, and in the new W15 files, the only hit for `db push`, `--linked`, `--db-url` or `project-ref` is the refusal list `FORBIDDEN_ARGUMENTS` at `w15-api-smoke.mjs:25`. The CLI ran only through the runner and from inside `.local-supabase-test`.
- **Unchanged on purpose (`git diff 3967f32` is 0 bytes, 0 untracked):** `contracts/TerminateContractModal.tsx`, `worker/contracts/DeclineContractModal.tsx`, `worker/contracts/AcceptContractModal.tsx`, `worker/contracts/WorkerContractReview.tsx`, `worker/certifications/RequestCertificationReviewModal.tsx`, and `backend/`.
- **Booking regression:** J18 roll-up, `j18_existing_flows`, `j18_w15_flows` `ok`; w2 smoke 48 / 0.
- **File sizes:** every added or changed deliverable is at or under 350 lines. Largest: `LOCAL_TEST_HARNESS.md` 334, `LEGAL_REVIEW_REGISTER.md` 316, `001_migration_replay` 273. w15a 183, `j7_w15` 225, `w15-api-smoke.mjs` 218.
- **Human gates:** `DEPLOYMENT_READINESS.md` 33 unticked, 0 ticked.
- **BLOCKING findings:** none in REVIEW.md. Spot checks of fix cycle 1: SEC-1 (w15a:64-69), SEC-2 (`j7_w15`:55), SEC-7 (w15a:107), C-SF-1 (call sites in AC10), C-N-3 (AC11).

## SEC-5: gate lifted by deleting the training shop (reproduced)
A rolled-back probe (`probe_sec5.sql`, in the verifier's scratchpad, outside the repo) used one owner with verified shops s1 and s2, a program on s1 with no attendance recorded, trainee `wt` with an accepted enrollment and a linked row `rt`, and a booking on s2. The fixtures were created by a trusted session; the two assigns and the shop delete ran as the owner:

    sec5_assign_before=23514
    sec5_owner_deletes_training_shop=succeeded
    sec5_shop_rows=0
    sec5_enrollment=accepted,shop_null=true,progress=shop_removed
    sec5_assign_after=succeeded
    sec5_booking_assigned_to_rt=true

- **Cause:** the gate requires `e.shop_id is not null` (w6h:35, kept at w15a:144), and progress `shop_removed` is outside the gate's list (w15a:146). The W6 design (D-18) deliberately keeps the enrollment after a shop is removed.
- **Effect:** a two-shop owner can put a trainee with 0 attended days on customer bookings while the enrollment still reads `accepted`, and no roster unlink is involved. Deleting a shop is a costly step for the owner, and that is the main mitigation.
- **The other SEC-5 path was read, not run:** an owner recording a `failed` assessment also leaves the gate's progress list, but needs the required attended days and a reason of at least 10 characters (w6d:175, w6g:167).
- **Why not FAIL:** the plan's scope is P1-P5, the gate rule it restates says "the shop present", and REVIEW routes SEC-5 to W16. This is a verifier judgement; a stricter reading of AC4's "every other detectable path" would fail. **The whole-branch final verification should expect to re-examine it**, because it has the same shape as F-C2: an ordinary action by the restrained owner lifts the gate.

## Remaining limits (W15-L1, LIMITATIONS.md) judged against SPEC D
**Honest: yes. Complete: no, one gap.**
- **Accurate as documented:** never-linked and re-created rows (pinned by a test), pre-W3 links, other owners' bookings, trusted SQL, super_admin (W13-L11), in-progress completion (SEC-4), the D-80 side effects, and no-contract paid work after training ends (W6-L10). No document claims the limits are enough for the free-training rule; W15-L1 asks legal review that question and stays OPEN. W15-L3 raises retention.
- **D-81 copy:** it makes no absolute promise and states its detection limits. It is literally accurate for SEC-5, because it speaks of "the training shop's requests" and "its customer bookings", and the s2 booking is neither. A worker would still reasonably read "while your required training is unfinished" as covering that case.
- **Gap:** `grep SEC-5` has 0 hits in `docs/workforce`, `loop/workforce/PLAN.md` and `STATE.md`. W15-L1 omits it. `LIMITATIONS.md:61` ("once training ends, fails or the shop is removed, paid work can be assigned") discloses the outcome, but not that the owner controls it, that attendance may be zero, or that the enrollment stays `accepted`. `LIMITATIONS.md:51` "(F-C2 closed for rows that are or were linked)" is too broad until this is added. The nearest W16 plan item is F-S2 (shop deletion cascade), which does not name it.
- **Remaining SPEC D exposure, by design:** "no unpaid labor disguised as training" still depends on an owner not using a name-only row. An owner can do that at will, and the platform cannot detect it. This is disclosed, and it is a human and legal decision (W15-L1).

## Non-blocking observations (not grounds for FAIL; for RECORD)
- **RECORD must carry SEC-5 into W16 explicitly:** a LIMITATIONS bullet, W15-L1 or a new register item, and a decision on whether the gate should also hold after the training shop is removed. W16 should treat this as more than a docs item, or record why not.
- **Items RECORD must still do:** D-79..D-82 are not in `DECISIONS.md` (grep 0, C-N-1). `LOOP.md` has no W15 smoke row and no migration count 97. `STATE.md` still shows W15 `verifying`.
- **Plan deviations recorded in LOG and accepted:**
  - the J17 roll-up table list was edited (43 -> 44);
  - P5 is tested through an RLS-bypassing session with a super_admin JWT, because API-style updates match 0 rows;
  - `j18_w15_customer_booking_insert_unchanged` pins 42501, not the plan's "forces null";
  - `backfill_roster_link_history()` is a new private function (SEC-7);
  - fix cycle 1 went beyond "1 copy line" (`shopTrainingVersusPaidWorkText` and the `audience` prop).
- **Old sentence still in the repo, outside the AC10 grep:** `increments/W15/LEGAL_FLAGS.md:17,35` quote it as "Copy before", which is correct history. The W15-L2 register row points there instead of quoting it, and the Vitest regex uses `\s+`, so the AC10 grep stays empty by construction.
- **DB error text unchanged:** the owner refusal "This worker is in required training with your shop and cannot be assigned ..." is an error message, not a promise to the worker. It misdescribes a later worker on a re-used row (D-80), which is documented.
- **Not verified by any test:** production backfill on real data or orphaned links (R2), link-versus-assign concurrency (R3), unknown production triggers on `workers` (R4). The SEC-1 orphan skip was read in code, not exercised by the verifier. The backfill NOTICE is not shown by `db reset`.
