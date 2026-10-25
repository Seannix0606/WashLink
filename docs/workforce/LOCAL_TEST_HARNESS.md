# Local test harness (W1, hardened in W2, extended in W3 and W4)

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

Expected (after W4): the reset applies 22 migrations (baseline `00000000000000`, the
2026_04_17 copy, owner-policies baseline `20260417000002`, the other 4 pre-W2 copies, the
6 W2 copies `20261024000001..06`, then the 5 W3 copies `20261024000007..11`: w3a, w3b, w3c, w3d0 preflight, w3d, then the 4 W4 copies
`20261024000012..15`: w4a preflight, w4b, w4c, w4d) and seeds the
helpers; `test db` runs 20 files (749 assertions after W4 build) and ends with `Result: PASS`. There are 0 TODO blocks: any `Failed (TODO)` or `TODO passed` line is a finding.

## Why a staged workdir

- D-1: `profiles`, `workers`, `bookings` and the signup trigger are not in
  `supabase/migrations/`. `scripts/supabase-test/baseline/local_test_baseline.sql` reconstructs
  them (from code + migrations, see `ARCHITECTURE_AUDIT.md`). The baseline files live outside
  the repo's `supabase/` folder entirely: in `supabase/migrations/` `db push` would send them to
  a real project, and `supabase test db` (also with `--linked`/`--db-url`) runs EVERY `.sql`
  under `supabase/tests/`. Since W2 (S11) the stager refuses to run, and the stager test
  `repo_has_no_stray_sql_under_supabase` fails, if any `.sql` exists anywhere under
  `supabase/` other than `supabase/migrations/*.sql` and `supabase/tests/database/*.sql`
  (no `seed.sql`, no nested folders).
- Seed rule (W2, S10): the repo `supabase/config.toml` keeps `[db.seed] enabled = false`, so a
  reset run from the repo root by mistake never seeds anything. The stager rewrites it to
  `enabled = true` (with the staged `sql_paths`) in the staged copy only, and refuses to stage
  if the `enabled = false` line is missing from the repo config.
- Project id rule (W2, S11): the stager asserts the staged `project_id` ends in `-local-test`;
  `run-db-tests.mjs` re-reads `.local-supabase-test/supabase/config.toml` before every CLI call
  and exits 2 if it does not.
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
  Layout: `supabase/migrations/` (the 2 baseline migrations + the 20 copies),
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
  `create_roster_worker`, `create_booking_fixture`, W4 `create_verified_shop(owner, reviewer)`
  (approved with a recorded review) and `create_job_opening(shop, title)` (complete draft)
  (fixtures require `act_as_service()`).
- Ids are passed between statements with `set_config('fx.<name>', ..., true)` /
  `current_setting('fx.<name>')`, readable under any role.
- Never print a bare `ok` from a plain `select`: TAP counts it as a test.

## TODO placeholders (honesty rule)

W1 shipped 8 `todo_start(` wrappers (F5 in j18; E1, E2, E3, E5, S1, S2, S9 in j17). W2 removed
all of them: `grep -c "todo_start(" supabase/tests/database/*.sql` is 0 for every file. The j17
assertions are unchanged; F5 was rewritten to call `submit_shop_for_verification()` (the
direct UPDATE stays rejected: `j17_owner_cannot_directly_resubmit_changes_requested_shop`).
The baseline still reproduces the weaknesses on purpose, so those assertions only pass
because the W2 migrations fix them. Any new `todo_start(` is a FAIL unless a plan allows it.

## pgTAP files (after W4 build: 20 files, 749 assertions)

| File | Plan | Covers |
|---|---|---|
| `000_harness_sanity.test.sql` | 9 | helpers, identity switching |
| `001_migration_replay.test.sql` | 17 | replay of 22 migrations, W2 objects, W2, W3 and W4 RLS on, definer search_path |
| `j17_authorization_harness.test.sql` | 40 | W1 J17 + former placeholders, S4 counterparties, S5 |
| `j17_w2_fix1_fk_cascades.test.sql` | 31 | S-B1: `on delete set null` cascades (customer, linked worker account, reviewing admin, owner, roster rows in any booking status) pass every guard and change only the FK column |
| `j17_w2_fix1_review_and_hardening.test.sql` | 42 | C-B1 review stamping, stricter gate, D-10 audit query; fail-closed trusted session; booking/shop/document hardening; peppered, locked, pruned link-code attempts; realtime exclusion; no availability default |
| `j17_w2_shop_booking_guards.test.sql` | 32 | E3/C3, S6, S7, F5 guard, gate helper, trusted session, booking transitions |
| `j17_w2_worker_data_guards.test.sql` | 34 | worker profile / contact privacy, link-code RPC authorization |
| `j17_w3_audit_events.test.sql` | 60 | W3 audit table: server-only insert, append-only for every role, trusted retention purge, derived actor fields, super_admin read, payload rules, realtime exclusion, R-1 `pg_temp` pinning and temp-table shadowing |
| `j17_w3_audit_wiring.test.sql` | 31 | every wired W2 action writes its event (shop decision / submission / S6 reset, link code, link, worker / owner unlink, linked row delete, worker profile delete, trusted role change), review log survives reviewer deletion and is super_admin only, no private data in payloads |
| `j17_w3_notifications.test.sql` | 61 | recipient isolation, no direct insert / enqueue / edit, mark-read rules and idempotency, producer once-only, text rules and safe label, deleted recipients |
| `j18_existing_flows.test.sql` | 64 | W1 J18 + F5 RPC + every W2-guarded frontend write path |
| `j18_w2_profile_reads.test.sql` | 19 | R2: profile and counterparty-name reads, phone_number privacy |
| `j18_w3_flows.test.sql` | 21 | W2 review / link / unlink flows and shop, owner and worker deletes still work with the W3 AFTER triggers and leave sensible audit rows (j18_existing_flows is at the 350-line limit) |
| `j1_worker_registration_and_profile.test.sql` | 55 | J1 signup roles, worker profile, roster link codes (W4: the linked owner's shop is a `create_verified_shop` fixture, R-2) |
| `j17_w3_idempotency_and_leaks.test.sql` | 24 | W3 producer idempotency and payload leaks |
| `j2_owner_can_create_and_manage_only_own_job_openings.test.sql` | 63 | J2: own-shop create / edit / delete, drafts private, worker-only published reads, pay stored as entered, no defaults, limits, 50 per shop |
| `j2_job_opening_lifecycle.test.sql` | 48 | J2 lifecycle matrix, stale 55000, RPC-only status, read-only closed/archived, published edit rules, audit without content, no notifications |
| `j3_unverified_owner_cannot_publish_job_openings.test.sql` | 42 | J3: publish / resume need a recorded verification; losing it (decision, S6, reviewer deletion) hides openings from workers |
| `j17_w4_job_opening_authorization.test.sql` | 35 | privileges, internal functions, super_admin write denial, pinning, realtime, R-2 shared rule, cascades, trusted repair |
| `j18_w4_flows.test.sql` | 14 | shop edit / delete, admin review, roster preview and bookings unaffected by W4 |

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

## W2 API smoke (local stack only)

```sh
node scripts/supabase-test/w2-api-smoke.mjs   # needs the stack left running by run-db-tests.mjs
```

Signs up synthetic `@local.test` users through the local GoTrue HTTP API with metadata roles,
calls the W2 RPCs through PostgREST (supabase-js) and deletes the users afterwards. The API URL
and keys come from `supabase status -o env --workdir .local-supabase-test`, stay in memory, and a
non-loopback URL is refused. Note: the baseline signup trigger has no metadata-sync on update, so
the `updateUser` assertions prove the profile never follows metadata; the GoTrue silent-restore
branch itself (R4) is still only covered by review.

## W3 API smoke (local stack only)

```sh
node scripts/supabase-test/w3-api-smoke.mjs   # after run-db-tests.mjs (and w2-api-smoke.mjs), before stopping the stack
```

Same safety rules as the W2 smoke script (loopback URL only, keys from `supabase status` held in
memory and never printed, no `.env`, synthetic `@local.test` users deleted with the result
asserted). Checks through PostgREST / GoTrue: direct inserts into `workforce_audit_events` and
`notifications` fail (42501); `rpc('record_workforce_audit_event')` and
`rpc('enqueue_notification')` fail with 42501 (also for the service_role key);
`rpc('set_config')` is not exposed; non-admin audit and review-log reads return 0 rows; a super
admin approves a shop and the owner lists exactly 1 notification; `mark_notifications_read`
returns 1, then 0; the service_role key cannot insert, update or delete audit rows; a GoTrue
`deleteUser` of a linked worker writes a `roster.unlinked` event with `account_deleted` and
`actor_kind = system`; the review log survives owner and shop deletion. Must end `0 failed`
(W3 build: 33 checks).

## W4 API smoke (local stack only)

```sh
node scripts/supabase-test/w4-api-smoke.mjs   # after run-db-tests.mjs (and the W2 / W3 smokes), before stopping the stack
```

Same safety rules as the W2 / W3 smoke scripts (loopback URL only, keys from `supabase status` held in
memory and never printed, no `.env`, synthetic `@local.test` users deleted with the result asserted).
Checks through PostgREST / GoTrue: anon read fails or returns 0 rows; the owner inserts a draft without
sending owner_id / status / stamps; publish is rejected with `Only a verified shop can publish job openings.`
until a super admin approves the shop; the worker then lists 1 opening, customer and other owner 0; the other
owner's update changes 0 rows and its RPC gets 42501; direct status and stamp PATCHes fail; `set_config` is
not exposed; a stale transition gets 55000; deleting a published opening removes nothing; pause / resume /
close / archive succeed; archived cannot be reopened or edited; a draft delete works; 5 status events are
audited; the owner has no job-opening notifications; a GoTrue `deleteUser` of the owner cascades the opening
and writes `job_opening.deleted` with `owner_account_deleted`. Must end `0 failed` (W4 build: 35 checks).
