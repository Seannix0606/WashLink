# W1 - TEST_RESULTS (2026-10-24, local only; stack started from stopped state, stopped at end)

| Command | Exit | Result |
|---|---|---|
| `cd frontend && npm run lint` | 0 | eslint clean |
| `cd frontend && npm run build` | 0 | tsc -b + vite build ok |
| `cd frontend && npm test` | 0 | Test Files 8 passed (8); Tests 14 passed (14); 0 skipped/todo |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 6, pass 6, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | reset applied baseline + 5 migrations; `Files=4, Tests=71`, `Result: PASS`; 8 `Failed (TODO)` lines = j17 13-18, j18 31-32; no "TODO passed" |
| Check 7 (todo lines removed in staged copies only, then restored) | n/a | `Result: FAIL`, failed tests exactly j17 13-18 and j18 31-32 (the 7 named TODO tests, F5 has 2 assertions); restored run `Result: PASS` |
| `grep -o "todo_start(" supabase/tests/database/*.sql \| wc -l` | 0 | 7 |

Safety greps: `git status --porcelain supabase/migrations` empty; `git diff --stat 979723d -- supabase/migrations` empty;
no "LOCAL TEST BASELINE ONLY" in supabase/migrations; `git check-ignore` prints `supabase/.temp/cli-latest` and
`.local-supabase-test`; no `.local-supabase-test/supabase/.temp/project-ref`; `git ls-files supabase/.temp .local-supabase-test`
empty; non-test changes under `frontend/src` vs 979723d: none.

Review: all plan section 6/7/9 and AC2/AC4/AC5 test names exist (pgTAP descriptions, Vitest `it` titles). The 7 TODOs run real
assertions that fail against the baseline (check 7), so they are not vacuous. No plan gap found. Note: the F5 TODO and the
`j17_*` multi-assertion names reuse one name for several assertions (by design).
Caveat (D-10): local results say nothing about the linked project.

## Fix cycle 1 (db part) - superseding counts

| Command | Exit | Result |
|---|---|---|
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 12, pass 12, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` (from stopped stack) | 0 | reset applied 00000000000000, 20260417000001, 20260417000002 (owner policies), 20260418000001, 20261021000001, 20261022000001, 20261022000002; `Files=4, Tests=91`, `Result: PASS`; 22 `Failed (TODO)` lines = j17 16-29, 31-36 and j18 31-32; no "TODO passed" |
| Check 7 (todo lines removed in staged copies only, then re-staged) | 1 | `Result: FAIL`, failed tests exactly j17 16-29, 31-36 and j18 31-32 |
| `grep -o "todo_start(" supabase/tests/database/*.sql \| wc -l` | 0 | 8 (expectation is now 8: S9 added) |

See LOG.md "Fix cycle 1" for details. The vitest row above is not re-run here (frontend item 8 is with another engineer).
