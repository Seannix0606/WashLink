# W5 - Marketplace & applications - PLAN

Spec: C (worker discovery and applications), B ("review applicants ... record decisions ... notify"), A (private contacts protected), D
free-training notice (C7), G, I, J4, J5, J17, J18. Depends on W4 (`passed`, STATE.md, HEAD 50cb850). Decisions needed: none open (D-3..D-7 start
at W6+). D-10 (local proof only) and D-11 (staged 14-digit copies) apply. Not BLOCKED. Closes carry-forwards C-W4-1 (snapshot), W4 R4 (deadline),
C7 (notice before openings and before applying), W2-L5 copy (owner access becomes real). Records W4-L10 in the legal register (status OPEN; the
loop cannot resolve it).

## 1. Scope / out of scope
In: `job_applications` (RPC-only writes, BEFORE guard, RLS); state machine in one DB function; immutable opening snapshot at submit; apply
refusals (deadline, status, P15 shop, role, profile, duplicates, limits); auto-close on opening close; applicant read path (worker_profiles
fields via a narrow definer function, never private contacts); verified-certification read path fixed now, empty until W7; marketplace search
RPC; audit + notifications (W3 producer pattern); worker marketplace, detail, apply, withdraw, track; owner applicant pipeline; pgTAP
J4/J5/J17/J18, Vitest, w5 smoke, docs.
Out (reason): certifications table and real certification rows (W7; W5 returns zero rows); training
programs/enrollment links (W6); contracts/offers (W9: `accepted` is not a contract or offer of employment); contact exchange between owner and
applicant (decision 4.4); interview scheduling (not in this slice; W12 wires scheduling notifications); super-admin read/moderation of
applications (W11); email/SMS/push and Realtime (W12, polling stays); auto-close on deadline (no scheduler; apply refuses instead); the W4 low
items (revoke `job_opening_missing_publish_fields`, trusted `changed_fields`) stay carried. No production apply, no `.env`, no SQLAlchemy/Alembic
tables.

## 2. Design principles (continue P1-P18)
P19. All writes to `job_applications` go through definer RPCs (no INSERT/UPDATE/DELETE privilege for any client role); the guard trigger accepts
a change only under the transaction-local flag `washlink.job_application_write` = row id (or `opening:<id>` for auto-close). Trusted SQL sessions
bypass the guard for repair (audited `trusted_session`) EXCEPT P20.
P20. The opening snapshot is write-once: set null -> value exactly once (at submit) and never changed or cleared afterwards by ANY session,
trusted and service_role included. Removal only by row delete.
P21. Owners see applicant data only through `applicant_profiles_for_job_opening` (no worker_profiles policy is widened);
`worker_private_contacts` is never readable by owners in W5.
P22. Qualifications shown to owners come only from `applicant_verified_certifications` (workflow records, W7). Worker profile skills/experience
are always labelled "self-reported, not verified". There is no application column where a worker can claim a certification.
P23. Notification texts and audit payloads never contain the cover note, the snapshot, pay, terms, applicant name or contact data (C-W3-1, P13).

## 3. Migrations (staged 20261025000001..05; each ends with `-- ROLLBACK`; each <= 350 lines)
Names `2026_10_25_w5<x>_<snake>.sql`, idempotent, `notify pgrst, 'reload schema';` last. Every function `set search_path = public, pg_temp`;
`revoke all ... from public, anon` (+ `authenticated`, `service_role` for trigger/internal ones); client RPCs `grant execute ... to
authenticated` only.

### 3.1 `2026_10_25_w5a_job_applications_preflight.sql` (w3d0/w4a pattern; creates nothing)
Abort naming every missing item: every `job_openings` column the snapshot copies (section 3.2) plus `id, shop_id, owner_id, status, updated_at,
application_deadline`; `shops.{id, owner_id, name, address}`; `worker_profiles.{profile_id, headline, experience_summary, years_of_experience,
skills, preferred_locations, availability_status, availability_notes}`; `profiles.{id, role, full_name}`; functions
`record_workforce_audit_event(text,text,uuid,uuid,jsonb)`, `enqueue_notification_safely(uuid, text,text,text,text,text,uuid)`,
`notification_safe_label(text,text)`, `shop_has_recorded_verification (uuid)`, `is_verified_shop_owner(uuid)`, `current_user_profile_role()`,
`is_trusted_db_session()`, `transition_job_opening(uuid,text,text)`. Abort if `public.job_applications` exists without a table comment starting
`W5` (D-10 row 24). Rollback: nothing.

### 3.2 `2026_10_25_w5b_job_applications.sql`
Table `public.job_applications` (comment `W5: ...`; audit rows keep no FK to it, P11):

| Column | Type / rule |
|---|---|
| id | uuid PK default gen_random_uuid() |
| job_opening_id | uuid not null FK job_openings(id) on delete cascade; immutable |
| worker_id | uuid not null FK worker_profiles(profile_id) on delete cascade; = auth.uid() at create; immutable |
| shop_id, owner_id | uuid not null, FK shops(id) / profiles(id) on delete cascade; copied from the opening at create; immutable (RLS without joins) |
| status | text not null default 'draft' CHECK in (draft, submitted, under_review, shortlisted, accepted, rejected, withdrawn, closed) |
| cover_note | text, trimmed, nullif empty, <= 1000; editable only while draft |
| notice_version | text CHECK in ('w5_v1') (no date digits: a date string is phone-shaped for the W3 payload rule) |
| notice_acknowledged_at, submitted_at, decided_at, withdrawn_at, closed_at, status_changed_at | timestamptz, server-stamped |
| opening_snapshot | jsonb, `jsonb_typeof = 'object'`, `pg_column_size <= 65536`; P20 |
| opening_snapshot_taken_at | timestamptz; P20 |
| created_at, updated_at | timestamptz not null default now(), server-stamped |

Constraint `ja_submission_consistency`: submitted_at, opening_snapshot, opening_snapshot_taken_at, notice_version and notice_acknowledged_at are
all null or all set; draft -> submitted_at null; submitted / under_review / shortlisted / accepted / rejected -> submitted_at set; accepted /
rejected -> decided_at set; withdrawn -> withdrawn_at set; closed -> closed_at set. Indexes: UNIQUE `job_applications_one_live_per_worker_opening
(job_opening_id, worker_id) where status <> 'withdrawn'` (J4 duplicate rule; a withdrawn row frees the pair, rejected/closed do not);
`(worker_id, status_changed_at desc)`, `(owner_id, job_opening_id, status)`, `(job_opening_id, status)`. `job_opening_application_snapshot(o
public.job_openings) returns jsonb` (stable, definer, pinned, internal): `snapshot_version = 1`, `job_opening_updated_at`, shop `name`/`address`
at that moment, and verbatim: title, description, duties, work_location, openings_count, job_type, required_skills, minimum_years_experience,
experience_requirement, availability_requirement, schedule_details, compensation_min_amount/max/currency/period/details, benefits, other_terms,
minimum/preferred qualifications, required_training, applicant_requirement, certification_expectations, application_deadline,
application_instructions. Keys = column names (frontend reuses the W4 mapper). Guard `job_applications_guard_write` BEFORE INSERT/UPDATE/DELETE
(definer), in this order:
(a) P20, every session: an UPDATE changing `opening_snapshot` or `opening_snapshot_taken_at` whose old value is not null -> 42501 `The
application snapshot cannot be changed.`
(b) trusted session -> allow (repair).
(c) DELETE: allow when the opening, worker profile, shop or owner profile no longer exists (cascade); allow under the flag for a draft row; else
42501 `Only draft applications can be deleted.`
(d) INSERT/UPDATE without the flag for this row (or flag `opening:<job_opening_id>` with new status closed) -> 42501 `Job applications change
only through the application actions.`
(e) `id, job_opening_id, worker_id, shop_id, owner_id, created_at` changed -> 42501 `This application field cannot be changed.`; cover_note
changed while old status is not draft -> 42501 `A submitted application cannot be edited.` (f) `updated_at := now()`.
`job_applications_normalize` BEFORE INSERT/UPDATE (invoker): trim / nullif cover_note. `worker_has_applied_to_job_opening(p_job_opening_id uuid)
returns boolean` (sql, stable, definer, pinned, grant authenticated: called by a policy as the caller): exists own non-draft application. RLS on;
`revoke all on job_applications from public, anon`; `grant select to authenticated` only. Policies: `ja_select_worker_own` (worker_id =
auth.uid()); `ja_select_owner_non_draft` (owner_id = auth.uid() and status is not draft); deny-all write policies `ja_no_client_insert`,
`_update`, `_delete`. No super_admin policy in W5. New job_openings policy `jo_select_for_applicants` (role worker, status not draft,
`worker_has_applied_to_job_opening(id)`): an applicant keeps reading the current opening after it is paused/closed or the shop loses verification
(the snapshot stays the record of what they applied to). Realtime: drop from `supabase_realtime` if present; NOTICE on FOR ALL TABLES. Rollback:
drop jo_select_for_applicants, policies, triggers, functions, table (data loss).

### 3.3 `2026_10_25_w5c_job_application_rpcs.sql` (state machine; definer, pinned, authenticated)
`job_application_notice_version() returns text` = `w5_v1` (immutable; grant authenticated). `create_job_application(p_job_opening_id uuid,
p_cover_note text default null, p_submit boolean default true, p_notice_version text default null) returns public.job_applications`. Checks in
order: auth.uid() null or role not worker -> 42501 `Only worker accounts can apply to job openings.`; no worker_profiles row -> 23514 `Create
your worker profile before applying.`; opening `for share` (serialises with the `for update` in `transition_job_opening`): missing or draft ->
42501 `Job opening not found.`; paused -> 23514 `This job opening is paused and is not accepting applications.`; closed/archived -> 23514 `This
job opening is closed.`; not `shop_has_recorded_verification(shop_id)` -> 23514 `This shop cannot receive applications until its verification is
reviewed.`; deadline before Manila today -> 23514 `The application deadline for this opening has passed.` (accepted through the deadline day);
`pg_advisory_xact_lock` per worker, then: 3 or more rows for this (opening, worker) incl. withdrawn -> 23514 `You cannot apply to this job
opening again.`; 50 or more live (submitted, under_review, shortlisted) for the worker -> 23514 `You have reached the limit of 50 open
applications.`; 500 or more non-draft, non-withdrawn rows on the opening -> 23514 `This job opening is not accepting more applications.`; if
p_submit and `p_notice_version` is distinct from `job_application_notice_version()` -> 23514 `Review the training and work notice before
applying.` Inserts (under the flag) a draft, or a submitted row with submitted_at = notice_acknowledged_at = opening_snapshot_taken_at =
status_changed_at = now(), the snapshot and the version. A unique_violation on the partial index is re-raised as 23505 `You have already applied
to this job opening.` (also a second draft). `update_job_application_draft(p_application_id uuid, p_cover_note text, p_expected_updated_at
timestamptz)`: own draft only else 42501 `Job application not found.`; updated_at differs -> 55000 `This application changed. Refresh and try
again.` `delete_job_application_draft(p_application_id uuid) returns void`: own draft only, else 42501 (same).
`transition_job_application(p_application_id uuid, p_from_status text, p_to_status text, p_notice_version text default null) returns
public.job_applications`: row `for update`; caller is neither its worker (role worker) nor its owner (role owner), or is the owner and the row is
a draft -> 42501 `Job application not found.` (no existence leak); status differs from p_from_status -> 55000 (message above); pair not allowed
FOR THIS ACTOR -> 42501 `This application status change is not allowed.`; then the conditions below.

| From | To | Who | Condition / stamps |
|---|---|---|---|
| (none) | draft or submitted | worker (self) | `create_job_application`, every apply check |
| draft | submitted | worker (self) | every apply check again (opening `for share`) + current notice version; snapshot taken now |
| draft | (row deleted) | worker (self) | `delete_job_application_draft` |
| submitted | under_review | owning owner | opening published or paused |
| submitted, under_review, shortlisted | rejected | owning owner | opening published or paused; decided_at |
| under_review | shortlisted | owning owner | opening published or paused |
| under_review, shortlisted | accepted | owning owner | opening published or paused AND `is_verified_shop_owner(shop_id)` else 42501 `Only a verified shop can accept applications.`; decided_at |
| submitted, under_review, shortlisted, accepted | withdrawn | worker (self) | any opening status (a worker may always withdraw or decline; J16 spirit); withdrawn_at |
| draft, submitted, under_review, shortlisted | closed | system only | opening -> closed/archived (3.5); closed_at |

Owner transitions on a closed/archived opening -> 23514 `This job opening is closed.` Everything else is rejected for every end user, super_admin
included (same-status, backwards, out of rejected / withdrawn / closed, owner withdrawing, worker deciding, anyone setting closed).
status_changed_at = now() on every change. `accepted` is a pipeline decision only, never a contract, an offer of employment or a guarantee (W9
creates contracts).

### 3.4 `2026_10_25_w5d_marketplace_and_applicant_reads.sql`
`search_job_openings(p_query, p_location, p_job_type, p_applicant_requirement, p_required_skill text, p_pay_stated boolean, p_min_pay_amount
numeric, p_pay_period text, p_limit integer default 20, p_offset integer default 0)` (all filters default null) returns table (job_opening_id,
shop_id, shop_name, title, work_location, job_type, applicant_requirement, required_skills, compensation_min_amount, compensation_max_amount,
compensation_currency, compensation_period, application_deadline, first_published_at, my_application_status). SECURITY INVOKER (RLS decides:
owners, customers, anon get nothing), stable, pinned, grant authenticated. Only published rows with deadline null or not before Manila today.
Text args trimmed, max 80 chars else 22023; `%`, `_` and backslash escaped before ILIKE (query: title, description, work_location,
schedule_details; location: work_location; skill: case-insensitive element match). Pay: stated values only, same period, no conversion or
estimate; p_min_pay_amount requires p_pay_period (22023) and matches `coalesce(max, min) >= p_min_pay_amount`; p_pay_stated = true -> min or max
set. p_limit 1..50, p_offset 0..1000 else 22023. Order `first_published_at desc, id`. my_application_status = the caller's live application
status or null. `applicant_profiles_for_job_opening(p_job_opening_id uuid)` returns table (application_id, display_name, headline,
experience_summary, years_of_experience, skills, preferred_locations, availability_status, availability_notes, profile_updated_at); definer;
caller owns the opening with role owner else 42501 `Job opening not found.`; rows only for applications in submitted, under_review, shortlisted,
accepted (sharing ends on rejected / withdrawn / closed); display_name = trimmed `profiles.full_name`, else `Applicant`. Never reads
worker_private_contacts. `applicant_verified_certifications(p_application_id uuid)` returns table (certification_id uuid, certification_title
text, issuing_shop_name text, issued_at timestamptz, expires_at timestamptz); definer; caller = the application worker, or its owner while the
row is in a sharing status, else 42501 `Job application not found.` W5 body returns zero rows (no certification records exist yet); comment: W7
replaces the body with active, workflow-issued certifications and keeps the signature. Never reads worker-entered text. Rollback: drop the three
functions.

### 3.5 `2026_10_25_w5e_application_audit_notifications_and_auto_close.sql`
`job_openings_close_applications` AFTER UPDATE on job_openings WHEN (status changed and new status in closed, archived) (definer, internal): sets
flag `opening:<id>`, moves its draft, submitted, under_review and shortlisted rows to closed (closed_at, status_changed_at), resets the flag.
Accepted, rejected and withdrawn rows are unchanged. Bounded by the 500-per-opening cap. `job_applications_audit` AFTER INSERT/UPDATE/DELETE
(definer, internal; subject_type `job_application`, subject_id id, subject_profile_id worker_id; payload ids and status words only).
Notifications through `enqueue_notification_safely`, key `job_application:<id>:<audit_id>`; labels via `notification_safe_label(title, 'A job
opening')` and `notification_safe_label(shop name, 'The shop')`:

| Event | Action; payload | Notification |
|---|---|---|
| insert as draft | `job_application.created`; job_opening_id, shop_id, status | none (draft edits: no audit, no notification) |
| insert as submitted, or draft -> submitted | `job_application.submitted`; job_opening_id, shop_id, from_status | owner, `job_application.submitted`: "New job application" / "<opening> has a new application." |
| owner transition | `job_application.status_changed`; job_opening_id, shop_id, from_status, to_status, changed_by = owner | worker, `job_application.status_changed`: "Application update" / "<shop>: your application for <opening> is now Under review / Shortlisted / Accepted / Not selected." (Accepted adds "This is not a contract.") |
| worker withdraw | same, changed_by = worker | owner, `job_application.withdrawn`: "Application withdrawn" / "An applicant withdrew from <opening>." |
| auto-close | same, changed_by = opening_closed | worker (non-draft rows): "<opening> at <shop> has closed, so your application was closed." |
| trusted repair | same, changed_by = trusted_session | none |
| draft delete | `job_application.deleted`; deleted_by = worker | none |
| cascade delete | `job_application.deleted`; job_opening_id, from_status, deleted_by = worker_profile_deleted / opening_removed / trusted_session | worker if their profile still exists: "An application ended because the shop or its job opening was removed."; owner if their profile exists and the row was live: "An application was removed because the applicant deleted their profile." |

`job_openings_notify_applicants_on_pause` AFTER UPDATE WHEN (published -> paused): each live applicant gets `job_opening.paused`, "Opening
paused" / "<opening> at <shop> is paused. Your application stays open.", key `job_opening:<id>:<audit_id>` (latest `job_opening.status_changed`
event of the row; the trigger name sorts after `job_openings_audit`). Final block: the w3a pin assertion repeated (abort on a miss). Rollback:
drop the triggers and functions (audit rows and notifications stay).

## 4. Decisions taken in this plan (RECORD adds D-12..D-14 to DECISIONS.md as ADOPTED-DEFAULT)
4.1 Duplicates: one live row per (opening, worker); withdrawn frees the pair; at most 3 rows per pair; a rejected or closed application blocks
re-applying to that opening.
4.2 Certification-required openings accept applications in W5; the owner sees "No verified certification on record" and the worker is told so
before applying (blocking would make every such opening unapplicable until W7). W7 may add enforcement (D-12).
4.3 Owners see worker_profiles fields plus profiles.full_name while the application is submitted, under_review, shortlisted or accepted; never
for drafts, rejected, withdrawn, closed (D-13).
4.4 worker_private_contacts: never visible to owners in W5. The spec names no stage that requires it; next steps go through the application
instructions of the opening and in-app notifications. A later increment may add worker-initiated, per-application, revocable contact sharing
(D-14). The apply dialog says "Your phone and email are not shared with the shop."
4.5 No super_admin access to applications until W11 (redacted admin path).

## 5. Tests (pgTAP `plan(n)` = actual; 0 `todo_start(`; each file <= 350 lines)
Seed helpers (test_helpers.sql only, never a migration): `create_worker_profile(p_worker uuid)`, `publish_job_opening(p_opening uuid)`,
`create_job_application(p_opening uuid, p_worker uuid, p_status text)`.
`j4_worker_can_browse_and_apply_without_duplicates.test.sql` (J4): `j4_worker_sees_published_openings_of_verified_shops_only`,
`j4_search_filters_by_text_location_job_type_skill_requirement_and_pay`, `j4_search_excludes_past_deadline_paused_and_unverified`,
`j4_search_pay_filter_uses_stated_values_without_conversion`, `j4_search_escapes_wildcards_and_limits_input`,
`j4_search_returns_nothing_for_owner_customer`, `j4_search_marks_my_application_status`, `j4_worker_can_apply_with_optional_cover_note`,
`j4_worker_can_apply_without_cover_note`, `j4_application_requires_worker_profile`, `j4_application_requires_current_notice_version`,
`j4_duplicate_application_rejected` (23505, still 1 row), `j4_second_draft_or_draft_plus_submitted_rejected`,
`j4_live_application_unique_index_is_partial_unique`, `j4_withdrawn_application_allows_reapply`,
`j4_rejected_or_closed_application_blocks_reapply`, `j4_reapply_limit_per_opening`, `j4_open_application_limit_per_worker`,
`j4_cannot_apply_after_deadline`, `j4_can_apply_on_deadline_day_manila`, `j4_cannot_apply_to_paused_closed_or_archived_opening`,
`j4_cannot_apply_to_draft_or_unknown_opening`, `j4_cannot_apply_when_shop_loses_verification` (changes_requested, inactive, reviewer deleted, S6
edit), `j4_non_worker_roles_cannot_apply` (customer, owner, super_admin, anon), `j4_snapshot_taken_at_submit_matches_opening`,
`j4_snapshot_unchanged_after_owner_edits_published_opening`, `j4_snapshot_write_once_for_every_session` (worker, owner, trusted, service_role),
`j4_draft_has_no_snapshot_until_submitted`, `j4_cover_note_length_enforced`, `j4_worker_can_track_own_application_statuses`,
`j4_applicant_can_read_opening_after_pause_or_close`, `j4_application_has_no_certification_claim_column`.
`j5_application_status_transitions_are_validated.test.sql` (J5): `j5_owner_can_move_submitted_to_under_review_shortlisted_accepted`,
`j5_owner_can_reject_from_submitted_under_review_shortlisted`, `j5_worker_can_submit_own_draft`,
`j5_submit_rechecks_deadline_status_and_verification`, `j5_worker_can_withdraw_from_submitted_under_review_shortlisted_accepted`,
`j5_worker_can_withdraw_after_opening_closed`, `j5_worker_can_edit_and_delete_own_draft_only`, `j5_cover_note_frozen_after_submit`,
`j5_disallowed_transitions_rejected` (every (from, to, actor) outside the 3.3 matrix: same-status, backwards, out of terminal states, anyone to
closed, owner to withdrawn, worker to decisions), `j5_owner_cannot_see_or_transition_drafts`, `j5_stale_transition_rejected` (55000),
`j5_stale_draft_update_rejected`, `j5_direct_writes_rejected` (insert, update, delete as worker and owner), `j5_accept_requires_verified_shop`,
`j5_owner_transitions_refused_after_opening_closed`, `j5_closing_opening_closes_open_applications` (draft/submitted/under_review/shortlisted
closed; accepted/rejected/withdrawn unchanged), `j5_archiving_from_trusted_repair_also_closes`, `j5_pausing_opening_keeps_applications_open`,
`j5_super_admin_cannot_transition_applications`, `j5_trusted_session_repair_is_audited`, `j5_server_stamps_set_on_transition`.
`j5_application_audit_and_notifications.test.sql`: `j5_audit_written_for_create_submit_transition_withdraw_close_delete`,
`j5_audit_payload_has_no_cover_note_or_opening_content`, `j5_owner_notified_on_submit_and_withdraw`,
`j5_worker_notified_on_owner_decision_and_closure`, `j5_worker_notified_once_when_opening_paused`, `j5_notifications_idempotent_one_per_event`,
`j5_notification_text_has_no_cover_note_pay_name_or_contact`, `j5_unsafe_opening_title_uses_generic_label`,
`j5_draft_actions_write_no_notification`, `j5_rejected_transition_writes_no_audit_or_notification`,
`j5_cascade_deletions_audited_and_notify_surviving_party`.
`j17_w5_application_authorization.test.sql` (J17): `j17_job_applications_rls_enabled_and_no_client_write_privileges`,
`j17_worker_cannot_read_other_workers_applications`, `j17_owner_reads_applications_only_for_own_openings`,
`j17_owner_cannot_read_draft_applications`, `j17_customer_anon_and_super_admin_read_no_applications`,
`j17_owner_cannot_transition_another_owners_applications`, `j17_worker_cannot_transition_or_edit_another_workers_application`,
`j17_applicant_profiles_only_for_own_opening_and_sharing_statuses`, `j17_applicant_profiles_have_no_contact_columns`,
`j17_owner_cannot_read_applicant_private_contacts`, `j17_owner_cannot_read_worker_profiles_table_directly`,
`j17_applicant_verified_certifications_authorized_and_empty_until_w7`, `j17_applicant_opening_policy_needs_non_draft_application`,
`j17_w5_internal_functions_not_client_executable`, `j17_w5_rpcs_denied_to_anon`, `j17_w5_definer_functions_pin_pg_temp_last`,
`j17_job_applications_not_in_realtime_publication`, `j17_search_job_openings_is_security_invoker`,
`j17_worker_profile_deletion_cascades_applications_and_keeps_audit`, `j17_shop_and_owner_deletion_cascade_applications`.
`j18_w5_flows.test.sql` (J18): `j18_w4_opening_lifecycle_unchanged_with_applications`, `j18_owner_can_edit_published_opening_with_applicants`,
`j18_worker_profile_self_access_unchanged`, `j18_roster_link_and_booking_flows_unaffected_by_w5`. Changed `001_migration_replay.test.sql`:
versions gain 20261025000001..05 (27 migrations; renamed `replay_schema_migrations_has_baseline_w2_w3_w4_w5`), add
`replay_w5_job_applications_rls_enabled`. Every other existing file stays green with unchanged assertions.
Smoke `scripts/supabase-test/w5-api-smoke.mjs` (W4 smoke safety rules: loopback only, keys from `supabase status` in memory, synthetic
`@local.test` users deleted, no `.env`): anon select on job_applications errors or 0 rows; worker direct insert/patch/delete denied;
`search_job_openings` worker 1 row, customer and owner 0; apply via `create_job_application`; duplicate gets `You have already applied to this
job opening.`; missing notice version rejected; other worker sees 0; owner sees 1, other owner 0 and its transition 42501; owner select on
worker_private_contacts 0 rows; `applicant_profiles_for_job_opening` keys contain no `contact`; certifications RPC returns an empty list; stale
transition 55000; withdraw then reapply; owner edits opening, snapshot unchanged; close opening, application closed; notifications exist without
cover-note text; `set_config` not exposed; GoTrue deleteUser of the worker removes its applications. Must end `0 failed`.
Vitest (mocked, no network; file suffixes `.j4`, `.j5`, `.j17`, `.w5`): `w5_job_application_repository_writes_only_through_rpcs`,
`j17_job_application_repository_never_sends_status_owner_or_snapshot`, `w5_marketplace_repository_passes_filters_to_search_rpc`,
`j5_worker_lifecycle_offers_only_allowed_actions`, `j5_owner_pipeline_offers_only_allowed_transitions`,
`j4_apply_disabled_until_notice_acknowledged`, `j4_opening_with_live_application_shows_status_not_apply_button`,
`w5_marketplace_shows_training_notice_before_results`, `w5_opening_detail_shows_details_as_entered_disclaimer`,
`w5_apply_dialog_states_training_is_not_paid_work`, `w5_apply_dialog_says_contacts_not_shared`,
`w5_certification_required_opening_warns_no_verified_certification`, `w5_marketplace_loading_empty_error_states`,
`w5_my_applications_shows_snapshot_and_edited_since_notice`, `w5_withdraw_requires_confirmation`,
`w5_applicant_profile_labels_skills_self_reported`, `w5_applicant_verified_certifications_shows_none_yet`,
`w5_applicant_view_never_renders_private_contact_fields`, `w5_accepted_status_copy_says_not_a_contract`,
`w5_worker_profile_visibility_copy_matches_owner_access`, `w5_cover_note_schema_mirrors_db_limit`, `w5_notice_version_constant_is_w5_v1`,
`w5_stale_transition_error_refreshes_pipeline`. The existing 64 stay green.

## 6. Frontend (UI -> hooks -> services -> repositories -> Supabase; each file <= 350 lines)
Add: `domain/models/{JobApplication, MarketplaceJobOpening, ApplicantProfile, VerifiedCertification}.ts` (snapshot type = W4 `JobOpeningContent`
+ shop name/address + `jobOpeningUpdatedAt`); `domain/utilities/jobApplicationLifecycle.ts` (per-actor actions mirroring 3.3);
`domain/repositories/{JobApplicationRepository, MarketplaceRepository, ApplicantPipelineRepository}.ts`;
`infrastructure/supabase/supabaseJobApplicationRow.ts` (explicit columns; snapshot mapper reuses `supabaseJobOpeningRow`);
`infrastructure/repositories/Supabase{JobApplication, Marketplace, ApplicantPipeline}Repository.ts` (every write is an RPC; errors via
`toUserFacingError`); `application/validation/jobApplicationSchemas.ts` (cover note <= 1000, filter limits);
`application/services/{JobApplication, Marketplace, ApplicantPipeline}Service.ts`; `presentation/utilities/jobApplicationDisplay.ts` (Draft,
Submitted, Under review, Shortlisted, Accepted, Not selected, Withdrawn, Closed; accepted copy "The shop wants to move forward. This is not a
contract or a job guarantee.") and `workforceNoticeCopy.ts` (`applicationNoticeVersion = 'w5_v1'`); hooks `useMarketplaceSearch`,
`useMarketplaceOpeningDetail`, `useMyJobApplications`, `useApplyToJobOpening`, `useApplicantPipeline` (poll 60 s while visible and on focus).
`presentation/components/jobOpenings/JobOpeningDetailsView.tsx` (read-only body moved out of `JobOpeningPreview.tsx`, which keeps its owner
banner). Worker `presentation/components/worker/marketplace/`: `WorkerMarketplacePanel` (notice first, then filters and results; Skeleton,
`LoadErrorNotice`, EmptyState), `MarketplaceFilterBar` (text, location, job type, trainees welcome / certification required, skill, pay stated,
"at least PHP X per period"), `MarketplaceOpeningCard`, `MarketplaceOpeningDetail` (details view + "Details as entered by the shop. WashLink does
not verify pay or employment terms."; for certification-required openings "You have no verified certification on WashLink yet; the shop will see
that."), `TrainingAndWorkNotice`, `ApplyToOpeningModal` (optional cover note with "Do not include ID numbers, health details or contact details";
required acknowledgement checkbox; "Your phone and email are not shared with the shop."; no-profile state opens the profile editor),
`MyApplicationsPanel`, `MyApplicationListItem`, `ApplicationSnapshotView` ("As you applied on DATE"; "The shop edited this opening after you
applied" when the current updated_at is later), `WithdrawApplicationConfirmModal` ("Decline" for accepted).
Notice text (a WashLink product rule, no legal claim): "WashLink rule: required initial training for a shop certification lasts at least 3 days
and is free for you. A shop may not charge you a training fee or deduct one from your pay. Training and assessment are supervised learning, not
productive work for customers. Applying does not enroll you in training, and an accepted application is not a contract." Owner
`presentation/components/owner/applicants/`: `ApplicantPipelinePanel` (per opening, status tabs with counts, loading/empty/error),
`ApplicantListItem`, `ApplicantProfileDrawer` (profile under "Self-reported by the worker, not verified by WashLink"; cover note as plain text;
snapshot view; no contact fields), `ApplicantVerifiedCertificationsSection` ("Verified certifications: none yet"),
`ApplicantTransitionConfirmModal` (reject: "The worker will see Not selected"; accept: "This records your decision; it is not a contract").
Change: `features/worker/WorkerWorkspaceGate.tsx`, `WorkerJobsPage.tsx` + new `WorkerWorkspaceTabs.tsx` ("Find work", "My applications",
"Assigned bookings"; marketplace reachable without a roster link; `workerWorkspaceView.ts` rules kept); new
`dependencyInjection/createWorkerMarketplaceDependencies.ts`; `createDashboardDependencies.ts`; `JobOpeningListItem.tsx` ("Applicants (n)");
`OwnerJobOpeningsPanel.tsx` (opens the pipeline); `supabaseErrorMessages.ts` (every section-3 message); `workerProfileDisplay.ts` visibility
copy: "Who can see your profile: you, WashLink administrators, and shops you apply to while your application is active or accepted. Your private
contact details are not shared with shops."

## 7. Docs
Add `docs/workforce/JOB_APPLICATIONS.md` (P19-P23, columns, matrix, refusals, visibility, snapshot, notifications, limitations, rollback) and
`docs/workforce/LEGAL_REVIEW_REGISTER.md` (first version: W4-L10, W5-L1..L8, all OPEN; W13 completes it). Update `JOB_OPENINGS.md`,
`AUDIT_AND_NOTIFICATIONS.md` (3.5), `ROLE_AND_PROFILE_SECURITY.md` (guard matrix; D-10 rows 24 no pre-existing `job_applications` or same-named
functions, 25 w5a columns incl. `profiles.full_name`, 26 new job_openings policy and triggers), `LOCAL_TEST_HARNESS.md` (27 migrations, W5
smoke). RECORD adds the W5 smoke to LOOP.md.

## 8. Check commands (repo root, local only)
`cd frontend && npm run lint`, `npm run build`, `npm test`; `backend/.venv/Scripts/python.exe -m pytest -q`; `node --test
scripts/supabase-test/stage-local-workdir.test.mjs`; `node scripts/supabase-test/run-db-tests.mjs`; then `w2-`, `w3-`, `w4-`, `w5-api-smoke.mjs`;
stop the stack with `--workdir .local-supabase-test --no-backup`.

## 9. Acceptance criteria
| AC | Criterion | Evidence |
|---|---|---|
| AC1 | 5 new migrations `2026_10_25_w5[a-e]_<snake>.sql`, each with `-- ROLLBACK`; no committed migration changed | `ls supabase/migrations/2026_10_25_w5*`; `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_25_w5*` empty; `git diff --name-status 50cb850 -- supabase/migrations` only `A` lines |
| AC2 | Clean replay of 27 migrations; suite PASS, 0 TODO | runner `Result: PASS`; `replay_schema_migrations_has_baseline_w2_w3_w4_w5`, `replay_w5_job_applications_rls_enabled`; `grep -c "todo_start(" supabase/tests/database/*.sql` all 0 |
| AC3 | J4: browse, apply, no duplicates, refusals | every `j4_*` pgTAP name in section 5; Vitest `j4_apply_disabled_until_notice_acknowledged`, `j4_opening_with_live_application_shows_status_not_apply_button` |
| AC4 | J5: transitions validated per actor | every `j5_*` name in both j5 files; Vitest `j5_worker_lifecycle_offers_only_allowed_actions`, `j5_owner_pipeline_offers_only_allowed_transitions` |
| AC5 | Snapshot write-once (C-W4-1) | `j4_snapshot_taken_at_submit_matches_opening`, `j4_snapshot_unchanged_after_owner_edits_published_opening`, `j4_snapshot_write_once_for_every_session`; smoke snapshot check |
| AC6 | Deadline, status and P15 refusals (W4 R4) | `j4_cannot_apply_after_deadline`, `j4_can_apply_on_deadline_day_manila`, `j4_cannot_apply_to_paused_closed_or_archived_opening`, `j4_cannot_apply_when_shop_loses_verification`, `j5_submit_rechecks_deadline_status_and_verification` |
| AC7 | Closing an opening closes its open applications | `j5_closing_opening_closes_open_applications`, `j5_archiving_from_trusted_repair_also_closes`; smoke close check |
| AC8 | Qualifications only from verified records; none yet | `j17_applicant_verified_certifications_authorized_and_empty_until_w7`, `j4_application_has_no_certification_claim_column`; Vitest `w5_applicant_profile_labels_skills_self_reported`, `w5_applicant_verified_certifications_shows_none_yet` |
| AC9 | Owner sees the profile, never private contacts | `j17_applicant_profiles_only_for_own_opening_and_sharing_statuses`, `j17_applicant_profiles_have_no_contact_columns`, `j17_owner_cannot_read_applicant_private_contacts`, `j17_owner_cannot_read_worker_profiles_table_directly`; Vitest `w5_applicant_view_never_renders_private_contact_fields` |
| AC10 | Audit and notifications: idempotent, no private text | every name in `j5_application_audit_and_notifications.test.sql` |
| AC11 | J17 authorization | every name in `j17_w5_application_authorization.test.sql`; Vitest `j17_job_application_repository_never_sends_status_owner_or_snapshot` |
| AC12 | C7 notice and copy; W2-L5 copy now true | Vitest `w5_marketplace_shows_training_notice_before_results`, `w5_apply_dialog_states_training_is_not_paid_work`, `w5_opening_detail_shows_details_as_entered_disclaimer`, `w5_accepted_status_copy_says_not_a_contract`, `w5_worker_profile_visibility_copy_matches_owner_access`; pgTAP `j4_application_requires_current_notice_version` |
| AC13 | PostgREST surface | `w5-api-smoke.mjs` ends `0 failed`; W2 `48 passed, 0 failed`; W3 `33 passed, 0 failed`; W4 `43 passed, 0 failed` |
| AC14 | Frontend | every section-5 Vitest name passes; the existing 64 pass; lint and build exit 0; `grep -rn "worker_private_contacts" frontend/src/presentation/components/owner` empty; `grep -rn "service_role" frontend/src` empty |
| AC15 | J18 regression | every pre-W5 pgTAP file `ok`; `git diff --stat 50cb850 -- supabase/tests/database` lists only new files plus `001_migration_replay.test.sql`; `j18_w5_flows` names pass; pytest `4 passed`; stager 18/18 |
| AC16 | Size, safety, docs | `wc -l` of every added or changed file <= 350; no `.env` read; no `db push`, `--linked` or `link`; `git diff --stat 50cb850 -- backend` empty; section 7 docs exist; `grep -n "W4-L10" docs/workforce/LEGAL_REVIEW_REGISTER.md` hits |

## 10. Rollback
Per-file `-- ROLLBACK` blocks in reverse order e, d, c, b, a; local stack only. e: drop the auto-close, pause-notify and audit triggers and
functions (audit rows and notifications stay). d: drop the three read functions. c: drop the four RPCs and the notice-version function. b: drop
`jo_select_for_applicants`, the helper, policies, triggers, functions and the table (applications and snapshots lost; export with a trusted
`copy` first). a: nothing. Frontend: revert the W5 commit (restores the W2 visibility copy).

## 11. Risks and legal-review flags
- R1 (D-10 rows 24-26): production may hold a `job_applications` table, same-named functions or no `profiles.full_name`; w5a aborts.
- R2: closing an opening updates up to 500 rows and enqueues notifications inside the owner transaction (bounded by the cap); W12 may batch.
- R3: apply vs close race: apply holds `for share` on the opening, `transition_job_opening` takes `for update`, so they serialise.
- R4: the snapshot keeps owner free text for good (P20); a W11 takedown cannot edit it, only delete the row via a trusted session. Revisit in W11.
- R5: deleting a worker profile cascades its applications, accepted ones included (worker choice); the owner is told without the name.
- R6: flags rely on PostgREST not exposing `set_config` (smoke). R7: the invoker search runs the P15 predicate per row (fine at this volume).
- R8: Manila calendar deadline for every user. R9: an audit failure aborts the action, cascades included; w5a reduces drift risk.
Legal (copied to `LEGAL_REVIEW_REGISTER.md`, all OPEN; no compliance claim in UI or docs):
- W4-L10 recruitment and placement: does a job marketplace with application handling need DOLE registration or a license (Labor Code Art.
  13(b))? Must be answered before production use of W5.
- W5-L1 applicant data (full name, profile) shared with owners: notice at apply, lawful basis (RA 10173), retention of applications and snapshots.
- W5-L2 meaning of `accepted`: the copy says not a contract or guarantee; review whether owner acceptance creates obligations.
- W5-L3 free-training notice wording and the stored acknowledgement (`notice_version`): a product rule, not legal advice; W6 records the terms.
- W5-L4 rejection without recorded reasons; discrimination risk in owner decisions (RA 10911 and others); whether reasons or records are required.
- W5-L5 certification-required openings while no certifications exist (4.2): fairness of showing "no verified certification".
- W5-L6 the cover note may carry sensitive personal data; guidance text only, no filter. W5-L7 no contact exchange (4.4): workers may still put
  contacts in the cover note; whether the platform must mediate communication.
- W5-L8 owner free text (W4-L8: terms, fees, unpaid trials) is now shown to every worker verbatim and frozen in snapshots; publisher duties (W4-L9).
