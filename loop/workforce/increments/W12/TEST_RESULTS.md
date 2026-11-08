# W12 - TEST RESULTS (local stack only, 2026-10-29, base HEAD 8c84bf8, nothing committed)

| Command | Exit | Result |
|---|---|---|
| `cd frontend && npm run lint` | 0 | clean |
| `cd frontend && npm run build` | 0 | built |
| `cd frontend && npm test` | 0 | Test Files 136 passed (136); Tests 274 passed (274) (263 existing + 11 new) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` (fresh stage, db reset) | 0 | Files=98, Tests=3028, Result: PASS |
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
| `w14-api-smoke.mjs` | 0 | 33 passed, 0 failed |
| `w12-api-smoke.mjs` (new, 230 lines) | 0 | 22 passed, 0 failed |
| `npx supabase stop --workdir . --no-backup` (from `.local-supabase-test`) | 0 | stopped; 0 supabase_ containers |

DB run WARNINGs (all expected): `j17_w12_notification_registry:140` and `:148` (intended unregistered / deleted category skips),
`j17_w3_notifications:238` (pre-existing `test.safe`).

## Smoke w12 coverage
Registry and job state denied for select / insert / update / delete (owner, worker, other, super_admin, service_role, anon); 55 RPC calls
(runner, pending, both batches, pair lock, raw W7/W9/W10 jobs with a date, enqueue_notification, set_config) x 5 roles all refused;
`admin_workforce_scheduled_jobs` 3 rows for super_admin, 0 for owner / worker / customer, 42501 for anon and service_role, no id columns;
job application -> exactly one owner notice, no marker / phone / email text; shop verification -> exactly one owner notice; every delivered
category registered; keyset paging (frontend F2 query shape) walks 12 real rows (6 share one created_at) once each in order; unread filter and
unread paging match; `mark_notifications_read` 201 ids -> 22023, foreign / unknown ids ignored, anon refused, repeat 0, no other edits, null = all;
trusted psql runner call inside `begin ... rollback` -> `completed`, no job state left, no pg_cron; notification tables not in Realtime;
all smoke12 users deleted. No cron registered. Register script re-run in `begin; ... rollback;`: 3 `washlink_workforce_%` jobs inside, `pg_cron` 0 after.

## Plan section 6 coverage
Every pgTAP test name in PLAN section 6 (7 files + 2 replay names) and every Vitest name was found by grep; `todo_start(` count 0 in all files.

## AC evidence
- AC1: 5 w12 migrations, `grep -L -- "-- ROLLBACK"` empty; `git diff --name-status 8c84bf8 -- supabase/migrations` empty (all 5 are untracked additions).
- AC7: `grep -rniE "pg_cron|cron\.schedule" supabase/migrations` empty (exit 1); register script head starts "HUMAN-RUN ONLY, after human approval".
- AC10: producer / W7 / W9 / W10 `create or replace` grep over w12 migrations empty; `git diff --stat 8c84bf8 -- supabase/tests/database` only
  `001_migration_replay.test.sql` (+10 -5) plus 7 new untracked files.
- AC11: `grep -rn "service_role" frontend/src` empty.
- AC12: `git diff --stat 8c84bf8 -- backend frontend/smtp-test.js frontend/smtp-test.cjs` empty, `git status` clean for them; "Runbook" present in
  NOTIFICATIONS_AND_SCHEDULING.md (line 209); `grep -c "W12-L"` in LEGAL_REVIEW_REGISTER.md = 12 (>= 8); largest changed file 350 lines.

## Failures
None. No product code changed. Only test code added: `scripts/supabase-test/w12-api-smoke.mjs`.
