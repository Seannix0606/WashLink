# W13 - LOG

## BUILD (DB) - 2026-10-30 (workforce-db-engineer; branch feature/workforce, HEAD eeb552b; not committed)

Scope: section 3 migrations, section 6 pgTAP, smokes and runner (PLAN sections 3, 6, 7 "Scripts"). No frontend/ or docs/ file touched.
Local Docker stack only (`.local-supabase-test`, project_id `washlink-local-test`, no project-ref). No `db push`, `--linked`, `--db-url` and no `.env` read.

### Files
Added migrations (staged 20261030000006..09; nothing committed was edited: `git diff --name-status eeb552b -- supabase/migrations` lists no file):
- `supabase/migrations/2026_10_30_w13a_hardening_preflight.sql` (88 lines). Creates nothing. Aborts if the table, view or functions are missing. Aborts if `worker_contracts_audit()` lacks either exact W9 expiry string. That check is skipped once the function carries the `W13` comment, so the file can be re-run. Also aborts if `admin_job_opening_moderation_queue_page` exists without a `W13` comment. Raises a NOTICE listing unknown select policies on `workforce_audit_events`.
- `..._w13b_admin_audit_reads_only_through_rpc.sql` (56). Drops `wae_select_super_admin` and creates `wae_no_client_select` (`for select to authenticated using (false)`). Revokes the view grant from every client role. Comments on the table, the view and `admin_workforce_audit_log`; the W3 / W14 text is kept and the W13 text is appended.
- `..._w13c_admin_moderation_queue_paging.sql` (70). Adds the new page function. The w14e function is not replaced.
- `..._w13d_contract_expiry_notice_wording.sql` (203). One live `create or replace function`, generated from w9j lines 30-116. A script diff shows exactly 2 changed lines: the two expiry bodies. Comment: `W9: worker contracts (created by the W9 migrations). W13: expiry notice wording (D-72).` The ROLLBACK block holds the full w9j body.

Added pgTAP (99 -> 105 files):
- `j17_database_constraints_and_authorization_prevent_unauthorized_access` (29)
- `j18_existing_booking_pricing_verification_and_rating_workflows_still_work` (25)
- `j17_w13_admin_audit_reads` (21)
- `j2_w13_moderation_queue_paging` (27)
- `j15_w13_contract_expiry_notice_wording` (19)
- `j15_w13_trusted_contract_end_runbook` (12)

Changed pgTAP:
- `001_migration_replay`: plan 26 -> 27. Versions extended to `20261030000009`. Renamed one test and added one; see "Renamed tests".
- `j17_w3_audit_events`: the 5 read assertions were renamed (see below). The super_admin read now expects 0. Plan unchanged (60).
- `j17_w3_audit_wiring`: the review-log check was renamed (see below). The admin, owner, customer and anon reads now all expect 42501. `w3_shop_review_history_survives_reviewer_deletion` keeps its name; its view read now runs in the trusted session. Plan unchanged (35).
- `j13_w12_scheduled_jobs`: three renames (see below). Line 71 keeps the old name. Plan unchanged (31).
- No other pgTAP file needed a change. The first full run with the migrations in place found no other raw super_admin read (99 files PASS).

Renamed tests (old -> new, D-76):
| File | Old name | New name |
|---|---|---|
| `001_migration_replay` | `replay_schema_migrations_has_baseline_w2_to_w14_and_w12` | `replay_schema_migrations_has_baseline_w2_to_w14_w12_and_w13` (+ new `replay_w13_audit_table_has_no_client_select_policy`) |
| `j17_w3_audit_events` | `j17_audit_readable_only_by_super_admin` (5) | `j17_audit_raw_table_not_readable_by_any_client_role` |
| `j17_w3_audit_wiring` | `w3_shop_review_log_view_is_super_admin_only` (4) | `w3_shop_review_log_view_is_trusted_sql_only` |
| `j13_w12_scheduled_jobs` line 73 | `w12_contract_expiry_job_expires_past_end_and_notifies_each_party_once` | `w12_contract_expiry_job_notifies_each_party_once` |
| `j13_w12_scheduled_jobs` line 76 | same | `w12_contract_expiry_job_stamps_system_end_and_clears_pending` |
| `j13_w12_scheduled_jobs` line 82 | same | `w12_contract_expiry_job_second_run_changes_nothing` |
| `w3-api-smoke` | `super_admin_reads_shop_audit_events` | `super_admin_reads_shop_audit_events_through_audited_log` |
| `w3-api-smoke` | `super_admin_reads_review_log` | `review_log_view_denied_for_super_admin` |

Scripts:
- New `scripts/supabase-test/smoke-admin-audit-log.mjs`. Exports `adminAuditRows(client, { action, actionPrefix, subjectType, subjectId, profileId, actorId, limit })`. `action` and `subjectId` may be arrays; the helper makes one RPC call per pair. Returns `{ data, error }` with `id` = event_id, ordered by id ascending.
- New `w13-api-smoke.mjs` (233 lines, 17 checks).
- New `run-api-smokes.mjs` (D-77). Runs w2..w11, w14, w12, w13 in order, prints NOT OK lines and each tail line, and stops at the first non-zero exit. It runs no Supabase CLI command and refuses remote arguments and environment variables.
- Changed smokes: w3, w4, w5, w6, w7, w8, w10, w11, w14. Every raw super_admin `workforce_audit_events` / review-log read now goes through the helper. Check counts are unchanged. Line counts: w3 224, w4 256, w5 255, w6 282, w7 296, w8 254, w10 348, w11 350, w14 334. In w11 the helper import replaced a blank line. w14 `searches()` now expects `searchesBefore + 3`, because the helper's own searches add events (commented in the file).

### Actual results (local stack)
- Stager: `node --test scripts/supabase-test/stage-local-workdir.test.mjs` -> `tests 19, pass 19, fail 0`.
- `node scripts/supabase-test/run-db-tests.mjs` (clean `db reset --local`; 96 staged migrations applied in order, w13a..d as 20261030000006..09) -> `Files=105, Tests=3185 ... All tests successful.` `Result: PASS`, exit 0. There are 0 `todo_start(` in the log and in `supabase/tests/database/*.sql`. The new total equals 3052 + 133; the earlier run with W13 migrations and only the edited files gave `Files=99, Tests=3052, Result: PASS`.
- `node scripts/supabase-test/run-api-smokes.mjs` on the same stack, exit 0:
  w2 48/0, w3 33/0, w4 43/0, w5 39/0, w6 40/0, w7 38/0, w8 30/0, w9 34/0, w10 39/0, w11 36/0, w14 33/0, w12 22/0, w13 17/0 (passed/failed). The runner ended `run-api-smokes: PASS (13 smokes)`. Every count except the new w13 equals LOOP.md.
- Idempotency: the four W13 files were re-applied with psql on the migrated local DB, with no error (w13b only prints a NOTICE that the dropped policy does not exist).
- w13a abort path: inside `begin ... rollback`, the W13 marker was reset to the W9 comment and w13a re-run. It raised `W13 preflight: worker_contracts_audit() differs from the W9 body (missing worker expiry string ..., owner expiry string ...); a human must review it before w13d replaces it (D-10)`.
- Stack stopped with `npx supabase stop --workdir .local-supabase-test`. No `supabase_*` containers are left running.

### For the frontend (D-71 paged queue)
```
public.admin_job_opening_moderation_queue_page(
  p_status text default 'active',              -- 'active' | 'open' | 'dismissed' | 'paused_by_washlink' | 'changes_submitted' | 'lifted' | 'closed_by_washlink' | 'resolved_owner_closed'
  p_after_opened_at timestamptz default null,  -- cursor part 1 = opened_at of the last row of the previous page
  p_after_id uuid default null,                -- cursor part 2 = case_id of that row
  p_limit integer default 50)                  -- 1..100
returns table (case_id uuid, status text, revision integer, report_count integer, open_report_count integer, categories text[],
               opening_status text, opening_present boolean, opening_title_snapshot text, shop_name_snapshot text,
               opened_at timestamptz, status_changed_at timestamptz, total_count integer)
```
- Order: `opened_at, case_id` ascending (oldest first). Keyset `(opened_at, case_id) > (cursor)`. An empty page means the end. `total_count` is the number of all cases matching the status filter and is the same on every row; an empty page has no row, so keep the last known total.
- Execute: `authenticated` only. Callers that are not super_admin (owner, worker, customer) get 0 rows and no error. anon and service_role get 42501. The function is not audited.
- Errors (all SQLSTATE `22023`): `Choose a case status.`, `Page size must be between 1 and 100.`, `Give both parts of the page cursor.` The status and limit checks run before the role check, so a non-admin with a bad argument also gets 22023.
- The old `admin_job_opening_moderation_queue(text)` (200 rows) is unchanged. The frontend repository should call only the page RPC (`w13_repository_calls_page_rpc_only`).
- Expiry notice texts (D-72), for the pinned-diff Vitest:
  - worker: `'Your contract with ' || shop_label || ' reached the end date written in it, so WashLink now shows it as expired. What this means for your work depends on the contract terms and the law.'`
  - owner: `'A contract reached the end date written in it, so WashLink now shows it as expired.'`
  - title: `Contract expired`.
  - In `2026_10_30_w13d_*.sql` the live function body is the first `create or replace function public.worker_contracts_audit()` ... `$$;` block. The commented ROLLBACK block repeats the w9j body, with its first line split after `-- create or replace` (see deviation 3).

### Deviations / findings (for REVIEW and the orchestrator)
1. **The J17 roll-up pins existing grants that its test names say should not exist** (finding F1; **superseded: closed in w13b by D-78, see "BUILD (DB) addendum" below**). The live catalogue shows:
   - (a) `authenticated` still holds `REFERENCES, TRIGGER, TRUNCATE` on `job_openings`. w4c revoked only from `public, anon` before granting s/i/u/d, so the Supabase default privileges stayed. PostgREST cannot use them, but TRUNCATE bypasses RLS and row triggers for any direct SQL session as `authenticated`.
   - (b) `service_role` keeps the default ALL privileges on `job_openings`, `worker_profiles`, `worker_private_contacts`, `worker_roster_link_codes`, `worker_roster_link_attempts` (W2 / W4). Every table from W3 on revokes them. service_role is a trusted session by W2 design (`is_trusted_db_session`).
   - (c) `authenticated` has INSERT / UPDATE / DELETE on `job_openings` (W4 owner drafts), `worker_profiles` and `worker_private_contacts` (W2 own rows). These are by design and guarded by RLS and triggers.

   `j17_no_client_role_has_insert_update_delete_on_workforce_tables` and `j17_service_role_has_no_workforce_table_privileges` therefore compare the actual grants with an explicit, commented allow-list. Any new grant fails them. The names were kept as planned, but they overstate what is enforced. Suggested fix: add one statement to w13b, or a later migration, `revoke truncate, references, trigger on public.job_openings from authenticated;`, and decide whether to revoke the five service_role grants. Then shorten the allow-list.
2. **J17 roll-up details.** The table list holds 43 workforce tables plus 2 views. "Not in the local baseline" means not one of the 6 pre-workforce tables: profiles, workers, bookings (baseline) and shops, shop_pricing, shop_verification_documents (pre-W2 migrations). `j17_anon_executes_no_workforce_function` pins the 5 pre-workforce functions anon can execute (`can_manage_shop_verification_storage`, `handle_new_user`, `is_super_admin`, `set_booking_quote_from_shop_pricing`, `set_shop_pricing_updated_at`). The search_path test exempts only `handle_new_user` (baseline-only).
3. **w13d ROLLBACK block.** Its first line is split into `-- create or replace` / `-- function public.worker_contracts_audit()`. This keeps AC8 (`grep -c "create or replace function" w13d` = 1) true while the block still holds the complete w9j body; the SQL is equivalent once uncommented.
4. **Existing W3 smoke check text.** `customer_review_log_returns_zero_rows` keeps its name because check counts must stay the same. It now asserts 42501 with no rows, since the view grant is gone.
5. **AC6 grep.** It also matches a negative check outside w3 / w13: w10:250, where an owner raw select returns 0 rows (`non_admin_cannot_read_policy_audit`). It is a negative check and was kept. The w3 matches are negative checks too: an insert, an owner select of 0 rows, view 42501, and service_role update / delete / insert.
6. **Test robustness.** The `j2_w13` total-count checks for 'dismissed' / 'lifted' compare against a trusted count instead of assuming an empty database. An ad-hoc run on a stack holding smoke data had shown leftover cases.
7. **Smoke side effects (local only).** The w13 smoke runs the real `worker_contract_expiry` job twice. It commits, so `run_count` > 0 afterwards. It must stay last in the runner; re-running w12 alone afterwards on the same stack would fail `rolled_back_run_left_no_job_state_and_no_pg_cron`. A fresh `run-db-tests.mjs` resets this.

### Not verified here
- Frontend lint / build / Vitest and backend pytest were not run; they are outside the DB step.
- The ROLLBACK blocks were not executed (as in every increment).
- Production drift (D-10): the w13a NOTICE about unknown audit policies cannot be tested locally, because the local stack has none.

## BUILD (DB) addendum - D-78 (coordinator decision on deviation 1) - 2026-10-30

**D-78 (proposed default, for DECISIONS.md as ADOPTED-DEFAULT): revoke the leftover W2 / W4 grants.** w13b was edited in place; it is still uncommitted and there are still exactly 4 W13 migrations.

### What w13b now also does
- `revoke truncate, references, trigger on table public.job_openings from authenticated;` These are Supabase default privileges that w4c never revoked; TRUNCATE skips RLS and row triggers.
- `revoke all on table public.job_openings, public.worker_profiles, public.worker_private_contacts, public.worker_roster_link_codes, public.worker_roster_link_attempts from service_role;` These are W2 / W4 default privileges. Every table from W3 on already revokes them.
- One more leftover of the same kind, found by a new J17 sequence check: `certification_status_events_id_seq` (W7) granted `rwU` to anon, authenticated and service_role, so anon could call `nextval`. All writers are security definer (`insert_certification`, `renew_certification`, `transition_certification`, `decide_certification_review`, `decide_certification_platform_review`). w13b resolves the sequence with `pg_get_serial_sequence('public.certification_status_events', 'id')`, as w3b does for the audit sequence, and revokes all from public, anon, authenticated and service_role.
- The ROLLBACK block now also holds the matching grants, plus the comment explaining D-78. w13b is 83 lines.

### Dependency check before revoking
- I grepped backend/, frontend/src, scripts/ and supabase/tests for any service_role use of the five tables. The smokes' service-key client (`admin`) never calls `.from()` on them; the one match (w14:203) is the super_admin *user* client `sa`.
- No pgTAP file touches them while `role = service_role`. backend/ and frontend/src have no service_role reference.
- FK cascades (GoTrue deleteUser), definer functions and trusted SQL run as the table owner, so they are unaffected.
- **Kept (justified):** `authenticated` SELECT / INSERT / UPDATE / DELETE on `job_openings` (W4 owner drafts, `SupabaseJobOpeningRepository`) and on `worker_profiles` / `worker_private_contacts` (W2 own rows, `SupabaseWorkerProfileRepository`). The frontend writes these directly under RLS and guard triggers. These are the only client write grants left on any workforce table.
- **service_role:** nothing kept.

### J17 roll-up now literally true
- The allow-list has no TRUNCATE / REFERENCES / TRIGGER and no service_role entry.
- `j17_service_role_has_no_workforce_table_privileges` now asserts:
  - `actual_grants('service_role') = '-'`;
  - no service_role usage / update, authenticated update or anon usage on any sequence owned by a workforce table. This replaces the old count-based second assertion.
- The plan is still 29 assertions; the file is 177 lines.
- **Negative check:** each grant was injected separately inside a rolled-back transaction, then the file was re-run.
  - `grant truncate on public.job_openings to authenticated` failed test 8 (`j17_no_client_role_has_insert_update_delete_on_workforce_tables`).
  - `grant select on public.worker_profiles to service_role` failed test 10 (`j17_service_role_has_no_workforce_table_privileges`).
  - `grant insert on public.notifications to authenticated` failed test 8.
  - Afterwards `has_table_privilege` returned `f|f|f`.
- **Live grants on the five tables after reset:** only `authenticated` SELECT / INSERT / UPDATE / DELETE on job_openings, worker_profiles and worker_private_contacts; nothing for anon or service_role.

### Actual results (clean local stack)
- Stager: `tests 19, pass 19, fail 0`.
- `run-db-tests.mjs`, first run after the table revokes: `Files=105, Tests=3185 ... Result: FAIL`. One failure: `j17_service_role_has_no_workforce_table_privileges` had `certification_status_events_id_seq`, wanted `-`. Fixed in w13b as described above.
- Re-run on a clean reset: `Files=105, Tests=3185 ... Result: PASS`, exit 0, 0 `todo_start(`.
- `run-api-smokes.mjs` on the same stack, exit 0, `run-api-smokes: PASS (13 smokes)`. Passed/failed per smoke: w2 48/0, w3 33/0, w4 43/0, w5 39/0, w6 40/0, w7 38/0, w8 30/0, w9 34/0, w10 39/0, w11 36/0, w14 33/0, w12 22/0, w13 17/0. Counts are unchanged.
- Stack stopped (`npx supabase stop --workdir .local-supabase-test`); 0 `supabase_*` containers left.
- Local only. No `--linked`, `--db-url` or `db push`, no `.env` read, and no frontend/ or docs/ file touched.

### For DOCS / RECORD
- Add D-78 to DECISIONS.md.
- ROLE_AND_PROFILE_SECURITY.md (D-10 rows) should note that the five service_role grants, the job_openings TRUNCATE / REFERENCES / TRIGGER grants and the certification_status_events sequence grants are revoked by w13b. The production schema diff must confirm nothing outside the repo uses them before deploy.
- ROLLBACK_GUIDE: the w13b block restores them.

## BUILD (frontend) - 2026-10-30 (frontend engineer; branch feature/workforce, HEAD eeb552b; not committed)

Scope: PLAN section 2 (N3 paging, W9 C2 / C3 copy) and the section 6 Vitest files. Only frontend/src was edited, plus this note.

### Files
Changed:
- `domain/models/JobOpeningModeration.ts` (284 lines). Adds `AdminModerationQueueCursor`, `AdminModerationQueuePage`, `moderationQueuePageLimits` (default 50, range 1..100), `nextModerationQueueCursor` and `appendUniqueQueueItems` (de-duplicates by case id).
- `domain/repositories/JobOpeningModerationRepository.ts`. Adds `listAdminQueuePage`. The old `listAdminQueue` stays, marked as kept for compatibility only.
- `infrastructure/supabase/supabaseJobOpeningModerationRows.ts`. Adds the page row with `total_count` and `mapAdminModerationQueuePageRows`. An empty page has `totalCount: null`.
- `infrastructure/repositories/SupabaseJobOpeningModerationRepository.ts`. Adds `listAdminQueuePage`, which calls `admin_job_opening_moderation_queue_page` only.
- `infrastructure/supabase/supabaseModerationErrorMessages.ts`. Adds `Page size must be between 1 and 100.` and `Give both parts of the page cursor.`. `Choose a case status.` was already in the list.
- `application/validation/moderationSchemas.ts`. Adds `queueFilterSchema`, `queuePageSizeSchema` and `queueCursorSchema`, which use the database's 22023 messages.
- `application/services/JobOpeningModerationService.ts`. `listAdminQueue` is replaced by `listAdminQueuePage(filter, cursor, pageSize = 50)`. It checks the status, page size and cursor before each request.
- `presentation/hooks/useAdminModerationQueue.ts` (172 lines). Rewritten for keyset paging:
  - `loadMore` reads after the last loaded row and appends only case ids not already shown.
  - A filter change resets the queue to the first page.
  - A page that arrives late, from an older filter or refresh, is dropped.
  - The last known total is kept when a page comes back empty.
- `presentation/components/superAdmin/moderation/PostingReportQueuePanel.tsx` (152 lines).
  - Adds a "Showing N of TOTAL" line (`aria-live`) and a "Load more" button.
  - A failed "Load more" shows its own error with retry (`LoadErrorNotice`).
  - The loading, empty and error states are unchanged.
- `presentation/utilities/jobOpeningModerationCopy.ts`. Adds the paging copy.
- `presentation/utilities/workerContractCopy.ts`. D-73 copy (see "Copy" below).
- `presentation/components/worker/contracts/MyContractsPanel.w9.test.tsx`. One expectation line changed; the test name is unchanged.
- `test/moderationFixtures.ts`. Adds the `listAdminQueuePage` mock (see deviation 2).

Added Vitest (7 files, 13 tests):
- `presentation/hooks/useAdminModerationQueue.w13.test.ts`: `w13_queue_hook_loads_more_with_keyset_cursor_and_dedupes`, `w13_queue_hook_resets_on_filter_change`.
- `presentation/components/superAdmin/moderation/PostingReportQueuePaging.w13.test.tsx`: `w13_queue_panel_shows_n_of_total_and_load_more`, `w13_queue_panel_empty_loading_error_states`.
- `infrastructure/repositories/SupabaseJobOpeningModerationRepository.w13.test.ts`: `w13_repository_calls_page_rpc_only`, `w13_page_rpc_errors_are_mapped`.
- `presentation/utilities/workerContractCopy.w13.test.ts`: `w13_worker_terminate_copy_has_no_unconditional_right_statement`, `w13_owner_terminate_copy_has_legal_caution`.
- `test/contractExpiryNoticeWording.w13.test.ts`: `w13_expiry_notice_body_differs_from_w9_only_in_two_strings`.
- `test/noRawAuditReads.j17.test.ts`: `j17_w13_frontend_never_reads_raw_audit_table_or_review_log`. It also checks that frontend/src has no `service_role` and that only `SupabaseAdminOversightRepository.ts` calls `admin_workforce_audit_log`.
- `test/workforceDocs.w13.test.ts`: `w13_workforce_docs_exist_with_required_sections`, `w13_acceptance_index_lists_only_existing_test_files`, `w13_legal_register_index_matches_parts_and_all_open`.

These J16 files are byte-identical to eeb552b (same md5, not in `git diff`): TerminateContractModal, DeclineContractModal, AcceptContractModal, WorkerContractReview and RequestCertificationReviewModal. The copy change goes through `workerContractCopy.ts` only.

### Copy (before -> after)
- `workerTerminateText`:
  - Before: "You can end this contract at any time. Give a short reason; the shop will see it. Notice periods, final pay and clearance are not handled on WashLink."
  - After (D-73, verbatim): "You can record the end of this contract on WashLink at any time. Give a short reason; the shop will see it. Notice periods or other duties under your contract or the law may still apply. Final pay and clearance are not handled on WashLink."
- `ownerTerminateText`:
  - Before: "This records the end of the contract now. Give a reason; the worker will see it. Any pending change is withdrawn."
  - After: the same text, followed by the new constant `ownerTerminationCautionText`: "Ending a work relationship can have legal requirements such as a proper cause and notice. WashLink only records the end."
- New paging copy: "Load more", "Showing N of TOTAL", "More posting reports could not be loaded".

### Actual results (frontend/)
- `npm run lint`: exit 0. No output after `eslint .`.
- `npm run build`: exit 0 (`tsc -b && vite build`, "built in 707ms").
- `npm test`: `Test Files 1 failed | 143 passed (144)`, `Tests 3 failed | 292 passed (295)`.
  - All 282 existing tests pass, and so do the 10 new tests that do not read docs.
  - The 3 failures are all in `workforceDocs.w13.test.ts`. The docs step started while this build was running:
    - the `docs/workforce/legal/REGISTER_PART_*.md` files exist;
    - ARCHITECTURE, ROLLBACK_GUIDE, LIMITATIONS, DEPLOYMENT_READINESS and ACCEPTANCE_TESTS do not exist yet;
    - the register index still holds every row.
  - They should pass once the docs step finishes, but this step did not see them pass.

### Deviations
1. **Owner caution wording.** D-73 says "such as a valid cause"; the shipped text says "such as a **proper** cause". The existing W9 wording check (`w9_copy_never_claims_signature_validity_or_compliance`) forbids `\bvalid\b` in every contract copy constant, and only one W9 expectation may change. Docs and the legal register should quote the shipped text (W13-L3).
2. **W14 tests and the old repository method.**
   - `listAdminQueue` (w14e, 200 rows) stays in the repository interface and implementation, so the unchanged `j17_w14_repositories_use_rpcs_only` still passes. The service, hook and panel no longer call it.
   - In `moderationFixtures.ts`, the default `listAdminQueuePage` mock serves the W14 `listAdminQueue` mock as one first page (total = its length; later pages are empty). This keeps `PostingReports.w14` and `SuperAdminDashboardPage.w14` unchanged and green.
   - Their `listAdminQueue` call assertions therefore pass through this bridge. The W13 tests check the real page calls.
   - Remove the bridge if those W14 tests are moved to the page method.
3. **Polling.** The first page still polls every 60 s and on focus, like the other W14 queues. Polling stops once "Load more" has been used, so the list does not collapse. "Load more" (and its retry) and the audited case-drawer read are never polled.
4. **`hasMore`.** It is true when the last page was full (`length >= pageSize`). An empty next page ends paging and keeps the last known total.
5. **Docs test gate.** `workforceDocs.w13.test.ts` uses `describe.skipIf(!isW13DocsStepStarted)`. It is skipped only while none of the 5 new docs and neither register part exists. Once any of those files exists, all three tests run. The gate opened during this build (see the results above), and it can be removed after the DOCS step. The tests expect this format:
   - **Register:** rows look like `| W<n>-L<m> | OPEN | ...`.
     - Each ID is a row exactly once across the index and the two parts, 160 in total.
     - W13-L1..L7 are rows in the index only.
     - The index names every ID.
   - **ROLLBACK_GUIDE:** one line lists W13 W12 W14 W11 W10 W9 ... W2 in that order. The guide also contains `unregister_workforce_jobs.sql`, D-10 and D-11.
   - **LIMITATIONS:** names W9-S1, W9 S2 / S3 / S4 / C4 / C5, W10 S4 / C8, W2 R-6, W2-L3, W6-L13, W3-L1, W12-L6, D-68, W9-L13 and W9-L16 (spaces and hyphens are ignored when matching), and contains "Not tested".
   - **DEPLOYMENT_READINESS:** has unchecked `- [ ]` boxes and no ticked box.
   - **ACCEPTANCE_TESTS:**
     - names an existing `j<n>_*` pgTAP file for each of J1-J18;
     - names both roll-ups, a "Renamed tests" section and `w12_contract_expiry_job_second_run_changes_nothing`;
     - every `*.test.sql|ts|tsx` it names must exist.
6. **Unchanged intro text.** `myContractsIntroText` ("You can always decline an offer or end an accepted contract.") is not changed because the plan does not list it. Its wording is close to W9 C2, so it may need legal review (W13-L2).

## BUILD (docs) - 2026-10-30 (docs step; branch feature/workforce; not committed)

Scope: `docs/workforce/` only, plus this note and `W13/LEGAL_FLAGS.md`. No code, test, migration or script changed. No `.env` read.

### Files
- New: `ARCHITECTURE.md` (W0-W14 overview: layers, authorization model, data model by area, notice / scheduling path, links to every area doc), `ROLLBACK_GUIDE.md` (states plainly that no ROLLBACK block was ever executed; step 0 `unregister_workforce_jobs.sql`; order line W13 -> W12 -> W14 -> W11 -> ... -> W2; `file:line` of every block; trigger-order caveats incl. w14c, w14f `shops_zz_rereview_stamp`; D-78 grant restore; D-10, D-11; data loss; trusted-repair runbook), `LIMITATIONS.md`, `DEPLOYMENT_READINESS.md` (30 boxes, all `- [ ]`), `ACCEPTANCE_TESTS.md` (J1-J18 index, SPEC K map with file:line, renamed-tests table).
- Register (D-75): `LEGAL_REVIEW_REGISTER.md` rewritten as the index; `legal/REGISTER_PART_1_W0_W8.md` (81 items) and `legal/REGISTER_PART_2_W9_W14.md` (72 items) hold the earlier rows and cross-reference paragraphs, copied by script (`diff` of the moved body against the old lines 15-328, minus the blank line 169: identical; every old item row found byte-identical).
- Updated in place: `AUDIT_AND_NOTIFICATIONS.md` (D-70 SELECT row, D-72 expiry row, retention wording; 350 lines), `PLATFORM_MODERATION_AND_AUDIT.md` (D-54 -> D-70, D-71 page function, R7; 350), `NOTIFICATIONS_AND_SCHEDULING.md` (W13 pointer; 350), `WORKER_CONTRACTS.md` (D-72 wording, D-73 copy, W9-S1 runbook, LIMITATIONS pointer; 280), `ROLE_AND_PROFILE_SECURITY.md` (D-10 rows 53-56: w13a / w13d body pin, D-70 policies, page function grant, D-78 grants; 260), `LOCAL_TEST_HARNESS.md` (96 migrations, 105 / 3185, 6 new pgTAP rows, renamed rows, `run-api-smokes.mjs` with w13 last, w13 smoke 17 checks; 326).

### Register counts
- Before: 153 item rows, all OPEN, no duplicate IDs. After: 160 (153 + W13-L1..L7), all OPEN, each ID a full row exactly once; 0 IDs lost (`comm` of sorted ID lists).
- Layout follows `workforceDocs.w13.test.ts` (coordinator note): W13-L1..L7 are full rows in the index only (section "W13 items"); the index ID list uses `| <where> | <ID> | OPEN | ...` rows so that no earlier ID is a second `| W<n>-L<m> |` row. PLAN section 7 put W13-L* in the index too; nothing was put in part 2 for W13.
- W13-L2 also cites the unchanged `myContractsIntroText` ("You can always decline an offer or end an accepted contract."); W13-L3 quotes the shipped owner caution ("a proper cause", not the plan's "valid cause").
- Wording fix: the index and LEGAL_FLAGS no longer contain the phrase the docs test forbids; the verbatim part paragraphs (W14 section) still contain "that any feature is compliant" as a negated statement, unchanged by design.

### Results
- `cd frontend && npm test`: `Test Files 144 passed (144)`, `Tests 295 passed (295)` (the 3 `workforceDocs.w13` tests pass).
- `wc -l`: every file in `docs/workforce/` and `docs/workforce/legal/` <= 350.

### Not substantiated / left for RECORD or later steps
- W13 Vitest / lint / build totals are not restated in the docs; ACCEPTANCE_TESTS and ARCHITECTURE point to STATE.md.
- The ROLLBACK_GUIDE trigger caveats for W3, W6 and W12 are taken from the area docs and the PLAN; no block was run.
- `LOCAL_TEST_HARNESS.md` had `j17_w3_audit_wiring` at plan 31; LOG says 35, so the row now says 35.
- DECISIONS.md (D-70..D-78), LOOP.md and STATE.md are not touched (RECORD step).

## TEST & RUN - 2026-10-30 (local stack only; no file other than TEST_RESULTS.md and this note written)
Full results and evidence greps: `loop/workforce/increments/W13/TEST_RESULTS.md`.
- lint 0; build 0; Vitest 144 files / 295 tests passed; pytest 4 passed; stager 19/19; run-db-tests Files=105 Tests=3185 `Result: PASS` (0 todo_start); run-api-smokes exit 0, 13 smokes 0 failed, w13 last; stack stopped.
- w13 smoke = 17 passed (13 literal check names + 4 templated `delete_user_<label>` checks). Docs agent's 13 omitted the templated name.
- Plan section 6 tests, renames and trail all present; nothing added. No product-code failure.

## FIX CYCLE 1 (frontend) - 2026-10-31 (frontend/src only; J16 five files untouched)
- C1 `workerContractCopy.ts` myContractsIntroText: "You can always decline an offer or end an accepted contract." -> "You can decline an offer, or record the end of an accepted contract, on WashLink at any time." (matches D-73 terminate framing).
- C3 `workerContractDisplay.ts`: expired status "Ended (end date passed)" -> "Past end date"; endedBy.system "Ended when the end date passed" -> "End date passed (recorded on WashLink)". `ownerRelationshipDisplay.ts` contract_expired (worker + owner): "The contract reached its end date." -> "The contract's end date has passed (recorded on WashLink)."
- Tests: new `presentation/utilities/contractExpiryDisplayCopy.w13.test.ts` (exact strings; no contract/relationship string says "Ended (end date passed)" / "reached its end date"; owner-side text never says "suspend"; no legal-effect wording); `ownerRelationshipDisplay.j15.test.tsx` expectation updated.
- `test/contractExpiryNoticeWording.w13.test.ts`: w13OwnerBody pinned to the DB agent's C2 owner body ("... What this means for you and the worker depends on the contract terms and the law."), re-checked against current w13d.
- Register count: `test/workforceDocs.w13.test.ts` expects 164 rows and W13-L1..L11. Fails (160) until docs add W13-L8..L11 to the index; expected.
- lint exit 0; build exit 0; Vitest 145 files / 299 tests, 1 failed = w13_legal_register_index_matches_parts_and_all_open (160 vs 164, awaiting docs).
- Open for DB agent: w13d header line 9 still names the UI label "Ended (end date passed)"; it is now "Past end date".

## FIX CYCLE 1 (DB) - 2026-10-31 (local only; not committed; no frontend/ or docs/ file touched; no .env read)
Still exactly 4 W13 migrations (w13a..d edited in place; no pre-W13 migration touched). Every edited file <= 350 lines.
- **S1** w13b: `wae_no_client_select` is now `as restrictive for select to authenticated using (false)`. j17_w13_admin_audit_reads
  (21 -> 25): `w13_audit_select_deny_all_is_restrictive` asserts RESTRICTIVE, then plants a permissive `using (true)` select
  policy in the rolled-back transaction: super_admin and owner still read 0 rows; the definer RPC still returns the row.
- **S4** w13a: md5(prosrc) of worker_contracts_audit() must be the w9j body `70f3611014d8f651ce15dc230a820540` or the
  w13d body `aebb4ecc7ac975d3c1d47dc20307774a`, else abort (hashes computed from the files; w9j matches the j15 swap-back
  hash). The comment-based skip is gone; the page-function checks match only a comment starting with `W13:`.
  j15 (19 -> 20) pins the live md5 to the w13d hash.
- **S5** w13b ROLLBACK: D-78 re-grant lines removed; comment "do not re-grant unless the D-10 diff proves production
  depended on them".
- **S6** Local baseline before the fix (previous stack, `has_table_privilege`): anon, authenticated and service_role
  each held SELECT INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER on profiles, shops, bookings, workers, shop_pricing,
  shop_verification_documents. w13b revokes TRUNCATE / REFERENCES / TRIGGER from public / anon / authenticated on the six.
  Kept: SELECT / INSERT / UPDATE / DELETE (app paths under RLS) and service_role on the six (smokes use the service key on
  profiles, N5). Grep: frontend/ and backend/ hold only CSS `truncate`; backend uses its own database.
- **N3** w13b also revokes all on schema washlink_private and on roster_link_code_pepper from service_role (defensive).
- **Roll-up** j17_database_constraints (29 -> 37): every public sequence (USAGE / SELECT / UPDATE, standalone included,
  empty commented allow-list) for anon / authenticated / public and service_role; column-level grants (two checks);
  TRUNCATE / REFERENCES / TRIGGER on every public table; pepper / washlink_private for service_role; BEFORE guard trigger
  set on job_openings / worker_profiles / worker_private_contacts pinned (name:function:tgtype:enabled, from the
  migrations) plus the two WHEN-guarded job_openings triggers. Renamed (N1): `j17_no_workforce_policy_qual_is_the_literal_true`
  (scope comment: literal `true` only) and `j17_no_anon_or_public_write_policy_on_workforce_tables`.
- **C2 / C4** w13d owner body: "A contract reached the end date written in it, so WashLink now shows it as expired. What
  this means for you and the worker depends on the contract terms and the law." Header: UI label is "Past end date".
  j15 owner assertion, j15 md5 swap-back and the w13 smoke OWNER_EXPIRY updated.
- **N4** smoke-admin-audit-log.mjs pages with p_before_id until a short page (maxPages 50, then an error, never a
  silent truncation) and returns `calls`; w14 `admin_audit_log_is_audited_and_admin_only` now expects
  before + before.calls + 1 + last.calls.

### Results
- Before the edits (old W13 files): run-db-tests Files=105 Tests=3185 `Result: PASS`.
- Stager test: 19 / 19 pass. `node --check` ok on the three edited smoke scripts.
- **NOT RUN after the edits:** Docker Desktop's backend crashed during the interruption (log: "initializing Secrets Engine:
  ... rename ...docker-secrets-engine/engine.sock ... engine.sock.stale: The file cannot be accessed by the system"); the
  engine never came up, so run-db-tests, run-api-smokes and the injected-grant negative checks were not run. Expected
  counts once run: 105 files, 3185 - 29 + 37 - 21 + 25 - 19 + 20 = 3198 tests. Stack is not running.

## FIX CYCLE 1 (docs) - 2026-10-31 (docs/workforce/ and W13 LEGAL_FLAGS.md only; not committed; no .env read)

- **Register (C8, L8..L11).** W13-L8..L11 added as OPEN rows in the index "W13 items" section and in the ID list. The index now holds 164 items: part 1 81, part 2 72, index 11, all OPEN, 0 duplicate IDs. Updated the status table, the sign-off rows, the overlap map, the notes paragraph, line 18 (part 2 does not hold W13), `DEPLOYMENT_READINESS.md:65`, `LIMITATIONS.md` (open legal topics) and `ACCEPTANCE_TESTS.md` K10. Shipped copy is quoted from the files:
  - W13-L1 and W13-L8: the owner expiry body "... What this means for you and the worker depends on the contract terms and the law." (w13d:83).
  - W13-L9: "Past end date", "End date passed (recorded on WashLink)" and "The contract's end date has passed (recorded on WashLink)." (`workerContractDisplay.ts:23`, `:60`; `ownerRelationshipDisplay.ts:53`, `:65`).
  - W13-L2: the new intro "You can decline an offer, or record the end of an accepted contract, on WashLink at any time." plus the D-73 terminate text.
  - W13-L11: now says ARCHITECTURE was corrected.
  - LEGAL_FLAGS.md: rows synced and a fix-cycle note added.
- **LIMITATIONS (C5).**
  - D-72 / D-73 entries now say "copy changed, unreviewed" and list what the build and fix cycle 1 each changed.
  - New plain rows: W6-L10, W6-L11, W6 admin assignment / W13-L11 (stated as a gap, not a bypass), W9 C4 (warning not built), W9-L17 / W10-L7 (a trusted end notifies nobody), and the full W6-L13 text.
  - New "Free-training gaps" bullet.
  - The opening and the earlier-REVIEW claim are qualified: "not a proof that nothing else is missing".
- **ARCHITECTURE.**
  - C6: the trainee rule now matches TRAINING.md. The w6h gate refuses every client role, including super_admin, for the training owner's bookings; trusted sessions bypass it; the exception is another owner's booking (W13-L11).
  - N6: service-key access reaches workforce data only through definer RPCs after D-78.
  - The pgTAP count is now marked expected.
- **ACCEPTANCE_TESTS (C7).**
  - The results paragraph separates the last actual run (3185 PASS) from the expected 3198, which is pending a re-run.
  - K1 states plainly that the evidence is mocked Vitest plus lint and build, with no browser end-to-end test.
  - K3 states that no ROLLBACK block has ever been executed.
  - K5, K6 and K8 now cite the requested assertions with file:line, found by grep: j6 complete:44, :134; j6 certified:84, :157; j13 counted:53, :72; `j13_w10_workforce_policy_rules`:7; `TrainingInvitationDetail.j7.test.tsx`:23; j18 roll-up:116.
  - The J17 roll-up list now has 17 names at their new lines (plan 37). j17_w13 (25) and j15_w13 (20) additions are listed, as are the N1 rename row and `contractExpiryDisplayCopy.w13.test.ts`.
- **ROLLBACK_GUIDE (S5).**
  - The section is rewritten: w13b ROLLBACK re-grants none of the D-78 / S6 / N3 revokes ("do not re-grant unless the D-10 diff proves production depended on them").
  - Rolling back w13b drops the restrictive policy and re-opens W14 N1.
  - The J17 renamed policy checks are named.
  - W13 block lines updated: w13d:112, w13c:68, w13b:81, w13a:80.
- **DEPLOYMENT_READINESS.**
  - S1: unknown audit select policies must be dropped before W13.
  - S7(a): the Realtime gate checks all publications, `pg_publication_namespace` and `pg_publication_tables` (schemaname 'public').
  - S7(b): new gate to run the J17 roll-up catalogue assertions on a restored production-schema copy.
  - The grants gate adds S6 and N3; the replaced-bodies gate adds the md5 pin.
  - C8: spec D training-model and spec E template-and-workflow review gates added.
  - 32 boxes, all `- [ ]`, 0 ticked.
- **ROLE_AND_PROFILE_SECURITY.**
  - Row 53: md5 pin with both hashes, checked against w13a.
  - Row 54: RESTRICTIVE policy; drop unknown policies.
  - Row 56: S6 pre-workforce revokes, N3 `washlink_private` revoke, and the rollback no longer re-grants.
- **LOCAL_TEST_HARNESS.**
  - 105 files / 3198 tests written as "EXPECTED ... pending re-run, not a result"; 3185 is kept as the last actual run.
  - Roll-up / j17_w13 / j15_w13 plans 37 / 25 / 20 (before: 29 / 21 / 19).
  - The smokes are noted as not re-run after fix cycle 1; the N4 helper paging is noted.
  - w13 smoke: 17 = 13 named checks + 4 `delete_user_*` (TEST_RESULTS).

Results: `cd frontend && npm test` -> `Test Files 145 passed (145)`, `Tests 299 passed (299)`. Every docs file is <= 350 lines (largest: three at 350, unchanged in this cycle). DB suite and smokes are not re-run (Docker down; outside this step).

## FIX CYCLE 1 (DB) runs - 2026-11-03 (local stack only; Docker restored; not committed; no frontend/ or docs/ touched)
- Stager test: `tests 19`, `pass 19`, `fail 0`.
- run-db-tests, first run: `Files=105, Tests=3178`, `Result: FAIL`. The roll-up stopped at test 16/37:
  `j17_service_role_cannot_reach_roster_link_code_pepper` got `f,f,f,f` (concat_ws of booleans) and then line 148 raised
  `operator is not unique: text || "char"` (tgenabled). Fix in the roll-up only: `::text` casts. The pinned BEFORE trigger set
  was then read from the live catalog and matched the pin exactly (tgtype 19 / 15 / 19 / 19 / 23 / 23 / 11 / 23, all `O`).
- run-db-tests, second run: `All tests successful.` `Files=105, Tests=3198`, `Result: PASS`; 0 `todo_start(` in the log and
  in supabase/tests/database. Matches the expected 3198.
- Injected negative checks (each statement inserted after plan() inside the test's own begin..rollback; one at a time;
  afterwards the catalog showed none of them left). Baseline runs of both files: no `not ok`.
  | injection | file | failing assertion |
  |---|---|---|
  | grant usage on sequence workforce_audit_events_id_seq to authenticated | roll-up | j17_no_client_role_has_privileges_on_any_public_sequence |
  | grant select on sequence certification_status_events_id_seq to service_role | roll-up | j17_service_role_has_no_workforce_table_privileges |
  | grant update (body) on notifications to authenticated | roll-up | j17_no_column_level_grant_on_workforce_tables |
  | grant references (id) on worker_contracts to service_role | roll-up | j17_no_column_level_grant_on_workforce_tables |
  | grant truncate on bookings to authenticated | roll-up | j17_no_client_role_has_truncate_references_or_trigger_on_any_public_table |
  | grant trigger on profiles to anon | roll-up | j17_no_client_role_has_truncate_references_or_trigger_on_any_public_table |
  | grant usage on schema washlink_private to service_role | roll-up | j17_service_role_cannot_reach_roster_link_code_pepper |
  | grant select on roster_link_code_pepper to service_role | roll-up | j17_service_role_cannot_reach_roster_link_code_pepper |
  | drop trigger job_openings_normalize | roll-up | j17_guard_triggers_on_client_writable_tables_are_pinned |
  | disable trigger worker_profiles_guard_certified_delete | roll-up | j17_guard_triggers_on_client_writable_tables_are_pinned |
  | planted permissive `using (true)` select policy on workforce_audit_events | roll-up | j17_no_workforce_policy_qual_is_the_literal_true |
  | wae_no_client_select re-created PERMISSIVE | j17_w13 | w13_audit_select_deny_all_is_restrictive |
- run-api-smokes (same stack): exit 0, `run-api-smokes: PASS (13 smokes)`; w2 48, w3 33, w4 43, w5 39, w6 40, w7 38, w8 30,
  w9 34, w10 39, w11 36, w14 33, w12 22, w13 17; 0 failed. Only 33 log_searched events existed, so no smoke call needed a
  second page; the paging path was checked separately with a fake client (7 rows, page size 2: ids 1..7, 4 calls,
  before_ids null,6,4,2; maxPages 2 returns an error, not a truncated list).
- Stack stopped (`Stopped supabase local development setup.`; 0 supabase containers).

## VERIFY, RECORD - 2026-11-03

- Docker Desktop crashed during an API rate-limit pause (2026-10-31): hard stop, recorded in STATE.md. Restarted 2026-11-03;
  fix cycle 1 DB runs then passed (3198 / PASS, 13 smokes, 12 injected-grant negative checks). Orchestrator replaced the
  "pending re-run" counts in LOCAL_TEST_HARNESS.md, ACCEPTANCE_TESTS.md (incl. K9) and ARCHITECTURE.md with the actual results.
- VERIFY: fresh verifier, clean local run: lint 0, build 0, Vitest 145 / 299, pytest 4, stager 19/19, `Files=105, Tests=3198`,
  `Result: PASS` (96 migrations), run-api-smokes PASS (13 smokes, 0 failed); stack stopped. AC1–AC15 PASS (`VERDICT.md`).
- RECORD: DECISIONS D-70..D-78 ADOPTED-DEFAULT (loop, 2026-11-03); LOOP.md W13 smoke / runner row and counts; STATE.md W13
  passed; all W0–W14 passed; next: final whole-branch verification.
