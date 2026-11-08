# W2 - Role hardening & worker profiles / onboarding - PLAN

Spec: A (roles, registration), G (authz, constraints), J1, J17, J18. Depends on W1 (`passed`, STATE.md).
Decisions: D-2 keep-and-link, D-8 signup role whitelist + immutable role, D-9 worker in picker,
D-11 naming (all ADOPTED-DEFAULT); D-10 standing gate (local proof only). Not BLOCKED.
Closes: E1, E2, E3, E5, S1, S2, S4, S5, S6, S7, S9, S10, S11, F5, F6, C3, C8 (W0/W1 REVIEW).
E4 (owner edits `verification_submitted_at`/`is_active`) is accepted as intended and recorded.

## 1. Scope / out of scope
In: DB guards for profiles/shops/bookings/workers; `worker_profiles` + private contacts;
`is_verified_shop_owner(shop_id)`; F5 RPC; consent-based roster linking (link codes); harness
hardening S10/S11; worker signup, duplicate-account and email-confirmation handling; worker
profile onboarding/editor; owner onboarding checklist; multi-roster worker lookup (F6); tests.
Out: job openings (W4), owner read of worker profiles/applicants (W5), relationships (W10),
audit events (W3; W2 writes none), role change requests (customer->worker etc. stay impossible
from the app; documented), owner UI to unlink a worker (DB allows it), any production apply.

## 2. Design principles (D-10: unknown production schema)
P1. Restrictions live in BEFORE triggers, not policies, so they apply whatever (unknown) RLS
    policies production has. Policies are only added; drops are by exact name with `if exists`.
P2. "Everything else is immutable" uses `to_jsonb(new) - allowed_keys = to_jsonb(old) - allowed_keys`,
    so unknown production columns are protected without being named (bookings, workers).
    Profiles use a block-list (id, role, created_at, any key matching `%verif%` or `%admin%`)
    so unknown user-editable columns (e.g. avatar_url) keep working.
P3. Role values are compared as `role::text` (production `role` may be an enum, 2026_04_18 case B).
P4. No `create or replace` of `handle_new_user()` (production name unknown). E1 is closed by a
    BEFORE INSERT trigger on `public.profiles` that fires for any signup function.
P5. Trusted session = `public.is_trusted_db_session()`, GUC-based so it is correct inside
    SECURITY DEFINER code: true iff `auth.uid() is null` AND `coalesce(auth.jwt()->>'role','')
    not in ('authenticated','anon')` AND `session_user::text <> 'supabase_auth_admin'`.
    True for: SQL editor/psql (human), service_role requests, test `act_as_service()`.
    False for: every end-user JWT (incl. super_admin), anon, GoTrue's DB session.
P6. RPC-only state changes set a transaction-local flag (`set_config('washlink.<name>', id, true)`)
    that the guard trigger accepts only for that row id; flags are reset before returning.
    PostgREST cannot set `washlink.*` GUCs. Recorded as risk R3.
P7. No pgcrypto dependency: codes from `gen_random_uuid()`, hashes via built-in `sha256()`.
P8. Every new function: `set search_path = public`, `revoke all ... from public, anon`,
    `grant execute ... to authenticated` only where the app calls it.

## 3. Migrations (new files only; staged as 20261024000001..06; each ends with `-- ROLLBACK`)
Lexical order = dependency order. Each file ≤ 350 lines; `notify pgrst, 'reload schema';` last.

### 3.1 `2026_10_24_w2a_session_helpers_and_profile_role_guard.sql` (E1, E2, S4, S5, D-9)
- `is_trusted_db_session()` (P5, stable, invoker). `current_user_profile_role()` returns text
  (stable, definer, `select role::text from profiles where id = auth.uid()`).
- D-9 allowance: DO block, if a role enum exists (`user_role|profile_role|application_user_role`)
  `alter type ... add value if not exists 'worker'` per name with `undefined_object` handlers
  (same pattern as 2026_04_18); CHECK case already includes worker (2026_04_18:26-28).
- `sanitize_profile_role_on_insert()` + trigger `profiles_sanitize_role_on_insert` BEFORE INSERT,
  all sessions: `if new.role is null or new.role::text not in ('customer','owner','worker')
  then new.role := 'customer'`. super_admin is only granted by a trusted UPDATE (D-8).
- `guard_profile_protected_columns()` + trigger `profiles_guard_protected_columns` BEFORE UPDATE:
  trusted -> allow. If a protected key (P2 block-list) changed: session_user =
  `supabase_auth_admin` -> silently restore old values (never break GoTrue; S5 metadata sync);
  otherwise raise 42501 `Your role and verification fields cannot be changed from the app.`
- S4 policies: drop by name `profiles_select_own` (local) and the Supabase template
  `"Public profiles are viewable by everyone."`; DO block drops any remaining SELECT/ALL policy on
  public.profiles whose `qual = 'true'` and `raise notice` its name (logged for the D-10 diff).
  Create `profiles_select_own` (id = auth.uid()) and `profiles_select_super_admin`
  (`is_super_admin()`). Frontend only reads its own profile (verified: SupabaseAuthRepository:151,
  SupabaseProfileRepository:40), so nothing breaks.
- Rollback: drop the 2 triggers/3 functions/new admin policy; recreate local `profiles_select_own`;
  re-adding a dropped `using (true)` policy is possible but re-opens S4 (names come from NOTICE).
  The enum value cannot be removed (documented irreversible, harmless).

### 3.2 `2026_10_24_w2b_shop_verification_hardening.sql` (E3/C3, F5, S6, S7, gate helper)
- `guard_shop_insert()` + trigger `shops_guard_insert` BEFORE INSERT: trusted or super_admin ->
  allow; else require `current_user_profile_role() = 'owner'` (42501 `Only owner accounts can
  register a shop.`) and raise 42501 if `verification_status <> 'pending'` or any of
  notes/reviewed_at/reviewed_by is not null. Fixtures (`create_shop`, superuser) unaffected.
- `create or replace prevent_owner_verification_mutation()` (same trigger name, still definer):
  allow if super_admin or trusted; allow F5 when `current_setting('washlink.submit_shop', true)
  = new.id::text` and old status in (pending, changes_requested) and new status = pending and
  notes/reviewed_* unchanged; else the original exception text (J17/J18 assert it). Then S6: if
  old status = 'approved' and `name` or `address` changed by a non-admin, untrusted caller, set
  `new.verification_status := 'pending'`, `new.verification_submitted_at := now()` (re-review).
  Lat/long/phone/is_active edits do not trigger re-review (R6).
- `submit_shop_for_verification(p_shop_id uuid) returns public.shops` (definer): auth.uid() not
  null; shop owned by caller else 42501 `Shop not found.`; status in (pending, changes_requested)
  else P0001 `This shop cannot be submitted in its current status.`; set flag, update status
  pending + submitted_at now(), reset flag, return row. Grant authenticated only.
- `guard_verification_document_write()` + trigger `svd_guard_path_and_uploader` BEFORE INSERT OR
  UPDATE on shop_verification_documents, untrusted only: `split_part(storage_path,'/',1) =
  shop_id::text` else 42501; force `uploaded_by := auth.uid()` (S7).
- `is_verified_shop_owner(p_shop_id uuid) returns boolean` (stable, definer): caller role owner
  AND shop owned by caller AND `verification_status = 'approved'`. Consumed by W4/W7/W10.
- Rollback: drop the new triggers/functions; restore 2026_04_18:125-144 body verbatim (in block).

### 3.3 `2026_10_24_w2c_booking_write_guards.sql` (S1, E5, S2)
- `guard_booking_insert()` + trigger `bookings_guard_insert` BEFORE INSERT (untrusted): 42501 if
  `booking_status <> 'pending'`, `assigned_worker_id` not null or any `customer_rating_*` not null.
  The frontend payload (`booking_status: 'pending'`, SupabaseBookingRepository:238-250) passes.
- `guard_booking_update()` (definer, reads shops/workers past RLS) + trigger `bookings_guard_update`
  BEFORE UPDATE. Trusted or super_admin -> allow. Actor flags (a caller may hold several):
  customer = old.customer_id = auth.uid(); shop owner = shop of old.shop_id owned by auth.uid();
  assigned worker = workers row old.assigned_worker_id has user_id = auth.uid().
  Allowed keys (union over actor flags, plus `updated_at`); any other changed key -> 42501
  `This booking field cannot be changed.` (P2):

| Actor | Keys | Rule |
|---|---|---|
| customer | booking_status | pending -> cancelled only |
| customer | customer_rating_stars/comment/rated_at | old status completed, old stars null, new stars not null; rated_at := now() |
| shop owner | booking_status | pending -> accepted, pending -> rejected, accepted -> rejected |
| shop owner | assigned_worker_id | status in (pending, accepted); new value null or a workers row whose owner_id = shop owner (S2) |
| assigned worker | booking_status | accepted -> in_progress, in_progress -> completed |
| anyone | booking_status unchanged | no transition check |

  Any other status transition -> 42501 `This booking status change is not allowed.` Stars range
  stays with the existing CHECK (23514 path in J18 unaffected: the guard does not check range).
- Policies: `drop policy if exists "bookings_owner_select_local_test"` and
  `"bookings_owner_update_local_test"`; create `bookings_select_shop_owner` /
  `bookings_update_shop_owner` (same predicate as the local ones). Duplicates of unknown
  production owner policies are harmless (permissive OR); the column rules are in the trigger.
- Rollback: drop the 2 triggers/functions and 2 new policies (local stack: re-run baseline file).

### 3.4 `2026_10_24_w2d_workers_link_and_roster_guard.sql` (F6, S9, C8 part 1)
- FK: if no FK on workers.user_id, `add constraint workers_user_id_fkey foreign key (user_id)
  references profiles(id) on delete set null not valid`, then `validate constraint` inside a
  DO block catching `foreign_key_violation` -> NOTICE (orphans stay; new rows enforced).
- Partial unique `workers_owner_user_unique on workers(owner_id, user_id) where user_id is not
  null`: created only if no duplicates exist, else NOTICE (link RPC enforces it anyway, R5).
- `guard_worker_roster_write()` + trigger `workers_guard_write` BEFORE INSERT OR UPDATE, untrusted:
  INSERT requires caller role owner and `user_id is null` (42501 `Workers are linked only when
  the worker accepts a link code.`). UPDATE allowed keys: owner (old.owner_id = auth.uid()):
  name, phone_number, is_available, user_id -> null only; linked worker (old.user_id = auth.uid()):
  is_available only (S9); `user_id` null -> auth.uid() only with flag `washlink.roster_link` =
  row id; `user_id` -> null by the worker only with the same flag. Everything else 42501 (P2).
- `comment on table public.workers`: "Shop roster for booking assignment. A row or link is not a
  contract, employment or worker-owner relationship" (C8, W0-L7).
- Rollback: drop trigger/function/index/FK (`if exists`).

### 3.5 `2026_10_24_w2e_worker_roster_link_codes.sql` (C8 consent)
State machine (link code): `active` -> `consumed` (worker accepts) | `revoked` (owner issues a new
code, or row deleted via cascade) | `expired` (now() > expires_at, derived). Roster link:
`unlinked` -> `linked` (worker accepts code) -> `unlinked` (worker `unlink_my_roster_entry`, or
owner sets user_id null). Nobody else can perform any transition.
- `worker_roster_link_codes`: id uuid PK, worker_row_id -> workers on delete cascade, owner_id ->
  profiles on delete cascade, code_hash bytea not null unique, expires_at not null, created_at,
  consumed_at, consumed_by -> profiles on delete set null, revoked_at; CHECK not (consumed and
  revoked); partial unique (worker_row_id) where consumed_at is null and revoked_at is null.
- `worker_roster_link_attempts`: id, user_id -> profiles on delete cascade, attempted_at,
  succeeded bool; index (user_id, attempted_at). Both tables: RLS on, NO policies, revoke all
  from anon/authenticated (RPC only).
- RPCs (definer, grant authenticated): `create_roster_link_code(p_worker_row_id) returns table
  (link_code text, expires_at timestamptz)` (caller role owner, owns row, row unlinked; revokes
  older active codes; 12 upper hex chars from gen_random_uuid; 72 h; stores sha256 only).
  `preview_roster_link_code(p_code)` and `accept_roster_link_code(p_code)` (caller role worker)
  return `result text` in (valid or linked, invalid_or_expired, rate_limited,
  already_linked_to_owner); preview adds roster_display_name + owner_shop_names (approved and
  active shops only). They never raise on a bad code so the attempt row persists; more than 5
  failed attempts per user per hour -> rate_limited. `unlink_my_roster_entry(p_worker_row_id)
  returns void`. `list_my_roster_links() returns table(worker_row_id, roster_display_name,
  is_available, owner_shop_names text[])` (replaces the `.single()` lookup, F6).
- Rollback: drop the 5 functions and 2 tables (links already made stay; harmless).

### 3.6 `2026_10_24_w2f_worker_profiles.sql` (spec A worker profile)
- `worker_profiles`: profile_id uuid PK -> profiles(id) on delete cascade; headline text <= 120;
  experience_summary text <= 2000; years_of_experience smallint 0..60 null; skills text[] not null
  default '{}' cardinality <= 30; preferred_locations text[] not null default '{}' cardinality <= 10;
  availability_status text not null default 'flexible' CHECK in (full_time, part_time,
  weekends_only, flexible, not_available); availability_notes text <= 300; created_at, updated_at.
  No birthdate, address, ID numbers (data minimisation, W0-L6).
- `worker_private_contacts`: profile_id PK -> worker_profiles on delete cascade; contact_phone
  matching `^[+0-9 ()-]{7,20}$` or null; contact_email <= 254 matching a simple
  local@domain.tld pattern or null; preferred_contact_method CHECK in (phone, email, in_app) or
  null; created_at, updated_at.
- `normalize_worker_profile()` BEFORE INSERT OR UPDATE: trim, drop empty, dedupe (case-insensitive)
  skills/locations; item over 60 (skills) / 120 (locations) chars -> 23514; stamps updated_at.
  Same updated_at stamp trigger on contacts.
- RLS worker_profiles: `wp_select_self`, `wp_select_super_admin`, `wp_insert_self` (profile_id =
  auth.uid() and `current_user_profile_role() = 'worker'`), `wp_update_self`, `wp_delete_self`.
  RLS worker_private_contacts: `wpc_*_self` for select/insert/update/delete (no admin, no owner).
  Grants: select/insert/update/delete to authenticated; revoke all from anon.
  W5/W9 add narrow owner read via functions; W2 grants owners nothing.
- Rollback: drop both tables (irreversible data loss: export first; documented).

## 4. Test-harness hardening (S10, S11)
- `supabase/config.toml`: `[db.seed] enabled = false` in the repo; the stager rewrites it to
  `true` together with the staged seed path (refuses if the line is missing).
- Stray-SQL guard widened: refuse any `.sql` under `supabase/` except `migrations/*.sql` and
  `tests/database/*.sql` (replaces the `findSqlOutsideTestDatabase` scope).
- `test_helpers.sql` header: grants execute to anon/authenticated and contains act_as_service(),
  local stack only. Stager asserts staged `project_id` ends in `-local-test`; runner re-checks
  before every CLI call (exit 2).
- Stager tests (node --test): `stager_enables_seed_only_in_staged_copy`, `repo_config_seed_disabled`,
  `stager_rejects_sql_anywhere_under_supabase_outside_migrations_and_tests_database`,
  `repo_has_no_stray_sql_under_supabase`, `stager_staged_project_id_ends_with_local_test`,
  `runner_refuses_non_local_test_project_id`. Existing 12 stay green (18 total).
- Docs: update `docs/workforce/LOCAL_TEST_HARNESS.md` (13 migrations, 0 TODO, seed rule);
  add `docs/workforce/ROLE_AND_PROFILE_SECURITY.md` (P1-P8, guard matrix, D-10 checklist: the human
  dump must confirm the signup function, profiles/bookings/workers policies, enum vs CHECK, any
  trigger on auth.users that syncs metadata, duplicates in workers(owner_id, user_id)).

## 5. Frontend (UI -> hooks -> services -> repositories -> Supabase; files ≤ 350 lines)
Add:
- `domain/models/WorkerProfile.ts` (WorkerProfile, WorkerAvailabilityStatus, WorkerPrivateContact,
  SaveWorkerProfileInput), `domain/models/RosterLink.ts` (RosterLinkEntry, RosterLinkCodePreview,
  RosterLinkResult, IssuedRosterLinkCode), `domain/errors/DuplicateAccountError.ts`,
  `domain/utilities/workerProfileCompletion.ts` (pure: percent + missing sections).
- `domain/repositories/WorkerProfileRepository.ts`, `RosterLinkRepository.ts`;
  `infrastructure/repositories/SupabaseWorkerProfileRepository.ts` (fetchOwn, upsert profile,
  upsert contact, delete; `profile_id` always from the session, never from input),
  `SupabaseRosterLinkRepository.ts` (rpc: list_my_roster_links, create/preview/accept code, unlink).
- `application/validation/workerProfileSchemas.ts` (zod, mirrors DB limits);
  `application/services/WorkerProfileService.ts`, `RosterLinkService.ts`.
- Hooks: `useWorkerProfile` (load/save; loading, empty, error), `useWorkerProfileOnboarding`
  (step state + validation), `useMyRosterLinks` (list + selected entry), `useAcceptRosterLinkCode`
  (preview -> confirm -> result states), `useOwnerRosterLinkCode`, `useOwnerOnboardingChecklist`.
- `presentation/dependencyInjection/createWorkerProfileDependencies.ts`.
- UI `presentation/components/workerProfile/`: WorkerProfileOnboardingFlow, WorkerProfileAboutStep,
  WorkerProfileSkillsStep, WorkerProfileAvailabilityStep, WorkerPrivateContactStep (states the
  contact is visible only to the worker for now), WorkerProfileSummaryCard, WorkerProfileEditorModal.
- `presentation/components/worker/RosterLinkCodeForm.tsx` (shows roster name + shop names, explicit
  "Link my account" consent button; copy: linking lets this shop assign you bookings and is not a
  contract or employment record), `WorkerRosterEntryPicker.tsx` (Select, shown when > 1 entry).
- `presentation/components/owner/OwnerRosterLinkCodeButton.tsx` (on OwnerWorkerListItem for
  unlinked rows: issue code, show code + expiry once, copy button) and a linked badge.
- `presentation/components/onboarding/OwnerOnboardingChecklist.tsx` (account, shop registered,
  documents, submitted, approved; says verified shops unlock workforce features; no promises),
  rendered in OwnerDashboardContent next to OwnerShopSetupNotice.
- `features/auth/RolePickerGrid.tsx` (extracted; adds `worker`: "I want car wash work").
- `features/worker/WorkerWorkspaceGate.tsx`: no profile and no roster links -> onboarding flow;
  roster links but no profile -> jobs page + "Complete your worker profile" banner (existing
  manually linked workers are never blocked); otherwise jobs page + summary card.
Change:
- `AuthLandingForms.tsx` (use RolePickerGrid; currently 361 lines, must end ≤ 350),
  `useAuthLanding.ts` (worker branch; duplicate -> inline error with "Sign in" / "Reset password"
  actions; confirmation outcome -> "Check your email to confirm your account").
- `AuthRepository`/`SupabaseAuthRepository.signUp` return `SignUpOutcome`
  ('can_sign_in' | 'confirmation_required', from `data.session`); map `user_already_exists` /
  "already registered" and `data.user.identities.length === 0` to DuplicateAccountError.
  Role stays read only from the profiles row (S5); add a comment, never `user_metadata.role`.
- `AuthService` (`signUpWorker`), `AuthenticatedUserContext` (`signUpWorker`, outcome passthrough).
- `WorkerRepository`/`SupabaseWorkerRepository`/`WorkerService`: delete `fetchWorkerByUserIdentifier`
  (F6 `.single()`); Worker gains `isLinkedToAccount` (select `user_id`, map to boolean only).
- Delete `useWorkerProfileResolution.ts`; `WorkerJobsPage.tsx` takes the selected roster entry from
  `useMyRosterLinks`; `WorkerNoProfileNotice.tsx` embeds RosterLinkCodeForm.
- `SupabaseShopVerificationRepository.submitShopForVerification` -> rpc
  `submit_shop_for_verification` with `{ p_shop_id }` + select columns (F5). The shop edit form for
  approved shops warns that changing name/address sends the shop back for verification (S6).
  `App.tsx` routes the worker role to WorkerWorkspaceGate.
- `OwnerOnboardingFlow.tsx` is unreferenced (only AddShopModal reuses ShopSetupStep): leave untouched.

## 6. Tests (all TODO wrappers removed; any remaining `todo_start(` is a FAIL)
pgTAP j17: remove the 7 wrappers, keep the assertions unchanged, set plan(n) to the actual count.
Add `j17_metadata_update_cannot_change_profile_role` (S5: superuser rewrites raw_user_meta_data
role, profile unchanged), extend `j17_user_cannot_read_other_profiles_contact` (owner->customer,
worker->other user), `j17_other_users_cannot_read_worker_profile` (owner, customer, other worker 0;
super_admin 1), `j17_other_users_cannot_read_worker_private_contact` (super_admin also 0),
`j17_worker_profile_cannot_be_written_for_another_user`, `j17_customer_cannot_register_shop`,
`j17_is_verified_shop_owner_requires_own_approved_shop` (own approved true; own pending and
changes_requested false; approved shop of another owner false; customer and anon false),
`j17_approved_shop_identity_change_requires_rereview`, `j17_verification_document_path_bound_to_own_shop`
(foreign folder 42501; uploaded_by forced), `j17_owner_cannot_directly_resubmit_changes_requested_shop`
(direct UPDATE still P0001), `j17_submit_shop_rpc_rejects_other_owner`,
`j17_link_code_rpcs_reject_anon_and_wrong_roles`, `j17_owner_cannot_issue_link_code_for_other_owner_roster`,
`j17_link_tables_not_readable_by_clients`, `j17_trusted_session_false_for_end_users` (customer,
super_admin, anon false; service true), `j17_customer_cannot_cancel_accepted_booking`,
`j17_worker_cannot_skip_booking_status`.
pgTAP j18: rewrite F5 as `j18_owner_can_resubmit_after_changes_requested`: call the RPC as the
owner, assert status pending and submitted_at set. Add `j18_owner_can_accept_and_reject_pending_booking`,
`j18_owner_can_assign_own_roster_worker`, `j18_assigned_worker_can_progress_booking`,
`j18_owner_can_edit_approved_shop_phone_without_rereview`, `j18_super_admin_can_review_resubmitted_shop`,
`j18_customer_booking_insert_with_frontend_payload`, `j18_owner_can_add_unlinked_roster_worker`.
New pgTAP `j1_worker_registration_and_profile.test.sql`: `j1_worker_can_sign_up_with_worker_role`,
`j1_owner_can_sign_up_with_owner_role`, `j1_signup_unknown_role_defaults_to_customer`,
`j1_worker_can_create_own_profile`, `j1_worker_can_update_own_profile`,
`j1_worker_profile_rejects_invalid_values` (23514), `j1_worker_profile_normalizes_skills`,
`j1_non_worker_cannot_create_worker_profile`, `j1_worker_cannot_create_profile_for_another_user`,
`j1_worker_can_manage_own_private_contact`, `j1_worker_can_delete_own_profile`,
`j1_worker_can_link_roster_with_code`, `j1_roster_link_code_is_single_use_and_expires`,
`j1_roster_link_attempts_are_rate_limited`, `j1_worker_can_be_linked_to_multiple_owners`,
`j1_worker_cannot_link_twice_to_same_owner`, `j1_worker_can_unlink_own_roster_entry`,
`j1_owner_cannot_set_worker_user_id_directly`, `j1_roster_link_creates_no_worker_profile`.
`001_migration_replay`: the version list gains 20261024000001..06
(`replay_schema_migrations_has_baseline_and_w2`); the owner-policy assertions now check that
`*_local_test` is absent and `bookings_*_shop_owner` present. Fixtures stay synthetic
(`@local.test`, no real names or phones, no pay amounts).
Vitest (`*.j1.test.ts(x)`, `*.j17.test.ts`, `*.j18.test.ts`; mocked repos; no network):
`j1_worker_profile_service_validates_and_saves`, `j1_worker_profile_completion_reports_missing_sections`,
`j1_supabase_worker_profile_repository_uses_session_id`, `j1_use_worker_profile_loading_empty_error_states`,
`j1_worker_onboarding_flow_validates_and_submits`, `j1_role_picker_offers_worker`,
`j1_auth_service_sign_up_worker_sends_worker_role`, `j1_duplicate_account_shows_sign_in_guidance`,
`j1_sign_up_reports_confirmation_required`, `j1_use_my_roster_links_handles_multiple_entries`,
`j1_accept_roster_link_code_states`, `j1_worker_gate_does_not_block_linked_worker_without_profile`,
`j1_owner_onboarding_checklist_reflects_verification_status`,
`j17_auth_role_comes_from_profiles_row_not_user_metadata`, `j18_submit_shop_for_verification_uses_rpc`.
The existing 16 Vitest tests stay green (only mocks for the removed method change).

## 7. Check commands (repo root, local only)
`cd frontend && npm run lint`, `npm run build`, `npm test`;
`backend/.venv/Scripts/python.exe -m pytest -q`; `node --test scripts/supabase-test/stage-local-workdir.test.mjs`;
`node scripts/supabase-test/run-db-tests.mjs`; then `npx supabase stop --workdir .local-supabase-test --no-backup`.
RECORD: the orchestrator updates the LOOP.md check-suite note ("exactly 8 todo_start") to 0.

## 8. Acceptance criteria
| AC | Criterion | Evidence |
|---|---|---|
| AC1 | 6 new migrations named `2026_10_24_w2[a-f]_<snake>.sql`, each has `-- ROLLBACK`; committed migrations untouched | `ls supabase/migrations/2026_10_24_w2*`; `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_24_w2*` empty; `git diff --stat eb38246 -- supabase/migrations/2026_04_1* supabase/migrations/2026_10_2[12]*` empty |
| AC2 | Clean replay of 13 migrations | runner reset output; `replay_schema_migrations_has_baseline_and_w2` |
| AC3 | Zero TODO; suite PASS | `grep -c "todo_start(" supabase/tests/database/*.sql` all 0; runner output has 0 `Failed (TODO)`, 0 `TODO passed`, `Result: PASS` |
| AC4 | E1 | `j17_signup_cannot_self_assign_super_admin`, `j1_signup_unknown_role_defaults_to_customer` |
| AC5 | E2, S5 | `j17_profile_owner_cannot_change_role` (x2), `j17_metadata_update_cannot_change_profile_role`, `j17_auth_role_comes_from_profiles_row_not_user_metadata` |
| AC6 | E3/C3, S6, S7, F5 | `j17_owner_cannot_insert_preapproved_shop`, `j17_customer_cannot_register_shop`, `j17_approved_shop_identity_change_requires_rereview`, `j17_verification_document_path_bound_to_own_shop`, `j18_owner_can_resubmit_after_changes_requested` (RPC), `j17_owner_cannot_directly_resubmit_changes_requested_shop`, `j18_submit_shop_for_verification_uses_rpc` |
| AC7 | E5, S1, S2 | `j17_customer_cannot_change_quoted_price` (x5), `j17_assigned_worker_cannot_change_protected_booking_fields` (x6), `j17_customer_cannot_forge_booking_insert_fields` (x3), `j17_owner_cannot_assign_foreign_worker`, `j17_customer_cannot_cancel_accepted_booking`, `j17_worker_cannot_skip_booking_status` |
| AC8 | S4, S9, C8, F6 | `j17_user_cannot_read_other_profiles_contact`, `j17_worker_cannot_rewrite_roster_row` (x3), `j17_worker_can_toggle_own_availability`, `j1_owner_cannot_set_worker_user_id_directly`, `j1_worker_can_link_roster_with_code`, `j1_worker_can_be_linked_to_multiple_owners`, `j1_roster_link_creates_no_worker_profile`; `grep -rn "fetchWorkerByUserIdentifier" frontend/src` empty |
| AC9 | Gate helper | `j17_is_verified_shop_owner_requires_own_approved_shop` |
| AC10 | J1 worker profile | every `j1_*` pgTAP and Vitest name in section 6 passes |
| AC11 | J17 private data | `j17_other_users_cannot_read_worker_profile`, `j17_other_users_cannot_read_worker_private_contact`, `j17_worker_profile_cannot_be_written_for_another_user`, `j17_link_tables_not_readable_by_clients`, `j17_trusted_session_false_for_end_users` |
| AC12 | J18 regression | j18 pgTAP file `ok` incl. all section 6 additions; existing 16 Vitest pass; pytest `4 passed` |
| AC13 | Harness S10/S11 | 18/18 stager tests incl. the 6 names in section 4; `grep -A2 "^\[db.seed\]" supabase/config.toml` shows `enabled = false` |
| AC14 | Onboarding UI | `j1_role_picker_offers_worker`, `j1_duplicate_account_shows_sign_in_guidance`, `j1_sign_up_reports_confirmation_required`, `j1_worker_onboarding_flow_validates_and_submits`, `j1_owner_onboarding_checklist_reflects_verification_status`; lint and build exit 0 |
| AC15 | Size and safety | `wc -l` of every added/changed file ≤ 350; no `.env` read, no `--linked`/`db push`/`link`; `docs/workforce/ROLE_AND_PROFILE_SECURITY.md` has the D-10 checklist |

## 9. Rollback
Per-file `-- ROLLBACK` blocks, applied in reverse order (f to a), local stack only. Frontend: revert
the W2 commit. Data: worker_profiles, contacts and link tables are dropped (export first); roster
links made through codes remain valid rows. The enum value `worker` (if added) is irreversible and
harmless. Re-adding dropped `using (true)` profile policies re-opens S4 (do it only knowingly).

## 10. Risks and legal-review flags
- R1 (D-10, HIGH): production policies, signup function, role type and auth.users triggers are
  unknown. Mitigated by P1-P4; the human schema dump/diff checklist is mandatory before deploy.
- R2: the S4 DO block drops unknown `using (true)` profile SELECT policies in production; names are
  NOTICE-logged. A production feature reading other users profiles would break (none in repo).
- R3: RPC flags (`washlink.*` GUCs) rely on clients being unable to set custom GUCs (true for
  PostgREST). A future SECURITY DEFINER function that sets arbitrary GUCs would weaken this.
- R4: the GoTrue-session branch of the profile guard (silent restore) cannot be exercised locally
  (session_user cannot be switched in pgTAP); covered by review and the D-10 checklist.
- R5: if production has duplicate (owner_id, user_id) rows the unique index is skipped (NOTICE);
  the link RPC still prevents new duplicates.
- R6: S6 re-review covers name/address only; moving the map pin or the phone is not re-reviewed.
- R7: the booking guard may reject an undiscovered production client path (e.g. admin tools using
  end-user JWTs to edit bookings). J18 covers every frontend write path in the repo.
- R8: link codes are 48-bit, 72 h, single use, 5 failed tries per hour; shown once to the owner,
  who hands it to the worker out of band.
- Legal (to LEGAL_REVIEW_REGISTER in W13; no compliance claims in UI or docs):
  W2-L1 personal-data collection for worker profiles and private contacts (notice, consent,
  retention, deletion; extends W0-L6). W2-L2 roster-link consent wording, and that a link is not a
  contract or employment relationship (extends W0-L7). W2-L3 shop re-verification after identity
  edits and identity-document handling (with W0-L6).
