# W16 - LOG

## BUILD (frontend + docs) - 2026-11-04

Only `frontend/src`, `docs/workforce` and W16 `LEGAL_FLAGS.md` / `LOG.md` were edited. Not committed.

Frontend:
- `trainingEnrollmentLifecycle.ts` (D-84): the worker's "Leave training" is hidden only on `completed`; owner cancel is hidden on `completed` and `shop_removed`, offered on `failed`. The service guards read the same helpers.
- D-85 copy: `trainingVersusPaidWorkText`, `shopTrainingVersusPaidWorkText`, `shopRemovedExplanation`, new `failedTrainingExplanation`. `trainingNoticeText` and `ownerAttestationText` unchanged.
- `MyTrainingProgress` shows the explanation through `describeTrainingHoldForWorker` (added to `trainingDisplay.ts`, so no logic sits in JSX).
- New `shopRemovalCopy.ts`, used by `useOwnerShopManagement` (D-86). `StandardContractEditor` comment only.
- Five J16 files: `git diff bad4f80` empty for each.

Tests: new `trainingLifecycle.w16.test.ts`, `MyTrainingProgress.w16.test.tsx`, `shopRemovalCopy.w16.test.ts`, `workforceDocs.w16.test.ts`; edited `trainingLifecycle.w6.test.ts`, `trainingNoticeCopy.w15.test.ts`, `workforceDocs.w13.test.ts` (173 rows, W16-L1..L6, part rows not `W16-`, rollback order line now starts W16, W15).

Docs: LIMITATIONS, DEPLOYMENT_READINESS, ACCEPTANCE_TESTS, LEGAL_REVIEW_REGISTER (173; index 20), REGISTER_PART_1 (W6-L10, W6-L12 notes), TRAINING, ARCHITECTURE, CONTRACT_TEMPLATES, MARKETPLACE_AND_APPLICATIONS, ROLLBACK_GUIDE, ROLE_AND_PROFILE_SECURITY (row 58), LOCAL_TEST_HARNESS (99 migrations, 15 smokes). Largest edited: LEGAL_REVIEW_REGISTER 342 lines, LOCAL_TEST_HARNESS 342. pgTAP and smoke counts are written as "pending the W16 test run"; TEST fills them in.

Runs (frontend/):
- `npm run lint`: exit 0, no output after `eslint .`.
- `npm run build`: exit 0, `built in 466ms`.
- `npm test`: `Test Files  151 passed (151)`, `Tests  317 passed (317)` (147 / 306 before W16).

For later steps:
- (Superseded by "AMENDMENT to D-85" below.) Copy gap kept as PLAN wrote it (D-85): after a fail and a shop removal progress stays `failed`, so the worker reads "until the shop records a correction or cancels it", although no shop remains. Only leaving ends it. Recorded in LIMITATIONS, TRAINING and W16-L2; not changed, because the text is exact in the PLAN.
- `ACCEPTANCE_TESTS.md` names W16 pgTAP files without the `.test.sql` suffix, so `w13_acceptance_index_lists_only_existing_test_files` does not depend on the parallel DB step. TEST confirms they exist, including `j17_w16_authenticated_executable_function_list`, which was not on disk when the docs were written.
- `ROLLBACK_GUIDE.md` W16 row cites w16b:84 and w16a:68, read while the DB step was running; re-check after it ends.

## AMENDMENT to D-85 (coordinator request) - 2026-11-04

Why: after a fail and a shop removal the D-85 `failedTrainingExplanation` told the worker "until the shop records a correction or cancels it", although nobody can do either in that state. RECORD should add this to D-85 in DECISIONS.md; the PLAN D-85 text was not edited.

Change: when progress is `failed` and `enrollment.shopId` is null, `describeTrainingHoldForWorker(progressStatus, enrollmentShopId)` returns the new `failedAfterShopRemovedExplanation` (`trainingNoticeCopy.ts`): "Your assessment is recorded as not passed and the shop is no longer on WashLink. This training stays open until you leave it. While it stays open, WashLink refuses this owner's requests to assign you to their customer bookings through a linked roster entry. You can leave at any time." `failedTrainingExplanation`, `trainingNoticeText` and `ownerAttestationText` are unchanged.

"Only leaving ends it", checked by reading the migrations for this state (`shop_id` null on the enrollment and the program; progress `failed`, w6d `training_progress_status`):
- Owner cancel: 42501. `lock_training_enrollment_for_actor` (w6f) needs `is_current_training_program_owner` (w6b), which joins the shop.
- Owner correction: 42501. `is_authorised_training_recorder` (w6b) uses the same owner check.
- Trainer correction: 42501. The same function requires `p.shop_id is not null`.
- Worker leave: allowed. `withdraw_from_training` refuses only `completed`; run-tested by `j16_w16_worker_withdraws_after_failed_and_shop_removed`.
- Outside client actions: a trusted SQL repair, or the worker deleting their account, also removes or ends the enrollment.
- (Superseded for the owner by "BUILD (DB) + TEST" deviation 4; a designated trainer's correction stays code-reading only.) Not run-tested: `w16_owner_cannot_cancel_after_shop_removed` uses a not-failed enrollment, and no pgTAP test seen covers an owner cancel or a correction in this exact state. The refusals above come from code reading only.

Docs: gap removed from LIMITATIONS; TRAINING, W16-L2 (register and LEGAL_FLAGS) and ACCEPTANCE_TESTS reworded. W16-L2 keeps its other content (leaving under pressure, the display change, the shipped copy), so the register stays at 173.

Test: new `w16_failed_then_shop_removed_says_only_leaving_ends_it` in `MyTrainingProgress.w16.test.tsx`.

Runs (frontend/): `npm run lint` exit 0; `npm run build` exit 0, `built in 579ms`; `npm test` `Test Files  151 passed (151)`, `Tests  318 passed (318)`.

## BUILD (DB) + TEST - 2026-11-04 (DB builder; branch feature/workforce, HEAD bad4f80; not committed)

Scope: PLAN sections 3, 5 (pgTAP + smoke) and 6 (DB, scripts). Nothing under `frontend/` or `docs/` touched. Local Docker stack only (`--local --workdir .local-supabase-test`); no `--linked`, `--db-url`, `db push` or `link`; `.env` not read. Stack stopped at the end (0 supabase containers).

Files created:
- `supabase/migrations/2026_11_04_w16a_training_gate_holds_until_enrollment_ends.sql` (93 lines, staged 20261104000001)
- `supabase/migrations/2026_11_04_w16b_contract_template_core_text_pin.sql` (88 lines, staged 20261104000002)
- `supabase/tests/database/j7_w16_training_gate_holds_until_enrollment_ends.test.sql`, `j16_w16_gate_hold_blocks_no_worker_action.test.sql`, `j18_w16_flows.test.sql`, `j9_w16_core_safeguard_text_pinned.test.sql`, `j17_w16_authenticated_executable_function_list.test.sql`
- `scripts/supabase-test/w16-api-smoke.mjs` (220 lines)

Files edited: `001_migration_replay`, the J18 roll-up (`j18_existing_booking_pricing_verification_and_rating_workflows_still_work`), `j18_w6_d18_training_evidence_retention`, `j9_w8_contract_template_rules`, `j17_w8_contract_template_authorization` (deviation 2), the J17 roll-up (comment and migration count only, no new table, so no roster list change), `scripts/supabase-test/run-api-smokes.mjs`.

pgTAP plan counts (all equal to the assertions run):

| File | plan |
|---|---|
| `j7_w16_training_gate_holds_until_enrollment_ends` | 55 (20 distinct test names) |
| `j16_w16_gate_hold_blocks_no_worker_action` | 17 (9 names) |
| `j18_w16_flows` | 18 (5 names) |
| `j9_w16_core_safeguard_text_pinned` | 32 (8 names) |
| `j17_w16_authenticated_executable_function_list` | 1 (155 signatures) |
| `001_migration_replay` | 29 (was 28) |
| J18 roll-up | 28 (was 27) |
| `j18_w6_d18_training_evidence_retention` | 30 (unchanged) |
| `j9_w8_contract_template_rules` | 65 (unchanged) |
| `j17_w8_contract_template_authorization` | 41 (unchanged) |

Totals: `Files=113, Tests=3405` (W15 end: `Files=108, Tests=3280`; +5 files, +125 assertions). 99 migrations applied. 0 `todo_start(` in the runner log and in `supabase/tests/database/*.sql`.

Renamed tests (D-76): `d18_booking_gate_lifts_after_shop_removal` -> `d18_booking_gate_holds_after_shop_removal` (2 assertions, the second now expects 23514; later assertions unchanged and passing, including the worker's withdraw after removal).

Actual output (final sequence, in this order, on one reset):

`node --test scripts/supabase-test/stage-local-workdir.test.mjs`:
```
tests 19 / pass 19 / fail 0
```
`node scripts/supabase-test/run-db-tests.mjs` (exit 0):
```
All tests successful.
Files=113, Tests=3405, 26 wallclock secs ( 0.45 usr  0.22 sys +  0.70 cusr  0.86 csys =  2.23 CPU)
Result: PASS
```
`probe_sec5.sql` (AC3; own transaction, ends in rollback; run on the DB the runner had just reset, with every test file rolled back):
```
sec5_assign_before=23514
sec5_owner_deletes_training_shop=succeeded
sec5_shop_rows=0
sec5_enrollment=accepted,shop_null=true,progress=shop_removed
sec5_assign_after=23514
sec5_booking_assigned_to_rt=false
```
AC9 mutation (w15a body taken from the w16a ROLLBACK block, then `j7_w16`, all in one transaction ended by the file's rollback):
```
uncommented ROLLBACK body vs w15a:127-147: empty diff
ok=43 not_ok=12
not ok 5, 6 - w16_probe_owner_deletes_training_shop_then_assign_refused
not ok 8, 9 - w16_owner_identity_survives_shop_deletion
not ok 12 - w16_failed_assessment_then_assign_refused
not ok 13, 14 - w16_failed_assessment_preassigned_booking_cannot_start
not ok 17 - w16_failed_then_shop_removed_still_gated
not ok 21 - w16_unlink_after_shop_removal_still_gated
not ok 24, 25 - w16_preassigned_booking_on_deleted_shop_cannot_start
not ok 33 - w16_failed_corrected_to_pass_lifts
gate md5(prosrc) before = after = b5df3f87f6fc0557392a75eb123bf279
```
Extra mutation, not in the plan (the pin function reduced to `return null`, then `j9_w16`, same rolled-back shape): `ok=10 not_ok=22`, including all 15 `w16_core_body_change_refused_for_every_core_key`. Later names also fail because the version numbers shift once the refused publishes succeed.

`node scripts/supabase-test/run-api-smokes.mjs` (exit 0):
```
w2-api-smoke: 48 passed, 0 failed
w3-api-smoke: 33 passed, 0 failed
w4-api-smoke: 43 passed, 0 failed
w5-api-smoke: 39 passed, 0 failed
w6-api-smoke: 40 passed, 0 failed
w7-api-smoke: 38 passed, 0 failed
w8-api-smoke: 30 passed, 0 failed
w9-api-smoke: 34 passed, 0 failed
w10-api-smoke: 39 passed, 0 failed
w11-api-smoke: 36 passed, 0 failed
w14-api-smoke: 33 passed, 0 failed
w12-api-smoke: 22 passed, 0 failed
w15-api-smoke: 17 passed, 0 failed
w16-api-smoke: 17 passed, 0 failed
w13-api-smoke: 17 passed, 0 failed
run-api-smokes: PASS (15 smokes)
```
The w16 smoke's 17 = the 10 named checks + 5 user deletions + 2 program cleanups.

AC greps: `git diff --name-status bad4f80 -- supabase/migrations` empty; 97 files in the repo; `grep -c ROLLBACK` 2 and 1; `before delete on public.shops` no hits; AC18 grep hits only line 13 of w16a, a comment saying `bookings_guard_training_assignment` is NOT replaced, and no `create or replace` of any listed function.

Deviations from the plan:
1. **w16b function comment starts with `W8`.** First run: the w8a preflight, re-run by `w8p_preflight_passes_on_w8_objects`, and `w8p_every_w8_function_has_w8_comment` refuse any `contract_template` function whose comment does not start with W8. The plan's function name is kept; the comment reads "W8 contract templates, added by W16 (D-87): ...". Worth keeping at RECORD: a future `contract_template_*` function has the same requirement.
2. **`j17_w8_contract_template_authorization` also edited** (not in the plan's edited list; PLAN R5 asked TEST to confirm no pin breaks, and this one did). `j17_w8_internal_functions_not_client_executable` pins every `contract_template` function by name: `contract_template_core_text_pin()` added to its internal list, 26 -> 27 in the count, plan unchanged at 41.
3. **`j9_w16` trusted-migration fixture** uses `contract_template_insert_version` directly in a trusted session, the writer the w8e seed uses. No migration of this kind has been run for real.
4. **2 assertions added beyond the plan's list**, under the existing `w16_failed_then_shop_removed_still_gated`: owner `cancel_training_enrollment` 42501 and owner `correct_training_assessment` 42501 after a fail plus shop removal. They run-test PLAN section 4 row "accepted: failed, shop deleted: worker leaves only" and close the "Not run-tested" note in the D-85 amendment above for the owner. A designated trainer's correction in that state is still not run-tested. Docs should drop that note for the owner cases.
5. **F-S1 list has 155 rows, not 152.** The query is `has_function_privilege('authenticated', oid, 'execute')` on schema public. 152 of them are non-trigger functions, matching the FINAL_REVIEW figure; the other 3 are the pre-workforce trigger functions `handle_new_user`, `set_booking_quote_from_shop_pricing`, `set_shop_pricing_updated_at`. That FINAL_REVIEW left those 3 out is inferred from the match; its query was not seen. The list was generated from the catalog and read only in part, so RECORD or the verifier should still do the R6 review against FINAL_REVIEW.

New error message for the frontend (super_admin publish; SQLSTATE 23514; PostgREST returns it at commit, confirmed by `w16_core_text_publish_refused_23514`):
`WashLink safeguard text in the standard template can change only through a reviewed migration: <keys>.` (`<keys>` comma-separated by section, then key)

No other new messages. The w6h gate messages are unchanged but now appear in more states, and their wording can read oddly there (PLAN section 1 keeps them out of scope):
- Owner, after the training shop was deleted: "This worker is in required training with your shop and cannot be assigned to customer bookings until the training ends."
- Worker, on a booking at a deleted shop: "You are in required training with this shop and cannot start customer bookings until the training ends."

Pinned behaviour worth a reader's attention: `j16_w16_worker_terminates_contract_while_gate_held` activates a contract while the gate holds after a shop removal (R2, W16-L1).

Could not verify here: production behaviour (D-10, local proof only); two-session concurrency on the pin (not tested); Vitest, lint, build and pytest (AC17, AC8, AC12, AC14, AC15) were not run by this agent. AC11 w8, w9, w14 smokes: 0 failed above.

## docs counts - 2026-11-04

After "BUILD (DB) + TEST". Only `frontend/src`, `docs/workforce` and this LOG were edited.

Frontend: the w16b refusal is mapped in `supabaseErrorMessages.ts` by a pattern anchored on its prefix, with only clause-key characters allowed after it (`[a-z0-9_, ]{3,600}`), the same form as the W8 key-list messages. The publish flow shows the database text with its keys; any other ending gets the generic 23514 text. New `StandardContract.w16.test.tsx`: `w16_core_text_refusal_is_shown_by_prefix_with_its_keys`, `w16_core_text_refusal_reaches_the_publish_flow` (real repository over a mocked RPC error, through to the toast; the typed draft is kept).

Docs filled from the DB section: 99 migrations, `Files=113, Tests=3405`, `Result: PASS`; plans j7_w16 55, j16_w16 17, j18_w16 18, j9_w16 32, j17_w16 1 (155 signatures), 001_migration_replay 29, J18 roll-up 28; unchanged j18_w6_d18 30, j9_w8 65, j17_w8 41; w16 smoke 17 checks (10 named, 5 user deletions, 2 program cleanups); `run-api-smokes: PASS (15 smokes)`; F-S1 155 rows (152 non-trigger functions, 3 pre-workforce trigger functions). ACCEPTANCE_TESTS now uses the real `.test.sql` names, with line numbers read from the files.

Line numbers re-read: every J17 roll-up assertion moved by +1 (J17 plan line 13); `j18_trainee_not_assignable_after_training_shop_deleted` 140; `j18_booking_tables_gain_no_workforce_columns` 146 (was 131); K3 replay lines 253 and 259; ROLLBACK_GUIDE w16b:85 (was 84), w16a:68 (unchanged). The W15 tests section keeps its W15-era line numbers (for example `replay_...` 88 and 252, now 89 and 253).

Other corrections:
- Owner cancel and owner correction after a fail plus shop removal are run-tested (42501); a designated trainer's correction is stated as read from code only (LIMITATIONS, TRAINING, ACCEPTANCE_TESTS).
- DB deviations recorded: w16b function comment prefix `W8` and `j17_w8` list 26 -> 27 (CONTRACT_TEMPLATES, ACCEPTANCE_TESTS, LOCAL_TEST_HARNESS); the j9_w16 trusted-migration fixture (ACCEPTANCE_TESTS).
- LIMITATIONS and TRAINING note that the w6h messages ("your shop" / "this shop") can read oddly after a shop is deleted.
- Not requested, but needed for accuracy: "no ROLLBACK block has been executed" is corrected in ROLLBACK_GUIDE, LIMITATIONS, DEPLOYMENT_READINESS and K3, because AC9 applied the function body the w16a block restores, in a rolled-back transaction.

Checks:
- `grep -rni "pending the W16" docs`: no output.
- Largest docs files: 350 lines (three files not edited in W16); LEGAL_REVIEW_REGISTER and LOCAL_TEST_HARNESS 342.
- `npm run lint`: exit 0. `npm run build`: exit 0, `built in 537ms`. `npm test`: `Test Files  152 passed (152)`, `Tests  320 passed (320)`.

## FIX CYCLE 1 (frontend + docs) - 2026-11-04

From W16 `REVIEW.md`. Only `frontend/src`, `docs/workforce`, W16 `LEGAL_FLAGS.md` and this LOG were edited. Not committed. The five J16 files, `trainingNoticeText` and `ownerAttestationText` are unchanged. pgTAP counts and new test names are left for the DB report.

Copy (RECORD: D-85 and D-86 amended again; texts as shipped are in W16-L2 and LEGAL_FLAGS):
- C-S1: the three hold explanations end with `leaveTrainingLocationText`, naming "Leave training" and where it is. Chosen over a second leave action in the dialog, so there is one code path.
- C-S2: `leaveTrainingConfirmationText` adds the three facts. It was inline in `MyTrainingsPanel.tsx`; it is now in `trainingNoticeCopy.ts`.
- C-S3: `shopRemovedExplanation` says the training stays open until you leave it. The worker note keeps one text for every state and adds "once the shop is removed, only leaving ends it" instead of a state-specific note. "at their other shops" was dropped, because a pre-assigned booking at the deleted shop is refused too.
- C-S4: "records a passing correction". C-S5: shop note uses owner scope. C-S6 / N6: confirm adds the open-training sentence.
- C-S8: the error map now matches "human-run migration"; checked against w16b:75, which already raises that text. The old wording now gets the generic 23514 text.
- N1 nit: "Always free for you" and "It is always free for the worker" are now "WashLink rule: it is free for ..."; no test pinned them. Two code comments (`TrainingProgram.ts:10`, `TrainingProgramPayAndTermsSection.tsx:18`) keep "always free"; no user sees them.

Docs: C-S1, C-S7, C-S8, C-S9, N2..N5, N7, pin widening and nits N2..N6 in LIMITATIONS, DEPLOYMENT_READINESS, ROLE_AND_PROFILE_SECURITY, CONTRACT_TEMPLATES, ARCHITECTURE, MARKETPLACE_AND_APPLICATIONS, TRAINING, ACCEPTANCE_TESTS. Register: W16-L7 added, W16-L1, L2, L3 rewritten, total 174, index 21 (344 lines); LEGAL_FLAGS header and W16-L7 updated. ROLLBACK_GUIDE w16b:95 (moved by the DB step; re-check after it ends).
- Found while writing: the owner account route keeps the enrollment `accepted` (`j18_w16_owner_account_delete_cascades_with_held_enrollment`), so "no lift leaves a record still reading in training" was false; LIMITATIONS is reworded to what holds.
- Left as is: "reviewed migration" at DEPLOYMENT_READINESS:62, :74 and NOTIFICATIONS_AND_SCHEDULING:141 are other subjects (W13 policy drops, J17 repairs, notification channels), not the safeguard route.
- Outside this step's files, for the DB step: w16b header and `j9_w16`:45 still call this "the D-28 route". `ACCEPTANCE_TESTS.md` and `LOCAL_TEST_HARNESS.md` keep the pre-fix-cycle pgTAP names and counts until the DB report.

## FIX CYCLE 1 (DB) - 2026-11-04 (DB builder; HEAD bad4f80; not committed)

Source: `REVIEW.md` N1, C-S8, N4 and the trainer-correction extra. W16 is uncommitted, so w16b was edited in place; w16a was not changed. Still exactly 2 W16 migrations (99 staged). Nothing under `frontend/` or `docs/` touched. Local stack only; `.env` not read; stack stopped (0 supabase containers). This section supersedes the error text, totals and the trainer note in "BUILD (DB) + TEST" above.

**N1, pin widened (w16b).** For a non-trusted session, the `locked_safeguard` clauses of a new platform version must equal those of the previous platform version: no key added or removed, and the same section, heading, body and `requires_owner_input`. A kind change counts as an add or a remove. This covers the 15 core keys and `training_pay_or_reimbursement`. Added or changed editable clauses stay accepted (documented limit, W16-L3). The preflight now checks `contract_template_clauses` instead of `contract_template_core_safeguards()`, which the pin no longer calls.

Decisions made here, for RECORD:
- `requires_owner_input` and `section_number` are compared as well as the text. The coordinator asked for "change ANY locked clause", so both count as a change.
- Clause order is not compared: an added editable clause moves positions. An administrator can therefore still reorder locked clauses within a section. New limit for W16-L3.
- The names `contract_template_core_text_pin` and `contract_template_versions_zz_core_text_pin` are kept from the plan so docs and tests stay valid, although the rule is now wider than "core". The header says so.

**C-S8, final error text (SQLSTATE 23514, at commit):**
`WashLink safeguard text in the standard template can change only through a human-run migration: <keys>.`
`<keys>` is comma-space separated, by section then key, and can now name any locked key, including one that was added or removed. Smoke regex tightened to `human-run migration: customer_data_minimum.`; the check count is unchanged.

Renamed tests (D-76): `w16_limitation_non_core_locked_clause_not_pinned` -> `w16_non_core_locked_clause_change_refused`.

New test names:
- `j9_w16`: `w16_locked_clause_removal_refused`, `w16_added_locked_clause_refused` (the reviewer's scenario: every clause unchanged plus an added contradicting locked clause; also editable -> locked), `w16_limitation_added_editable_clause_accepted` (a contradicting editable clause is accepted; pins the limit).
- `j18_w16`: `j18_w16_accepted_booking_at_deleted_shop_moves_only_after_trainee_leaves` (N4: delete succeeded; owner sees 0 rows; customer cancel 42501; worker start 23514; withdraw `withdrawn`; start succeeded; status `in_progress`, shop null).
- `j7_w16`, under the existing `w16_failed_then_shop_removed_still_gated`: a designated trainer's correction after fail plus shop removal is 42501. A control before the removal returns 23514 on a too-short reason, which shows the designation was live, so the 42501 comes from the removal.

Plan counts changed: `j7_w16` 55 -> 57; `j18_w16` 18 -> 25; `j9_w16` 32 -> 41. All others unchanged.

Actual output (final sequence):
```
stager: tests 19 / pass 19 / fail 0
run-db-tests.mjs exit 0: All tests successful.
Files=113, Tests=3423, 27 wallclock secs ( 0.48 usr  0.23 sys +  0.69 cusr  0.92 csys =  2.32 CPU)
Result: PASS
todo_start( in log 0, in test files 0; 99 migrations applied
sec5_assign_before=23514
sec5_owner_deletes_training_shop=succeeded
sec5_shop_rows=0
sec5_enrollment=accepted,shop_null=true,progress=shop_removed
sec5_assign_after=23514
sec5_booking_assigned_to_rt=false
AC9 (j7_w16 with the w15a body, rolled back): ok=45 not_ok=12; the same 12 assertions as before, now numbered 5, 6, 8, 9, 12, 13, 14, 18, 23, 26, 27, 35
uncommented ROLLBACK body vs w15a:127-147: empty diff
gate md5 before = after = b5df3f87f6fc0557392a75eb123bf279
N1 mutation (the earlier core-only pin restored, then j9_w16, rolled back): ok=28 not_ok=9
  not ok 24-27 w16_non_core_locked_clause_change_refused; 28 w16_locked_clause_removal_refused; 29-31 w16_added_locked_clause_refused;
  32 w16_limitation_added_editable_clause_accepted (a version-number knock-on, because the refused publishes succeed)
pin md5 before = after = 0c07fb45424fc5ebd07d3529898c4b37
run-api-smokes.mjs exit 0: w2 48, w3 33, w4 43, w5 39, w6 40, w7 38, w8 30, w9 34, w10 39, w11 36, w14 33, w12 22, w15 17, w16 17, w13 17, all 0 failed
run-api-smokes: PASS (15 smokes)
```

Docs to follow (frontend/docs agent): W16-L3 no longer holds "non-core locked clause unpinned"; it now reads editable clauses, clause order and pre-pin versions. The "trainer correction not run-tested" note can go. AC11 and the Renamed tests list need the new names.

Could not verify: the N1 refusals for added and removed clauses were run with the constraint forced immediate in pgTAP; through PostgREST at real commit only the changed-core-body refusal is exercised (same trigger). Production: D-10, local proof only.

FIX CYCLE 1 (frontend + docs), after reading "FIX CYCLE 1 (DB)": W16-L3 and LIMITATIONS gain the clause-order limit; the "trainer correction read from code only" note is replaced by the run-tested result in LIMITATIONS, TRAINING and ACCEPTANCE_TESTS. (Counts and test names: see "completed" below.)

FIX CYCLE 1 (frontend + docs) runs (frontend/), final: `npm run lint` exit 0; `npm run build` exit 0, `built in 481ms`; `npm test` `Test Files  152 passed (152)`, `Tests  323 passed (323)`.

## FIX CYCLE 1 (frontend + docs) completed - 2026-11-05

Resumed after a rate limit; `git status` and the docs were checked first, and finished items were not redone. Filled from "FIX CYCLE 1 (DB)":
- `Files=113, Tests=3423`, `Result: PASS`, 99 migrations; plans j7_w16 57, j18_w16 25, j9_w16 41; w16 smoke 17; `run-api-smokes: PASS (15 smokes)`. Files: ACCEPTANCE_TESTS, ARCHITECTURE, LOCAL_TEST_HARNESS.
- ACCEPTANCE_TESTS: W16 names and line numbers re-read from the files; Renamed tests gains `w16_limitation_non_core_locked_clause_not_pinned` -> `w16_non_core_locked_clause_change_refused`, and a line lists the 4 new names. PLAN.md AC11 names the same 5 (the J18 name is listed there as asked, though it is not in `j9_w16`).
- LIMITATIONS, CONTRACT_TEMPLATES, ACCEPTANCE_TESTS: added and removed locked clause refusals ran in pgTAP with the constraint forced immediate; through PostgREST at a real commit only the changed-core-body refusal is exercised.
- Pin scope stated as section, heading, body and `requires_owner_input`; W16-L3 covers editable clauses, clause order within a section and pre-pin versions.
- Error map: prefix pattern; the test now also passes non-core and added keys. Clause keys match w8c `ctc_key_check` (`^[a-z][a-z0-9_]{2,59}$`), so the pattern's character set covers them. A key list over 600 characters falls back to the generic 23514 text.

Checks: `grep -rni "pending the W16" docs` no output. Every docs file <= 350 lines (LEGAL_REVIEW_REGISTER 344). J16 files and `trainingNoticeText` / `ownerAttestationText` unchanged. No ticked gate. Nothing staged.
Runs (frontend/): `npm run lint` exit 0; `npm run build` exit 0, `built in 503ms`; `npm test` `Test Files  152 passed (152)`, `Tests  323 passed (323)`. pgTAP and smokes were not re-run by this step; the numbers are copied from the DB section.

## VERIFY, RECORD - 2026-11-05

- VERIFY: fresh verifier, clean local run: lint 0, build 0, Vitest 152 / 323, pytest 4, stager 19/19, `Files=113, Tests=3423`,
  `Result: PASS` (99 migrations), run-api-smokes PASS (15 smokes, 0 failed), `sec5_assign_after=23514`, `probe_assign_after_unlink=23514`;
  stack stopped. AC1-AC18 PASS, AC11 and AC15 as amended by fix cycle 1 (`VERDICT.md`). Both W16 ROLLBACK blocks ran in a rolled-back
  transaction; the pin was also exercised at a real COMMIT through psql (not PostgREST).
- RECORD: D-83..D-89 ADOPTED-DEFAULT (with the D-85 amendments and the wider pin rule); LOOP.md W16 smoke row and counts; STATE.md W16
  passed; next: full-diff review and final verification. PLAN.md D-87 / AC15 text predates fix cycle 1; the DECISIONS row is current.
