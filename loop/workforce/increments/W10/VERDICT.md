# W10 - Owner relationships & three-distinct-owner policy - VERDICT

**Overall: PASS** (independent verifier, 2026-10-28; uncommitted tree on `feature/workforce`, HEAD e43c2db, after fix cycle 1)

Graded against PLAN.md section 8 (AC1..AC13) and the section-6 test names. LOG.md, TEST_RESULTS.md and REVIEW.md were
read only to see what was claimed. Every number below comes from the verifier's own re-run.

## Check suite (re-run by the verifier; at the start Docker was up and no supabase containers were running)

| Check | Exit | Actual output |
|---|---|---|
| `cd frontend && npm run lint` | 0 | `eslint .`, no problems |
| `cd frontend && npm run build` | 0 | `tsc -b && vite build`, `built in 585ms`; lazy chunk `WorkforcePolicyPanel-*.js` 6.58 kB |
| `cd frontend && npm test` (`vitest run`, verbose) | 0 | `Test Files 107 passed (107)`, `Tests 209 passed (209)` (97 / 191 before W10; 10 new files, 18 new tests; 0 existing test files modified) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | `4 passed, 1 warning` |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` (from a stopped stack, clean replay) | 0 | 69 staged migrations, each applied at start and again at `db reset` (138 `Applying migration` lines; w10a..g = 20261028000001..07 in a..g order); `All tests successful.` `Files=72, Tests=2356`, `Result: PASS`; 72/72 files `ok`, 0 `not ok` |
| w2 / w3 / w4 / w5 / w6 / w7 / w8 / w9 / w10 smokes (same stack, in order) | 0 each | 48 / 33 / 43 / 39 / 40 / 38 / 30 / 34 / 39 passed, 0 failed each |
| `npx supabase stop --workdir .local-supabase-test --no-backup` | 0 | "Stopped supabase local development setup." (project `washlink-local-test`); 0 supabase containers after |

## Acceptance criteria

All 85 pgTAP test names from PLAN section 6 (plus the 9 file names) were found by `grep -F` in `supabase/tests/database`.
All 15 section-6 Vitest names and the 3 fix-cycle names (`w10_suspended_label_is_counting_neutral_for_worker_and_owner`,
`w10_since_date_hidden_when_status_changed_at_is_null`, `w10_goal_source_grammar_for_minimum_one`) show as passed in the
verbose run. Plans of the new files: j13-counted 12, j13 audit/sync 22, j13 policy 20, j14 15, j15 counting 27,
j15 repairs 19, j16 19, j17 26, j18 17; `001_migration_replay` 23. `todo_start(` count is 0 in every one of the 72 files.

| AC | Result | Evidence |
|---|---|---|
| AC1 | PASS | 7 files `2026_10_28_w10[a-g]_<snake>.sql`; `grep -L -- "-- ROLLBACK"` returns nothing (ROLLBACK at line 73/75, 89/152, 196/204, 168/174, 256/265, 77/79, 83/87); `git diff --name-status e43c2db -- supabase/migrations` is empty (no M or D); all 7 files untracked (new) |
| AC2 | PASS | 69 migrations replayed, `Result: PASS`; `001_migration_replay.test.sql` (plan 23, `ok`) contains `replay_schema_migrations_has_baseline_w2_to_w10` (line 81) and `replay_w10_relationship_and_policy_tables_rls_enabled` (line 215); 0 files contain `todo_start(` |
| AC3 | PASS | all 9 `j13_*` names in `j13_three_distinct_qualifying_owner_relationships_counted` (`ok`); Vitest j13_progress_card_shows_count_and_remaining_from_policy, j13_remaining_never_negative_and_goal_reached_copy pass; smoke `worker_progress_zero_remaining_three`, `one_active_contract_counts_one`, `three_active_owners_count_three_remaining_zero` ok |
| AC4 | PASS | all 7 `j14_*` names in `j14_same_owner_contracts_and_amendments_count_once` (`ok`); Vitest j14_relationship_list_one_row_per_owner_with_contract_count passes; smoke `second_shop_same_owner_still_three_and_two_contracts`, `accepted_amendment_keeps_count_three` ok |
| AC5 | PASS | all 18 `j15_*` names in `j15_relationship_counting_policy_for_each_status` (`ok`), incl. `j15_stored_status_matches_live_after_each_transition`; Vitest j15_status_labels_and_counting_explanations_match_d3, j15_suspended_relationship_explains_verification_not_current pass; smoke `shop_verification_lapse_suspends_owner_b_count_two`, `verification_restored_owner_b_counts_again` ok |
| AC6 | PASS | all 11 `j16_*` names in the J16 file (`ok`); Vitest j16_progress_copy_is_informational_and_never_an_obligation, j16_decline_and_end_actions_unaffected_by_progress, j16_terminate_and_decline_modals_show_no_owner_goal_text pass; smoke `super_admin_raises_minimum_remaining_two`, `worker_terminates_below_minimum_succeeds_count_two`, `worker_declines_offer_below_minimum_no_relationship_row` ok (minimum 5); `git diff e43c2db` on TerminateContractModal.tsx, DeclineContractModal.tsx, AcceptContractModal.tsx, WorkerContractReview.tsx = 0 lines |
| AC7 | PASS | all 6 `w10_trusted_repair_*` / `w10_w9_guard_*` names in `j15_w10_trusted_contract_repair_rules` (`ok`); every W9 pgTAP file `ok`. Verifier `diff` of the `worker_contracts_guard_write` body (w9c 59 lines vs w10b 67 lines): the only difference is the 8-line forward-only block inserted after w9c body line 31 (w10b:44-51 in the file) |
| AC8 | PASS | all 10 `w10_policy_*` / `w10_super_admin_*` / `w10_trusted_session_*` names in `j13_w10_workforce_policy_rules` (`ok`); smoke `policy_seeded_minimum_three_informational`, `set_workforce_policy_value_denied_for_non_admins`, `policy_change_audited_without_reason_text`, `only_super_admin_selects_workforce_policies` ok; Vitest w10_policy_panel_validates_range_and_reason_and_maps_errors passes. Fix S1/C3 in code: w10c:103-104 `wp_select_super_admin`, using `auth.uid() is not null and public.is_super_admin()` |
| AC9 | PASS | all 7 planned names in `j13_w10_relationship_audit_and_sync` (`ok`, plan 22, incl. fix-cycle `w10_stale_since_date_is_null`), incl. `w10_no_notifications_for_relationship_changes` and `w10_unchanged_refresh_writes_no_audit` |
| AC10 | PASS | all 10 `j17_w10_*` names in `j17_w10_owner_relationship_authorization` (`ok`, plan 26, incl. the S6 service_role privilege assertion); Vitest j17_owner_relationship_repository_reads_only_through_rpcs, j17_workforce_policy_repository_writes_only_through_rpc, w10_owner_relationship_view_hides_worker_progress_and_other_owners pass; w10 smoke 39 passed / 0 failed (`owner_sees_only_own_relationship_no_count_no_other_owners`; other worker, owner D, super_admin, customer and anon read none); w2..w9 smokes 0 failed. Fix C2 in code: w10d:133-135 select policy is `wor_select_own_worker` (worker only); fix C4: w10f:39 and :55 `status_changed_at` null when the live status differs |
| AC11 | PASS | all 5 `j18_w10_*` names in `j18_w10_flows` (`ok`); all 62 pre-W10 pgTAP files `ok` (72 ok in total); `git diff --stat e43c2db -- supabase/tests/database` = only `001_migration_replay.test.sql` (14+, 6-), the other 9 files are new; pytest 4 passed; stager 19 pass |
| AC12 | PASS | all 15 section-6 Vitest names plus the existing 191 pass (209 in total, with the 3 fix-cycle tests); lint and build exit 0; `grep -rn "service_role" frontend/src` = 0 lines |
| AC13 | PASS (see note) | longest added or changed deliverable file is 350 lines (`stage-local-workdir.test.mjs`, `AUDIT_AND_NOTIFICATIONS.md`), then 348 (`w10-api-smoke.mjs`), 347 (`stage-local-workdir.mjs`), 333 (`LOCAL_TEST_HARNESS.md`), 326 (`OwnerDashboardContent.tsx`); migrations max 265 (w10e); `git diff --stat e43c2db -- backend` empty and no untracked backend file; `docs/workforce/OWNER_RELATIONSHIPS.md` exists (280 lines) and WORKER_CONTRACTS, AUDIT_AND_NOTIFICATIONS, ROLE_AND_PROFILE_SECURITY, LOCAL_TEST_HARNESS, LEGAL_REVIEW_REGISTER are modified with W10 content; `grep -c "W10-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` = 11, rows W10-L1..W10-L8 present. Note: the loop artifact `loop/workforce/increments/W10/PLAN.md` itself is 357 lines. The verifier treats it as a process input, not part of the increment deliverable that LOOP rule 9 (about 350) governs. If the orchestrator applies the size rule to plan files too, this is the only item over the limit |

## Safety
- No committed migration was edited: only untracked (new) files under `supabase/migrations`; the diff against e43c2db is empty.
- No `.env*` change: `.env` and `frontend/.env` are git-ignored, their mtimes (2026-10-23, 2026-10-21) are older than HEAD
  (2026-10-27), and no `.env` path appears in the diff or untracked list. The verifier did not read either file.
- No remote DB commands. No `db push`, `--linked`, `--db-url`, `supabase.co`, `project-ref` or JWT literal appears in the W10
  migrations, the helper, the 9 pgTAP files, the w10 smoke, or the added lines of the stager diff. The w10 smoke reads keys from
  `npx supabase status -o env --workdir .local-supabase-test` into memory and refuses a non-loopback API URL (lines 29, 44-45).
- Changed infrastructure: the stager adds `test_helpers_owner_relationships.sql` as the 5th `HELPERS_SOURCE_NAMES` entry
  (plus comments). Its test is updated to match and still has 19 tests.
- Booking regression: `j18_w10_booking_quote_rating_and_verification_unchanged` (`ok`), `j18_existing_flows`,
  `j17_w2_shop_booking_guards` and every earlier J18 file are `ok`. The w2..w9 smokes are green.
- REVIEW.md lists no BLOCKING findings. The fix-cycle 1 items were checked in code and tests: S1/C3 (w10c:103-104),
  C2 (w10d:133-135, smoke owner direct read 0 rows), C4 (w10f:39/55, `w10_stale_since_date_is_null`), S5 (w10d header wording),
  S6 (j17 service_role privilege assertions), C1/C7 (`ownerRelationshipFixCycle.w10.test.tsx`, 3 tests pass).

## Non-blocking observations (carried forward, not grounds for FAIL)
- RECORD items still open in the tree: D-36..D-41 are not yet in `loop/workforce/DECISIONS.md` (REVIEW C5/C6), and
  W10-L9..L11 are in `LEGAL_FLAGS.md` but not yet in `docs/workforce/LEGAL_REVIEW_REGISTER.md` (count 0 there).
- S2/S3 (bulk refresh lock scope, future `p_as_of`) and C8 go to W12. S4 (audit volume from `is_active` toggles) goes to W13.
  S7 is accepted as is.
- PLAN R4: no concurrency test for advisory-lock ordering (design review only).
