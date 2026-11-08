# W14 - TEST RESULTS (TEST & RUN, 2026-10-29)

Branch `feature/workforce`, base HEAD a880331, nothing committed. Local Docker stack only (`.local-supabase-test`, project `washlink-local-test`); no `--linked`,
`--db-url`, `db push`; no `.env` read; the supabase CLI never run from the repo root; the stack was stopped at the end (`supabase stop --no-backup`, no `supabase_*`
containers left). `docs/` not touched.

## Commands (clean run, real output)
| Command | Exit | Result |
|---|---|---|
| `cd frontend && npm run lint` | 0 | no findings (first run found 4 errors in my new DI test; fixed, rerun clean) |
| `cd frontend && npm run build` | 0 | `built in 658ms` |
| `cd frontend && npm test` | 0 | Test Files 130 passed (130), Tests 255 passed (255) = 233 existing + 21 W14 + 1 new DI test |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | Files=90, Tests=2850, `Result: PASS` (87 staged migrations) |
| `w2-api-smoke.mjs` | 0 | 48 passed, 0 failed |
| `w3-api-smoke.mjs` | 0 | 33 passed, 0 failed |
| `w4-api-smoke.mjs` | 0 | 43 passed, 0 failed |
| `w5-api-smoke.mjs` | 0 | 39 passed, 0 failed |
| `w6-api-smoke.mjs` | 0 | 40 passed, 0 failed |
| `w7-api-smoke.mjs` | 0 | 38 passed, 0 failed |
| `w8-api-smoke.mjs` | 0 | 30 passed, 0 failed |
| `w9-api-smoke.mjs` | 0 | 34 passed, 0 failed |
| `w10-api-smoke.mjs` | 0 | 39 passed, 0 failed |
| `w11-api-smoke.mjs` | 0 | 36 passed, 0 failed |
| `w14-api-smoke.mjs` (new, 315 lines) | 0 | 32 passed, 0 failed |

w12 and w13 smokes do not exist. The first w14 smoke run had 2 failures, both bugs in the smoke itself: the owner message text contained the word "statement",
which the "no statement key" regex matched; and the contract-hash fixture used the wrong table name `worker_contract_versions` (real table `contract_versions`).
Fixed in the smoke only; product code untouched. Final run above. The smoke asserts that no `smoke14-*` users remain.

## Added by this step
- `scripts/supabase-test/w14-api-smoke.mjs` (315 lines, loopback only, `smoke14-*@local.test` users deleted and asserted). Covers: direct insert / patch / delete /
  raw select denied on the 4 tables for owner, worker, customer, service_role, super_admin, anon; worker report (duplicate 23505, bad category 22023, short text
  23514, owner / customer / anon refused), per-opening limit 23514; owner sees no report, queue or statement; audited admin case read without reporter identity;
  stale revision 55000; non-admin 42501; pause with hold, owner resume 23514, owner notice with reason only; owner edit then submit; super_admin cannot edit or
  publish an opening; keep pause, lift, owner resumes; second report then close (W5 auto-close; application snapshot byte-equal); re-review of unreviewed approved
  shops (queue, outsiders denied, hidden then visible to workers, confirm / request_changes / reject, notes rule, repeat 23514); standard template published by
  super_admin only (owner, worker, customer, anon refused; stale 55000; `draft_requires_legal_review`; owner sees "newer standard"); owner template version clauses
  unchanged; redacted `my_workforce_activity` per role (no id keys, no uuid in details, owner sees no report events); audited admin audit log search; relationship
  lookups (purpose 22023, note 23514, unknown id `found:false`, 3 recorded and audited, no minimum, no worker count for the owner lookup, denied for owner / worker
  / customer / service_role / anon), lookup shown in the subject's activity; internal functions and `set_config` not callable by owner, worker, super_admin,
  service_role, anon; anon denied on the W14 RPCs; summary for super_admin only; notifications without free text; worker account deletion cascades reports.
  Limitation: "sent contract hashes unchanged" compares an md5 over all `contract_versions.content_hash` rows, which is `none` on this clean local stack (the smoke
  creates no contract); the real check is the pgTAP `j18_w14_platform_publish_leaves_owner_versions_and_contract_hashes_unchanged`.
- `frontend/src/features/superAdmin/SuperAdminDashboardPage.di.w14.test.tsx` (1 Vitest, `w14_production_di_gives_super_admin_nine_tabs`): the real
  `createSuperAdminDependencies` -> `createOversightDependencies` -> `createModerationDependencies` chain with only `getSupabaseClient` replaced; asserts
  `moderationDependencies` is defined and the console renders the nine D-57 tabs in order. (F2: callers without the moderation services keep the W11 five.)

## PLAN section 6 test inventory
- Every pgTAP test name in section 6 exists in `supabase/tests/database` (script check over all 86 names; the 8 files exist; the only "missing" tokens were the 8 file names).
- Every Vitest name in section 6 exists under `frontend/src` (all 21 found).
- `grep -c "todo_start(" supabase/tests/database/*.sql`: 0 in every file.
- Name / behaviour mismatch (D1), left as is: pgTAP `w14_worker_lookup_returns_rows_count_and_minimum` (j17_w14_relationship_lookups) asserts the minimum is ABSENT
  from `admin_worker_relationships`, because the pre-existing `j16_only_w10_reads_and_setter_reference_workforce_policies` forbids a W14 function from reading
  `workforce_policies`. The plan's "returning the current minimum" is therefore not met by the RPC; the console reads the minimum via the W10 policy read (F6).

## AC evidence
| AC | Evidence (real output) |
|---|---|
| AC1 | `ls supabase/migrations/2026_10_29_w14*` = 9 files; `grep -L -- "-- ROLLBACK"` empty; `git diff --name-status a880331 -- supabase/migrations` empty (new files are untracked) |
| AC2 | runner `Files=90, Tests=2850`, `Result: PASS`; `replay_schema_migrations_has_baseline_w2_to_w14` and `replay_w14_moderation_tables_rls_enabled` are inside that PASS; 0 `todo_start(` |
| AC3-AC5, AC8-AC11 | the 8 W14 pgTAP files all `ok` in the runner PASS; the W14 Vitest names pass; smoke checks above |
| AC6 | `grep -n "Runbook" docs/workforce/PLATFORM_MODERATION_AND_AUDIT.md` -> line 220 `## Runbook: approved shops without a recorded review` |
| AC7 | `git diff a880331 -- frontend/src/presentation/components/owner/contractTemplates` empty (0 lines) |
| AC12 | `git diff --stat a880331 -- supabase/tests/database`: only `001_migration_replay.test.sql` (13 insertions, 6 deletions) plus new untracked files; pytest 4 passed; stager 19 pass |
| AC13 | 255 Vitest pass; lint and build exit 0; `grep -rn "service_role" frontend/src` empty; `w14_super_admin_console_nine_tabs_default_overview` and the new DI test pass |
| AC14 | no modified or added `.ts/.tsx/.mjs/.sql/.md` file over 350 lines (checked over `git ls-files -m -o`); `git diff --stat a880331 -- backend` empty; `grep -c "W14-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` = 17 (>= 12); `grep -rni "take_over\|takeover" supabase/migrations/2026_10_29_w14*` = 0 matches |

## Not verified / notes
- Browser behaviour of the new screens (no browser test run); frontend tests use mocked repositories or a Supabase client double.
- Each smoke ran once on one stack; StrictMode double audited reads (R4) are not exercised.
- Production drift (R1, D-10 rows 46-48) cannot be checked locally.
