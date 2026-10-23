# Local test harness (W1)

Local Docker Supabase only. Nothing here touches the linked project, and local results say
nothing about the linked project (D-10).

## Run

```sh
node --test scripts/supabase-test/stage-local-workdir.test.mjs   # stager unit tests
node scripts/supabase-test/run-db-tests.mjs                       # stage, start, reset, pgTAP
npx supabase stop --workdir .local-supabase-test --no-backup      # when done
```

`run-db-tests.mjs` is equivalent to:

```sh
node scripts/supabase-test/stage-local-workdir.mjs
npx supabase start --workdir .local-supabase-test   # skipped if `status` reports it running
npx supabase db reset --local --workdir .local-supabase-test
npx supabase test db  --local --workdir .local-supabase-test
```

Expected: the reset applies 7 migrations (baseline `00000000000000`, the 2026_04_17 copy,
owner-policies baseline `20260417000002`, then the other 4 copies) and seeds the helpers;
`test db` ends with `Result: PASS`. Lines `Failed (TODO)` are the W2 placeholders (below), not failures.

## Why a staged workdir

- D-1: `profiles`, `workers`, `bookings` and the signup trigger are not in
  `supabase/migrations/`. `scripts/supabase-test/baseline/local_test_baseline.sql` reconstructs
  them (from code + migrations, see `ARCHITECTURE_AUDIT.md`). The baseline files live outside
  the repo's `supabase/` folder entirely: in `supabase/migrations/` `db push` would send them to
  a real project, and `supabase test db` (also with `--linked`/`--db-url`) runs EVERY `.sql`
  under `supabase/tests/`. The stager refuses to run, and the stager test
  `repo_has_no_sql_under_supabase_tests_outside_database` fails, if any `.sql` exists under
  `supabase/tests/` outside `database/`.
- Baseline sources (`scripts/supabase-test/baseline/`):
  `local_test_baseline.sql` -> staged migration `00000000000000` (profiles, workers, bookings,
  signup trigger); `local_test_baseline_owner_policies.sql` -> staged migration
  `20260417000002`, directly after the 2026_04_17 copy (`20260417000001`, adds
  `bookings.shop_id`) and before every later committed migration, so W2 migrations can drop or
  replace `bookings_owner_select_local_test` / `bookings_owner_update_local_test`;
  `test_helpers.sql` -> the staged seed (helpers only, runs after all migrations). The stager
  aborts if any committed migration collides with that slot.
- D-11: Supabase CLI 2.122.0 parses `YYYY_MM_DD_<desc>.sql` as version `2026`, so the second
  file collides in `schema_migrations` (evidence in `loop/workforce/increments/W1/LOG.md`).
  The repo keeps its naming (LOOP rule 3); the stager copies each migration byte-identical
  (sha256-checked) under a 14-digit name (`YYYYMMDD` + per-date sequence). A human decides on
  renaming before any `db push`.
- The gitignored `.local-supabase-test/` has `project_id = "washlink-local-test"`, no
  `.temp/project-ref` and no `.env`, so the CLI cannot target a remote project from it.
  Layout: `supabase/migrations/` (the 2 baseline migrations + the 5 copies),
  `supabase/local_test_baseline/test_helpers.sql` (seed; kept outside `tests/` because
  `test db` runs every `.sql` there), `supabase/tests/database/` (pgTAP files).
- Do not run `supabase start`/`db reset` from the repo root: the CLI loads the root `.env`
  and the root migrations cannot replay (no baseline, version collision).

## pgTAP conventions

- Files: `supabase/tests/database/*.test.sql`; each is `begin; ... plan(n); ... finish();
  rollback;`. Fixture emails end in `@local.test`.
- Helpers (`test_helpers` schema, seed only): `create_user/customer/owner/worker/super_admin`,
  `act_as(uuid)`, `act_as_customer/owner/worker/admin(email)`, `act_as_anon()`,
  `act_as_service()`, `attempt(sql)`, fixtures `create_shop`, `set_shop_price`,
  `create_roster_worker`, `create_booking_fixture` (fixtures require `act_as_service()`).
- Ids are passed between statements with `set_config('fx.<name>', ..., true)` /
  `current_setting('fx.<name>')`, readable under any role.
- Never print a bare `ok` from a plain `select`: TAP counts it as a test.

## TODO placeholders (honesty rule)

Exactly 8 `todo_start(` calls exist: F5 in `j18_existing_flows.test.sql` and E1, E2, E3, E5,
S1, S2, S9 in `j17_authorization_harness.test.sql` (22 assertions in total: j17 20, j18 2).
The assertions are real and fail against the baseline, which reproduces those weaknesses on
purpose. Each forbidden write is attempted separately and asserted per column, so a partial W2
fix leaves assertions failing. Parts that already hold today (worker reassigning a job, worker
re-pointing `workers.user_id`, worker availability toggle) are regular tests that W2 must keep
passing. W2 removes the wrappers when it fixes them; if W2 fixes F5 through an RPC it must
rewrite that test to call the RPC. A "TODO passed" line, or any other failing assertion, is a
finding.

## Safety rules

- Never `supabase link`, `db push`, `--linked`, `--db-url`, `--project-ref`, `SUPABASE_DB_URL`,
  `SUPABASE_ACCESS_TOKEN` or `SUPABASE_PROJECT_ID`; the runner aborts (exit 2) if any appears,
  and before every CLI call it aborts if `.local-supabase-test/supabase/.temp/project-ref` (or
  `.local-supabase-test/.temp/project-ref`) exists.
- Never run `supabase test db` from the repo root: it would execute `supabase/tests/database/`
  against whatever the root config targets.
- Never read or print `.env` files.
- Never copy anything from `scripts/supabase-test/baseline/` into the repo's `supabase/` folder
  or a real project.

## Vitest (frontend)

```sh
cd frontend && npm test          # vitest run (jsdom), all src/**/*.test.{ts,tsx}
cd frontend && npm run test:watch
```

- Tests import `describe/it/expect/vi` from `vitest` explicitly (no globals). Repositories and
  `../supabase/supabaseClient` are mocked with `vi.mock`; the real Supabase project is never used.
- Env isolation: `vitest.config.ts` sets `envDir` to `src/test/isolated-env` (empty), so
  `frontend/.env*` is never loaded, and `test.env` supplies `VITE_SUPABASE_URL=http://127.0.0.1:9`
  and a placeholder anon key. `harness_env_uses_placeholder_supabase_url` guards this.
- Fetch stub: `src/test/setup.ts` replaces global `fetch` with a function that throws
  "network disabled in unit tests"; `harness_unit_tests_cannot_reach_network` guards this.
  A test needing HTTP must mock the repository or stub `fetch` itself.
- Test files are named `*.j18.test.ts(x)` and titles `j18_<scenario>`; no `it.skip`. Use
  `it.fails` with the reason in the title if a known-failing test is ever needed.
- Tests are excluded from the production `tsconfig.app.json` and type-checked via
  `tsconfig.test.json` (`npm run build` runs `tsc -b`).
