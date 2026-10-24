# W3 - Audit events & notification foundation - VERDICT

**Overall: PASS** (workforce-verifier, 2026-10-24; HEAD a2517d0, W3 uncommitted; local Docker stack only)

Graded against PLAN.md as amended by LOG.md deviations (w3d0 preflight split -> 5 migrations, staged
`20261024000007..11`, 18 applied incl. baseline; `j18_w3_flows` as a new file; added
`j17_w3_idempotency_and_leaks`; review-polish wording/`owner_account_deleted`). Started from a stopped
stack (0 supabase containers); stack stopped again afterwards (0 containers).

## Check suite (re-run by the verifier, actual output)

| Check | Exit | Result |
|---|---|---|
| `cd frontend && npm run lint` | 0 | eslint, no problems |
| `cd frontend && npm run build` | 0 | tsc + vite `built in 486ms` |
| `cd frontend && npm test` | 0 | Test Files 28 passed (28); Tests 46 passed (46) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 18, pass 18, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | 18 migrations applied (`00000000000000`..`20261024000011`; w3d0 = `..10`, w3d = `..11`); 15 files all `ok`; `Files=15, Tests=546`; `Result: PASS`; only WARNING the intentional `W3d: notification test.safe skipped (SQLSTATE 23514)` |
| `node scripts/supabase-test/w2-api-smoke.mjs` | 0 | `48 passed, 0 failed` |
| `node scripts/supabase-test/w3-api-smoke.mjs` | 0 | `33 passed, 0 failed` |
| `npx supabase stop --workdir . --no-backup` (inside `.local-supabase-test`) | 0 | Stopped; 0 supabase containers |

`grep -c "todo_start(" supabase/tests/database/*.sql`: 0 in all 15 files; 0 `TODO` lines in runner output.
Plan sum: 341 (pre-W3) + 1 (001 plan 15->16) + 60+35+24+63+22 = 546 = runner total.

## Acceptance criteria

| AC | Verdict | Evidence |
|---|---|---|
| AC1 migrations | PASS | 5 files `2026_10_24_w3{a,b,c,d0,d}_*.sql` (w3d0 = logged deviation); `grep -L -- "-- ROLLBACK"` empty (w3d0: "Nothing to roll back" note, line 42-43); `git diff --name-status a2517d0 -- supabase/migrations` empty; all names match `YYYY_MM_DD_<snake>.sql` |
| AC2 replay | PASS | runner applies 18 in order; `replay_schema_migrations_has_baseline_w2_and_w3` (expects ..07..11), `replay_w3_tables_have_rls_enabled` in `001_migration_replay` `ok` |
| AC3 suite/TODO | PASS | `Result: PASS`, 0 `todo_start(`, 0 TODO |
| AC4 R-1 | PASS | `j17_definer_functions_pin_pg_temp_last`, `j17_definer_function_ignores_temp_table_shadowing`, `replay_definer_functions_pin_search_path` present, files `ok` |
| AC5 append-only | PASS | j17_w3_audit_events.test.sql:21-90 (insert/update/delete 42501 for anon, customer, owner, worker, super_admin, trusted; truncate 42501; purge path succeeds only trusted+flag; record fn 42501); code w3b:100-169, 214-222 |
| AC6 audit read | PASS | `j17_audit_readable_only_by_super_admin`, `w3_shop_review_log_view_is_super_admin_only`; smoke `non_admin_audit_select_returns_zero_rows`, `customer_review_log_returns_zero_rows` |
| AC7 wiring/R-4 | PASS | all 12 `w3_audit_written_on_*` names, `w3_shop_review_history_survives_reviewer_deletion`, `w3_failed_link_attempt_writes_no_link_event` present, `ok`; smoke `review_log_survives_owner_and_shop_deletion` |
| AC8 no leak | PASS | payload CHECK is a table constraint (w3b:77-78) so it binds producers; text CHECK w3c:68-71; `j17_audit_payload_rejects_contact_and_free_text` (audit_events:156-168), `w3_no_private_data_in_audit_payloads` (audit_wiring:218-228), `w3_notification_text_rejects_contact_data`, `w3_no_private_data_in_notifications`, `w3_roster_name_with_phone_falls_back_to_generic_label` |
| AC9 isolation | PASS | policy `recipient_id = auth.uid()` (w3c:225-228), mark-read filters `recipient_id = caller_id` (w3c:205-209); `j17_notifications_recipient_isolation` (notifications:30-44), `j17_mark_read_only_affects_own_notifications` (:90-98), other AC9 names present; smoke `worker_does_not_see_owner_notifications`, `mark_notifications_read_all_for_other_user_returns_0` |
| AC10 idempotency/producers | PASS | all 7 names present, `ok`; smoke `owner_lists_exactly_one_notification_after_approval`, `owner_notified_once_of_roster_link`, mark-read 1 then 0 |
| AC11 realtime | PASS | `j17_audit_and_notifications_not_in_realtime_publication`; `postgres_changes` only in unchanged SupabaseBookingRepository/SupabaseWorkerRepository |
| AC12 PostgREST | PASS | w3 smoke 33/0 (incl. `rpc_set_config_not_exposed`, service_role insert/update/delete denied); w2 smoke 48/0 |
| AC13 frontend | PASS | 10 W3 Vitest names pass (verbose run, 10/10); total 46/46 (36 existing); lint/build exit 0; `grep -rn service_role frontend/src` empty |
| AC14 J18 regression | PASS | every pre-W3 pgTAP file `ok` incl. `j17_w2_fix1_fk_cascades`, `j18_existing_flows` (pre-W3 test files unmodified except 001); `j18_w3_flows` `ok` with both planned names; pytest 4 passed; stager 18/18 |
| AC15 size/safety | PASS | largest changed/added file 349 (PLAN.md), largest code file 338 (w3d); backend diff empty; no `.env*` changed; `db push`/`--linked`/`link` appear only as prohibitions in docs; smoke refuses non-loopback (w3-api-smoke.mjs:51); docs AUDIT_AND_NOTIFICATIONS.md exists, ROLE_AND_PROFILE_SECURITY/LOCAL_TEST_HARNESS updated |

## Safety confirmations
- Committed migrations unchanged vs a2517d0; staged order w3a..w3c, w3d0, w3d correct (w3d0 before producers).
- No stray `.sql` (only committed, unchanged `scripts/supabase-test/baseline/*.sql` outside migrations/tests).
- No secrets/JWTs/project refs/service keys in changed files (grep for `eyJ...`, `sb_secret_`, `*.supabase.co`, key assignments: none).
- No remote DB commands; supabase CLI only run inside `.local-supabase-test`; `.env` not read.
- Reviewer BLOCKING findings: none (REVIEW.md); non-blocking items fixed and tested as logged.

## Spot checks (code + proving test)
1. Audit append-only: UPDATE trigger always raises (w3b:115-124); DELETE/TRUNCATE need trusted session AND
   purge GUC (w3b:129-145); the only `set_config('washlink.*')` calls are in record/enqueue definers
   (grep). service_role JWTs pass `is_trusted_db_session()` but have no table privilege (w3b:221) and cannot
   set the GUC; smoke `service_role_cannot_delete_audit_rows` confirms. Tests: audit_events:39-84.
2. Recipient isolation: confirmed (AC9 row).
3. No private leak: confirmed (AC8 row); producers route names through `notification_safe_label` (w3d:85,150).

## Non-blocking observations
- `001_migration_replay.test.sql` header comment still says "baseline + 15 migrations ... 4 W3" (actual 17 + baseline, 5 W3).
- TEST_RESULTS.md main table says "17 migrations" for the first run; current state is 18 (follow-up section correct).
- `run-db-tests.mjs` (W1, unchanged) prints `supabase status`, which includes the public local `supabase-demo` keys; not a W3 change.
- Untracked `.claude/` (loop agent install + settings.local.json) is not W3 content and should not go into the W3 commit.
- Not verified: production (D-10 rows 17-20), UI in a browser, true cross-transaction duplicate race.
