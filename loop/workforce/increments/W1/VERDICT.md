# W1 - VERDICT (independent verifier, 2026-10-24)

**Overall: PASS**

Judged against `PLAN.md` as amended by the deviations logged in `LOG.md` (BUILD db part and
Fix cycle 1): baseline sources in `scripts/supabase-test/baseline/`; owner booking policies as
staged migration `20260417000002_local_test_baseline_owner_policies.sql`; exactly 8
`todo_start(` blocks; `test_helpers.attempt()` helper; 12 stager tests.
Working tree uncommitted on `feature/workforce`, HEAD `979723d`. No commit was made.

## Clean-state precondition

`docker ps` before the run: 0 supabase containers (only washlink-backend/frontend/redis).
The runner re-staged `.local-supabase-test/` from scratch and started the stack itself.

## Check suite (actual output, re-run by the verifier)

| # | Check | Result |
|---|---|---|
| 1 | `cd frontend && npm run lint` | exit 0 |
| 2 | `cd frontend && npm run build` | exit 0 (`built in 495ms`) |
| 3 | `cd frontend && npm test` | exit 0; `Test Files 8 passed (8)`, `Tests 16 passed (16)`; 0 skipped/todo; no `.skip`/`.todo`/`.only`/`it.fails` in test files |
| 4 | `backend/.venv/Scripts/python.exe -m pytest -q` | `4 passed, 1 warning` |
| 5 | `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | exit 0; `tests 12, pass 12, fail 0, skipped 0, todo 0` |
| 6 | `node scripts/supabase-test/run-db-tests.mjs` | exit 0. `start` then `db reset --local --workdir ...` applied 7 migrations in order: 00000000000000_local_test_baseline_only, 20260417000001, 20260417000002_local_test_baseline_owner_policies, 20260418000001, 20261021000001, 20261022000001, 20261022000002; seeded `local_test_baseline/test_helpers.sql`. `test db`: all 4 files `ok`, `All tests successful.`, `Files=4, Tests=91`, `Result: PASS`. 22 `Failed (TODO)` lines (j17 16-29, 31-36; j18 31-32); 0 `TODO passed` |
| 7 | TODO honesty | `grep -o "todo_start(" supabase/tests/database/*.sql \| wc -l` -> 8 (j17 7, j18 1; each reason names W2 and E1/E2/E3/E5/S1/S2/S9/F5). With every `select todo_start(`/`todo_end(` line deleted in the STAGED copies only: j17 `Failed 20/36`, `Failed tests: 16-29, 31-36` (signup_cannot_self_assign_super_admin, profile_owner_cannot_change_role x2, owner_cannot_insert_preapproved_shop, customer_cannot_change_quoted_price x5, assigned_worker_cannot_change_protected_booking_fields x5, customer_cannot_forge_booking_insert_fields x3, owner_cannot_assign_foreign_worker, worker_cannot_rewrite_roster_row x2); j18 `Failed 2/38`, `Failed tests: 31-32` (owner_can_resubmit_after_changes_requested); `Result: FAIL`, exit 1. No non-TODO assertion failed. Re-staged afterwards; staged count back to 8 |
| 8 | Safety | `git status --porcelain supabase/migrations` empty; `git diff --stat 979723d -- supabase/migrations` empty; `grep -rl "LOCAL TEST BASELINE ONLY" supabase/migrations` no match; no `.sql` under `supabase/` outside `migrations/` and `tests/database/`; `git check-ignore supabase/.temp/cli-latest .local-supabase-test` prints both; `git ls-files supabase/.temp .local-supabase-test` empty; no `project-ref` file under `supabase/` or `.local-supabase-test/` |

Stack stopped afterwards: `npx supabase stop --workdir .local-supabase-test --no-backup` ->
`Stopped supabase local development setup.` (project_id_filter washlink-local-test); 0 supabase
containers remain.

## Acceptance criteria

| AC | Verdict | Evidence |
|---|---|---|
| AC1 config and ignore | PASS | `supabase/config.toml:5` `project_id = "washlink"`; `[auth.email]` `enable_confirmations = false` (line 227); `site_url` localhost:5173; edge_runtime/analytics disabled; check 8 check-ignore prints both paths |
| AC2 migration replay | PASS | check 6 reset applied baseline + owner-policies + 5 committed migrations without error; `001_migration_replay.test.sql` `ok` (plan 8): replay_shops_created, replay_profiles_role_check_allows_super_admin, replay_bookings_quote_trigger_exists, replay_bookings_rating_columns_exist, replay_storage_policies_replaced, replay_schema_migrations_has_baseline_and_five (now expects 7 versions per fix cycle 1), replay_owner_booking_policies_from_baseline_migration x2 |
| AC3 baseline cannot reach remote | PASS | check 8; 12/12 stager tests incl. stager_never_writes_into_supabase_migrations, stager_writes_no_project_ref, repo_has_no_sql_under_supabase_tests_outside_database, runner_refuses_linked_workdir; runner hard-codes `--local --workdir`, refuses --db-url/--linked/--project-ref and SUPABASE_DB_URL/ACCESS_TOKEN/PROJECT_ID/DB_PASSWORD, never link/push |
| AC4 signup trigger | PASS | `harness_signup_trigger_creates_profile_with_metadata` in 000 file, file `ok` |
| AC5 helpers | PASS | harness_act_as_sets_auth_uid, harness_act_as_role_wrapper_rejects_wrong_role, harness_act_as_anon_has_no_uid, harness_act_as_service_returns_to_superuser in 000 file (plan 9), `ok` |
| AC6 J18 DB | PASS | j18 file `ok` (38 tests); all section 6 names present; only failures are the F5 TODO (tests 31-32), proven genuine in check 7 |
| AC7 J17 harness | PASS | j17 file `ok` (36 tests); regular tests pass (anon/customer/owner read isolation, owner_cannot_update_other_owner_shop, non_admin_cannot_change_verification_status, user_cannot_read_other_profiles_contact, worker_can_toggle_own_availability); 7 W2 TODO blocks (E1, E2, E3, E5, S1, S2, S9) genuinely fail without wrappers (check 7) |
| AC8 Vitest | PASS | all 14 section 9 test names listed as passed plus 2 extra harness tests (websocket, XMLHttpRequest); checks 1 and 2 exit 0 |
| AC9 regression | PASS | pytest 4 passed; tracked-diff and untracked files under `frontend/src` filtered by `\.test\.tsx?$\|/src/test/` -> empty |

## Ground-rule confirmations

- Committed migrations: unchanged vs 979723d (check 8).
- `.env*`: no tracked or untracked-unignored env file in the diff; `.env` mtime 2026-10-23 21:05,
  `frontend/.env` 2026-10-21 20:21, both before W1 work (contents not read). Vitest uses an
  empty `envDir` and placeholder env.
- Remote: no `db push`, `link`, `--linked`, `--db-url` invocation in scripts or package.json
  (only refusal lists/comments); no `*.supabase.co` URL, JWT, `sb_secret_` or service-role key
  in new/changed files.
- Booking regression: J18 pgTAP (38) and J18 Vitest tests pass; backend 4 passed.
- Reviewer BLOCKING findings: no W1 REVIEW.md exists; the two BLOCKING items recorded in
  LOG.md fix cycle 1 are closed by evidence collected here (BLOCKING 1: no `.sql` under
  `supabase/` outside migrations/tests/database and stager refuses otherwise; BLOCKING 2:
  owner policies applied as staged migration 20260417000002 before 20260418000001).
- New files all <= 302 lines.

## Observations (non-blocking)

- No separate W1 review file; the review record lives only in LOG.md. The orchestrator may
  want a REVIEW.md for traceability.
- Local results say nothing about the linked project (D-10); the baseline is a reconstruction.
