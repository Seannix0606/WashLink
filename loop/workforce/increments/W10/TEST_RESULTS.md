# W10 - TEST_RESULTS (2026-10-28, local stack only, no commit)

Test gap fill: added `scripts/supabase-test/w10-api-smoke.mjs` (344 lines, 38 checks; PLAN section 6 smoke list plus
anon / customer / service_role denials). All 107 per-test names in PLAN section 6 (pgTAP and Vitest) were found by `grep -F` in
`supabase/tests` / `frontend/src`; the 9 other tokens are the pgTAP file names and all 9 files exist. 0 `todo_start(` in every
pgTAP file. No product bug found. Docker was already running.

| Command | Exit | Result |
|---|---|---|
| `cd frontend && npm run lint` | 0 | `eslint .` no output |
| `cd frontend && npm run build` | 0 | `tsc -b && vite build`, built in 588ms |
| `cd frontend && npm test` | 0 | Test Files 106 passed (106), Tests 206 passed (206) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` (clean replay of 69 migrations) | 0 | `All tests successful.` Files=72, Tests=2347, Result: PASS; 0 `not ok` |
| w2 / w3 / w4 / w5 / w6 / w7 / w8 / w9 smokes (same stack, in order) | 0 each | 48 / 33 / 43 / 39 / 40 / 38 / 30 / 34 passed, 0 failed each |
| `node scripts/supabase-test/w10-api-smoke.mjs` (run twice) | 0 | `w10-api-smoke: 38 passed, 0 failed` both times (policy restored to 3, repeatable) |
| `npx supabase stop --workdir .local-supabase-test --no-backup` | 0 | Stopped supabase local development setup |

## Acceptance evidence
| AC | Evidence (actual) |
|---|---|
| AC1 | 7 files `2026_10_28_w10[a-g]_*.sql`; `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_28_w10*` empty; `git diff --name-status e43c2db -- supabase/migrations` empty (no M / D; the 7 files are untracked = added) |
| AC2 | Result: PASS, 72 files / 2347 tests; 0 `todo_start(` |
| AC3-AC5, AC7-AC9, AC11 | all 9 W10 pgTAP files `ok`; all names present; every pre-W10 file ok |
| AC6 | all `j16_*` pgTAP and Vitest names present; smoke: terminate (min 5) succeeds, count 2; decline succeeds, no relationship row; `git diff e43c2db -- TerminateContractModal.tsx DeclineContractModal.tsx` = 0 lines |
| AC10 | w10 smoke 0 failed; w2..w9 smokes 0 failed |
| AC11 | `git status`: only `001_migration_replay.test.sql` modified under supabase/tests; the 9 W10 files untracked-new; pytest 4 passed; stager 19 pass |
| AC12 | 106 files / 206 tests pass (191 existing + 15 new); lint and build exit 0; `grep -rn "service_role" frontend/src` = 0 lines |
| AC13 | largest changed / added code file is 350 lines (`stage-local-workdir.test.mjs`), smoke 344; `git diff --stat e43c2db -- backend` empty; no `.env` read. Docs part IN PROGRESS by another agent (not checked as final): `docs/workforce/OWNER_RELATIONSHIPS.md` exists; `grep -c "W10-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` = 11 lines at this moment (>= 8); other section-7 doc updates not verified |
