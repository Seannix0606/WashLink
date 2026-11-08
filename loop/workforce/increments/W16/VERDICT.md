# W16 - Close SEC-5, pin locked safeguard clauses, complete K10 docs - VERDICT

**Overall: PASS** (independent verifier, 2026-11-05; uncommitted tree on `feature/workforce`, HEAD bad4f80, after fix cycle 1)

All 18 acceptance criteria and every check pass. SEC-5 is closed on the local stack: the probe that printed `sec5_assign_after=succeeded` in W15 now prints `23514`. `LIMITATIONS.md` satisfies K10 for the items the final verifier listed. What remains open is disclosed as a limit, not closed: this gate does not stop a dishonest owner (W16-L1), and every legal item stays OPEN for human review.

Graded against PLAN.md **section 7** (AC1..AC18; the brief calls it section 8, which is the rollback section), plus the changes recorded in fix cycle 1. REVIEW.md has no BLOCKING findings. LOG.md and REVIEW.md were read only to see what was claimed; every number below comes from this run.

## Check suite (re-run by the verifier; Docker 29.9.2)

**Start state.** Docker was down and was started once, as the brief allows. Two leftover volumes (`supabase_db_washlink-local-test`, `supabase_storage_washlink-local-test`) were present, so the verifier ran `npx supabase stop --workdir . --no-backup` from inside `.local-supabase-test` first: 0 stack containers and 0 stack volumes before the DB run. The unrelated `washlink-backend-1`, `washlink-frontend-1` and `washlink-redis-1` containers were not touched.

| Check | Exit | Actual output |
|---|---|---|
| `cd frontend && npm run lint` | 0 | `eslint .`, no problems |
| `cd frontend && npm run build` | 0 | `built in 484ms` |
| `cd frontend && npm test -- --reporter=verbose` | 0 | `Test Files 152 passed (152)`, `Tests 323 passed (323)`, 0 failure lines |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | `4 passed, 1 warning` (run from the repo root and from `backend/`, same result) |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | `db reset --local --workdir` applied 99 migrations, the last two being `20261104000001_w16a_...` and `20261104000002_w16b_...`. `All tests successful.` `Files=113, Tests=3423`, `Result: PASS`; 0 `not ok`, 0 `todo_start(` in the log and in `supabase/tests/database/*.sql` |
| `probe_sec5.sql` (own `begin ... rollback`; psql through `docker exec`; DB as left by the reset, every test file rolled back) | 0 | `sec5_assign_before=23514`, `sec5_owner_deletes_training_shop=succeeded`, `sec5_shop_rows=0`, `sec5_enrollment=accepted,shop_null=true,progress=shop_removed`, **`sec5_assign_after=23514`**, `sec5_booking_assigned_to_rt=false`, `ROLLBACK` |
| `probe_fc2.sql` (same way) | 0 | `probe_assign_linked_trainee=23514`, `probe_owner_unlinks_trainee=succeeded`, **`probe_assign_after_unlink=23514`**, `probe_state=accepted,<rk id>,rt=<rt id>`, `ROLLBACK`. 22 `ok`, and the 1 expected `not ok 1 - j18_customer_books_with_server_quote`: the fixture in the probe pins `schema_migrations = 96` (probe line 35), and the count is now 99 |
| `node scripts/supabase-test/run-api-smokes.mjs` (same stack) | 0 | w2 48, w3 33, w4 43, w5 39, w6 40, w7 38, w8 30, w9 34, w10 39, w11 36, w14 33, w12 22, w15 17, w16 17, w13 17 passed; each `0 failed` (486 checks); w13 last; `run-api-smokes: PASS (15 smokes)` |
| `npx supabase stop --workdir . --no-backup` (run inside `.local-supabase-test`, project_id `washlink-local-test`) | 0 | `"backup":false,"message":"Stopped supabase local development setup."`; 0 stack containers and 0 stack volumes after |

Notes on reading the output:
- The runner log has 198 `Applying migration` lines because a stack with no volumes applies them twice: 99 on `supabase start`, then 99 on `db reset`. The section after the reset line counts exactly 99.
- The probes ran between the DB run and the smokes, while the DB was still as reset. Both rolled back; schema_migrations stayed 99 and 0 probe users remained.

### Verifier-run extra local checks
- **Per-assertion run.** pg_prove reports per file, so after the smokes the verifier ran `npx supabase db reset --local --workdir .` from inside `.local-supabase-test` (99 applied) and piped all 113 test files through psql: **113 files, 3423 `ok`, 0 `not ok`**. Below, `n/0` for a named pgTAP test comes from this tally: n assertions `ok`, 0 `not ok`.
- **AC9 mutation.** The w15a body from the w16a ROLLBACK block, then `j7_w16`, in one transaction ended by the rollback in that file: `ok=45 not_ok=12`. Failures: 5, 6 `w16_probe_...`; 8, 9 `w16_owner_identity...`; 12 `w16_failed_assessment_then_assign_refused`; 13, 14 `w16_failed_assessment_preassigned...`; 18 `w16_failed_then_shop_removed...`; 23 `w16_unlink_after_shop_removal...`; 26, 27 `w16_preassigned_booking_on_deleted_shop...`; 35 `w16_failed_corrected_to_pass_lifts`. Live gate md5 afterwards `b5df3f87f6fc0557392a75eb123bf279`.
- **Both ROLLBACK blocks executed, uncommented, in a rolled-back transaction:** DROP TRIGGER, DROP FUNCTION, CREATE FUNCTION, REVOKE, NOTIFY; then `trigger_left=0`, `pin_fn_left=0`, `gate_is_w15_body=true`. After `ROLLBACK`: trigger back, gate md5 unchanged.
- **Pin at a real COMMIT, as a super_admin through the real RPC, without `set constraints`.** The LOG and `LIMITATIONS.md:163` say only the changed-core-body refusal had run at a real commit. Results (psql, not PostgREST; each publish first returned `publish_returned_v2`, then the commit failed or succeeded as shown):

      added locked clause       ERROR: 23514 ... human-run migration: vp_added_locked.
      removed locked clause     ERROR: 23514 ... human-run migration: training_pay_or_reimbursement.
      changed non-core locked   ERROR: 23514 ... human-run migration: training_pay_or_reimbursement.
      state after the three     current_version=1, vp_admins=0
      added editable clause     COMMIT, current_version=2 (this one committed; the stack was then discarded)

- **F-S1 list (PLAN R6, left to "RECORD or the verifier" by the LOG).** Catalog: `total=155 triggers=3` (`handle_new_user`, `set_shop_pricing_updated_at`, `set_booking_quote_from_shop_pricing`). A name search of the other 152 for refresh, sync, expire, internal, insert_version, enqueue, backfill, run_, batch, writer, set_config, the pin and the gate returned nothing. This is a name screen, not a line-by-line review.
- **Other owner lifts looked for.** `training_kind` has a check allowing only `required_initial` (w6b:46), and `training_programs` refuses client insert, update and delete (w6b:312-317), so neither can lift the gate. Read from code, not run. The other lifts the verifier knows of are the ones `LIMITATIONS.md` lists.

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC1 | PASS | `ls supabase/migrations/2026_11_04_w16*` = 2 files; `grep -c ROLLBACK` 2 and 1. `git diff --name-status bad4f80 -- supabase/migrations` empty; `git status` lists only the 2 untracked w16 files. 97 repo files (+2 local baseline = 99) |
| AC2 | PASS | 99 replayed, `Files=113, Tests=3423`, `Result: PASS`; `replay_w16_gate_and_core_pin_present` 1/0; `001_migration_replay` plan 29; 0 `todo_start(` in the log and the test files |
| AC3 | PASS | `w16_probe_owner_deletes_training_shop_then_assign_refused` 6/0, `j18_trainee_not_assignable_after_training_shop_deleted` 1/0. Probe: `sec5_assign_after=23514`, `sec5_booking_assigned_to_rt=false` |
| AC4 | PASS | `w16_failed_assessment_then_assign_refused` 2/0, `w16_failed_assessment_preassigned_booking_cannot_start` 2/0, `w16_failed_then_shop_removed_still_gated` 7/0 |
| AC5 | PASS | `w16_owner_identity_survives_shop_deletion` 4/0, `w16_preassigned_booking_on_deleted_shop_cannot_start` 4/0, `w16_null_shop_booking_non_trainee_row_unaffected` 3/0 |
| AC6 | PASS | `w16_gate_lifts_on_true_completion` 2/0, `w16_completed_then_shop_removed_stays_lifted` 2/0, `w16_failed_corrected_to_pass_lifts` 3/0, `w16_gate_lifts_on_withdrawal_after_failed` 2/0, `w16_gate_lifts_on_withdrawal_after_shop_removed` 3/0, `w16_gate_lifts_on_owner_cancel_of_failed_and_worker_notified` 3/0, `w15_gate_lifts_after_withdraw_or_completion` 4/0 |
| AC7 | PASS | All 9 `j16_w16_*` names `ok` with 0 `not ok` (17 assertions, plan 17). `j16_three_owner_rule_never_blocks_decline_or_termination` and `j16_w15_worker_unlink_and_decline_still_succeed` files `ok` |
| AC8 | PASS | Vitest `w16_worker_can_leave_after_failed_and_shop_removed`, `w16_owner_can_cancel_failed_not_completed_or_shop_removed`, `w16_failed_training_explains_hold_and_leave_option` pass. Call sites read: `MyTrainingsPanel.tsx:76,97-100` and `TrainingRosterPanel.tsx:70` use `workerTrainingActions` and `ownerTrainingEnrollmentActions` |
| AC9 | PASS | Mutation above: every `w16_probe_*` and failed-path name reports `not ok`; live gate md5 unchanged. Uncommented ROLLBACK body against w15a:127-147: `diff` empty, exit 0, 21 lines |
| AC10 | PASS | All `j18_w16_*` names `ok` (0 `not ok`); `j18_existing_flows` file `ok`; J18 roll-up plan 28, `ok`; `j18_owner_can_still_edit_and_delete_shop_with_openings` 5/0; `w16_limitation_shop_delete_removes_not_accepted_application_keeps_accepted_copy` 4/0; `w16_remove_shop_confirmation_states_what_is_deleted` passes; `grep "before delete on public.shops"` on the w16 files: no output, exit 1 |
| AC11 | PASS (as amended by fix cycle 1) | `w16_core_body_change_refused_for_every_core_key` 15/0, `w16_core_heading_change_refused` 3/0, `w16_unchanged_core_publish_succeeds` 2/0, `w16_editable_clause_change_still_publishes` 2/0, `w16_trusted_migration_changes_core_then_pin_follows` 4/0, `w16_owner_template_editing_unaffected` 2/0, `w16_core_pin_function_not_client_executable` 2/0, `w16_non_core_locked_clause_change_refused` 5/0, `w16_locked_clause_removal_refused` 1/0, `w16_added_locked_clause_refused` 3/0, `w16_limitation_added_editable_clause_accepted` 2/0, `j18_w16_accepted_booking_at_deleted_shop_moves_only_after_trainee_leaves` 7/0, `w8_super_admin_publishes_platform_version_existing_owner_versions_unchanged` 4/0; w8 30, w9 34, w14 33 smokes `0 failed`. Real-commit results above. **Difference from the original plan:** every `locked_safeguard` clause is pinned, not only the 15 core keys |
| AC12 | PASS | `w15_trainee_notice_states_only_what_the_platform_enforces`, `w16_trainee_notice_covers_failed_and_shop_removed`, `w16_shop_copy_does_not_suggest_asking_the_worker_to_leave` pass. `git diff bad4f80 -- .../trainingNoticeCopy.ts` is one hunk starting at line 33; `trainingNoticeText` and `ownerAttestationText` are not in it. **Difference:** the shipped texts differ from the PLAN D-85 wording by the recorded amendments (LOG "AMENDMENT to D-85", fix cycle 1 C-S1..S5) |
| AC13 | PASS | `j17_w16_authenticated_executable_functions_match_pinned_list` 1/0 (155 rows, catalog agrees), `w16_gate_function_signature_attributes_and_privileges_unchanged` 2/0, `w16_core_pin_function_not_client_executable` 2/0, J17 roll-up file `ok`, plan 37 |
| AC14 | PASS | `w16_limitations_list_final_review_outcomes`, `w16_readiness_trigger_gate_covers_bookings_and_profiles`, `w16_acceptance_k9_does_not_restate_vitest_numbers`, `w13_workforce_docs_exist_with_required_sections` pass. Hits: `LIMITATIONS.md` SEC-5 :151, F-C1 :159, F-C2 :164, F-C3 :166, F-S2 :168, F-C7 :213. `DEPLOYMENT_READINESS.md`: 37 `- [ ]`, 0 ticked. `grep -rni "pending the W16" docs`: no output, exit 1 |
| AC15 | PASS (as amended by fix cycle 1) | `w13_legal_register_index_matches_parts_and_all_open` passes. Verifier count: index 21, part 1 81, part 2 72 = **174** rows, all `OPEN`. W16-L1..L7 in the ID list (:276-282) and full rows (:338-344). Register index 344 lines. **Difference:** the AC text says 173 and L1..L6; the review added W16-L7 (REVIEW.md, LOG) |
| AC16 | PASS | `w16-api-smoke: 17 passed, 0 failed` prints before `w13-api-smoke: 17 passed, 0 failed`, then `run-api-smokes: PASS (15 smokes)`. `SMOKE_ORDER` ends with w12, w15, w16, w13 (`run-api-smokes.mjs:18`) |
| AC17 | PASS | Lint 0, build 0, Vitest 323 / 323, pytest `4 passed`, stager 19 pass; `git diff bad4f80 -- backend` 0 bytes, 0 untracked |
| AC18 | PASS | The AC grep hits only w16a:13, a comment saying `bookings_guard_training_assignment` is not replaced; none in w16b. The only `create` statements in W16: `roster_worker_in_required_training` (w16a:44), `contract_template_core_text_pin` (w16b:42) and its trigger (w16b:89). So `withdraw_from_training`, `cancel_training_enrollment`, `unlink_my_roster_entry` and `guard_worker_roster_write` are not touched |

## Safety
- **Migrations:** no committed migration was edited (AC1). w16b was edited in fix cycle 1, but it has never been committed.
- **`.env`:** no `.env*` path in the diff. `.env` and `frontend/.env` are git-ignored. The verifier did not read either.
- **Remote DB commands:** in the W16 diff under `scripts/` and `supabase/` and in the new W16 files, the only hits for `db push`, `--linked`, `--db-url` or `project-ref` are the refusal lists `FORBIDDEN_ARGUMENTS` in `run-api-smokes.mjs` (context line, unchanged) and `w16-api-smoke.mjs`. The CLI ran only through the runner and from inside `.local-supabase-test`.
- **Unchanged on purpose (`git diff bad4f80` is 0 bytes):** `contracts/TerminateContractModal.tsx`, `worker/contracts/DeclineContractModal.tsx`, `worker/contracts/AcceptContractModal.tsx`, `worker/contracts/WorkerContractReview.tsx`, `worker/certifications/RequestCertificationReviewModal.tsx`, and `backend/`.
- **`service_role` in `frontend/src`:** `grep -rn` 0 hits.
- **Booking regression:** J18 roll-up, `j18_existing_flows`, `j18_w16_flows` `ok`; w2 smoke 48 / 0.
- **Edits to existing tests, read for weakening:** `trainingLifecycle.w6.test.ts` (failed now offers leave, D-84); `j18_w6_d18` (renamed, now expects 23514, stricter); `j9_w8` (drops the core text change; the rule moved to `j9_w16`); `j17_w8` (adds the pin to the internal list, 26 -> 27); J17 roll-up (count and comment only). None loosens a check beyond the recorded decision.
- **File sizes:** every added or changed file is at or under 350 lines. Largest: `LEGAL_REVIEW_REGISTER.md` 344, `LOCAL_TEST_HARNESS.md` 342, `j7_w16` 285, `001_migration_replay` 280. `LOG.md` is 261 lines (a log, and under the limit anyway).
- **Human gates:** `DEPLOYMENT_READINESS.md` 37 unticked, 0 ticked.
- **BLOCKING findings:** none in REVIEW.md. Spot checks of fix cycle 1: N1 (w16b and the real-commit probe), C-S8 (w16b error text "human-run migration"), N4 (`j18_w16_accepted_booking_...` 7/0), C-S6 / N6 (`shopRemovalCopy.ts`), C-S2 (`leaveTrainingConfirmationText`), N3 / C-S7 (`LIMITATIONS.md:153-158,176-188`).
- **Tree:** nothing under `docs`, `frontend/src`, `scripts`, `supabase`, `backend` or `increments/W16` changed during the run (`find -newer` the log of the first check: no output). This file is the only file the verifier wrote in the repo.

## K10 judged for the final verifier list
**Satisfied, and honest.** Each item is stated with what is and is not closed:

| Item | Where | Judgement |
|---|---|---|
| False "blocks" sentence (FINAL_VERDICT K10 (a)) | `LIMITATIONS.md:48-53` | Corrected. It now scopes the block to a row that is or was linked, and lists what still lifts the gate |
| SEC-5 | :151-158, :176-206 | Closed claim matches the probes. It says "closed" means a local test covers the path, and that this is not a statement that the free-training rule is met |
| F-C1 | :159-163 | Pinned; names the limits (editable clauses can contradict a safeguard, clause order, pre-pin versions, no second reviewer). Verified: an added editable clause commits |
| F-C2 remainder | :164-165, :54 | "not closed": never-linked rows; pinned by a named test |
| F-C3 | :166-167 | Outcome stated; the old absolute sentence is gone from the current copy (AC12) |
| F-C7 | :213-214 | No interview feature or notice; D-69 exists in DECISIONS.md; the SPEC I line is real ("Interview or training scheduling.") |
| F-S2 | :168-174 | No guard, informed confirm; says the confirm does not bind a direct API call, and gives a reason for not choosing soft-deactivation (C-S9) |
| Proposed register items (K10 (c)) | Register | F-C1 is W16-L3; F-C2 and F-C3 are cross-referenced to W15-L1 and W15-L2, not duplicated |
| W6-L12 source (K10 (d)) | Part 1 :100 | Has a W15 source update |

The file does not overclaim: it opens by saying it is not a proof that nothing else is missing, it makes no legal claim, and it states the uncomfortable results plainly (a dishonest owner can record a pass or cancel at 0 days; the hold can be permanent for a later worker on a re-used row, whose refusal message is false; an accepted booking at a deleted shop has no way forward except the trainee leaving). W16-L1 asks legal review whether this fits the free-training rule; nothing in the repo answers that.

## Non-blocking observations (not grounds for FAIL; for RECORD and the final verification)
- **Items RECORD must still do:** D-83..D-89 are not in `DECISIONS.md` (grep 0), including the D-85 amendments, the D-86 soft-deactivation reason and the wider D-87 scope. `LOOP.md` has no w16 smoke row, no count of 99 migrations and no 15-smoke runner text (grep `w16` 0). `STATE.md` shows W16 `verifying`.
- **PLAN text is partly historic:** D-87, the w16b part of section 3, AC15 and W16-L3 in PLAN still describe a core-only pin and 173 items. The shipped behaviour and docs follow fix cycle 1. The DECISIONS entries should state the final rule. The names `contract_template_core_text_pin` and `..._zz_core_text_pin` are kept although the rule is wider (the w16b header says so).
- **Docs can be tightened with this run:** `LIMITATIONS.md:35-36` says only the w16a body has run from the W16 blocks. This verifier also ran both whole W16 blocks in a rolled-back transaction. `LIMITATIONS.md:163` remains true of PostgREST, but the added and removed refusals have now also been seen at a real commit through psql.
- **Not verified by any test:** production behaviour (D-10, local proof only); two-session concurrency on the pin or the gate (F-S6); the added and removed locked-clause refusals through PostgREST at a real commit; browser UI (the leave and cancel paths are Vitest with mocks plus API smokes).
- **Remaining SPEC D exposure, by design and disclosed:** the gate still depends on the owner not using a never-linked row, and an owner can lift it by a recorded pass or a cancel at 0 attended days. The whole-branch final verification should weigh these as human and legal decisions (W15-L1, W16-L1), not as closed.
- **The old `probe_fc2.sql` fixture** now has a stale `= 96` pin, so it always shows one expected `not ok 1`. Its probe lines are unaffected.
