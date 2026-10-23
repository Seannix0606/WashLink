# W2 - TEST RESULTS (local only, 2026-10-24)

| Command | Exit | Result |
|---|---|---|
| `cd frontend && npm run lint` | 0 | eslint, no findings |
| `cd frontend && npm run build` | 0 | tsc -b + vite build, built |
| `cd frontend && npm test` | 0 | 23 files, 34 tests passed |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 18, pass 18, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | fix cycle 1 (DB): 13 migrations replayed, Files=10, Tests=341, Result: PASS, 0 TODO lines (BUILD: Files=8, Tests=268) |
| `node scripts/supabase-test/w2-api-smoke.mjs` | 0 | fix cycle 1 (DB): 48 passed, 0 failed (BUILD: 29; old migrations with the new script: 38 passed, 10 failed) |
| `npx supabase stop --workdir .local-supabase-test --no-backup` | 0 | stopped; 0 supabase containers left |

Safety: `grep -c "todo_start(" supabase/tests/database/*.sql` 0 in all 10 files (fix cycle 1); `git diff --stat eb38246 --
supabase/migrations` empty (only the 6 new w2 files are untracked); no `.sql` under `supabase/` outside
`migrations/` and `tests/database/`; no project ref, `supabase.co` URL or JWT-like key in changed files
(.env files not read); the smoke script keeps URL and keys in memory only.

Test review: every J1/J17/J18 test name in PLAN section 6 exists in supabase/tests or frontend/src (0 missing).

Caveat (R4): the baseline signup trigger has no metadata sync on update, so the `updateUser` checks prove
the profile never follows metadata, but the GoTrue `supabase_auth_admin` silent-restore branch is still not
exercised (needs the production sync trigger; D-10 checklist). RPC `.select()` with `shop_pricing` embedding
was not exercised (the smoke selects plain shop columns).

Fix cycle 1 (DB): frontend lint/build/Vitest and pytest were not re-run by the DB engineer (frontend/ untouched; the frontend engineer re-runs them). Stager tests 18/18. Stack stopped afterwards (0 supabase containers).
