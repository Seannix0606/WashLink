# W1 - Test infrastructure (local Supabase, pgTAP, Vitest) - PLAN

Spec: G, J (J17, J18). Depends on: W0 (`passed`, STATE.md). Decisions: D-1 ADOPTED-DEFAULT
(baseline derived from code + migrations, "local test baseline only", lives OUTSIDE
`supabase/migrations/`). D-10 standing gate acknowledged (local results say nothing about the
linked project). No other decision is needed. Not BLOCKED.

## 0. Finding that shapes this plan (verified from the CLI binary, not by running it)

`npx supabase` v2.122.0 parses migration files with `^([0-9]+)_(.*)\.sql$` and records them in
`supabase_migrations.schema_migrations (version text NOT NULL PRIMARY KEY)`. With the repo
convention `YYYY_MM_DD_<desc>.sql`, **all five committed migrations get version `2026`**. A plain
`supabase db reset` from the repo root is therefore expected to fail on the second file with a
duplicate-key error, and every future W2+ migration with the same convention would collide too.
The committed files may not be renamed or edited (LOOP rule 3). BUILD step 1 confirms this once by
running the root reset (local only) and records the actual output in LOG.md. Either way the
design below is used: the harness has to stage a clean workdir anyway to keep the baseline out of
`supabase/migrations/`.
New decision for the orchestrator to add: **D-11** "Migration filename convention vs Supabase CLI
versioning. Proposed default: keep the convention (LOOP rule 3); the local harness normalises
names in a staged copy; a human decides on renaming before any `db push`." Not blocking.

## 1. Scope / out of scope

In scope:
- `npx supabase init` at the repo root (config.toml, supabase/.gitignore), local settings only.
- Local-test-only baseline for `profiles`, `workers`, `bookings` plus the auth signup trigger.
- A staging script that builds a gitignored, unlinked workdir (`.local-supabase-test/`) where
  the baseline runs first and the committed migrations are replayed byte-identical, in order,
  under CLI-valid 14-digit versions.
- pgTAP helpers (`test_helpers` schema) and pgTAP tests: harness sanity, migration replay,
  J18 regression, J17 harness (W2 TODOs included).
- Vitest + Testing Library in `frontend/` with `npm test`; J18 unit/component tests.
- Docs: `docs/workforce/LOCAL_TEST_HARNESS.md`; LOOP.md check-suite table updated to the new
  commands.

Out of scope: any fix to E1/E2/E3/E5/S1/S2/F5 (W2), any new file in `supabase/migrations/`,
any change to backend/SQLAlchemy/Alembic, any CI config, any remote/linked Supabase action,
any change to existing app behaviour. No file in `supabase/migrations/` is added or modified.

## 2. Baseline placement: options weighed

| Option | Replays migrations in order? | Can reach remote via `db push`? | Verdict |
|---|---|---|---|
| A. Early-dated file in `supabase/migrations/` (e.g. `2026_01_01_baseline.sql`) | Sorts first, but still collides on version `2026` | **Yes**: `db push` pushes every file in the folder (tables, policies, a trigger on `auth.users` in prod) | Rejected (violates D-1 note) |
| B. `supabase/seed.sql` | **No**: seed runs AFTER migrations, so `alter table bookings` fails first | Only with `--include-seed` | Rejected |
| C. `supabase/roles.sql` (runs before migrations on reset) | Yes | Yes with `db push --include-roles`; also abuses a roles-only file | Rejected |
| D. Committed baseline under `supabase/tests/baseline/`, injected only into a staged, gitignored, unlinked workdir | Yes, baseline is version `00000000000000` | **No**: not in `supabase/migrations/`; the staged dir has no project ref, so the CLI cannot target a remote from it | **Chosen** |

Option D also solves section 0 without touching committed files.

## 3. Files to add / change

| Path | Purpose |
|---|---|
| `supabase/config.toml` | from `npx supabase init --with-vscode-settings=false --with-intellij-settings=false`; `project_id = "washlink"`; `[auth] site_url = "http://localhost:5173"`, `additional_redirect_urls = ["http://localhost:5173"]`; `[auth.email] enable_confirmations = false` (matches the current UI toast, F7); `[edge_runtime] enabled = false`; `[analytics] enabled = false`; `[db.seed] enabled = true`, `sql_paths = ["./seed.sql"]` (no seed.sql is created at the root). No secrets; only the `env(...)` placeholders of the init template. |
| `supabase/.gitignore` | created by init; must contain `.branches`, `.temp` (covers `.temp/`), `.env*`. Makes the existing untracked `supabase/.temp/` ignored. |
| `.gitignore` (root) | add `.local-supabase-test/` |
| `supabase/tests/baseline/local_test_baseline.sql` | baseline (section 4), header `-- LOCAL TEST BASELINE ONLY - NEVER APPLY TO A REAL PROJECT` |
| `supabase/tests/baseline/test_helpers.sql` | pgTAP helpers (section 5); seed of the staged workdir only |
| `supabase/tests/database/000_harness_sanity.test.sql` | helper and identity-switching checks |
| `supabase/tests/database/001_migration_replay.test.sql` | objects from each committed migration exist |
| `supabase/tests/database/j18_existing_flows.test.sql` | J18 pgTAP (section 6) |
| `supabase/tests/database/j17_authorization_harness.test.sql` | J17 pgTAP (section 7) |
| `scripts/supabase-test/stage-local-workdir.mjs` | builds `.local-supabase-test/` (section 8) |
| `scripts/supabase-test/stage-local-workdir.test.mjs` | `node --test` tests for the stager |
| `scripts/supabase-test/run-db-tests.mjs` | stage, start, reset, test; local only |
| `frontend/package.json` | scripts `"test": "vitest run"`, `"test:watch": "vitest"`; devDeps `vitest` (4.x, Vite 8 compatible), `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` |
| `frontend/vitest.config.ts` | `mergeConfig` with `vite.config.ts`; `environment: 'jsdom'`; `setupFiles: ['./src/test/setup.ts']`; `include: ['src/**/*.test.{ts,tsx}']`; `envDir: './src/test/isolated-env'` (empty dir with `.gitkeep`, so `frontend/.env*` is never loaded); `test.env` sets `VITE_SUPABASE_URL=http://127.0.0.1:9` and `VITE_SUPABASE_ANON_KEY=vitest-placeholder-not-a-key` |
| `frontend/src/test/setup.ts` | `import '@testing-library/jest-dom/vitest'`; `afterEach(cleanup)`; stubs global `fetch` to throw "network disabled in unit tests" |
| `frontend/tsconfig.app.json` | `exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/test"]` so production build config is unchanged in effect |
| `frontend/tsconfig.test.json` (new), referenced from `tsconfig.json`; `tsconfig.node.json` includes `vitest.config.ts` | type-check tests; tests import `describe/it/expect/vi` from `vitest` explicitly (no globals) |
| `frontend/eslint.config.js` | add `./tsconfig.test.json` to `parserOptions.project` |
| Vitest test files | section 9 |
| `docs/workforce/LOCAL_TEST_HARNESS.md` | how to run, why a staged workdir, D-11, safety rules |
| `loop/workforce/LOOP.md` | check-suite rows "DB/RLS tests" and "Migration replay" point to the section 10 commands |

All new files stay under ~350 lines. No production file under `frontend/src` changes.

## 4. Local test baseline (tables, constraints, indexes, RLS, trigger)

Rule: the baseline creates only what NO committed migration creates, and omits every column a
migration adds (shop_id, latitude, longitude, quoted_price, customer_notes, customer_rating_*),
so a broken migration cannot be masked. Each object carries `-- reconstructed, see
docs/workforce/ARCHITECTURE_AUDIT.md`. Policies mirror what the frontend needs, NOT what
production has (unknown, D-10). Where the audit flags a presumed weakness (E1, E2, E5, S1, S2)
the baseline reproduces it on purpose so W2's fixes are proven against it.

- `public.profiles`: `id uuid primary key references auth.users(id) on delete cascade`;
  `role text not null default 'customer'` with constraint `profiles_role_check check (role in
  ('customer','owner','worker'))` (2026_04_18 then rewrites it to include `super_admin`; the
  replay test asserts that); `full_name text`; `phone_number text`; `created_at`, `updated_at
  timestamptz not null default now()`. RLS enabled. Policies (to authenticated):
  `profiles_select_own` using `id = auth.uid()` (`is_super_admin()` does not exist yet at this
  point); `profiles_update_own` using/check `id = auth.uid()` with NO column restriction
  (reproduces E2). No insert or delete policy.
- `public.handle_new_user()` security definer, `set search_path = public`; trigger
  `on_auth_user_created after insert on auth.users for each row`. Inserts `id`,
  `coalesce(raw_user_meta_data->>'role', 'customer')`, `full_name`, `phone_number` from the
  metadata. The role is copied unsanitised (reproduces E1). Conventional names so W2's fix can
  `create or replace` the same function name.
- `public.workers`: `id uuid primary key default gen_random_uuid()`; `owner_id uuid not null
  references public.profiles(id) on delete cascade`; `user_id uuid` nullable, no FK (as
  audited; W2 adds it); `name text not null`; `phone_number text`; `is_available boolean not
  null default true`; timestamps. Indexes `workers_owner_id_idx`, `workers_user_id_idx`.
  RLS: select `owner_id = auth.uid() or user_id = auth.uid()`; insert/update/delete
  `owner_id = auth.uid()`; `workers_update_own_link` using/check `user_id = auth.uid()`
  (availability toggle on the worker jobs page).
- `public.bookings`: `id uuid primary key default gen_random_uuid()`; `customer_name text not
  null`; `customer_id uuid references public.profiles(id) on delete set null`; `vehicle_type
  text not null`; `service_type text not null`; `address text not null`; `time timestamptz not
  null` (zod sends ISO with offset); `booking_status text not null default 'pending'` with
  `bookings_booking_status_check` in (pending, accepted, in_progress, completed, rejected,
  cancelled); `created_at timestamptz not null default now()`; `assigned_worker_id uuid
  references public.workers(id) on delete set null`. Indexes on `customer_id`,
  `assigned_worker_id`. RLS: insert check `customer_id = auth.uid()` (any column accepted,
  reproduces S1); select and update for the customer (`customer_id = auth.uid()`) and for the
  assigned worker (`exists (select 1 from public.workers w where w.id = assigned_worker_id and
  w.user_id = auth.uid())`), no column restriction (reproduces E5).
  Shop-owner policies need `shop_id`, which only exists after 2026_04_17, so they are created
  in `test_helpers.sql` (seed, after all migrations) as `bookings_owner_select_local_test` and
  `bookings_owner_update_local_test` (`exists (select 1 from public.shops s where s.id =
  shop_id and s.owner_id = auth.uid())`, no column restriction, reproduces S2).
- `alter publication supabase_realtime add table public.bookings, public.workers` (parity with
  the realtime channels the frontend uses).

No state machine is introduced in W1. The existing ones are only exercised: booking status
values above (transitions are not DB-enforced today, recorded for W2), and shop verification
pending -> approved / changes_requested / rejected (super_admin only, enforced by
`prevent_owner_verification_mutation`), changes_requested -> pending by the owner (broken, F5).

## 5. pgTAP helpers (`supabase/tests/baseline/test_helpers.sql`, staged seed only)

Schema `test_helpers` (not in the PostgREST `schemas` list). `grant usage` on the schema and
`execute` on its functions to `anon, authenticated`, so identity can be switched mid-test.
All functions are SECURITY INVOKER (role switching is not allowed in security definer).
- `create_user(p_email text, p_role text default 'customer', p_full_name text default null)
  returns uuid`: inserts into `auth.users` (id, instance_id, aud and role `authenticated`,
  email, `encrypted_password = crypt('local-test-password', gen_salt('bf'))`,
  `email_confirmed_at = now()`, `raw_user_meta_data` with role and full_name, timestamps); the
  baseline trigger creates the profile.
- `create_customer(p_email)`, `create_owner(p_email)`, `create_worker(p_email)`: wrappers.
- `create_super_admin(p_email)`: `create_user(p_email, 'customer')`, then as the session
  superuser `update public.profiles set role = 'super_admin'` (mirrors D-8: super_admin only
  via SQL run by a human). W2's role-immutability trigger must keep allowing non-JWT sessions.
- `act_as(p_user_id uuid)`: `set_config('role', 'authenticated', true)` and
  `set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated',
  'email', email)::text, true)`. Wrappers `act_as_customer(p_email)`, `act_as_owner(p_email)`,
  `act_as_worker(p_email)`, `act_as_admin(p_email)` look the user up by email and raise if the
  profile role does not match.
- `act_as_anon()`; `act_as_service()` resets the claims and returns to the superuser (tests
  may also use plain `reset role;`).
- Fixtures (run as superuser, bypass RLS): `create_shop(p_owner uuid, p_status text default
  'approved', p_active boolean default true) returns uuid`; `set_shop_price(p_shop uuid,
  p_vehicle text, p_service text, p_price numeric)`; `create_roster_worker(p_owner uuid,
  p_user uuid default null) returns uuid`; `create_booking_fixture(p_customer uuid, p_shop
  uuid, p_status text default 'pending') returns uuid`.
- The two `_local_test` owner policies on bookings (section 4).

Every test file: `begin; create extension if not exists pgtap with schema extensions; select
plan(n); ... select * from finish(); rollback;`. Fixture emails use `@local.test`. Data is
per-file and rolled back.

## 6. J18 regression tests (pgTAP, `j18_existing_flows.test.sql`)

The pgTAP description string of each assertion is the test name below.
Booking creation and pricing quote:
- `j18_customer_can_create_booking_with_shop_quote` (quoted_price equals shop_pricing.price)
- `j18_booking_quote_ignores_client_supplied_price` (insert with quoted_price 1.00 gets the shop price)
- `j18_booking_requires_shop`, `j18_booking_requires_matching_active_price`,
  `j18_booking_rejected_for_unapproved_shop` (throws_ok with the exact trigger messages)
- `j18_owner_can_manage_own_shop_pricing`, `j18_owner_cannot_manage_other_shop_pricing`,
  `j18_customer_sees_only_approved_active_shop_pricing`, `j18_shop_price_must_be_positive`
- `j18_customer_can_cancel_own_pending_booking`
Verification:
- `j18_owner_cannot_self_approve_shop`, `j18_super_admin_can_approve_shop`,
  `j18_super_admin_can_request_changes`, `j18_owner_can_resubmit_pending_shop`,
  `j18_owner_can_manage_own_verification_documents`,
  `j18_owner_cannot_read_other_shop_verification_documents`
- `j18_owner_can_resubmit_after_changes_requested`: **expected to FAIL until W2 (F5)**. Wrapped
  in `select todo_start('F5: blocked by prevent_owner_verification_mutation; fixed in W2 by
  submit_shop_for_verification(); remove this todo in W2');` ... `select todo_end();`. The
  assertions run for real: `lives_ok` on the same owner UPDATE that
  `SupabaseShopVerificationRepository.submitShopForVerification` sends, then
  `is(verification_status, 'pending')`. pg_prove treats failing TODOs as non-fatal; if it
  unexpectedly passes, pg_prove prints "TODO passed", which the verifier treats as a finding.
Ratings:
- `j18_customer_can_rate_completed_booking`, `j18_rating_stars_must_be_between_1_and_5`
  (0 and 6 rejected by `bookings_customer_rating_stars_check`),
  `j18_customer_cannot_rate_other_customer_booking`.

## 7. J17 harness (pgTAP, `j17_authorization_harness.test.sql`)

Regular tests that pass now: `j17_anon_cannot_read_bookings`,
`j17_customer_cannot_read_other_customer_bookings`, `j17_owner_cannot_read_other_shop_bookings`,
`j17_owner_cannot_update_other_owner_shop`, `j17_non_admin_cannot_change_verification_status`,
`j17_user_cannot_read_other_profiles_contact` (S4; passes against the baseline policy only).
W2 placeholders, real assertions inside `todo_start('W2: <finding id> ...')`, expected to fail
against the baseline: `j17_signup_cannot_self_assign_super_admin` (E1),
`j17_profile_owner_cannot_change_role` (E2), `j17_owner_cannot_insert_preapproved_shop` (E3),
`j17_customer_cannot_change_quoted_price` (E5), `j17_customer_cannot_forge_booking_insert_fields`
(S1), `j17_owner_cannot_assign_foreign_worker` (S2), `j17_worker_cannot_rewrite_roster_row` (S9,
added in fix cycle 1). W2 removes these todo wrappers.
Honesty rule: after W1 exactly 8 `todo_start(` calls exist under `supabase/tests/database/`
(F5 plus these seven; was 7 before fix cycle 1), each reason names W2 and a finding ID. Any other failing assertion fails
W1. Check 7 proves the TODO assertions really fail today and are not vacuous.

## 8. Staging script (`scripts/supabase-test/stage-local-workdir.mjs`, Node 24, no deps)

1. Output dir is fixed to `<repo>/.local-supabase-test/`; refuses any other path and refuses if
   the resolved path is inside `supabase/migrations`. Deletes and recreates it.
2. Copies `supabase/config.toml`, replacing exactly the line `project_id = "washlink"` with
   `project_id = "washlink-local-test"` and the `[db.seed]` `sql_paths` line with
   `sql_paths = ["./tests/baseline/test_helpers.sql"]`; aborts if either line is missing.
3. Writes `supabase/migrations/00000000000000_local_test_baseline_only.sql` (copy of the baseline).
4. For each file in the repo `supabase/migrations/`, sorted by name: a `YYYY_MM_DD_<desc>.sql`
   name becomes `YYYYMMDD` + 6-digit per-date sequence + `_<desc>.sql` (e.g.
   `20260417000001_add_shops_and_booking_location.sql`,
   `20261022000001_add_booking_notes_and_ratings.sql`,
   `20261022000002_fix_shop_verification_storage_rls.sql`); a name that is already 14 digits
   plus `_` is copied unchanged; anything else aborts. Content is byte-identical (sha256 check).
5. Copies `supabase/tests/` (baseline and database) into the staged dir.
6. Never writes `.temp/project-ref`; deletes any staged `.temp/` it finds; writes a
   `STAGED_LOCAL_TEST_ONLY.txt` marker.
Stager tests (`node --test`): `stager_renames_legacy_names_in_order`,
`stager_copies_migrations_byte_identical`, `stager_puts_baseline_first`,
`stager_rejects_unknown_migration_names`, `stager_never_writes_into_supabase_migrations`,
`stager_writes_no_project_ref`.

`run-db-tests.mjs`: runs the stager; `npx supabase start --workdir .local-supabase-test`
(skipped if `npx supabase status --workdir .local-supabase-test` reports it running);
`npx supabase db reset --local --workdir .local-supabase-test`;
`npx supabase test db --local --workdir .local-supabase-test`. `--local` is hard-coded. It
aborts if `--db-url`, `--linked` or `SUPABASE_DB_URL` appear in argv or env, and never calls
`link` or `push`. Exit code = first failing step.

## 9. Vitest + Testing Library tests (mocked repositories, network disabled)

Test files sit next to the code they test, named `*.j18.test.ts(x)`; test names are the `it` titles.
- `application/services/BookingService.j18.test.ts`:
  `j18_booking_service_creates_validated_booking`,
  `j18_booking_service_rejects_past_time_without_calling_repository`,
  `j18_booking_service_cancel_passes_customer_identifier`.
- `domain/utilities/shopPricing.j18.test.ts`:
  `j18_find_shop_service_price_matches_vehicle_and_service`,
  `j18_shop_has_complete_pricing_requires_all_rates`;
  `application/validation/shopPricingSchemas.j18.test.ts`:
  `j18_save_shop_pricing_rejects_non_positive_price`.
- `application/services/ShopVerificationService.j18.test.ts`:
  `j18_verification_service_submits_for_owner`;
  `presentation/utilities/shopVerificationDisplay.j18.test.ts`:
  `j18_verification_status_display_for_each_status`.
- `infrastructure/repositories/SupabaseBookingRepository.j18.test.ts` (`vi.mock` of
  `../supabase/supabaseClient`): `j18_rating_rejects_out_of_range_before_network`,
  `j18_rating_update_filters_completed_unrated_own_booking` (asserts the eq/is filter chain).
- `presentation/components/rating/BookingRatingStarInput.j18.test.tsx` (Testing Library and
  user-event): `j18_rating_star_input_reports_selected_stars`,
  `j18_rating_star_input_disabled_blocks_selection`.
- `src/test/harness.test.ts`: `harness_unit_tests_cannot_reach_network`,
  `harness_env_uses_placeholder_supabase_url`.
No Vitest todo or skip is needed (F5 is DB-only). If one is ever needed, use `it.fails` with
the reason in the title; `it.skip` is not allowed.

## 10. Check commands (from repo root unless stated; Git Bash or PowerShell)

1. `cd frontend && npm run lint` -> exit 0
2. `cd frontend && npm run build` -> exit 0 (`tsc -b` also type-checks the tests)
3. `cd frontend && npm test` -> exit 0; every section 9 test listed as passed; 0 skipped/todo
4. `cd backend && .venv/Scripts/python.exe -m pytest -q` -> 4 passed
5. `node --test scripts/supabase-test/stage-local-workdir.test.mjs` -> 6 pass, 0 fail
6. `node scripts/supabase-test/run-db-tests.mjs` (equivalent to the three
   `npx supabase ... --workdir .local-supabase-test` commands in section 8) -> reset applies
   6 migrations (baseline + 5) without error; `test db` ends with `Result: PASS`
7. TODO honesty: `grep -o "todo_start(" supabase/tests/database/*.sql | wc -l` prints 8 (7 before fix cycle 1). The
   verifier then makes a scratch copy of the two todo-bearing files with the `todo_start`/
   `todo_end` lines removed, places it in `.local-supabase-test/supabase/tests/database/`
   (staged dir only), runs `npx supabase test db --local --workdir .local-supabase-test`,
   and confirms exactly those 7 named tests fail; then re-stages.
8. Safety: `git status --porcelain supabase/migrations` empty;
   `git diff --stat 979723d -- supabase/migrations` empty;
   `grep -rl "LOCAL TEST BASELINE ONLY" supabase/migrations` no match;
   `git check-ignore supabase/.temp/cli-latest .local-supabase-test` prints both;
   `test ! -e .local-supabase-test/supabase/.temp/project-ref`;
   `git ls-files supabase/.temp .local-supabase-test` empty.
9. Section 0 evidence: root `npx supabase db reset --local` output (expected duplicate-version
   failure on the second migration) recorded in `increments/W1/LOG.md`. If it unexpectedly
   succeeds, record that; the staged design stays because of the baseline isolation.

## 11. Acceptance criteria

- AC1 config and ignore: `supabase/config.toml` exists with `project_id = "washlink"` and
  `enable_confirmations = false`; check 8 `git check-ignore` lines pass.
- AC2 migration replay: check 6 reset succeeds; `001_migration_replay.test.sql` passes
  `replay_shops_created`, `replay_profiles_role_check_allows_super_admin`,
  `replay_bookings_quote_trigger_exists`, `replay_bookings_rating_columns_exist`,
  `replay_storage_policies_replaced`, `replay_schema_migrations_has_baseline_and_five`.
- AC3 baseline cannot reach remote: check 8 plus the six stager tests in check 5.
- AC4 signup trigger: `harness_signup_trigger_creates_profile_with_metadata` (000 file).
- AC5 helpers: `harness_act_as_sets_auth_uid`, `harness_act_as_role_wrapper_rejects_wrong_role`,
  `harness_act_as_anon_has_no_uid`, `harness_act_as_service_returns_to_superuser`.
- AC6 J18 DB: every section 6 test passes except the F5 TODO (checks 6, 7).
- AC7 J17 harness: section 7 regular tests pass; 7 W2 TODOs (6 before fix cycle 1) exist and genuinely fail (check 7).
- AC8 Vitest: check 3 lists every section 9 test; checks 1 and 2 still exit 0.
- AC9 regression: check 4 still 4 passed; no non-test file under `frontend/src` changed:
  `git diff --name-only 979723d -- frontend/src | grep -v -E "\.test\.tsx?$|/src/test/"` empty.

## 12. Rollback

Purely additive tooling; nothing is applied anywhere except a local Docker stack. Rollback =
revert the W1 commit; `npx supabase stop --workdir .local-supabase-test --no-backup`; delete
`.local-supabase-test/`; `npm uninstall` the five devDependencies. No database rollback is
needed because no committed migration is added.

## 13. Risks and flags

- R1 Baseline drift from production (D-10): local passes prove nothing about the linked
  project; policies are a reconstruction. Mitigation: labels, docs, D-10 human dump and diff.
- R2 Section 0 / D-11: any future `db push` of `YYYY_MM_DD_*` files collides on version
  `2026`. A human must decide on renaming before deploy. The harness hides this locally by
  design; LOCAL_TEST_HARNESS.md says so.
- R3 The baseline reproduces E1/E2/E5/S1/S2 on purpose; it must never be copied to a real
  project (header, staged-only, AC3).
- R4 pgTAP TODOs could hide regressions if misused; mitigated by the fixed count of 8 (7 before fix cycle 1) and check 7.
- R5 `auth.users` columns vary between CLI image versions; `create_user` inserts only stable
  columns. Port clashes with a stack started from the root: stop it first; distinct project_id.
- R6 Vitest must never load `frontend/.env` or reach the network: isolated envDir, placeholder
  env, fetch stub, harness tests. Nobody reads or prints `.env`.
- R7 Vite 8 / Vitest 4 / TypeScript 6 compatibility: if the Vitest peer range rejects Vite 8,
  use the newest compatible Vitest and record it; do not downgrade Vite.
- Legal: none new. Test data is synthetic (`@local.test` emails, placeholder password). No
  fabricated signatures, certifications, compensation or compliance claims.
