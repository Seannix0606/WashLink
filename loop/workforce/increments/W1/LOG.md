# W1 - LOG

## BUILD step 1 - section 0 root-reset experiment (db engineer, 2026-10-24, local Docker only)

Supabase CLI `npx supabase --version` -> `2.122.0`. No `link`, no `push`, no remote connection.

1. Root reset could not run from the repo root as-is: the CLI auto-loads the repo-root `.env`
   and `npx supabase start` aborted with `StartConfigLoadError: failed to read config: Error:
   failed to parse environment file: C:\Users\PC\WashLink\.env (unexpected character "\ufeff"
   in variable name ...)` (the file has a UTF-8 BOM). The `.env` was not opened or edited; the
   CLI error echoed its first line (project URL, no key); it is not reproduced here.
2. Root-equivalent run: a scratch dir holding an unmodified copy of `supabase/config.toml` and
   the 5 committed migrations (no `.env`), `npx supabase start --workdir <scratch>`:
   ```
   Applying migration 2026_04_17_add_shops_and_booking_location.sql...
   {"_tag":"Error","error":{"code":"MigrationApplyError","message":"ERROR: relation
   \"public.profiles\" does not exist (SQLSTATE 42P01)\nAt statement: 0\n ... create table if
   not exists public.shops ( ... owner_id uuid not null references public.profiles(id) ..."}}
   ```
   So without a baseline the replay fails on the FIRST file (F1), before the version issue.
3. Same scratch dir plus the baseline as `00000000000000_local_test_baseline_only.sql`, the 5
   files keeping their `YYYY_MM_DD_` names:
   ```
   Applying migration 00000000000000_local_test_baseline_only.sql...
   Applying migration 2026_04_17_add_shops_and_booking_location.sql...
   Applying migration 2026_04_18_super_admin_and_shop_verification.sql...
   {"_tag":"Error","error":{"code":"MigrationApplyError","message":"ERROR: duplicate key value
   violates unique constraint \"schema_migrations_pkey\" (SQLSTATE 23505)\nKey
   (version)=(2026) already exists.\nAt statement: 34\nINSERT INTO
   supabase_migrations.schema_migrations(version, name, statements) VALUES($1, $2, $3)"}}
   ```
   Confirms section 0 / D-11: every `YYYY_MM_DD_*` file is version `2026`; the second collides.
   Scratch stack stopped with `npx supabase stop --workdir <scratch> --no-backup`.

## BUILD - db part results (local staged workdir)

- `node --test scripts/supabase-test/stage-local-workdir.test.mjs` -> tests 6, pass 6, fail 0.
- `node scripts/supabase-test/run-db-tests.mjs` -> reset applied 00000000000000 + 20260417000001,
  20260418000001, 20261021000001, 20261022000001, 20261022000002, then seeded
  `supabase/local_test_baseline/test_helpers.sql`; `test db`: `All tests successful. Files=4,
  Tests=71` (000: 9, 001: 6, j17: 18, j18: 38), `Result: PASS`, exit 0. Failed (TODO) lines:
  j17 tests 13-18 (E1, E2, E3, E5, S1, S2) and j18 tests 31-32 (F5).
- `grep -o "todo_start(" supabase/tests/database/*.sql | wc -l` -> 7.
- Check 7 dry run: todo lines removed in the staged copies only -> `Failed tests: 13-18`
  (j17) and `31-32` (j18), each named after the 7 TODO tests, `Result: FAIL`; then re-staged.

Deviations from PLAN (db part):
- Staged layout: baseline files go to `.local-supabase-test/supabase/local_test_baseline/`
  (seed `sql_paths = ["./local_test_baseline/test_helpers.sql"]`), only `tests/database/` is
  staged under `supabase/tests/`. Reason: `supabase test db` ran every `.sql` under `tests/`,
  including `tests/baseline/*.sql` ("No plan found in TAP output", Result: FAIL).
- Extra helper `test_helpers.attempt(sql) returns text` ('succeeded' or SQLSTATE) so the W2
  placeholders assert the outcome whether the W2 fix raises or silently filters.
- `supabase/.gitignore` gets an extra `.env*` line (init template had only `.env.keys`,
  `.env.local`, `.env.*.local`); root `.gitignore` also lists `supabase/.temp/` explicitly.

## Fix cycle 1 - security review findings (db engineer, 2026-10-24, local Docker only)

No `link`, no `push`, no remote connection, `.env` not read, `supabase/migrations/` and
`frontend/` untouched (item 8 is with another engineer).

Changes:
1. BLOCKING 1: baseline sources moved out of the repo's `supabase/` folder to
   `scripts/supabase-test/baseline/` (`local_test_baseline.sql`, `test_helpers.sql`);
   `supabase/tests/` now holds only `database/*.test.sql`. The stager reads the new location,
   refuses to stage if any `.sql` exists under `supabase/tests/` outside `database/`
   (`findSqlOutsideTestDatabase`), and the stager test
   `repo_has_no_sql_under_supabase_tests_outside_database` scans the real repo (read-only).
   Supersedes the PLAN section 3/5 paths `supabase/tests/baseline/*` (PLAN text left as-is
   except the TODO counts).
2. BLOCKING 2: the owner booking policies left the seed. New
   `scripts/supabase-test/baseline/local_test_baseline_owner_policies.sql` is staged as
   `20260417000002_local_test_baseline_owner_policies.sql`, directly after the 2026_04_17 copy
   (`20260417000001`) and before every later committed migration, so W2 migrations can drop or
   replace `bookings_owner_select_local_test` / `bookings_owner_update_local_test`.
   `test_helpers.sql` now holds helpers only. Stager `planBaselineMigrations` aborts if the
   2026_04_17 predecessor is missing or any committed migration collides with that slot; the
   returned plan is now in apply order (lexical staged name; previously source-name order put a
   14-digit source name before legacy names) and duplicate staged versions abort. Replay test
   001 now expects 7 schema_migrations versions and asserts both policies exist and
   `20260417000002` is named `local_test_baseline_owner_policies`.
3. j17 E2: added customer -> owner self role change (fixture `j17-e2b`), must stay `customer`.
4. j17 E5/S1: E5 now attempts each forbidden write SEPARATELY and asserts per column: customer
   path (pending booking) quoted_price, shop_id, assigned_worker_id, customer_rating_* (on a
   pending booking), booking_status pending->completed; assigned-worker path (accepted booking,
   new worker fixture `j17-w-e5`) quoted_price, shop_id, customer_id, customer_rating_*,
   booking_status accepted->pending. S1 is three inserts (forged status, forged worker, forged
   rating stars/comment/rated_at), one assertion each. Worker reassignment to another roster
   row already fails today (WITH CHECK), so it is a regular test outside the todo (first run had
   it inside and pg_prove reported `TODO passed: 30`; moved).
5. j18 F5: comment added that W2 may fix via an RPC and must then rewrite the test to call it
   (and keep the direct-UPDATE rejection check). Still a genuine failing TODO.
6. S9: `workers_update_own_link` reproduces S9 on purpose (comment in baseline). New j17 TODO
   `j17_worker_cannot_rewrite_roster_row` (name/phone_number, owner_id); regular tests
   `j17_worker_can_toggle_own_availability` and the user_id part (already held by WITH CHECK).
   Added to `docs/workforce/ARCHITECTURE_AUDIT.md` (routed table) and W0 `REVIEW.md` as S9 -> W2.
7. Runner: also refuses `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_ID`; before every CLI call
   (`assertWorkdirNotLinked`) aborts if `<workdir>/supabase/.temp/project-ref` or
   `<workdir>/.temp/project-ref` exists; on Windows (shell:true, needed for the npx .cmd shim)
   the workdir is double-quoted and restricted to `[A-Za-z0-9 _.:\/-]`. `main()` only runs when
   invoked directly, so the guard is unit-tested (`runner_refuses_linked_workdir`).

Results (actual output):
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs` -> `tests 12`, `pass 12`,
  `fail 0` (6 old + puts_owner_policies_right_after_2026_04_17, rejects_migration_in_owner_
  policies_slot, rejects_missing_2026_04_17_predecessor, rejects_sql_outside_tests_database,
  repo_has_no_sql_under_supabase_tests_outside_database, runner_refuses_linked_workdir).
- Refusals: `SUPABASE_ACCESS_TOKEN=dummy-not-real node scripts/supabase-test/run-db-tests.mjs`
  -> `run-db-tests: refusing to run while SUPABASE_ACCESS_TOKEN is set`, exit 2; same for
  `SUPABASE_PROJECT_ID` (exit 2) and `--linked` (`refusing remote target argument --linked`,
  exit 2).
- `node scripts/supabase-test/run-db-tests.mjs` from a STOPPED stack (0 supabase containers):
  `npx supabase start --workdir "C:\Users\PC\WashLink\.local-supabase-test"`, then `db reset`:
  ```
  Applying migration 00000000000000_local_test_baseline_only.sql...
  Applying migration 20260417000001_add_shops_and_booking_location.sql...
  Applying migration 20260417000002_local_test_baseline_owner_policies.sql...
  Applying migration 20260418000001_super_admin_and_shop_verification.sql...
  Applying migration 20261021000001_shop_pricing_and_booking_quotes.sql...
  Applying migration 20261022000001_add_booking_notes_and_ratings.sql...
  Applying migration 20261022000002_fix_shop_verification_storage_rls.sql...
  Seeding data from supabase/local_test_baseline/test_helpers.sql...
  ```
  `test db`: `All tests successful.` `Files=4, Tests=91` (000: 9, 001: 8, j17: 36, j18: 38),
  `Result: PASS`, exit 0. 22 `Failed (TODO)` lines: j17 16-29 and 31-36 (E1 1, E2 2, E3 1,
  E5 customer 5 + worker 5, S1 3, S2 1, S9 2), j18 31-32 (F5). No `TODO passed`.
- `grep -o "todo_start(" supabase/tests/database/*.sql | wc -l` -> 8 (j17 7, j18 1).
- Check 7: `todo_start`/`todo_end` lines deleted in the STAGED copies only, `npx supabase test db
  --local --workdir ...` -> `Failed 20/36 subtests`, `Failed tests: 16-29, 31-36` (j17);
  `Failed 2/38 subtests`, `Failed tests: 31-32` (j18); `Result: FAIL`, exit 1. Re-staged
  afterwards (staged files back to 7 + 1 `todo_start(`).
- Stack stopped: `npx supabase stop --workdir ... --no-backup` -> `Stopped supabase local
  development setup.`; 0 supabase containers.

Not verified: none of this says anything about the linked project (D-10); the production
`workers` / `bookings` / `profiles` policies are still unknown, so S9 is a reconstructed-baseline
finding like E2/E5. The project-ref guard was exercised by unit test only (staging deletes
`.temp`, so a real run cannot reach it).

## Orchestrator record (2026-10-24)
- REVIEW: security 2 BLOCKING → fix cycle 1 → re-review no BLOCKING. Compliance no BLOCKING. See REVIEW.md.
- Orchestrator added SUPABASE_DB_PASSWORD to runner refusals (verified exit 2; stager 12/12).
- VERIFY: PASS (VERDICT.md). Fix cycles: 1.
