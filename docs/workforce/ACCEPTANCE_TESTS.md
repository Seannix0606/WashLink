# Workforce module: acceptance tests (J1-J18), SPEC K evidence map, renamed tests

pgTAP files are in `supabase/tests/database/` and are listed here by file name without the .test.sql suffix. Vitest files are
under `frontend/src/` and are tagged `*.j<n>.test.*`. Smokes are `scripts/supabase-test/w<n>-api-smoke.mjs`, run in
order by `run-api-smokes.mjs` (D-77).

Every result below is from the local Docker stack (D-10). Before W13 fix cycle 1 (W13 LOG "BUILD (DB)", the D-78
addendum and TEST_RESULTS.md), a clean reset applied 96 staged migrations. pgTAP then ran `Files=105, Tests=3185 ...
Result: PASS` with 0 `todo_start(`, and all 13 smokes ended `0 failed` (`run-api-smokes: PASS (13 smokes)`). After
fix cycle 1 (2026-11-03, W13 LOG "FIX CYCLE 1 (DB) runs") a clean reset gave `Files=105, Tests=3198 ... Result: PASS`
and all 13 smokes ended `0 failed` again. Plan counts and line numbers below are read from the edited
files. The W13
Vitest, lint and build numbers are recorded in `loop/workforce/STATE.md` by the W13 test step. This file does not
restate them.

## J1-J18 index

The older generic files (`j17_authorization_harness`, `j18_existing_flows`) are not renamed, because the W1-W12 verdicts
cite them. W13 added a scenario-named roll-up for J17 and for J18.

| J | Scenario-named pgTAP (plan) | Other pgTAP | Vitest (count; example) | Smoke |
|---|---|---|---|---|
| J1 | `j1_worker_registration_and_profile` (55) | `j18_w2_profile_reads`, `j17_w2_worker_data_guards` | 13; `WorkerProfileService.j1.test.ts` | w2 |
| J2 | `j2_owner_can_create_and_manage_only_own_job_openings` (63) | `j2_job_opening_lifecycle`, `j2_w14_job_opening_reports`, `j2_w14_job_opening_takedown`, `j2_w13_moderation_queue_paging` | 3; `jobOpeningLifecycle.j2.test.ts` | w4, w14, w13 |
| J3 | `j3_unverified_owner_cannot_publish_job_openings` (42), `j3_unverified_owner_cannot_issue_shop_certifications` (29) | `j3_w14_unreviewed_approved_shops` | 2; `JobOpeningListItem.j3.test.tsx` | w4, w7, w14 |
| J4 | `j4_worker_can_browse_and_apply_without_duplicates` (90) | `j4_w5_opening_application_cap`, `j4_w7_certification_required_openings` | 1; `ApplyToOpeningModal.j4.test.tsx` | w5 |
| J5 | `j5_application_status_transitions_are_validated` (73) | `j5_application_audit_and_notifications`, `j5_w5_fix1_owner_notifications_and_lock_order` | 1; `jobApplicationLifecycle.j5.test.ts` | w5 |
| J6 | `j6_worker_cannot_complete_training_without_three_days_and_assessment` (40), `j6_worker_cannot_be_certified_without_three_days_and_assessment` (42) | `j6_w6_training_program_and_enrollment_lifecycle`, `j6_w6_training_audit_and_notifications`, `j6_w7_certification_lifecycle`, `j6_w7_certification_audit_and_notifications`, `j6_w11_oversight_audit_and_notifications` | 3; `MyTrainingsPanel.j6.test.tsx` | w6, w7 |
| J7 | `j7_required_initial_training_is_free_to_the_worker` (23) | - | 4; `TrainingInvitationDetail.j7.test.tsx` | w6 |
| J8 | `j8_unauthorized_users_cannot_alter_training_evidence` (41), `j8_unauthorized_users_cannot_alter_certification_records` (38) | `j8_w11_certification_platform_review_holds`, `j8_w11_certification_platform_review_rules`, `j8_w11_fix1_review_mask_resuspend_cap` | 4; `CertificationControls.j8.test.tsx` | w6, w7, w11 |
| J9 | `j9_owner_can_customize_contract_draft_and_save_reusable_template_version` (36) | `j9_w8_contract_template_rules`, `j9_w8_contract_template_gaps`, `j9_w8_contract_template_audit`, `j9_w9_owner_customizes_worker_contract_draft`, `j9_w9_worker_contract_rules`, `j9_w9_problem_term_flags`, `j9_w9_worker_contract_audit` | 3; `ContractTemplateEditor.j9.test.tsx` | w8, w9 |
| J10 | `j10_accepted_contract_contents_preserved_after_template_change` (27) | - | 1; `ContractDocumentView.j10.test.tsx` | w9 |
| J11 | `j11_material_contract_amendments_require_acceptance` (28) | - | 1; `WorkerContractReview.j11.test.tsx` | w9 |
| J12 | `j12_worker_and_owner_cannot_access_other_parties_private_contracts` (28) | `j12_w11_contract_dispute_access`, `j12_w11_contract_dispute_rules` | 2; `ContractRoleActions.j12.test.tsx` | w9, w11 |
| J13 | `j13_three_distinct_qualifying_owner_relationships_counted` (12) | `j13_w10_relationship_audit_and_sync`, `j13_w10_workforce_policy_rules`, `j13_w12_scheduled_jobs` | 1; `OwnerRelationshipProgressCard.j13.test.tsx` | w10 |
| J14 | `j14_same_owner_contracts_and_amendments_count_once` (15) | - | 1; `MyOwnerRelationshipsList.j14.test.tsx` | w10 |
| J15 | `j15_relationship_counting_policy_for_each_status` (27) | `j15_w10_trusted_contract_repair_rules`, `j15_w13_contract_expiry_notice_wording`, `j15_w13_trusted_contract_end_runbook` | 1; `ownerRelationshipDisplay.j15.test.tsx` | w10, w12, w13 |
| J16 | `j16_three_owner_rule_never_blocks_decline_or_termination` (19) | `j16_w11_disputes_and_reviews_never_change_contracts`, `j16_w12_scheduler_locking`, `j16_w12_fix1_scheduler_liveness` | 2; `MyContractsPanel.j16.test.tsx` | w9, w10, w11 |
| J17 | `j17_database_constraints_and_authorization_prevent_unauthorized_access` (37, W13 roll-up) | `j17_authorization_harness`, 30 `j17_w<n>_*` files (incl. `j17_w13_admin_audit_reads`) | 12; `noRawAuditReads.j17.test.ts` | w2-w14 |
| J18 | `j18_existing_booking_pricing_verification_and_rating_workflows_still_work` (25, W13 roll-up) | `j18_existing_flows`, 13 `j18_w<n>_*` files | 9; `BookingService.j18.test.ts` | w2; pytest `4 passed` |

J17 roll-up assertions (plan 37 after fix cycle 1, was 29; line of the first assertion of each name):

- `j17_workforce_table_list_is_complete` (59): 43 tables and 2 views.
- `j17_every_workforce_table_has_rls_enabled` (68).
- `j17_no_client_role_has_insert_update_delete_on_workforce_tables` (74).
- `j17_service_role_has_no_workforce_table_privileges` (78).
- `j17_no_client_role_has_privileges_on_any_public_sequence` (89): fix cycle 1, S2.
- `j17_no_column_level_grant_on_workforce_tables` (104): fix cycle 1, S3.
- `j17_no_client_role_has_truncate_references_or_trigger_on_any_public_table` (117): fix cycle 1, S6.
- `j17_service_role_cannot_reach_roster_link_code_pepper` (124): fix cycle 1, N3.
- `j17_guard_triggers_on_client_writable_tables_are_pinned` (148): fix cycle 1, N2.
- `j17_no_workforce_policy_qual_is_the_literal_true` (159): N1; matches the literal `true` only.
- `j17_no_anon_or_public_write_policy_on_workforce_tables` (163): N1.
- `j17_every_definer_function_pins_search_path_with_pg_temp_last` (170).
- `j17_anon_executes_no_workforce_function` (178).
- `j17_no_workforce_table_in_realtime_publication` (185).
- `j17_raw_audit_table_unreadable_by_every_client_role` (209).
- `j17_private_contract_tables_unreadable_by_non_parties` (225).
- `j17_no_set_config_wrapper_exposed` (243).

Other W13 pgTAP assertions:

- `j17_w13_admin_audit_reads` (plan 25, was 21) adds `w13_audit_select_deny_all_is_restrictive` (111, S1). The test
  plants a permissive `using (true)` policy in a rolled-back transaction. super_admin and owner still read 0 rows,
  and the RPC still returns the row.
- `j15_w13_contract_expiry_notice_wording` (plan 20, was 19):
  - `w13_expiry_notice_owner_body_uses_record_wording` (66) now pins the owner caveat (C2).
  - `w13_other_contract_notice_bodies_unchanged` (87). From line 104 it also pins the md5 of the w9j body (with the
    two strings swapped back) and of the live w13d body (S4).

J18 roll-up assertions:

- `j18_customer_books_with_server_quote` (39).
- `j18_owner_accepts_booking_and_assigns_contracted_roster_worker` (54).
- `j18_assigned_worker_completes_booking` (62).
- `j18_customer_rates_completed_booking_once` (72).
- `j18_owner_manages_own_pricing_only` (83).
- `j18_shop_verification_submit_review_and_resubmit` (95).
- `j18_trainee_still_not_assignable_during_required_training` (116).
- `j18_booking_tables_gain_no_workforce_columns` (124).

W13 Vitest files:

- `useAdminModerationQueue.w13.test.ts`
- `PostingReportQueuePaging.w13.test.tsx`
- `SupabaseJobOpeningModerationRepository.w13.test.ts`
- `workerContractCopy.w13.test.ts`
- `contractExpiryDisplayCopy.w13.test.ts` (fix cycle 1, C3)
- `contractExpiryNoticeWording.w13.test.ts`
- `noRawAuditReads.j17.test.ts`
- `workforceDocs.w13.test.ts`

## SPEC K evidence map

`file:line` points at the `plan(n)` line or at a named assertion in that file. The final verifier copies this map
into `loop/workforce/FINAL_VERDICT.md`. This map records where the evidence is. It does not decide whether an item is
satisfied.

| K item | Evidence |
|---|---|
| K1 complete role-aware frontend flows | Weak evidence, stated plainly: Vitest with mocked repositories only (tags j1-j18, w11, w13, w14), plus lint and build exit 0 (STATE.md). There is no browser end-to-end test and no frontend run against a real stack. The local API smokes exercise the RPCs the UI calls, not the UI. Flows: `DASHBOARDS_AND_OVERSIGHT.md` (D-42, D-57) |
| K2 persistent data, validated lifecycle transitions | `j2_job_opening_lifecycle`:6, `j5_application_status_transitions_are_validated`:6, `j6_w6_training_program_and_enrollment_lifecycle`:7, `j6_w7_certification_lifecycle`:7, `j9_w9_worker_contract_rules`:8, `j15_relationship_counting_policy_for_each_status`:9 |
| K3 migrations and authorization policies | `001_migration_replay`:7 (plan 27; `replay_schema_migrations_has_baseline_w2_to_w14_w12_and_w13`, `replay_w13_audit_table_has_no_client_select_policy`); J17 roll-up:12 (plan 37); every migration ends with a `-- ROLLBACK` block, but **no ROLLBACK block has ever been executed** (`ROLLBACK_GUIDE.md`), so rollback is unproven; `ROLE_AND_PROFILE_SECURITY.md` |
| K4 job-opening and application workflows | `j2_owner_can_create_and_manage_only_own_job_openings`:36, `j3_unverified_owner_cannot_publish_job_openings`:55, `j4_worker_can_browse_and_apply_without_duplicates`:70, `j5_application_status_transitions_are_validated`:6, `j2_w13_moderation_queue_paging`:9; smokes w4, w5, w14, w13 |
| K5 training with a minimum three-day requirement | `j6_worker_cannot_complete_training_without_three_days_and_assessment`:6, :44 (`j6_calendar_time_alone_does_not_complete`), :134 (`j6_min_training_days_cannot_be_below_three`); `j7_required_initial_training_is_free_to_the_worker`:44 (`j7_worker_fee_check_forces_zero_for_required_initial`); `TrainingInvitationDetail.j7.test.tsx`:23 (`j7_training_invitation_shows_free_training_notice_before_accept`); `j18_existing_booking_pricing_verification_and_rating_workflows_still_work`:116 (`j18_trainee_still_not_assignable_during_required_training`; gaps: `LIMITATIONS.md` free-training gaps); `TRAINING.md` |
| K6 evidence-based certification issuance | `j6_worker_cannot_be_certified_without_three_days_and_assessment`:38 (`j6_no_certification_for_enrollment_only`), :84 (`j6_certification_records_approver_assessor_enrollment_and_time`), :157 (`j6_issuer_kind_is_shop_issued_only`), `j8_unauthorized_users_cannot_alter_certification_records`:8, `j3_unverified_owner_cannot_issue_shop_certifications`:52; `CERTIFICATIONS.md` |
| K7 editable, versioned templates and contract records | `j9_owner_can_customize_contract_draft_and_save_reusable_template_version`:32, `j10_accepted_contract_contents_preserved_after_template_change`:32, `j11_material_contract_amendments_require_acceptance`:37, `j12_worker_and_owner_cannot_access_other_parties_private_contracts`:55; `CONTRACT_TEMPLATES.md`, `WORKER_CONTRACTS.md` |
| K8 correct distinct-owner counting | `j13_three_distinct_qualifying_owner_relationships_counted`:33, :53 (`j13_unverified_owner_shop_not_counted`), :72 (`j13_policy_minimum_read_from_workforce_policies_default_three`); `j13_w10_workforce_policy_rules`:7 (plan 20); `j14_same_owner_contracts_and_amendments_count_once`:30, `j15_relationship_counting_policy_for_each_status`:42, `j16_three_owner_rule_never_blocks_decline_or_termination`:54; `OWNER_RELATIONSHIPS.md` (D-3 informational) |
| K9 tests for access control, business rules, regressions | J17 roll-up (37 assertions), J18 roll-up (25), all `j17_*` and `j18_*`; `j17_w13_admin_audit_reads`:8 (plan 25); pytest `4 passed`; full-suite numbers from one clean reset after W13 fix cycle 1: `Files=105, Tests=3198`, `Result: PASS`, 13 smokes `0 failed`, Vitest 299/299 (W13 `VERDICT.md`, STATE.md) |
| K10 documented limitations and outstanding legal review | `LIMITATIONS.md`, `LEGAL_REVIEW_REGISTER.md` (164 items, all OPEN), `DEPLOYMENT_READINESS.md` (all gates unchecked) |
| K closing line: no deploy or shared apply without authorization | `git status -sb` shows no upstream push; `grep -rnE "db push\|--linked\|--db-url" scripts` shows only refusals and comments; `DEPLOYMENT_READINESS.md` gates 1-6 |

## Renamed tests (D-76)

Earlier verdicts cite the old names. The pairs below keep the evidence trail (W13 LOG "BUILD (DB)").

| File | Old name | New name |
|---|---|---|
| `001_migration_replay` | `replay_schema_migrations_has_baseline_w2_to_w14_and_w12` | `replay_schema_migrations_has_baseline_w2_to_w14_w12_and_w13` (plus new `replay_w13_audit_table_has_no_client_select_policy`) |
| `j17_w3_audit_events` | `j17_audit_readable_only_by_super_admin` (5 assertions) | `j17_audit_raw_table_not_readable_by_any_client_role` (super_admin read now expects 0) |
| `j17_w3_audit_wiring` | `w3_shop_review_log_view_is_super_admin_only` (4) | `w3_shop_review_log_view_is_trusted_sql_only` (admin, owner, customer, anon: 42501) |
| `j13_w12_scheduled_jobs` line 73 | `w12_contract_expiry_job_expires_past_end_and_notifies_each_party_once` | `w12_contract_expiry_job_notifies_each_party_once` |
| `j13_w12_scheduled_jobs` line 76 | same | `w12_contract_expiry_job_stamps_system_end_and_clears_pending` |
| `j13_w12_scheduled_jobs` line 82 | same | `w12_contract_expiry_job_second_run_changes_nothing` |
| `j17_database_constraints_and_authorization_prevent_unauthorized_access` (fix cycle 1, N1) | `j17_no_workforce_policy_is_unconditionally_true_for_clients` | split into `j17_no_workforce_policy_qual_is_the_literal_true` and `j17_no_anon_or_public_write_policy_on_workforce_tables` |
| `w3-api-smoke.mjs` | `super_admin_reads_shop_audit_events` | `super_admin_reads_shop_audit_events_through_audited_log` |
| `w3-api-smoke.mjs` | `super_admin_reads_review_log` | `review_log_view_denied_for_super_admin` |

Unchanged names whose content changed:

- `j13_w12_scheduled_jobs` line 71 keeps `w12_contract_expiry_job_expires_past_end_and_notifies_each_party_once`.
- `w3_shop_review_history_survives_reviewer_deletion` now reads the view in the trusted session.
- The w3 smoke check `customer_review_log_returns_zero_rows` now asserts 42501 with no rows.
- `MyContractsPanel.w9.test.tsx` expects the D-73 text under its old test name.
