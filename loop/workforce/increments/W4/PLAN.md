# W4 - Job openings (owner) - PLAN

Spec: B (owner job-opening management), A (verified shop before publishing), G, I (audit), J2, J3,
J17, J18. Depends on W3 (`passed`, STATE.md, HEAD 36784d6). Decisions needed: none new (D-3..D-7 do
not touch W4). D-10 (standing gate: local proof only) and D-11 (naming; staged 14-digit copies) apply.
Not BLOCKED. Closes carry-forward R-2 (W2/REVIEW.md). Respects C-W3-1 (audit payload key/string rules).

## 1. Scope / out of scope
In: `job_openings` table with every spec B field an owner enters; lifecycle draft -> published <->
paused -> closed -> archived enforced by a BEFORE trigger + one transition RPC; publish/resume gated
by `is_verified_shop_owner`; one shared verified-shop predicate used by the gate, by
`approved_shop_names_for_owner` (R-2) and by worker visibility; RLS; audit producers; owner UI (list,
create/edit with preview, confirmed transitions, loading/empty/error); pgTAP J2/J3/J17/J18, Vitest,
W4 API smoke; docs.
Out (with reason):
- Worker marketplace, search/filter, applications, applicant pipeline, shortlist/accept/reject -> W5
  (spec B "review applicants" needs `job_applications`). W4 only proves workers can READ published rows.
- Linking an opening to a W6 training program or W7 certification record: W4 stores the owner's
  text expectations and the `applicant_requirement` choice only; W6/W7 add FKs.
- Notifications: none in W4 (section 4). Super-admin moderation (takedown) -> W11. Auto-close on
  deadline (no scheduler exists) -> not done; deadline is checked at publish/resume/edit and by W5 apply.
- Any production apply, `.env` access, SQLAlchemy/Alembic tables (LOOP rule 2).

## 2. Design principles (continue P1-P14)
P15. One verified-shop rule: `shop_has_recorded_verification(shop)` = `verification_status =
     'approved'` AND `verification_reviewed_by` not null AND `verification_reviewed_at` not null AND
     `is_active`. `is_verified_shop_owner` = owner role AND owns shop AND that predicate.
     `approved_shop_names_for_owner` and the worker read policy use the same predicate (R-2).
P16. No invented content: no column describing pay, benefits, schedule or terms has a DEFAULT; empty
     means "not specified by the shop" and is displayed as such; nothing is derived, estimated or
     rounded. The UI never pre-fills these fields (a "Use shop address" button may copy the shop
     address into work location only on click).
P17. Status changes only through `transition_job_opening` (flag `washlink.job_opening_transition` =
     row id, P6 pattern); server stamps (`owner_id`, `first_published_at`, `status_changed_at`,
     `created_at`, `updated_at`) are never client-writable.
P18. Drafts are visible only to their owner (not to super_admin either).

## 3. Migrations (new files; staged 20261024000012..15; each ends with a `-- ROLLBACK` block)
All `2026_10_24_w4<x>_<snake>.sql` (LOOP rule 3, D-11). At most 350 lines each, idempotent,
`notify pgrst, 'reload schema';` last. Every new function: `set search_path = public, pg_temp`,
`revoke all ... from public, anon` (+ `authenticated` for trigger/internal functions).

### 3.1 `2026_10_24_w4a_job_openings_preflight.sql` (w3d0 pattern; creates nothing)
Abort naming every missing item: columns `shops.{id, owner_id, name, address, is_active,
verification_status, verification_reviewed_by, verification_reviewed_at}`, `profiles.{id, role}`,
`workforce_audit_events.{id, action, subject_type, subject_id, payload}`; functions
`record_workforce_audit_event(text,text,uuid,uuid,jsonb)`, `is_verified_shop_owner(uuid)`,
`approved_shop_names_for_owner(uuid)`, `current_user_profile_role()`, `is_trusted_db_session()`,
`is_super_admin()`, `normalize_worker_text_list(text[],integer,text)`. Also abort if
`public.job_openings` exists and its table comment does not start with `W4` (a foreign table
with that name, D-10 row 21). Rollback: nothing (asserts only).

### 3.2 `2026_10_24_w4b_shared_shop_verification_rule.sql` (R-2)
- New `shop_has_recorded_verification(p_shop_id uuid) returns boolean` (sql, stable, definer, pinned;
  grant execute to authenticated: RLS policies call it as the caller; it reveals only what the
  shops policy already shows for approved active shops).
- `create or replace` `is_verified_shop_owner(uuid)`: same signature, same result, body =
  `coalesce(current_user_profile_role() = 'owner', false) and exists (shop where id = p and owner_id =
  auth.uid()) and shop_has_recorded_verification(p)`; re-issue revoke/grant as in w2b.
- `create or replace` `approved_shop_names_for_owner(uuid)`: `where s.owner_id = p_owner_id and
  shop_has_recorded_verification(s.id)`; same return type and ordering; re-issue revoke (internal).
- Behaviour change (intended, R-2): roster-link preview / `list_my_roster_links` no longer list
  approved shops without a recorded review; the frontend label "verified, active shop" becomes true.
- Rollback: restore the w2b and w2d bodies verbatim with `set search_path = public, pg_temp`, then
  `drop function shop_has_recorded_verification(uuid)` (after w4c/w4d rollbacks).

### 3.3 `2026_10_24_w4c_job_openings.sql`
Table `public.job_openings` (comment starts `W4:`; audit rows keep no FK to it, P11):

| Column | Type / rule (no DEFAULT unless stated) |
|---|---|
| id | uuid PK default gen_random_uuid() |
| shop_id | uuid not null FK shops(id) on delete cascade; immutable |
| owner_id | uuid not null FK profiles(id) on delete cascade; forced to shops.owner_id on insert; immutable |
| status | text not null default 'draft' CHECK in (draft, published, paused, closed, archived) |
| title | text not null, 3..120 |
| description | text <= 4000 |
| duties | text[] not null default '{}' (empty list, not content), <= 20 items, each <= 200 |
| work_location | text <= 200 |
| openings_count | smallint CHECK 1..100 |
| job_type | text CHECK in (full_time, part_time, temporary, other): a schedule category, NOT a legal classification (W0-L3; W9 decides classification) |
| required_skills | text[] not null default '{}', <= 30 items, each <= 60 |
| minimum_years_experience | smallint CHECK 0..60 |
| experience_requirement / availability_requirement | text <= 500 / <= 300 |
| schedule_details | text <= 1000 |
| compensation_min_amount, compensation_max_amount | numeric(10,2), each > 0 and < 10000000; max >= min when both set |
| compensation_currency | text CHECK = 'PHP' |
| compensation_period | text CHECK in (hour, day, week, month, per_task) |
| (constraint) | `job_openings_compensation_complete`: an amount needs currency and period, and neither exists without an amount: `(min is null and max is null) = (currency is null) and (currency is null) = (period is null)` |
| compensation_details | text <= 500 (owner words, e.g. commission terms; displayed verbatim) |
| benefits | text <= 1000 |
| other_terms | text <= 2000 |
| minimum_qualifications, preferred_qualifications | text[] not null default '{}', <= 20 items, each <= 200 |
| required_training | text <= 1000 |
| applicant_requirement | text CHECK in (certification_required, trainees_welcome); "shop-issued certification", never government-recognized (W0-L5) |
| certification_expectations | text <= 500 |
| application_deadline | date (Asia/Manila calendar date; applications accepted through that day) |
| application_instructions | text <= 1000 |
| first_published_at, status_changed_at | timestamptz, server-stamped |
| created_at, updated_at | timestamptz not null default now(), server-stamped |

- Indexes: `(owner_id, status, updated_at desc)`, `(shop_id, status)`,
  `(first_published_at desc) where status = 'published'`.
- `job_opening_missing_publish_fields(public.job_openings) returns text[]` (stable invoker, pinned):
  names of null/empty among title, description, work_location, openings_count, job_type,
  applicant_requirement. The frontend mirrors the list (`w4_publish_readiness_matches_db_required_fields`).
- Normalisation BEFORE INSERT/UPDATE `job_openings_normalize` (invoker): trim, `nullif(..., '')`, lists
  via `normalize_worker_text_list` with labels (duty, skill, qualification); `updated_at := now()`.
- Guard BEFORE INSERT/UPDATE/DELETE `job_openings_guard_write` (definer; trusted sessions bypass):
  INSERT: role owner else 42501 `Only owner accounts can create job openings.`; shop owned by caller
  else 42501 `You can create job openings only for your own shop.`; status must be draft else 42501
  `Job openings start as drafts.`; force owner_id, created_at/updated_at := now(), stamps null; at most
  50 non-archived openings per shop else 23514 `A shop can have at most 50 job openings that are not
  archived.` UPDATE: caller must be owner_id with role owner else 42501 `Job opening not found.`;
  `id, shop_id, owner_id, created_at, first_published_at, status_changed_at` changed -> 42501 `This job
  opening field cannot be changed.`; status changed without the flag for this row -> 42501 `This job
  opening status change is not allowed.`; content changes when old status in (closed, archived) ->
  42501 `Closed or archived job openings cannot be edited.`; while published/paused the missing-fields
  list must stay empty (23514 `Complete the required job opening fields before publishing.`) and a
  changed deadline must be >= today in Asia/Manila (23514 `The application deadline has passed.`).
  DELETE: allowed if the shop or the owner profile no longer exists (cascade; same detection as
  `audit_roster_linked_delete`); else caller = owner and old.status = draft, else 42501 `Only draft job
  openings can be deleted.`
- RLS on; `revoke all on public.job_openings from public, anon`; `grant select, insert, update, delete
  to authenticated`. Policies: `jo_select_owner` (owner_id = auth.uid()); `jo_select_published_for_workers`
  (`current_user_profile_role() = 'worker' and status = 'published' and
  shop_has_recorded_verification(shop_id)`); `jo_select_super_admin_non_draft` (`is_super_admin() and
  status <> 'draft'`); `jo_insert_owner` (with check owner_id = auth.uid()); `jo_update_owner` (using /
  with check owner_id = auth.uid()); `jo_delete_owner_draft` (owner_id = auth.uid() and status = 'draft').
  Customers, anon and other owners: no rows. A published opening of a shop that loses verification
  (decision, S6 identity reset, deactivation, reviewer deletion) stays `published` but is invisible to
  workers until re-verified; resuming after a pause needs verification again.
- Realtime: drop from `supabase_realtime` if present; NOTICE on FOR ALL TABLES (w2f pattern).
- Rollback: drop policies, triggers, functions, table (irreversible data loss; export first).

### 3.4 `2026_10_24_w4d_job_opening_transitions_and_audit.sql`
`transition_job_opening(p_job_opening_id uuid, p_from_status text, p_to_status text) returns
public.job_openings` (plpgsql, definer, pinned; grant authenticated only). Row `for update`; not found
or caller is not its owner (role owner) -> 42501 `Job opening not found.` (no existence leak);
`status <> p_from_status` -> 55000 `This job opening changed. Refresh and try again.`; pair not in the
matrix -> 42501 `This job opening status change is not allowed.`; to published: 42501 `Only a verified
shop can publish job openings.` unless `is_verified_shop_owner(shop_id)`, then 23514 missing fields,
then 23514 deadline passed. Sets the flag, updates `status`, `status_changed_at = now()`,
`first_published_at = coalesce(first_published_at, now())`, resets the flag, returns the row.

| From | To | Who | Condition |
|---|---|---|---|
| draft | published | owning owner | verified shop (P15), no missing fields, deadline null or >= today (Manila) |
| published | paused | owning owner | none |
| paused | published | owning owner | same as publish |
| published | closed | owning owner | none |
| paused | closed | owning owner | none |
| closed | archived | owning owner | none |
| draft | (row deleted) | owning owner | DELETE, draft only |

Anything else (same-status, backwards, reopening closed, un-archiving, draft -> closed/archived) is
rejected for every end user incl. super_admin. Trusted SQL sessions bypass the guard (support/repair;
audited as `trusted_session`). Closed and archived are terminal for content.

Audit producer `job_openings_audit` AFTER INSERT/UPDATE/DELETE (definer, pinned, internal);
subject_type `job_opening`, subject_id id, subject_profile_id owner_id; payload values are ids, status
words and column NAMES only (never titles, descriptions, amounts, terms; C-W3-1 keys and 120-char rule):

| Event | Action | Payload |
|---|---|---|
| insert | `job_opening.created` | shop_id, status |
| status change | `job_opening.status_changed` | shop_id, from_status, to_status |
| content change while not draft (status unchanged) | `job_opening.updated` | shop_id, status, changed_fields |
| delete | `job_opening.deleted` | shop_id, from_status, deleted_by = owner_account_deleted / shop_deleted / owner / trusted_session (checked in that order) |

Draft content edits are not audited (noise). A rejected transition writes nothing (rollback; known W3
limitation). Final block: the w3a pin assertion (every SECURITY DEFINER function in public /
washlink_private pins `pg_temp`, `handle_new_user` excluded) is repeated and aborts on a miss.
Rollback: drop the trigger, the audit function and the RPC (audit rows stay).

## 4. Notification decision
None in W4. Every W4 transition is the owner acting on their own opening; there is no counterparty
until W5 applications exist. W5/W12 notify applicants when an opening they applied to is paused or
closed (spec C "clear feedback"), keyed `job_opening:<id>:<audit_id>`. Test
`w4_job_opening_actions_enqueue_no_notifications` proves no row is written.

## 5. Tests (pgTAP `plan(n)` = actual count; 0 `todo_start(`; every file <= 350 lines)
Seed helpers (`scripts/supabase-test/baseline/test_helpers.sql`, seed only, never a migration):
`test_helpers.create_verified_shop(p_owner uuid, p_reviewer uuid)` (approved + reviewed_by +
reviewed_at, as trusted session) and `test_helpers.create_job_opening(p_shop uuid, p_title text)`
(complete draft). R-2 fixture impact: `j1_worker_registration_and_profile.test.sql` line 26 switches its
fixture to `create_verified_shop` (assertion `j1_worker_can_link_roster_with_code` unchanged: still 1
name). No other existing assertion changes.

New `j2_owner_can_create_and_manage_only_own_job_openings.test.sql` (J2):
`j2_owner_can_create_draft_for_own_shop`, `j2_owner_can_create_draft_while_shop_unverified`,
`j2_owner_cannot_create_opening_for_another_owners_shop`, `j2_customer_and_worker_cannot_create_openings`,
`j2_insert_forces_owner_and_server_stamps`, `j2_owner_can_edit_own_draft`,
`j2_owner_can_delete_own_draft_only`, `j2_owner_cannot_read_another_owners_openings` (all statuses),
`j2_owner_cannot_update_another_owners_opening` (0 rows or 42501, row unchanged),
`j2_owner_cannot_delete_another_owners_opening`, `j2_owner_cannot_transition_another_owners_opening`,
`j2_owner_cannot_move_opening_to_another_shop`, `j2_server_stamps_cannot_be_forged`,
`j2_drafts_never_visible_to_others` (other owner, worker, customer, super_admin, anon),
`j2_published_opening_visible_to_workers_only` (worker yes; customer, anon, other owner no; super_admin yes),
`j2_compensation_is_optional_and_stored_as_entered`, `j2_compensation_columns_have_no_default`
(information_schema: no column_default on any pay/benefit/schedule/terms column),
`j2_compensation_requires_currency_and_period_with_amount` (23514 each way; max < min 23514),
`j2_text_and_list_limits_enforced`, `j2_opening_limit_per_shop`.
New `j2_job_opening_lifecycle.test.sql` (J2 lifecycle):
`j2_owner_can_pause_resume_close_archive_own_opening`, `j2_disallowed_transitions_rejected` (every pair
outside the matrix, incl. same-status and closed -> published), `j2_stale_transition_rejected` (55000),
`j2_status_only_changes_through_transition_rpc` (direct UPDATE of status by owner: 42501),
`j2_closed_and_archived_openings_are_read_only`, `j2_published_edit_keeps_required_fields`,
`j2_published_edit_cannot_set_past_deadline`, `j2_audit_written_on_create_transition_update_delete`,
`j2_draft_edits_write_no_audit_event`, `j2_audit_payload_has_no_opening_content` (title, description,
amount and benefits text absent from `payload::text`), `w4_job_opening_actions_enqueue_no_notifications`.
New `j3_unverified_owner_cannot_publish_job_openings.test.sql` (J3, job-opening part; the
certification part of J3 is W7):
`j3_pending_shop_owner_cannot_publish`, `j3_rejected_shop_owner_cannot_publish`,
`j3_changes_requested_shop_owner_cannot_publish`, `j3_approved_without_recorded_review_cannot_publish`,
`j3_approved_without_review_time_cannot_publish`, `j3_inactive_shop_cannot_publish`,
`j3_verified_owner_can_publish`, `j3_unverified_owner_cannot_resume_paused_opening`,
`j3_non_owner_roles_cannot_publish` (customer, worker, super_admin, anon, other verified owner),
`j3_cannot_publish_incomplete_opening`, `j3_cannot_publish_with_past_deadline`,
`j3_direct_status_update_cannot_bypass_verification`, `j3_insert_as_published_rejected`,
`j3_published_opening_hidden_when_shop_loses_verification` (admin sets changes_requested; worker sees 0,
owner still sees it, status unchanged), `j3_shop_identity_edit_hides_published_opening_until_rereviewed`
(S6), `j3_reviewer_deletion_hides_published_opening`, `j3_rejected_publish_writes_no_status_event`.
New `j17_w4_job_opening_authorization.test.sql` (J17):
`j17_job_openings_rls_enabled_and_anon_has_no_privileges`, `j17_transition_rpc_denied_to_anon`,
`j17_job_opening_internal_functions_not_client_executable` (guard, normalise, audit),
`j17_super_admin_cannot_write_job_openings`, `j17_w4_definer_functions_pin_pg_temp_last`,
`j17_job_openings_not_in_realtime_publication`, `j17_shared_verified_rule_matches_gate_and_shop_names`
(R-2 matrix: approved+reviewed+active, no reviewer, no reviewed_at, inactive, pending,
changes_requested, rejected), `j17_approved_shop_names_require_recorded_review` (preview and
`list_my_roster_links`), `j17_shop_deletion_cascades_openings_and_keeps_audit`,
`j17_owner_account_deletion_cascades_openings`, `j17_trusted_session_can_repair_job_opening_status`.
New `j18_w4_flows.test.sql` (J18): `j18_owner_can_still_edit_and_delete_shop_with_openings`,
`j18_super_admin_review_still_works_with_shared_rule`, `j18_roster_link_preview_still_lists_verified_shop`,
`j18_booking_quote_and_creation_unaffected_by_w4`.
Changed `001_migration_replay.test.sql`: version list gains 20261024000012..15 (assertion renamed
`replay_schema_migrations_has_baseline_w2_w3_w4`), add `replay_w4_job_openings_rls_enabled`. Every
other existing file stays green with unchanged assertions (J18 kept green).
Smoke `scripts/supabase-test/w4-api-smoke.mjs` (W3 smoke safety rules: loopback only, keys from
`supabase status` in memory, synthetic `@local.test` users deleted): anon read gets 0 rows or an error;
owner inserts a draft via PostgREST; `rpc('transition_job_opening')` publish fails with `Only a
verified shop can publish job openings.`; admin approves the shop; publish succeeds; worker lists 1,
customer 0, other owner 0; other owner's update changes 0 rows and its RPC gets 42501; direct status
PATCH fails; pause/resume/close/archive succeed; draft delete works, published delete fails; the owner
has no notification rows from these actions. Must end `0 failed`.
Vitest (mocked repositories/client, no network; files `*.j2.test.ts(x)`, `*.j3.test.ts(x)`, `*.w4.test.ts(x)`):
`w4_supabase_job_opening_repository_selects_explicit_columns`,
`w4_job_opening_repository_transition_uses_rpc_with_expected_status`,
`j17_job_opening_repository_never_sends_owner_id_status_or_stamps_on_save`,
`w4_job_opening_schema_requires_title_and_mirrors_db_limits`, `w4_job_opening_schema_rejects_amount_without_period`,
`w4_publish_readiness_matches_db_required_fields`, `j2_job_opening_lifecycle_offers_only_allowed_transitions`,
`w4_compensation_display_shows_only_entered_values` (no rounding, no range invented from one value),
`w4_compensation_display_says_not_specified_when_empty`,
`w4_job_opening_form_has_no_prefilled_compensation_benefits_or_schedule`,
`w4_use_owner_job_openings_loading_empty_error_states`,
`w4_use_owner_job_openings_transition_refreshes_and_reports_errors`,
`w4_job_opening_preview_matches_entered_values`,
`w4_transition_requires_confirmation_before_publish_pause_close_archive_delete`,
`j3_publish_action_disabled_with_reason_for_unverified_shop`. The existing 46 stay green.

## 6. Frontend (UI -> hooks -> services -> repositories -> Supabase; each file <= 350 lines)
Add: `domain/models/JobOpening.ts` (unions for status, job type, period, applicant requirement;
`JobOpening`, `SaveJobOpeningInput`, `jobOpeningLimits` mirroring the DB);
`domain/utilities/jobOpeningLifecycle.ts` (`allowedJobOpeningTransitions`, `listMissingPublishFields`);
`domain/repositories/JobOpeningRepository.ts` (`listOwnJobOpenings`, `createDraft(shopId, input)`,
`updateJobOpening(id, input)`, `deleteDraft(id)`, `transition(id, from, to)`,
`isShopVerifiedForPublishing(shopId)` via `rpc('is_verified_shop_owner')`);
`infrastructure/supabase/supabaseJobOpeningRow.ts` (row type, explicit column list, mappers);
`infrastructure/repositories/SupabaseJobOpeningRepository.ts` (never sends owner_id, status or stamps;
errors via `toUserFacingError`); `application/validation/jobOpeningSchemas.ts` (zod, the
`optionalText` / `textList` style of workerProfileSchemas); `application/services/JobOpeningService.ts`;
`presentation/utilities/jobOpeningDisplay.ts` (status labels; `formatCompensationAsEntered`:
"PHP 600.00 per day", "PHP 500.00 - 700.00 per day", "From PHP 500.00 per day", "Up to PHP 700.00 per
day", details verbatim, else "Not specified by the shop"; disclaimer "Details as entered by the shop.
WashLink does not verify pay or employment terms.");
`presentation/hooks/useOwnerJobOpenings.ts` (list, per-shop publish eligibility, loading / error /
empty, transition and delete with refresh); `presentation/hooks/useJobOpeningEditor.ts` (form state,
field errors, save, preview toggle);
`presentation/components/owner/jobOpenings/`: `OwnerJobOpeningsPanel.tsx` (status filter tabs, shop
name per row, "New job opening"; Skeleton while loading; `LoadErrorNotice` with retry; EmptyState "No
job openings yet", or "Add a shop first" with no shop; notice "You can save drafts now. Publishing
needs an approved shop verification." for unverified shops), `JobOpeningListItem.tsx`,
`JobOpeningStatusBadge.tsx`, `JobOpeningEditorModal.tsx`, `JobOpeningBasicsSection.tsx`,
`JobOpeningRequirementsSection.tsx`, `JobOpeningPayAndTermsSection.tsx`,
`JobOpeningApplicationSection.tsx` (required-for-publish markers; labelled inputs; errors via
`aria-describedby`), `JobOpeningPreview.tsx` (worker-facing view, reused by W5; banner "Preview -
workers see this after you publish"), `JobOpeningTransitionConfirmModal.tsx` (publish "Workers will be
able to see this opening"; pause "Hidden from workers until you resume it"; close "Closing is final.
It cannot be reopened; you can archive it later"; archive; delete draft; saving a published opening
warns "Changes are visible to workers immediately").
Change: `OwnerDashboardContent.tsx` (tab `jobs` "Job openings"), `createDashboardDependencies.ts`
(`jobOpeningService`), `features/owner/OwnerDashboardPage.tsx`, `supabaseErrorMessages.ts` (the 13 W4
messages of section 3). Publish/resume are disabled with the reason when the shop is not verified or
fields are missing; the database stays the authority (J3).

## 7. Docs
Add `docs/workforce/JOB_OPENINGS.md` (fields, P15-P18, lifecycle matrix, RLS, display rule,
limitations). Update `ROLE_AND_PROFILE_SECURITY.md` (guard matrix rows; R-2 resolved; D-10 row 21 no
pre-existing `job_openings` / same-named functions; row 22 R-2 behaviour change, run the row 14 query
first; row 23 w4a preflight columns), `AUDIT_AND_NOTIFICATIONS.md` (4 job_opening actions),
`LOCAL_TEST_HARNESS.md` (22 migrations, new files and counts, W4 smoke). RECORD adds the W4 smoke row
to the LOOP.md check suite.

## 8. Check commands (repo root, local only)
`cd frontend && npm run lint`, `npm run build`, `npm test`; `backend/.venv/Scripts/python.exe -m pytest -q`;
`node --test scripts/supabase-test/stage-local-workdir.test.mjs`; `node scripts/supabase-test/run-db-tests.mjs`;
`node scripts/supabase-test/w2-api-smoke.mjs`, `w3-api-smoke.mjs`, `w4-api-smoke.mjs`; then stop the
stack with `--workdir .local-supabase-test --no-backup`.

## 9. Acceptance criteria
| AC | Criterion | Evidence |
|---|---|---|
| AC1 | 4 new migrations `2026_10_24_w4[a-d]_<snake>.sql`, each with `-- ROLLBACK`; no committed migration changed | `ls supabase/migrations/2026_10_24_w4*`; `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_24_w4*` empty; `git diff --name-status 36784d6 -- supabase/migrations` only `A` lines |
| AC2 | Clean replay of 22 migrations; suite PASS, 0 TODO | runner output `Result: PASS`; `replay_schema_migrations_has_baseline_w2_w3_w4`, `replay_w4_job_openings_rls_enabled`; `grep -c "todo_start(" supabase/tests/database/*.sql` all 0 |
| AC3 | J2: own openings only, lifecycle matrix | every `j2_*` pgTAP name in section 5; Vitest `j2_job_opening_lifecycle_offers_only_allowed_transitions` |
| AC4 | J3: publish/resume need a verified shop; lost verification hides | every `j3_*` pgTAP name; Vitest `j3_publish_action_disabled_with_reason_for_unverified_shop` |
| AC5 | No invented pay/terms | `j2_compensation_columns_have_no_default`, `j2_compensation_is_optional_and_stored_as_entered`, `w4_compensation_display_*`, `w4_job_opening_form_has_no_prefilled_compensation_benefits_or_schedule` |
| AC6 | Drafts private | `j2_drafts_never_visible_to_others`, `j2_published_opening_visible_to_workers_only` |
| AC7 | R-2 aligned | `j17_shared_verified_rule_matches_gate_and_shop_names`, `j17_approved_shop_names_require_recorded_review`, `j18_roster_link_preview_still_lists_verified_shop` |
| AC8 | Audit without content; no notification | `j2_audit_written_on_create_transition_update_delete`, `j2_draft_edits_write_no_audit_event`, `j2_audit_payload_has_no_opening_content`, `j3_rejected_publish_writes_no_status_event`, `w4_job_opening_actions_enqueue_no_notifications` |
| AC9 | J17 additions (privileges, pinning, realtime, cascades) | every `j17_*` name in `j17_w4_job_opening_authorization.test.sql` |
| AC10 | PostgREST surface | `w4-api-smoke.mjs` ends `0 failed`; W2 smoke `48 passed, 0 failed`; W3 smoke `33 passed, 0 failed` |
| AC11 | Frontend | the 15 Vitest names pass; existing 46 pass; lint and build exit 0; `grep -rn "service_role" frontend/src` empty |
| AC12 | J18 regression | every pre-W4 pgTAP file `ok`; `git diff 36784d6 -- supabase/tests/database/j1_*` shows only the fixture line; `j18_w4_flows` names pass; pytest `4 passed`; stager 18/18 |
| AC13 | Size and safety | `wc -l` of every added/changed file <= 350; no `.env` read; no `db push`/`--linked`/`link`; `git diff --stat 36784d6 -- backend` empty; section 7 docs exist |

## 10. Rollback
Per-file `-- ROLLBACK` blocks in reverse order d, c, b, a; local stack only. d: drop audit trigger,
audit function, RPC (audit rows stay). c: drop policies, triggers, functions, table (data loss; export
first with a trusted `copy`). b: restore the w2b/w2d bodies (pinned), drop
`shop_has_recorded_verification` (re-opens R-2). a: nothing. Frontend: revert the W4 commit.

## 11. Risks and legal-review flags
- R1 (D-10): production may have a `job_openings` table or same-named functions; w4a aborts; rows 21-23.
- R2: editing a published opening changes what earlier applicants saw. Carry-forward C-W4-1 -> W5:
  snapshot the displayed opening fields on each application (immutable).
- R3: R-2 changes roster preview output for approved-but-unreviewed shops (intended; D-10 row 14).
- R4: the deadline is a Manila calendar date with no auto-close; W5 apply must refuse after it.
- R5: an audit failure aborts the action, incl. shop/account deletion cascades; w4a mitigates.
- R6: the transition flag relies on PostgREST not exposing `set_config` (W2 R3; smoke checks).
- R7: the worker policy calls a definer predicate per row (fine at W4 volume; W5 may add a view).
- R8: owner free text is length-checked only; no content moderation until W11.
- Legal (to LEGAL_REVIEW_REGISTER in W13; no compliance claims in UI or docs): W4-L1 pay, benefits and
  terms are owner-entered and shown verbatim; nothing checks them against wage orders or labor
  standards; review whether postings need disclosures or validation. W4-L2 `job_type` is a schedule
  category; classification is never decided by a posting (W0-L3, W9). W4-L3 `trainees_welcome` and
  required-training text must not advertise unpaid work as training; W6 adds the free-training notice
  (W0-L2). W4-L4 discriminatory requirements in free text (e.g. age under RA 10911, sex) are not
  filtered; review moderation duties. W4-L5 "certification required" means shop-issued only (W0-L5).
  W4-L6 retention of deleted/archived openings and their audit rows (with W3-L1).
