# W14 - LOG

## BUILD (DB) - 2026-10-29

Branch `feature/workforce`, base HEAD a880331. Nothing committed. Local Docker stack only (`.local-supabase-test`, project
`washlink-local-test`); no `--linked`, `--db-url`, `db push`, no `.env` read; the supabase CLI was never run from the repo root.
Item 6 (admin take-over of shop review requests) is out (D-44 unchanged). The `w14-api-smoke.mjs`, frontend and docs are not
part of this step.

### Files
Added (9 migrations, each with a commented `-- ROLLBACK` block, each <= 350 lines; staged 20261029000010..18):
- `supabase/migrations/2026_10_29_w14a_moderation_preflight.sql` (104) - creates nothing
- `supabase/migrations/2026_10_29_w14b_job_opening_moderation_tables.sql` (299)
- `supabase/migrations/2026_10_29_w14c_job_opening_moderation_guard_and_holds.sql` (194)
- `supabase/migrations/2026_10_29_w14d_job_opening_moderation_rpcs.sql` (268)
- `supabase/migrations/2026_10_29_w14e_job_opening_moderation_reads.sql` (151)
- `supabase/migrations/2026_10_29_w14f_unreviewed_approved_shops.sql` (214)
- `supabase/migrations/2026_10_29_w14g_admin_relationship_lookups.sql` (230)
- `supabase/migrations/2026_10_29_w14h_workforce_audit_reads.sql` (200)
- `supabase/migrations/2026_10_29_w14i_moderation_audit_and_notifications.sql` (157)

Added helper (7th `HELPERS_SOURCE_NAMES` entry): `scripts/supabase-test/baseline/test_helpers_moderation.sql` (93):
`report_test_job_opening` (real RPC), `make_test_shop_legacy_unreviewed(p_shop, p_keep_reviewer default false)` (TEST-ONLY trusted
update), `delete_test_admin_profile` (real auth.users cascade), plus two TEST-ONLY time shifts (see deviation D8). No helper inserts
a case, report, action or access record.

Added pgTAP (plan = actual, 0 `todo_start(`, each <= 350 lines): `j2_w14_job_opening_reports` (30), `j2_w14_job_opening_takedown` (51),
`j3_w14_unreviewed_approved_shops` (33), `j17_w14_audit_reads` (31), `j17_w14_relationship_lookups` (24),
`j17_w14_moderation_authorization` (30), `j17_w14_moderation_audit_and_notifications` (13), `j18_w14_flows` (15) = 227 tests.
Every test name in PLAN section 6 is used (`w14_worker_lookup_returns_rows_count_and_minimum` now asserts the minimum is absent, D1).

Changed: `scripts/supabase-test/stage-local-workdir.mjs` (7th helper; 348 lines), `scripts/supabase-test/stage-local-workdir.test.mjs`
(`stager_seeds_every_helper_file_in_order` checks seven suffixes; 349 lines), `supabase/tests/database/001_migration_replay.test.sql`
(87 staged migrations, + 20261029000010..18, renamed `replay_schema_migrations_has_baseline_w2_to_w14`, +
`replay_w14_moderation_tables_rls_enabled`; plan 24 -> 25). `git diff --name-status a880331 -- supabase/migrations`: empty (only
new untracked files); `git diff --stat a880331 -- supabase/tests/database`: only `001_migration_replay.test.sql`. No W2b / W3 / W4 /
W5 / W8 / W10 / W11 function body replaced.

### Actual results (local stack)
- Pre-W14 baseline on the same machine: `Files=82, Tests=2622` `Result: PASS` (78 staged migrations).
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: tests 19, pass 19, fail 0.
- `node scripts/supabase-test/run-db-tests.mjs` (fresh stage + `db reset` + `test db`): 87 staged migrations;
  `Files=90, Tests=2850` `Result: PASS` (exit 0; +8 files, +228 tests = 227 W14 + 1 replay).
  `grep -c "todo_start(" supabase/tests/database/*.sql`: every file 0.
  First full run was `Result: FAIL` on the pre-existing `j16_only_w10_reads_and_setter_reference_workforce_policies` (my worker
  lookup read `workforce_policies`); fixed in w14g (D1), not by editing the J16 test.
- Smokes on the same stack, in order: w2 48 passed / 0 failed, w3 33 / 0, w4 43 / 0, w5 39 / 0, w6 40 / 0, w7 38 / 0, w8 30 / 0,
  w9 34 / 0, w10 39 / 0, w11 36 / 0.
- Idempotency: all nine W14 migrations applied twice in one `begin ... rollback` on the migrated local DB: no error; 35
  `W14:`-commented functions.
- W4 pin: `md5(prosrc)` of `job_openings_guard_write()` = `c02f116816ef3ccbb87d2b3a7579c316`, equal to the md5 of the w4c file
  body text; `md5(pg_get_functiondef)` = `c27f3310d727483c36deee39382374e5` (pinned in
  `w14_w4_guard_body_unchanged_and_trigger_order`). BEFORE triggers on job_openings (name order, tgtype):
  `job_openings_guard_moderation` (UPDATE), `job_openings_guard_write` (INSERT/DELETE, 15), `job_openings_guard_write_update`
  (UPDATE, 19, same W4 function), `job_openings_moderation_hold` (UPDATE), `job_openings_normalize`. BEFORE UPDATE on shops:
  `shops_prevent_owner_verification_mutation`, `shops_zz_rereview_stamp`. w14c / w14f abort if those orders differ.
- AC greps: `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_29_w14*` empty; `grep -rni "take_over\|takeover"` empty.
- Stack stopped: `npx supabase stop --workdir <abs .local-supabase-test> --no-backup` run from inside the staged workdir.

### RPCs for the frontend (all `authenticated` only; anon / service_role denied)
Workers:
- `report_job_opening(p_job_opening_id uuid, p_category text, p_statement text) returns table (report_id uuid, status text, created_at timestamptz)`
  categories `age_requirement | other_discriminatory_requirement | worker_fee_or_deposit | unpaid_trial_or_training | misleading_terms | other`.
- `withdraw_job_opening_report(p_report_id uuid) returns table (report_id uuid, status text, withdrawn_at timestamptz)`
- `my_job_opening_reports() returns table (report_id, job_opening_id, opening_title_snapshot, shop_name_snapshot, category, statement,
  status, outcome, created_at, closed_at, can_withdraw)`
- `job_opening_report_max_open_per_worker()` = 10, `job_opening_report_max_per_opening()` = 3 (per worker and opening, lifetime).
Owners:
- `owner_job_opening_moderation() returns table (case_id uuid, job_opening_id uuid, status text, reason_kind text, owner_message text,
  owner_change_note text, status_changed_at timestamptz, can_submit_changes boolean, history jsonb)`; history items
  `{action, reason_kind, owner_message, created_at}`; only decided cases (never `open` / `dismissed`).
- `submit_job_opening_changes(p_case_id uuid, p_note text default null) returns table (case_id uuid, status text, revision integer, status_changed_at timestamptz)`
super_admin:
- `admin_job_opening_moderation_queue(p_status text default 'active') returns table (case_id, status, revision, report_count,
  open_report_count, categories text[], opening_status, opening_present, opening_title_snapshot, shop_name_snapshot, opened_at,
  status_changed_at)`; statuses `active | open | dismissed | paused_by_washlink | changes_submitted | lifted | closed_by_washlink |
  resolved_owner_closed`; non-admin: 0 rows.
- `admin_job_opening_moderation_case(p_case_id uuid) returns jsonb` (audited): keys `case`, `opening` (snapshot keys + status,
  first_published_at, status_changed_at, updated_at, or null), `shop` {name, verification_status, is_active,
  has_recorded_verification}, `reports` [{reporter_label "Reporter n", category, statement, status, outcome, created_at,
  reported_snapshot}], `actions` [{action, actor_role, reason_kind, owner_message, opening_snapshot, created_at}],
  `application_counts` {status: n}.
- `moderate_job_opening(p_case_id uuid, p_expected_revision integer, p_action text, p_reason_kind text, p_owner_message text, p_admin_note text)
  returns table (case_id uuid, status text, revision integer, status_changed_at timestamptz)`; actions `dismiss | pause | close |
  keep_paused | lift`.
- `admin_unreviewed_approved_shops() returns table (shop_id, shop_name, owner_display_name, is_active, reviewer_state,
  verification_reviewed_at, last_decision_at, published_opening_count, current_certification_count, active_contract_count,
  suspended_relationship_count)`; reviewer_state `reviewer_missing | review_time_missing | reviewer_not_super_admin`.
- `rereview_approved_shop(p_shop_id uuid, p_decision text, p_notes text default null) returns table (shop_id uuid, verification_status text, verification_reviewed_at timestamptz)`;
  decisions `confirm_approval | request_changes | reject`.
- `admin_worker_relationships(p_worker_id uuid, p_purpose text, p_note text) returns jsonb` -> `{found:false}` or `{found, worker_display_name,
  distinct_qualifying_owner_count, relationships:[{relationship_id, owner_name_snapshot, owner_present, status, status_reason,
  counts_toward_goal, qualifying_contract_count, first_accepted_at, last_active_at, ended_at}]}`.
- `admin_owner_relationships(p_owner_id uuid, p_purpose text, p_note text) returns jsonb` -> `{found:false}` or `{found, owner_display_name,
  relationships:[{relationship_id, worker_name_snapshot, status, status_reason, counts_toward_goal, qualifying_contract_count,
  first_accepted_at, last_active_at, ended_at}]}`; purposes `party_support_request | reported_problem_follow_up |
  moderation_follow_up | policy_monitoring | legal_or_regulatory_request`.
- `admin_workforce_audit_log(p_action_prefix text default null, p_subject_type text default null, p_subject_id uuid default null,
  p_profile_id uuid default null, p_actor_id uuid default null, p_from timestamptz default null, p_to timestamptz default null,
  p_before_id bigint default null, p_limit integer default 50) returns table (event_id bigint, created_at, actor_id, actor_role, actor_kind,
  action, subject_type, subject_id, subject_profile_id, payload jsonb, access_purpose text, access_note text)` (audited, newest first).
- `admin_oversight_access_flags() returns table (dispute_id, contract_id, opened_days, case_view_count, distinct_viewer_count, last_viewed_at)`;
  `oversight_flag_open_days()` = 30, `oversight_flag_read_count()` = 5.
- `admin_moderation_summary() returns table (open_report_case_count, changes_submitted_count, paused_by_washlink_count, oldest_open_case_at,
  unreviewed_approved_shop_count, oversight_flag_count, relationship_lookups_last_30_days)`; non-admin: 0 rows.
Every role:
- `my_workforce_activity(p_before_id bigint default null, p_limit integer default 50) returns table (event_id bigint, created_at timestamptz,
  action text, subject_type text, actor_label text, details jsonb)`; actor_label `you | washlink | washlink_system | shop_owner | worker | someone`.
Standard template publishing UI: unchanged W8 `publish_platform_contract_template_version(p_expected_version_number integer, p_clauses jsonb)`.

Error messages (SQLSTATE):
42501 `Job opening not found.` / `Report not found.` / `Moderation case not found.` / `Shop not found.` /
`Only a platform administrator can moderate job openings.` / `... can read moderation cases.` / `... can review shops.` /
`... can look up relationships.` / `... can read the audit log.` / `This job opening change is not allowed.` /
`Moderation records cannot be edited.` / `Moderation records change only through the WashLink moderation actions.` /
`Access records are append-only.` / `Access records are written only by the WashLink lookup actions.`;
22023 `Choose a report reason.` / `Choose a moderation action.` / `Choose a reason for this action.` / `Choose a case status.` /
`Choose confirm approval, request changes or reject.` / `Choose a purpose for this lookup.` / `Choose a person to look up.` /
`Choose a page size between 1 and 100.` / `Choose a page size between 1 and 200.` /
`Use only lowercase letters, dots and underscores in the action filter.` /
`Use only lowercase letters and underscores in the subject type filter.` / `The start of the range must be before the end.`;
23505 `You already reported this job opening.`;
23514 `Write 20 to 1000 characters.` / `You have reached the report limit. Wait for WashLink to review your reports.` /
`This report is no longer open.` / `This action is not available for this case.` / `This job opening no longer exists.` /
`Write a message to the owner of 20 to 500 characters.` / `Write an internal note of 20 to 1000 characters.` /
`Only a published or paused job opening can be paused or closed.` / `This job opening is not waiting for your changes.` /
`Edit the job opening before asking WashLink to check it.` / `Write at most 500 characters.` /
`WashLink paused this job opening. Edit it and ask WashLink to check it before publishing again.` (from `transition_job_opening`) /
`This shop already has a recorded review.` / `Write notes of 20 to 1000 characters.` / `Write a note of 20 to 300 characters.`;
55000 `This case changed. Refresh and try again.`

### Deviations from PLAN (and why)
- D1 `admin_worker_relationships` does NOT return the current minimum: the pre-existing
  `j16_only_w10_reads_and_setter_reference_workforce_policies` pins that only W10 functions reference `workforce_policies`, and
  only `001_migration_replay` may change. The console can read the minimum through the W10 `wp_select_super_admin` policy.
  The test `w14_worker_lookup_returns_rows_count_and_minimum` keeps its plan name and asserts the key is absent.
- D2 The four new tables also have `updated_at` (rule: every table has created_at / updated_at); immutable rows stamp it = created_at.
- D3 Three extra internal definer helpers (revoked from every client role, W14-commented): `job_opening_moderation_close_reports(uuid, text)`
  (w14c), `shop_reviewer_state(uuid, timestamptz)` (w14f), `admin_access_record_lookup(text, uuid, text, text, integer)` (w14g). Totals:
  35 W14 functions, 20 client RPCs, 15 internal, 31 security definer (the 4 constants are immutable SQL).
- D4 Dismiss is also allowed from `paused_by_washlink` / `changes_submitted` once the opening is gone (state machine row "any ->
  only dismiss"); the case guard accepts those transitions only with a null `job_opening_id`.
- D5 An owner close / archive (`resolved_owner_closed`) also closes the case's open reports as `opening_closed` (reporters notified
  with the fixed report-closed text); otherwise they would stay open forever and count toward the 10-open limit.
- D6 Close (like pause) requires the opening to be published or paused; an `open` case on an owner-closed opening is dismissed.
  Unknown `p_action` -> 22023; lift may carry an optional new owner message (validated 20..500).
- D7 `admin_job_opening_moderation_queue` adds `opening_title_snapshot`; RPC return shapes above were not fixed by the plan.
- D8 Helpers: two extra TEST-ONLY time shifts, `backdate_test_moderation_case(p_case, p_minutes default 60)` (pause and edit share
  `now()` in one pgTAP transaction) and `backdate_test_contract_dispute(p_dispute, p_days)` (N6); both disable the guard for one
  statement, as `backdate_shop_review_request` does.
- D9 Moderation action `created_at` uses `clock_timestamp()` so history order is insert order even within one transaction.
- D10 `my_workforce_activity` shows `job_opening_moderation.opened / .dismissed / .case_viewed / .deleted` to their actor only (they
  would reveal a report to the owner, D-53). `workforce_audit.log_searched` has subject_type `workforce_audit` and no subject profile.
  Lookups audit subject_type `profile`, subject_id = subject_profile_id = the looked-up id.
- D11 The repeated `pause_kept` notification key is `job_opening_moderation:<case>:pause_kept:<revision>` (each one notifies);
  other keys as planned. Re-review confirmation key `shop_rereview:<shop>:<audit event id>`, category `shop_verification.rereviewed`.
- D12 `rereview_approved_shop` sets the re-review flag for all three decisions, so `shop.verification_rereviewed` is also audited
  for request_changes / reject (owner notified only by W3 there); `p_notes` is ignored for confirm_approval.
- D13 "trainer" in `w14_owner_customer_trainer_cannot_report` = a roster-linked worker account designated trainer without a worker
  profile; reporting requires a worker profile (reporter FK to worker_profiles).
- D14 w14a: the trigger-name drift check is skipped when `job_openings_guard_moderation()` already carries the W14 comment
  (re-run after W14), so the preflight stays idempotent.

### Not verified here
- PostgREST / GoTrue surface of the new RPCs (the `w14-api-smoke.mjs` is not written in this step).
- Frontend, docs, Vitest, lint / build, pytest (not run in this DB step).

## BUILD (docs) - 2026-10-29

Docs only (no code, migration, test or frontend file touched; nothing committed; no `.env` read). Added
`docs/workforce/PLATFORM_MODERATION_AND_AUDIT.md` (324 lines: P72-P79, D-50..D-58, the four tables, state machines,
trigger order, RPCs / reads / messages, activity and audit-log reads, N6, relationship lookups, unreviewed approved shops
and the "Runbook" section, audit and notifications, tests, deviations D1..D14, risks, rollback). The DB is described as
built (for example no minimum in the worker lookup (D1); owners never see report events or open / dismissed cases (D10));
the frontend is described "as planned" and must be reconciled after the frontend step. Updated `JOB_OPENINGS.md` (102),
`MARKETPLACE_AND_APPLICATIONS.md` (191), `CONTRACT_TEMPLATES.md` (210), `OWNER_RELATIONSHIPS.md` (297),
`AUDIT_AND_NOTIFICATIONS.md` (pointer only, still 350), `DASHBOARDS_AND_OVERSIGHT.md` (343; split delivered, N6),
`ROLE_AND_PROFILE_SECURITY.md` (243; rows 14 / 22 -> queue, new D-10 rows 46-48 incl. the w14c trigger split and
`shops_zz_rereview_stamp` name order (R1), W14 guard matrix), `LOCAL_TEST_HARNESS.md` (349 -> 283: W2..W11 smoke sections
condensed into one section with shared rules; 87 migrations, 7 helper files, 90 files / 2850 tests, 8 W14 pgTAP rows,
replay plan 25, W14 smoke section marked planned / not yet run), `CERTIFICATIONS.md` (item 6 not built) and
`LEGAL_REVIEW_REGISTER.md` (298; W14-L1..L12 OPEN, notes for W4-L4 / L7 / L8 / L9 and others). Added
`loop/workforce/increments/W14/LEGAL_FLAGS.md`. Every remaining "W14" carry-forward now states what was delivered. All
docs <= 350 lines. No compliance or legal-validity claim made.

## BUILD (frontend) - 2026-10-29

Branch `feature/workforce`, base HEAD a880331. Nothing committed. No `.env` read; no `docs/`, `supabase/` or `scripts/` file
edited in this step (docs were written in parallel by another agent). RPC names, argument names, return shapes and messages are
the ones listed in "BUILD (DB)" above.

### Files
Added (70; each <= 350 lines, largest 243):
- models: `domain/models/{JobOpeningModeration, WorkforceActivity, AdminOversight, PlatformContractTemplateDraft}.ts`;
  repositories: `domain/repositories/{JobOpeningModeration, WorkforceActivity, AdminOversight, PlatformContractTemplate}Repository.ts`;
  `domain/utilities/platformContractTemplateDraft.ts` (pure: version clauses -> draft -> publish payload, change count).
- infrastructure: `infrastructure/supabase/{supabaseJobOpeningModerationRows, supabaseWorkforceActivityRows,
  supabaseAdminOversightRows, supabaseModerationErrorMessages}.ts`; `infrastructure/repositories/Supabase{JobOpeningModeration,
  WorkforceActivity, AdminOversight, PlatformContractTemplate}Repository.ts` (RPCs only, via the W11 `supabaseRpcCalls`).
- application: `application/validation/moderationSchemas.ts` (zod, database messages); `application/services/{JobOpeningModeration,
  WorkforceActivity, AdminOversight, PlatformContractTemplate}Service.ts`; DI `presentation/dependencyInjection/createModerationDependencies.ts`.
- copy: `presentation/utilities/{jobOpeningModerationCopy, workforceActivityCopy, adminOversightCopy, standardContractCopy}.ts`.
- hooks: `useMyJobOpeningReports`, `useOwnerJobOpeningModeration`, `useAdminModerationQueue`, `useAdminModerationCase`,
  `useMyWorkforceActivity`, `useAdminAuditLog`, `useAdminAccessFlags`, `useAdminRelationshipLookup`, `useUnreviewedApprovedShops`,
  `useStandardContractEditor`, plus `useReportJobOpening` and `useAdminModerationSummary` (deviation F3).
- components: `worker/marketplace/{ReportOpeningModal, MyOpeningReportsList}.tsx`; `owner/jobOpenings/{OpeningModerationNotice,
  SubmitOpeningChangesModal}.tsx`; `superAdmin/moderation/{PostingReportQueuePanel, PostingReportCaseDrawer, ModerateOpeningForm,
  DecideOpeningChangesForm}.tsx`; `superAdmin/shops/{UnreviewedApprovedShopsPanel, RereviewShopDrawer}.tsx` (reuses
  `ShopReviewDocumentList`); `superAdmin/standardContract/{StandardContractPanel, StandardContractEditor,
  PublishStandardContractModal}.tsx` (reuses `ContractTemplatePreview`); `superAdmin/audit/{AdminAuditLogPanel, AdminAuditFilters,
  AdminAccessFlagsList}.tsx`; `superAdmin/relationships/RelationshipLookupPanel.tsx`; `account/{WorkforceActivityDrawer,
  WorkforceActivityList}.tsx`.
- tests (11 files, 21 tests, every section-6 Vitest name) + fixtures `test/moderationFixtures.ts`:
  `worker/marketplace/ReportOpening.j2.test.tsx` (3 j2_w14_report_* / j2_w14_my_reports_*), `owner/jobOpenings/OpeningModeration.j2.test.tsx`
  (3 j2_w14_owner_* / j2_w14_resume_*), `superAdmin/moderation/PostingReports.w14.test.tsx` (w14_admin_posting_queue_and_case_drawer,
  w14_moderate_form_requires_reason_and_message, w14_decide_changes_form_actions_by_status), `superAdmin/shops/UnreviewedApprovedShops.j3.test.tsx`,
  `superAdmin/standardContract/StandardContract.w14.test.tsx` (3 w14_standard_contract_*), `account/WorkforceActivity.j17.test.tsx`,
  `superAdmin/audit/AdminAudit.w14.test.tsx` (2), `superAdmin/relationships/RelationshipLookup.w14.test.tsx`,
  `features/superAdmin/SuperAdminDashboardPage.w14.test.tsx` (w14_super_admin_console_nine_tabs_default_overview,
  w14_admin_overview_moderation_counts), `infrastructure/repositories/SupabaseModerationRepositories.j17.test.ts`,
  `infrastructure/supabase/supabaseModerationErrorMessages.w14.test.ts`.

Changed (15): `superAdmin/{superAdminTabs.ts, AdminOverviewPanel.tsx (second summary), ShopVerificationSection.tsx (view toggle)}`,
`features/superAdmin/SuperAdminDashboardPage.tsx` (4 new lazy panels), `domain/utilities/workforceNextActions.ts` (admin targets
`posting_reports`, `audit_log`; `adminModerationNextActions`), `worker/marketplace/{MarketplaceOpeningDetail, WorkerMarketplacePanel}.tsx`,
`owner/jobOpenings/{JobOpeningListItem, OwnerJobOpeningsPanel}.tsx`, `UserAccountMenu.tsx` ("Your activity", lazy drawer),
`infrastructure/supabase/supabaseErrorMessages.ts` (merges the W14 list, +3 lines), `dependencyInjection/createOversightDependencies.ts`,
`hooks/useOversightActionRunner.ts` (55000 texts of the W14 case and the W8 template), `features/worker/WorkerWorkspaceTabs.tsx` and
`owner/OwnerDashboardTabPanels.tsx` (one prop each, F1).

Unchanged (verified with `git diff a880331`): the five J16 files (TerminateContractModal, DeclineContractModal, AcceptContractModal,
WorkerContractReview, RequestCertificationReviewModal), `owner/contractTemplates/*`, `ApplicationSnapshotView.tsx`,
`JobOpeningTransitionConfirmModal.tsx`, every W9 contract component (`worker/contracts`, `owner/workerContracts`, `contracts`);
`backend/` empty diff; `grep -rn "service_role" frontend/src` empty.

### Actual results (frontend/)
- Baseline before this step: `Test Files 118 passed (118)`, `Tests 233 passed (233)`.
- `npm run lint`: exit 0, no findings.
- `npm run build` (`tsc -b && vite build`): exit 0, `built in 782ms`; the new panels are separate lazy chunks.
- `npm test`: `Test Files 129 passed (129)`, `Tests 254 passed (254)` (233 existing unchanged + 21 W14), exit 0.
- `wc -l`: every added / changed file <= 350 (largest `OwnerJobOpeningsPanel.tsx` 321, was 301).

### Deviations from PLAN (and why)
- F1 Wiring: `moderationDependencies` is an optional field of the W11 `OversightDependencies` (built by `createOversightDependencies`);
  `createSuperAdminDependencies` is unchanged. Owners and workers already receive `oversightDependencies`, so `WorkerWorkspaceTabs.tsx`
  and `OwnerDashboardTabPanels.tsx` each pass one extra prop (files not in the plan's change list).
- F2 Backward compatibility: without `moderationDependencies` (W11 test doubles, older callers) the console keeps the W11 five tabs
  (`superAdminTabItemsFor`), the overview shows no second summary and the marketplace / owner panels show no W14 controls; this keeps
  `w11_super_admin_console_tabs_and_default_overview` green unchanged. With them the nine D-57 tabs show.
- F3 Two extra hooks: `useReportJobOpening` (keeps the report RPC out of the modal) and `useAdminModerationSummary` (overview).
- F4 `ContractTemplateVersionHistory` is not reused for the standard: its actions ("Compare with standard", "Start a new template")
  are owner-only and the file must stay unchanged; `StandardContractPanel` lists versions (number, date, saved by, fingerprint)
  from the same W8 read. `ContractTemplatePreview` is reused.
- F5 Standard editor: only the heading and text of editable clauses change; clauses are never added, removed or re-ordered (the W8
  validator requires each standard clause exactly once). Unchanged clauses are sent exactly as read; edited text is trimmed.
  Publishing with no change is blocked in the client ("Change at least one editable clause before publishing.").
- F6 The relationship minimum (DB D1) is read through the W10 `WorkforcePolicyService.loadPolicies()` (super_admin select), only
  after a worker lookup is shown.
- F7 `OwnerJobOpeningsPanel.tsx` also hosts `useOwnerJobOpeningModeration` and `SubmitOpeningChangesModal` (not only the map) and
  re-reads the notices after an edit is saved, so "Ask WashLink to check it" appears without waiting for the 60 s poll.
- F8 While a hold is active, the owner's Resume button is disabled with the database's own hold text as its reason (P75); the
  database still refuses (23514) and that refusal is mapped as written.
- F9 The reporter's list shows only their own text and the outcome kind; the owner notice never reads reports (D-53); owner copy
  never says "Suspended". Statements, owner messages and admin notes are shown as stored.
- F10 Audited reads (moderation case, lookups, audit-log searches) run only on open / submit and once after an action, never polled;
  React StrictMode in development still doubles mount reads (W11 N7, R4).
- Docs note: `PLATFORM_MODERATION_AND_AUDIT.md` describes the frontend "as planned"; F1, F2, F4 and F5 should be reconciled there.

### Not verified here
- Live PostgREST behaviour of the W14 RPCs from the browser (`w14-api-smoke.mjs` not written in this step); every frontend test
  uses mocked repositories or the Supabase client double.

## BUILD (docs reconcile) - 2026-10-29

Docs only (`docs/workforce/` and `W14/LEGAL_FLAGS.md`; nothing committed; no `.env` read). Replaced every "as planned"
frontend description with the built files from "BUILD (frontend)" F1..F10: `PLATFORM_MODERATION_AND_AUDIT.md` Frontend
section rewritten (F1 / F2 optional `moderationDependencies` on `OversightDependencies`, nine tabs when wired as in
production, five W11 tabs without; F3 extra hooks; F4 `StandardContractPanel` lists versions itself, `ContractTemplateVersionHistory`
unchanged; F5 only editable clause headings / text, no-change publish blocked; F6 minimum read via the W10
`WorkforcePolicyService` after a worker lookup; F7 notice re-read after edit; F8 Resume disabled while held; F9 owner and
reporter views; F10 audited reads never polled, StrictMode doubles in development), runbook step 2, tests (Vitest 129 files /
254 tests, 21 new; lint / build exit 0; the W14 smoke count is left to the test step), risks R4 and rollback; the deviations
section condensed to stay at 349 lines. Also updated `CONTRACT_TEMPLATES.md` (212), `DASHBOARDS_AND_OVERSIGHT.md` (344),
`OWNER_RELATIONSHIPS.md` (298), `LOCAL_TEST_HARNESS.md` (283; Vitest 129 / 254), `LEGAL_REVIEW_REGISTER.md` (298; W14 intro,
W14-L11 source) and `LEGAL_FLAGS.md` (W14-L7 / L11 sources, no longer "planned"). Every `frontend/src/...` path in
`docs/workforce/` and LEGAL_FLAGS.md was checked against the files and exists; the one unresolved short name
(`useWorkerProfileResolution.ts` in `ARCHITECTURE_AUDIT.md`) is a W0 citation pinned to commit ec6570a and was left as is.
All docs <= 350 lines. No legal-validity claim.

## TEST & RUN - 2026-10-29

Local stack only; nothing committed; docs/ untouched; no .env read. Full table in TEST_RESULTS.md.
- Added scripts/supabase-test/w14-api-smoke.mjs (315 lines) and the Vitest SuperAdminDashboardPage.di.w14.test.tsx (real production DI wiring, nine tabs).
- Results: lint 0; build 0; npm test 130 files / 255 tests pass; pytest 4 passed; stager 19/19; run-db-tests.mjs Files=90, Tests=2850, Result: PASS; smokes w2 48, w3 33, w4 43, w5 39, w6 40, w7 38, w8 30, w9 34, w10 39, w11 36, w14 32, each 0 failed. Stack stopped.
- Smoke-only fixes after the first w14 run (2 failures were smoke bugs: a regex hit the word statement in my own owner message; wrong table name for the contract hash fixture). No product code failed.
- Mismatch recorded: w14_worker_lookup_returns_rows_count_and_minimum asserts the minimum is absent (D1).
- Smoke limitation: the contract-hash check compares all contract_versions.content_hash rows (empty on a clean stack); the pgTAP j18 test covers the real case.

## FIX CYCLE 1 (frontend) - 2026-10-29

frontend/src only (plus this note); nothing committed; no .env read. Read the DB agent's current w14d / w14e / w14h before finishing.
- S1 `jobOpeningModerationCopy.ts` `reportCategoryLabel.unpaid_trial_or_training`: "Unpaid trial work or training" -> "Unpaid work
  presented as a trial or training" (one label used by the worker report form, owner notice reason and admin views; kept apart from the fee reason).
- S5 `adminOversightCopy.ts` `relationshipsIntro`: now says only the looked-up person sees an activity entry, with a general purpose
  (not the chosen purpose or note), and other people in the results see nothing.
- N7 `workforceActivityCopy.ts`: `subjectLookupPurposeKey = 'washlink_review'` (w14h key) shown as "Purpose: WashLink review";
  any `purpose` detail in "Your activity" renders that generic label. Specific labels stay only in `adminOversightCopy.lookupPurposeLabel`
  (admin lookup / audit log views). j17 activity test updated to the generic key.
- N9 `moderationSchemas.ts` `subjectTypeSchema` `{1,64}` -> `{1,40}` (matches w14h `^[a-z_]{1,40}$`).
- N5 w14d keeps the existing message "Edit the job opening before asking WashLink to check it." (already mapped; nothing new to map);
  w14e `can_submit_changes` uses the same `job_opening_moderation_changed_since_pause` test. Owner copy: `ownerEditFirstText` and
  `askWashLinkIntro` now say a real change is needed (j2 test assertion updated).
- B1 display safeguard: `WorkforceActivityService.loadPage(before, viewerRole)` drops `job_opening_report.*` rows for an owner
  (`isActivityEventShownTo`); the page now carries `oldestEventId` (the oldest row the DB returned) so paging never stalls on hidden
  rows; role passed `UserAccountMenu` -> `WorkforceActivityDrawer` -> `useMyWorkforceActivity`. The DB (w14h: report rows only where
  subject_profile_id = me) stays the authority.
- Tests: new `presentation/utilities/moderationFixCycle.w14.test.tsx` (8 tests: S1, S5, N7, N9, N5, B1 x3).
- Results: `npm run lint` exit 0; `npm run build` exit 0 (built in 708ms); `npm test` 131 files / 263 tests passed (was 130 / 255).
- Unchanged (git diff a880331 empty): the five J16 files, ApplicationSnapshotView.tsx, JobOpeningTransitionConfirmModal.tsx,
  owner/contractTemplates/*, W9 contract components.

## FIX CYCLE 1 (DB) - 2026-10-29

W14 migrations edited in place (uncommitted); no pre-W14 migration or W2b / W3 / W4 function body touched; frontend/ untouched;
local stack only (no --linked / --db-url / db push); no .env read; nothing committed.
- B1 w14h `my_workforce_activity`: `job_opening_report.*` rows only where subject_profile_id = me (the reporter), never via actor_id;
  `job_opening_moderation.opened/.dismissed/.case_viewed/.deleted` only when actor = me AND subject_profile is not me (closes the
  owner-as-actor path, e.g. a case delete in the owner's session). Other report data reaching the owner checked: resolved_owner_closed
  carries report_count only in the payload, which is not allow-listed; notifications go to reporters only.
- N2 w14d `report_job_opening`: `pg_advisory_xact_lock(hashtextextended('job_opening_reports:' || auth.uid(), 0))` after the opening
  row lock, before the duplicate / limit counts and the case lock.
- N4 w14h `log_searched` payload adds subject_id (uuid), subject_type and action_prefix (recorded only when the value occurs in
  workforce_audit_events, else 'unrecognised'); passes workforce_audit_payload_is_safe.
- N5 new internal definer `job_opening_moderation_changed_since_pause(uuid, job_openings)` (w14d; W14 comment in w14i; revoked from
  every client role): snapshot minus job_opening_updated_at / shop_name / shop_address vs the last paused / pause_kept snapshot.
  Used by submit (same message "Edit the job opening before asking WashLink to check it."; NO new message) and w14e can_submit_changes.
- N6 w14c and w14f ROLLBACK blocks wrapped in `-- begin;` ... `-- commit;`. N7 subject sees purpose `washlink_review` on
  admin_access.* events (actor sees the real purpose). N8 w14g header comment: rows read first, record + audit in the same transaction.
- Tests: new `j17_w14_fix1_report_privacy.test.sql` (26: pause->owner close, close->archive, changes_submitted->close, owner-actor
  deleted hidden, N5 no-op + last pause_kept, N2 lock pinned + held, N4 payload); `j17_w14_moderation_authorization` counts 35->36 W14
  functions, 31->32 definer; `j17_w14_relationship_lookups` expects washlink_review. Smoke: +`b1_owner_close_never_shows_reports_to_owner`,
  no-op edit 23514, log_searched action_prefix, subject purpose washlink_review (331 lines).
- Docs: PLATFORM_MODERATION_AND_AUDIT (B1, N2, N4, N5, N6, N7, S3 runbook step 2, S4 wording; 350 lines), JOB_OPENINGS (B1, N5),
  OWNER_RELATIONSHIPS (S4, N7), LOCAL_TEST_HARNESS (counts), ROLE_AND_PROFILE_SECURITY (36 functions), LEGAL_REVIEW_REGISTER W14-L7 text.
- Results: stager 19/19 pass; run-db-tests.mjs 87 migrations, Files=91, Tests=2876, Result: PASS (first run: 1 failure in the new
  file, a test bug: raw audit subquery under the worker role; fixed); 0 `todo_start(`; smokes w2 48, w3 33, w4 43, w5 39, w6 40,
  w7 38, w8 30, w9 34, w10 39, w11 36, w14 33, each 0 failed. Stack stopped.

## REVIEW, VERIFY, RECORD - 2026-10-29

- REVIEW: security (B1, N1–N9) and compliance (B1, S1–S6) in parallel; both raised BLOCKING B1 (owner activity revealed report
  count / categories after closing a held opening). Fix cycle 1 (DB + frontend in parallel): B1, N2, N4–N9, S1, S3–S5; security
  re-review confirmed B1 and N2/N4–N8 CLOSED. N1, N3 routed to W13; S2 to W14-L17. New legal flags W14-L13..L17. Fix cycles: 1.
- VERIFY: fresh verifier re-ran the suite from a clean state: lint 0, build 0, Vitest 131 files / 263 tests, pytest 4 passed,
  stager 19/19, `Files=91, Tests=2876`, `Result: PASS` (87 migrations), smokes w2..w11 48 / 33 / 43 / 39 / 40 / 38 / 30 / 34 / 39 / 36
  and w14 33 passed, 0 failed each; own B1 transaction check; stack stopped. AC1–AC14 PASS (`VERDICT.md`).
- RECORD: DECISIONS D-50..D-58 ADOPTED-DEFAULT (loop, 2026-10-29); LOOP.md W14 smoke row and counts; register W14-L13..L17;
  STATE.md W14 passed; next W12.
