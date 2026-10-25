# W7 TEST & RUN results (2026-10-26, local only, no commit)

Test review: every plan section 5 pgTAP and Vitest name is present; gaps checked (completion regressed after correction, stale assessment id, unverified shop / non-issuer, immutability under a trusted session, no backdating, reasons, reinstate only from suspended, review limits, renewal window and superseding, shop deletion survival, D-20 gate with existing applications untouched). No test code needed changing. `backdate_certification` exists only in scripts/supabase-test/baseline/test_helpers_certifications.sql (and is called by tests), never in supabase/migrations. 0 `todo_start(`.

| Command | Exit | Result |
|---|---|---|
| cd frontend && npm run lint | 0 | no problems |
| cd frontend && npm run build | 0 | tsc -b + vite build OK |
| cd frontend && npm test | 0 | Test Files 81 passed (81); Tests 148 passed (148) |
| backend/.venv/Scripts/python.exe -m pytest -q | 0 | 4 passed, 1 warning |
| node --test scripts/supabase-test/stage-local-workdir.test.mjs | 0 | tests 19, pass 19, fail 0 |
| node scripts/supabase-test/run-db-tests.mjs | 0 | Files=46, Tests=1686, Result: PASS, 0 TODO lines |
| w2-api-smoke.mjs | 0 | 48 passed, 0 failed |
| w3-api-smoke.mjs | 0 | 33 passed, 0 failed |
| w4-api-smoke.mjs | 0 | 43 passed, 0 failed |
| w5-api-smoke.mjs | 0 | 39 passed, 0 failed |
| w6-api-smoke.mjs | 0 | 40 passed, 0 failed |
| w7-api-smoke.mjs | 0 | 38 passed, 0 failed |
| npx supabase stop --workdir .local-supabase-test --no-backup | 0 | stopped |

Safety greps: git diff --name-status d26865d -- supabase/migrations empty (the 8 w7 files are untracked additions only); every w7 migration has `-- ROLLBACK`; no stray .sql outside migrations/tests/database; no secret strings or service_role in frontend/src; no added/changed non-md file over 350 lines; no non-negated "government-recognized" hit; backend diff empty.

## Review polish (DB) re-run (2026-10-26, local only, no commit)

| Command | Exit | Result |
|---|---|---|
| node --test scripts/supabase-test/stage-local-workdir.test.mjs | 0 | tests 19, pass 19, fail 0 |
| node scripts/supabase-test/run-db-tests.mjs | 0 | Files=47, Tests=1713, Result: PASS (new j19_w7_review_polish 27), 0 TODO lines |
| re-apply w7b/c/e/f/g with ON_ERROR_STOP | 0 | idempotent |
| w2-api-smoke.mjs | 0 | 48 passed, 0 failed |
| w3-api-smoke.mjs | 0 | 33 passed, 0 failed |
| w4-api-smoke.mjs | 0 | 43 passed, 0 failed |
| w5-api-smoke.mjs | 0 | 39 passed, 0 failed |
| w6-api-smoke.mjs | 0 | 40 passed, 0 failed |
| w7-api-smoke.mjs | 0 | 38 passed, 0 failed |
| npx supabase stop --workdir .local-supabase-test --no-backup | 0 | stopped |

An earlier run in this step failed once in j5_application_audit_and_notifications (test 32, have 13 want 0; unrelated W5 test, likely a random-uuid match on `%650%`); the final run above passed. Frontend not re-run here (parallel frontend step). Safety: git diff --name-status d26865d -- supabase/migrations empty; every w7 migration keeps `-- ROLLBACK`; largest w7 migration 350 lines.
