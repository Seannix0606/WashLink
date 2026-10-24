# W3 - Audit events & notification foundation - LOG

## BUILD (database part) - workforce-db-engineer, 2026-10-24, HEAD a2517d0 (not committed)

Files added: `supabase/migrations/2026_10_24_w3a_definer_search_path_pin.sql`,
`..._w3b_workforce_audit_events.sql`, `..._w3c_notifications.sql`,
`..._w3d_audit_and_notification_producers.sql` (staged as `20261024000007..10`, each with a
`-- ROLLBACK` block); pgTAP `j17_w3_audit_events` (60), `j17_w3_audit_wiring` (31),
`j17_w3_notifications` (61), `j18_w3_flows` (21); `scripts/supabase-test/w3-api-smoke.mjs`;
`docs/workforce/AUDIT_AND_NOTIFICATIONS.md`.
Files changed: `001_migration_replay.test.sql` (plan 15 -> 16:
`replay_schema_migrations_has_baseline_w2_and_w3`, `replay_w3_tables_have_rls_enabled`),
`docs/workforce/LOCAL_TEST_HARNESS.md`, `docs/workforce/ROLE_AND_PROFILE_SECURITY.md` (P8, guard
matrix rows, D-10 rows 17-19), `loop/workforce/LOOP.md` (check-suite notes, W3 smoke row).
No committed migration edited (`git diff --name-status a2517d0 -- supabase/migrations` empty).

Local results (actual output, local Docker stack only):
- Pre-W3 baseline run: `Files=10, Tests=341`, `Result: PASS`.
- `node scripts/supabase-test/run-db-tests.mjs` after W3: 17 migrations applied
  (`00000000000000` .. `20261024000010`), `Files=14, Tests=515`, `Result: PASS`, every file `ok`
  (incl. `j17_w2_fix1_fk_cascades`, `j18_existing_flows`); `grep -c "todo_start("` 0 in every file.
- `node scripts/supabase-test/w2-api-smoke.mjs`: `48 passed, 0 failed`.
- `node scripts/supabase-test/w3-api-smoke.mjs`: `33 passed, 0 failed`.
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: 18 pass, 0 fail.
- No `W3a: ... not found` NOTICE (all 29 signatures exist locally); no runtime `W3d: notification
  ... skipped` WARNING in the DB log.
- Re-applying w3d on a live DB succeeded (idempotency spot check).

Deviations from PLAN.md (with reason):
1. Producer triggers use `AFTER UPDATE ... WHEN (old.x is distinct from new.x)` instead of
   `AFTER UPDATE OF <column>`: the S6 reset changes `verification_status` inside the BEFORE
   trigger, which is not in the UPDATE target list, so `UPDATE OF verification_status` would never
   fire for it. `shops_audit_verification` also fires when `washlink.submit_shop` names the row, so
   a pending -> pending resubmission in the same transaction (identical `now()`) is still audited.
2. `unlinked_by = account_deleted` is checked FIRST (plan lists it third): a cascade from any
   session (including a worker deleting their own account) is an account deletion.
3. Both tables also get explicit deny-all write policies (`wae_no_client_*`,
   `notifications_no_client_*`) in addition to "no client privilege"; strictly tighter.
4. Extra internal definer `enqueue_notification_safely(...)` (revoked from every client role):
   wraps `enqueue_notification` in an exception block so a notification problem never fails the
   business action (P14); it logs a WARNING.
5. J18 additions went to a new `j18_w3_flows.test.sql` (j18_existing_flows is at 343 lines):
   the 2 planned names plus `j18_owner_shop_delete_still_succeeds_with_audit`,
   `j18_owner_account_delete_still_succeeds_with_audit`,
   `j18_worker_account_delete_still_succeeds_with_audit` (21 assertions). So 14 pgTAP files, not 13.
6. Roster notification titles / the worker-unlink body were not fixed by the plan; chosen texts
   are in the API section below. 6 producer triggers (the plan rollback text says 7).
7. Per the plan schema: audit PK is `bigint identity` (not uuid); neither table has `updated_at`
   (audit rows are immutable; notifications change only `read_at`).

Not verified: production (D-10 rows 17-19 open); frontend, Vitest, lint, build and pytest were
not run by this step (frontend part is a separate BUILD step).

## API for the frontend engineer (W3)

All reads/writes go through RLS-scoped PostgREST; the recipient is ALWAYS `auth.uid()` from the
JWT. Never send `recipient_id`, never select `*`.

### Table `public.notifications` (SELECT only, own rows)

Select exactly `id, category, title, body, created_at, read_at`, newest first:

```ts
supabase.from('notifications')
  .select('id, category, title, body, created_at, read_at')
  .order('created_at', { ascending: false })
  .limit(20)
// row: { id: string (uuid), category: string, title: string, body: string,
//        created_at: string (timestamptz ISO), read_at: string | null }
```

Unread count (head-only exact count):

```ts
supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
// -> { count: number }
```

INSERT / UPDATE / DELETE from the client always fail with 42501. Anon cannot read.

### RPC `mark_notifications_read`

```ts
supabase.rpc('mark_notifications_read', { p_notification_ids: string[] })   // selected ids
supabase.rpc('mark_notifications_read', {})                                 // all unread of the caller
// -> data: number (rows changed: unread -> read). Already-read, foreign or unknown ids count 0.
```

Errors: `42501` "Sign in to manage notifications." (no session); `22023` "Mark at most 200
notifications at a time." (more than 200 ids). Idempotent: a repeat returns 0.

### Notification types (category, title, body)

| category | recipient | title | body |
|---|---|---|---|
| `shop_verification.status_changed` | shop owner | `Shop verification updated` | `<shop name> is now Approved.` / `... Rejected.` / `... Changes requested.` / `... Pending review.` (shop name replaced by `Your shop` if it is over 60 chars or contains `@` / a phone-like number) |
| `roster.linked` | roster owner | `Roster worker linked` | `<roster name> is now linked to a worker account.` (fallback `A roster entry`) |
| `roster.unlinked` | roster owner (worker unlinked) | `Roster link removed` | `<roster name> is no longer linked to a worker account.` |
| `roster.unlinked` | worker (owner unlinked, or owner deleted the linked roster row) | `Roster link removed` | `A shop removed the link between your account and its roster.` |
| `roster.unlinked` | worker (owner account closed; roster row cascade-deleted) | `Roster link removed` | `A roster link ended because the shop's account was closed.` (added in Review polish) |

Treat unknown categories generically (W4+ will add more). `subject_type` / `subject_id` exist in
the table (`shop`, `roster_entry`) but are not part of the W3 select list (no router; no links).
Notifications are NOT on Realtime: poll (60 s while visible, and on window focus).

### Not callable from the frontend

`record_workforce_audit_event`, `enqueue_notification`, `enqueue_notification_safely`: 42501 for
anon, authenticated and service_role. `public.workforce_audit_events` and the view
`public.shop_verification_review_log` (`event_id, shop_id, action, from_status, to_status,
reviewed_by, actor_role, created_at`) are readable by super_admin only (others get 0 rows, anon
42501); the admin audit UI is W11, so W3 frontend code should not use them.

## BUILD (frontend part) - frontend engineer, 2026-10-24, HEAD a2517d0 (not committed)

Files added (all under `frontend/src/`, each at most 216 lines): `domain/models/AppNotification.ts`
(`AppNotification` + `StoredNotification`), `domain/repositories/NotificationRepository.ts`,
`infrastructure/repositories/SupabaseNotificationRepository.ts`,
`application/services/NotificationService.ts`, `presentation/hooks/useNotifications.ts`,
`presentation/dependencyInjection/createNotificationDependencies.ts`,
`presentation/components/notifications/{NotificationBell,NotificationPanel,NotificationListItem,NotificationCenter}.tsx`;
tests `SupabaseNotificationRepository.w3.test.ts` (3), `NotificationService.w3.test.ts` (2),
`useNotifications.w3.test.ts` (3), `NotificationCenter.w3.test.tsx` (2) = the 10 planned names.
Files changed: `presentation/components/AuthenticatedTopBar.tsx` (renders `NotificationCenter`
before `UserAccountMenu` for every role; service created once with `useMemo`),
`infrastructure/supabase/supabaseErrorMessages.ts` (passes through the two `mark_notifications_read`
messages), `test/fixtures.ts` (notification fixtures + mock repository),
`presentation/components/owner/OwnerDashboardTopBar.tsx` (see deviation 3).

API use: exactly the LOG API section (select `id, category, title, body, created_at, read_at`,
newest first, limit 20; head-only exact count with `.is('read_at', null)`;
`rpc('mark_notifications_read', { p_notification_ids })` / `{}`). No `recipient_id`, no `*`, no
audit table/view, no Realtime channel. Title/body rendered as React text nodes only (a test asserts
an `<img ...>` body stays text). Unknown categories render generically.

Behaviour: polls every 60 s only while `document.visibilityState === 'visible'`, refreshes on
window `focus`; cleanup clears the interval and listener and bumps a request generation so
in-flight responses after unmount/sign-out are discarded. `NotificationCenter` is keyed by the
signed-in user id and returns null when signed out (logout unmounts it). Mark-read and
mark-all-read are optimistic and rolled back with a `sonner` error toast on failure. Service:
limit clamped to 1..50, mark-read ids deduped, non-uuid ids dropped, more than 200 rejected
client-side with the DB message, empty list makes no request.

Deviations: 1. The drawer is rendered through `createPortal(document.body)`: the sticky top bar
uses `backdrop-blur`, which would make a `fixed` drawer clip inside the header. 2. Added
`NotificationCenter.tsx` (container: hook + open state) so the bell and panel stay presentational.
3. The existing owner new-booking alert button in `OwnerDashboardTopBar` was also labelled
"Notifications"; relabelled "Show new booking requests" (icon `BellRing`) so two controls do not
share one accessible name. Behaviour unchanged. 4. Admin audit view deferred to W11 (as planned).

Results (actual output, `frontend/`): `npm run lint` -> exit 0, no problems; `npm run build` ->
`tsc -b` 0 errors, `vite build` `built in 494ms`; `npm test` -> `Test Files 28 passed (28)`,
`Tests 46 passed (46)` (36 existing + 10 new); no act() warnings. `grep -rn "service_role" frontend/src`
and `dangerouslySetInnerHTML` empty. Not verified: the UI against the live local stack (no browser
run in this step); supabase/ and scripts/ untouched.

## Review polish - workforce-db-engineer, 2026-10-24, HEAD a2517d0 (not committed)

Edited in place (uncommitted W3 files only; `git diff --name-status a2517d0 -- supabase/migrations` empty):
1. w3d preflight `do $$` block (top of file): aborts with `W3d preflight: missing columns/functions
   required by the audit producers: <list> (D-10 row 20)` if any of the 25 columns (shops, workers,
   worker_roster_link_codes, worker_profiles, profiles, workforce_audit_events) or 5 functions the
   producers read is missing. New D-10 row 20 in ROLE_AND_PROFILE_SECURITY.md.
2. `enqueue_notification_safely` catches only `check_violation`, `unique_violation`,
   `foreign_key_violation`, `not_null_violation`; everything else is re-raised. The null / unknown
   recipient case already returns null inside `enqueue_notification` (no exception involved).
3. w3a: a missing listed signature now raises (no NOTICE path); final block raises if any SECURITY
   DEFINER function in `public` / `washlink_private` lacks `pg_temp` in proconfig, excluding only
   `public.handle_new_user()` (0 args). D-10 row 17 text updated.
4. `audit_roster_linked_delete`: if the owner profile no longer exists (cascade from owner account
   deletion) the worker gets `A roster link ended because the shop's account was closed.` and the
   payload `unlinked_by` is `owner_account_deleted` (was `roster_entry_deleted`); an owner-initiated
   row delete keeps `roster_entry_deleted` and the "A shop removed ..." text.
5. S6 reset: premise not reproduced. The S6 reset was already audited as the distinct action
   `shop.verification_reset_by_identity_change` with no notification: W2b's
   `prevent_owner_verification_mutation` returns early for super_admin and trusted sessions, so the
   reset only happens for non-admin callers and can never reach the `verification_decided` branch.
   Kept the existing action name (renaming would only churn docs/tests); added tests proving 0
   `shop.verification_decided` events and 0 notifications for the reset shop.
6. W3-L5: the payload `reviewed_by` is `new.verification_reviewed_by`, which W2b stamps server-side
   (`auth.uid()`) for every super_admin status change and ignores client input. So it equals
   actor_id for super_admin decisions; for a trusted-session decision it is whatever that SQL set.
   The LEGAL_FLAGS W3-L5 wording "client-supplied" is outdated; documented in
   AUDIT_AND_NOTIFICATIONS.md; new test with a spoofed reviewer asserts payload.reviewed_by = actor_id.
7. AUDIT_AND_NOTIFICATIONS.md: trusted SQL session setting `request.jwt.claims` is recorded as
   `actor_kind = 'user'` (Limitations, W3-L3); also P10/P14, action catalogue and text table updated.

Tests added (+7 assertions): `j17_w3_audit_wiring` 31 -> 35
(`w3_decision_payload_reviewed_by_equals_actor_id`, 2x `w3_shop_identity_reset_is_not_a_decision`,
`w3_owner_row_delete_notifies_worker_shop_removed`); `j17_w3_notifications` 61 -> 63
(`w3_safe_enqueue_skips_data_errors`, `w3_safe_enqueue_reraises_permission_errors`: replaces
`enqueue_notification` inside the test transaction with one raising 42501 and asserts it
propagates); `j18_w3_flows` 21 -> 22 (`j18_owner_account_delete_notifies_worker_neutral_text`;
expected `unlinked_by` changed to `owner_account_deleted`); `j17_w3_audit_events` last R-1
assertion now also covers `washlink_private` (count unchanged).

Actual output (local Docker stack only):
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: tests 18, pass 18, fail 0.
- `node scripts/supabase-test/run-db-tests.mjs`: exit 0; 17 migrations applied (`00000000000000` ..
  `20261024000010`) with no W3a/W3d exception; every file `ok`; `Files=15, Tests=546`,
  `Result: PASS`. Only WARNING: the intentional `W3d: notification test.safe skipped (SQLSTATE 23514)`.
- Manual negative check (psql in `supabase_db_washlink-local-test`, rolled back): renaming
  `workers.name` and `shops.verification_reviewed_at` then running the preflight gave
  `ERROR: W3d preflight: missing columns/functions required by the audit producers:
  shops.verification_reviewed_at, workers.name (D-10 row 20)`; creating an unpinned definer
  `public.zz_unpinned()` then running the w3a final block gave
  `ERROR: W3a: SECURITY DEFINER functions without pg_temp in search_path: zz_unpinned() (pin them; D-10 row 17)`.
- `node scripts/supabase-test/w2-api-smoke.mjs`: `48 passed, 0 failed`.
- `node scripts/supabase-test/w3-api-smoke.mjs`: `33 passed, 0 failed`.
- `npx supabase stop --workdir . --no-backup` (inside `.local-supabase-test`): `Stopped supabase local development setup.`

Frontend: no code change required. Categories are unchanged (`roster.unlinked`); the new body text
is rendered generically and no frontend file or fixture hard-codes the old text (grep). The
frontend engineer may optionally add a fixture for the new text.
Notes: w3d reached 375 lines with the preflight; split out below (follow-up).
Not verified: production (D-10 rows 17-20 open); frontend lint/build/Vitest not re-run (no
frontend change); the migration-time aborts are proven by the manual psql check, not by pgTAP.

Follow-up (same day): preflight split into its own migration
`supabase/migrations/2026_10_24_w3d0_producer_schema_preflight.sql` (44 lines; DO block only, ROLLBACK
note "nothing to roll back"). Named `w3d0` because the stager sorts source names lexically and
`0` < `_`, so it lands between `w3c_notifications` and `w3d_audit...` (a `w3c2_` name would sort
BEFORE `w3c_`). w3d now 338 lines, header says it requires w3d0. 001 replay expected versions + `20261024000011`
(plan stays 16); LOCAL_TEST_HARNESS (18 migrations, 5 W3 copies `..07..11`, 15 files / 546) and
LOOP row (18 after W3 review polish) updated; D-10 row 20 and AUDIT doc point at w3d0. Stager test
fixtures are synthetic, no change needed.
Actual output: stager tests 18 pass / 0 fail; `run-db-tests.mjs` exit 0, 18 migrations applied,
staged order `...09_w3c_notifications`, `20261024000010_w3d0_producer_schema_preflight`,
`20261024000011_w3d_audit_and_notification_producers`; `Files=15, Tests=546`, `Result: PASS`;
w2 smoke `48 passed, 0 failed`; w3 smoke `33 passed, 0 failed`; stack stopped
(`Stopped supabase local development setup.`, 0 supabase containers).

## Orchestrator record (2026-10-24)
- REVIEW: security and compliance no BLOCKING; orchestrator requested non-blocking review polish (w3d0 preflight, narrowed exception handling, pin assertion, wording) before verify. REVIEW.md.
- VERIFY: PASS (VERDICT.md). Fix cycles: 0 (polish only).
