# W13 - Hardening, docs, rollback guide, legal-review register - PLAN

**No split.** One increment: 4 small migrations, 6 new pgTAP files, 1 new smoke + 1 smoke runner, ~10 frontend files, 7 new docs, each <= 350 lines.
Fallback for the orchestrator, only on a re-plan after the fix-cycle limit: "W13a" = code (sections 3, 6, 7 code: migrations, tests, smokes,
frontend); "W13b" = docs, register and readiness checklist (section 7 docs; no code). W13b depends only on W13a's names, not its build.

Spec: K (definition of done), J1-J18 (final coverage), G (rollback / recovery, no second database), I (notice wording), E (contract safety copy),
H (admin queue usable at volume). Depends on all of W0-W12 and W14: every row `passed` in STATE.md (HEAD eeb552b). Decisions used: D-3, D-6, D-10,
D-11, D-28, D-34, D-40, D-50..D-58, D-61, D-63..D-66 (all ADOPTED-DEFAULT except D-10). D-54 explicitly hands the raw audit policy to W13.
**No dependency on an OPEN decision** other than D-10 (standing, non-blocking). New decisions D-70..D-77 (section 5). Not BLOCKED.

## 0. Findings from reading the code (drive the design)
- Every J-scenario already has pgTAP files named `j<n>_*` and Vitest files tagged `*.j<n>.test.*` (99 pgTAP files, 137 Vitest files). Two scenarios
  lack a file whose name states the scenario: J17 (only `j17_authorization_harness` + per-increment `j17_w<n>_*`) and J18 (`j18_existing_flows` +
  `j18_w<n>_flows`). No cross-module J17 catalogue check exists (every table / policy / grant / definer function in one place).
- W14 N1: `wae_select_super_admin` (w3b:233) lets a super_admin select `workforce_audit_events` and the security_invoker view
  `shop_verification_review_log` (w3d:298, granted to authenticated) without a `workforce_audit.log_searched` event. No frontend file reads either
  (`grep -rln "workforce_audit_events\|shop_verification_review_log" frontend/src` empty). BUT 3 pgTAP assertion groups and ~27 smoke call sites in
  w3, w4, w5, w6, w7, w8, w10, w11, w14 read the raw table as super_admin. Dropping the policy forces those reads onto the audited RPC.
- W14 N3: `admin_job_opening_moderation_queue` (w14e:77) is oldest-first `limit 200`, no cursor. W11 certification-review / dispute queues
  (w11d:74, w11g:60) and the unreviewed-shop queue (w14f:73) use the same cap.
- W12 C2: `worker_contracts_audit()` exists only in w9j (never replaced); its `expired` branch (w9j:94-97) says "...reached its end date and has
  expired." Title `Contract expired` is pinned by 5 pgTAP files; the body text by none. `notifications.body` <= 400 chars, no `@`, no 7-digit runs.
- W9 C2 / C3: `workerContractCopy.ts:69-73` still says "You can end this contract at any time." (pinned by `MyContractsPanel.w9.test.tsx:52`); owner
  copy has no caution. W9-S1 rest: w10b's trusted repair cannot touch `pending_version_id`, so a trusted terminate leaves an open amendment.
- W12 verdict: `j13_w12_scheduled_jobs` uses `w12_contract_expiry_job_expires_past_end_and_notifies_each_party_once` for 4 assertions (lines 71-82)
  that check four different things (run result, notices, end stamps, second run).
- Docs: `ARCHITECTURE_AUDIT.md` is the pre-build W0 audit (reconstructed baseline, ERD proposal), not an overview of what was built. No rollback
  guide, limitations file, J index or readiness checklist exists. `LEGAL_REVIEW_REGISTER.md` has 153 items, all OPEN, no duplicate IDs, 328 lines.
  `AUDIT_AND_NOTIFICATIONS.md` and `PLATFORM_MODERATION_AND_AUDIT.md` are at 350 lines, `NOTIFICATIONS_AND_SCHEDULING.md` at 349.
- Migration apply order by file name is W2..W11, **W14 (2026_10_29), W12 (2026_10_30)**, then W13; rollback is the exact reverse (not W14 first).

## 1. Scope / out of scope
In: (1) J1-J18 audit: coverage index, two scenario-named roll-up pgTAP files (J17, J18), fix the W12 repeated name. (2) SPEC K evidence map in
`docs/workforce/ACCEPTANCE_TESTS.md` (feeds FINAL_VERDICT.md). (3) Hardening: N1, N3, C2, W9 C2 / C3 copy, W9-S1 runbook test (section 2).
(4) Docs: ARCHITECTURE, ROLLBACK_GUIDE, LIMITATIONS, DEPLOYMENT_READINESS, ACCEPTANCE_TESTS, final legal register pass. (5) `w13-api-smoke.mjs` and
`run-api-smokes.mjs` (runs every smoke in order, for the final verifier).
Out (reason): retention periods (a legal decision, W3-L1 / W12-L6: documented, not invented); paging of the W11 / W14f queues (lower volume,
accepted); keyword category for statutory-benefit exclusions (W9 C5: the list needs legal review, W9-L16); refusing reclassification by amendment
(W9 C4: product / legal decision, W9-L13); server refusal of header-like owner text (W9 S2: accepted); rate limit on `is_active` audit events
(W10 S4: documented); e-signature, email / SMS / push, Realtime (D-6, D-61, D-62); renaming migrations to 14-digit versions (D-11, human).
Never: production apply, `db push`, cron registration, merge, push, `.env`, SQLAlchemy / Alembic, an edited committed migration.

## 2. Hardening register (every routed carry-forward; IN = built and tested in W13; ACCEPTED = listed in LIMITATIONS.md with source and flag)
| Item | Decision | How / where |
|---|---|---|
| W14 N1 raw super_admin audit select + review-log view | IN (D-70) | w13b; test 3, J17 roll-up; smokes moved to the audited RPC |
| W14 N3 moderation queue paging | IN (D-71) | w13c keyset page function; hook "Load more"; test 4; smoke |
| W12 C2 / W12-L9 expiry notice "has expired" | IN (D-72) | w13d replaces only the two expiry body strings; pinned diff Vitest; test 5; smoke |
| W12 repeated test name in `j13_w12_scheduled_jobs` | IN (D-76) | 3 renames, original name kept on the first assertion |
| W12 smoke narrower than planned (no expiry / second-run run) | IN (part) | w13 smoke runs a real contract through the runner twice; certification notice run stays pgTAP-only |
| W9 C2 / W9-L15 worker "end at any time" copy | IN (D-73) | `workerContractCopy.ts`; W9 test expectation text updated (name unchanged) |
| W9 C3 / W9-L14 owner termination caution | IN (D-73) | `workerContractCopy.ts` |
| W9-S1 rest: trusted terminate leaves an open amendment | ACCEPTED + runbook test | test 6 pins both the limitation and the runbook sequence; ROLLBACK_GUIDE "trusted repairs" |
| W9 S2 header-like owner text; S3 superuser can fake JWT claims | ACCEPTED | hash still binds the real text; superuser out of scope |
| W9 S4 accept does not re-check `shops.owner_id` | ACCEPTED (moot) | `shops.owner_id` frozen since W2 |
| W9 C4 reclassification / retroactive amendment; C5 statutory keywords | ACCEPTED | W9-L13, W9-L16 stay OPEN |
| W10 S4 `is_active` toggle audit volume | ACCEPTED | intended semantics; no rate limit |
| W10 C8, W11 parallel opens, W12 row-lock contention, real cron firing | ACCEPTED | LIMITATIONS "Not tested" |
| W11 / W14f queues capped at 200 | ACCEPTED | volume bounded by per-event caps / finite legacy set |
| W2 R-5 "deactivate reviewers, don't delete"; W4 D-10 rows 21-23 backfill | IN (docs) | DEPLOYMENT_READINESS runbook |
| W2 R-6 / W2-L3 no re-review on phone / pin / document change; account enumeration | ACCEPTED | LIMITATIONS |
| W3 rejected actions not audited; W6 orphan programs, admin cross-owner assignment, W6-L13; W7 untested lock paths | ACCEPTED | LIMITATIONS |
| W4 low: revoke `job_opening_missing_publish_fields`; `changed_fields` in trusted audit | ACCEPTED | invoker helper used by the w4c trigger; revoking would break owner publish |
| W3-L1 / W12-L6 retention periods | ACCEPTED (legal) | W13-L5; trusted purge procedure unchanged |
| D-68 no deep links into tabs | ACCEPTED | LIMITATIONS |

## 3. Migrations (`2026_10_30_w13<x>_<snake>.sql`, staged 20261030000006..09; 96 after W13; each ends with `-- ROLLBACK`; each <= 350 lines)
Idempotent; PostgREST reload notify last; definer functions `set search_path = public, pg_temp`; comments start `W13:`.
### 3.1 `2026_10_30_w13a_hardening_preflight.sql` (creates nothing)
Abort naming each missing item: table `workforce_audit_events`, view `shop_verification_review_log`, functions `admin_workforce_audit_log(...)`,
`admin_job_opening_moderation_queue(text)`, `worker_contracts_audit()`, `worker_contract_notify(uuid,uuid,bigint,text,text)`. Abort (D-10 drift) if
`worker_contracts_audit` prosrc lacks either exact W9 string `' reached its end date and has expired.'` / `'A contract reached its end date and has
expired.'` (a production body that differs must be reviewed by a human first), or if `admin_job_opening_moderation_queue_page` exists without a `W13`
comment. NOTICE (no abort) listing every select policy on `workforce_audit_events` other than `wae_select_super_admin` (unknown production policies,
D-10). Rollback: nothing.
### 3.2 `2026_10_30_w13b_admin_audit_reads_only_through_rpc.sql` (D-70)
`drop policy if exists "wae_select_super_admin"`; create `wae_no_client_select` (`for select to authenticated using (false)`); the table grant stays
(clients get 0 rows, unchanged for non-admins); `revoke select on public.shop_verification_review_log from authenticated` (42501 for every client;
the view stays for trusted SQL and the D-10 runbook); comments on table, view and `admin_workforce_audit_log` say super_admin reads go only through
that audited RPC. `my_workforce_activity`, `admin_workforce_audit_log`, `admin_oversight_access_flags` are definer: unchanged.
ROLLBACK: drop `wae_no_client_select`; recreate `wae_select_super_admin` exactly as w3b:234-236; `grant select on ...review_log to authenticated`.
### 3.3 `2026_10_30_w13c_admin_moderation_queue_paging.sql` (D-71)
`admin_job_opening_moderation_queue_page(p_status text default 'active', p_after_opened_at timestamptz default null, p_after_id uuid default null,
p_limit integer default 50)` returns the w14e queue columns plus `total_count integer`; stable, definer; same status validation (22023) and the same
super_admin / profile-role check (else 0 rows); `p_limit` outside 1..100 -> 22023 `Page size must be between 1 and 100.`; cursor parts both null or
both set, else 22023 `Give both parts of the page cursor.`; keyset `(c.opened_at, c.id) > (p_after_opened_at, p_after_id)` order by opened_at, id;
`total_count` = all cases matching the status filter. Same lateral report counts and categories as w14e; no statements, reporters or notes; not
audited (no personal data, as w14e). `revoke all ... from public, anon, service_role`; granted to `authenticated` only. The w14e function is not
replaced (W14 tests keep using it). ROLLBACK: drop the function.
### 3.4 `2026_10_30_w13d_contract_expiry_notice_wording.sql` (D-72; the only replaced body in W13)
`create or replace function public.worker_contracts_audit()` = w9j:30-117 **byte-identical** except the two `expired` bodies:
worker `'Your contract with ' || shop_label || ' reached the end date written in it, so WashLink now shows it as expired. What this means for your
work depends on the contract terms and the law.'`; owner `'A contract reached the end date written in it, so WashLink now shows it as expired.'`.
Title `Contract expired` (the status label shown in the UI) and every other branch unchanged; category, key and registry row unchanged; comment
appends `W13: expiry notice wording (D-72).` Existing notices are not rewritten (true records). ROLLBACK: re-create the w9j:30-117 body verbatim
(commented in full in the block, as w10b did).

## 4. State machines (no new state; W13 changes who may read and how a queue is paged)
Audit read: super_admin raw select `allowed -> 0 rows`; review-log view `select -> 42501` for every client role; reads only through
`admin_workforce_audit_log` (writes `workforce_audit.log_searched` first) or trusted SQL (operators, not logged; W13-L4). Moderation queue page:
`first page (no cursor) -> next page (cursor = last row) -> ... -> empty page`; super_admin only, no writes. Worker contract (W9 / W10 / W12
unchanged): `accepted|active -> expired` (system) now notifies with the D-72 wording; trusted repair stays forward-only (D-40) and notifies nobody;
the runbook closes an open amendment first (test 6). Decline / terminate: never refused (J16), unchanged.

## 5. Decisions taken in this plan (RECORD adds them to DECISIONS.md as ADOPTED-DEFAULT (loop, <date>))
- D-70 Audit reads: the W3 raw super_admin select is dropped; the review-log view is trusted-SQL only; every super_admin audit read goes through
  `admin_workforce_audit_log` (closes D-54's "W13 decides", W14 N1; narrows W14-L9). Database operators keep trusted SQL access (not logged).
- D-71 Moderation queue: keyset pages of 50 (1..100), oldest first, with a total count and "Load more"; the 200-row function stays for compatibility.
- D-72 Contract expiry notice: body says WashLink "shows it as expired" from the written end date and points to the contract and the law; title
  unchanged. Wording still needs legal review (W13-L1).
- D-73 Termination copy: worker "You can record the end of this contract on WashLink at any time. Give a short reason; the shop will see it. Notice
  periods or other duties under your contract or the law may still apply. Final pay and clearance are not handled on WashLink."; owner copy adds
  "Ending a work relationship can have legal requirements such as a valid cause and notice. WashLink only records the end."
- D-74 Accepted limitations: every ACCEPTED row in section 2 is listed in LIMITATIONS.md with its source and flag; none is a legal claim.
- D-75 Legal register layout: `LEGAL_REVIEW_REGISTER.md` = index (status summary, topic index of every ID, overlap map, W13-L*, blank human sign-off
  table); item tables move unchanged to `docs/workforce/legal/REGISTER_PART_1_W0_W8.md` and `REGISTER_PART_2_W9_W14.md`. Nothing deleted or closed.
- D-76 Test renames keep an evidence trail: old -> new pairs are listed in section 6 and in `ACCEPTANCE_TESTS.md` "Renamed tests".
- D-77 Final verification aid: `scripts/supabase-test/run-api-smokes.mjs` runs w2..w11, w14, w12, w13 in that order, prints each tail line and stops
  at the first non-zero exit (local stack only; same safety rules; it runs nothing else).

## 6. Tests (pgTAP `plan(n)` = actual; 0 `todo_start(`; each file <= 350 lines; no new helper file, existing helpers only)
New pgTAP files (99 -> 105):
1. `j17_database_constraints_and_authorization_prevent_unauthorized_access.test.sql` (J17 roll-up; the table list is explicit and the first test
   proves it equals every public table not in the local baseline): j17_workforce_table_list_is_complete, j17_every_workforce_table_has_rls_enabled,
   j17_no_client_role_has_insert_update_delete_on_workforce_tables, j17_service_role_has_no_workforce_table_privileges,
   j17_no_workforce_policy_is_unconditionally_true_for_clients, j17_every_definer_function_pins_search_path_with_pg_temp_last,
   j17_anon_executes_no_workforce_function, j17_no_workforce_table_in_realtime_publication, j17_raw_audit_table_unreadable_by_every_client_role,
   j17_private_contract_tables_unreadable_by_non_parties (other owner, other worker, customer, super_admin), j17_no_set_config_wrapper_exposed.
2. `j18_existing_booking_pricing_verification_and_rating_workflows_still_work.test.sql` (J18 roll-up after all 96 migrations with workforce data
   present: a roster-linked worker with an active contract and a certificate, and a trainee in required training):
   j18_customer_books_with_server_quote, j18_owner_accepts_booking_and_assigns_contracted_roster_worker, j18_assigned_worker_completes_booking,
   j18_customer_rates_completed_booking_once, j18_owner_manages_own_pricing_only, j18_shop_verification_submit_review_and_resubmit,
   j18_trainee_still_not_assignable_during_required_training, j18_booking_tables_gain_no_workforce_columns.
3. `j17_w13_admin_audit_reads.test.sql`: w13_super_admin_raw_audit_select_returns_zero_rows, w13_review_log_view_denied_42501_for_every_client,
   w13_review_log_view_readable_by_trusted_sql, w13_admin_audit_log_returns_rows_and_records_search, w13_my_workforce_activity_unchanged,
   w13_audit_table_select_policies_are_deny_all, w13_audit_rows_still_append_only.
4. `j2_w13_moderation_queue_paging.test.sql` (7 cases via `test_helpers.report_test_job_opening`): w13_queue_page_oldest_first_default_50,
   w13_queue_page_keyset_no_gaps_or_duplicates (3 + 3 + 1, then empty), w13_queue_page_total_count_matches_filter,
   w13_queue_page_newest_case_reachable, w13_queue_page_rows_equal_old_queue_rows, w13_queue_page_limit_bounds_22023,
   w13_queue_page_cursor_needs_both_parts_22023, w13_queue_page_super_admin_only, w13_queue_page_has_no_statement_reporter_or_note_columns.
5. `j15_w13_contract_expiry_notice_wording.test.sql` (runner and backdate helpers as in `j13_w12_scheduled_jobs`):
   w13_expiry_notice_worker_body_uses_record_wording, w13_expiry_notice_owner_body_uses_record_wording, w13_no_notification_body_says_has_expired,
   w13_expiry_notice_title_category_and_key_unchanged, w13_other_contract_notice_bodies_unchanged (sent, withdrawn, accepted, declined, started,
   ended by each party, party removed), w13_expiry_still_one_notice_per_party, w13_expired_contract_still_stops_counting,
   w13_audit_function_comment_records_w13.
6. `j15_w13_trusted_contract_end_runbook.test.sql`: w13_raw_trusted_terminate_leaves_open_amendment (pins the accepted limitation),
   w13_runbook_closes_open_amendment_then_terminates (write flag + `worker_contract_close_open_versions` + update, as the W12 batch does),
   w13_runbook_end_notifies_nobody_and_is_audited_as_trusted_session, w13_worker_decline_and_terminate_unaffected_by_runbook (J16).
Changed existing pgTAP (old -> new; the W3 / W12 verdicts cite the old names, so ACCEPTANCE_TESTS.md keeps the pairs):
- `001_migration_replay`: 96 migrations (+20261030000006..09); `replay_schema_migrations_has_baseline_w2_to_w14_and_w12` ->
  `replay_schema_migrations_has_baseline_w2_to_w14_w12_and_w13`; add `replay_w13_audit_table_has_no_client_select_policy`.
- `j17_w3_audit_events`: `j17_audit_readable_only_by_super_admin` (5 assertions) -> `j17_audit_raw_table_not_readable_by_any_client_role`; admin 0.
- `j17_w3_audit_wiring`: `w3_shop_review_log_view_is_super_admin_only` -> `w3_shop_review_log_view_is_trusted_sql_only` (admin and anon 42501);
  `w3_shop_review_history_survives_reviewer_deletion` keeps its name; its view read moves to `act_as_service`.
- `j13_w12_scheduled_jobs`: line 71 keeps the old name; lines 73 / 76 / 82 -> `w12_contract_expiry_job_notifies_each_party_once`,
  `w12_contract_expiry_job_stamps_system_end_and_clears_pending`, `w12_contract_expiry_job_second_run_changes_nothing`.
- Any other assertion that reads the raw table while acting as super_admin (found by the full run) moves to `act_as_service`, name unchanged.
Smokes: NEW `scripts/supabase-test/smoke-admin-audit-log.mjs` (exports `adminAuditRows(client, filters)`: calls `admin_workforce_audit_log`, returns
`{ data, error }` with `id` = event_id, ordered like the old reads). w3, w4, w5, w6, w7, w8, w10, w11, w14 smokes replace every raw
`workforce_audit_events` / view read with it (each file stays <= 350 lines; check counts unchanged); w14 `searches()` allows for the helper's own
search events. w3 renames: `super_admin_reads_shop_audit_events` -> `super_admin_reads_shop_audit_events_through_audited_log`,
`super_admin_reads_review_log` -> `review_log_view_denied_for_super_admin`. NEW `w13-api-smoke.mjs` (W12 rules: loopback only, keys from local
`supabase status` in memory, `smoke13-*@local.test` users deleted and asserted, TEST-ONLY `docker exec` psql with uuid values only):
raw_audit_select_returns_zero_rows_for_super_admin_owner_worker, review_log_view_denied_42501, admin_audit_log_returns_rows_and_logs_search,
queue_page_walks_three_cases_two_per_page, queue_page_total_count, queue_page_zero_rows_for_owner_and_worker, queue_page_denied_for_anon_and_service_role,
contract_expiry_runner_one_notice_per_party_with_record_wording, no_notice_body_says_has_expired, second_runner_call_creates_nothing,
set_config_not_exposed. Must end `0 failed`.
Vitest (mocked; the existing 282 stay green): w13_queue_hook_loads_more_with_keyset_cursor_and_dedupes, w13_queue_hook_resets_on_filter_change,
w13_queue_panel_shows_n_of_total_and_load_more, w13_queue_panel_empty_loading_error_states, w13_repository_calls_page_rpc_only,
w13_worker_terminate_copy_has_no_unconditional_right_statement, w13_owner_terminate_copy_has_legal_caution,
w13_expiry_notice_body_differs_from_w9_only_in_two_strings (reads w9j and w13d; after swapping the two strings back the bodies are equal),
j17_w13_frontend_never_reads_raw_audit_table_or_review_log, w13_workforce_docs_exist_with_required_sections,
w13_acceptance_index_lists_only_existing_test_files, w13_legal_register_index_matches_parts_and_all_open.
`MyContractsPanel.w9.test.tsx:52` expects the D-73 text (test name unchanged).

## 7. Files
Frontend (UI -> hooks -> services -> repositories -> Supabase; each <= 350 lines). Change: `domain/models/JobOpeningModeration.ts`
(+ `AdminModerationQueuePage`, cursor type); `domain/repositories/JobOpeningModerationRepository.ts` (+ `listAdminQueuePage`);
`infrastructure/repositories/SupabaseJobOpeningModerationRepository.ts`; `infrastructure/supabase/supabaseJobOpeningModerationRows.ts` (page row
with `total_count`); `application/services/JobOpeningModerationService.ts`; `presentation/hooks/useAdminModerationQueue.ts`;
`presentation/components/superAdmin/moderation/PostingReportQueuePanel.tsx` ("Showing n of N", "Load more", `Skeleton` / `EmptyState` /
`LoadErrorNotice`); `presentation/utilities/{jobOpeningModerationCopy, workerContractCopy}.ts`; `MyContractsPanel.w9.test.tsx` (expected text).
Add tests: `presentation/hooks/useAdminModerationQueue.w13.test.ts`, `presentation/components/superAdmin/moderation/PostingReportQueuePaging.w13.test.tsx`,
`presentation/utilities/workerContractCopy.w13.test.ts`, `test/{contractExpiryNoticeWording.w13, noRawAuditReads.j17, workforceDocs.w13}.test.ts`.
Scripts: add `scripts/supabase-test/{smoke-admin-audit-log, w13-api-smoke, run-api-smokes}.mjs`; change the nine smokes above. No backend change.
Docs (each <= 350 lines; no compliance claim anywhere):
- ADD `docs/workforce/ARCHITECTURE.md`: what was built (W2-W14), data flow, source of truth (Supabase; FastAPI scaffold has no workforce tables),
  table / function map per area, security model (RLS deny-all writes, definer RPCs, write flags, trusted session, notification registry), notice and
  scheduling path, frontend layers, links to every per-feature doc and to `ARCHITECTURE_AUDIT.md` (W0 history, kept unchanged).
- ADD `ROLLBACK_GUIDE.md`: preconditions (local first; production only with written approval; export before irreversible steps); **step 0** run
  `scripts/supabase-scheduling/unregister_workforce_jobs.sql` (as postgres, by jobid) wherever jobs were registered; order W13 (d..a) -> W12 (e..a)
  -> W14 (i..a; w14c in one transaction; w14c / w14f trigger name order, D-10 rows 46-48) -> W11 (i..a) -> W10 (g..a; reopens W9-S1) -> W9 (j..a;
  IRREVERSIBLE contract and acceptance loss) -> W8 -> W7 -> W6 (training evidence, D-18) -> W5 -> W4 -> W3 (audit history) -> W2; W1 / W0 have no
  migrations (baseline is test-only, D-1). Per step: which block, data lost, what stays, stager helper to drop. Trigger-order caveats (W3 producers vs
  guards, W6 booking gate after the W2 guard, W11 holds after W7 guards, W12 registry after `notifications_guard_insert`, W14 combined trigger).
  D-10: no rollback is valid on production until the schema diff is done; D-11: staged 14-digit versions vs repo names. Trusted repairs runbook (test 6).
- ADD `LIMITATIONS.md`: product limits (in-app only, no e-signature, informational three-owner count, English only, capped queues, no deep links,
  polling), security limits (superuser / table owner can bypass triggers; trusted SQL reads not logged; rejected actions not audited), "Not tested"
  (concurrency items, real cron firing, ROLLBACK blocks not executed), every ACCEPTED row of section 2 with its source, open legal topics by ID.
- ADD `DEPLOYMENT_READINESS.md` (human gates as unchecked boxes; the loop ticks none): D-10 schema dump and diff (rows 1-55, incl. Realtime
  `puballtables`, trigger names, unknown audit policies from the w13a NOTICE); D-11 migration version naming before any `db push`; approved shops with
  null reviewer (W4 rows 21-23) and "deactivate reviewers, never delete them" (W2 R-5); super_admin created by SQL only (D-8); legal review sign-off of
  every register item; cron registration after approval (D-63 runbook); first-run backlog (W12 R5); merge `feature/workforce` -> `main` and Render
  deploy only with explicit human authorization.
- ADD `ACCEPTANCE_TESTS.md`: J1-J18 index (section 8 table), SPEC K evidence map (section 9, with file:line), renamed-tests table (section 6).
- REWRITE `LEGAL_REVIEW_REGISTER.md` as the D-75 index; ADD `legal/REGISTER_PART_1_W0_W8.md`, `legal/REGISTER_PART_2_W9_W14.md` (rows copied
  verbatim, cross-reference paragraphs kept); add W13-L1..L7. De-duplication = an overlap map (for example W0-L1 / W10-L1 / W10-L2 three-owner
  meaning; W0-L4 / W9 e-signature items; W3-L1 / W12-L6 / W13-L5 retention), never merged or deleted rows.
- UPDATE in place (no file may pass 350 lines): `AUDIT_AND_NOTIFICATIONS.md` (line 28 -> D-70; line 323 -> D-72 text),
  `PLATFORM_MODERATION_AND_AUDIT.md` (D-54 line -> D-70; paging), `NOTIFICATIONS_AND_SCHEDULING.md` (W13 pointer), `WORKER_CONTRACTS.md` (expiry
  wording, D-73, LIMITATIONS pointer), `ROLE_AND_PROFILE_SECURITY.md` (D-10 rows 53-55: w13a body pin; dropped raw policy and unknown production
  audit policies; new page function grant), `LOCAL_TEST_HARNESS.md` (96 migrations, 105 files, w13 smoke, run-api-smokes).
RECORD: LOOP.md W13 smoke row + run-api-smokes note; DECISIONS D-70..D-77; STATE.md full-suite numbers from one clean reset.

## 8. J1-J18 coverage (pgTAP in `supabase/tests/database/`; Vitest = count of `*.j<n>.test.*` files; smoke = `w<n>-api-smoke.mjs`)
| J | Scenario-named pgTAP | Other pgTAP | Vitest | Smoke | Gap -> W13 |
|---|---|---|---|---|---|
| J1 | `j1_worker_registration_and_profile` | `j18_w2_profile_reads`, `j17_w2_worker_data_guards` | 13 | w2 | none (index only) |
| J2 | `j2_owner_can_create_and_manage_only_own_job_openings` | `j2_job_opening_lifecycle`, `j2_w14_*` (2) | 3 | w4, w14 | + `j2_w13_moderation_queue_paging` |
| J3 | `j3_unverified_owner_cannot_publish_job_openings`, `j3_unverified_owner_cannot_issue_shop_certifications` | `j3_w14_unreviewed_approved_shops` | 2 | w4, w7, w14 | none |
| J4 | `j4_worker_can_browse_and_apply_without_duplicates` | `j4_w5_*`, `j4_w7_*` | 1 | w5 | none |
| J5 | `j5_application_status_transitions_are_validated` | `j5_application_audit_*`, `j5_w5_fix1_*` | 1 | w5 | none |
| J6 | `j6_worker_cannot_complete_training_without_three_days_and_assessment`, `j6_worker_cannot_be_certified_without_three_days_and_assessment` | `j6_w6_*` (2), `j6_w7_*` (2), `j6_w11_*` | 3 | w6, w7 | none |
| J7 | `j7_required_initial_training_is_free_to_the_worker` | - | 4 | w6 | none |
| J8 | `j8_unauthorized_users_cannot_alter_training_evidence`, `j8_unauthorized_users_cannot_alter_certification_records` | `j8_w11_*` (3) | 4 | w6, w7, w11 | none |
| J9 | `j9_owner_can_customize_contract_draft_and_save_reusable_template_version` | `j9_w8_*` (3), `j9_w9_*` (4) | 3 | w8, w9 | none |
| J10 | `j10_accepted_contract_contents_preserved_after_template_change` | - | 1 | w9 | none |
| J11 | `j11_material_contract_amendments_require_acceptance` | - | 1 | w9 | none |
| J12 | `j12_worker_and_owner_cannot_access_other_parties_private_contracts` | `j12_w11_*` (2) | 2 | w9, w11 | none |
| J13 | `j13_three_distinct_qualifying_owner_relationships_counted` | `j13_w10_*` (2), `j13_w12_scheduled_jobs` | 1 | w10 | repeated name in `j13_w12` -> fixed |
| J14 | `j14_same_owner_contracts_and_amendments_count_once` | - | 1 | w10 | none |
| J15 | `j15_relationship_counting_policy_for_each_status` | `j15_w10_trusted_contract_repair_rules` | 1 | w10, w12 | + `j15_w13_*` (2) |
| J16 | `j16_three_owner_rule_never_blocks_decline_or_termination` | `j16_w11_*`, `j16_w12_*` (2) | 2 | w9, w10, w11 | none |
| J17 | **none** (generic `j17_authorization_harness` + 27 `j17_w<n>_*`) | as listed | 11 | w2-w14 | **gap**: roll-up file 1; + `j17_w13_admin_audit_reads` |
| J18 | **none** (generic `j18_existing_flows` + 12 `j18_w<n>_*`) | as listed | 9 | w2 | **gap**: roll-up file 2 |
Old generic files are not renamed (verdicts W1-W12 cite them); the index points to both. Every listed file passed in the W12 full run (99 files).

## 9. SPEC K evidence map (outline; ACCEPTANCE_TESTS.md fills file:line; the final verifier copies it into FINAL_VERDICT.md)
| K item | Evidence |
|---|---|
| K1 complete role-aware frontend flows | `DASHBOARDS_AND_OVERSIGHT.md` (D-42, D-57); Vitest j1-j18 / w11 / w14 tags; lint + build exit 0 |
| K2 persistent data, validated lifecycle transitions | `j2_job_opening_lifecycle`, `j5_application_status_transitions_are_validated`, `j6_w6_training_program_and_enrollment_lifecycle`, `j6_w7_certification_lifecycle`, `j9_w9_worker_contract_rules`, `j15_relationship_counting_policy_for_each_status` |
| K3 migrations and authorization policies | `001_migration_replay` (96, clean reset), every ROLLBACK block, J17 roll-up, `ROLLBACK_GUIDE.md` |
| K4 job-opening and application workflows | J2-J5 files; w4 / w5 / w14 smokes |
| K5 training with a minimum three-day requirement | `j6_worker_cannot_complete_training_without_three_days_and_assessment`, `j7_required_initial_training_is_free_to_the_worker`, `TRAINING.md` |
| K6 evidence-based certification issuance | `j6_worker_cannot_be_certified_without_three_days_and_assessment`, `j8_unauthorized_users_cannot_alter_certification_records`, `CERTIFICATIONS.md` |
| K7 editable, versioned templates and contract records | J9-J12 files; `CONTRACT_TEMPLATES.md`, `WORKER_CONTRACTS.md` |
| K8 correct distinct-owner counting | J13-J16 files; `OWNER_RELATIONSHIPS.md` (D-3 informational) |
| K9 tests for access control, business rules, regressions | J17 / J18 roll-ups and all `j17_*` / `j18_*`; full-suite numbers in STATE.md |
| K10 documented limitations and outstanding legal review | `LIMITATIONS.md`, `LEGAL_REVIEW_REGISTER.md` (all OPEN), `DEPLOYMENT_READINESS.md` |
| K closing line: no deploy / shared apply without authorization | `git status -sb` shows no upstream push; `grep -rnE "db push\|--linked\|--db-url" scripts` only refusals / comments; DEPLOYMENT_READINESS gates |

## 10. Acceptance criteria (repo root, local only: `cd frontend && npm run lint / build / test`; `backend/.venv/Scripts/python.exe -m pytest -q`; `node --test scripts/supabase-test/stage-local-workdir.test.mjs`; `node scripts/supabase-test/run-db-tests.mjs`; then `node scripts/supabase-test/run-api-smokes.mjs`; never `--linked`, `--db-url`, `db push`, `.env`)
| AC | Criterion | Evidence |
|---|---|---|
| AC1 | 4 new migrations `2026_10_30_w13[a-d]_<snake>.sql`, each with `-- ROLLBACK`; nothing committed changed | `ls supabase/migrations/2026_10_30_w13*`; `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_30_w13*` empty; `git diff --name-status eeb552b -- supabase/migrations` only `A` |
| AC2 | Clean reset replays 96 migrations; 105 files PASS; 0 TODO | runner ends `Result: PASS`; `replay_schema_migrations_has_baseline_w2_to_w14_w12_and_w13`, `replay_w13_audit_table_has_no_client_select_policy` ok; `grep -c "todo_start(" supabase/tests/database/*.sql` all 0 |
| AC3 | Every J1-J18 has a scenario-named pgTAP file and a Vitest file, all passing | `for n in $(seq 1 18); do ls supabase/tests/database/j${n}_*.test.sql >/dev/null 2>&1 \|\| echo missing $n; done` empty; same loop over `find frontend/src -name "*.j${n}.test.*"`; Vitest `w13_acceptance_index_lists_only_existing_test_files` |
| AC4 | J17 roll-up | every name in `j17_database_constraints_and_authorization_prevent_unauthorized_access` ok |
| AC5 | J18 roll-up | every name in `j18_existing_booking_pricing_verification_and_rating_workflows_still_work` ok; pytest `4 passed` |
| AC6 | N1 closed: no raw client audit read; admin reads audited | every name in `j17_w13_admin_audit_reads`; renamed W3 assertions ok; Vitest `j17_w13_frontend_never_reads_raw_audit_table_or_review_log`; `grep -rn "from('workforce_audit_events')\|shop_verification_review_log" scripts/supabase-test/*.mjs` only negative checks (w3, w13) |
| AC7 | N3 closed: moderation queue pages | every name in `j2_w13_moderation_queue_paging`; Vitest `w13_queue_*`, `w13_repository_calls_page_rpc_only`; w13 smoke `queue_page_*` |
| AC8 | C2 closed: expiry wording, nothing else in W9 changed | every name in `j15_w13_contract_expiry_notice_wording`; Vitest `w13_expiry_notice_body_differs_from_w9_only_in_two_strings`; `grep -c "create or replace function" supabase/migrations/2026_10_30_w13d*` = 1 |
| AC9 | W9 copy and trusted-end runbook | Vitest `w13_worker_terminate_copy_has_no_unconditional_right_statement`, `w13_owner_terminate_copy_has_legal_caution`; `grep -c "can end this contract at any time" frontend/src/presentation/utilities/workerContractCopy.ts` = 0; every name in `j15_w13_trusted_contract_end_runbook` |
| AC10 | Repeated W12 name fixed | `grep -c "'w12_contract_expiry_job_expires_past_end_and_notifies_each_party_once'" supabase/tests/database/j13_w12_scheduled_jobs.test.sql` = 1; file ok |
| AC11 | Every smoke passes from one runner | `run-api-smokes.mjs` exit 0; w2..w11, w14, w12, w13 each end `0 failed`; per-smoke check counts equal LOOP.md (w13 recorded new) |
| AC12 | Frontend | all Vitest pass (282 + W13 names); lint, build exit 0; `grep -rn "service_role" frontend/src` empty |
| AC13 | Docs complete | `ls docs/workforce/{ARCHITECTURE,ROLLBACK_GUIDE,LIMITATIONS,DEPLOYMENT_READINESS,ACCEPTANCE_TESTS,LEGAL_REVIEW_REGISTER}.md`; Vitest `w13_workforce_docs_exist_with_required_sections` (rollback order line, "unregister", D-10, D-11; LIMITATIONS names every ACCEPTED row) |
| AC14 | Register final pass: all OPEN, indexed, nothing lost | Vitest `w13_legal_register_index_matches_parts_and_all_open` (153 + 7 IDs; each once in the index and in exactly one part; status OPEN) |
| AC15 | Size, safety | `wc -l` of every added / changed code, test, smoke and doc file <= 350; `git diff --stat eeb552b -- backend frontend/smtp-test.js frontend/smtp-test.cjs scripts/supabase-scheduling` empty; no `.env` read |

## 11. Rollback, risks and legal-review flags
Rollback (local only, reverse d..a): d re-create the w9j `worker_contracts_audit` body (notices already sent keep the D-72 text); c drop the page
function (revert the frontend with it); b recreate `wae_select_super_admin`, re-grant the view, drop `wae_no_client_select`; a nothing. Frontend,
smokes and docs: revert. A W12 rollback after this still needs the cron unregister first (ROLLBACK_GUIDE step 0).
Risks: R1 hidden reads of the raw table while acting as super_admin (pgTAP helpers, smokes) surface only on the full run; fix the read (trusted
session or RPC), never re-add the policy. R2 smokes w10 (348 lines) and w11 (350) have no headroom: each helper call must be shorter than the raw read
it replaces. R3 production drift (D-10): w13a refuses to replace a `worker_contracts_audit` body that lacks the W9 strings, so a production-only edit
is never silently lost. R4 the page function copies the w14e query; `w13_queue_page_rows_equal_old_queue_rows` catches divergence; a later change
must change both. R5 smoke audit-log searches add `log_searched` rows (local only); w14 counts must allow for them. R6 the register split breaks
line-number pointers in old REVIEW / VERDICT files (IDs stay stable; pointers are historical). R7 super_admin loses ad hoc raw queries; incident work
uses the RPC or trusted SQL (documented). R8 scope: on a re-plan use the W13a / W13b fallback (top of file).
Legal (to the register, all OPEN; nothing in UI or docs claims legal effect, compliance, or that a worker was legally notified):
- W13-L1 Expiry notice wording (D-72; extends W12-L9, W12-L2): whether "WashLink now shows it as expired" and the title "Contract expired" avoid
  stating that the work relationship legally ended, and whether expiry needs a formal notice outside WashLink.
- W13-L2 Worker termination copy (D-73; W9-L15): accuracy of "record the end ... notice periods or other duties may still apply".
- W13-L3 Owner termination caution (D-73; W9-L14): whether a general caution is enough or cause / notice steps are needed before recording an end.
- W13-L4 Audit access governance (D-70; W3-L3, W14-L9): admin reads are logged, operator trusted-SQL reads are not; who may hold database access.
- W13-L5 Retention periods remain undefined for audit events, notifications, contracts and training evidence (W3-L1, W12-L6, D-32, D-18).
- W13-L6 Accepted limitations (D-74) and the deployment checklist must be reviewed and signed by humans before production; the loop signs nothing.
- W13-L7 Report handling has no response-time commitment; oldest-first paging can delay attention to new reports (D-71; W14 report items).
