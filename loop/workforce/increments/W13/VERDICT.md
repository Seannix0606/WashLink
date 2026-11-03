# W13 - Hardening, J1-J18 coverage, docs, rollback guide, legal-review register - VERDICT

**Overall: PASS** (independent verifier, 2026-11-03; uncommitted tree on `feature/workforce`, HEAD eeb552b, after fix cycle 1)

Graded against PLAN.md section 10 (AC1..AC15), the section-6 test names and REVIEW.md (no BLOCKING findings; fix cycle 1 covered S1-S7,
N1-N4, N6, C1-C8; C9 and K9 are routed to RECORD). LOG.md, TEST_RESULTS.md and REVIEW.md were read only to see what was claimed. Every number
below comes from the verifier's own re-run. Note: LOG.md is 374 lines (> 350). It is a log, not a deliverable, so it is noted and not failed.

## Check suite (re-run by the verifier; Docker 29.9.2 up, 0 supabase containers running at the start, 2 leftover supabase volumes)

| Check | Exit | Actual output |
|---|---|---|
| `cd frontend && npm run lint` | 0 | `eslint .`, no problems |
| `cd frontend && npm run build` | 0 | `tsc -b && vite build`, `built in 824ms` |
| `cd frontend && npm test` (`vitest run`; run as `npx vitest run --reporter=verbose`) | 0 | `Test Files 145 passed (145)`, `Tests 299 passed (299)` (282 earlier + 13 W13 build + 4 fix-cycle `contractExpiryDisplayCopy.w13`) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | `4 passed, 1 warning` |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` (stack stopped at start) | 0 | runner printed "Starting database from backup..." (leftover volume), then `db reset --local --workdir .local-supabase-test` recreated the DB; 96 `Applying migration` lines, w13a..d = 20261030000006..09 last; `All tests successful.` `Files=105, Tests=3198`, `Result: PASS`; 105 files `ok`, 0 `not ok`, 0 `todo_start(` in the log and in `supabase/tests/database/*.sql` |
| `node scripts/supabase-test/run-api-smokes.mjs` (same stack) | 0 | w2 48, w3 33, w4 43, w5 39, w6 40, w7 38, w8 30, w9 34, w10 39, w11 36, w14 33, w12 22, w13 17 passed; each `0 failed`; `run-api-smokes: PASS (13 smokes)`; 0 NOT OK lines |
| `npx supabase stop --workdir . --no-backup` (run inside `.local-supabase-test`, project_id `washlink-local-test`) | 0 | `"project_id_filter":"washlink-local-test","backup":false,"message":"Stopped supabase local development setup."`; 0 supabase containers and 0 supabase volumes after |

Plans of the new pgTAP files: J17 roll-up 37, J18 roll-up 25, `j17_w13_admin_audit_reads` 25, `j2_w13_moderation_queue_paging` 27,
`j15_w13_contract_expiry_notice_wording` 20, `j15_w13_trusted_contract_end_runbook` 12 (sum 146). That gives 3185 - 133 + 146 = 3198, which matches the run.

### Verifier-run local catalog checks (before stop; `docker exec supabase_db_washlink-local-test psql -U postgres`, read-only selects)
- `workforce_audit_events` policies: `wae_no_client_select` polpermissive `f` (RESTRICTIVE), cmd `r`, qual `false`. There is no `wae_select_super_admin`.
- `md5(prosrc)` of `worker_contracts_audit()` = `aebb4ecc7ac975d3c1d47dc20307774a` (the w13d hash pinned in w13a:55).
- `shop_verification_review_log` select: anon / authenticated / service_role all `f`.
- S6: TRUNCATE / REFERENCES / TRIGGER are `f` for anon and authenticated on profiles, shops, bookings, workers, shop_pricing and shop_verification_documents.
- D-78: service_role select is `f` on the five W2 / W4 tables, and authenticated TRUNCATE on `job_openings` is `f`.
- `admin_job_opening_moderation_queue_page(text,timestamptz,uuid,integer)` execute: authenticated `t`, anon `f`, service_role `f`.

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC1 | PASS | Exactly 4 files `2026_10_30_w13[a-d]_*.sql`. `grep -L -- "-- ROLLBACK"` is empty. ROLLBACK line / length: a 80/82, b 81/96, c 68/70, d 112/205. `git diff --name-status eeb552b -- supabase/migrations` is empty and 0 w13 files are tracked (all 4 untracked). Repo migrations: 94 (+2 local baseline = 96) |
| AC2 | PASS | 96 migrations replayed from a clean reset, `Files=105`, `Result: PASS`. `001_migration_replay` is `ok` and contains `replay_schema_migrations_has_baseline_w2_to_w14_w12_and_w13` (old name 0 occurrences) and `replay_w13_audit_table_has_no_client_select_policy` (:243). 0 `todo_start(` |
| AC3 | PASS | The J1..J18 `ls supabase/tests/database/j${n}_*.test.sql` loop prints nothing. The `find frontend/src -name "*.j${n}.test.*"` loop prints nothing. Both roll-ups exist and are `ok`. Vitest `w13_acceptance_index_lists_only_existing_test_files` passes |
| AC4 | PASS | J17 roll-up is `ok` (plan 37). It holds all 11 planned names; the fix-cycle N1 rename turned `..._is_unconditionally_true_for_clients` into `j17_no_workforce_policy_qual_is_the_literal_true` (recorded in LOG / ACCEPTANCE_TESTS). It also holds the fix-cycle additions `j17_no_client_role_has_privileges_on_any_public_sequence`, `j17_no_column_level_grant_on_workforce_tables`, `j17_no_client_role_has_truncate_references_or_trigger_on_any_public_table`, `j17_service_role_cannot_reach_roster_link_code_pepper`, `j17_guard_triggers_on_client_writable_tables_are_pinned` and `j17_no_anon_or_public_write_policy_on_workforce_tables` |
| AC5 | PASS | J18 roll-up is `ok` (plan 25) and holds all 8 planned names. pytest `4 passed` |
| AC6 | PASS | `j17_w13_admin_audit_reads` is `ok` (25) and holds all 7 planned names plus `w13_audit_select_deny_all_is_restrictive`. `j17_w3_audit_events` uses `j17_audit_raw_table_not_readable_by_any_client_role` (5 uses; the old name appears only in the :136 comment). `j17_w3_audit_wiring` uses `w3_shop_review_log_view_is_trusted_sql_only` (4). Vitest `j17_w13_frontend_never_reads_raw_audit_table_or_review_log` passes. The AC6 grep hits only w3:119/140/170/174/179/181/183, w10:250 and w13:125/127; each is a negative check (forged insert, 0-row owner read, 42501 view reads, service_role tamper attempts), matching LOG deviation 5 |
| AC7 | PASS | `j2_w13_moderation_queue_paging` is `ok` (27) and holds all 9 planned names. Vitest `w13_queue_hook_loads_more_with_keyset_cursor_and_dedupes`, `w13_queue_hook_resets_on_filter_change`, `w13_queue_panel_shows_n_of_total_and_load_more`, `w13_queue_panel_empty_loading_error_states` and `w13_repository_calls_page_rpc_only` pass. The w13 smoke (`queue_page_*`) gives 17 / 0 |
| AC8 | PASS | `j15_w13_contract_expiry_notice_wording` is `ok` (20) and holds all 8 planned names. Vitest `w13_expiry_notice_body_differs_from_w9_only_in_two_strings` passes. `grep -c "create or replace function"` on w13d = 1. Live md5 = the w13d hash |
| AC9 | PASS | Vitest `w13_worker_terminate_copy_has_no_unconditional_right_statement` and `w13_owner_terminate_copy_has_legal_caution` pass. `grep -c "can end this contract at any time" workerContractCopy.ts` = 0. `j15_w13_trusted_contract_end_runbook` is `ok` (12) and holds all 4 names. `MyContractsPanel.w9.test.tsx` changes only one expectation line (-1 / +1) |
| AC10 | PASS | `grep -c` of the old W12 name with quotes = 1. The three new names are present. `j13_w12_scheduled_jobs` is `ok` |
| AC11 | PASS | `run-api-smokes.mjs` exits 0. All 13 smokes end `0 failed`, in the order w2..w11, w14, w12, w13. Counts equal LOOP.md for w2..w12 and w14; w13 = 17 (new) |
| AC12 | PASS | Vitest 299 / 299 (282 + 17 W13). Lint and build exit 0. `grep -rn "service_role" frontend/src` gives 0 lines |
| AC13 | PASS | ARCHITECTURE (172), ROLLBACK_GUIDE (160), LIMITATIONS (139), DEPLOYMENT_READINESS (113), ACCEPTANCE_TESTS (135) and LEGAL_REVIEW_REGISTER (292) are present, plus `legal/REGISTER_PART_1_W0_W8.md` (166) and `legal/REGISTER_PART_2_W9_W14.md` (171). Vitest `w13_workforce_docs_exist_with_required_sections` passes. ROLLBACK_GUIDE:37 has the order line W13 -> W12 -> W14 -> W11 -> ... -> W2, mentions `unregister_workforce_jobs.sql`, cites D-10 5x and D-11 2x, and :3 says "No ROLLBACK block has ever been executed." |
| AC14 | PASS | Item rows: part 1 81, part 2 72, index 11 (W13-L1..L11), 164 in total. All 164 are `OPEN`, there are 0 duplicate row IDs, and every ID appears in the index. Vitest `w13_legal_register_index_matches_parts_and_all_open` passes |
| AC15 | PASS | Of all changed and untracked files, the largest deliverables are 350 lines (`w11-api-smoke.mjs`, `PLATFORM_MODERATION_AND_AUDIT.md`, `NOTIFICATIONS_AND_SCHEDULING.md`, `AUDIT_AND_NOTIFICATIONS.md`), then 348 (`w10-api-smoke.mjs`) and 337 (`w14-api-smoke.mjs`). Only `W13/LOG.md` (374) is over 350; it is a log and is noted. `git diff --stat eeb552b -- backend frontend/smtp-test.js frontend/smtp-test.cjs scripts/supabase-scheduling` is empty and nothing is untracked there. No `.env` was read |

## Safety
- **Migrations:** no committed migration was edited. `git diff --name-status eeb552b -- supabase/migrations` is empty and the 4 w13 files are untracked.
- **`.env`:** no `.env*` change. `.env` and `frontend/.env` are git-ignored. Their mtimes are 2026-10-23 and 2026-10-21, older than HEAD (2026-10-30 04:14). Neither appears in the diff. The verifier did not read either file.
- **Remote DB commands:** no added line under `scripts/` or `supabase/` contains `db push`, `--linked`, `--db-url` or `project-ref`. In the new scripts, the only matches are the refusal list in `run-api-smokes.mjs:10,18`. The supabase CLI ran only through the runner (`--workdir .local-supabase-test`) and from inside `.local-supabase-test` for the stop.
- **Unchanged on purpose (`git diff eeb552b` empty):**
  - the J16 files `contracts/TerminateContractModal.tsx`, `worker/contracts/DeclineContractModal.tsx`, `worker/contracts/AcceptContractModal.tsx`, `worker/contracts/WorkerContractReview.tsx` and `worker/certifications/RequestCertificationReviewModal.tsx`;
  - `backend/` (0 diff lines, 0 untracked).
- **Booking regression:** the J18 roll-up is `ok`. `j18_existing_flows`, every `j18_w*` file and `j17_w2_shop_booking_guards` are `ok`. The w2 smoke gives 48 / 0.
- **Docs:** none claims legal validity or that a human gate is done. A grep for legal-validity, compliance and sign-off phrases matched only disclaimers (`DEPLOYMENT_READINESS.md:4`, `NOTIFICATIONS_AND_SCHEDULING.md:11`, `ARCHITECTURE.md:170`). DEPLOYMENT_READINESS has 32 unchecked `- [ ]` boxes and 0 ticked.

## Review findings (fix cycle 1 spot checks)
- **S1:** `wae_no_client_select` is `as restrictive for select to authenticated using (false)` (w13b:33-35), and the live catalog shows polpermissive `f`. `w13_audit_select_deny_all_is_restrictive` (4 uses) is in an `ok` file.
- **S4:** w13a:53-57 aborts unless `md5(prosrc)` is `70f3611014d8f651ce15dc230a820540` (w9j) or `aebb4ecc7ac975d3c1d47dc20307774a` (w13d). The page-function checks match only a comment starting with `W13:` (w13a:60, 64).
- **S5:** the w13b ROLLBACK block (:81-96) re-creates the W3 policy and the view grant only. It holds no D-78, S6 or N3 grant; the comment says "do not re-grant unless the D-10 diff proves production depended on them". ROLLBACK_GUIDE:53 says rolling back b re-opens W14 N1.
- **S6 / N3:** the revokes are at w13b:42-48 and the live catalog confirms them (above).
- **J17 roll-up additions:** see AC4.
- **C2 / C4 (owner expiry caveat):** the live owner body is "... What this means for you and the worker depends on the contract terms and the law." (w13d:83). The w13d header (:9) names the UI label "Past end date".
- **C3 ("Past end date"):**
  - `workerContractDisplay.ts:23` has the expired label "Past end date";
  - `:60` "End date passed (recorded on WashLink)";
  - `ownerRelationshipDisplay.ts:53` and `:65` read "The contract's end date has passed (recorded on WashLink).".
- **C1 (worker intro):** `workerContractCopy.ts:31` says "You can decline an offer, or record the end of an accepted contract, on WashLink at any time.". The old "You can always decline ..." text is gone.
- **D-73:** the worker terminate text is at `workerContractCopy.ts:71`, and the owner caution ("such as a proper cause and notice") at `:75`.

## Non-blocking observations (not grounds for FAIL; for RECORD)
- **Items RECORD must still do:**
  - D-70..D-78 are not yet in `DECISIONS.md` (count 0).
  - LOOP.md has no W13 smoke row and no run-api-smokes note (count 0).
  - STATE.md needs the full-suite numbers from this run.
- **ACCEPTANCE_TESTS.md:110 (K9)** still says "the post-fix-cycle run is pending". Its :10 and LOCAL_TEST_HARNESS.md:29 / :113 already record 3198. This verifier run confirms `Files=105, Tests=3198, Result: PASS`.
- **ACCEPTANCE_TESTS.md and ARCHITECTURE.md** have an mtime of 2026-11-03 22:31, during this verification and before the Vitest run (22:32:41). The docs tests and all doc checks above were therefore run on those versions.
- **Owner caution wording** ships "proper cause" rather than the D-73 "valid cause" (LOG frontend deviation 1, because the W9 copy test forbids the word "valid"). The register (W13-L3) quotes the shipped text.
- **Not verified by any test (as LOG states):**
  - No ROLLBACK block was executed.
  - The w13a NOTICE for unknown production audit policies cannot occur locally.
  - The N4 helper's second-page path was exercised only with a fake client.
  - The verifier did not repeat the injected-grant negative checks from the LOG "runs" section.
- **Local smoke side effects:** the w13 smoke commits real scheduler runs. Re-running w12 alone on the same stack afterwards would fail (LOG deviation 7); a fresh `run-db-tests.mjs` resets this.
