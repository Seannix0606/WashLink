# W11 - TEST RESULTS (2026-10-29)

Local stack only (`.local-supabase-test`, project `washlink-local-test`). No `--linked`, `--db-url`, `db push`, no `.env` read, nothing committed.

| Command | Exit | Result (copied from output) |
|---|---|---|
| `cd frontend && npm run lint` | 0 | eslint, no output |
| `cd frontend && npm run build` | 0 | `built in 604ms` |
| `cd frontend && npm test` | 0 | Test Files 117 passed (117); Tests 228 passed (228) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | All tests successful. Files=81, Tests=2589; Result: PASS |
| `w2-api-smoke.mjs` | 0 | 48 passed, 0 failed |
| `w3-api-smoke.mjs` | 0 | 33 passed, 0 failed |
| `w4-api-smoke.mjs` | 0 | 43 passed, 0 failed |
| `w5-api-smoke.mjs` | 0 | 39 passed, 0 failed |
| `w6-api-smoke.mjs` | 0 | 40 passed, 0 failed |
| `w7-api-smoke.mjs` | 0 | 38 passed, 0 failed |
| `w8-api-smoke.mjs` | 0 | 30 passed, 0 failed |
| `w9-api-smoke.mjs` | 0 | 34 passed, 0 failed |
| `w10-api-smoke.mjs` | 0 | 39 passed, 0 failed |
| `w11-api-smoke.mjs` (new, 350 lines) | 0 | 34 passed, 0 failed (first run 33/3: test-code faults only, fixed) |
| `npx supabase stop --workdir . --no-backup` (from the workdir) | 0 | Stopped supabase local development setup. |

The w2..w10 smokes ran once on the fresh stack before the final w11 run; w11 was run twice (the first run exposed three faults in the smoke itself: an unsent-draft
fixture without an accepted application, a status read the worker has no RLS right to do, and a notification regex that matched legitimate shop names). No product
code failure.

## Plan section 6 coverage
Every named test/file exists: 9 pgTAP files (plan 31/42/14/24/24/16/12/18/51 = 232) plus the replay changes; every Vitest name found in `frontend/src`; `grep -c "todo_start("`
non-zero in 0 files. Smoke checks: direct writes denied (owner, worker, customer, service_role, super_admin, anon); summaries one row per right role only; review
escalation refused before the shop decides and for an active certificate, allowed once the shop request is overdue (backdated 15 days, request becomes withdrawn);
second open refused 23505; holds (revoke, new shop request) refused; owner/worker/customer/service_role/anon cannot decide; super_admin queue and audited case; uphold, then second
escalation refused; owner removed -> issuer_unavailable escalation -> reinstate; disputes (unsent draft refused, category mismatch, strangers refused, duplicate 23505, response once,
non-admin case refused, case audited each call and document of that contract only, close rules, contract unchanged, no contract block after close, withdraw, terminate and decline not blocked);
notifications without statement text; basis function and `set_config` not callable; anon denied; worker delete cascades and audits.
Not covered by the smoke: `upheld_by_shop` basis (pgTAP covers it) and the `closed` / `withdrawn` realtime path.

## AC evidence
- AC1: 9 files `2026_10_29_w11[a-i]*`; `grep -L -- "-- ROLLBACK"` empty; no migration under `git diff --name-status 6ce3f61 -- supabase/migrations` (all 9 are untracked = additions, nothing committed changed).
- AC2: Result PASS, 0 files with `todo_start(`. AC3-AC6, AC8, AC10, AC11: covered by the runner PASS (each W11 pgTAP file ok) and the smoke.
- AC7: the five J16 frontend files show an empty `git diff 6ce3f61`.
- AC12: `git diff --name-status 6ce3f61 -- supabase/tests/database` = only `M 001_migration_replay.test.sql` (new tests are untracked); pytest 4 passed; stager 19 pass.
- AC13: 228 Vitest pass (209 + 19); lint/build exit 0; `grep -rn "service_role" frontend/src` = 0 matches.
- AC14: no added/changed code file (ts, tsx, mjs, sql) over 350 lines; every `docs/workforce/*.md` <= 350; `git diff --stat 6ce3f61 -- backend` empty;
  `docs/workforce/DASHBOARDS_AND_OVERSIGHT.md` exists; `grep -c "W11-L" LEGAL_REVIEW_REGISTER.md` = 14 (>= 10). Docs part: present now, but the other agent was still updating docs/, so not
  re-verified for content (frontend paths still to be checked against the built file list) - status noted, not failed.
