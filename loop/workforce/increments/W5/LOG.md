# W5 - Marketplace & applications - LOG

## BUILD (database part), 2026-10-25

Branch `feature/workforce`, HEAD 50cb850, local Docker stack only (staged `.local-supabase-test`).
No commit, no `.env` read, no repo-root CLI, no committed migration edited.

Added: migrations `supabase/migrations/2026_10_25_w5a_job_applications_preflight.sql`,
`..._w5b_job_applications.sql`, `..._w5c_job_application_rpcs.sql`,
`..._w5d_marketplace_and_applicant_reads.sql`,
`..._w5e_application_audit_notifications_and_auto_close.sql` (each ends with `-- ROLLBACK`);
pgTAP `j4_worker_can_browse_and_apply_without_duplicates`, `j5_application_status_transitions_are_validated`,
`j5_application_audit_and_notifications`, `j17_w5_application_authorization`, `j18_w5_flows`;
`scripts/supabase-test/w5-api-smoke.mjs`; docs `MARKETPLACE_AND_APPLICATIONS.md`,
`LEGAL_REVIEW_REGISTER.md`. Changed: `001_migration_replay.test.sql` (27 migrations,
`replay_schema_migrations_has_baseline_w2_w3_w4_w5`, `replay_w5_job_applications_rls_enabled`),
`scripts/supabase-test/baseline/test_helpers.sql` (W5 fixtures; existing functions reformatted to
fit 350 lines, bodies unchanged), `ROLE_AND_PROFILE_SECURITY.md` (D-10 rows 24-26, W5 guard
matrix), `AUDIT_AND_NOTIFICATIONS.md`, `JOB_OPENINGS.md`, `LOCAL_TEST_HARNESS.md`, `LOOP.md`.

Actual results (final run of this BUILD):
- `node scripts/supabase-test/run-db-tests.mjs`: 27 migrations applied; `Files=25, Tests=1027`, `Result: PASS`; 0 `todo_start(`.
- Smokes: `w2-api-smoke: 48 passed, 0 failed`; `w3-api-smoke: 33 passed, 0 failed`; `w4-api-smoke: 43 passed, 0 failed`; `w5-api-smoke: 39 passed, 0 failed`.
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: 18 pass, 0 fail.
- Frontend lint / build / Vitest and pytest were not run by this step (no frontend or backend change).

Deviations from PLAN.md (for REVIEW):
1. `jo_select_for_applicants` is not a new policy: the applicant clause is folded into `jo_select_published_for_workers` (same name, replaced in w5b) because `j17_w4_job_opening_authorization` asserts the exact W4 policy list and the plan requires unchanged earlier assertions. Behaviour is the plan's (role worker, status not draft, `worker_has_applied_to_job_opening(id)`).
2. The plan's doc `JOB_APPLICATIONS.md` was created as `docs/workforce/MARKETPLACE_AND_APPLICATIONS.md` (caller's instruction).
3. Internal helper `job_application_apply_checks(uuid, uuid, uuid)` holds the shared apply checks (create and draft -> submitted). The 50-open-applications limit also refuses new drafts.
4. Categories not named in the plan: `job_application.closed` (auto-close) and `job_application.removed` (cascade). Cascade notice to the worker only for rows not draft / withdrawn.
5. Trusted-session inserts (test fixtures, repair) are audited (`changed_by = trusted_session`) and send no notification; a trusted insert in a status other than draft / submitted is audited as `job_application.created` with its status.
6. `p_pay_stated = false` returns openings with no stated amount; `my_application_status` is the caller's non-withdrawn row (the one that blocks re-applying), which includes draft, rejected, closed and accepted.
7. Not tested: the 500-per-opening cap (would need 500 synthetic accounts); the guard message `A submitted application cannot be edited.` is unreachable from clients (defence in depth).

## API for the frontend (W5)

All functions are in `public`, callable through `supabase.rpc(name, args)` by `authenticated`
only (anon gets 42501). Errors surface as PostgREST `{ code, message }` with the SQLSTATE in `code`.
Notice version constant: `w5_v1` (`job_application_notice_version()` returns it).

### Writes (the only write path; direct table writes are 42501)

| RPC | Args | Returns |
|---|---|---|
| `create_job_application` | `p_job_opening_id uuid, p_cover_note text = null, p_submit boolean = true, p_notice_version text = null` | one `job_applications` row (`.single()`) |
| `update_job_application_draft` | `p_application_id uuid, p_cover_note text, p_expected_updated_at timestamptz` (send `updated_at` exactly as read) | one row |
| `delete_job_application_draft` | `p_application_id uuid` | void |
| `transition_job_application` | `p_application_id uuid, p_from_status text, p_to_status text, p_notice_version text = null` (needed for `draft -> submitted`) | one row |
| `job_application_notice_version` | none | text `w5_v1` |

Row shape (`job_applications`, also readable with `from('job_applications').select(...)`): `id,
job_opening_id, worker_id, shop_id, owner_id, status, cover_note, notice_version,
notice_acknowledged_at, submitted_at, decided_at, withdrawn_at, closed_at, status_changed_at,
opening_snapshot, opening_snapshot_taken_at, created_at, updated_at`. `opening_snapshot` (null for
drafts) = `{ snapshot_version: 1, job_opening_updated_at, shop_name, shop_address, ...W4 content
columns by column name }` (title, description, duties, work_location, openings_count, job_type,
required_skills, minimum_years_experience, experience_requirement, availability_requirement,
schedule_details, compensation_min_amount, compensation_max_amount, compensation_currency,
compensation_period, compensation_details, benefits, other_terms, minimum_qualifications,
preferred_qualifications, required_training, applicant_requirement, certification_expectations,
application_deadline, application_instructions). "Edited since you applied" = current opening
`updated_at` > `opening_snapshot.job_opening_updated_at`. Never send status, owner, stamps or
snapshot: the RPCs set them.

Allowed transitions: worker `draft>submitted`, `submitted|under_review|shortlisted|accepted>withdrawn`;
owner `submitted>under_review`, `submitted|under_review|shortlisted>rejected`,
`under_review>shortlisted`, `under_review|shortlisted>accepted`. Nobody sets `closed` (system).
Display: Draft, Submitted, Under review, Shortlisted, Accepted, Not selected (`rejected`),
Withdrawn, Closed.

### Error messages (exact text)

| Code | Message | When |
|---|---|---|
| 42501 | `Only worker accounts can apply to job openings.` | create by non-worker |
| 23514 | `Create your worker profile before applying.` | create / submit without a worker profile |
| 42501 | `Job opening not found.` | opening missing or draft (create); `applicant_profiles_for_job_opening` for a non-owner |
| 23514 | `This job opening is paused and is not accepting applications.` | create / submit on paused |
| 23514 | `This job opening is closed.` | create / submit on closed / archived; owner transition when the opening is closed / archived |
| 23514 | `This shop cannot receive applications until its verification is reviewed.` | shop fails the verified-shop rule |
| 23514 | `The application deadline for this opening has passed.` | deadline before today (Asia/Manila) |
| 23514 | `You cannot apply to this job opening again.` | 3 rows for this opening already |
| 23514 | `You have reached the limit of 50 open applications.` | 50 submitted / under_review / shortlisted |
| 23514 | `This job opening is not accepting more applications.` | 500 applications on the opening |
| 23514 | `Review the training and work notice before applying.` | submit without `p_notice_version = 'w5_v1'` |
| 23514 | `The cover note must be 1000 characters or fewer.` | create / draft update |
| 23505 | `You have already applied to this job opening.` | a non-withdrawn application (or draft) exists |
| 42501 | `Job application not found.` | not your row, owner on a draft, draft edit / delete of a non-draft; certifications RPC unauthorised |
| 55000 | `This application changed. Refresh and try again.` | stale `p_from_status` or `p_expected_updated_at` |
| 42501 | `This application status change is not allowed.` | pair not allowed for this actor |
| 42501 | `Only a verified shop can accept applications.` | accept while the shop is not verified |
| 22023 | `Search filters must be 80 characters or fewer.` / `Choose a pay period to filter by pay amount.` / `The minimum pay amount cannot be negative.` / `Results are limited to 1-50 per page and an offset of 0-1000.` | search input |

### Reads

| RPC / table | Args | Returns |
|---|---|---|
| `search_job_openings` | `p_query, p_location, p_job_type, p_applicant_requirement, p_required_skill text, p_pay_stated boolean, p_min_pay_amount numeric, p_pay_period text` (all default null), `p_limit integer = 20` (1..50), `p_offset integer = 0` (0..1000) | rows `job_opening_id, shop_id, shop_name, title, work_location, job_type, applicant_requirement, required_skills, compensation_min_amount, compensation_max_amount, compensation_currency, compensation_period, application_deadline, first_published_at, my_application_status`; workers only (others get `[]`); order newest first |
| `applicant_profiles_for_job_opening` | `p_job_opening_id uuid` | rows `application_id, display_name, headline, experience_summary, years_of_experience, skills, preferred_locations, availability_status, availability_notes, profile_updated_at` (self-reported; no contacts) |
| `applicant_verified_certifications` | `p_application_id uuid` | rows `certification_id, certification_title, issuing_shop_name, issued_at, expires_at`; always `[]` in W5 ("Verified certifications: none yet") |
| `from('job_applications')` | | worker: own rows; owner: non-draft rows of own openings |
| `from('job_openings')` | | worker additionally reads any non-draft opening they hold a non-draft application to |

Visibility windows: an owner sees an application from submit onward, in every later status
(cover note included); the applicant profile only while submitted, under_review, shortlisted or
accepted (ends on rejected, withdrawn, closed); never drafts, never `worker_private_contacts`.
Certifications RPC: the worker for own rows; the owner in the same sharing statuses. A worker keeps
reading the opening (current version) after pause / close / archive or loss of shop verification
once they have a non-draft application; the snapshot is the record of what they applied to.

### Notification types (in-app, `notifications` table, polled)

| category | recipient | subject_type / subject_id | title |
|---|---|---|---|
| `job_application.submitted` | owner | job_application / application id | New job application |
| `job_application.status_changed` | worker | job_application / application id | Application update |
| `job_application.withdrawn` | owner | job_application / application id | Application withdrawn |
| `job_application.closed` | worker | job_application / application id | Application closed |
| `job_opening.paused` | worker | job_application / application id | Opening paused |
| `job_application.removed` | owner | job_opening / opening id | Application removed |
| `job_application.removed` | worker | job_application / application id (row already deleted) | Application ended |

Bodies: `AUDIT_AND_NOTIFICATIONS.md` (W5 section). No notification for draft actions, refused
actions or trusted repairs.

## Frontend

BUILD (frontend part), 2026-10-25. Branch `feature/workforce`, no commit, no `.env` read, nothing under
`supabase/` or `scripts/` touched. Every added or changed frontend file is <= 350 lines (largest:
`OwnerJobOpeningsPanel.tsx` 296).

Added (under `frontend/src/`):
- Domain: `domain/models/{JobApplication, MarketplaceJobOpening, ApplicantProfile, VerifiedCertification}.ts`
  (notice version `w5_v1`, limits, stale message, W5 notification categories incl. `job_application.closed` /
  `.removed`); `domain/utilities/jobApplicationLifecycle.ts` (worker actions and owner transitions mirroring the
  3.3 matrix, sharing statuses, microsecond-precise "edited after applying"); `domain/repositories/{JobApplication,
  Marketplace, ApplicantPipeline}Repository.ts`.
- Infrastructure: `infrastructure/supabase/supabaseJobApplicationRow.ts` (explicit columns, no `owner_id` /
  `worker_id`; snapshot mapper reuses the W4 content mapper; applicant mapper copies named fields only),
  `supabaseJobApplicationTransition.ts` (shared `transition_job_application` call);
  `infrastructure/repositories/Supabase{JobApplication, Marketplace, ApplicantPipeline}Repository.ts`. Every write is
  an RPC; an RPC answering without a row throws; errors via `toUserFacingError`.
- Application: `services/{JobApplication, Marketplace, ApplicantPipeline}Service.ts`;
  `validation/jobApplicationSchemas.ts` (cover note <= 1000 trimmed, search limits with the RPC's messages),
  `validation/marketplaceFilterDraft.ts`.
- Presentation: utilities `jobApplicationDisplay.ts`, `workforceNoticeCopy.ts`; hooks `useMarketplaceSearch`,
  `useMarketplaceOpeningDetail`, `useMyJobApplications`, `useApplyToJobOpening`, `useApplicantPipeline`,
  `useApplicantVerifiedCertifications`, `useJobOpeningApplicationCounts`, `usePollWhileVisible` (60 s while visible
  and on focus); `components/jobOpenings/{JobOpeningDetailsView, JobApplicationStatusBadge}.tsx`;
  `components/worker/marketplace/{WorkerMarketplacePanel, MarketplaceFilterBar, MarketplaceOpeningCard,
  MarketplaceOpeningDetail, TrainingAndWorkNotice, ApplyToOpeningModal, MyApplicationsPanel, MyApplicationListItem,
  ApplicationSnapshotView, WithdrawApplicationConfirmModal}.tsx`; `components/owner/applicants/{ApplicantPipelinePanel,
  ApplicantListItem, ApplicantProfileDrawer, ApplicantVerifiedCertificationsSection,
  ApplicantTransitionConfirmModal}.tsx`; `dependencyInjection/createWorkerMarketplaceDependencies.ts`;
  `features/worker/WorkerWorkspaceTabs.tsx` ("Find work", "My applications", "Assigned bookings"; panels lazy-loaded).
- Tests: the 23 planned Vitest names (files `*.j4`, `*.j5`, `*.j17`, `*.w5`), fixtures `test/jobApplicationFixtures.ts`.

Changed: `supabaseJobOpeningRow.ts` (extracted `mapJobOpeningContentRow`, exported `toAmount`; same output),
`supabaseErrorMessages.ts` (every W5 message), `jobOpeningDisplay.ts` (exported `formatCompensationAmountLine`),
`JobOpeningPreview.tsx` (owner banner around the moved `JobOpeningDetailsView`), `JobOpeningListItem.tsx`
("Applicants (n)"), `OwnerJobOpeningsPanel.tsx` (opens the lazy pipeline in place), `OwnerDashboardContent.tsx`,
`OwnerDashboardPage.tsx`, `createDashboardDependencies.ts`, `WorkerJobsPage.tsx`, `WorkerWorkspaceGate.tsx`,
`workerWorkspaceView.ts` (default tab rule), `workerProfileDisplay.ts` (D-13 copy), `test/jobOpeningSupabaseDouble.ts`
(`in()`), `OwnerJobOpeningsPanel.w4.test.tsx` (passes the new required service prop; assertions unchanged).

Actual results (final run, `frontend/`):
- `npm run lint`: exit 0, no problems reported.
- `npm run build`: `tsc -b` clean, `vite build` "built in 662ms"; separate chunks `WorkerMarketplacePanel`,
  `MyApplicationsPanel`, `ApplicantPipelinePanel`.
- `npm test`: `Test Files 51 passed (51)`, `Tests 87 passed (87)` (64 existing + 23 W5).
- `grep -rn "worker_private_contacts" frontend/src/presentation/components/owner` and
  `grep -rn "service_role" frontend/src`: empty.

Deviations from PLAN.md section 6 (for REVIEW):
1. Visibility copy reads "Who can see your profile: you and WashLink administrators, plus shops you apply to while
   your application is active or accepted. Your private contact details are not shared with shops." The plan's
   "you, WashLink administrators, and shops ..." would break the unchanged W2 assertion
   (`/you and WashLink administrators/`); meaning is the same.
2. The notice version constant lives in `domain/models/JobApplication.ts` (`jobApplicationNoticeVersion`) because
   the service sends it; `workforceNoticeCopy.ts` re-exports it as `applicationNoticeVersion` next to the text.
3. The UI never creates drafts (Apply submits directly with `p_notice_version`). An existing draft can be reviewed
   and sent (cover note saved via `update_job_application_draft` with the `updated_at` read, then `draft ->
   submitted` with the notice version) or deleted after confirmation.
4. "Applicants (n)" counts every application the owner can read (all non-draft statuses). The pipeline is shown in
   place inside the Job openings tab (no new route). `useMyJobApplications` also polls every 60 s and on focus.
5. Linked workers now see the profile card above the tabs (it was below their bookings). The current-opening read
   for "My applications" also selects `title` and `applicant_requirement` (draft titles, certification warning).
6. The certification-required warning is shown for every such opening (no per-worker check is possible before an
   application exists; W5 has no certifications). New notification categories need no UI change: the W3 inbox
   renders them generically as plain text.

## Orchestrator note (2026-10-25)
- Deviation 7 superseded: the 500-per-opening cap is now tested in `j4_w5_opening_application_cap.test.sql` (499 trusted fixtures in a rolled-back transaction). See TEST_RESULTS.md.

## Fix cycle 1 (frontend)
1. Spec C (qualifications before applying): the card's "Apply" now opens the detail view (Apply is in its footer),
   and `ApplyToOpeningModal` itself shows "Qualifications and required training" (minimum, preferred, required
   training, exactly as stored; "not specified" text when empty) via `ApplyOpeningRequirements.tsx`.
   `ApplyTarget.openingRequirements` is `loading | unavailable | loaded`; "Send application" stays disabled until
   loaded. Draft submission (`MyApplicationsPanel`, now given `marketplaceService`) loads the current opening for
   this, with retry on failure. Helpers in `presentation/utilities/applyOpeningRequirements.ts`.
2. D-7: notice text adds "A shop may still choose to offer pay or reimbursement for training; check the opening or
   ask the shop." Notice version stays `w5_v1` (DB check constraint; text not yet released).
3. D-12 / W5-L11: `describeWorkerCertificationWarning(state)` returns "WashLink certifications are not available
   yet, so shops will not see any verified certifications for any applicant." while the workflow is unavailable,
   else the no-certification warning or null. State comes from `certificationWorkflowStatus` /
   `currentWorkerVerifiedCertificationState` in `domain/models/VerifiedCertification.ts` (W7 supplies the real
   one). Owner side mirrors via `describeNoVerifiedCertifications(isWorkflowAvailable)` ("Verified certifications:
   not available yet" until W7).
4. Owner pipeline: `listApplicationsForOpening` and `countApplicationsByOpening` add
   `.not('submitted_at', 'is', null)`; the list also drops any draft / null-`submitted_at` row client-side.
Tests: new `ApplyOpeningRequirements.w5.test.tsx` (3), `w5_owner_pipeline_queries_require_submitted_at`; updated
J4 card test (Apply opens details), apply-dialog notice and drawer/detail certification copy assertions.
Results: `npm run lint` clean; `npm run build` built; `npm test` 52 files, 91 tests passed.
5. Closed drafts (from Fix cycle 1 DB): `isClosedDraft` / `workerActionsForApplication` / `isWorkerDeletableDraft`
   in `domain/utilities/jobApplicationLifecycle.ts` (status `closed` with `submitted_at` null: only `delete_draft`).
   The service guard uses them, so sending a closed draft is refused client-side too. My applications shows
   "Closed (never sent)" (`describeWorkerApplicationStatus`), no snapshot button, no Send, and "Delete draft" with
   the existing confirmation (`describeWorkerWithdrawAction`). Notice version unchanged (`w5_v1`).
   Test: `MyApplicationsClosedDraft.w5.test.tsx`. Re-run: `npm run lint` clean; `npm run build` built;
   `npm test` 53 files, 92 tests passed.

## Fix cycle 1 (DB), 2026-10-25
Local Docker stack only; no commit, no `.env` read, no committed migration touched (`git diff --name-status 50cb850 -- supabase/migrations` empty), nothing under `frontend/` touched.

Changes (uncommitted W5 migrations edited in place):
- S-B1 (w5b, w5c, w5d, w5e): every owner read / action requires `submitted_at is not null`: policy `ja_select_owner_non_draft` (name kept), `applicant_profiles_for_job_opening`, `applicant_verified_certifications`, owner actor in `transition_job_application`, the 500 cap count. Decision: auto-close KEEPS drafts as `closed` with `submitted_at` null ("closed draft"), visible only to the worker, no notification; not deleted, because deletion would destroy worker text without a worker action, and owner access is now impossible by construction. `delete_job_application_draft` (and the guard) also delete the worker's own closed draft (`submitted_at` null). Cascade notice `opening_removed` and the `job_application.closed` notice also key on `submitted_at`.
- `worker_has_applied_to_job_opening`: `submitted_at is not null` (a closed draft no longer grants reading the closed opening).
- Cap race (w5c): `pg_advisory_xact_lock(hashtextextended('job_opening_apps:' || opening_id, 0))` before the 500 count; order opening row FOR SHARE -> worker lock -> opening lock, same in every caller.
- Current owner (w5b helper `is_current_job_opening_owner(uuid)`, definer, `search_path = public, pg_temp`, authenticated only): role owner and `shops.owner_id = auth.uid()` via the opening's shop. Used by the policy (plus the copied `owner_id`), the transition owner actor, both owner read RPCs. A former owner loses reads/actions; a new owner does not inherit old applications.
- Tests: new `supabase/tests/database/j17_w5_fix1_closed_drafts_and_current_owner.test.sql` (24). Docs: `MARKETPLACE_AND_APPLICATIONS.md` (closed drafts, visibility, locks), `AUDIT_AND_NOTIFICATIONS.md`, `ROLE_AND_PROFILE_SECURITY.md` (D-10 row 24 + new helper, row 26 wording, new row 27 full_name check, guard matrix), `LEGAL_REVIEW_REGISTER.md` (W5-L9..L11 added; W5-L2/L3 sources now real files).

Actual output:
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: tests 18, pass 18, fail 0.
- `node scripts/supabase-test/run-db-tests.mjs`: exit 0, 27 migrations applied, `Files=28, Tests=1078` (1054 + 24), `Result: PASS`; 0 `todo_start(`.
- `w2-api-smoke: 48 passed, 0 failed`; `w3-api-smoke: 33 passed, 0 failed`; `w4-api-smoke: 43 passed, 0 failed`; `w5-api-smoke: 39 passed, 0 failed`.
- `supabase stop --workdir .local-supabase-test --no-backup`: "Stopped supabase local development setup."

Frontend impact (for the frontend engineer; nothing required for security, RLS already filters):
1. Owner pipeline `.not('submitted_at', 'is', null)` (already done in Fix cycle 1 frontend) is now redundant but harmless.
2. Worker "My applications" can now receive a row with `status = 'closed'` and `submitted_at`, `opening_snapshot`, `notice_version` all null (a closed draft). It must not assume a snapshot for `closed`; suggested label "Closed (never sent)" and offer "Delete draft" (calls `delete_job_application_draft`, now allowed for it). Sending it is refused (42501 `This application status change is not allowed.`).
3. Owners see 0 rows / 42501 for openings of a shop they no longer own (only reachable via a trusted shop transfer).

Not verified: the advisory-lock race is checked structurally (lock present, after the worker lock), not with two concurrent sessions; production `profiles.full_name` content (D-10 row 27, human step).

### Fix cycle 1 (DB), security re-review follow-up, 2026-10-25
- Deadlock (w5c): `transition_job_application` now reads `job_opening_id` unlocked (immutable), locks the opening FOR SHARE, then the application FOR UPDATE, then checks actor / staleness / pair (the owner branch reuses the locked opening). Global order documented in w5c section 1 (comment rewritten): job_openings row -> job_applications row -> worker advisory -> opening advisory; `create_job_application` already locked the opening first; draft edit / delete lock only the application.
- Owner notifications (w5e: submitted, withdrawn, applicant-profile removed) go to the current `shops.owner_id` via the opening's shop, and only when it equals the application's `owner_id`; otherwise none (audit still written). Chosen so that after a trusted shop transfer neither the former owner nor a new owner who cannot yet read the row is notified; the transfer repair must realign `job_openings.owner_id` / `job_applications.owner_id`.
- D-10 row 28 in `ROLE_AND_PROFILE_SECURITY.md`: `jo_select_published_for_workers` deliberately widened for applicants with a sent application. Docs also updated: `MARKETPLACE_AND_APPLICATIONS.md`, `AUDIT_AND_NOTIFICATIONS.md`.
- Test: new `supabase/tests/database/j5_w5_fix1_owner_notifications_and_lock_order.test.sql` (16): notifications before / after a trusted transfer and after realignment; lock order (FOR SHARE before FOR UPDATE in the function body); no regression (stale 55000, unknown id 42501, accept, withdraw after close, disallowed pair).
- Actual output: stager `tests 18, pass 18, fail 0`; `run-db-tests.mjs` exit 0, 27 migrations, `Files=29, Tests=1094`, `Result: PASS`, 0 `todo_start(`; smokes w2 48/0, w3 33/0, w4 43/0, w5 39/0; stack stopped ("Stopped supabase local development setup."). `git diff --name-status 50cb850 -- supabase/migrations` empty.
- Not verified: the deadlock fix with two real concurrent sessions (structural + behaviour checks only). No frontend change needed.

## Orchestrator record (2026-10-25)
- Reviews interrupted once by a usage limit and resumed.
- REVIEW: security 1 BLOCKING (S-B1) → fix cycle 1 → re-review no BLOCKING (lock order, notify recipient fixed). Compliance no BLOCKING. REVIEW.md.
- VERIFY: PASS (VERDICT.md). Fix cycles: 1.
