# W6 - TEST RESULTS (2026-10-26, HEAD caca376, uncommitted tree, local only)

| Command | Exit | Result |
|---|---|---|
| `cd frontend && npm run lint` | 0 | no problems |
| `cd frontend && npm run build` | 0 | tsc -b clean, vite built |
| `cd frontend && npm test` | 0 | Test Files 70 passed (70), Tests 117 passed (117) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 18, pass 18, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | Files=37, Tests=1374, Result: PASS; 0 `not ok`; 0 TODO lines |
| `w2-api-smoke.mjs` | 0 | 48 passed, 0 failed |
| `w3-api-smoke.mjs` | 0 | 33 passed, 0 failed |
| `w4-api-smoke.mjs` | 0 | 43 passed, 0 failed |
| `w5-api-smoke.mjs` | 0 | 39 passed, 0 failed |
| `w6-api-smoke.mjs` | 0 | 40 passed, 0 failed |
| `npx supabase stop --workdir .local-supabase-test --no-backup` | 0 | Stopped |

Safety greps: `git diff --name-status caca376 -- supabase/migrations` empty (9 W6 files untracked/new only);
`grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_25_w6*` empty; no `.sql` outside migrations/ and tests/database/;
`todo_start(` count 0 in every file; no added/changed non-md file > 350 lines; no secret/token patterns in added or
changed files; no `service_role` in frontend/src; `worker_fee` in repositories only in the read select list and tests.

Test review: every planned J6/J7/J8/J17/J18 pgTAP name exists; no test added or changed (no gap needing a new test found).
Not verified: concurrency, ROLLBACK blocks executed, production parity, browser review.

## Review polish (DB), 2026-10-26 (uncommitted tree, local only)

| Command | Exit | Result |
|---|---|---|
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 18, pass 18, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | Files=38, Tests=1408 (+34 `j17_w6_review_polish`), Result: PASS; 0 TODO lines |
| `w2-api-smoke.mjs` | 0 | 48 passed, 0 failed |
| `w3-api-smoke.mjs` | 0 | 33 passed, 0 failed |
| `w4-api-smoke.mjs` | 0 | 43 passed, 0 failed |
| `w5-api-smoke.mjs` | 0 | 39 passed, 0 failed |
| `w6-api-smoke.mjs` | 0 | 40 passed, 0 failed |
| `npx supabase stop --workdir .local-supabase-test --no-backup` | 0 | Stopped |

Safety: `git diff --name-status caca376 -- supabase/migrations` empty; every W6 migration has `-- ROLLBACK`; W6 SQL files
<= 350 lines. Not verified: parallel-session concurrency, the realtime abort path, ROLLBACK execution, production parity.

> Note (orchestrator): after review polish, Vitest is 74 files / 128 tests and pgTAP 38 files / 1408 tests (see VERDICT.md).
