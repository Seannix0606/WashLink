# W11 - LOG

## BUILD (DB) - 2026-10-29

Branch `feature/workforce`, base HEAD 6ce3f61. Nothing committed. Local Docker stack only (`.local-supabase-test`, project
`washlink-local-test`); no `--linked`, `--db-url`, `db push`, no `.env` read. W14 items out of scope.

### Files
Added (9 migrations, each with a commented `-- ROLLBACK` block, each <= 350 lines; staged 20261029000001..09):
- `supabase/migrations/2026_10_29_w11a_oversight_preflight.sql` (81) - creates nothing
- `supabase/migrations/2026_10_29_w11b_certification_platform_reviews.sql` (250)
- `supabase/migrations/2026_10_29_w11c_certification_platform_review_rpcs.sql` (238)
- `supabase/migrations/2026_10_29_w11d_certification_platform_review_reads.sql` (161)
- `supabase/migrations/2026_10_29_w11e_worker_contract_disputes.sql` (174)
- `supabase/migrations/2026_10_29_w11f_worker_contract_dispute_rpcs.sql` (214)
- `supabase/migrations/2026_10_29_w11g_worker_contract_dispute_reads.sql` (169)
- `supabase/migrations/2026_10_29_w11h_workforce_dashboard_summaries.sql` (159)
- `supabase/migrations/2026_10_29_w11i_oversight_audit_and_notifications.sql` (183)

Added helper (6th `HELPERS_SOURCE_NAMES` entry): `scripts/supabase-test/baseline/test_helpers_oversight.sql` (77):
`suspend_test_certification`, `request_test_shop_review` (real W7 RPCs), `backdate_shop_review_request` (TEST-ONLY),
`raise_test_contract_dispute` (real W11 RPC). No helper inserts a review, dispute, status event or acceptance.

Added pgTAP (plan = actual, 0 `todo_start(`): `j8_w11_certification_platform_review_rules` (51),
`j8_w11_certification_platform_review_holds` (18), `j12_w11_contract_dispute_access` (31), `j12_w11_contract_dispute_rules` (42),
`j16_w11_disputes_and_reviews_never_change_contracts` (14), `j17_w11_dashboard_summaries` (24), `j17_w11_oversight_authorization` (24),
`j6_w11_oversight_audit_and_notifications` (12), `j18_w11_flows` (16) = 232 tests.

Changed: `scripts/supabase-test/stage-local-workdir.mjs` (6th helper; 348 lines), `scripts/supabase-test/stage-local-workdir.test.mjs`
(`stager_seeds_every_helper_file_in_order` now checks six suffixes; refactored to one suffix list, 349 lines),
`supabase/tests/database/001_migration_replay.test.sql` (78 staged migrations, + 20261029000001..09, renamed
`replay_schema_migrations_has_baseline_w2_to_w11`, + `replay_w11_review_and_dispute_tables_rls_enabled`; plan 23 -> 24).
`git diff --name-status 6ce3f61 -- supabase/migrations` shows only new files; no W7 function body replaced.

### Actual results (local stack)
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: tests 19, pass 19, fail 0.
- `node scripts/supabase-test/run-db-tests.mjs` (fresh stage + `db reset` + `test db`): 78 staged migrations;
  `Files=81, Tests=2589` ... `All tests successful.` `Result: PASS` (before W11: 72 files / 2356 tests; +1 replay test, +232 W11).
  `grep -c "todo_start(" supabase/tests/database/*.sql`: every file 0.
- Idempotency: all nine W11 migrations re-applied on the migrated local DB inside `begin ... rollback`: no error.
- Smokes on the same stack: w2 48 passed / 0 failed; w3 33/0; w4 43/0; w5 39/0; w6 40/0; w7 38/0; w8 30/0; w9 34/0; w10 39/0.
- Stack stopped: `npx supabase stop --workdir .local-supabase-test --no-backup` (run from the workdir) ->
  "Stopped supabase local development setup."

### RPCs for the frontend (all `authenticated` only; anon / service_role have no EXECUTE)
WashLink certification review:
- `certification_platform_review_owner_decision_days() -> integer` (14).
- `open_certification_platform_review(p_certification_id uuid, p_expected_status text, p_statement text) -> certification_platform_reviews`
  42501 `Certification not found.`; 55000 `This certification changed. Refresh and try again.`; 23514 `Only a suspended or revoked
  certification can be reviewed.`; 23505 `WashLink is already reviewing this certification.`; 23514 `WashLink already reviewed this
  decision.`; 23514 `Ask the shop to review this decision first. You can ask WashLink when the shop keeps its decision, has not decided
  within 14 days, or can no longer decide.`; 23514 `Write a statement of 20 to 1000 characters.`
- `withdraw_certification_platform_review(p_review_id uuid) -> certification_platform_reviews`: 42501 `WashLink review not found.`;
  23514 `This review is no longer open.`
- `decide_certification_platform_review(p_review_id uuid, p_expected_revision integer, p_decision text /* reinstate|uphold */, p_reason text)`
  42501 `Only a platform administrator can decide WashLink reviews.`; 42501 `WashLink review not found.`; 23514 `This review is no
  longer open.`; 55000 `This review changed. Refresh and try again.`; 22023 `Choose reinstate or uphold.`; 23514 `Give a reason of 20 to
  500 characters.`; 23514 `This certification is no longer suspended or revoked.`
- Holds (W7 RPCs, new triggers): 23514 `WashLink is reviewing this certification. Wait for its decision.` from
  `transition_certification(..., 'revoked', ...)` and `request_certification_review` while a review is open.
- `my_certification_platform_reviews()` -> certification_id, can_open, basis, open_review_id, latest_status, latest_decision_reason,
  latest_decided_at, opened_at.
- `owner_certification_platform_reviews()` -> certification_id, review_id, status, basis, worker_statement, decision_reason, opened_at, decided_at.
- `admin_certification_platform_review_queue(p_status text default 'open')` (22023 `Choose a review status.`; non-admin 0 rows) ->
  review_id, certification_id, basis, status, revision, opened_at, decided_at, certification_title, shop_name_snapshot,
  certification_status, issuing_shop_present, issuing_shop_currently_verified.
- `admin_certification_platform_review_case(p_review_id uuid) -> jsonb` (VOLATILE, audited) keys `review`, `worker_display_name`,
  `certification`, `status_events`, `shop_requests`; 42501 `Only a platform administrator can read WashLink reviews.` /
  `WashLink review not found.`

Reported contract problems:
- `raise_contract_dispute(p_contract_id uuid, p_category text, p_statement text) -> worker_contract_disputes`: 42501 `Contract not
  found.`; 23514 `Only a contract that was sent can be reported.`; 23514 `Problems can be reported up to 90 days after a contract ends.`;
  22023 `Choose a problem category.`; 23514 `This category does not match the contract.`; 23505 `You already reported a problem with
  this contract.`; 23514 `You can report at most 3 problems with this contract.`; 23514 `Write a statement of 20 to 1000 characters.`
- `respond_to_contract_dispute(p_dispute_id uuid, p_statement text)`: 42501 `Reported problem not found.`; 42501 `Only the other party
  can add a response.`; 23514 `This reported problem is no longer open.`; 23505 `A response was already recorded.`; 23514 statement.
- `withdraw_contract_dispute(p_dispute_id uuid)`: 42501 `Reported problem not found.`; 23514 `This reported problem is no longer open.`
- `close_contract_dispute(p_dispute_id uuid, p_expected_revision integer, p_resolution_kind text, p_resolution_note text)`: 42501 `Only a
  platform administrator can close disputes.`; 42501 `Reported problem not found.`; 23514 `This reported problem is no longer open.`;
  55000 `This reported problem changed. Refresh and try again.`; 22023 `Choose how the problem was closed.`; 23514 `Write a note of 20 to
  1000 characters.`
- `my_contract_disputes()` -> dispute_id, contract_id, shop_name, counterpart_name, category, status, raised_by_me, statement,
  response_statement, resolution_kind, resolution_note, created_at, responded_at, closed_at, washlink_has_viewed, can_respond, can_withdraw.
- `admin_contract_dispute_queue(p_status text default 'open')` (22023 `Choose a dispute status.`) -> dispute_id, contract_id, category,
  status, revision, raised_by_role, has_response, contract_status, effective_status, shop_name_snapshot, created_at.
- `admin_contract_dispute_case(p_dispute_id uuid) -> jsonb` (VOLATILE, audited): `dispute` always; while open also `contract`,
  `versions`, `acceptances`, `relationship`; 42501 `Only a platform administrator can read reported contract problems.` /
  `Reported problem not found.`
- `admin_contract_dispute_version_document(p_dispute_id uuid, p_version_id uuid)` -> rendered_text, content_hash, sealed_at,
  record_label (0 rows unless open + sealed version of that contract; audited when a row is returned).

Dashboards (one row for the right role, else 0 rows): `my_worker_dashboard_summary()`, `owner_dashboard_summary()`,
`admin_dashboard_summary()` with the columns of PLAN 3.8 (integers, booleans, `next_training_date date`, timestamps,
`profile_missing_fields text[]`).

### Deviations / decisions taken where the plan was silent
1. "After the latest suspended / revoked event" (one decision per event; shop upheld after the event) compares
   `certification_status_events.id` (identity), not timestamps: inside one transaction `now()` is constant, so time comparison would
   be wrong for same-transaction events.
2. Messages the plan left open: `WashLink review not found.` (42501), `This review changed. Refresh and try again.` (55000),
   `Choose a review status.` / `Choose a dispute status.` / `Choose a problem category.` / `Choose how the problem was closed.` (22023),
   `Only a contract that was sent can be reported.`, `You can report at most 3 problems with this contract.`, `Only the other party can
   add a response.`, `Reported problem not found.`, `This reported problem is no longer open.`, `This reported problem changed. Refresh
   and try again.`, `Write a note of 20 to 1000 characters.`, `Only a platform administrator can read WashLink reviews.` /
   `... read reported contract problems.`
3. A first admin case view stamps `first_viewed_by_admin_at` WITHOUT bumping the dispute `revision`, so the queue revision stays valid
   for `close_contract_dispute` after the admin opens the case. Responses, withdrawals and closes bump it.
4. `contract_status_at_raise` stores the EFFECTIVE status (`worker_contract_effective_status`). The case `classification_key` comes from
   the current version, else the latest sealed version. The case `versions` list contains sealed versions only (no owner drafts).
5. `certification_platform_review_owner_decision_days()` is granted to `authenticated` (UI shows the 14 days); the 8 internal
   functions (guard x2, holds x2, resolve, basis, audit x2) are revoked from every client role. 27 W11 functions carry a `W11:` comment
   (26 definer + the immutable days function), all pinned `search_path=public, pg_temp`.
6. Dashboard "open_opening_count": "applicable" implemented as the search_job_openings predicate (published, recorded shop
   verification, deadline not passed) without the page limit, and "not applied" = no non-withdrawn application of the worker
   (= `my_application_status is null`). Certification-required openings are counted (search lists them too). `profile_missing_fields`
   reports `availability` only when there is no worker profile (`availability_status` is NOT NULL).
   `stranded_suspended_certification_count` = suspended certificates whose basis is `issuer_unavailable` and that have no open
   WashLink review.
7. Review audit `changed_by`: `worker` / `super_admin` / `issuing_owner` (resolved_by_shop) / `trusted_session`; `.deleted` uses
   `worker_profile_deleted` or `certification_deleted`. Dispute audit `changed_by` is the caller role, `trusted_session`, or
   `contract_deleted`. Dispute audit `subject_profile_id` = owner (worker once the owner is gone), as W9. Notification titles (plan
   gave bodies only): `WashLink review requested`, `WashLink review decided`, `Contract problem reported`, `Contract problem closed`;
   categories `certification_platform_review.opened|decided`, `worker_contract_dispute.raised|closed`.
8. J12 90-day test moves `ended_at` into the past with the W10 forward-only trusted repair (active -> terminated with an explicit
   `ended_at`; `ended_by` becomes `trusted_session`), because disabling the W9 guard is impossible while deferred triggers are pending.

### Not verified / open findings for REVIEW
- R-a (W7 surface, not changed): when a super_admin decides, the W7 guards stamp `certifications.status_changed_by` and
  `certification_status_events.actor_id` with the administrator's profile id (W7 bodies unchanged by design). The current issuing
  owner can read those raw rows through the existing W7 RLS policies, so the owner can see the deciding admin's uuid (never a name;
  `actor_display_name` is `WashLink review`). Party reads added by W11 expose no admin ids (tested). A fix needs a new W7-surface
  trigger or policy change; left for REVIEW to decide.
- `w11-api-smoke.mjs`, Vitest, frontend, docs and the legal register are outside this DB build step (not written here).
- Concurrency (two simultaneous raises / opens) is covered by partial unique indexes + an advisory lock on (contract, party) but was
  not exercised with parallel sessions.

## BUILD (docs) - 2026-10-29

Docs only (no code, no migration, no `.env` read, nothing committed). Added `docs/workforce/DASHBOARDS_AND_OVERSIGHT.md`
(278 lines: W14 split, D-42..D-49, P65-P71, the three summaries, WashLink review and contract-problem tables, state
machines, RPCs and messages as built incl. LOG deviations 1-8, admin case access and audit, the W11 audit / notification
catalogue, frontend marked "as planned", tests, open finding R-a, risks, rollback). Updated `CERTIFICATIONS.md` (W11
carry-forward section replaced by "WashLink review and holds"), `WORKER_CONTRACTS.md` (reported problems section),
`OWNER_RELATIONSHIPS.md` (dispute-scoped relationship status; other admin reads -> W14), `AUDIT_AND_NOTIFICATIONS.md`
(kept at 350 lines: the W11 catalogue lives in the new doc, with a pointer section; audit reads / admin audit UI -> W14),
`ROLE_AND_PROFILE_SECURITY.md` (D-10 rows 43-45, W11 guard matrix), `LOCAL_TEST_HARNESS.md` (78 migrations, 6th helper,
81 files / 2589 tests, nine W11 pgTAP rows, W11 smoke section listing the planned checks; W3-W8 smoke command blocks
inlined to stay <= 350), `LEGAL_REVIEW_REGISTER.md` (W11 section, W11-L1..L10 OPEN) and the W11 -> W14 carry-forward
mentions in `CONTRACT_TEMPLATES.md`, `JOB_OPENINGS.md`, `MARKETPLACE_AND_APPLICATIONS.md`, `TRAINING.md`; wrote
`LEGAL_FLAGS.md` (W10 format). Every doc <= 350 lines. Not done here: RECORD items (D-42..D-49 in DECISIONS.md, W14 in
PLAN.md / STATE.md, W11 smoke row in LOOP.md); frontend paths in the docs and legal sources must be re-checked after the
frontend build.

## BUILD (frontend) - 2026-10-29

Frontend only (`frontend/src`); no `docs/`, `supabase/`, `scripts/` or `backend/` file touched by this step, no `.env` read, nothing
committed. W14 items out of scope. Layering as /docs: UI -> hooks -> services -> repositories (RPCs only) -> Supabase.

### Files
Added (code): `domain/models/{WorkforceDashboardSummary, CertificationPlatformReview, ContractDispute}.ts`;
`domain/repositories/{WorkforceDashboardRepository, CertificationPlatformReviewRepository, ContractDisputeRepository}.ts`;
`domain/utilities/workforceNextActions.ts`; `infrastructure/supabase/{supabaseWorkforceDashboardRows, supabaseCertificationPlatformReviewRows,
supabaseContractDisputeRows, supabaseOversightErrorMessages}.ts`; `infrastructure/repositories/Supabase{WorkforceDashboard,
CertificationPlatformReview, ContractDispute}Repository.ts`, `infrastructure/repositories/supabaseRpcCalls.ts`;
`application/validation/oversightSchemas.ts`; `application/services/{WorkforceDashboardService, CertificationPlatformReviewService,
ContractDisputeService}.ts`; `presentation/dependencyInjection/createOversightDependencies.ts`; `presentation/utilities/{workforceDashboardCopy,
workforceDashboardDisplay, platformReviewCopy, contractDisputeCopy}.ts`; hooks `useWorkforceDashboardSummary`, `useLatestOpenings`,
`useCertificationPlatformReviews`, `useOwnerCertificationPlatformReviews`, `useAdminCertificationReviewQueue`, `useAdminCertificationReviewCase`,
`useContractDisputes`, `useAdminContractDisputeQueue`, `useAdminContractDisputeCase`, `useOversightActionRunner`; components (under
`presentation/components/`) `shared/{NextActionList, DashboardCountGrid}`, `worker/dashboard/{WorkerOverviewPanel, LatestOpeningsList}`,
`worker/certifications/{AskWashLinkReviewModal, PlatformReviewStatusNotice}`, `contracts/{ReportContractProblemModal, ContractDisputeList,
RespondToContractProblemModal}`, `owner/dashboard/{OwnerNextActionsStrip, OwnerWorkforceOverviewPanel}`, `owner/{OwnerDashboardTabPanels.tsx,
ownerDashboardTabs.ts}`, `owner/certifications/OwnerPlatformReviewNotice`, `superAdmin/{superAdminTabs.ts, AdminOverviewPanel,
ShopVerificationSection, CertificationReviewQueuePanel, CertificationReviewCaseDrawer, DecidePlatformReviewForm, ContractDisputeQueuePanel,
ContractDisputeCaseDrawer, CloseContractDisputeForm}`.
Added (tests): `test/oversightFixtures.ts`; `domain/utilities/workforceNextActions.w11.test.ts`;
`presentation/components/worker/dashboard/WorkerOverviewPanel.w11.test.tsx`; `presentation/components/owner/dashboard/OwnerNextActionsStrip.w11.test.tsx`;
`features/superAdmin/SuperAdminDashboardPage.w11.test.tsx`; `presentation/components/worker/certifications/AskWashLinkReview.j8.test.tsx`;
`presentation/components/superAdmin/AdminOversightCases.w11.test.tsx`; `presentation/components/contracts/ContractDisputes.j12.test.tsx`;
`presentation/utilities/oversightCopy.j16.test.tsx`; `infrastructure/repositories/SupabaseOversightRepositories.j17.test.ts`;
`infrastructure/supabase/supabaseOversightErrorMessages.w11.test.ts`.
Changed: `features/worker/{workerWorkspaceView.ts, WorkerWorkspaceTabs.tsx}`, `features/superAdmin/SuperAdminDashboardPage.tsx` (tabs, lazy
panels; 123 -> 99 lines), `features/owner/OwnerDashboardPage.tsx`, `presentation/components/owner/OwnerDashboardContent.tsx` (326 -> 239
lines; tab bodies moved to `OwnerDashboardTabPanels.tsx` (172), tab list to `ownerDashboardTabs.ts`), `dependencyInjection/{createDashboardDependencies,
createWorkerMarketplaceDependencies, createSuperAdminDependencies}.ts`, `worker/certifications/MyCertificationsPanel.tsx`,
`owner/certifications/{OwnerCertificationsPanel, OwnerShopCertifications, OwnerCertificationListItem}.tsx`, `certifications/CertificationCard.tsx`,
`worker/contracts/MyContractsPanel.tsx`, `owner/workerContracts/OwnerWorkerContractsPanel.tsx`, `infrastructure/supabase/supabaseErrorMessages.ts`.
J16 files byte-identical to HEAD (`git diff HEAD -- <file>` empty for each): `TerminateContractModal.tsx`, `DeclineContractModal.tsx`,
`AcceptContractModal.tsx`, `WorkerContractReview.tsx`, `RequestCertificationReviewModal.tsx`.
Largest added / changed file: `test/oversightFixtures.ts` 317 lines; largest code file `OwnerWorkerContractsPanel.tsx` 258; all <= 350.
`grep -rn "service_role" frontend/src`: 0 matches.

### Actual results (`frontend/`)
- `npm run lint`: exit 0, no warnings or errors.
- `npm run build` (`tsc -b && vite build`): exit 0, "built in 613ms", 148 assets; new lazy chunks `AdminOverviewPanel`, `ShopVerificationSection`,
  `CertificationReviewQueuePanel`, `ContractDisputeQueuePanel`, `WorkerOverviewPanel`, `OwnerWorkforceOverviewPanel`.
- `npm test` (`vitest run`): exit 0, "Test Files 117 passed (117)", "Tests 228 passed (228)" = the existing 209 unchanged + 19 new, one per
  section-6 Vitest name (w11_worker_overview_orders_next_actions_by_priority ... w11_error_messages_mapped).

### Deviations / decisions taken where the plan was silent
1. Wiring: the oversight services reach the W7 / W9 panels as new OPTIONAL props (`platformReviewService` on MyCertificationsPanel /
   OwnerCertificationsPanel, `contractDisputeService` on MyContractsPanel / OwnerWorkerContractsPanel), fed from
   `WorkerMarketplaceDependencies.oversightDependencies?`, `createDashboardDependencies().oversightDependencies` and
   `createSuperAdminDependencies().oversightDependencies`. `createCertificationDependencies` / `createWorkerContractDependencies` are unchanged.
   Without the props (older callers and the existing tests) nothing W11 is shown and nothing is read; the hooks take `service | undefined`.
2. Extra files the plan did not list: `supabaseOversightErrorMessages.ts` (W9 / W10 pattern, merged into `supabaseErrorMessages.ts`; every
   user-facing W11 `raise exception` text incl. the three guard texts; preflight / realtime / "W11i: missing" texts are NOT mapped),
   `supabaseRpcCalls.ts`, `useOversightActionRunner.ts`, `useLatestOpenings.ts`, `workforceDashboardDisplay.ts`, `oversightFixtures.ts`.
   `CertificationCard.tsx`, `OwnerShopCertifications.tsx`, `OwnerCertificationListItem.tsx` and `OwnerDashboardPage.tsx` were changed
   (optional slot / pass-through only). The contract category rule and the 90-day hint live in `domain/models/ContractDispute.ts`.
3. Holds in the UI (P68, hints only; the database enforces): while a WashLink review is open the worker's shop "Ask for a review" button is
   hidden and the owner's "Revoke" action is not offered; "Reinstate" stays.
4. "Ask WashLink to review" is shown only when `my_certification_platform_reviews().can_open` is true; the client never decides eligibility.
   `open_certification_platform_review` is sent the stored status the worker saw (`p_expected_status`).
5. Admin case reads (both kinds) are VOLATILE and audited: read once when the drawer opens and once after a decide / close, never polled
   (no focus refresh). Under React StrictMode in development only, the mount effect can run twice (two audited reads). Version text is read
   only on "Read this version". Queues and summaries poll every 60 s while visible (`usePollWhileVisible`).
6. Admin next action "open reported contract problems in total" shows `open_dispute_count` as returned (no client subtraction, P65); the
   unviewed count is a separate item.
7. Owner "Next actions" strip is hidden when empty AND while the summary is loading / failed / absent; the Workforce tab shows those states.
   The Workforce tab sits after Bookings; Bookings stays the default (D-42). The Workforce tab is hidden when no oversight services are given;
   the worker Overview tab likewise (fallback Find work).
8. Worker "complete your profile" next action opens the existing profile editor (no new route). "Latest openings" shows the stated amount
   line or "Pay: see the opening details" (search rows carry no `compensation_details`, so "Not specified" would be wrong).
9. 55000 answers are toasted with " It was reloaded." and the data is re-read; never shown as success. Forms use `noValidate` so the zod
   messages (the database's own texts) appear instead of browser bubbles.
10. Test placement: `j8_w11_owner_sees_washlink_review_status_and_reason` shares `AskWashLinkReview.j8.test.tsx`; `w11_worker_default_tab_*`
    shares `workforceNextActions.w11.test.ts`; the j16 copy test is a `.tsx` (it renders the report dialog).

### Not verified / open
- No browser / visual check and no run against the local Supabase stack (Vitest is mocked; `w11-api-smoke.mjs` is not part of this step).
- R-a (DB) unchanged: the frontend never reads `status_changed_by` / `actor_id`, so it shows no admin id, but the raw W7 rows remain
  readable by the owner through W7 RLS.
- Docs written in parallel mark the frontend "as planned"; the paths above should be checked against `DASHBOARDS_AND_OVERSIGHT.md`.

## BUILD (docs reconcile) - 2026-10-29

Docs only (no code, no `.env`, nothing committed). Replaced the "as planned" frontend section of
`docs/workforce/DASHBOARDS_AND_OVERSIGHT.md` with the as-built frontend from "BUILD (frontend)": file layout, the optional
`oversightDependencies` wiring, UI holds, audited case reads (once on open and once after a decision; possible StrictMode double
read in dev), 60 s polling, the `OwnerDashboardContent` split and the copy files. Also updated its tests section (Vitest 117 files /
228 tests, 19 new; the W11 smoke stays with the test step). Removed the "as planned" wording from `WORKER_CONTRACTS.md`,
`OWNER_RELATIONSHIPS.md`, `LEGAL_REVIEW_REGISTER.md` and `W11/LEGAL_FLAGS.md`, and added the UI-hold note to `CERTIFICATIONS.md`
and the Vitest count to `LOCAL_TEST_HARNESS.md`. Every `frontend/src/...` path cited in DASHBOARDS_AND_OVERSIGHT, the W11-L rows
and LEGAL_FLAGS was checked against the files; none is missing. W11-L6 / L9 / L10 now cite the real copy files and lines.
Finding for REVIEW: the owner overview labels `relationship_needs_attention_count` as "Suspended relationships" /
"worker relationships suspended" (`workforceDashboardDisplay.ts:86`, `workforceDashboardCopy.ts:34`). W10 fix cycle 1 (C1, W10-L9)
removed that owner-facing word, so this needs review. It is recorded in W11-L9 and the docs; the frontend was not changed.
All docs are <= 350 lines.

## TEST & RUN - 2026-10-29

Added `scripts/supabase-test/w11-api-smoke.mjs` (350 lines, loopback-only, 34 checks). Full results and AC evidence: `TEST_RESULTS.md`.
Summary (real output): lint 0; build 0; Vitest 117 files / 228 tests pass; pytest 4 passed; stager 19 pass; `run-db-tests.mjs` Files=81, Tests=2589,
`Result: PASS`; smokes w2 48, w3 33, w4 43, w5 39, w6 40, w7 38, w8 30, w9 34, w10 39, w11 34 - each `0 failed`; stack stopped with `--no-backup`.
No product-code failures. No existing test changed. Open: smoke does not exercise the `upheld_by_shop` basis (pgTAP does); R-a (raw W7 rows readable by the
issuing owner show the admin uuid) remains for REVIEW; docs content for AC14 not re-verified after the parallel docs update.

## FIX CYCLE 1 (frontend) - 2026-10-29

Frontend copy only (REVIEW.md C1-C5 plus the N2 / N5 DB additions). Nothing committed; J16 files byte-identical to HEAD.
- C1 `platformReviewCopy.ts` `askWashLinkReviewExplanation`: removed "who does not work for the shop"; now "A WashLink administrator
  decides, not the shop. The administrator reads the record ...".
- C2 `platformReviewStatementGuidance` now starts "Your statement is shown to the shop and to WashLink."; `contractDisputeCopy.ts`
  `reportProblemIntro` starts "Your report, including what you write, is shown to the other party and to WashLink." and
  `problemStatementGuidance` (report and respond forms) starts "What you write here is shown to the other party and to WashLink."
- C3 `reportProblemWindowText`: "You can report a problem on WashLink up to 90 days ... This is a WashLink limit only. It does not
  affect any deadline for raising the matter with a government office." No legal period stated.
- C4 `workforceDashboardCopy.ts` `strandedSuspensionHelpText` matches the w11h definition (excludes open / decided, keeps the
  3-review-limit ones): no longer says "The worker can ask for one."
- C5 `workforceDashboardDisplay.ts` worker count label "Open openings" -> "Openings you can apply to" (w11h: applicable incl. D-20).
- N2 basis `resuspended_after_shop_resolution` added to `platformReviewBases` and `platformReviewBasisText` (confirmed w11b CHECK, w11c).
- N5 message "You can ask WashLink to review this decision at most 3 times." added to `supabaseOversightErrorMessages.ts`
  (confirmed w11c:138) and to the W11 error test. Every other w11 raise is mapped except the internal preflight / realtime texts.
- Tests: new `presentation/utilities/oversightCopy.w11fix.test.ts` (5 tests); `WorkerOverviewPanel.w11.test.tsx` label updated.
Results (real output): `npm run lint` exit 0, no findings; `npm run build` built OK; `npm test` Test Files 118 passed (118),
Tests 233 passed (233).

## FIX CYCLE 1 (DB) - 2026-10-29

Edited the uncommitted W11 migrations in place (no pre-W11 migration touched: `git diff --name-status 6ce3f61 -- supabase/migrations`
is empty; no W7 function body replaced). Local Docker stack only; no `--linked`, `--db-url`, `db push`, no `.env` read. Nothing committed;
`frontend/` not touched.

### Changes
- N1: w11b adds BEFORE UPDATE OF status `certifications_zz_platform_review_mask` (nulls `status_changed_by` when the decision flag names an
  open review of that certificate and the caller is super_admin) and BEFORE INSERT `certification_status_events_zz_platform_review_mask`
  (nulls `actor_id` when `platform_review_id` is set; `actor_role` stays `super_admin`). Both definer, revoked from every client role;
  names sort after the W7 guards. Decider kept in `certification_platform_reviews.decided_by` and `workforce_audit_events.actor_id`.
- N2: basis `resuspended_after_shop_resolution` (CHECK `cpr_basis_check`; w11c basis precedence issuer_unavailable > shop_decision_overdue
  > resuspended_after_shop_resolution > upheld_by_shop): latest suspended / revoked event by the issuing owner (`actor_role` owner,
  `actor_id` = `owner_id`) and a `resolved_by_shop` review of the certificate with `closed_at` within the 30 days before it. No expiry
  while that event is current.
- N3: `cpr_select_super_admin` / `wcd_select_super_admin` dropped; replaced by deny-all `certification_platform_reviews_no_client_select` /
  `worker_contract_disputes_no_client_select` (explicit select policy kept, qual `false`).
- N4: `admin_contract_dispute_queue` returns null `contract_status`, `effective_status`, `shop_name_snapshot` unless `d.status = 'open'`.
- N5: new column `certification_platform_reviews.status_event_id bigint` (set by the guard at INSERT; immutable; no FK; index
  `(certification_id, status_event_id)`); new internal `certification_platform_review_current_event(uuid)` (w11b) and
  `certification_platform_review_blocker(uuid) -> 'open' | 'decided' | 'limit' | null` (w11c), the single rule used by
  `open_certification_platform_review`, `my_certification_platform_reviews().can_open` and the admin stranded count.
- N8: `escalated_from_request_id` ON DELETE SET NULL; the guard already passes it via `is_orphaned_fk_set_null` (tested).
- C4: `stranded_suspended_certification_count` = suspended, basis `issuer_unavailable`, blocker not `open` / `decided` (3-review-limit
  certificates stay counted: no route left).
- C5: `open_opening_count` excludes `certification_required` openings unless `worker_holds_current_certification(auth.uid())`.
- W11 functions with a `W11:` comment: 27 -> 31 (30 definer + the immutable days function); w11i comment list extended.

### New / changed error messages (for the frontend)
- NEW 23514 `You can ask WashLink to review this decision at most 3 times.` (`open_certification_platform_review`).
- NEW basis value `resuspended_after_shop_resolution` in `my_certification_platform_reviews().basis`, `owner_certification_platform_reviews().basis`,
  the admin queue / case and the audit payload `basis`.
- No other message text changed. Super_admin direct table reads of the two W11 tables now return 0 rows (not an error).

### Tests
- New `supabase/tests/database/j8_w11_fix1_review_mask_resuspend_cap.test.sql` (plan 32): N2 (eligible; not after 31 days, TEST-ONLY
  `closed_at` shift), N1 (owner raw rows null; decider in `decided_by` + audit; owner changes unmasked), N8, N5, C4, N4, C5.
- `j8_w11_certification_platform_review_holds`: `w11_no_w7_function_body_replaced` trigger list now also covers
  `certification_status_events` and the two `zz_` masks (ordered `collate "C"`).
- `j17_w11_oversight_authorization` (24 -> 25): 8 deny-all policies incl. select, no non-false policy, 31 / 30 function counts, admin raw
  selects return 0 (`j17_w11_super_admin_has_no_raw_select`). `j16_w11_...` W11 function count 27 -> 31.
- `w11-api-smoke.mjs` (350 lines): + `super_admin_has_no_raw_select_on_w11_tables` (N3), + `closed_dispute_queue_row_hides_contract_fields`
  (N4); the worker-delete cascade check counts reviews with a trusted `docker exec` query instead of the super_admin raw select.

### Actual results (local stack)
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: tests 19, pass 19, fail 0.
- `node scripts/supabase-test/run-db-tests.mjs`: 78 staged migrations; `Files=82, Tests=2622` ... `All tests successful.` `Result: PASS`
  (was 81 / 2589: +32 new file, +1 j17). `grep -c "todo_start(" supabase/tests/database/*.sql`: every file 0.
- Idempotency: the nine W11 migrations re-applied on the migrated local DB inside `begin ... rollback` with `ON_ERROR_STOP`: no error.
- Smokes on the same stack: w2 48 passed / 0 failed; w3 33/0; w4 43/0; w5 39/0; w6 40/0; w7 38/0; w8 30/0; w9 34/0; w10 39/0; w11 36/0.
- Stack stopped: `npx supabase stop --workdir . --no-backup` (from `.local-supabase-test`) -> "Stopped supabase local development setup."

### Docs
`DASHBOARDS_AND_OVERSIGHT.md` (337 lines; R-a open-finding bullet replaced by the N1 mask note), `CERTIFICATIONS.md` (228; mask, new basis,
cap), `ROLE_AND_PROFILE_SECURITY.md` (231; D-10 rows 43-45: 31 functions, the two `zz_` triggers and their ordering requirement, deny-all
select, SET NULL; guard matrix), `LOCAL_TEST_HARNESS.md` (349; 82 / 2622, new pgTAP row, smoke 36 checks). Not changed here (outside this
step's list): `LEGAL_REVIEW_REGISTER.md:249,263` and `W11/LEGAL_FLAGS.md:10,24` still describe R-a as open.

### Not verified
- Concurrent opens racing the 3-review cap (two sessions): the partial unique index allows only one open review per certificate, so a race
  can at most fail with 23505; not exercised with parallel sessions.
- The N2 window uses timestamps (`closed_at` vs the event's `created_at`); in one transaction they are equal and pass (`<=`). Not exercised
  across real days.

## REVIEW, VERIFY, RECORD - 2026-10-29

- Pre-review: orchestrator corrected the owner dashboard wording "Suspended relationships" -> "Relationships needing attention"
  (W10 D-36 / W10-L9); lint 0, Vitest 228/228 after the change.
- REVIEW: security (N1–N9) and compliance (C1–C5) read-only in parallel (both resumed once after an API rate limit); no BLOCKING
  findings (`REVIEW.md`). Fix cycle 1 (DB + frontend in parallel, W11 still uncommitted): N1 mask triggers, N2 re-suspend basis,
  N3 no admin raw select, N4 closed-queue fields hidden, N5 3 reviews per event, N8 set null, C1–C3 copy, C4 stranded count, C5
  applicable openings. Orchestrator updated R-a wording in the register / LEGAL_FLAGS. New legal flags W11-L11..L15 (OPEN). Fix cycles: 1.
- VERIFY: fresh verifier re-ran the suite from a clean state: lint 0, build 0, Vitest 118 files / 233 tests, pytest 4 passed,
  stager 19/19, `Files=82, Tests=2622`, `Result: PASS` (78 migrations), smokes w2..w11 48 / 33 / 43 / 39 / 40 / 38 / 30 / 34 / 39 / 36
  passed, 0 failed each; stack stopped. AC1–AC14 PASS (`VERDICT.md`).
- RECORD: DECISIONS D-42..D-49 ADOPTED-DEFAULT (loop, 2026-10-29); W14 added to PLAN.md / STATE.md (W12 now depends on W11, W14;
  completion criterion W0–W14); LOOP.md W11 smoke row and counts; register W11-L11..L15; STATE.md W11 passed; next W14.
