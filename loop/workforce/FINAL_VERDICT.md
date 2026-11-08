# Final whole-branch verification: WashLink workforce module

- Verifier: fresh `workforce-verifier` run, with no access to the build conversation. It did not trust LOG / STATE / ACCEPTANCE_TESTS / FINAL_REVIEW summaries without re-checking them.
- Date: 2026-11-03. Branch `feature/workforce`, HEAD `3967f324bed4ec95cc0ef3797fbf53de6d100ff5`, base `main` `ec6570a`.
- Only uncommitted file at start: `loop/workforce/FINAL_REVIEW.md` (untracked). This file is the only file the verifier wrote.
- Local Docker stack only. No `--linked`, `--db-url`, `db push` or `link` was used, and no `.env` was read.

## Overall verdict: **FAIL**

All checks pass, and criteria 1, 2 and 5 pass. **Criteria 3 and 4 fail**:

- **Criterion 4.** FINAL_REVIEW finding **F-C2**, together with **F-C3**, breaks SPEC D (free-training rule). It should have been graded BLOCKING. The verifier reproduced it on the local stack (see "Reproduced defect").
- **Criterion 3 / K10.** `LIMITATIONS.md` and the legal register leave out gaps that the final review found. `LIMITATIONS.md` also says the DB "blocks the training owner's customer bookings for a trainee in required training", but the training owner can get around that block.

## Check table (actual output, this run, clean state)

| # | Check | Command | Exit | Actual result |
|---|---|---|---|---|
| 1 | Frontend lint | `cd frontend && npm run lint` | 0 | `eslint .`, no findings |
| 2 | Frontend build | `cd frontend && npm run build` | 0 | `✓ built in 584ms` |
| 3 | Frontend unit tests | `cd frontend && npm test` | 0 | `Test Files 145 passed (145)` / `Tests 299 passed (299)` |
| 4 | Backend tests | `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | `4 passed, 1 warning in 0.74s` |
| 5 | Stager tests | `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | `tests 19` `pass 19` `fail 0` |
| 6 | Migration replay + pgTAP | `node scripts/supabase-test/run-db-tests.mjs` | 0 | `npx supabase db reset --local --workdir .local-supabase-test` applied **96** migrations (counted in the reset section of the log); `All tests successful.` `Files=105, Tests=3198`, `Result: PASS`; 0 `todo_start(`; 105/105 files `ok` |
| 7 | API smokes (same stack) | `node scripts/supabase-test/run-api-smokes.mjs` | 0 | w2 48, w3 33, w4 43, w5 39, w6 40, w7 38, w8 30, w9 34, w10 39, w11 36, w14 33, w12 22, w13 17 passed, **0 failed** in each (452 checks); `run-api-smokes: PASS (13 smokes)` |
| 8 | Stack stop | `npx supabase stop --workdir <abs>/.local-supabase-test --no-backup` (run from inside the workdir) | 0 | `Stopped supabase local development setup.`; 0 washlink containers left |

After the checks, the verifier started the stack once more from the staged workdir to run a probe for F-C2 (below). The probe ran in a rolled-back transaction, and the stack was stopped again afterwards with the same command. `git status` after everything: only `?? loop/workforce/FINAL_REVIEW.md` (plus this file).

## Repository checks

| Check | Result | Evidence |
|---|---|---|
| No migration on main edited | PASS | `git diff --name-status ec6570a HEAD -- supabase/migrations` lists only `A` entries (89 added). None of the 5 migrations on main appears; no diffed migration path exists at `ec6570a`. 5 + 89 = 94 repo files, plus 2 local-only baseline files = 96 staged. |
| No `.env` committed | PASS | No `.env*` path in `git diff --name-only ec6570a HEAD`. The only tracked env files are `.env.example`, `backend/.env.example`, `backend/.env.sample` and `frontend/.env.example`, all unchanged from main. Contents were not read. |
| No upstream push | PASS | `git status -sb` gives `## feature/workforce` with no tracking branch; `git rev-parse --abbrev-ref feature/workforce@{upstream}` gives `fatal: no upstream configured`; `git branch -r` shows only `origin/main` |
| No remote DB commands | PASS | Under `scripts/`, every `db push` / `--linked` / `--db-url` / `project-ref` hit is a refusal list (`FORBIDDEN_ARGUMENTS` in `run-db-tests.mjs:24`, `run-api-smokes.mjs:18`), a comment, or a test of the refusal. The added diff lines that mention them are docs or prohibitions only. |
| DEPLOYMENT_READINESS gates unticked | PASS | 32 `- [ ]` lines, 0 `[x]` |
| Legal register: 164 items, all OPEN | PASS | Full rows: Part 1 81, Part 2 72, index W13 section 11 = 164 unique IDs, all `OPEN`. The index ID list has 164 rows, all `OPEN`, with an empty "Human outcome" column. The sign-off table is blank. |

## Completion criteria (LOOP.md)

| # | Criterion | Grade | Evidence |
|---|---|---|---|
| 1 | W0–W14 all `passed` in STATE.md | **PASS** | `STATE.md` rows W0–W14 all show `passed`. Each `increments/W<n>/VERDICT.md` (W0–W14) reads `Overall: PASS`. |
| 2 | J1–J18 exist, are scenario-named, and pass in the full suite from a clean reset | **PASS** | Every J has a scenario-named pgTAP file that reported `ok` in this run (list below). Vitest `*.j<n>.test.*` files exist for every J1–J18 (counts j1 13, j2 3, j3 2, j4 1, j5 1, j6 3, j7 4, j8 4, j9 3, j10 1, j11 1, j12 2, j13 1, j14 1, j15 1, j16 2, j17 12, j18 9) and all 145 Vitest files passed. Note: LOOP.md wants the actual output recorded in STATE.md. `STATE.md` "Final verification" still says "Not run", and the orchestrator must copy this table there (the verifier may write only this file). |
| 3 | Every SPEC K item satisfied | **FAIL** | K10 is NOT SATISFIED (see K table). The other K items are satisfied. |
| 4 | No BLOCKING security / compliance findings on the full diff | **FAIL** | The FINAL_REVIEW record matches the scope: `git diff --name-only ec6570a HEAD` = 1017 files, as stated. **But F-C2 together with F-C3 breaks SPEC D and should have been BLOCKING** (see below). The other non-blocking findings (F-S1..F-S6, F-C1, F-C4..F-C7) do not break a SPEC requirement. F-C1, F-C7 and F-S2 are documentation gaps (counted under K10). The reviewers' catalog figures (152 authenticated functions, and so on) were not re-queried by this verifier. |
| 5 | docs/workforce has architecture, rollback guide, limitations, LEGAL_REVIEW_REGISTER.md | **PASS** | `docs/workforce/ARCHITECTURE.md` (172 lines), `ROLLBACK_GUIDE.md` (160), `LIMITATIONS.md` (139), `LEGAL_REVIEW_REGISTER.md` (292) plus `legal/REGISTER_PART_1_W0_W8.md` and `legal/REGISTER_PART_2_W9_W14.md` |

Scenario-named pgTAP files that reported `ok` in this run (plan counts read from the files):
`j1_worker_registration_and_profile` (55), `j2_owner_can_create_and_manage_only_own_job_openings` (63),
`j3_unverified_owner_cannot_publish_job_openings` (42), `j3_unverified_owner_cannot_issue_shop_certifications` (29),
`j4_worker_can_browse_and_apply_without_duplicates` (90), `j5_application_status_transitions_are_validated` (73),
`j6_worker_cannot_complete_training_without_three_days_and_assessment` (40), `j6_worker_cannot_be_certified_without_three_days_and_assessment` (42),
`j7_required_initial_training_is_free_to_the_worker` (23), `j8_unauthorized_users_cannot_alter_training_evidence` (41),
`j8_unauthorized_users_cannot_alter_certification_records` (38), `j9_owner_can_customize_contract_draft_and_save_reusable_template_version` (36),
`j10_accepted_contract_contents_preserved_after_template_change` (27), `j11_material_contract_amendments_require_acceptance` (28),
`j12_worker_and_owner_cannot_access_other_parties_private_contracts` (28), `j13_three_distinct_qualifying_owner_relationships_counted` (12),
`j14_same_owner_contracts_and_amendments_count_once` (15), `j15_relationship_counting_policy_for_each_status` (27),
`j16_three_owner_rule_never_blocks_decline_or_termination` (19), `j17_database_constraints_and_authorization_prevent_unauthorized_access` (37),
`j18_existing_booking_pricing_verification_and_rating_workflows_still_work` (25). The older `j17_authorization_harness` (40) and
`j18_existing_flows` (64) also passed.

## Reproduced defect (F-C2 / F-C3): training owner can bypass the required-training booking gate

- Code. `supabase/migrations/2026_10_25_w6h_training_booking_assignment_gate.sql:28-33`: `roster_worker_in_required_training` only matches a roster row with `w.user_id is not null` that is linked to the enrolled worker. `supabase/migrations/2026_10_24_w2d_workers_link_and_roster_guard.sql:69,134`: the roster owner may set `workers.user_id` to null at any time, and no training check applies.
- Probe. The verifier ran the J18 roll-up fixture (`j18_..._still_work.test.sql` lines 1-119) followed by four statements, inside `begin ... rollback` on the local DB container. The probe file is `C:\Users\PC\AppData\Local\Temp\claude\C--Users-PC-WashLink\c42b187f-3a3e-4230-aac3-6489bb966596\scratchpad\probe_fc2.sql`, outside the repo. Output:

      probe_assign_linked_trainee=23514
      probe_owner_unlinks_trainee=succeeded
      probe_assign_after_unlink=succeeded
      probe_state=accepted,291e1848-...,rt=291e1848-...

  In plain terms: the gate refuses the owner (o1), the same owner unlinks the trainee's roster row, and the owner then assigns that row to a customer booking. The worker's required-training enrollment with that owner is still `accepted` (training unfinished).
- Worker-facing copy shown before enrolment. `frontend/src/presentation/utilities/trainingNoticeCopy.ts:36`: "Trainees cannot be assigned to customer bookings while their required training is unfinished." This is untrue for the training shop itself (above) and for super_admin (W13-L11).
- SPEC requirements broken: SPEC D free-training rule, "Do not introduce an unpaid labor arrangement disguised as training", "Clearly distinguish supervised training and competency assessment from productive work", and "Display this requirement clearly before a worker enrolls". The shop the gate is meant to restrain can get around it with an ordinary RLS-permitted update, and the platform tells the worker it cannot happen. This is why the verifier grades it BLOCKING, not non-blocking. Name-only roster rows (the other half of F-C2) cannot be fully prevented by the platform, but they make the absolute copy even less accurate.

## SPEC section K: Definition of Done

| K item | Grade | Evidence (verified by this run) |
|---|---|---|
| K1 complete role-aware frontend flows | SATISFIED (evidence limited) | `frontend/src/App.tsx:99-119` routes `super_admin` / `owner` / `worker` (customer by default). Owner tabs `presentation/components/owner/ownerDashboardTabs.ts`: bookings, workforce, shops, team, jobs, training, certifications, contract templates, worker contracts, verification. Worker tabs `features/worker/workerWorkspaceView.ts`: overview, find_work, applications, training, certifications, contracts, training_i_run, plus onboarding / loading / error views. Admin `features/superAdmin/SuperAdminDashboardPage.tsx`. lint 0, build 0, Vitest 299/299. Static cross-check by the verifier: all 15 literal `.rpc(...)` names and all 115 `p_*` argument names used in `frontend/src/infrastructure` exist in the migrations. The RPC surface the UI calls is exercised by the 452 smoke checks. Limitation: there is no browser E2E and no UI run against a real stack (stated in `ACCEPTANCE_TESTS.md`). |
| K2 persistent data, validated lifecycle transitions | SATISFIED | `j2_job_opening_lifecycle`:6 plan(48), `j5_application_status_transitions_are_validated`:6 plan(73), `j6_w6_training_program_and_enrollment_lifecycle`:7 plan(53), `j6_w7_certification_lifecycle`:7 plan(68), `j9_w9_worker_contract_rules`:8 plan(52), `j15_relationship_counting_policy_for_each_status`:9 plan(27); all `ok` |
| K3 migrations and authorization policies | SATISFIED | 89 new migrations, no edit to main's 5; clean replay of 96 (check 6); `001_migration_replay`:7 plan(27) with `replay_schema_migrations_has_baseline_w2_to_w14_w12_and_w13` (line 88) and `replay_w13_audit_table_has_no_client_select_policy` (line 243); J17 roll-up plan(37) `ok`. Rollback is documented (`ROLLBACK_GUIDE.md`, `-- ROLLBACK` blocks) but no block has ever been executed. This is disclosed in `LIMITATIONS.md:34`, and SPEC G asks only for a documented strategy. |
| K4 job-opening and application workflows | SATISFIED | `j2_owner_can_create_and_manage_only_own_job_openings` plan(63), `j3_unverified_owner_cannot_publish_job_openings` plan(42), `j4_worker_can_browse_and_apply_without_duplicates` plan(90), `j5_...` plan(73), `j2_w13_moderation_queue_paging`; smokes w4 43, w5 39, w14 33, w13 17, all 0 failed |
| K5 training records with a minimum three-day requirement | SATISFIED | `j6_worker_cannot_complete_training_without_three_days_and_assessment`: `j6_calendar_time_alone_does_not_complete` (line 44), `j6_min_training_days_cannot_be_below_three` (line 134); `j7_required_initial_training_is_free_to_the_worker`: `j7_worker_fee_check_forces_zero_for_required_initial` (line 44); `TrainingInvitationDetail.j7.test.tsx:23`; w6 smoke 40/0. The K5 wording (records plus the 3-day minimum) is met. The related free-training booking gate is defective (F-C2) and is graded under criterion 4 and K10. |
| K6 evidence-based certification issuance | SATISFIED | `j6_worker_cannot_be_certified_without_three_days_and_assessment`: `j6_no_certification_for_enrollment_only` (38), `j6_certification_records_approver_assessor_enrollment_and_time` (84), `j6_issuer_kind_is_shop_issued_only` (157); `j8_unauthorized_users_cannot_alter_certification_records` plan(38); `j3_unverified_owner_cannot_issue_shop_certifications` plan(29); w7 smoke 38/0 |
| K7 editable, versioned templates and contract records | SATISFIED | `j9_..._save_reusable_template_version` plan(36), `j10_accepted_contract_contents_preserved_after_template_change` plan(27), `j11_material_contract_amendments_require_acceptance` plan(28), `j12_worker_and_owner_cannot_access_other_parties_private_contracts` plan(28); w8 30/0, w9 34/0. F-C1 (super_admin can change core safeguard text) is not a SPEC E breach (SPEC E forbids owners), but it is undocumented (see K10). |
| K8 correct distinct-owner counting | SATISFIED | `j13_three_distinct_qualifying_owner_relationships_counted` plan(12) incl. `j13_unverified_owner_shop_not_counted` (53), `j13_policy_minimum_read_from_workforce_policies_default_three` (72); `j13_w10_workforce_policy_rules` plan(20); `j14_same_owner_contracts_and_amendments_count_once` plan(15); `j15_...` plan(27); `j16_three_owner_rule_never_blocks_decline_or_termination` plan(19); w10 smoke 39/0 |
| K9 tests for access control, business rules, regressions | SATISFIED | This run: pgTAP 105 files / 3198 tests PASS; J17 roll-up plan(37) and `j17_authorization_harness` plan(40) `ok`; J18 roll-up plan(25) and `j18_existing_flows` plan(64) `ok`; pytest 4 passed; Vitest 299/299; 13 smokes 0 failed. Gap: no test covers the owner-unlink path of the training gate (that is how F-C2 got through). |
| K10 documented limitations and outstanding legal review | **NOT SATISFIED** | The files exist (`LIMITATIONS.md`, register with 164 OPEN items, `DEPLOYMENT_READINESS.md` with 32 unticked gates). They are incomplete and in one place wrong. (a) `LIMITATIONS.md:46-50` says the DB "blocks the training owner's customer bookings for a trainee in required training" and that "Three gaps remain". The owner-unlink and name-only roster bypass (F-C2) is missing, and the verifier showed the statement is false. (b) F-C1 (super_admin can edit the text of the 15 locked core safeguard clauses), F-C7 (no interview feature, against SPEC I "interview ... scheduling"; training-schedule notices do exist, category `training_schedule`) and F-S2 (shop delete cascades published openings and not-accepted applications) are not in `LIMITATIONS.md` (grep found no match). (c) `FINAL_REVIEW.md` "Proposed legal-review items (not yet in the register)" lists 3 items that were never added. LOOP.md says the loop records legal items in the register. (d) W6-L12 cites copy that has since been removed (F-C3). |
| K closing line: no deploy or shared-DB apply without authorization | SATISFIED | No upstream, no remote commands, all readiness gates unticked (repository checks above). The SPEC asks the loop to document the human gates, not to complete them. `DEPLOYMENT_READINESS.md:74,82,85` (labor-law review), `:111` (deploy approval). |

## Failing items: proposed new increments

**W15: close the required-training booking-gate bypass (blocking, SPEC D)**
1. Stop the training owner from assigning a trainee in required training through the unlink path. For example, refuse `workers.user_id` -> null by the roster owner (and by the worker's own `unlink_my_roster_entry`, if the same risk applies) while the linked user holds a live required enrollment (`accepted`, progress scheduled / in_progress / awaiting_assessment) with that owner. Alternatively, key the w6h gate on the enrollment and its roster history rather than on the current link. The fix must be a new migration; do not edit w2d or w6h.
2. Add a pgTAP test that replays the verifier probe (owner unlinks the linked trainee, then assigns) and expects a refusal, and add the same check to the J18 roll-up or a new `j18_w15_*` file.
3. Make `trainingNoticeCopy.ts:36` accurate. State what the platform actually enforces (the training shop, linked accounts) and do not promise anything absolute. Update the Vitest that pins it.
4. Add a register item for the gate's limits (name-only roster rows cannot be detected, super_admin per W13-L11), and update W6-L12 to cite the current copy.

**W16: complete limitations and the legal register (K10)**
1. `LIMITATIONS.md`: correct the free-training paragraph (lines 46-50) and add F-C2 (whatever remains after W15: name-only rows), F-C1, F-C7 (no interview scheduling feature or notices, D-69) and F-S2 (shop deletion cascade, plus a decision on a guard or soft-deactivation).
2. `LEGAL_REVIEW_REGISTER.md`: add the 3 proposed items from FINAL_REVIEW (F-C1, F-C2, F-C3) plus any W15 item, all OPEN, and update the totals and status summary.
3. Docs nits: `DEPLOYMENT_READINESS.md` trigger-order gate should also cover bookings (`bookings_guard_update_training_gate` after `bookings_guard_update`) and profiles (F-S4); `ACCEPTANCE_TESTS.md` K9 restates Vitest numbers despite saying it does not (F-C4).
4. Orchestrator: record the final-suite output in `STATE.md` "Final verification" (LOOP.md criterion 2).

Optional and not failing: F-S1 (pin the authenticated-executable function list in J17), F-S3 (revoke default anon grants on pre-workforce tables after the D-10 diff), F-S5 (allow-list for trusted sessions), F-S6 (two-session lock-order test), F-C5 (pre-existing landing copy), F-C6 (mandatory termination reason, which goes to legal review).

After W15 and W16, run the whole-branch security and compliance review and this final verification again.

## Remaining human steps (not loop work; from DEPLOYMENT_READINESS.md and DECISIONS.md)

1. Philippine labor-law review, and data-privacy review (RA 10173), of all register items (164 now, more after W15/W16), and of `LIMITATIONS.md`; fill in the sign-off table.
2. D-10: a schema-only dump of production, taken by a human, diffed against a clean local reset of the 96 staged migrations. This covers trigger name order, Realtime publications, grants, audit read policies, replaced function bodies and the preflights.
3. Decide how the `YYYY_MM_DD_*` migration files are versioned or renamed before any `db push` (D-11).
4. Register the scheduled jobs (pg_cron) in production (D-63); they are not registered anywhere.
5. Decide retention periods (W3-L1, W12-L6, W13-L5).
6. Approve push and merge of `feature/workforce` to `main`. Approve and perform the database apply and the frontend deploy. None of these was done by the loop.
