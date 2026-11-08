# W3 - Audit events & notification foundation - PLAN

Spec: I (notifications, auditability), G (authz, constraints), J17, J18. Depends on W2 (`passed`,
STATE.md, HEAD a2517d0). Decisions needed: none new. D-10 (standing gate: local proof only) and
D-11 (naming; staged 14-digit copies) apply. Not BLOCKED.
Closes carry-forwards: R-1 (search_path pinning, W2/REVIEW.md), R-4 part "append-only review log"
(snapshots at certification/contract time stay with W7/W10). Audit F7 (no notification system):
W3 creates `notifications`; nothing to extend (ARCHITECTURE_AUDIT.md "Notifications").

## 1. Scope / out of scope
In: R-1 alignment migration; `workforce_audit_events` (append-only) + `record_workforce_audit_event`;
audit wiring for W2 sensitive actions (shop verification submit/decision/identity reset, roster
link code issued, roster link/unlink/entry deletion, worker profile deletion, trusted role change);
R-4 review log view; `notifications` + `enqueue_notification` + `mark_notifications_read`;
two real producers (shop verification decision -> owner; roster link changes -> counterparty);
frontend notification repository/service/hook + bell with unread count + list + mark-read;
pgTAP, Vitest, a W3 API smoke script; docs.
Out (with reason):
- Audit of role-guard REJECTIONS: the guard raises, so any audit row written in the same
  transaction is rolled back. Recording it needs an autonomous transaction (dblink/pg_background,
  new extension surface). Not cheap, so not done; listed in limitations. Successful trusted role
  changes ARE audited.
- Audit read for actors/subjects and the admin audit UI -> W11 (admin dashboard, redacted per-user
  functions). W3 read = super_admin only (section 3.2).
- Realtime push of notifications -> W12 decides (section 3.3); W3 polls.
- Notifications for W4-W10 events, email/SMS/push channels -> W12 (in-app only here).
- Owner-facing verification history UI, hash-chained tamper evidence, retention jobs -> W11/W13.
- Any production apply, `.env` access, SQLAlchemy/Alembic tables (LOOP rule 2).

## 2. Design principles (adds to ROLE_AND_PROFILE_SECURITY.md P1-P9)
P10. Every SECURITY DEFINER function pins `set search_path = public, pg_temp` (storage helper:
     `public, auth, pg_temp`). Without `pg_temp` listed, Postgres searches the temp schema FIRST for
     relations, so a session able to create temp tables could shadow `profiles`/`shops`.
     New W3 invoker functions pin the same value. Any later `create or replace` of a W2/W3 function
     must keep it (CREATE OR REPLACE resets proconfig).
P11. Audit rows have NO foreign keys (actor/subject are plain uuids + a role snapshot), so deleting a
     user, shop or roster row never nulls or removes history (R-4), and the table never takes part
     in `on delete` cascades (P9 untouched).
P12. Writes to `workforce_audit_events` and `notifications` happen only inside definer functions
     that set a transaction-local writer flag (`washlink.audit_writer`, `washlink.notification_writer`
     = on), checked by a BEFORE INSERT trigger for every session (superuser and service_role
     included). Clients cannot set `washlink.*` GUCs through PostgREST (W2 risk R3).
P13. Payloads and bodies carry identifiers, statuses and field NAMES only: never contact data, notes,
     document paths, link codes/hashes or contract text. Enforced by CHECK functions (3.2, 3.3),
     not only by convention.
P14. Producers are AFTER triggers on the W2 tables, not edits of the W2 RPC bodies: one place
     catches every path (RPC, direct owner update, cascade, trusted SQL) and W2 functions are not
     duplicated into W3 files. A notification problem must never fail the business action:
     producers pass free-text names through `notification_safe_label()` (3.3).

## 3. Migrations (new files only; staged as 20261024000007..10; each ends with `-- ROLLBACK`)
Lexical order = dependency order (`w3a` sorts after `w2f`). Each file at most 350 lines, idempotent,
`notify pgrst, 'reload schema';` last. Rollbacks are applied in reverse order d..a.

### 3.1 `2026_10_24_w3a_definer_search_path_pin.sql` (R-1)
- DO block over an explicit text list of signatures; for each `to_regprocedure(sig)`; if null
  `raise notice` (production may lack it, D-10), else `execute format('alter function %s set
  search_path = public, pg_temp', proc)`. List: W2 definer `is_orphaned_fk_set_null(regclass,jsonb,jsonb)`,
  `current_user_profile_role()`, `sanitize_profile_role_on_insert()`, `guard_profile_protected_columns()`,
  `guard_shop_insert()`, `prevent_owner_verification_mutation()`, `submit_shop_for_verification(uuid)`,
  `guard_verification_document_write()`, `is_verified_shop_owner(uuid)`, `guard_booking_insert()`,
  `guard_booking_update()`, `guard_worker_roster_write()`, `approved_shop_names_for_owner(uuid)`,
  `unlink_my_roster_entry(uuid)`, `list_my_roster_links()`, `roster_link_code_hash(text)`,
  `require_worker_caller()`, `roster_link_check_rate_limit(uuid,bytea)`, `create_roster_link_code(uuid)`,
  `preview_roster_link_code(text)`, `accept_roster_link_code(text)`; W2 invoker
  `is_trusted_db_session()`, `profile_protected_column_changes(jsonb,jsonb)`,
  `normalize_worker_text_list(text[],integer,text)`, `normalize_worker_profile()`,
  `stamp_worker_private_contact()`; pre-W2 definer `is_super_admin()`,
  `set_booking_quote_from_shop_pricing()`; and `can_manage_shop_verification_storage(text)` set to
  `public, auth, pg_temp`. Bodies are not touched (ALTER only; no committed migration edited).
- Not altered: the baseline-only `handle_new_user()` (production name unknown, P4), see D-10 row 17.
- Rollback: the same loop with `set search_path = public` (storage helper `public, auth`).

### 3.2 `2026_10_24_w3b_workforce_audit_events.sql`
Table `public.workforce_audit_events`:

| Column | Type / rule |
|---|---|
| id | bigint generated ALWAYS as identity, PK (insertion order) |
| created_at | timestamptz not null default now(); forced to now() by the insert guard |
| actor_id | uuid null, NO FK (auth.uid() at write time) |
| actor_role | text null (snapshot of `current_user_profile_role()`) |
| actor_kind | text not null CHECK in ('user','trusted_session','system') |
| action | text not null CHECK `^[a-z_]+(\.[a-z_]+)+$`, length at most 64 |
| subject_type | text not null CHECK `^[a-z_]{1,40}$` |
| subject_id | uuid null, NO FK |
| subject_profile_id | uuid null, NO FK (the person the event is about; for W11 per-user views) |
| payload | jsonb not null default empty object; CHECK object type and `workforce_audit_payload_is_safe(payload)` |

- `workforce_audit_payload_is_safe(jsonb) returns boolean` (immutable, invoker, pinned): false if
  the serialized size is over 2048 bytes, nesting depth over 3, any key (recursive) matches
  `(phone|e_?mail|contact|address|note|password|token|secret|code|storage_path|document_path|body|message|text|clause|signature)`
  case-insensitively, any string value is over 120 chars, contains `@`, or is phone-shaped (after
  removing space, parentheses and hyphens it matches `^\+?[0-9]{7,15}$`), or any number has an
  absolute value of 1e6 or more. Producers emit times as timestamptz strings (they contain `:`), so
  they are never phone-shaped.
- Indexes: `(created_at desc)`, `(subject_type, subject_id, created_at desc)`,
  `(subject_profile_id, created_at desc) where subject_profile_id is not null`,
  `(actor_id, created_at desc) where actor_id is not null`, `(action, created_at desc)`.
- Guards (all sessions): BEFORE INSERT `workforce_audit_events_guard_insert` raises 42501
  `Audit events are written only by the server.` unless the setting `washlink.audit_writer` is
  `on`, and sets `created_at := now()`. BEFORE UPDATE always raises 42501 `Audit events are
  append-only.` (no exception: super_admin, service_role and trusted SQL included). BEFORE DELETE
  and BEFORE TRUNCATE (statement level) raise 42501 unless the documented trusted retention path
  holds: `is_trusted_db_session()` AND the setting `washlink.audit_retention_purge` is `on` (a human
  in psql/SQL editor runs `set local washlink.audit_retention_purge = on`; PostgREST clients,
  service_role JWTs and end users cannot). Guard functions are definer, revoked from every client
  role.
- `record_workforce_audit_event(p_action text, p_subject_type text, p_subject_id uuid,
  p_subject_profile_id uuid, p_payload jsonb default empty object) returns bigint` (definer,
  pinned): actor fields are derived, never passed (`auth.uid()`; kind = user if uid is not null,
  else trusted_session if `is_trusted_db_session()`, else system; role =
  `current_user_profile_role()`). Sets the writer flag, inserts, resets the flag, returns the id.
  `revoke all ... from public, anon, authenticated, service_role` (internal: only definer code and
  trusted SQL call it).
- Privileges/RLS: RLS enabled; `revoke all on table ... from public, anon, authenticated,
  service_role`; `grant select ... to authenticated`; one policy `wae_select_super_admin` (for
  select using `is_super_admin()`). No insert/update/delete policies. Why super_admin only: an event
  about one party may carry the other party's id (reviewer, owner). W11 adds redacted per-user
  functions instead of widening the policy.
- Realtime: drop the table from `supabase_realtime` if it is published; NOTICE if the publication
  is FOR ALL TABLES (same pattern as w2f lines 212-231).
- `comment on table`: append-only, no FK by design (R-4), not a tamper-proof legal record (W3-L3).
- Rollback: drop triggers, functions, table (irreversible audit data loss; export first).

### 3.3 `2026_10_24_w3c_notifications.sql`
Table `public.notifications`:

| Column | Type / rule |
|---|---|
| id | uuid PK default gen_random_uuid() |
| recipient_id | uuid not null FK profiles(id) on delete cascade (the recipient's own data) |
| category | text not null CHECK `^[a-z_]+(\.[a-z_]+)*$`, at most 64 |
| title | text not null, 1..120 chars, CHECK `notification_text_is_safe(title)` |
| body | text not null, 1..400 chars, CHECK `notification_text_is_safe(body)` |
| subject_type / subject_id | text null CHECK `^[a-z_]{1,40}$` / uuid null, no FK (future deep link) |
| idempotency_key | text not null CHECK `^[a-z_]+:[A-Za-z0-9:_-]{1,180}$` |
| created_at | timestamptz not null default now() |
| read_at | timestamptz null |

- UNIQUE `(recipient_id, idempotency_key)`; indexes `(recipient_id, created_at desc)`,
  `(recipient_id) where read_at is null`. No jsonb payload column (nothing to leak).
- `notification_text_is_safe(text)` (immutable, pinned): false if it contains `@` or any run of
  `[+0-9 ()-]` holding 7 or more digits. `notification_safe_label(p_label text, p_fallback text)`:
  the trimmed label if it is at most 60 chars and safe, else the fallback (so an owner-typed roster
  name that contains a phone number degrades to "A roster entry" instead of failing the link RPC).
- State machine: `unread (read_at null) -> read (read_at = now())`, recipient only, via
  `mark_notifications_read`. No read -> unread, no other mutation by anyone.
  BEFORE INSERT guard (all sessions): writer flag `washlink.notification_writer` required, sets
  `created_at := now()` and `read_at := null`. BEFORE UPDATE guard (all sessions): only `read_at`
  null -> not null may change, else 42501 `Notifications cannot be edited.` DELETE: no client
  grant; rows cascade with the recipient's profile; trusted SQL may purge (retention, W13).
- `enqueue_notification(p_recipient_id uuid, p_category text, p_title text, p_body text,
  p_idempotency_key text, p_subject_type text default null, p_subject_id uuid default null)
  returns uuid` (definer, pinned): returns null and writes nothing when the recipient profile does
  not exist (cascade safety); sets the flag; `insert ... on conflict (recipient_id,
  idempotency_key) do nothing returning id`; on conflict returns the existing id (first write
  wins); resets the flag. Revoked from public, anon, authenticated, service_role (server-side only:
  definer producers and trusted SQL).
- `mark_notifications_read(p_notification_ids uuid[] default null) returns integer` (definer,
  pinned; grant authenticated): 42501 if `auth.uid()` is null; 22023 if more than 200 ids; null
  means all unread of the caller; updates only rows with `recipient_id = auth.uid() and read_at is
  null`; returns rows changed (foreign ids are silently ignored, never revealed).
- RLS: enabled; `revoke all ... from public, anon, authenticated, service_role`; `grant select ...
  to authenticated`; policy `notifications_select_recipient` (`recipient_id = auth.uid()`). No
  super_admin read (personal inbox).
- Realtime decision: NOT added to `supabase_realtime`; dropped if present (NOTICE on FOR ALL
  TABLES). Reason: postgres_changes authorization depends on production Realtime/RLS settings
  that are unknown (D-10), and one missed check would broadcast inboxes. The client polls
  (section 5). W12 may add Realtime Broadcast with `realtime.messages` policies, proven by tests.
- Rollback: drop functions, triggers, table (inbox data loss; acceptable for a foundation table).

### 3.4 `2026_10_24_w3d_audit_and_notification_producers.sql`
AFTER triggers (definer functions, pinned, revoked from all client roles). `audit_id` below is the
id returned by `record_workforce_audit_event`, so each distinct event yields at most one
notification per recipient and a re-fired producer cannot duplicate it.

| Trigger (table, timing) | Condition | Audit action; subject type / id / profile; payload | Notification |
|---|---|---|---|
| `shops_audit_verification` AFTER UPDATE OF verification_status | status changed and caller is super_admin or trusted | `shop.verification_decided`; shop / shop id / owner_id; from_status, to_status, reviewed_by, reviewed_at | owner; category `shop_verification.status_changed`; title "Shop verification updated"; body "(safe shop name, or Your shop) is now Approved / Rejected / Changes requested / Pending review."; key `shop_verification:(shop_id):(audit_id)` |
| same | flag `washlink.submit_shop` equals the shop id | `shop.verification_submitted`; from_status, to_status | none |
| same | old approved -> pending by a non-admin (S6 reset) | `shop.verification_reset_by_identity_change`; changed_fields (names only: name, address) | none (the owner made the edit) |
| `worker_roster_link_codes_audit_issue` AFTER INSERT | always | `roster.link_code_issued`; roster_entry / worker_row_id / null; expires_at (never code_hash) | none |
| `workers_audit_link` AFTER UPDATE OF user_id | null -> user | `roster.linked`; roster_entry / workers.id / new.user_id; owner_id | owner; `roster.linked`; "(safe roster name, or A roster entry) is now linked to a worker account."; key `roster_link:(row_id):(audit_id)` |
| same | user -> null | `roster.unlinked`; owner_id, unlinked_by = `worker` (auth.uid() = old.user_id), `owner` (auth.uid() = old.owner_id), `account_deleted` (profile of old.user_id gone), else `trusted_session` | worker unlinked: owner. Owner unlinked: worker ("A shop removed the link between your account and its roster."). account_deleted / trusted: none |
| `workers_audit_linked_delete` AFTER DELETE | old.user_id not null | `roster.unlinked`; owner_id, unlinked_by = `roster_entry_deleted` | worker, same text as owner unlink |
| `worker_profiles_audit_delete` AFTER DELETE | always | `worker_profile.deleted`; worker_profile / profile_id / profile_id; deleted_by = self, account_deleted, trusted_session or other | none |
| `profiles_audit_role_change` AFTER UPDATE OF role | role changed (only trusted sessions can, W2a guard) | `profile.role_changed`; profile / id / id; from_role, to_role | none |

- View `public.shop_verification_review_log` (`with (security_invoker = true)`): event id, shop_id
  (subject_id), action, from_status, to_status, reviewed_by (actor_id), actor_role, created_at over
  `shop.verification_%` events; grant select to authenticated; base-table RLS makes it super_admin
  only. This is the R-4 append-only review log; W7/W10 still snapshot verification at issue time.
- Approver history stays readable after the reviewing admin account is deleted (P11).
- Rollback: drop the 7 triggers, their functions and the view (audit rows already written stay).

## 4. Tests (pgTAP plan(n) = actual count; any `todo_start(` is a FAIL)
New `supabase/tests/database/j17_w3_audit_events.test.sql`:
`j17_audit_direct_insert_rejected_for_all_roles` (anon, customer, owner, worker, super_admin get
42501; trusted session without the writer flag gets 42501), `j17_audit_update_rejected_for_all_roles`
(the five roles plus trusted session, super_admin included: 42501 or 0 rows, row unchanged),
`j17_audit_delete_rejected_for_all_roles` (same, plus trusted without the purge flag),
`j17_audit_truncate_rejected`, `j17_audit_trusted_retention_purge_path_allows_delete` (trusted plus
`set local washlink.audit_retention_purge = on`, inside the rolled-back test transaction),
`j17_audit_record_function_not_callable_by_clients` (anon and authenticated: 42501),
`j17_audit_actor_fields_derived_not_passed`, `j17_audit_created_at_cannot_be_backdated`,
`j17_audit_readable_only_by_super_admin` (customer, owner, worker see 0 rows; super_admin sees all),
`j17_audit_payload_rejects_contact_and_free_text` (keys phone, email, notes, code_hash,
storage_path; a value with `@`; a phone-shaped value; a 200-char value; a large number: 23514),
`j17_audit_and_notifications_not_in_realtime_publication`,
`j17_definer_functions_pin_pg_temp_last` (every function in the 3.1 list and every W3 definer
function has `search_path=public, pg_temp`; the storage helper `public, auth, pg_temp`),
`j17_definer_function_ignores_temp_table_shadowing` (as an authenticated customer, create
`pg_temp.profiles` holding a super_admin row for self; `is_super_admin()` and
`current_user_profile_role()` still read public.profiles. If TEMP is not granted to authenticated,
assert the 42501 on create instead; no skip).
New `supabase/tests/database/j17_w3_audit_wiring.test.sql`:
`w3_audit_written_on_shop_verification_decision` (approve, reject, changes_requested: one row each,
with from/to and reviewed_by = the admin), `w3_audit_written_on_shop_submission`,
`w3_audit_written_on_shop_identity_reset`, `w3_shop_review_history_survives_reviewer_deletion`
(delete the admin auth user; shops.verification_reviewed_by becomes null; the log row keeps actor_id
and to_status), `w3_shop_review_log_view_is_super_admin_only`, `w3_audit_written_on_link_code_issue`,
`w3_audit_written_on_roster_link_accept`, `w3_audit_written_on_worker_unlink`,
`w3_audit_written_on_owner_unlink`, `w3_audit_written_on_linked_roster_row_delete`,
`w3_audit_written_on_worker_profile_delete` (self, and account deletion),
`w3_audit_written_on_trusted_role_change`, `w3_failed_link_attempt_writes_no_link_event`,
`w3_no_private_data_in_audit_payloads` (fixtures seed synthetic `worker_private_contacts`
phone/email, `profiles.phone_number`, `workers.phone_number` and verification notes; after every
wired action no `payload::text` contains any of those values, `@`, or the link code).
New `supabase/tests/database/j17_w3_notifications.test.sql`:
`j17_notifications_recipient_isolation` (owner A sees own rows; owner B, customer, worker,
super_admin and anon see 0 of A's), `j17_notifications_direct_insert_rejected` (all roles, plus
trusted without the flag), `j17_notifications_enqueue_not_callable_by_clients`,
`j17_notifications_cannot_be_edited` (direct UPDATE of title, body, read_at by the recipient and
others), `j17_mark_read_only_affects_own_notifications` (foreign ids ignored, count 0),
`w3_mark_notifications_read_marks_selected_and_all`, `w3_mark_read_is_idempotent`,
`w3_mark_read_rejects_anon_and_oversized_lists`, `w3_notification_idempotency_no_duplicate` (same
key twice gives 1 row and the same id; the same key for another recipient gives 2 rows),
`w3_shop_decision_notifies_owner_once`, `w3_roster_link_notifies_owner_once`,
`w3_owner_unlink_notifies_worker`, `w3_notification_text_rejects_contact_data` (`@` and
phone-shaped title/body: 23514), `w3_roster_name_with_phone_falls_back_to_generic_label` (the link
still succeeds), `w3_no_private_data_in_notifications` (the seeded values never appear in title or
body), `w3_enqueue_for_deleted_recipient_returns_null`.
Changed: `001_migration_replay.test.sql`: the version list gains 20261024000007..10
(`replay_schema_migrations_has_baseline_w2_and_w3`), add `replay_w3_tables_have_rls_enabled`;
`replay_definer_functions_pin_search_path` stays.
J18: `j18_existing_flows`, `j18_w2_profile_reads`, `j17_w2_fix1_fk_cascades` (its cascades now fire
the new AFTER triggers) and every other W1/W2 file stay `ok` with unchanged assertions. Add to
`j18_existing_flows` (plan +2, file stays at most 350 lines, else a new `j18_w3_flows.test.sql`):
`j18_super_admin_review_still_stamps_reviewer_with_audit`,
`j18_worker_link_and_unlink_still_work_with_audit`.
Smoke `scripts/supabase-test/w3-api-smoke.mjs` (same safety rules as w2: loopback only, keys read
from `supabase status` and never printed, synthetic `@local.test` users deleted afterwards):
PostgREST insert into both tables fails; `rpc('record_workforce_audit_event')` and
`rpc('enqueue_notification')` fail with a permission error; `rpc('set_config')` is not exposed;
audit select as a non-admin returns 0 rows; an admin approves a shop and the owner then lists
exactly 1 notification; `mark_notifications_read` returns 1, then 0; the service_role key cannot
update or delete audit rows. Must end `0 failed`.
Vitest (mocked repositories/client; no network):
`w3_supabase_notification_repository_selects_explicit_columns` (no `recipient_id`, no `*`),
`w3_supabase_notification_repository_mark_read_uses_rpc`,
`j17_notification_repository_never_sends_recipient_id`,
`w3_notification_service_dedupes_and_limits_mark_read_ids`,
`w3_notification_service_maps_rows_to_app_notifications`,
`w3_use_notifications_loading_empty_error_states`,
`w3_use_notifications_mark_read_updates_unread_count` (optimistic, rolled back on error),
`w3_use_notifications_polls_and_refreshes_on_focus` (fake timers),
`w3_notification_bell_shows_unread_count_and_accessible_label`,
`w3_notification_panel_marks_all_read`. The existing 36 stay green.

## 5. Frontend (UI -> hooks -> services -> repositories -> Supabase; files at most 350 lines)
Add: `domain/models/AppNotification.ts` (identifier, category, title, body, createdAt, isRead; named
to avoid the DOM `Notification` global); `domain/repositories/NotificationRepository.ts`
(listMyNotifications(limit), countMyUnread(), markRead(ids or null) returns number);
`infrastructure/repositories/SupabaseNotificationRepository.ts` (select `id, category, title, body,
created_at, read_at` newest first, limit 20; unread count via an exact head-only count filtered on
`read_at` null; rpc `mark_notifications_read`; errors via `toUserFacingError`; the recipient comes
from RLS, never from input); `application/services/NotificationService.ts` (limit 1..50, dedupe
ids, at most 200); `presentation/hooks/useNotifications.ts` (list + unread count; loading, empty,
error; markRead, markAllRead; polls every 60 s while the tab is visible and on window focus; no
Realtime); `presentation/dependencyInjection/createNotificationDependencies.ts`;
`presentation/components/notifications/NotificationBell.tsx` (IconButton + Badge, aria-label
"Notifications, N unread"), `NotificationPanel.tsx` (Drawer: list, EmptyState "No notifications
yet", error with retry, "Mark all as read"), `NotificationListItem.tsx` (title, body, relative time,
unread marker, "Mark as read").
Change: `presentation/components/AuthenticatedTopBar.tsx` renders `NotificationBell` before
`UserAccountMenu` for all roles (dependencies created once with `useMemo`, as WorkerWorkspaceGate).
Admin audit view: deferred to W11 (needs the admin dashboard layout; super_admin read is proven by
pgTAP and the smoke script). No router exists, so items carry no links in W3.

## 6. Docs
Add `docs/workforce/AUDIT_AND_NOTIFICATIONS.md`: P10-P14, the 3.4 action catalogue, payload and text
rules, the trusted retention-purge procedure, the realtime decision, limitations (rejections not
audited, a DB superuser can disable triggers, up to 60 s polling delay). Update
`ROLE_AND_PROFILE_SECURITY.md` (P8 becomes `public, pg_temp`; guard matrix rows; D-10 rows 17:
production signup function and other definer functions pin `pg_temp`; 18: no pre-existing
`notifications` / `workforce_audit_events` objects or same-named functions; 19: the publication
excludes both tables) and `LOCAL_TEST_HARNESS.md` (17 migrations, 13 pgTAP files, W3 smoke step).
RECORD (orchestrator): add the W3 smoke row to the LOOP.md check suite.

## 7. Check commands (repo root, local only)
`cd frontend && npm run lint`, `npm run build`, `npm test`; `backend/.venv/Scripts/python.exe -m pytest -q`;
`node --test scripts/supabase-test/stage-local-workdir.test.mjs`; `node scripts/supabase-test/run-db-tests.mjs`;
`node scripts/supabase-test/w2-api-smoke.mjs`; `node scripts/supabase-test/w3-api-smoke.mjs`; then
`npx supabase stop --workdir .local-supabase-test --no-backup` (from inside the staged workdir).

## 8. Acceptance criteria
| AC | Criterion | Evidence |
|---|---|---|
| AC1 | 4 new migrations `2026_10_24_w3[a-d]_<snake>.sql`, each with `-- ROLLBACK`; no committed migration changed | `ls supabase/migrations/2026_10_24_w3*`; `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_24_w3*` empty; `git diff --name-status a2517d0 -- supabase/migrations` shows only `A` lines for w3 files |
| AC2 | Clean replay of 17 migrations | runner reset output; `replay_schema_migrations_has_baseline_w2_and_w3`, `replay_w3_tables_have_rls_enabled` |
| AC3 | Suite PASS, 0 TODO | `grep -c "todo_start(" supabase/tests/database/*.sql` all 0; `Result: PASS`; 0 `Failed (TODO)` |
| AC4 | R-1 | `j17_definer_functions_pin_pg_temp_last`, `j17_definer_function_ignores_temp_table_shadowing`, `replay_definer_functions_pin_search_path` |
| AC5 | Audit append-only, server-only insert | `j17_audit_direct_insert_rejected_for_all_roles`, `j17_audit_update_rejected_for_all_roles`, `j17_audit_delete_rejected_for_all_roles`, `j17_audit_truncate_rejected`, `j17_audit_trusted_retention_purge_path_allows_delete`, `j17_audit_record_function_not_callable_by_clients`, `j17_audit_actor_fields_derived_not_passed`, `j17_audit_created_at_cannot_be_backdated` |
| AC6 | Audit read access | `j17_audit_readable_only_by_super_admin`, `w3_shop_review_log_view_is_super_admin_only` |
| AC7 | Audit on each wired action; R-4 | every `w3_audit_written_on_*` name in section 4, `w3_shop_review_history_survives_reviewer_deletion`, `w3_failed_link_attempt_writes_no_link_event` |
| AC8 | No private leak | `j17_audit_payload_rejects_contact_and_free_text`, `w3_no_private_data_in_audit_payloads`, `w3_notification_text_rejects_contact_data`, `w3_no_private_data_in_notifications`, `w3_roster_name_with_phone_falls_back_to_generic_label` |
| AC9 | Notification isolation and mutation rules | `j17_notifications_recipient_isolation`, `j17_notifications_direct_insert_rejected`, `j17_notifications_enqueue_not_callable_by_clients`, `j17_notifications_cannot_be_edited`, `j17_mark_read_only_affects_own_notifications`, `w3_mark_read_rejects_anon_and_oversized_lists` |
| AC10 | Idempotency and producers | `w3_notification_idempotency_no_duplicate`, `w3_shop_decision_notifies_owner_once`, `w3_roster_link_notifies_owner_once`, `w3_owner_unlink_notifies_worker`, `w3_mark_read_is_idempotent`, `w3_mark_notifications_read_marks_selected_and_all`, `w3_enqueue_for_deleted_recipient_returns_null` |
| AC11 | Realtime exclusion | `j17_audit_and_notifications_not_in_realtime_publication`; `grep -rn "postgres_changes" frontend/src` shows no notifications channel |
| AC12 | PostgREST surface | `w3-api-smoke.mjs` ends `0 failed`; `w2-api-smoke.mjs` still `48 passed, 0 failed` |
| AC13 | Frontend | the 10 Vitest names in section 4 pass; the existing 36 pass; lint and build exit 0; `grep -rn "service_role" frontend/src` empty |
| AC14 | J18 regression | every pre-W3 pgTAP file `ok` (incl. `j17_w2_fix1_fk_cascades`); the 2 new j18 names pass; pytest `4 passed`; stager 18/18 |
| AC15 | Size and safety | `wc -l` of every added/changed file at most 350; no `.env` read; no `db push`, `--linked`, `link`; `git diff --stat a2517d0 -- backend` empty; section 6 docs exist |

## 9. Rollback
Per-file `-- ROLLBACK` blocks in reverse order d..a, local stack only. d: drop producer triggers,
functions, view. c: drop notification objects (inbox loss). b: drop audit objects (history loss;
export first with a trusted `copy`; besides the documented purge this is the only way audit rows
disappear). a: set `search_path = public` again (re-opens R-1). Frontend: revert the W3 commit.

## 10. Risks and legal-review flags
- R1 (D-10): production may already have same-named objects, or definer functions missing from the
  3.1 list; W3a NOTICE-logs missing signatures; D-10 rows 17-19.
- R2: a DB superuser/table owner can disable triggers or drop the table; append-only holds for every
  application role and service_role, not for a superuser (documented; W3-L3).
- R3: writer and purge flags rely on PostgREST not exposing `set_config` (W2 R3); smoke checks it.
- R4: AFTER triggers add writes to W2 paths (link RPC, shop review, cascades); a producer bug would
  fail the business action. Mitigated by safe labels, null for a missing recipient, J18/fk files.
- R5: payload/text filters are heuristics (keys, `@`, phone shapes), not complete; producers stay
  hand-written and reviewed, and no client can write. R6: 60 s polling delay. R7: audit rows keep
  pseudonymous user ids after account deletion (no FK, by design for R-4).
- Legal (to LEGAL_REVIEW_REGISTER in W13; no compliance claims in UI or docs): W3-L1 retention of
  audit rows (user ids, role snapshots) after account deletion and a retention period under the
  Data Privacy Act (RA 10173) need review; no period is claimed. W3-L2 notification content and any
  future email/SMS channel (consent, minimal content); W3 is in-app only. W3-L3 audit events are an
  internal operational trail, not a certified or tamper-proof legal record; never presented as
  evidence-grade. W3-L4 (with R-4) whether workers are notified when a shop loses verification:
  decided in W7/W10.
