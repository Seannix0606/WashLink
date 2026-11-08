# W2 - LOG

## BUILD - database part (db engineer, 2026-10-24, local Docker only)

Base: `feature/workforce` at `eb38246`. No commit. No `link`, `push`, `--linked`, `--db-url`
or remote connection; `.env` not read; Supabase CLI only through the runner
(`--local --workdir .local-supabase-test`).

### Files

New migrations (each ends with a commented `-- ROLLBACK` block; committed migrations untouched):
- `supabase/migrations/2026_10_24_w2a_session_helpers_and_profile_role_guard.sql` (209 lines)
- `supabase/migrations/2026_10_24_w2b_shop_verification_hardening.sql` (220)
- `supabase/migrations/2026_10_24_w2c_booking_write_guards.sql` (198)
- `supabase/migrations/2026_10_24_w2d_workers_link_and_roster_guard.sql` (161)
- `supabase/migrations/2026_10_24_w2e_worker_roster_link_codes.sql` (324)
- `supabase/migrations/2026_10_24_w2f_worker_profiles.sql` (215)

Harness (S10/S11): `supabase/config.toml` (`[db.seed] enabled = false`),
`scripts/supabase-test/stage-local-workdir.mjs`, `run-db-tests.mjs`,
`stage-local-workdir.test.mjs` (+6 tests), `baseline/test_helpers.sql` (header warning only).

pgTAP: changed `001_migration_replay`, `j17_authorization_harness` (7 wrappers removed,
assertions unchanged, S4 counterparties + S5 added), `j18_existing_flows` (F5 -> RPC, W2 write
paths); new `j1_worker_registration_and_profile`, `j17_w2_shop_booking_guards`,
`j17_w2_worker_data_guards`, `j18_w2_profile_reads`.

Docs: new `docs/workforce/ROLE_AND_PROFILE_SECURITY.md` (P1-P8, guard matrix, R2 audit, D-10
checklist); updated `docs/workforce/LOCAL_TEST_HARNESS.md`, `loop/workforce/LOOP.md`
check-suite notes (todo_start 0, stager 18, 13 migrations).

### Actual output

`node --test scripts/supabase-test/stage-local-workdir.test.mjs`:
```
ℹ tests 18
ℹ pass 18
ℹ fail 0
```
`node scripts/supabase-test/run-db-tests.mjs` (exit 0):
```
Applying migration 00000000000000_local_test_baseline_only.sql...
Applying migration 20260417000001_add_shops_and_booking_location.sql...
Applying migration 20260417000002_local_test_baseline_owner_policies.sql...
Applying migration 20260418000001_super_admin_and_shop_verification.sql...
Applying migration 20261021000001_shop_pricing_and_booking_quotes.sql...
Applying migration 20261022000001_add_booking_notes_and_ratings.sql...
Applying migration 20261022000002_fix_shop_verification_storage_rls.sql...
Applying migration 20261024000001_w2a_session_helpers_and_profile_role_guard.sql...
Applying migration 20261024000002_w2b_shop_verification_hardening.sql...
Applying migration 20261024000003_w2c_booking_write_guards.sql...
Applying migration 20261024000004_w2d_workers_link_and_roster_guard.sql...
Applying migration 20261024000005_w2e_worker_roster_link_codes.sql...
Applying migration 20261024000006_w2f_worker_profiles.sql...
Seeding data from supabase/local_test_baseline/test_helpers.sql...
.../000_harness_sanity.test.sql .................. ok
.../001_migration_replay.test.sql ................ ok
.../j17_authorization_harness.test.sql ........... ok
.../j17_w2_shop_booking_guards.test.sql .......... ok
.../j17_w2_worker_data_guards.test.sql ........... ok
.../j18_existing_flows.test.sql .................. ok
.../j18_w2_profile_reads.test.sql ................ ok
.../j1_worker_registration_and_profile.test.sql .. ok
Files=8, Tests=268
Result: PASS
```
Plans: 000 9, 001 15, j17 40, j17_w2_shop 32, j17_w2_worker 34, j18 64, j18_w2_profile 19,
j1 55. `grep -c "todo_start(" supabase/tests/database/*.sql`: 0 in all 8 files. No
`Failed (TODO)` / `TODO passed` lines. Before the test rewrite, the same replay with the old
tests showed all 20 former j17 TODO assertions passing and the old direct-UPDATE F5 still
failing (expected: the guard keeps rejecting it).

Extra local checks (psql in the local DB container, each inside `begin ... rollback`):
- ROLLBACK blocks f..a executed in order without error; afterwards 0 W2 functions, 0 W2
  tables, 0 W2 triggers, profiles policies `profiles_select_own, profiles_update_own`,
  `prevent_owner_verification_mutation` back to the 2026_04_18 body.
- Re-applying all 6 W2 migrations on the migrated DB: no error (idempotent; only
  "already exists, skipping" notices).
- S4 DO block with an extra `using (true)` policy: `NOTICE: W2a: dropping open profiles policy
  "some_unknown_open_policy"`; the Supabase template policy is dropped by name.

### Deviations from PLAN (all behaviour-neutral or stricter)

1. Link tables: RLS on with explicit deny-all policies (`*_no_client_select|insert|update|delete`,
   `using/with check (false)`) instead of no policies, plus `created_at`/`updated_at` on both
   tables (standing DB rule). No table privileges for anon/authenticated, as planned.
2. New j17/j18 tests are split into new files to keep every file <= 350 lines.
3. Extra assertions beyond the plan names: `j17_submit_shop_rpc_rejects_ineligible_status`,
   `j17_worker_cannot_unlink_other_roster_entry`, `j18_owner_can_register_shop_with_frontend_payload`,
   `j18_owner_can_upsert_verification_document_with_frontend_payload`, and the R2 file.
4. `is_trusted_db_session()` and `is_verified_shop_owner()` are not granted to anon (P8): the
   anon DB role gets 42501; anon JWT claims in a definer-like session return false. Both asserted.
5. Internal helpers (no client EXECUTE): `profile_protected_column_changes`,
   `roster_link_code_hash`, `require_worker_caller`, `roster_link_is_rate_limited`,
   `approved_shop_names_for_owner`, `stamp_worker_private_contact`; `normalize_worker_text_list`
   is granted to authenticated because the (invoker) profile trigger calls it.
6. preview also records an attempt (failed on a bad code, succeeded on a valid one), so preview
   is not an unlimited oracle; a rate-limited call records nothing.
7. R2 (orchestrator): no frontend path reads another user's profile, so no counterparty policy,
   view or RPC was added; findings in ROLE_AND_PROFILE_SECURITY.md, proofs in `j18_w2_profile_reads`.

### Not verifiable locally

- GoTrue branch of `guard_profile_protected_columns` (session_user `supabase_auth_admin`,
  silent restore) - R4. `j17_metadata_update_cannot_change_profile_role` only proves the local
  baseline has no metadata sync.
- Anything about the production schema (D-10 checklist in ROLE_AND_PROFILE_SECURITY.md).
- Frontend lint/build/Vitest and pytest were not run (frontend work is the next BUILD step).
- RPCs were exercised in SQL only, not through PostgREST/supabase-js (e.g. `.select()` with
  `shop_pricing` embedding on `rpc('submit_shop_for_verification')` is expected to work for a
  function returning `public.shops`, but was not run here).

## API for the frontend engineer (W2)

All via `supabase-js`; never pass ids the server can derive (`auth.uid()` is used inside).

| Purpose | Call | Returns / errors |
|---|---|---|
| F5 submit / resubmit a shop | `rpc('submit_shop_for_verification', { p_shop_id })` (chain `.select(<shop columns incl. shop_pricing!shop_pricing_shop_id_fkey(...)>).single()` if needed) | `public.shops` row. 42501 `Shop not found.` (not owner), P0001 `This shop cannot be submitted in its current status.` (not pending/changes_requested), 42501 when signed out |
| Gate helper (W4+) | `rpc('is_verified_shop_owner', { p_shop_id })` | boolean |
| Owner issues link code | `rpc('create_roster_link_code', { p_worker_row_id })` | one row `{ link_code: text (12 upper hex), expires_at: timestamptz }`; show once. 42501 `Only owner accounts can issue roster link codes.` / `Roster worker not found.`; P0001 `This roster worker is already linked to an account.` Issuing again revokes the previous code |
| Worker previews code | `rpc('preview_roster_link_code', { p_code })` | one row `{ result, roster_display_name, owner_shop_names text[] }`; `result` in `valid`, `invalid_or_expired`, `rate_limited`, `already_linked_to_owner` (name/shops only for `valid`). Case/spaces/dashes ignored. 42501 `Only worker accounts can link to a shop roster.` |
| Worker accepts (consent) | `rpc('accept_roster_link_code', { p_code })` | one row `{ result }`: `linked`, `invalid_or_expired`, `rate_limited`, `already_linked_to_owner` |
| Worker unlinks | `rpc('unlink_my_roster_entry', { p_worker_row_id })` | void; 42501 `Roster entry not found.` |
| Worker roster entries (F6) | `rpc('list_my_roster_links')` | rows `{ worker_row_id, roster_display_name, is_available, owner_shop_names text[] }` (approved + active shops only), ordered by created_at |
| Worker profile | table `worker_profiles`: `profile_id` (= session user id, PK), `headline` (<=120), `experience_summary` (<=2000), `years_of_experience` (0..60 or null), `skills text[]` (<=30, item <=60), `preferred_locations text[]` (<=10, item <=120), `availability_status` (`full_time`/`part_time`/`weekends_only`/`flexible`/`not_available`, default `flexible`), `availability_notes` (<=300), `created_at`, `updated_at` | own row only; insert requires role `worker`; upsert on `profile_id`. Skills/locations are trimmed and case-insensitively de-duplicated server side. Violations: 23514; wrong user/role: 42501 |
| Worker private contact | table `worker_private_contacts`: `profile_id` (PK, needs a `worker_profiles` row), `contact_phone` (`^[+0-9 ()-]{7,20}$`), `contact_email` (<=254, lower-cased), `preferred_contact_method` (`phone`/`email`/`in_app`) | own row only (no admin, no owner); deleting the profile cascades |
| Roster linked flag | `workers.user_id` (select it, map to boolean `isLinkedToAccount`) | owner may set it to null (unlink); any other change 42501 `Workers are linked only when the worker accepts a link code.` |
| Booking writes | unchanged payloads | new 42501 messages: `This booking field cannot be changed.`, `This booking status change is not allowed.`, `Only a worker from your own roster can be assigned to this booking.`, `Only a completed, unrated booking can be rated by its customer.`, `New bookings start as pending, unassigned and unrated.` |
| Shop writes | unchanged payloads | create: 42501 `Only owner accounts can register a shop.`; editing name/address of an approved shop returns it with `verification_status = 'pending'` (show the S6 warning) |
| Profile edits | unchanged | 42501 `Your role and verification fields cannot be changed from the app.` if `role` is changed; read role from `profiles` only |

## BUILD - frontend part (frontend engineer, 2026-10-24)

No commit, nothing staged. `.env` not read. `supabase/` and `scripts/` untouched. Data flow
UI -> hooks -> services -> repositories -> Supabase; no Supabase calls in components.

### Files
Added - domain: `models/WorkerProfile.ts`, `models/RosterLink.ts`, `errors/DuplicateAccountError.ts`,
`utilities/workerProfileCompletion.ts`, `utilities/ownerOnboardingChecklist.ts`,
`repositories/WorkerProfileRepository.ts`, `repositories/RosterLinkRepository.ts`.
Infrastructure: `repositories/SupabaseWorkerProfileRepository.ts` (profile_id from `auth.getSession()` only),
`repositories/SupabaseRosterLinkRepository.ts` (the 5 RPCs), `supabase/supabaseErrorMessages.ts`
(DB/PostgREST error -> plain text; only the W2 guard messages pass through verbatim, other codes map
to generic text, so no raw SQL reaches the UI), `supabase/supabaseShopVerificationRows.ts` (mappers
moved out so the verification repository is 295 lines, was 385).
Application: `validation/workerProfileSchemas.ts` (zod, DB limits), `validation/workerProfileDraft.ts`
(per-step form validation), `services/WorkerProfileService.ts`, `services/RosterLinkService.ts`
(code normalisation + 12-hex check before any RPC). DI: `createWorkerProfileDependencies.ts`;
`createDashboardDependencies` now also builds `rosterLinkService`.
Hooks: `useWorkerProfile`, `useWorkerProfileOnboarding`, `useMyRosterLinks`, `useAcceptRosterLinkCode`,
`useOwnerRosterLinkCode`, `useOwnerOnboardingChecklist`.
UI: `components/workerProfile/*` (OnboardingFlow, About/Skills/Availability/PrivateContact steps,
SummaryCard, EditorModal with delete, CompletionBanner, TagListInput, TextArea),
`worker/RosterLinkCodeForm.tsx` (preview shows roster name + shop names, explicit "Link my account",
not-a-contract/employment copy), `worker/WorkerRosterEntryPicker.tsx` (> 1 entry),
`worker/WorkerRosterLinksPanel.tsx` (unlink + link another), `owner/OwnerRosterLinkCodeButton.tsx`
(code + expiry shown once, copy), `onboarding/OwnerOnboardingChecklist.tsx`,
`shared/LoadErrorNotice.tsx`, `features/auth/RolePickerGrid.tsx` (+ worker, D-9),
`features/auth/SignUpFeedbackNotice.tsx`, `features/worker/WorkerWorkspaceGate.tsx`,
`features/worker/workerWorkspaceView.ts` (pure routing rule), `pages/WorkerWorkspacePage.tsx`.
Changed: `AuthLandingForms.tsx` (361 -> 304 lines), `useAuthLanding.ts`, `AuthLandingPage.tsx`,
`AuthRepository`/`SupabaseAuthRepository.signUp` -> `SignUpOutcome`, `SignUpRole` whitelist type,
`AuthService.signUpWorker`, `AuthenticatedUserContext.signUpWorker`, Worker model `isLinkedToAccount`
(user_id selected, mapped to boolean only), `WorkerRepository`/`SupabaseWorkerRepository`/`WorkerService`
(`fetchWorkerByUserIdentifier` removed, F6), `WorkerJobsPage.tsx` (selected roster entry),
`WorkerNoProfileNotice.tsx` (embeds the code form), `OwnerWorkerListItem`/`OwnerWorkersPanel`/
`OwnerDashboardContent`/`OwnerDashboardPage`, `OwnerShopListItem` + `shopVerificationDisplay`
(S6 warning), `App.tsx` (worker -> lazy `WorkerWorkspaceGate`), `test/fixtures.ts`.
Deleted: `hooks/useWorkerProfileResolution.ts`, `pages/WorkerJobsPage.tsx`.
`grep -rn "fetchWorkerByUserIdentifier" frontend/src`: empty. Largest touched file: 304 lines.

### Actual output (frontend/)
`npm run lint`: `> eslint .` with no findings (exit 0).
`npm run build`: `tsc -b && vite build` ... `✓ built in 543ms` (exit 0).
`npm test`: `Test Files  23 passed (23)`, `Tests  34 passed (34)` = 16 existing + 18 new: the 15
planned names plus `j1_sign_up_maps_existing_account_to_duplicate_error`,
`j1_worker_profile_repository_hides_raw_database_errors`, `j1_sign_up_shows_check_email_notice`.

### Deviations / notes
1. No shop name/address edit form exists in the app, so the S6 warning is shown on approved shops
   in the shop list (`approvedShopIdentityChangeWarning`), ready for a future edit form.
2. `SupabaseShopVerificationRepository.submitShopForVerification` takes only the shop id (owner is
   derived by the RPC); the domain interface keeps `(shopIdentifier, ownerIdentifier)` so the
   existing j18 service test is unchanged.
3. Availability has no preselected value in the form (no invented default); the worker must choose.
   An all-empty private contact deletes the contact row instead of saving nulls.
4. Onboarding offers "Skip for now" (session only) so a worker without a profile can still reach
   the link-code form; linked workers are never routed to onboarding.
5. Owner checklist hides once every step is done; it loads documents for the most advanced shop
   only (one request), and shows "Checking..." / an error line while unknown.
6. Pre-existing repositories (bookings, shops) still prefix `error.message`; the W2 guard messages
   they can now surface are already plain text. A sweep with `toUserFacingErrorMessage` is a
   follow-up (only worker create/assign were switched here).
7. Not verified: real supabase-js/PostgREST behaviour of the RPCs (unit tests mock the client),
   GoTrue duplicate-signup shape on the production project, clipboard API in older browsers.

## Fix cycle 1 (frontend)

- Copy: roster-link consent and roster panel now say "WashLink does not record this link as a contract or employment agreement" (shared `rosterLinkRecordNotice` in `rosterLinkResultDisplay.ts`). Private contact notice now says details are visible only to you in the app; profile steps show who can see the profile (you and WashLink administrators; shops you apply to once applications are available).
- Errors: raw `error.message` replaced with `toUserFacingError` in SupabaseBooking/Shop/Worker/ShopVerification/Auth repositories. Auth keeps duplicate-account and database-error signup messages; adds friendly sign-in messages (invalid credentials, unconfirmed email, rate limit) and weak-password/rate-limit signup messages.
- Verification review update no longer sends `verification_reviewed_by` / `verification_reviewed_at` (server sets them). `reviewerIdentifier` remains in the domain input but is unused by the repository.
- Tests: new `j18_raw_postgres_error_is_not_shown_to_users` (booking repository); J1 onboarding test updated for new notice copy and asserts the profile visibility notice.
- Results: `npm run lint` clean; `npm run build` succeeded; `npm test` 23 files, 35 tests passed.
- Follow-up: SupabaseProfileRepository.ts raw `error.message` throws swept through `toUserFacingError`. New `SupabaseShopVerificationRepository.review.j18.test.ts` (`j18_review_update_omits_server_set_reviewer_fields`) asserts the review update payload is exactly `{ verification_status, verification_notes }`, with no `verification_reviewed_by` or `verification_reviewed_at`.
- Follow-up results: `npm run lint` clean; `npm run build` succeeded; `npm test` 24 files, 36 tests passed.

## Fix cycle 1 (DB) (db engineer, 2026-10-24, local Docker only)

No commit, nothing staged. `.env` not read. No `link`/`push`/`--linked`/`--db-url`, no remote
connection; Supabase CLI only via the runner, plus `npx supabase stop --workdir .local-supabase-test`
run from inside the staged workdir. The 5 committed migrations are untouched
(`git diff --stat eb38246 -- supabase/migrations` empty). `frontend/` untouched.

### Changes (W2 migrations edited in place; all still uncommitted)
- S-B1: new internal `is_orphaned_fk_set_null(regclass, old jsonb, new jsonb)` (w2a): true iff
  the only changed columns are single-column `on delete set null` FKs going value -> null while
  the parent row is gone. Called first (after the trusted check) in `guard_booking_update`,
  `guard_worker_roster_write`, `prevent_owner_verification_mutation` and the document guard.
  Covers customer, linked worker account, reviewing admin, uploader, owner (shops cascade ->
  `bookings.shop_id`) and roster rows on bookings in any status. A hand-written null while the
  parent exists is still rejected.
- C-B1(a): super admin changing `verification_status` -> `verification_reviewed_by := auth.uid()`,
  `verification_reviewed_at := now()`; with no status change both keep their old values.
  (b) `is_verified_shop_owner` also needs reviewed_by/at not null and `is_active` (N3 adopted as
  default). (c) D-10 row 14 (audit query), proven by a pgTAP `set_eq`.
- `is_trusted_db_session()`: service_role JWT, or no claims and session_user not
  authenticator / supabase_auth_admin / supabase_storage_admin.
- `guard_booking_insert` forces `customer_id := auth.uid()`; `shops.owner_id` frozen for every
  non-trusted session (42501 `The owner of a shop cannot be changed.`); documents stamp
  `uploaded_by` on INSERT only (UPDATE keeps the old value).
- Link codes: server-side pepper (chosen over per-row salt: keeps the unique-index lookup) in
  `washlink_private.roster_link_code_pepper` (schema not exposed, no privileges, RLS on,
  deny-all policies); `roster_link_check_rate_limit(uuid, bytea)` replaces
  `roster_link_is_rate_limited(uuid)`: per-user `pg_advisory_xact_lock`, prunes rows older than
  1 h (batches of 500, `skip locked`), 5 failures/user/h plus 10 lookups/code-hash/h;
  attempts now record `code_hash`.
- w2f: `availability_status` NOT NULL without default (23502 if omitted; the frontend always
  sends it, `SupabaseWorkerProfileRepository.ts:88`); DO block drops the private / link tables
  from `supabase_realtime` (NOTICE if the publication is FOR ALL TABLES).
- Size (AC15): `approved_shop_names_for_owner`, `unlink_my_roster_entry`, `list_my_roster_links`
  moved verbatim from w2e to w2d (w2e 406 -> 345 lines). Largest file 345 lines.
- D-10 rows 13 (no role assignment via auth-admin UPDATE; silent revert kept), 14, 15, 16.
- Tests: new `j17_w2_fix1_fk_cascades.test.sql` (31), `j17_w2_fix1_review_and_hardening.test.sql`
  (42); `j17_w2_shop_booking_guards` fixture gets a recorded review; explicit
  `availability_status` in 5 test inserts. Smoke: + no-JWT anon probe, service_role trust,
  review stamping via PostgREST, booking history + GoTrue `deleteUser` of linked worker,
  customer, reviewing admin and owner, owner deletes a roster row on a completed booking; every
  `deleteUser` result (also cleanup, old line 186) is asserted.
- Docs: `ROLE_AND_PROFILE_SECURITY.md` (P5, new P9, guard matrix, gate, link codes, D-10 13-16),
  `LOCAL_TEST_HARNESS.md`, `LOOP.md` counts.

### Frontend: `verification_reviewed_by` client write
IGNORED, not rejected: for a super admin the guard overwrites `verification_reviewed_by` /
`verification_reviewed_at` with `auth.uid()` / `now()` on a status change and with the old values
otherwise, so a request that sends them still succeeds (smoke
`super_admin_review_stamps_reviewer_server_side` sends a forged reviewer and date; the stored row
has the real admin and the current time). The frontend can drop the field; the current
`SupabaseShopVerificationRepository.ts` already no longer sends it (comment at line 239).

### Actual output
Before the fix (old migrations, new smoke script): `w2-api-smoke: 38 passed, 10 failed`, including
`NOT OK delete_user_customer_with_bookings -> Database error deleting user`,
`NOT OK delete_user_linked_worker_account_with_booking_history -> Database error deleting user`,
`NOT OK owner_can_delete_roster_worker_with_completed_booking -> Only a worker from your own roster can be assigned to this booking.`,
`NOT OK super_admin_review_stamps_reviewer_server_side -> {..."verification_reviewed_at":"2000-01-01T00:00:00+00:00"}`.

After the fix:
`node --test scripts/supabase-test/stage-local-workdir.test.mjs` (exit 0):
```
ℹ tests 18
ℹ pass 18
ℹ fail 0
```
`node scripts/supabase-test/run-db-tests.mjs` (exit 0):
```
Applying migration 20261024000001_w2a_session_helpers_and_profile_role_guard.sql...
...
Applying migration 20261024000006_w2f_worker_profiles.sql...
.../j17_w2_fix1_fk_cascades.test.sql ............. ok
.../j17_w2_fix1_review_and_hardening.test.sql .... ok
(all 10 files ok)
All tests successful.
Files=10, Tests=341
Result: PASS
```
`node scripts/supabase-test/w2-api-smoke.mjs` (exit 0): `w2-api-smoke: 48 passed, 0 failed`.
Extra (psql in the local DB container, `begin ... rollback`): re-applying all 6 W2 migrations
exit 0 (only "skipping" notices); ROLLBACK blocks f..a exit 0, 0 W2 functions left, no
`washlink_private` schema. `npx supabase stop ... --no-backup`: stopped, 0 supabase containers.
`grep -c "todo_start("`: 0 in all 10 files.

### Not verified / notes
- `anon_no_jwt_postgrest_request_is_not_trusted` also PASSED before the fix: on the local stack a
  request without `Authorization` is not seen as claim-less by the guard (Kong/PostgREST appear to
  supply anon claims), so the fail-open was not reproducible locally. The new rule is fail-closed
  either way (`session_user = authenticator` alone is never trusted); production Kong config unknown.
- pgTAP cannot change `session_user`, so the GoTrue session is simulated with untrusted bystander
  claims; the real `supabase_auth_admin` cascade path is covered only by the smoke script.
- Concurrency of the advisory lock is not load-tested (pgTAP asserts the lock is held).
- `approved_shop_names_for_owner` still means approved + active only (not the recorded-review
  rule); documented as a follow-up. Deleting a reviewing admin un-verifies their shops (by design
  of C-B1b; documented: deactivate reviewers instead).

## Orchestrator record (2026-10-24)
- REVIEW: security 1 BLOCKING (S-B1), compliance 1 BLOCKING (C-B1) → fix cycle 1 → re-reviews no BLOCKING. REVIEW.md.
- VERIFY: PASS (VERDICT.md). Fix cycles: 1.
