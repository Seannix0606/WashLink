# W5 - TEST RESULTS (local stack only, no commit, no .env read)

Run from a stopped stack; stack stopped afterwards (`supabase stop --workdir .local-supabase-test --no-backup`, exit 0).

| Command | Exit | Result |
|---|---|---|
| `cd frontend && npm run lint` | 0 | no problems |
| `cd frontend && npm run build` | 0 | tsc -b clean, vite built |
| `cd frontend && npm test` | 0 | Test Files 51 passed (51), Tests 87 passed (87) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 18, pass 18, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | Files=27, Tests=1054, Result: PASS, 0 todo_start |
| `w2-api-smoke.mjs` | 0 | 48 passed, 0 failed |
| `w3-api-smoke.mjs` | 0 | 33 passed, 0 failed |
| `w4-api-smoke.mjs` | 0 | 43 passed, 0 failed |
| `w5-api-smoke.mjs` | 0 | 39 passed, 0 failed |

## Tests added in this step (gap fill)
- `supabase/tests/database/j17_w5_owner_visibility_window.test.sql` (21): real RPC applications; owner profile access
  opens at submit, stays through under_review / shortlisted / accepted, ends after reject, worker withdraw and opening
  close (accepted stays); drafts never visible; private contacts and worker_profiles never readable at any stage; other
  owner denied; worker never sees another worker's application; snapshot immutable for a trusted session after a decision.
- `supabase/tests/database/j4_w5_opening_application_cap.test.sql` (6): the 500 cap is a literal in
  `job_application_apply_checks` (no setting to lower), so 499 trusted fixture applications are inserted inside the
  rolled-back transaction; 500th accepted, 501st refused for submit and draft (23514), a withdrawal frees a slot.
  Runtime is under the 5 s wallclock of the whole suite. The earlier LOG deviation 7 (cap untested) is now closed.
  Pre-existing tests unchanged (1027 + 21 + 6 = 1054).

## Safety greps
- `git diff --name-status 50cb850 -- supabase/migrations`: empty (the five w5 files are new/untracked; no committed migration changed).
- `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_25_w5*`: empty. `git diff --stat 50cb850 -- backend`: empty.
- Stray `.sql` outside migrations/tests/database: none. `todo_start(`: 0 in every file.
- `service_role` in frontend/src: none; `worker_private_contacts` in owner components: none.
- Changed/added non-doc files over 350 lines: none. Secret/JWT/token patterns in changed files: none.

## Fix cycle 1 (DB), 2026-10-25 (frontend rows above not re-run by this step)

| Command | Exit | Result |
|---|---|---|
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 18, pass 18, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | 27 migrations, Files=28, Tests=1078, Result: PASS, 0 todo_start |
| `w2-api-smoke.mjs` | 0 | 48 passed, 0 failed |
| `w3-api-smoke.mjs` | 0 | 33 passed, 0 failed |
| `w4-api-smoke.mjs` | 0 | 43 passed, 0 failed |
| `w5-api-smoke.mjs` | 0 | 39 passed, 0 failed |
| `supabase stop --workdir .local-supabase-test --no-backup` | 0 | stopped |

Added `supabase/tests/database/j17_w5_fix1_closed_drafts_and_current_owner.test.sql` (24): draft with cover note ->
opening closed -> row is `closed` with `submitted_at` null, no `job_application.closed` notice for it; owner sees 0
rows / no cover note / no profile row, certifications and transition 42501; worker still reads it, it does not count
as applied (closed opening hidden), cannot be sent, can be deleted; a sent closed row cannot be deleted; after a
trusted shop transfer the former owner gets 0 rows and 42501 on reads/actions; helper pinned and not anon-executable;
per-opening lock follows the worker lock. Safety: no committed migration changed; every w5 file has `-- ROLLBACK`.

## Fix cycle 1 (DB), security re-review follow-up, 2026-10-25

| Command | Exit | Result |
|---|---|---|
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 18, pass 18, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | 27 migrations, Files=29, Tests=1094, Result: PASS, 0 todo_start |
| `w2-api-smoke.mjs` / `w3` / `w4` / `w5` | 0 | 48/0, 33/0, 43/0, 39/0 (passed/failed) |
| `supabase stop --workdir .local-supabase-test --no-backup` | 0 | stopped |

Added `supabase/tests/database/j5_w5_fix1_owner_notifications_and_lock_order.test.sql` (16; 1078 + 16 = 1094).
