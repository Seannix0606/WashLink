# W13 - TEST RESULTS (2026-10-30, branch feature/workforce, HEAD eeb552b, uncommitted; local stack only)

| Command | Exit | Result |
|---|---|---|
| `cd frontend && npm run lint` | 0 | no output after `eslint .` |
| `cd frontend && npm run build` | 0 | `built in 631ms` |
| `cd frontend && npm test` | 0 | Test Files 144 passed (144); Tests 295 passed (295) |
| `backend/.venv/Scripts/python.exe -m pytest -q` (repo root) | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` (clean reset) | 0 | Files=105, Tests=3185, All tests successful, `Result: PASS`; 0 `todo_start(` |
| `node scripts/supabase-test/run-api-smokes.mjs` (same stack) | 0 | `run-api-smokes: PASS (13 smokes)`, all 0 failed |
| `npx supabase stop --workdir .local-supabase-test` | 0 | stopped; 0 `supabase_*` containers |

Smokes (passed/failed): w2 48/0, w3 33/0, w4 43/0, w5 39/0, w6 40/0, w7 38/0, w8 30/0, w9 34/0, w10 39/0, w11 36/0, w14 33/0, w12 22/0, w13 17/0 (w13 last).

## w13 smoke count: 17 is true
`w13-api-smoke.mjs` has 13 literal `check('name', ...)` names (lines 115, 125, 127, 133, 159, 164, 167, 170, 204, 209, 212, 217, 230)
plus 4 calls of `check(\`delete_user_${label}\`, ...)` inside `deleteUserChecked` (worker, owner, customer, super_admin; line 219).
13 + 4 = 17. A grep for literal names misses the templated name. Docs saying 13 should say 17 (13 named checks + 4 delete_user_*).

## Plan section 6 existence
All 6 new pgTAP files exist; every named test in each is present (grep per name, 0 missing); renamed tests present under the new names;
old names appear only in explanatory comments (j17_w3_audit_events:136, j17_w3_audit_wiring:122). `j13_w12_scheduled_jobs` keeps the
old name exactly once (AC10). w3 smoke renames present. Nothing had to be added.

## Evidence greps
- AC1: 4 w13 migrations, all contain `-- ROLLBACK`; `git diff --name-status eeb552b -- supabase/migrations` empty (only untracked adds).
- AC2: 105 pgTAP files; 94 migration files in supabase/migrations + baseline = 96 staged (replay test lists up to 20261030000009); 0 todo_start.
- AC3: J1-J18 loop prints nothing for both pgTAP (`j<n>_*.test.sql`) and Vitest (`*.j<n>.test.*`).
- AC6: raw-table / view reads in smokes are only negative checks (w3, w10:250, w13).
- AC8: `grep -c "create or replace function"` in w13d = 1. AC9: "can end this contract at any time" count = 0.
- AC13: all 6 docs exist. AC14: Part 1 = 81, Part 2 = 72, index = 7, total 160, all OPEN, 0 duplicate IDs.
- DEPLOYMENT_READINESS: 30 unchecked `- [ ]`, 0 ticked.
- AC15: `git diff eeb552b` empty for backend, smtp-test files, scripts/supabase-scheduling, and the J16 modals; largest changed/added file 350 lines
  (w11 smoke, three docs); none over 350. `grep -rn service_role frontend/src` empty. No .env read.
