# Role and profile security (W2)

Scope: what the W2 migrations (`supabase/migrations/2026_10_24_w2a..w2f_*.sql`) enforce for
roles, profiles, shops, bookings, the worker roster and worker profiles. Everything below was
proven on the local Docker stack only (pgTAP, `docs/workforce/LOCAL_TEST_HARNESS.md`). It
says nothing about the production project until the D-10 checklist at the end is done.

## Design principles

| | Principle |
|---|---|
| P1 | Restrictions live in BEFORE triggers, not policies, so they hold whatever (unknown) RLS policies production has. Policies are only added; drops are by exact name with `if exists` (one exception: the S4 DO block, below). |
| P2 | "Everything else is immutable": bookings and workers compare `to_jsonb(new)` with `to_jsonb(old)` key by key against an allow-list per actor, so unknown production columns are protected without being named. Profiles use a block-list (`id`, `role`, `created_at`, any key containing `verif` or `admin`) so unknown user-editable columns (e.g. `avatar_url`) keep working. |
| P3 | Role values are compared as `role::text` (production `role` may be an enum). |
| P4 | `handle_new_user()` is not replaced (production name unknown). E1 is closed by a BEFORE INSERT trigger on `public.profiles` that fires for any signup function. |
| P5 | `public.is_trusted_db_session()` fails closed (fix cycle 1): true iff the JWT role is `service_role`, OR there are no `request.jwt` claims at all AND `session_user` is not `authenticator` (PostgREST), `supabase_auth_admin` (GoTrue) or `supabase_storage_admin` (Storage). True: SQL editor/psql/migrations, service_role requests, test `act_as_service()`. False: every end-user JWT (including super_admin), anon with or without a JWT, any other claims, GoTrue's DB session. GUC + `session_user` based, so correct inside SECURITY DEFINER code. |
| P6 | RPC-only transitions set a transaction-local flag (`washlink.submit_shop`, `washlink.roster_link`) to the row id; the guard trigger accepts the flag only for that row and only for the one transition; the RPC resets it before returning. PostgREST clients cannot set `washlink.*` GUCs (risk R3). |
| P7 | No pgcrypto: link codes come from `gen_random_uuid()`, hashes from built-in `sha256()`. |
| P8 | Every new function pins `set search_path = public, pg_temp` (since W3a / R-1; the storage helper `public, auth, pg_temp`; W3 PLAN P10: without `pg_temp` listed last, the temp schema is searched FIRST for relations); W3a re-pinned every W2 and pre-W2 definer function with `alter function` (bodies unchanged). Any later `create or replace` must keep this value (it resets proconfig); `revoke all ... from public, anon`; `grant execute ... to authenticated` only where the app calls it. Trigger functions are revoked from `authenticated` too (triggers do not need EXECUTE). |
| P9 | FK cascades (fix cycle 1, S-B1): every UPDATE guard first calls `public.is_orphaned_fk_set_null(table, old, new)`, true iff the ONLY changed columns are single-column FKs declared `on delete set null`, each going value -> null while the referenced row no longer exists. So deleting a customer, a linked worker account, a reviewing super admin, an owner (shops cascade) or a roster row with bookings in any status never fails, and the same null written by hand while the parent exists is still rejected. Internal (no client EXECUTE). |

## Guard matrix

| Object | Guard | Who may do what (end-user JWT sessions) |
|---|---|---|
| `profiles` INSERT | `profiles_sanitize_role_on_insert` (all sessions) | role kept only if `customer`/`owner`/`worker`, else `customer`. `super_admin` only via a trusted UPDATE (D-8). |
| `profiles` UPDATE | `profiles_guard_protected_columns` | Own row (existing `profiles_update_own`): any column except the P2 block-list. Block-list change -> 42501 `Your role and verification fields cannot be changed from the app.` (also for super_admin). GoTrue session (`supabase_auth_admin`): block-list changes are silently restored (S5, never breaks auth). |
| `profiles` SELECT | policies `profiles_select_own`, `profiles_select_super_admin` | Self and super_admin only (S4). |
| `shops` INSERT | `shops_guard_insert` | Owner accounts only (42501 `Only owner accounts can register a shop.`), always `pending` with no review fields (42501 `New shops start as pending verification.`). Super admin and trusted: unrestricted. |
| `shops` UPDATE | `shops_prevent_owner_verification_mutation` (replaced body) | `owner_id` frozen for every non-trusted session, super admin included (42501 `The owner of a shop cannot be changed.`). Super admin: a `verification_status` change stamps `verification_reviewed_by := auth.uid()`, `verification_reviewed_at := now()`; without a status change both keep their old values; client values are ignored, never rejected (C-B1a). Verification fields otherwise: super admin / trusted only (P0001, original text), except `submit_shop_for_verification()`. S6: a non-admin change of `name` or `address` on an approved shop sets it back to `pending` with `verification_submitted_at = now()`. Phone, pin and `is_active` are not re-reviewed (R6). |
| `job_openings` INSERT (W4) | `job_openings_guard_write` | Owner accounts only (42501 `Only owner accounts can create job openings.`), own shop only (42501 `You can create job openings only for your own shop.`), always `draft` (42501 `Job openings start as drafts.`); `owner_id` forced to the shop owner, stamps server-set; at most 50 non-archived per shop (23514). Super admin: rejected (owner role required). Trusted: unrestricted. |
| `job_openings` UPDATE (W4) | `job_openings_guard_write` + policy `jo_update_owner` | Owning owner only (others: 0 rows by RLS, or 42501 `Job opening not found.`). `id, shop_id, owner_id, created_at, first_published_at, status_changed_at` frozen; `status` only via `transition_job_opening()` (flag `washlink.job_opening_transition`); closed/archived read-only; published/paused keep the required fields and cannot get a past deadline. See `JOB_OPENINGS.md`. |
| `job_openings` DELETE / SELECT (W4) | `job_openings_guard_write`, policies `jo_*` | Delete: owner, drafts only (RLS `jo_delete_owner_draft`; cascades from shop / owner deletion pass). Select: owner (all own rows), worker (published rows of a shop with a recorded verification), super_admin (non-draft). Customers, anon, other owners: nothing. |
| `shop_verification_documents` INSERT/UPDATE | `svd_guard_path_and_uploader` | `split_part(storage_path,'/',1)` must equal `shop_id` (42501); `uploaded_by` forced to `auth.uid()` on INSERT, kept unchanged on UPDATE (S7, fix cycle 1). |
| `bookings` INSERT | `bookings_guard_insert` | `customer_id` forced to `auth.uid()`; must be `pending`, unassigned, unrated (42501) (S1). |
| `bookings` UPDATE | `bookings_guard_update` + `bookings_select_shop_owner` / `bookings_update_shop_owner` policies | See transitions below; any other changed column -> 42501 `This booking field cannot be changed.` (E5, S2). Super admin and trusted: unrestricted. |
| `workers` INSERT/UPDATE | `workers_guard_write` | Insert: owner accounts, `user_id` null. Owner: `name`, `phone_number`, `is_available`, `user_id -> null`. Linked worker: `is_available` (S9). Linking only through the link-code RPCs (C8). |
| `worker_profiles` | RLS `wp_*` | Worker self (insert needs role `worker`), super_admin read. Owners: nothing in W2 (W5/W9 add narrow functions). |
| `worker_private_contacts` | RLS `wpc_*_self` | Worker self only; no admin, no owner. |
| `worker_roster_link_codes`, `worker_roster_link_attempts` | RLS on, deny-all policies, no table privileges | RPC only. |
| `washlink_private.roster_link_code_pepper` | schema not exposed, no schema/table privileges, RLS on, deny-all policies | Read only by the definer hash function. |
| `workforce_audit_events` (W3b) | insert / update / delete / truncate triggers (all sessions), no client write privilege, deny-all write policies | INSERT only through `record_workforce_audit_event()` (internal; writer flag), never UPDATE, DELETE/TRUNCATE only on the trusted retention path. SELECT: super_admin only (`wae_select_super_admin`). See `AUDIT_AND_NOTIFICATIONS.md`. |
| `notifications` (W3c) | insert / update triggers (all sessions), no client write privilege, deny-all write policies | INSERT only through `enqueue_notification()` (internal). SELECT: recipient only. The only change is `read_at` null -> now(), through `mark_notifications_read()`. |
| AFTER triggers on `shops`, `workers`, `worker_roster_link_codes`, `worker_profiles`, `profiles` (W3d) | `shops_audit_verification`, `workers_audit_link`, `workers_audit_linked_delete`, `worker_roster_link_codes_audit_issue`, `worker_profiles_audit_delete`, `profiles_audit_role_change` | Write audit events (and two notification producers) after the W2 BEFORE guards accepted the change. They never change the row; FK cascades still pass (P9, `j17_w2_fix1_fk_cascades`, `j18_w3_flows`). |
| `is_verified_shop_owner(shop)` | gate helper (W4/W7/W10) | Caller is an owner account and owns the shop, AND `verification_status = 'approved'` AND `verification_reviewed_by` / `verification_reviewed_at` not null AND `is_active` (C-B1b, compliance N3 adopted as the default). Deleting the reviewing super admin nulls `reviewed_by` (P9), so the shop stops counting as verified until re-reviewed: deactivate reviewers rather than delete them. |

Booking status transitions (`guard_booking_update`):

| Actor | Allowed |
|---|---|
| customer (`customer_id = auth.uid()`) | `pending -> cancelled`; rating fields once, on a `completed` unrated booking (`customer_rated_at := now()`; star range stays with the CHECK, 23514) |
| shop owner (owns `shop_id`) | `pending -> accepted`, `pending -> rejected`, `accepted -> rejected`; `assigned_worker_id` while `pending`/`accepted`, null or own roster row |
| assigned worker (`workers.user_id = auth.uid()`) | `accepted -> in_progress`, `in_progress -> completed` |

Roster link: `unlinked -> linked` (worker accepts a code) `-> unlinked` (worker
`unlink_my_roster_entry`, or owner sets `user_id` null). Link code: `active -> consumed |
revoked | expired (derived)`. A link is not a contract, employment or worker-owner
relationship (`comment on table public.workers`, W0-L7).

## R2 audit: who reads other users' profiles (frontend/src, at eb38246)

Searched `frontend/src` for `from('profiles')`, embedded joins (`profiles!`, `owner:`,
`customer:`), `.rpc(`, `full_name`, `phone_number`, `customer_name`. Findings:

| Read | Source | Profiles of other users? |
|---|---|---|
| Session bootstrap | `SupabaseAuthRepository.fetchAuthenticatedUserProfile` (`select id, role, full_name, phone_number ... eq('id', user.id)`) | No, own row |
| Profile editor | `SupabaseProfileRepository.updateProfile` (update + returning, own id) | No, own row |
| Booking lists (customer, owner, worker, realtime) | `supabaseBookingSelectColumns`: `customer_name` is a bookings column | No profiles join |
| Owner roster list | `SupabaseWorkerRepository`: `workers.name`, `workers.phone_number` | No profiles join |
| Shop lists, admin verification queue | `SupabaseShopRepository`, `SupabaseShopVerificationRepository`: `shops.*` incl. `owner_id`, `verification_reviewed_by` ids | No profiles join |
| Backend (FastAPI) | no Supabase profiles access | n/a |

Result: no frontend flow reads another user's `profiles` row, so W2a adds no counterparty
policy, view or RPC (data minimisation). Counterparty names come from denormalised columns.
`j18_w2_profile_reads.test.sql` proves each of these reads for the right role and that
`profiles.phone_number` is visible only to its owner and super admins:
`j18_user_can_read_own_profile_for_session`, `j18_user_can_update_own_profile_name_and_phone`,
`j18_owner_booking_list_shows_customer_name`, `j18_owner_roster_list_shows_worker_names`,
`j18_assigned_worker_booking_list_shows_customer_name`, `j18_customer_booking_list_shows_shop_name`,
`j18_super_admin_can_read_profiles`, `j18_counterparty_phone_number_stays_private`.
If a future increment needs a counterparty display name, add a SECURITY DEFINER function that
returns only `full_name` for an existing booking/roster relationship; never widen the policy.

## Not enforced / out of scope

- Role change requests (customer -> worker etc.) are impossible from the app by design; a human
  runs a trusted UPDATE.
- E4 accepted as intended: owners may edit `verification_submitted_at` and `is_active`.
- The GoTrue silent-restore branch cannot run in pgTAP (R4); covered by review and the checklist.
- W2 wrote no audit events; W3 adds them (`AUDIT_AND_NOTIFICATIONS.md`). Rejected role changes are still not audited (the raise rolls the audit row back).
- R-2 resolved in W4 (`2026_10_24_w4b`): `approved_shop_names_for_owner()` (link-code preview, roster list), `is_verified_shop_owner()` and the worker read policy on `job_openings` all use `shop_has_recorded_verification()` (approved + reviewed_by + reviewed_at + active). Approved shops without a recorded review are no longer listed (D-10 row 22).
- Link codes (fix cycle 1): stored as `sha256(pepper || ':' || code)`. A server-side pepper (one 244-bit random row in `washlink_private`) was chosen over per-row salts because it keeps the hash an exact unique-index lookup; per-row salts would need a scan of all active codes. Rate limits per rolling hour: 5 failed attempts per user and 10 lookups of the same code hash by anyone (both return `rate_limited`), counted under a per-user `pg_advisory_xact_lock`; attempts older than the window are pruned in bounded `skip locked` batches on each call.
- `worker_profiles.availability_status` is NOT NULL without a default (fix cycle 1): an insert without it fails with 23502; the frontend always sends the chosen value.

## D-10 checklist (mandatory human step before any production apply)

A human takes a schema-only dump of the production project (read-only, outside this loop) and
diffs it against the local stack. Do not apply W2 (rows 1-16), W3 (rows 17-20), W4 (rows 21-23), W5 (rows 24-26), W6 (rows 27-32), W7 (rows 33-35) or W8 (rows 36-37) until every row is answered and recorded.

| # | Check | Why |
|---|---|---|
| 1 | Name, body and owner of the signup function and its trigger on `auth.users` (local: `handle_new_user` / `on_auth_user_created`). Does it insert into `public.profiles` (so `profiles_sanitize_role_on_insert` fires)? | E1, P4 |
| 2 | Every trigger on `auth.users` (insert AND update), especially any that syncs `raw_user_meta_data` into `profiles`, and the session it runs as. | S5; the guard silently restores block-listed columns for `supabase_auth_admin`, raises for others |
| 3 | `public.profiles` columns: is `role` text + CHECK or an enum (name)? Any column matching `%verif%` / `%admin%` that users must be able to edit (it would become read-only)? | P2, P3, D-9 |
| 4 | All `public.profiles` policies. Which `using (true)` policies will the W2a DO block drop (it NOTICE-logs each)? Does any production feature (outside this repo) read other users' profiles? | S4, R2 |
| 5 | All `public.bookings` policies and any other client (admin tools, scripts, edge functions) that updates bookings with an end-user JWT. | R7; the guard rejects unlisted columns/transitions |
| 6 | All `public.workers` policies; FK on `workers.user_id`; orphaned `user_id` values (W2d leaves the FK NOT VALID with a NOTICE). | S9, D-2 |
| 7 | Duplicates: `select owner_id, user_id, count(*) from public.workers where user_id is not null group by 1, 2 having count(*) > 1` (W2d skips the unique index with a NOTICE). | R5 |
| 8 | All `public.shops` and `shop_verification_documents` policies and triggers; any stored document path not starting with its `shop_id` folder. | E3, S6, S7 |
| 9 | Existing functions with the same names as W2 functions (`is_trusted_db_session`, `current_user_profile_role`, `is_verified_shop_owner`, `submit_shop_for_verification`, link-code RPCs). `create or replace` would overwrite them. | P1 |
| 10 | Any SECURITY DEFINER function that lets a caller set arbitrary GUCs (`set_config` with caller input). | R3 |
| 11 | Migration naming: the CLI parses `YYYY_MM_DD_*` as version `2026` (D-11). Decide renaming before any `db push`. | D-11 |
| 12 | Frontend deployed together with W2: F5 must use `rpc('submit_shop_for_verification')`, F6 must use `list_my_roster_links()`. | F5, F6 |
| 13 | Production must NOT assign `profiles.role` through any UPDATE that runs as `supabase_auth_admin` after signup (auth hook, trigger on `auth.users` update, metadata sync). `guard_profile_protected_columns` deliberately and silently reverts every block-listed change in that session (S5). Assign roles at signup (whitelisted) or with a trusted SQL / service_role UPDATE on `public.profiles`. | S5, D-8 |
| 14 | Audit approved shops without a super-admin reviewer before deploy: `select id, name, verification_reviewed_by, verification_reviewed_at from public.shops s where verification_status = 'approved' and (verification_reviewed_by is null or verification_reviewed_at is null or not exists (select 1 from public.profiles p where p.id = s.verification_reviewed_by and p.role::text = 'super_admin'));` Every hit is re-reviewed by a super admin (or knowingly accepted and recorded) before W2; after W2 they are not verified for `is_verified_shop_owner`. | C-B1 |
| 15 | `supabase_realtime` publication: not `FOR ALL TABLES`, and none of `worker_private_contacts`, `worker_profiles`, `worker_roster_link_*` in it (W2f drops them, or NOTICE-logs a FOR ALL TABLES publication). | W2-L1 |
| 16 | `washlink_private` schema: not in the PostgREST exposed schemas (`api.schemas`); the pepper row is created per database by W2e and is part of DB backups (treat backups as secret). Rotating it invalidates every active link code. | R8 |
| 17 | W3a (R-1): production signup function (row 1) and any other SECURITY DEFINER function not in the W3a list must also pin `search_path = public, pg_temp`. W3a now ABORTS if a listed signature is missing, and its final assertion aborts if any SECURITY DEFINER function in `public` / `washlink_private` lacks `pg_temp` (only the local-only `handle_new_user()` is excluded; the production signup function, if named differently, must be pinned first). | R-1, P8 |
| 18 | No pre-existing `public.notifications` / `public.workforce_audit_events` tables, `shop_verification_review_log` view, or same-named functions (`record_workforce_audit_event`, `enqueue_notification`, `mark_notifications_read`, `notification_*`, `audit_*`). `create table if not exists` would silently keep a different table. | W3 R1 |
| 19 | `supabase_realtime` excludes `notifications` and `workforce_audit_events` (W3b/W3c drop them, or NOTICE-log a FOR ALL TABLES publication). | W3 realtime decision |
| 20 | Columns read by the W3d producers exist with these names: `shops.{id, owner_id, name, address, verification_status, verification_submitted_at, verification_reviewed_by, verification_reviewed_at}`, `worker_roster_link_codes.{worker_row_id, expires_at}`, `workers.{id, owner_id, user_id, name}`, `worker_profiles.profile_id`, `profiles.{id, role}`. The W3d0 preflight migration (`2026_10_24_w3d0_producer_schema_preflight.sql`, staged right before w3d) aborts naming any missing column/function; without it a drift would break shop updates, unlinks and account deletions at run time (audit failures abort the action). | W3 review polish |
| 21 | No pre-existing `public.job_openings` table and no same-named functions (`shop_has_recorded_verification`, `transition_job_opening`, `job_opening_missing_publish_fields`, `job_openings_guard_write`, `job_openings_normalize`, `job_openings_audit`). The W4a preflight aborts if `public.job_openings` exists without a table comment starting `W4`; `create or replace` would silently overwrite same-named functions. | W4 R1 |
| 22 | R-2 behaviour change: run the row 14 query first. After W4b, approved shops without `verification_reviewed_by` / `verification_reviewed_at` disappear from the roster link preview and `list_my_roster_links` shop names, cannot publish job openings, and hide their published openings from workers until a super admin reviews them again. | R-2, W4 R3 |
| 23 | Columns / functions checked by the W4a preflight exist with these names: `shops.{id, owner_id, name, address, is_active, verification_status, verification_reviewed_by, verification_reviewed_at}`, `profiles.{id, role}`, `workforce_audit_events.{id, action, subject_type, subject_id, payload}`, `record_workforce_audit_event(text, text, uuid, uuid, jsonb)`, `is_verified_shop_owner(uuid)`, `approved_shop_names_for_owner(uuid)`, `current_user_profile_role()`, `is_trusted_db_session()`, `is_super_admin()`, `normalize_worker_text_list(text[], integer, text)`. | W4 R5 |
| 24 | No pre-existing `public.job_applications` table and no same-named functions (`job_opening_application_snapshot`, `job_applications_guard_write`, `job_applications_normalize`, `worker_has_applied_to_job_opening`, `is_current_job_opening_owner`, `job_application_notice_version`, `job_application_apply_checks`, `create_job_application`, `update_job_application_draft`, `delete_job_application_draft`, `transition_job_application`, `search_job_openings`, `applicant_profiles_for_job_opening`, `applicant_verified_certifications`, `job_applications_audit`, `job_openings_close_applications`, `job_openings_notify_applicants_on_pause`). The W5a preflight aborts if `public.job_applications` exists without a table comment starting `W5`; `create or replace` would silently overwrite same-named functions. | W5 R1 |
| 25 | Columns / functions checked by the W5a preflight exist with these names: every `job_openings` column copied into the application snapshot plus `id, shop_id, owner_id, status, updated_at, first_published_at, application_deadline`; `shops.{id, owner_id, name, address}`; `worker_profiles.{profile_id, headline, experience_summary, years_of_experience, skills, preferred_locations, availability_status, availability_notes, updated_at}`; `profiles.{id, role, full_name}` (owners see the trimmed `full_name` of applicants, D-13); `workforce_audit_events.{id, action, subject_type, subject_id}`; `record_workforce_audit_event(text, text, uuid, uuid, jsonb)`, `enqueue_notification_safely(uuid, text, text, text, text, text, uuid)`, `notification_safe_label(text, text)`, `shop_has_recorded_verification(uuid)`, `is_verified_shop_owner(uuid)`, `current_user_profile_role()`, `is_trusted_db_session()`, `transition_job_opening(uuid, text, text)`. | W5 R1, R9 |
| 26 | W5 changes to `job_openings`: the policy `jo_select_published_for_workers` is REPLACED (same name) so a worker also reads any non-draft opening they hold a sent application (`submitted_at` set) to (paused, closed, archived, or a shop that lost verification); three AFTER UPDATE triggers are added (`job_openings_close_applications` closes open applications when an opening moves to closed / archived, also from trusted SQL; `job_openings_notify_applicants_on_pause`; both sort after `job_openings_audit`). Check that production has no other policy or trigger on `job_openings` that conflicts, and that `supabase_realtime` excludes `job_applications`. | W5 R1, R2 |
| 27 | Before the W5 deploy, confirm that production `profiles.full_name` never holds an email address or a phone number (owners see the trimmed `full_name` of applicants through `applicant_profiles_for_job_opening`, D-13/D-14). Run as a trusted session: `select count(*) from public.profiles where full_name ~* '@' or full_name ~ '[0-9]{7,}' or full_name ~ '\+?[0-9][0-9 ()-]{8,}';` must be 0 (review and clean any hit with the account holder first). | W5 review D-10, fix cycle 1 |
| 28 | Deliberate widening (accept before deploy): `jo_select_published_for_workers` on `job_openings` lets a worker account read any NON-DRAFT opening (published, paused, closed, archived, or of a shop that lost verification) to which they hold a SENT application (`worker_has_applied_to_job_opening`: `submitted_at is not null`; drafts and closed drafts do not count). Purpose: applicants keep seeing the current version of what they applied to (the snapshot stays the record). It exposes no other opening, nothing to customers / owners / anon, and does not widen `shops` or `worker_profiles`. Owner notifications follow the current `shops.owner_id` and only when it equals the application's `owner_id`; a shop transfer repair must realign `job_openings.owner_id` and `job_applications.owner_id`. | W5 security re-review, fix cycle 1 |
| 29 | No pre-existing `public.training_*` table / view and no same-named functions (`is_current_training_program_owner`, `is_authorised_training_recorder`, `is_designated_training_trainer`, `worker_holds_training_enrollment`, `can_read_training_program`, `can_read_training_evidence`, `training_enrollment_terms_snapshot`, `training_progress_status`, `training_enrollment_is_completed`, `roster_worker_in_required_training`, every W6 RPC in `docs/workforce/TRAINING.md`). The W6a preflight aborts if any `public.training_*` relation exists without a comment starting `W6`; `create or replace` would silently overwrite same-named functions. | W6 R1 |
| 30 | Columns / functions checked by the W6a preflight exist with these names: `shops.{id, owner_id, name, address}`, `workers.{id, owner_id, user_id}`, `bookings.{id, shop_id, assigned_worker_id, booking_status}`, `worker_profiles.profile_id`, `profiles.{id, role, full_name}`, `job_applications.{id, shop_id, owner_id, worker_id, status}`, `workforce_audit_events.{id, action, subject_type, subject_id}`; `record_workforce_audit_event`, `enqueue_notification_safely`, `notification_safe_label`, `is_verified_shop_owner`, `shop_has_recorded_verification`, `current_user_profile_role`, `is_trusted_db_session`, `is_orphaned_fk_set_null`, `normalize_worker_text_list`. | W6 R1 |
| 31 | New BEFORE UPDATE trigger `bookings_guard_update_training_gate` (W6h, C7 gate, function `bookings_guard_training_assignment`; sorts after `bookings_guard_update`, whose body is unchanged). It refuses (23514) assigning a roster row of the booking shop's owner whose linked worker is mid-way through required training with that owner, and that worker starting the booking; trusted sessions bypass, super_admin does not. Check every production booking client (owner dashboard, any admin tool, scripts) for paths that assign workers or set `in_progress`, and that `booking_status` compares as text. | W6 R1, R2 |
| 32 | D-18 (orchestrator override): new BEFORE DELETE trigger `shops_remove_unenrolled_training_programs` on `shops` deletes the shop's training programs that have NO enrollment; programs with enrollments, their enrollments, attendance and assessments are kept with `shop_id` / `owner_id` set null (FK `on delete set null`, passed by `is_orphaned_fk_set_null` in the W6 guards) and `training_enrollments.program_id` is `on delete restrict`. Check production shop / account deletion paths (app, GoTrue, admin) for conflicts and confirm the retention decision with the W6-L5 legal review. | W6 D-18 |
| 33 | No pre-existing certification objects: production has no `public.certification*` table or view and no `public.shop_certification_policies` that W7 did not create (the w7a preflight aborts on any such relation whose comment does not start `W7`). If production already stores certificates anywhere else (another table, profile JSON, storage files), decide whether they are migrated, shown or ignored before W7 is applied; W7 never reads worker-entered qualification text. | W7 R1 |
| 34 | Columns / functions checked by the W7a preflight exist with these names: `shops.{id, owner_id, name, verification_status, verification_reviewed_by, verification_reviewed_at, is_active}`, `training_enrollments.{id, program_id, shop_id, owner_id, worker_id, status, accepted_at}`, `training_programs.{id, title, min_training_days, assessment_checklist, status}`, `training_assessments.{id, enrollment_id, result, assessed_by, assessor_role, assessor_display_name, assessed_on, items_met, checklist_snapshot, supersedes_id}`, `training_attendance_records.{id, session_date, supersedes_id}`, `job_openings.applicant_requirement`, `job_applications.submitted_at`, `worker_profiles.profile_id`, `profiles.full_name`; `training_enrollment_is_completed`, `training_enrollment_attended_days`, `lock_training_enrollment_for_recorder`, `is_current_training_program_owner`, `shop_has_recorded_verification`, `is_verified_shop_owner`, `job_application_apply_checks`, `applicant_verified_certifications`, `is_current_job_opening_owner`, `record_workforce_audit_event`, `enqueue_notification_safely`, `notification_safe_label`, `current_user_profile_role`, `is_orphaned_fk_set_null`. | W7 R1 |
| 35 | Two W5 function BODIES are replaced by `create or replace` in w7g with the same signatures: `applicant_verified_certifications(uuid)` (now returns current certificates; authorisation unchanged) and `job_application_apply_checks(uuid, uuid, uuid)` (every W5 check in the same order plus the D-20 refusal right after the deadline check). Diff both against production first: if production bodies differ from the w5c / w5d versions, the W7 replacement would silently drop those differences. The w7g ROLLBACK block holds the verbatim W5 bodies. Also confirm no production client relies on certification-required openings accepting applications without a certificate (D-12 -> D-20). | W7 R1, R3 |
| 36 | No pre-existing contract objects: production has no `public.contract_*` table, view or materialised view and no `public.worker_classification_options` that W8 did not create (the w8a preflight aborts on any such relation whose comment does not start `W8`). If production already stores contract or agreement text anywhere else (storage files, profile JSON, another table), decide whether it is migrated or ignored before W8 is applied; W8 never reads it. | W8 R1 |
| 37 | Columns / functions checked by the W8a preflight exist with these names: `profiles.{id, role, full_name}`, `workforce_audit_events.{id, action}`; `record_workforce_audit_event(text, text, uuid, uuid, jsonb)`, `current_user_profile_role()`, `is_super_admin()`, `is_trusted_db_session()`, `is_orphaned_fk_set_null(regclass, jsonb, jsonb)`. Also confirm production `supabase_realtime` is not FOR ALL TABLES (w8c aborts) and that the jsonb text form used as the hash canonical form (W8 R7) is the same server major version as the local stack before comparing stored hashes. | W8 R1, R7 |
| 38 | No pre-existing worker contract objects: production has no `public` relation or function named `worker_contract*`, `contract_version*`, `contract_acceptance*`, `contract_problem_term*`, `contract_acknowledgement*`, `retained_job_application*` (or containing `_worker_contract`) that W9 did not create (the w9a preflight aborts on any whose comment does not start `W9` or, for the W9 `contract_*` tables, `W8/W9 contract module (created by W9)`; that prefix keeps the committed w8a preflight passing when it is re-run). If production already stores worker agreements or acceptances anywhere else (storage files, profile JSON, another table, a paper process), decide whether and how they map to W9 before any apply; W9 never imports them. Also confirm no production function named like the W9 functions exists and that `supabase_realtime` is not FOR ALL TABLES (w9i aborts). | w9a preflight; w9c / w9i realtime exclusion |
| 39 | Columns / functions checked by the W9a preflight exist with these names: `profiles.{id, role, full_name}`, `shops.{id, owner_id, name, address}`, `worker_profiles.profile_id`, the W8 tables and `worker_classification_options.needs_extra_acknowledgement`, `job_applications.{status, submitted_at, shop_id, owner_id, worker_id, decided_at, opening_snapshot}`, `training_enrollments.{id, shop_id, owner_id, worker_id, program_id}`, `notifications.idempotency_key`; `render_contract_template_clause(text, jsonb)`, `contract_template_placeholders_in(text)`, `contract_template_normalize_text(text)`, `contract_template_clause_hash(...)`, `contract_template_checked_shop_terms(jsonb)`, `contract_template_shop_terms(uuid)`, `contract_template_latest_platform_version()`, `training_enrollment_is_completed(uuid)`, `training_enrollment_is_live(uuid)`, `shop_has_recorded_verification(uuid)`, `is_verified_shop_owner(uuid)`, `record_workforce_audit_event(...)`, `enqueue_notification_safely(...)`, `notification_safe_label(text, text)`, `is_trusted_db_session()`, `is_orphaned_fk_set_null(regclass, jsonb, jsonb)`, `current_user_profile_role()`, `is_super_admin()`. Production `job_applications` must not already carry an AFTER DELETE trigger named `job_applications_retain_accepted`, and `profiles.full_name` must not hold contact data (it is snapshotted into contracts and acceptance records, D-32). | w9a preflight |

## W5 job applications guard matrix (`2026_10_25_w5b`)

| Session | INSERT / UPDATE | DELETE | Snapshot change (P20) |
|---|---|---|---|
| anon, authenticated, service_role via PostgREST | no table privilege (42501); only the W5 RPCs write, under the row flag | no privilege; `delete_job_application_draft` for own drafts | never |
| W5 RPC (flag = row id) | allowed; immutable ids / owner / created_at; cover note only while draft | own never-sent row only (draft or closed draft, `submitted_at` null) | null -> value at submit only |
| Auto-close trigger (flag `opening:<id>`) | status -> closed only (drafts stay never-sent; owners never read rows with `submitted_at` null) | n/a | never |
| FK cascade (opening, worker profile, shop or owner profile gone) | n/a | allowed | n/a |
| Trusted SQL session (repair) | allowed, audited `trusted_session` | allowed | never (42501) |

## W6 training guard matrix (`2026_10_25_w6b`..`w6d`, `w6h`)

| Session | Programs / sessions / trainers / enrollments | Evidence (attendance, assessments) | Terms snapshot (P27) |
|---|---|---|---|
| anon, authenticated, service_role via PostgREST | no table privilege (42501); deny-all write policies; only the W6 RPCs write, under `washlink.training_write` = row id | no privilege; only the W6 evidence RPCs insert | never |
| W6 RPC (flag = row id) | allowed; ids, shop / owner, worker, snapshots and stamps frozen; program content only while draft; sessions only cancelled; designations only revoked | INSERT only; recorder identity, role, designation, display name and dates server-set | null -> value at acceptance only |
| Shop-removal trigger (flag `shop_removed:<shop>`) | deletes programs without enrollments (D-18) | n/a | never |
| FK set-null cascade (shop, owner, application, roster row gone) | allowed through `is_orphaned_fk_set_null` (nothing else may change) | n/a (no set-null FK) | never |
| FK cascade delete (worker profile / program gone) | enrollment: worker profile gone; sessions / designations: program or trainer gone | allowed only when the enrollment row is gone | n/a |
| Trusted SQL session (repair) | allowed, audited `trusted_session` (`program_id` RESTRICT protects enrollments) | UPDATE / DELETE / unflagged INSERT refused (42501) | never (42501) |
| Bookings (`bookings_guard_update_training_gate`) | read-only gate: assignment / start refused for a same-owner trainee mid-way through required training | n/a | n/a |

## W7 certification guard matrix (`2026_10_26_w7b`, `w7c`)

| Session | Certifications | Status events / re-assessments | Review requests | Policies |
|---|---|---|---|---|
| anon, authenticated, service_role via PostgREST | no table privilege (42501); deny-all write policies; only the W7 RPCs write | same | same | same |
| W7 RPC (flag `washlink.certification_write` = row id; certification id for events, shop id for policies) | INSERT: stamps, validity, expiry, status forced server-side (P32); UPDATE: only status, status_reason, status_changed_at / _by, updated_at; superseded is final | INSERT only; actor id / role and created_at server-set | INSERT open; UPDATE open -> reinstated / upheld / withdrawn once | upsert of validity_months; updated_by server-set |
| Trusted SQL session | NO bypass: issued facts immutable (42501 `Certification records cannot be edited.`); status change only with the flag (not tamper-proof, W6-L5 / R5) | UPDATE / DELETE always refused | flag required | flag required |
| FK set-null cascade (shop, owner, approver, decider gone) | allowed through `is_orphaned_fk_set_null` (D-18 / D-23, nothing else may change) | n/a | `decided_by` only | `updated_by` only |
| FK cascade delete | only when the worker profile or the enrollment row is already gone | only when the certification is gone | when the certification or worker profile is gone | when the shop is gone |

## W8 contract template guard matrix (`2026_10_26_w8b`, `w8c`, `w8d`)

| Session | Templates | Versions | Clauses | Reference data (sections, placeholders, classification options) |
|---|---|---|---|---|
| anon, authenticated, service_role via PostgREST | no table privilege (42501); deny-all write policies; only the W8 RPCs write | same | same | same |
| W8 RPC (flag `washlink.contract_template_write` = template id) | INSERT; UPDATE only of name, status, current_version_number (platform always active, CHECK) | INSERT only, numbered n+1, base must be a platform version; saved_by / role / txid / stamps forced | INSERT only in the transaction that inserted the version (P38); heading / body normalised, clause_hash server-computed | n/a |
| Trusted SQL session | NO bypass: flag required; platform template never deleted (42501) | UPDATE / DELETE always refused (42501 `Contract template versions cannot be edited.`); every new version re-validated by the DEFERRED commit validator (P39) | UPDATE / DELETE refused; no clause added to a sealed version | the only writer (migrations) |
| FK set-null cascade | `derived_from_version_id` only (lineage) | `saved_by` only (account gone) | n/a (RESTRICT) | n/a |
| FK cascade delete | only when the owner profile is gone (owner scope) | only when the template is gone | only when the version is gone | n/a |

## W9 worker contract guard matrix (`2026_10_26_w9b`..`w9d`, `w9i`)

| Session | Contracts | Versions | Clauses / flags | Acceptance records | Retained applications |
|---|---|---|---|---|---|
| anon, authenticated, service_role via PostgREST | no table privilege (42501); deny-all write policies; only the W9 RPCs write | same | same | same | same |
| W9 RPC (flag `washlink.worker_contract_write` = contract id) | INSERT (status draft, stamps forced); UPDATE of state columns, snapshots, dates; ids / parties / origin immutable; revision +1; DELETE only never-sent (or never accepted by a removed worker) | INSERT numbered n+1, lineage hashes copied from the referenced rows; draft inputs only while draft; sealing only under `washlink.worker_contract_seal` = version id with `sealed_txid = txid_current()`; after sealing only state / response stamps through the state machine | INSERT only while the version is being sealed in this transaction | INSERT only by the accepting party (`party_id = auth.uid()`, matching role and contract party); sealed hash; statement text, name, time and label set by the server | INSERT only by the AFTER DELETE trigger on `job_applications` |
| Trusted SQL session | status-column repair only (audited `trusted_session`, no notification) | NO bypass (42501 `Sent contract versions cannot be edited.`); a forged seal is re-checked by the DEFERRED commit validator | NO bypass | NO bypass: without a JWT it cannot insert one at all | NO bypass |
| FK set-null cascade (shop, owner, worker, application, enrollment, template version, creator, party gone) | allowed through `is_orphaned_fk_set_null`; w9i then stamps `*_removed_at` and applies D-32 / D-35 | `template_version_id`, `created_by` only | n/a | `party_id` only (name snapshot stays) | n/a |
| FK cascade delete | n/a (all party FKs set null) | only when the contract is gone | only when the version is gone | only when the contract or version is gone | when the worker profile is gone |

## Risks (from the W2 plan)

R1 unknown production schema (this checklist). R2 dropped open profile policies (NOTICE-logged).
R3 GUC flags rely on PostgREST not exposing `set_config`. R4 GoTrue branch untestable locally.
R5 duplicate roster links skip the unique index. R6 only name/address trigger re-review.
R7 the booking guard may reject an unknown client path. R8 link codes are 48-bit, 72 h, single
use, peppered hash, 5 failed tries per user and 10 lookups per code per hour.

Legal review flags (no compliance claims): W2-L1 worker profile and private contact data
(notice, consent, retention, deletion), W2-L2 roster-link consent wording and "not a contract
or employment relationship", W2-L3 shop re-verification and identity-document handling.
