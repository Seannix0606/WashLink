# W8 - TEST_RESULTS (2026-10-26, local stack only, no commit)

Test gap fill: new `supabase/tests/database/j9_w8_contract_template_gaps.test.sql` (plan 20, 0 `todo_start(`): locked clause
id / core key / extra fields in owner payloads (refused or ignored, locked snapshot identical to the standard), refused saves
write no version, super_admin session cannot update / delete / insert versions or clauses or delete the platform template,
all 11 core keys cannot be dropped or downgraded by super_admin publish (22 cases), content_hash and clause_hash recompute,
worker / customer / anon read RPCs return nothing. No existing test changed. No product bug found.

| Command | Exit | Result |
|---|---|---|
| `cd frontend && npm run lint` | 0 | no problems |
| `cd frontend && npm run build` | 0 | built |
| `cd frontend && npm test` | 0 | Test Files 89 passed (89), Tests 173 passed (173) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `run-db-tests.mjs` run 1 (stopped stack) | 0 | Files=53, Tests=1910, Result: PASS |
| `run-db-tests.mjs` run 2 (reset) | 0 | Files=53, Tests=1910, Result: PASS |
| `run-db-tests.mjs` run 3 (reset) | 0 | Files=53, Tests=1910, Result: PASS |
| w2 / w3 / w4 / w5 / w6 / w7 / w8 smokes | 0 each | 48 / 33 / 43 / 39 / 40 / 38 / 30 passed, 0 failed each |
| `supabase stop --workdir .local-supabase-test --no-backup` | 0 | stopped |

Note: a first run of the gaps file failed (its own bug: internal `contract_template_core_safeguard_keys()` is not client
executable, read as service instead); fixed in the test, then the three PASS runs above.

Safety greps: `git diff --name-status dd58616 -- supabase/migrations` empty (no committed migration changed; 8 new w8 files);
`grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_26_w8*` empty; `grep -c todo_start(` non-zero in no file; only expected
.sql files are new (8 migrations, 6 pgTAP files, 1 helper) plus modified `001_migration_replay.test.sql` and `test_helpers.sql`;
no file > 350 lines; `grep -rn service_role frontend/src` empty; backend diff empty; no secrets or project ref (only the smoke's
in-memory `SERVICE_ROLE_KEY` variable name).

## Review polish (DB) - 2026-10-26

New `supabase/tests/database/j19_w8_review_polish.test.sql` (plan 37, 0 `todo_start(`); `j9_w8_contract_template_gaps` core
count 11 -> 15; `j17_w8_contract_template_authorization` internal list 25 -> 26. Details in `LOG.md` "Review polish (DB)".

| Command | Exit | Result |
|---|---|---|
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `run-db-tests.mjs` (migration changes, before the new file) | 0 | Files=53, Tests=1910, Result: PASS |
| `run-db-tests.mjs` (first run with the new file) | 1 | Files=54, Tests=1946, 2 failed in the new file (test bugs, fixed) |
| `run-db-tests.mjs` (final) | 0 | Files=54, Tests=1947, Result: PASS |
| w2 / w3 / w4 / w5 / w6 / w7 / w8 smokes | 0 each | 48 / 33 / 43 / 39 / 40 / 38 / 30 passed, 0 failed each |
| `supabase stop --workdir .local-supabase-test --no-backup` | 0 | stopped |

Frontend lint / build / tests not re-run (no frontend file changed).
