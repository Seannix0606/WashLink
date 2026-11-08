# W3 - TEST & RUN results (2026-10-24, HEAD a2517d0, uncommitted, local only)

## Check suite (actual output)

| Command | Exit | Result |
|---|---|---|
| `cd frontend && npm run lint` | 0 | eslint, no problems |
| `cd frontend && npm run build` | 0 | tsc -b 0 errors; vite `built in 594ms` |
| `cd frontend && npm test` | 0 | Test Files 28 passed (28); Tests 46 passed (46) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 18, pass 18, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` (stack started by the runner) | 0 | 17 migrations applied; Files=15, Tests=539, Result: PASS; 0 todo_start( in every file |
| `node scripts/supabase-test/w2-api-smoke.mjs` | 0 | 48 passed, 0 failed |
| `node scripts/supabase-test/w3-api-smoke.mjs` | 0 | 33 passed, 0 failed |
| `npx supabase stop --workdir . --no-backup` (inside `.local-supabase-test`) | 0 | Stopped supabase local development setup |

The first db run with the new test file failed twice for test-code reasons only (second unlink by
the worker correctly raises "Roster entry not found" so it is now wrapped in `attempt`; an
over-high row-count floor of 20 vs 17 actual, lowered to 15). No product bug found.

## Gap review and added tests

Added `supabase/tests/database/j17_w3_idempotency_and_leaks.test.sql` (24 assertions, 157 lines).
Existing W3 files and plans are unchanged.
- Idempotency, same transaction: repeated same-status updates and a notes-only update notify once and
  audit once; five distinct decisions give five distinct keys; a re-fired producer key returns the
  existing row (first body wins, count unchanged); double accept of one link code gives one
  `roster.linked` event and notice; a second worker unlink is rejected and adds nothing; owner double
  unlink notifies once; relink is a new event.
- Idempotency, across transactions: a pgTAP file is one transaction, so this is proven structurally:
  the `UNIQUE (recipient_id, idempotency_key)` constraint exists, a forced duplicate insert gives
  23505, and no duplicate pair exists. A true multi-transaction run is not exercised (enqueue is not
  client-callable, so the smoke script cannot do it either).
- No private leak: worker with `profiles.phone_number`, `worker_private_contacts` phone and email,
  roster `workers.phone_number`; shop address, verification notes and a new name containing phone
  numbers; shop name with an email; roster name with a phone number; every producer fired (decision
  in all four statuses, S6 reset, link code, link, worker and owner unlink, linked-row delete, worker
  profile delete, account delete, role change). Scan of all notifications (category, title, body, key,
  subject type) and all audit rows (action, subject type, payload) finds none of the values, `@`,
  `Secret`, `code_hash` or the link codes; no audit payload key matches the forbidden key pattern.
  Shop name with an email degrades to "Your shop is now Approved."
- Existing coverage confirmed mapped: all plan section 4 names are present in the j17_w3_* and
  j18_w3_flows files; 0 todo_start( everywhere.

## Safety greps

- `git diff --name-status a2517d0 -- supabase/migrations`: empty (no committed migration changed).
- `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_24_w3*`: empty (all 4 have a ROLLBACK block).
- Stray .sql under `supabase/` outside migrations/ and tests/database/: none.
- `git diff --stat a2517d0 -- backend`: empty.
- Secrets/JWT/token patterns in supabase/, w3 smoke, frontend/src, W3 docs: none.
- `grep service_role frontend/src`: none; `postgres_changes` appears only in the existing booking and
  worker repositories, no notifications channel.
- Largest W3 file 326 lines (w3d); all added files at most 350.

## Not verified

Production (D-10 rows 17-19), the UI in a browser, and true multi-transaction duplicate races.

## Review polish re-run (2026-10-24, local only)

| Command | Exit | Result |
|---|---|---|
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 18, pass 18, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | 17 migrations applied; Files=15, Tests=546 (539 + 7 new), Result: PASS |
| `node scripts/supabase-test/w2-api-smoke.mjs` | 0 | 48 passed, 0 failed |
| `node scripts/supabase-test/w3-api-smoke.mjs` | 0 | 33 passed, 0 failed |
| manual psql negative check (rolled back) | - | W3d preflight and W3a final assertion both raise with the missing names |
| `npx supabase stop --workdir . --no-backup` (inside `.local-supabase-test`) | 0 | Stopped supabase local development setup |

Frontend checks not re-run (no frontend file changed). Details in LOG.md "Review polish".

Follow-up (preflight split into `2026_10_24_w3d0_producer_schema_preflight.sql`): stager 18/18;
run-db-tests exit 0, 18 migrations (w3d0 = `20261024000010`, w3d = `20261024000011`),
Files=15, Tests=546, Result: PASS; w2 smoke 48/0; w3 smoke 33/0; stack stopped.

> Note (orchestrator): rows above recording "17 migrations" were accurate when run; after the w3d0 split the count is 18 (see Review polish and VERDICT.md).
