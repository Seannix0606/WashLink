# W11 - Role-aware dashboards, WashLink certification review, contract disputes - VERDICT

**Overall: PASS** (independent verifier, 2026-10-29; uncommitted tree on `feature/workforce`, HEAD 6ce3f61, after fix cycle 1)

Graded against PLAN.md section 8 (AC1..AC14) and the section-6 test names; W14 items (banner split) are out of scope.
LOG.md, TEST_RESULTS.md and REVIEW.md were read only to see what was claimed. Every number below comes from the verifier's own re-run.

## Check suite (re-run by the verifier; at the start Docker was up and no supabase containers were running)

| Check | Exit | Actual output |
|---|---|---|
| `cd frontend && npm run lint` | 0 | `eslint .`, no problems |
| `cd frontend && npm run build` | 0 | `tsc -b && vite build`, `built in 586ms` |
| `cd frontend && npm test` (`vitest run`; also run with `--reporter=verbose`) | 0 | `Test Files 118 passed (118)`, `Tests 233 passed (233)` (209 existing + 19 section-6 + 5 fix-cycle; 0 existing test files modified) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | `4 passed, 1 warning` |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` (from a stopped stack, clean replay) | 0 | 78 staged migrations (76 repo + 2 local-test baseline files), each applied at start and again at `db reset` (156 `Applying migration` lines; w11a..i = 20261029000001..09 in a..i order); `All tests successful.` `Files=82, Tests=2622`, `Result: PASS`; 82/82 files `ok`, 0 `not ok` |
| w2 / w3 / w4 / w5 / w6 / w7 / w8 / w9 / w10 / w11 smokes (same stack, in order) | 0 each | 48 / 33 / 43 / 39 / 40 / 38 / 30 / 34 / 39 / 36 passed, 0 failed each |
| `npx supabase stop --workdir . --no-backup` (run inside `.local-supabase-test`) | 0 | "Stopped supabase local development setup." (project `washlink-local-test`); 0 supabase containers after |

## Acceptance criteria

All 75 pgTAP test names from PLAN section 6 (plus the 2 replay names) were found by `grep -F` in their planned files.
Plans of the new files: j8 rules 51, j8 holds 18, j12 access 31, j12 rules 42, j16 14, j17 summaries 24, j17 authorization 25,
j6 12, j18 16, fix-cycle `j8_w11_fix1_review_mask_resuspend_cap` 32 (sum 265); `001_migration_replay` 24. 2356 + 265 + 1 = 2622.
`todo_start(` count is 0 in every one of the 82 files. All 19 section-6 Vitest names show as passed in the verbose run.

| AC | Result | Evidence |
|---|---|---|
| AC1 | PASS | 9 files `2026_10_29_w11[a-i]_<snake>.sql`; `grep -L -- "-- ROLLBACK"` returns nothing (ROLLBACK line / file length: a 79/81, b 299/318, c 272/279, d 153/158, e 171/176, f 209/214, g 167/172, h 161/165, i 179/185); `git diff --name-status 6ce3f61 -- supabase/migrations` is empty (no M or D); all 9 files untracked (new) |
| AC2 | PASS | 78 migrations replayed, `Result: PASS`; `001_migration_replay.test.sql` (plan 24, `ok`) contains `replay_schema_migrations_has_baseline_w2_to_w11` and `replay_w11_review_and_dispute_tables_rls_enabled`; 0 files contain `todo_start(` |
| AC3 | PASS | all 20 names in `j8_w11_certification_platform_review_rules` (`ok`, plan 51); Vitest `j8_w11_ask_washlink_review_only_when_eligible`, `j8_w11_review_modal_validates_statement_and_maps_errors`, `j8_w11_owner_sees_washlink_review_status_and_reason` pass; smoke `review_refused_for_active_certificate`, `review_refused_before_shop_decides_and_can_open_false`, `overdue_shop_request_allows_escalation_and_withdraws_it`, `second_open_review_refused_23505`, `only_super_admin_decides_reviews`, `super_admin_upholds_certificate_unchanged_and_second_escalation_refused`, `owner_removed_issuer_unavailable_escalation_then_reinstate` ok |
| AC4 | PASS | all 5 names in `j8_w11_certification_platform_review_holds` (`ok`, incl. `w11_no_w7_function_body_replaced`); every W7 pgTAP file `ok` (j6_w7 lifecycle / audit, j17_w7, j18_w7, j19_w7, j4_w7 among them); smoke `revoke_and_shop_request_held_while_review_open` ok |
| AC5 | PASS | all 8 `j12_w11_*` names in `j12_w11_contract_dispute_access` (`ok`, plan 31); Vitest `j12_w11_dispute_categories_follow_contract_end`, `j12_w11_party_dispute_list_respond_withdraw`, `w11_admin_dispute_case_shows_contract_only_while_open` pass; smoke `admin_case_while_open_has_contract_block_and_is_audited`, `closed_dispute_case_has_no_contract_block_and_no_document`, `only_the_two_parties_see_the_dispute_and_no_admin_ids` ok |
| AC6 | PASS | all 12 names in `j12_w11_contract_dispute_rules` (`ok`, plan 42), incl. `w11_worker_disputes_owner_termination`; smoke `worker_reports_owner_termination_with_rules`, `other_party_responds_once_only` ok |
| AC7 | PASS | all 4 `j16_w11_*` names (`ok`, plan 14); Vitest `j16_w11_dispute_copy_says_washlink_cannot_change_contract` passes; smoke `open_dispute_does_not_block_terminate_and_raiser_withdraws`, `open_dispute_does_not_block_decline_and_unsent_draft_cannot_be_reported`, `close_needs_admin_revision_and_kind_and_leaves_contract_unchanged` ok; `git diff --stat 6ce3f61` on TerminateContractModal.tsx, DeclineContractModal.tsx, AcceptContractModal.tsx, WorkerContractReview.tsx, RequestCertificationReviewModal.tsx (all 5 tracked) = empty |
| AC8 | PASS | all 7 names in `j17_w11_dashboard_summaries` (`ok`, plan 24); smoke `summaries_one_row_for_right_role_only`, `summary_columns_are_counts_flags_and_dates_only` ok; Vitest `w11_worker_overview_counts_render_from_summary` passes |
| AC9 | PASS | Vitest `w11_worker_overview_orders_next_actions_by_priority`, `w11_worker_default_tab_overview_unless_roster_linked`, `w11_owner_next_actions_strip_hidden_when_empty`, `w11_owner_next_action_switches_tab`, `w11_owner_bookings_stays_default_tab`, `w11_super_admin_console_tabs_and_default_overview`, `w11_dashboard_loading_empty_error_states`, `w11_latest_openings_never_says_recommended` all pass. Owner-facing wording: `ownerCountGroups` (`workforceDashboardDisplay.ts:50-92`) labels the count "Relationships needing attention" (:86); copy `workforceDashboardCopy.ts:34` "... need attention"; `grep -rniE "suspended relationship|relationships? suspended"` over non-test frontend/src = 0; no "suspend" in `owner/dashboard/*`, `OwnerDashboardTabPanels.tsx`, `ownerDashboardTabs.ts`, `OwnerDashboardContent.tsx` (remaining "Suspended" hits are the worker certificate count, the admin stranded-suspension help text, and the pre-existing W7 certificate status filter) |
| AC10 | PASS | all 8 `j17_w11_*` names in `j17_w11_oversight_authorization` (`ok`, plan 25, plus fix `j17_w11_super_admin_has_no_raw_select`); w11 smoke 36 passed / 0 failed (incl. both `direct_writes_denied_*`, `super_admin_has_no_raw_select_on_w11_tables`, `basis_function_and_set_config_not_callable`, `anon_cannot_call_w11_rpcs`); w2..w10 smokes 0 failed |
| AC11 | PASS | all 5 names in `j6_w11_oversight_audit_and_notifications` (`ok`, plan 12); smoke `relationship_block_has_no_count_and_audit_payload_no_statement`, `oversight_notifications_have_no_statement_text` ok |
| AC12 | PASS | all 4 `j18_w11_*` names in `j18_w11_flows` (`ok`, plan 16); all 72 pre-W11 pgTAP files `ok`; `git diff --stat 6ce3f61 -- supabase/tests/database` = only `001_migration_replay.test.sql` (15+, 6-), the other 10 W11 files are new; pytest 4 passed; stager 19 pass |
| AC13 | PASS | all 19 section-6 Vitest names plus the existing 209 pass (233 in total with the 5 fix-cycle tests); lint and build exit 0; `grep -rn "service_role" frontend/src` = 0 lines |
| AC14 | PASS | longest added or changed file is 350 lines (`w11-api-smoke.mjs`, `AUDIT_AND_NOTIFICATIONS.md`), then 349 (`stage-local-workdir.test.mjs`, `LOCAL_TEST_HARNESS.md`), 348 (`stage-local-workdir.mjs`), 337 (`DASHBOARDS_AND_OVERSIGHT.md`), 318 (w11b), 317 (`oversightFixtures.ts`); no file over 350, loop files included (W11 PLAN.md 333); `git diff --stat 6ce3f61 -- backend` empty, no untracked backend file; `docs/workforce/DASHBOARDS_AND_OVERSIGHT.md` exists, and CERTIFICATIONS, WORKER_CONTRACTS, OWNER_RELATIONSHIPS, AUDIT_AND_NOTIFICATIONS, ROLE_AND_PROFILE_SECURITY, LOCAL_TEST_HARNESS, LEGAL_REVIEW_REGISTER are modified with W11 content; `grep -c "W11-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` = 14, rows W11-L1..W11-L10 present; no `.env` read (see Safety) |

## Safety
- No committed migration was edited: only untracked (new) files under `supabase/migrations`; the diff against 6ce3f61 is empty.
- No `.env*` change: `.env` and `frontend/.env` are git-ignored, their mtimes (2026-10-23, 2026-10-21) are older than HEAD
  (2026-10-28), and no `.env` path appears in the diff or untracked list. The verifier did not read either file.
- No remote DB commands. `--linked`, `--db-url`, `db push` and `project-ref` appear only in refusal guards and comments
  (run-db-tests.mjs, stage-local-workdir.mjs), never as commands in the W11 migrations, the helper, the W11 pgTAP files or the
  w11 smoke (whose header states loopback-only, no `.env`). The verifier ran the supabase CLI only inside `.local-supabase-test`.
- Changed infrastructure: the stager adds `test_helpers_oversight.sql` as the 6th helper; its test still has 19 tests.
- Booking regression: `j18_w11_booking_quote_rating_and_verification_unchanged` (`ok`), `j18_existing_flows` and every earlier J18
  file `ok`; the w2..w10 smokes are green.
- REVIEW.md lists no BLOCKING findings. Fix cycle 1 checked in code and tests:
  N1 w11b:209-235 `certifications_zz_platform_review_mask` / `certification_status_events_zz_platform_review_mask`
  (`w11_fix1_admin_id_masked_in_owner_raw_rows`, `w11_fix1_decider_kept_in_review_and_audit`, `w11_fix1_owner_change_not_masked`);
  N2 w11b:43 CHECK and w11c:67 basis `resuspended_after_shop_resolution` (`w11_fix1_resuspend_after_shop_resolution_is_eligible`,
  `w11_fix1_resuspend_after_30_days_not_eligible`); N3 w11b:268-271 and w11e:143-146 drop the admin select policies and add a deny-all
  `using (false)` select (`j17_w11_super_admin_has_no_raw_select`, smoke `super_admin_has_no_raw_select_on_w11_tables`);
  N4 w11g:53-55 `case when d.status = 'open'` (`w11_fix1_closed_dispute_queue_hides_contract`, smoke
  `closed_dispute_queue_row_hides_contract_fields`); N5 w11c:99-100 / 137-138 cap of 3 per event (`w11_fix1_review_cap_three_per_event`;
  message mapped at `supabaseOversightErrorMessages.ts:13`); N8 w11b:29 `on delete set null`
  (`w11_fix1_escalated_request_removed_sets_link_null`); C4 w11h:141 blocker not in (open, decided)
  (`w11_fix1_stranded_count_skips_decided`); C5 w11h:40 / 66 `worker_holds_current_certification`
  (`w11_fix1_worker_open_openings_only_applicable`) and label `workforceDashboardDisplay.ts:17` "Openings you can apply to";
  C1 0 hits for "does not work for the shop" in frontend/src; C2 `platformReviewCopy.ts:26`, `contractDisputeCopy.ts:17 / 29 / 35`;
  C3 `contractDisputeCopy.ts:20` "This is a WashLink limit only". `oversightCopy.w11fix.test.ts` (5 tests) passes.

## Non-blocking observations (carried forward, not grounds for FAIL)
- RECORD items still open in the tree: D-42..D-49 are not yet in `loop/workforce/DECISIONS.md` (count 0); W11-L11..L15 are in
  `LEGAL_FLAGS.md` but not yet in `docs/workforce/LEGAL_REVIEW_REGISTER.md` (count 0 there); LOOP.md has no W11 smoke row yet
  (W14 is already in STATE.md as `pending`).
- N6 (admin contract access lasts while a dispute is open) goes to W14 / W11-L5, L10; N7 (StrictMode double-audited case read in dev) accepted.
- Not exercised: concurrent opens / raises in parallel sessions (partial unique indexes and an advisory lock; design review only); the N2
  30-day window across real days (pgTAP uses a TEST-ONLY `closed_at` shift); the smoke does not exercise the `upheld_by_shop` basis (pgTAP does).
- The stop command was run as `npx supabase stop --workdir . --no-backup` from inside `.local-supabase-test` (same target as
  `--workdir .local-supabase-test`, without invoking the CLI from the repo root).
