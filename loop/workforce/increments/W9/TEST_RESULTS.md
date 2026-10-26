# W9 - TEST_RESULTS (2026-10-27, local stack only, no commit)

Test gap fill: none needed. Every pgTAP name (82 per-test names across the 9 W9 files) and every Vitest name (16 from PLAN
section 6) was found by `grep -F` in `supabase/tests` / `frontend/src`; no test was added or changed in this step. 0
`todo_start(` in every pgTAP file. No product bug found.

Environment note: Docker Desktop was not running at first (`run-db-tests.mjs` exit 1, `DockerLifecycleInspectError`, no tests
ran). Documented fix attempted once: started Docker Desktop; the daemon was up within ~20 s; the runner was then re-run.

| Command | Exit | Result |
|---|---|---|
| `cd frontend && npm run lint` | 0 | `eslint .` no output |
| `cd frontend && npm run build` | 0 | `tsc -b && vite build`, built in 453ms |
| `cd frontend && npm test` | 0 | Test Files 97 passed (97), Tests 191 passed (191) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` (first try, Docker down) | 1 | stack failed to start; nothing ran |
| `node scripts/supabase-test/run-db-tests.mjs` (clean replay of 62 migrations) | 0 | `All tests successful.` Files=63, Tests=2178, Result: PASS; 0 `not ok` |
| w2 / w3 / w4 / w5 / w6 / w7 / w8 / w9 smokes (same stack, in order) | 0 each | 48 / 33 / 43 / 39 / 40 / 38 / 30 / 34 passed, 0 failed each |
| `npx supabase stop --workdir .local-supabase-test --no-backup` | 0 | Stopped supabase local development setup |

## Acceptance evidence (PLAN section 8)

| AC | Evidence (actual) |
|---|---|
| AC1 | 10 files `2026_10_26_w9[a-j]_*.sql`; `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_26_w9*` empty; `git diff --name-status 81be37d -- supabase/migrations` empty (no M / D); the 10 w9 files are untracked (added) |
| AC2 | 62 staged migrations (`ls .local-supabase-test/supabase/migrations` = 62); Result: PASS; `replay_schema_migrations_has_baseline_w2_to_w9` and `replay_w9_worker_contract_tables_rls_enabled` in `001_migration_replay.test.sql` (file ok); files with `todo_start(` = 0 |
| AC3-AC6, AC9, AC11, AC12, AC13 | all 9 W9 pgTAP files `ok` in the runner; all section-6 names present by name; every pre-W9 file ok; Vitest names present, 97 files / 191 tests green |
| AC7, AC8, AC10 | named tests present and in passing files (see above) |
| AC12 | w9 smoke 34 passed, 0 failed; w2..w8 smokes 0 failed |
| AC13 | `git diff --stat 81be37d -- supabase/tests/database`: only `001_migration_replay.test.sql` (17 insertions, 6 deletions); the other 9 files untracked-new; pytest 4 passed; stager 19 pass |
| AC14 | `grep -rn service_role frontend/src` empty (0 lines); lint / build exit 0; 191 tests pass (174 existing + 17 new) |
| AC15 | no added / changed code file > 350 lines (`wc -l` checked on every changed / untracked non-.md file; `WORKER_CONTRACTS.md` 231); `git diff --stat 81be37d -- backend` empty; docs listed in PLAN section 7 exist; `grep -c "W9-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` = 17 lines (12 register rows W9-L1..L12); no `.env` read |
