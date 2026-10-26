# W9 - Worker contracts, acceptance, snapshots, amendments - VERDICT

**Overall: PASS** (independent verifier, 2026-10-27; uncommitted tree on `feature/workforce`, HEAD 81be37d)

Graded against PLAN.md section 8 (AC1..AC15) and the section-6 test names. LOG.md, TEST_RESULTS.md and REVIEW.md were
read only to see what was claimed. Every number below comes from the verifier's own re-run.

## Check suite (re-run by the verifier; at the start no supabase containers were running and Docker was up)

| Check | Exit | Actual output |
|---|---|---|
| `cd frontend && npm run lint` | 0 | `eslint .`, no problems |
| `cd frontend && npm run build` | 0 | `tsc -b && vite build`, `built in 490ms` |
| `cd frontend && npm test` (`vitest run`) | 0 | `Test Files 97 passed (97)`, `Tests 191 passed (191)` (89 files / 174 before W9; 8 new files, 17 new tests; 0 existing test files modified) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | `4 passed, 1 warning` |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` (from a stopped stack, clean replay) | 0 | 62 staged migrations, each applied at start and again at `db reset` (w9a..j = 20261026000017..26 in a..j order); `All tests successful.` `Files=63, Tests=2178`, `Result: PASS`; 63/63 files `ok`, 0 `not ok` |
| w2 / w3 / w4 / w5 / w6 / w7 / w8 / w9 smokes (same stack, in order) | 0 each | 48 / 33 / 43 / 39 / 40 / 38 / 30 / 34 passed, 0 failed each |
| `npx supabase stop --workdir .local-supabase-test --no-backup` | 0 | "Stopped supabase local development setup." (project `washlink-local-test`); 0 supabase containers after |

## Acceptance criteria

All 98 test names from PLAN section 6 (82 pgTAP, 16 Vitest) were found by `grep -F` in `supabase/tests/database` and
`frontend/src`. All 16 Vitest names show as passed in the verbose run. Every W9 pgTAP file is `ok` in the runner.
Planned counts: j9-draft 30, flags 15, audit 12, rules 52, j10 27, j11 28, j12 28, j17 16, j18 22.

| AC | Result | Evidence |
|---|---|---|
| AC1 | PASS | 10 files `2026_10_26_w9[a-j]_<snake>.sql`; `grep -L -- "-- ROLLBACK"` returns nothing; `git diff --name-status 81be37d -- supabase/migrations` is empty (no M or D); all 10 files untracked (new) |
| AC2 | PASS | 62 migrations replayed, `Result: PASS`; `001_migration_replay.test.sql` (plan 22, `ok`) contains `replay_schema_migrations_has_baseline_w2_to_w9` (lists ..17..26) and `replay_w9_worker_contract_tables_rls_enabled` (8 tables); files containing `todo_start(` = 0 |
| AC3 | PASS | all 11 `j9_*` names present in `j9_w9_owner_customizes_worker_contract_draft` (`ok`); Vitest j9_contract_draft_editor_edits_only_editable_bodies_and_shop_terms, j9_classification_choice_has_no_preselection_and_contractor_last_with_extra_acknowledgement, j9_send_modal_requires_flag_acknowledgement pass |
| AC4 | PASS | all 8 `j10_*` names present in the J10 file (`ok`); Vitest j10_document_view_shows_stored_text_hash_and_not_e_signature_label, j10_download_text_uses_stored_rendered_text_verbatim pass; smoke `template_save_and_platform_publish_leave_document_unchanged` ok |
| AC5 | PASS | all 12 `j11_*` names present in the J11 file (`ok`); Vitest j11_amendment_review_shows_changes_and_current_terms_stay_copy, j11_worker_can_decline_amendment pass; smoke `amendment_declined_current_unchanged`, `second_amendment_accepted_old_superseded` ok |
| AC6 | PASS | all 9 `j12_*` names present in the J12 file (`ok`); Vitest j12_contract_views_hide_other_role_actions pass; smoke `other_owner_reads_nothing`, `other_worker_reads_nothing`, `super_admin_reads_nothing`, `worker_sees_nothing_before_send` ok |
| AC7 | PASS | the 5 named tests are present in passing files. Code: w9d:172 and w9d:180, the `record_label` CHECK on the fixed "not an e-signature" label, forced at w9d:285; w9c:88 `classification_key` NOT NULL with no default; w9f:88-90 and w9f:70, `p_classification_key` has no default and null is refused. Spot-check: in the rules test (lines 100-108), a superuser holding the owner's JWT and the write flag cannot insert the worker's acceptance (42501), and the count stays 1 |
| AC8 | PASS | `w9_worker_can_always_decline_even_if_shop_unverified_or_removed`, `w9_worker_can_always_terminate_with_reason`, `w9_activation_blocked_during_live_required_training` are in the rules file (`ok`); Vitest `w9_worker_decline_and_terminate_always_available` passes. Code: w9g:238-268 `terminate_worker_contract` has no verification, notice or ownership-count gate; it checks only the reason length (10..500) and the accepted / active status |
| AC9 | PASS | all 6 names present in `j9_w9_problem_term_flags` (`ok`); Vitest `w9_flags_disclaimer_and_no_match_copy` passes; smoke `send_with_deposit_term_and_flag_acknowledgement` ok |
| AC10 | PASS | the 4 `j18_w9_*` retention names in `j18_w9_flows` (`ok`) and `j10_owner_account_deletion_keeps_accepted_text_for_worker` (`ok`); smoke `owner_delete_keeps_contracts_for_worker` ok |
| AC11 | PASS | all 18 names in `j9_w9_worker_contract_rules` (`ok`) and all 5 in `j9_w9_worker_contract_audit` (`ok`); `j12_notifications_carry_no_contract_text_pay_reasons_or_names` present (`ok`); smoke `notifications_hold_no_contract_text` ok |
| AC12 | PASS | all 7 names in `j17_w9_worker_contract_authorization` (`ok`); Vitest `j17_worker_contract_repository_writes_only_through_rpcs` passes; w9 smoke 34 passed / 0 failed (direct writes on all 8 W9 tables denied; `set_config_and_internal_functions_not_callable` ok); w2..w8 smokes 0 failed |
| AC13 | PASS | all 6 names in `j18_w9_flows` (`ok`), including `j18_w9_booking_quote_rating_and_verification_unchanged`; all 54 pre-W9 pgTAP files `ok` (63 ok in total); `git diff --stat 81be37d -- supabase/tests/database` = only `001_migration_replay.test.sql` (17+, 6-), the other 9 files are new; pytest 4 passed; stager 19 pass |
| AC14 | PASS | all 16 section-6 Vitest names plus the existing 174 pass (191 in total); lint and build exit 0; `grep -rn "service_role" frontend/src` = 0 lines; `w9_copy_never_claims_signature_validity_or_compliance` passes; no `dangerouslySetInnerHTML` or `innerHTML` in `frontend/src` |
| AC15 | PASS | longest added or changed file is 350 lines (w9d, stager test, LOCAL_TEST_HARNESS.md, PLAN.md), then 349 (w9e); `git diff --stat 81be37d -- backend` is empty; `docs/workforce/WORKER_CONTRACTS.md` exists and the 6 listed docs are modified; `grep -c "W9-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` = 17, register rows W9-L1..W9-L12 present |

## Safety
- No committed migration was edited: only `A` (untracked) files under `supabase/migrations`.
- No `.env*` change: `.env` and `frontend/.env` are git-ignored and their mtimes (10-23, 10-21) are older than HEAD.
  The verifier did not read either file.
- No remote DB commands. In the diff, the new helper and the w9 smoke, `db push`, `--linked`, `--db-url` and `project-ref`
  appear only in a guard comment. There are no `supabase.co` refs and no key literals. The w9 smoke takes the URL and keys
  from `npx supabase status -o env --workdir .local-supabase-test` into memory, checks the staged `project_id`, and refuses
  a non-loopback API URL.
- Changed infrastructure: the stager adds `test_helpers_worker_contracts.sql` as the 4th entry of `HELPERS_SOURCE_NAMES`,
  and its test is updated to match. Nothing else in the stager changed.
- Booking regression: `j18_w9_booking_quote_rating_and_verification_unchanged` and every earlier booking / J18 pgTAP file
  are `ok`. The w2..w8 smokes are green.
- REVIEW.md lists no open BLOCKING findings. Security S1-S2 are NON-BLOCKING and S3-S5 are NOTE. Compliance C1-C6 are
  NON-BLOCKING.

## Non-blocking observations (carried forward, not grounds for FAIL)
- W9-S1 / C1: a trusted-session status repair can move a contract out of a terminal status, and no pgTAP test covers
  repair transitions.
- C2 / C3: the worker copy "You can end this contract at any time." has no qualification, and the owner termination copy
  carries no caution.
- C4 (reclassification or a retroactive amendment has no special warning) and C5 (no statutory-benefit-exclusion keyword
  category) are open.
- C6 is a carry-forward to W10: three-owner counting must exclude removed or unverified owners.
- W9-L13..L17 are listed in `LEGAL_FLAGS.md`. RECORD still needs to add them to the register; it holds W9-L1..L12 today.
