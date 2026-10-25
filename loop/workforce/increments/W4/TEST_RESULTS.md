# W4 - TEST_RESULTS (actual output, local only, no commit)

Run from a stopped stack; `run-db-tests.mjs` started it; stack stopped afterwards
(`npx supabase stop --workdir .local-supabase-test --no-backup`, exit 0).

| Command | Exit | Result |
|---|---|---|
| `cd frontend && npm run lint` | 0 | no findings |
| `cd frontend && npm run build` | 0 | `tsc -b && vite build`, built OK |
| `cd frontend && npm test` | 0 | Test Files 38 passed (38); Tests 62 passed (62) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 18, pass 18, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | Files=20, Tests=749, Result: PASS; 0 TODO lines; 0 `todo_start(` in every file |
| `node scripts/supabase-test/w2-api-smoke.mjs` | 0 | 48 passed, 0 failed |
| `node scripts/supabase-test/w3-api-smoke.mjs` | 0 | 33 passed, 0 failed |
| `node scripts/supabase-test/w4-api-smoke.mjs` | 0 | 43 passed, 0 failed (35 + 8 new `occ_*` checks) |

## Optimistic-concurrency round-trip (new in the W4 smoke, same supabase-js calls as SupabaseJobOpeningRepository)
All 8 pass, so the `eq('updated_at', <PostgREST text>)` path works; this closes the VERIFY item in LOG.md:
- `occ_read_returns_updated_at_text`, `occ_update_with_current_updated_at_affects_one_row` (1 row),
  `occ_updated_at_advances_after_update`, `occ_update_with_returned_updated_at_chains` (1 row)
- `occ_stale_updated_at_affects_zero_rows` (0 rows, no error)
- `occ_non_owner_update_affects_zero_rows` (0 rows, no error)
- `occ_delete_non_draft_affects_zero_rows` (`.eq('status','draft')` on an archived opening: 0 rows)
- `occ_draft_cleanup_delete_affects_one_row`
No product bug found; no product code changed.

## Test review against PLAN J2/J3/J17/J18 mapping
All 80 test names in PLAN section 5 (pgTAP + Vitest) are present in `supabase/tests/database/*.sql` or `frontend/src/**/*.test.*`
(only non-match: `j18_w4_flows`, which is the file name). No gaps found; no tests added or changed other than the smoke script.

## Safety greps
- `git diff --name-status 36784d6 -- supabase/migrations`: only the 4 `A` lines (w4a..w4d); w3-and-earlier unchanged.
- `git diff 47b5d55 -- supabase/migrations`: empty (w4 migrations unchanged). Each w4 file contains a `-- ROLLBACK` block (`grep -L` empty).
- Stray `.sql`: none outside `supabase/migrations/*.sql` and `supabase/tests/database/*.sql` (the 2 untracked are the j17_w4 and j18_w4 pgTAP files).
- Secrets / project ref / `service_role` / JWT-like strings in added lines and `frontend/src`: none.
- Line counts: largest changed/added file 350 (`scripts/supabase-test/baseline/test_helpers.sql`); none above 350.

> Note (orchestrator): after the review fixes Vitest is 38 files / 64 tests (was 62); verified in VERDICT.md.
