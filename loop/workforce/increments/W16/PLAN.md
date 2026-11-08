# W16 - Close SEC-5 (gate lifted while the enrollment stays accepted), pin core clause text, complete K10 docs - PLAN

**No split.** 2 migrations, 5 new pgTAP files + 4 edited, 1 new smoke, a small frontend change, docs. Spec: D (no unpaid labor disguised as training;
distinguish training from productive work), E, I, J7, J16, J18, K10. Sources: `increments/W15/VERDICT.md` SEC-5, `FINAL_VERDICT.md` W16, `FINAL_REVIEW.md`.
Depends on W0-W15: every row `passed` in STATE.md (HEAD bad4f80). **The only OPEN decision touched is D-10 (standing, not blocking).** New decisions D-83..D-89. Not BLOCKED.

## 0. Findings from reading the code
- **Gate today** (w15a:127-147): requires `e.shop_id is not null` and progress in scheduled / in_progress / awaiting_assessment. `training_progress_status` (w6d:171-180) checks
  passed -> `completed`, failed -> `failed`, then no shop -> `shop_removed`. `status = 'accepted'` can yield only those six values, so "not completed" is the complete hold condition.
- **Owner identity after shop deletion is safe:** `e.owner_id` goes null only if the owner's profile is deleted (w6c:43); `shops.owner_id` and `workers.owner_id` are frozen (W2).
  The gate joins `e.owner_id = w.owner_id`, so it needs no shop on the enrollment.
- **New gap found, same shape:** `bookings.shop_id` also goes null on shop delete. The gate's `join shops s on s.id = p_shop_id` then finds no row, so the assigned trainee can start a
  booking pre-assigned at the deleted shop (w2c:117-119 allows it; w6h calls the gate with null). Closed here (D-83 P3).
- **Release paths at the database:** `withdraw_from_training` (w6f:188) allows the worker when accepted and not completed, so also `failed` and `shop_removed`.
  `cancel_training_enrollment` (w6f:211) allows the owner when not completed, so also `failed`; after shop removal the owner gets 42501, because `is_current_training_program_owner` joins the shop (w6b:252).
- **UI defect that makes the release path unusable:** `trainingEnrollmentLifecycle.ts:16,29,41` treats `failed` as finished, so a failed worker has no "Leave training" button and the owner
  has no cancel button, although the DB and `TRAINING.md:88-89` allow both. It also offers the owner cancel on `shop_removed` (DB 42501). `trainingLifecycle.w6.test.ts:36` pins this. Holding the gate without fixing it would strand a failed worker.
- **Tests pinning old behaviour:** `j18_w6_d18_training_evidence_retention:83-85` `d18_booking_gate_lifts_after_shop_removal`; `j9_w8_contract_template_rules:176-179,203-206` publishes a changed
  `customer_data_minimum` body. No test pins an assign after a fail.
- **F-S2:** owner shop delete with live openings / applications is pinned as a flow by `j18_owner_can_still_edit_and_delete_shop_with_openings`, `j17_shop_deletion_cascades_openings_and_keeps_audit`,
  `j17_shop_and_owner_deletion_cascade_applications`, `j5_cascade_deletions_audited_and_notify_surviving_party`. Accepted applications are already copied for the worker (w9i, no cover note). The confirm text says only "Customers will no longer be able to book this shop."
- **F-C1:** `StandardContractEditor.tsx:30` keeps safeguards read-only and says "the database also copies them unchanged", which is false. `buildStandardPublishInput` sends locked clauses exactly as read, and the w8, w9
  and w14 smokes send core text unchanged, so a pin breaks no real caller. D-28 already routes legal review through a human-run migration.

## 1. Scope / out of scope
IN: gate hold rule and null-shop fix (w16a); core text pin (w16b); UI release paths; worker and shop copy; shop-removal confirm copy; pgTAP, Vitest, smoke; F-S1 list pin; K10 docs.
OUT: refusing shop deletion (D-86); time-limited release (D-84); contract activation changes (`training_enrollment_is_live` unchanged); replacing `bookings_guard_training_assignment` or its messages;
the `w6_v1` notice and owner attestation (versioned acknowledgements, unchanged); code for F-S3, F-S5, F-S6, F-C5, F-C6 (docs only); STATE "Final verification" (orchestrator, after the re-run).

## 2. Decisions (RECORD adds them as ADOPTED-DEFAULT (loop, date))
**D-83 Gate hold rule (SEC-5).** The gate holds while the enrollment is `accepted`, `required_initial`, and progress is not `completed`. It no longer needs the training shop to exist. Why: both lifts have the F-C2 shape (an ordinary action by the
restrained owner lifts the gate while the record still reads `accepted`). A failed assessment does not end the arrangement; it stays correctable (`correct_training_assessment`), which is the "you failed, keep working on customers until you pass" case SPEC D forbids.
- P1 shop deleted, P2 failed recorded: refused 23514 until the enrollment ends or truly completes.
- P3 null `p_shop_id` (booking at the deleted shop): the shop check is skipped and the roster row's owner decides. A non-trainee row is unaffected.

**D-84 Release paths, no time limit.** Is a failed worker with nothing left to do still a "trainee"? Not in substance, so the hold must not be a trap. It is not, because:
it restrains only that one owner's roster rows (every other shop, application and contract stays open); the worker can end it alone at any time with no reason (`withdraw_from_training`; W16 makes the button reachable); the owner can end a failed enrollment with a recorded
reason and a notice to the worker (`cancel_training_enrollment`), so an owner never has to ask the worker to leave; and no worker action gains a refusal. The only worker effect stays the existing w6h refusal to start a gated booking.

| Rejected | Why |
|---|---|
| Time limit | The owner waits it out with the record still `accepted`; adds a clock and a job for nothing the two paths do not already give |
| Lift `failed` only, hold `shop_removed` | Leaves the fail path open; correction keeps it live |
| Auto-cancel on fail or shop delete | Writes an end nobody recorded; lifts the gate anyway |
| An active contract releases the gate | A further owner-influenced lift and more code; the worker's leave action covers it (W16-L1) |
| Refuse shop delete during live training | Breaks D-18 and J18 flows; does not touch the fail path |
| Document only | Same shape as F-C2; the W15 verifier expects it re-examined |

Honest residual (W16-L1): this gate does not stop a dishonest owner. Recording 3 attended days and a pass lifts it (W6-L13), and cancelling with a reason lifts it, including at 0 attended days. Both leave an append-only or audited record, and the cancel notifies the worker.
The rule's gain is that no lift leaves a record still reading "in training".

**D-85 Copy** (versioned notices unchanged). `trainingVersusPaidWorkText` becomes exactly:
"Training is not productive work for customers. While your required training is unfinished, WashLink refuses requests by the training shop's owner to assign you to that owner's customer bookings through a roster entry that is or was linked to your account. This continues after a not-passed assessment or if the shop is removed, until the training is completed, is cancelled or you leave it. WashLink cannot detect a roster entry that was never linked to your account, or work arranged outside WashLink. Terms for any later customer work are agreed separately and are not part of this training."
`shopTrainingVersusPaidWorkText`: insert before "Terms for any later": "This continues after a not-passed assessment or a shop removal, until the training is completed, is cancelled or the trainee leaves."
New `failedTrainingExplanation` (`trainingDisplay.ts`; shown by `MyTrainingProgress` when progress is `failed`): "Your assessment is recorded as not passed. This training stays open until the shop records a correction or cancels it, or you leave it. While it stays open, WashLink refuses this owner's requests to assign you to their customer bookings through a linked roster entry. You can leave at any time."
`shopRemovedExplanation`: append "While this training stays open, WashLink refuses this owner's requests to assign you to customer bookings at their other shops through a linked roster entry."
Shop copy never suggests asking the worker to leave (pressure, W16-L2).

**D-86 F-S2: documented limitation plus an informed confirm; no guard.** A BEFORE DELETE guard only delays the loss: once openings are closed the cascade still removes the closed applications and notes, so preserving the text would mean shops can never be deleted. It would also change a J18 flow and 4 pinned tests.
Widening `retained_job_application_records` adds retained personal data while retention periods are undefined (W13-L5, W9-L5): a human decision, listed in W16-L4. Smallest protective change: `shopRemovalConfirmationText(shopName)` in new `presentation/utilities/shopRemovalCopy.ts`, used by `useOwnerShopManagement.ts:88`, exactly:
"Remove {name}? Customers will no longer be able to book this shop. Its job openings and the applications to them, including applicants' notes, are permanently deleted; applicants are told only that an application ended. This cannot be undone."

**D-87 F-C1: pin the core text.** Small (one constraint trigger) and safe (no real caller changes core text). A new platform version must keep the heading and body of the 15 core keys equal to the previous platform version, for every non-trusted session. Legal revisions go through a human-run migration, the D-28 route. Limits are in W16-L3.

**D-88 Smoke order:** w2..w11, w14, w12, w15, w16, w13 (w13 last; amends D-82). **D-89 F-S1:** the authenticated-executable list is pinned in a dedicated `j17_w16_*` file, because adding it to the J17 roll-up (248 lines) would pass the 350-line limit; the roll-up gets a pointer comment only.

## 3. Migrations (staged 20261104000001, 20261104000002; 99 staged, 97 in repo; each <= 120 lines; each ends with a `-- ROLLBACK` block; no committed migration edited)
**`2026_11_04_w16a_training_gate_holds_until_enrollment_ends.sql`**
1. Preflight (raises, creates nothing): `roster_worker_in_required_training(uuid, uuid)`, `roster_link_history`, trigger `bookings_guard_update_training_gate`.
2. `create or replace function public.roster_worker_in_required_training(p_worker_row_id uuid, p_shop_id uuid)`: same signature and attributes (`language sql stable security definer set search_path = public, pg_temp`). Body:
```sql
select exists (
  select 1 from public.workers w
  join public.training_enrollments e on e.owner_id = w.owner_id
    and (e.worker_id = w.user_id
         or exists (select 1 from public.roster_link_history h where h.worker_row_id = w.id and h.user_id = e.worker_id))
  join public.training_programs p on p.id = e.program_id
  where w.id = p_worker_row_id
    and (p_shop_id is null or exists (select 1 from public.shops s where s.id = p_shop_id and s.owner_id = w.owner_id))
    and e.status = 'accepted' and p.training_kind = 'required_initial'
    and public.training_enrollment_progress_status_of(e.id) <> 'completed');
```
3. Re-apply the revokes from public, anon, authenticated, service_role; `notify pgrst, 'reload schema'`. The trigger and `bookings_guard_training_assignment` are not touched. No table, index or RLS change.
4. ROLLBACK: restores the w15a body verbatim (quoted in the block). No data involved.

**`2026_11_04_w16b_contract_template_core_text_pin.sql`**
1. Preflight: `contract_template_core_safeguards()`, trigger `contract_template_versions_validate_at_commit`.
2. Function `public.contract_template_core_text_pin()` (trigger, definer, `search_path = public, pg_temp`, execute revoked from public, anon, authenticated, service_role). Returns at once if `public.is_trusted_db_session()`, the template is not `scope = 'platform'`, or no earlier platform version exists. Otherwise, if any core key has a different heading or body from the highest lower `version_number`, raises 23514: `WashLink safeguard text in the standard template can change only through a reviewed migration: <keys>.`
3. `create constraint trigger contract_template_versions_zz_core_text_pin after insert on public.contract_template_versions deferrable initially deferred for each row execute function public.contract_template_core_text_pin()`. It sorts after `..._validate_at_commit`, so existing refusal messages and their tests keep their order.
4. ROLLBACK: drop the trigger, drop the function. No data involved; versions stay write-once.

## 4. State machines
Enrollment and booking transitions are **unchanged**. Only the gate's reading of them changes:

| Enrollment / progress | Gate before | Gate after | Who can end the hold |
|---|---|---|---|
| accepted: scheduled, in_progress, awaiting_assessment | holds | holds | worker leaves; owner cancels (reason 10..300); or it completes |
| accepted: failed | lifted | **holds** | worker leaves; owner cancels; owner / trainer corrects to a pass |
| accepted: shop_removed | lifted | **holds** | worker leaves only (owner 42501; no recorder remains) |
| accepted: failed, shop deleted | lifted | **holds** | worker leaves only |
| accepted: completed (also after shop deletion) | lifted | lifted | - |
| invited, declined, withdrawn, cancelled | lifted | lifted | - |

Never refused by the gate: unassign, completing a booking already `in_progress`, unlink, re-link, withdraw, decline, trusted sessions. Refused as before: assigning, or starting (`-> in_progress`), through the current or any historic link (D-79).
Platform template: v(n) -> v(n+1) by super_admin only; new rule: core heading and body unchanged. A trusted migration may change them, and later versions compare against that text.

## 5. Tests (pgTAP `plan(n)` = actual; 0 pgTAP TODO blocks; each file <= 350 lines; existing `test_helpers` only)
Failed-assessment fixture: past `add_training_session` dates, `record_training_attendance`, then `record_training_assessment(enrollment, items, 'failed', null, reason)`.

New `supabase/tests/database/j7_w16_training_gate_holds_until_enrollment_ends.test.sql`:
- `w16_probe_owner_deletes_training_shop_then_assign_refused` (replays probe_sec5.sql: before 23514, delete `succeeded`, shop rows 0, enrollment `accepted` with shop null, progress `shop_removed`, after **23514**, booking unassigned)
- `w16_owner_identity_survives_shop_deletion`, `w16_failed_assessment_then_assign_refused` (progress `failed`, enrollment `accepted`), `w16_failed_assessment_preassigned_booking_cannot_start`, `w16_failed_then_shop_removed_still_gated`, `w16_unlink_after_shop_removal_still_gated`
- `w16_preassigned_booking_on_deleted_shop_cannot_start` (shop_id null; worker gets 23514), `w16_null_shop_booking_non_trainee_row_unaffected`
- `w16_gate_lifts_on_true_completion`, `w16_completed_then_shop_removed_stays_lifted`, `w16_failed_corrected_to_pass_lifts`, `w16_gate_lifts_on_withdrawal_after_failed`, `w16_gate_lifts_on_withdrawal_after_shop_removed`, `w16_gate_lifts_on_owner_cancel_of_failed_and_worker_notified` (`training.cancelled`)
- `w16_owner_cannot_cancel_after_shop_removed` (42501), `w16_other_owner_rows_unaffected`, `w16_unassign_and_completion_still_allowed`, `w16_trusted_session_still_bypasses`, `w16_gate_function_signature_attributes_and_privileges_unchanged`
- `w16_limitation_owner_cancel_at_zero_days_then_assign_succeeds` (pins W16-L1)

New `j16_w16_gate_hold_blocks_no_worker_action.test.sql`: `j16_w16_worker_withdraws_after_shop_removed`, `j16_w16_worker_withdraws_after_failed_assessment`, `j16_w16_worker_withdraws_after_failed_and_shop_removed`, `j16_w16_worker_unlinks_while_gate_held`, `j16_w16_worker_declines_contract_offer_while_gate_held`, `j16_w16_worker_terminates_contract_while_gate_held`, `j16_w16_worker_applies_elsewhere_while_gate_held`, `j16_w16_other_owner_assigns_and_worker_starts_while_gate_held`, `j16_w16_worker_account_deletion_not_refused`.

New `j18_w16_flows.test.sql`: `j18_w16_owner_deletes_shop_with_openings_applications_and_trainee`, `j18_w16_non_trainee_assign_on_other_shop_unchanged`, `j18_w16_customer_actions_on_deleted_shop_booking_unchanged`, `j18_w16_owner_account_delete_cascades_with_held_enrollment`, `w16_limitation_shop_delete_removes_not_accepted_application_keeps_accepted_copy` (pins W16-L4).

New `j9_w16_core_safeguard_text_pinned.test.sql` (uses `set constraints public.contract_template_versions_zz_core_text_pin immediate`): `w16_core_body_change_refused_for_every_core_key` (15), `w16_core_heading_change_refused`, `w16_unchanged_core_publish_succeeds`, `w16_editable_clause_change_still_publishes`, `w16_trusted_migration_changes_core_then_pin_follows`, `w16_owner_template_editing_unaffected`, `w16_core_pin_function_not_client_executable`, `w16_limitation_non_core_locked_clause_not_pinned`.

New `j17_w16_authenticated_executable_function_list.test.sql` (F-S1): `j17_w16_authenticated_executable_functions_match_pinned_list` (`is()` on one signature per line, sorted, generated once from the local catalog, so a failure shows the diff).

Edited pgTAP:
- `001_migration_replay`: add 20261104000001, 20261104000002; new `replay_w16_gate_and_core_pin_present`; plan 29.
- J18 roll-up: `= 97` to `= 99`; new `j18_trainee_not_assignable_after_training_shop_deleted`; plan 28.
- `j18_w6_d18_training_evidence_retention`: `d18_booking_gate_lifts_after_shop_removal` renamed `d18_booking_gate_holds_after_shop_removal`, expects 23514; later assertions checked; recorded in "Renamed tests" (D-76).
- `j9_w8_contract_template_rules`: drop the `customer_data_minimum` change at 176-179 and adjust 203-206; the rule moves to `j9_w16`.

Vitest (under `frontend/src/`):
- New `domain/utilities/trainingLifecycle.w16.test.ts`: `w16_worker_can_leave_after_failed_and_shop_removed`, `w16_worker_cannot_leave_completed`, `w16_owner_can_cancel_failed_not_completed_or_shop_removed`. Edit `trainingLifecycle.w6.test.ts:36`.
- New `presentation/components/worker/training/MyTrainingProgress.w16.test.tsx`: `w16_failed_training_explains_hold_and_leave_option`, `w16_shop_removed_explains_hold`.
- Edit `trainingNoticeCopy.w15.test.ts` to the D-85 text (test name kept); add `w16_trainee_notice_covers_failed_and_shop_removed`, `w16_shop_copy_does_not_suggest_asking_the_worker_to_leave`.
- New `presentation/utilities/shopRemovalCopy.w16.test.ts`: `w16_remove_shop_confirmation_states_what_is_deleted`.
- New `test/workforceDocs.w16.test.ts`: `w16_limitations_list_final_review_outcomes`, `w16_readiness_trigger_gate_covers_bookings_and_profiles`, `w16_acceptance_k9_does_not_restate_vitest_numbers`.
- Edit `test/workforceDocs.w13.test.ts`: 167 to 173, `W16-L1..L6` present, part rows also not `W16-`, comment updated.

Smoke: new `scripts/supabase-test/w16-api-smoke.mjs` (<= 220 lines; loopback only; same refusals and fixture path as w15). Checks: `w16_owner_shop_delete_succeeds`, `w16_assign_after_shop_delete_refused_23514`, `w16_worker_withdraw_after_shop_delete_succeeds`, `w16_assign_after_withdraw_succeeds`, `w16_assign_after_failed_refused_23514`, `w16_owner_cancel_failed_succeeds`, `w16_assign_after_cancel_succeeds`, `w16_core_text_publish_refused_23514`, `w16_unchanged_core_publish_succeeds`, `w16_pin_function_not_callable`. Ends `w16-api-smoke: n passed, 0 failed`. `SMOKE_ORDER` gets `'w16'` before `'w13'`.

## 6. Files
DB: the 2 migrations; pgTAP above. Scripts: `w16-api-smoke.mjs` (new), `run-api-smokes.mjs` (order, header).
Frontend (`frontend/src/`): `domain/utilities/trainingEnrollmentLifecycle.ts` (worker: only `completed` hides leave; owner: `completed` and `shop_removed` hide cancel, `failed` allows it; `canCorrectTrainingAssessment` unchanged); `presentation/utilities/trainingNoticeCopy.ts`, `trainingDisplay.ts`, `shopRemovalCopy.ts` (new); `presentation/hooks/useOwnerShopManagement.ts:88`; `presentation/components/worker/training/MyTrainingProgress.tsx`; `presentation/components/superAdmin/standardContract/StandardContractEditor.tsx:30` (comment only: the database refuses changed core text). `TrainingRosterPanel`, `MyTrainingsPanel` and `TrainingEnrollmentService` read the helpers and need no edit; the builder confirms. No new repository, service or route; no `backend/` change.

Docs (`docs/workforce/`): `TRAINING.md` (:39-41, :129-141, section 4 table, D-83, D-84); `ARCHITECTURE.md` (W16 row, gate wording); `CONTRACT_TEMPLATES.md` (:86, :100, D-87); `MARKETPLACE_AND_APPLICATIONS.md` (:170, D-86); `ROLLBACK_GUIDE.md` (order `W16 -> W15 -> W13 -> ...`, W16 row); `ROLE_AND_PROFILE_SECURITY.md` (D-10 row 58: replaced gate body; the new constraint trigger sorts after the validator); `ACCEPTANCE_TESTS.md` (J7 / J9 / J16 / J17 / J18 rows, W16 file list, Renamed tests, K10 173; F-C4: drop the Vitest figures from K9 and point to STATE.md).

`LIMITATIONS.md` (K10): correct :48-51 (hold rule), :61 and :115 (W6-L10: gate lifts "after completion, withdrawal or cancellation"). Update "All 167" to 173. New entries:
- SEC-5 outcome: closed by D-83; residual W16-L1 (recorded pass, cancel at 0 days, pressure to leave, contract active while held, D-80 rows gated longer).
- F-C1 outcome (pinned, migration route, W16-L3); F-C2 remainder (name-only rows, W15-L1); F-C3 outcome (W15-L1, W15-L2); F-C7 (no interview feature or notices, against SPEC I "interview scheduling"; D-69); F-S2 (D-86, W16-L4).
- Not code: F-C5 (landing "Verified car wash professionals", `AuthLandingPage.tsx:143`, W16-L6); F-C6 (termination reason 10..500 seen by the shop, W16-L5); F-S1 (pinned); F-S3 (anon default grants, revoke after D-10); F-S5 (`is_trusted_db_session` allow-list, D-10); F-S6 (two-session lock order untested).

`DEPLOYMENT_READINESS.md`: trigger-order gate (:27) adds bookings (`bookings_guard_update_training_gate` after `bookings_guard_update`), profiles (`profiles_sanitize_role_on_insert`, `profiles_guard_protected_columns`; no production BEFORE trigger writing role after the guard; F-S4) and templates (`contract_template_versions_zz_core_text_pin` after `contract_template_versions_validate_at_commit`). New unticked gates: F-S3 revoke decision; F-S5 session allow-list; W16 pre-apply count of accepted failed / shop_removed enrollments with assigned accepted bookings (these stop being startable).

`LEGAL_REVIEW_REGISTER.md`: W16-L1..L6 in the index (`## W16 items`), status summary row, Total **173** (index 20), heading W0-W16, sign-off rows, overlap map, ID list; stays <= 350 lines (316 now; keep rows tight). `legal/REGISTER_PART_1_W0_W8.md`: W6-L10 and W6-L12 text kept, W16 notes appended, status stays OPEN. FINAL_REVIEW proposed items 2 and 3 cross-reference W15-L1, W15-L2 and are not duplicated; item 1 is W16-L3.

Orchestrator at RECORD (not builders): DECISIONS D-83..D-89, LOOP.md (w16 smoke row, migration count 99), STATE.md.

## 7. Acceptance criteria (repo root, local only; never `--linked`, `--db-url`, `db push`, `.env`)
| AC | Criterion | Evidence |
|---|---|---|
| AC1 | 2 new migrations with ROLLBACK; none committed edited | `ls supabase/migrations/2026_11_04_w16*` = 2 files; `grep -c ROLLBACK` >= 1 in each; `git diff --name-status bad4f80 -- supabase/migrations` empty before RECORD (new files untracked) |
| AC2 | Clean reset replays 99; all files PASS; 0 TODO | `node scripts/supabase-test/run-db-tests.mjs` ends `Result: PASS`; `replay_w16_gate_and_core_pin_present` ok; 0 `todo_start` hits in the runner log and in `supabase/tests/database/*.sql` |
| AC3 | SEC-5 shop path closed | `w16_probe_owner_deletes_training_shop_then_assign_refused`, `j18_trainee_not_assignable_after_training_shop_deleted` ok; probe_sec5.sql on the local DB prints `sec5_assign_after=23514`, `sec5_booking_assigned_to_rt=false` |
| AC4 | SEC-5 fail path closed | `w16_failed_assessment_then_assign_refused`, `w16_failed_assessment_preassigned_booking_cannot_start`, `w16_failed_then_shop_removed_still_gated` ok |
| AC5 | Owner identity and null-shop start handled | `w16_owner_identity_survives_shop_deletion`, `w16_preassigned_booking_on_deleted_shop_cannot_start`, `w16_null_shop_booking_non_trainee_row_unaffected` ok |
| AC6 | Gate lifts on real ends | `w16_gate_lifts_on_true_completion`, `w16_completed_then_shop_removed_stays_lifted`, `w16_failed_corrected_to_pass_lifts`, `w16_gate_lifts_on_withdrawal_after_failed`, `w16_gate_lifts_on_withdrawal_after_shop_removed`, `w16_gate_lifts_on_owner_cancel_of_failed_and_worker_notified`, `w15_gate_lifts_after_withdraw_or_completion` ok |
| AC7 | J16: nothing blocks the worker | every `j16_w16_*` in `j16_w16_gate_hold_blocks_no_worker_action` ok; `j16_three_owner_rule_never_blocks_decline_or_termination`, `j16_w15_worker_unlink_and_decline_still_succeed` ok |
| AC8 | Release reachable in the UI | Vitest `w16_worker_can_leave_after_failed_and_shop_removed`, `w16_owner_can_cancel_failed_not_completed_or_shop_removed`, `w16_failed_training_explains_hold_and_leave_option` pass |
| AC9 | Tests detect the bypass | Verifier runs `j7_w16` with the w15a body restored from the w16a ROLLBACK block, in a rolled-back transaction: the `w16_probe_*` and failed-path assertions report `not ok`; live gate unchanged afterwards. The ROLLBACK body, uncommented, has an empty `diff` against w15a:127-147 |
| AC10 | J18 and F-S2 flows intact | every `j18_w16_*`, `j18_existing_flows`, J18 roll-up plan(28), `j18_owner_can_still_edit_and_delete_shop_with_openings`, `w16_limitation_shop_delete_removes_not_accepted_application_keeps_accepted_copy` ok; `w16_remove_shop_confirmation_states_what_is_deleted` passes; `grep -n "before delete on public.shops" supabase/migrations/2026_11_04_w16*` empty |
| AC11 | Core text pinned; ordinary publish unchanged | every `w16_*` in `j9_w16_core_safeguard_text_pinned` ok (fix cycle 1: `w16_limitation_non_core_locked_clause_not_pinned` renamed `w16_non_core_locked_clause_change_refused`; new `w16_locked_clause_removal_refused`, `w16_added_locked_clause_refused`, `w16_limitation_added_editable_clause_accepted`, and `j18_w16_accepted_booking_at_deleted_shop_moves_only_after_trainee_leaves` in `j18_w16_flows`); `w8_super_admin_publishes_platform_version_existing_owner_versions_unchanged` ok; w8, w9, w14 smokes 0 failed |
| AC12 | Copy accurate; versioned texts unchanged | `w15_trainee_notice_states_only_what_the_platform_enforces`, `w16_trainee_notice_covers_failed_and_shop_removed`, `w16_shop_copy_does_not_suggest_asking_the_worker_to_leave` pass; `git diff bad4f80 -- frontend/src/presentation/utilities/trainingNoticeCopy.ts` shows no change to `trainingNoticeText` or `ownerAttestationText` |
| AC13 | Function list pinned; privileges intact | `j17_w16_authenticated_executable_functions_match_pinned_list`, `w16_gate_function_signature_attributes_and_privileges_unchanged`, `w16_core_pin_function_not_client_executable`, J17 roll-up ok |
| AC14 | K10 docs | `w16_limitations_list_final_review_outcomes`, `w16_readiness_trigger_gate_covers_bookings_and_profiles`, `w16_acceptance_k9_does_not_restate_vitest_numbers` pass; `grep -n -e F-C1 -e F-C2 -e F-C7 -e F-S2 -e SEC-5 docs/workforce/LIMITATIONS.md` hits each; no ticked box in `DEPLOYMENT_READINESS.md` (`w13_workforce_docs_exist_with_required_sections` passes) |
| AC15 | Register consistent | `w13_legal_register_index_matches_parts_and_all_open` passes with 173 rows, all OPEN; `grep -n "W16-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` hits L1..L6; index <= 350 lines |
| AC16 | Smokes | `node scripts/supabase-test/run-api-smokes.mjs` prints `w16-api-smoke: n passed, 0 failed` before the w13 line, then `run-api-smokes: PASS (15 smokes)` |
| AC17 | Regression | `npm run lint` 0, `npm run build` 0, `npm test` all pass; `backend/.venv/Scripts/python.exe -m pytest -q` 4 passed; `node --test scripts/supabase-test/stage-local-workdir.test.mjs` 19 pass; `git diff --stat bad4f80 -- backend` empty |
| AC18 | No refusal added to a worker action | `grep -n -e withdraw_from_training -e cancel_training_enrollment -e unlink_my_roster_entry -e guard_worker_roster_write -e bookings_guard_training_assignment supabase/migrations/2026_11_04_w16a*` shows no `create or replace` of them |

## 8. Rollback, risks and legal-review flags
Rollback: w16b block, then w16a block (local only), then the W15 order (`ROLLBACK_GUIDE.md`). No data is written, so nothing is lost; it reopens SEC-5. Frontend: revert the copy and lifecycle edits together. Production apply remains a human gate (D-10, D-11).
- R1 Over-hold: a worker wanting paid work from the same owner after a fail or shop removal stays gated until the enrollment ends. Mitigated by the D-84 paths and D-85 copy; documented.
- R2 Contract active while held: `activate_worker_contract` uses `training_enrollment_is_live` (w9g:142), which excludes `failed` / `shop_removed`, so a contract can activate while assignment is refused. Deliberate: refusing more would restrict a worker-accepted contract. Documented, W16-L1.
- R3 Pressure: the owner cannot lift `shop_removed` alone, so may press the worker to leave. Shop copy avoids suggesting it; the platform cannot detect it (W16-L2).
- R4 D-80 interaction: a re-used row stays gated longer, because holds last longer. Workaround unchanged (a new row).
- R5 The pin blocks an urgent admin text fix: it needs a migration. Accepted (D-28). `j17_w8` and `j19_w8` name the validator trigger; TEST confirms no trigger-list pin breaks.
- R6 The F-S1 list makes any new authenticated function fail J17 by design; update it in the same increment. It is generated once, so review it against FINAL_REVIEW (152 at 3967f32; w15a added no client-executable function).
- R7 Local proof only (D-10). Unknown production triggers on `bookings` or `contract_template_versions` are D-10 rows. The pre-apply count is expected to be 0 (workforce tables not yet in production); the gate records the actual result.

Legal flags (all OPEN; no compliance claim in code, copy or docs):
- **W16-L1** Gate hold rule (D-83, D-84): holds until completion or the enrollment ends. Review whether this fits the free-training rule; whether a cancel at 0 attended days followed by assignment, or a recorded pass the worker cannot dispute (W6-L13), leaves too wide a route; whether an active contract should release it. Related W15-L1, W6-L10, W9-L9.
- **W16-L2** D-85 worker copy and the leave action: whether leaving under owner pressure, or a `failed` display becoming `withdrawn`, disadvantages the worker; whether the worker is told enough. Related W15-L2, W6-L13.
- **W16-L3** F-C1: core safeguard text changes only by a human-run migration; no second reviewer; non-core locked `training_pay_or_reimbursement` unpinned; versions published before the pin are not re-checked. Related W8-L1, W8-L10..L12.
- **W16-L4** F-S2: shop deletion deletes not-accepted applications and cover notes; accepted applications keep a copy without the note. Whether workers must keep more, and for how long. Related W5-L10, W9-L5, W13-L5 (RA 10173).
- **W16-L5** F-C6: a worker must give a 10..500 character reason to end a contract, and the shop sees it. Related W13-L2, W7-L14.
- **W16-L6** F-C5: pre-existing landing copy "Verified car wash professionals" against no worker identity verification.
