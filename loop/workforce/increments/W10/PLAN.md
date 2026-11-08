# W10 - Owner relationships & three-distinct-owner policy - PLAN

Spec: F (track worker-to-owner relationships independently of applications; count distinct verified owners, not contracts, shops,
openings or amendments; show count and remaining to the worker; define declined / expired / suspended / terminated / revoked; audit
relationship changes; configurable policy, default 3 unchanged; never block declining, leaving or terminating; goal vs legal
obligation), G, H (worker "Progress toward the three-distinct-owner business requirement"; owner "active relationships"), I (audit),
J13, J14, J15, J16, J17, J18.
Depends on W9 (`passed`, STATE.md, HEAD e43c2db) and D-3 (ADOPTED-DEFAULT (loop, 2026-10-27): progress metric only; qualifying =
`active`; declined / expired / terminated / revoked do not count; suspended does not count while suspended). No other OPEN decision is
needed; D-10 stays the standing (non-blocking) production-parity gate. Not BLOCKED.
Closes carry-forwards: W9 REVIEW C6 (count excludes contracts whose owner or shop is removed or unverified, counts distinct owner ids;
a trusted repair can no longer revive an ended contract into the count), W9-S1 / C1 status part (forward-only trusted repairs), W0-L1 /
W2-L2 code side (roster links, applications, training and certificates never count; the legal items stay OPEN).

Vocabulary gap, resolved here (D-36): W9 contracts have no `suspended` or `revoked` status. W10 does NOT add contract statuses (that
would change the W9 state machine and J10-J12). "Suspended" is a relationship-level, derived state: the worker has an active contract
with the owner but none of them is currently backed by a verified shop of that same owner. "Revoked" has no contract equivalent; the
nearest events (an owner withdrawing an offer, a trusted repair ending a contract) never count. Both are documented and tested (J15).

## 1. Scope / out of scope
In: `workforce_policies` (seeded `minimum_distinct_owners = 3`, super_admin-only change through an audited RPC, enforcement fixed to
`informational`); `worker_owner_relationships` (unique (worker, owner), derived from W9 contracts and kept in sync by triggers on
`worker_contracts`, `shops` and `profiles.role`; owner-removal and worker-removal handling); live derivation and distinct-owner count
functions; worker / owner read RPCs; audit producers; forward-only trusted contract repairs (replaces the W9 guard body in a NEW
migration); worker progress card + relationship list, owner relationship list, super_admin policy panel; pgTAP J13-J16 + J17 / J18 /
rules / audit files, Vitest, `w10-api-smoke.mjs`, docs, legal register.
Out (reason): any gate that uses the count (D-3: progress metric only; spec F); notifications for relationship changes (D-39; contract
events already notify, W12 owns wiring and de-duplication); super_admin / dispute reads of relationships (W11); scheduling of
`refresh_worker_owner_relationships` and `expire_worker_contracts` (W12); dashboards beyond the cards below (W11); "discover eligible
owners" as a new search (reuses the W5 marketplace: the card links to Find work); closing a pending amendment on a trusted terminate
(rest of W9-S1, W13). No production apply, no `.env`, no SQLAlchemy / Alembic tables, no change to any committed migration.

## 2. Design principles (continue P1-P54)
P55. Contracts are the source of truth. `worker_owner_relationships` is a derived, audited record: no client role (anon, authenticated,
service_role) has INSERT / UPDATE / DELETE; write policies deny-all; a BEFORE guard (every session) allows writes only under the
transaction-local flag `washlink.owner_relationship_write` = `<worker_id>:<owner_id>` set by the internal refresh, the owner-removal
FK set-null cascade (`is_orphaned_fk_set_null`) and the worker-removal cascade delete. A trusted session can NOT insert or edit rows.
P56. Qualifying contract (D-3 + C6), evaluated as of a Manila date `d` (default today): `c.worker_id = W`, `c.owner_id = O` (both not
null); `c.status = 'active'` and not (`c.end_date < d`) (same rule as `worker_contract_effective_status`, date parameterised);
`c.activated_at` not null and `c.ended_at` null; a `contract_acceptances` row with `party_role = 'worker'` for `c.current_version_id`
whose `version_content_hash` equals that version's `content_hash` (no fabricated acceptance can count); `c.shop_id` not null and
`shops.owner_id = O` (C6, W9-S4) and `shop_has_recorded_verification(c.shop_id)`; `profiles(O).role = 'owner'`.
P57. Count = `count(distinct c.owner_id)` over the worker's qualifying contracts (`worker_distinct_qualifying_owner_count(W, d)`),
computed live from contracts, never from relationship rows, contract rows, versions, shops, openings, applications, roster links
(W2-L2), training enrollments or certificates. Remaining = `greatest(minimum - count, 0)`; goal_reached = count >= minimum.
P58. Relationship status (one row per (worker, owner); created only when the first contract with that owner is ACCEPTED; drafts,
offers, declines and withdrawals never create one): `pending_start` (an accepted, not effectively expired, not started contract and no
active one), `active` (>= 1 qualifying contract: the only status that counts), `suspended` (an active, not ended contract exists but
none qualifies; reason `owner_verification_not_current` | `shop_removed` | `shop_owner_changed` | `owner_role_changed`), `ended`
(every contract with O is terminated / expired / effectively expired; reason `contract_terminated` | `contract_expired`),
`owner_removed` (owner account deleted; terminal; `owner_id` null, `owner_name_snapshot` kept for the worker). Precedence: active >
suspended > pending_start > ended.
P59. Informational only (D-3, spec F, J16): `workforce_policies.enforcement` CHECK = `informational` (changing it needs a new migration
and legal review). No W9 RPC, guard, validator or RLS policy, and no W10 trigger, reads `workforce_policies`; only the three W10 read
RPCs and the setter do (static pgTAP check over `pg_proc.prosrc`). Sync triggers are AFTER triggers with no RAISE on any contract or
relationship state; decline / terminate are tested in every relationship state and with the minimum raised.
P60. Policy governance (D-37): one row per policy key; seeded with `on conflict do nothing` (never overwrites); `default_value` (3) is
immutable and shown next to the current value; changes only through `set_workforce_policy_value` by a super_admin (JWT + profile role
via `is_super_admin()`), with expected revision and a reason (10..300, stored as `last_change_reason`, never in the audit payload); a
trusted no-JWT SQL session may also update (audited `trusted_session`). Range 1..10. No delete.
P61. Privacy (D-38): the worker reads own relationships and progress; an owner reads only its own relationship rows (worker display
name snapshot, status, reason, own contract counts) and never the worker's total, remaining, goal or other owners; super_admin reads
the policy and the W3 audit only; customers / anon nothing. Reads expose no contacts, contract text, pay, end reasons or notes.
P62. Audit (W3 rules): `worker_owner_relationship.created`, `.status_changed`, `.owner_removed`, `.deleted`; `workforce_policy.changed`.
Payloads: ids, status / reason words, `counts_toward_goal`, `qualifying_contract_count`, `from_value` / `to_value` / `revision`,
`changed_by`; never names, free text, dates or another owner's ids. A refresh that leaves status / reason / count unchanged writes
nothing. No notifications (D-39). No W10 table in `supabase_realtime`.
P63. Live vs stored: every read derives status live (as of Manila today), so a passed end date shows `ended` before
`expire_worker_contracts` runs; the stored row is refreshed on every contract / shop / owner-role change and by the internal
`refresh_worker_owner_relationships(p_as_of)` (W12 schedules it). pgTAP asserts stored = live after every transition.
P64. Forward-only trusted repairs (D-40; W9-S1 / C1 status part): a trusted, no-JWT update of `worker_contracts` may only move
`accepted` / `active` -> `terminated` / `expired` (or repair stamps without a status change on accepted / active rows); it can never
leave `declined`, `withdrawn`, `expired`, `terminated`, never enter `draft`, `sent_for_review`, `accepted` or `active`, and never null
`ended_at`. Every other W9 guard behaviour is copied verbatim.

## 3. Migrations (`2026_10_28_w10<x>_<snake>.sql`, staged 20261028000001..07; 69 migrations after W10; each ends with `-- ROLLBACK`; each <= 350 lines)
Idempotent; `notify pgrst, 'reload schema';` last; every function `set search_path = public, pg_temp` and comment `W10: ...`; `revoke
all ... from public, anon` (+ `authenticated`, `service_role` for internal and trigger functions); client RPCs `grant execute ... to
authenticated` only. Lock order: `worker_contracts` row (W9 RPC) -> `shops` row (W9 FOR SHARE, or the row being updated) ->
`pg_advisory_xact_lock(hashtextextended('w10:' || worker || ':' || owner, 0))` -> relationship row. The refresh derives AFTER taking the
advisory lock (a new statement snapshot under READ COMMITTED, so concurrent changes for one pair serialise). Shop triggers take pair
locks in (worker_id, owner_id) order.
### 3.1 `2026_10_28_w10a_owner_relationships_preflight.sql` (creates nothing)
Abort naming each missing item: `worker_contracts.{status, owner_id, shop_id, worker_id, activated_at, ended_at, accepted_at,
current_version_id, end_date, owner_name_snapshot, worker_name_snapshot}`, `contract_versions.content_hash`,
`contract_acceptances.{party_role, version_id, version_content_hash}`, `shops.{owner_id, verification_status, verification_reviewed_by,
verification_reviewed_at, is_active}`, functions `worker_contracts_guard_write`, `worker_contract_effective_status`,
`shop_has_recorded_verification`, `record_workforce_audit_event`, `is_trusted_db_session`, `is_orphaned_fk_set_null`,
`current_user_profile_role`, `is_super_admin`, `worker_contract_changed_by`, `contract_template_normalize_text`. Abort if any
`public.workforce_polic%` or `public.worker_owner_relationship%` relation or function exists without a `W10` comment (D-10).
Rollback: nothing.
### 3.2 `2026_10_28_w10b_worker_contract_forward_only_repairs.sql`
`create or replace function public.worker_contracts_guard_write()` = the w9c body verbatim except the trusted branch (P64): 42501
`Contracts are changed only through WashLink.` when `old.status` in (declined, withdrawn, expired, terminated) and anything but
`updated_at` changes, when `old.status` not in (accepted, active), when `new.status` not in (`old.status`, terminated, expired), or when
`ended_at` goes to null. Same revokes; comment `W9: worker contracts (created by the W9 migrations). W10: forward-only trusted repairs.`
(keeps the w9a marker). Trigger unchanged. ROLLBACK: the complete w9c function body, copied into the comment block.
### 3.3 `2026_10_28_w10c_workforce_policies.sql`
`workforce_policies`: id uuid PK; policy_key text UNIQUE CHECK in ('minimum_distinct_owners'); integer_value int NOT NULL;
default_value int NOT NULL; enforcement text NOT NULL default 'informational' CHECK (= 'informational'); description text 20..300;
revision int >= 1 default 1; last_change_reason text (null or 10..300); updated_by uuid FK profiles on delete set null; created_at,
updated_at. CHECK `wp_minimum_owner_range`: policy_key <> 'minimum_distinct_owners' or (integer_value between 1 and 10 and
default_value = 3). Seed (`on conflict (policy_key) do nothing`): ('minimum_distinct_owners', 3, 3, 'informational', 'Number of
different verified shop owners with an active contract that WashLink shows to workers as a progress goal. Informational only.').
Guard `workforce_policies_guard_write` (BEFORE, every session): INSERT only in a trusted no-JWT session; DELETE always 42501
`Workforce policies cannot be deleted.`; UPDATE only under flag `washlink.workforce_policy_write` = id or in a trusted no-JWT session,
else 42501 `Workforce policies are changed only by a platform administrator.`; `id`, `policy_key`, `default_value`, `enforcement`,
`created_at` never change (42501); stamps revision + 1, updated_at, updated_by = auth.uid(). RLS: select for authenticated using
`auth.uid() is not null`; deny-all insert / update / delete policies; `revoke all` from public, anon, authenticated, service_role, then
`grant select ... to authenticated`.
RPC `set_workforce_policy_value(p_policy_key text, p_new_value integer, p_expected_revision integer, p_change_reason text) returns
public.workforce_policies` (definer), checks in order: `auth.uid()` not null and `is_super_admin()` else 42501 `Only a platform
administrator can change workforce policies.`; row FOR UPDATE, unknown key -> 22023 `Unknown workforce policy.`; revision differs ->
55000 `This policy changed. Reload it and try again.`; value outside 1..10 -> 23514 `Choose a whole number from 1 to 10.`; reason
(normalised) not 10..300 -> 23514 `Give a reason of 10 to 300 characters.`; same value -> 23514 `This is already the current value.`.
Producer `workforce_policies_audit` (AFTER UPDATE when integer_value changes): `workforce_policy.changed`, subject_type
`workforce_policy`, subject_id = id, payload {policy_key, from_value, to_value, revision, changed_by}. Realtime exclusion.
ROLLBACK: drop RPC, producer, guard, table (IRREVERSIBLE loss of a changed value and reason; the audit keeps from / to values).
### 3.4 `2026_10_28_w10d_worker_owner_relationships.sql`
`worker_owner_relationships`: id uuid PK; worker_id uuid NOT NULL FK worker_profiles(profile_id) ON DELETE CASCADE; owner_id uuid FK
profiles(id) ON DELETE SET NULL; owner_name_snapshot, worker_name_snapshot text NOT NULL (<= 200, copied from the contract snapshots);
status CHECK in (pending_start, active, suspended, ended, owner_removed); status_reason CHECK in (contract_accepted_not_started,
contract_active, owner_verification_not_current, shop_removed, shop_owner_changed, owner_role_changed, contract_terminated,
contract_expired, owner_account_removed); counts_toward_goal boolean GENERATED ALWAYS AS (status = 'active') STORED;
qualifying_contract_count int >= 0; first_accepted_at timestamptz NOT NULL; last_active_at, ended_at, owner_removed_at,
status_changed_at, created_at, updated_at; revision int >= 1. Constraints: unique `wor_worker_owner_unique (worker_id, owner_id)`
(nulls distinct: removed-owner rows never collide); `wor_owner_removed_consistency` ((status = 'owner_removed') = (owner_id is null),
owner_removed has owner_removed_at); `wor_reason_matches_status` (each reason belongs to exactly one status); active ->
qualifying_contract_count >= 1, every other status -> 0; ended -> ended_at not null. Indexes (worker_id, status), (owner_id, status).
Guard `worker_owner_relationships_guard_write` (BEFORE, every session): INSERT / UPDATE only under the P55 flag equal to
`new.worker_id:new.owner_id`; an UPDATE that is `is_orphaned_fk_set_null` of owner_id sets status owner_removed, reason
owner_account_removed, owner_removed_at, qualifying_contract_count 0; `id`, `worker_id`, `first_accepted_at`, `created_at` never
change; an owner_removed row never changes again; DELETE only when the worker profile no longer exists (cascade), else 42501 `Owner
relationships are kept by WashLink.`; other writes without the flag -> 42501 `Owner relationships are changed only by WashLink.`;
stamps revision, updated_at, status_changed_at. RLS select: worker (`worker_id = auth.uid()` and role worker) or owner (`owner_id =
auth.uid()` and role owner); deny-all write policies; grants as w10c. Realtime exclusion of both W10 tables (abort if
`supabase_realtime` is FOR ALL TABLES, as w9i).
ROLLBACK: drop guard and table (IRREVERSIBLE: trusted `copy` first; fully re-derivable from contracts by re-applying d..g).
### 3.5 `2026_10_28_w10e_owner_relationship_derivation_and_sync.sql` (internal: revoked from every client role, definer, pinned)
`worker_contract_qualifies(p_contract_id uuid, p_as_of date) returns boolean` (P56). `worker_owner_relationship_derive(p_worker uuid,
p_owner uuid, p_as_of date) returns table(status, status_reason, qualifying_contract_count, first_accepted_at, has_accepted_contract)`
(P58 precedence; a suspended reason is the first of shop_removed / shop_owner_changed / owner_role_changed /
owner_verification_not_current among the non-qualifying active contracts; ended is contract_expired when the most recently ended
contract expired or is effectively expired, else contract_terminated). `worker_distinct_qualifying_owner_count(p_worker uuid, p_as_of
date) returns integer` (P57). `refresh_worker_owner_relationship(p_worker uuid, p_owner uuid)`: no-op when either is null, or when no
accepted contract and no row exist for the pair; takes the pair advisory lock, derives as of today, sets the flag, upserts (`on
conflict (worker_id, owner_id) do update ... where` status, reason or count differ), clears the flag; no RAISE for any contract state.
`refresh_worker_owner_relationships(p_as_of date default null)`: refuses a past date (22023 `The refresh date cannot be in the
past.`), refreshes every pair with an accepted contract, returns rows changed (W12 schedules it). Triggers:
- `worker_contracts_sync_owner_relationship` AFTER INSERT OR UPDATE on `worker_contracts` when status, owner_id, shop_id, worker_id,
  end_date, activated_at, ended_at, accepted_at or current_version_id change: refresh (new.worker_id, new.owner_id) and, if the pair
  changed, (old.worker_id, old.owner_id). Null halves are skipped: owner removal is handled by the FK set-null on the relationship row
  (w10d guard), worker removal by the cascade delete.
- `shops_sync_owner_relationships` AFTER UPDATE OF verification_status, verification_reviewed_by, verification_reviewed_at, is_active,
  owner_id on `shops`: refresh every (worker, owner) pair with an accepted contract at that shop. Shop DELETE needs no trigger (the
  contract `shop_id` set null fires the contract trigger).
- `profiles_sync_owner_relationships` AFTER UPDATE OF role on `profiles` (trusted repair only, D-8): refresh that owner's pairs.
### 3.6 `2026_10_28_w10f_owner_relationship_reads.sql` (definer, scoped to `auth.uid()`; wrong role or no JWT -> 0 rows)
`my_owner_relationship_progress()` (worker): minimum_distinct_owners, default_minimum, qualifying_owner_count (live, P57),
remaining_owner_count, goal_reached, enforcement, policy_revision, counted_as_of (Manila date). `my_owner_relationships()` (worker):
relationship_id, owner_name (snapshot), owner_removed, shop_names text[] (shop name snapshots of this worker's accepted contracts with
that owner), status / status_reason / counts_toward_goal (live), qualifying_contract_count, accepted_contract_count,
first_accepted_at, status_changed_at; ordered active, suspended, pending_start, ended, owner_removed, then name.
`owner_worker_relationships()` (owner): relationship_id, worker_id, worker_name (snapshot), status, status_reason (live),
contracts_with_you_count, first_accepted_at, status_changed_at; no goal, count, remaining or other-owner data. All three granted to
authenticated only.
### 3.7 `2026_10_28_w10g_owner_relationship_audit.sql`
Producer `worker_owner_relationships_audit` (AFTER INSERT / UPDATE / DELETE): INSERT -> `worker_owner_relationship.created`
{relationship_id, worker_id, owner_id, to_status, status_reason, counts_toward_goal, qualifying_contract_count, changed_by}; a status,
reason or count change -> `.status_changed` (+ from_status) or `.owner_removed`; DELETE -> `.deleted` {deleted_by:
worker_account_deleted}. subject_type `worker_owner_relationship`, subject_id = relationship id, subject_profile_id = worker_id;
`changed_by` via `worker_contract_changed_by()`. Then the backfill: `refresh_worker_owner_relationship` for every distinct (worker_id,
owner_id) with `accepted_at` not null (audited `trusted_session`). Then the `W10` comment on every W10 function (a missing one aborts).
ROLLBACK: drop the producer trigger and function; audit rows stay.

## 4. State machines
Relationship (applied by the sync triggers; "caused by" is the actor whose action triggers it; nobody writes it directly):
| From | To | Caused by | Condition |
|---|---|---|---|
| (none) | pending_start | worker (W9 accept of an initial version) | first accepted contract with this owner |
| (none) | any derived | system (w10g backfill) | derived from existing contracts |
| pending_start | active | owner (W9 activate) | a qualifying contract (P56) |
| active | suspended | super_admin (review change), owner (shop `is_active` false, shop deleted), super_admin (shop owner transfer), trusted SQL (owner role) | no qualifying contract left but an active, not ended one |
| suspended | active | super_admin (verification recorded again); owner (another qualifying contract started) | a qualifying contract again |
| pending_start / active / suspended | ended | worker or owner (W9 terminate), system (`expire_worker_contracts`; effective expiry in reads), trusted SQL (forward-only repair) | no accepted / active, not ended contract left |
| ended | pending_start / active | owner + worker (a new contract with the same owner accepted / started) | same row reused (J14) |
| any except owner_removed | owner_removed | owner account deleted (FK set null) | terminal |
| any | (deleted) | worker account deleted (cascade) | audited `.deleted` |
Never a transition: drafts, sent offers, declined, withdrawn, amendments sent / declined / withdrawn (an accepted amendment only
changes dates, which the refresh re-evaluates).
Policy: `minimum_distinct_owners` integer_value v -> v' (1..10, v' <> v) by super_admin (RPC, expected revision, reason) or trusted SQL;
enforcement and default_value never change; no insert or delete by any client.
Contract (w10b, trusted no-JWT session only): accepted / active -> terminated / expired; anything else refused (P64). W9 RPC
transitions unchanged.
Refused for everyone: direct writes to both W10 tables by owner, worker, customer, anon, service_role; policy changes by owner, worker,
customer or a service_role JWT; reads of another party's relationship rows; owner reads of a worker's progress.

## 5. Decisions taken in this plan (RECORD adds to DECISIONS.md as ADOPTED-DEFAULT (loop, 2026-10-28))
D-36 Relationship rows start at the first ACCEPTED contract; statuses per P58; "suspended" is relationship-level (verification lapse,
shop removed or transferred, owner role changed) and lifts automatically; "revoked" has no contract equivalent and never counts.
D-37 `minimum_distinct_owners` default 3, range 1..10, changed only by super_admin via an audited RPC with a reason; enforcement fixed
`informational` by CHECK.
D-38 Owners see only their own relationship rows with a worker, never the worker's count, remaining or other owners; super_admin has
no relationship read in W10 (W11 disputes).
D-39 No relationship notifications in W10 (contract events already notify; W12 decides).
D-40 Trusted contract repairs are forward-only (accepted / active -> terminated / expired).

## 6. Tests (pgTAP `plan(n)` = actual; 0 `todo_start(`; each file <= 350 lines)
Helpers: NEW `scripts/supabase-test/baseline/test_helpers_owner_relationships.sql` (5th `HELPERS_SOURCE_NAMES` entry;
`stager_seeds_every_helper_file_in_order` updated; still 19 pass): `create_accepted_test_contract(p_owner_email, p_shop, p_worker,
p_worker_email, p_end_date default null)` (trusted accepted application, then the REAL W9 RPCs: draft, fill, send, accept),
`create_active_test_contract(...)` (same, then the owner activates), `relationship_row(p_worker, p_owner)` (stored status, reason,
count), `relationship_live(p_worker, p_owner)`. No helper inserts a relationship, a policy or an acceptance.
`j13_three_distinct_qualifying_owner_relationships_counted.test.sql` (J13): j13_no_relationships_count_zero_remaining_three,
j13_one_active_contract_counts_one_remaining_two, j13_three_distinct_verified_owners_count_three_goal_reached,
j13_fourth_owner_counts_four_remaining_zero_not_negative, j13_unverified_owner_shop_not_counted,
j13_count_uses_distinct_owner_ids_not_rows, j13_policy_minimum_read_from_workforce_policies_default_three,
j13_policy_change_updates_remaining_not_count, j13_progress_read_matches_live_count_function.
`j14_same_owner_contracts_and_amendments_count_once.test.sql` (J14): j14_two_shops_same_owner_two_active_contracts_count_once,
j14_relationship_row_unique_per_worker_and_owner, j14_accepted_amendment_keeps_count_and_single_row,
j14_pending_amendment_does_not_change_count, j14_new_contract_after_termination_reuses_same_relationship_row,
j14_trusted_duplicate_relationship_insert_refused, j14_one_verified_shop_of_owner_suffices_when_other_unverified.
`j15_relationship_counting_policy_for_each_status.test.sql` (J15): j15_draft_and_sent_offer_create_no_relationship,
j15_declined_offer_not_counted, j15_withdrawn_offer_not_counted, j15_accepted_not_started_pending_start_not_counted,
j15_active_counted, j15_terminated_by_worker_ended_not_counted, j15_terminated_by_owner_ended_not_counted,
j15_expired_by_function_ended_not_counted (`expire_worker_contracts(today + n)`, as W9), j15_effectively_expired_not_counted_live
(derive / count with `p_as_of` after the end date), j15_shop_verification_lost_suspended_not_counted,
j15_verification_restored_reinstated_counted, j15_shop_inactive_suspended, j15_shop_owner_transfer_suspended,
j15_shop_deleted_suspended_shop_removed, j15_owner_account_deleted_owner_removed_not_counted,
j15_no_revoked_or_suspended_contract_status_exists (reads `wc_status_check`), j15_roster_link_application_training_and_certificate_never_count,
j15_stored_status_matches_live_after_each_transition.
`j15_w10_trusted_contract_repair_rules.test.sql` (C6, D-40): w10_trusted_repair_cannot_revive_terminated_contract,
w10_trusted_repair_cannot_reopen_declined_or_withdrawn, w10_trusted_repair_cannot_activate_accepted_contract,
w10_trusted_repair_cannot_null_ended_at, w10_trusted_repair_active_to_terminated_allowed_and_ends_relationship,
w10_w9_guard_behaviour_otherwise_unchanged (flag writes, cascades, locked columns).
`j16_three_owner_rule_never_blocks_decline_or_termination.test.sql` (J16): j16_worker_declines_offer_with_zero_relationships,
j16_worker_terminates_only_qualifying_relationship, j16_worker_terminates_at_exact_minimum,
j16_worker_terminates_with_minimum_raised_to_ten, j16_worker_declines_amendment_below_minimum,
j16_owner_terminates_regardless_of_worker_count, j16_terminate_succeeds_in_every_relationship_state (pending_start, active, suspended,
owner_removed), j16_policy_enforcement_check_refuses_anything_but_informational, j16_only_w10_reads_and_setter_reference_workforce_policies
(`pg_proc.prosrc` scan), j16_w9_decline_terminate_rpcs_unchanged_by_w10 (`pg_get_functiondef` has no `workforce_polic` /
`worker_owner_relationship`), j16_no_trigger_on_contracts_raises_for_relationship_state.
`j13_w10_workforce_policy_rules.test.sql`: w10_policy_seeded_minimum_three_informational, w10_super_admin_changes_policy_with_reason,
w10_policy_change_refused_for_owner_worker_customer_anon, w10_policy_stale_revision_55000, w10_policy_range_and_reason_23514,
w10_policy_same_value_refused, w10_policy_default_enforcement_and_key_immutable, w10_policy_cannot_be_deleted,
w10_trusted_session_policy_update_audited, w10_policy_change_audited_without_reason_text.
`j13_w10_relationship_audit_and_sync.test.sql`: w10_audit_on_create_and_each_status_change, w10_unchanged_refresh_writes_no_audit,
w10_audit_payload_has_no_names_reasons_or_dates, w10_no_notifications_for_relationship_changes,
w10_refresh_function_internal_and_rejects_past_date, w10_refresh_all_matches_live_derivation, w10_owner_removed_row_is_terminal.
`j17_w10_owner_relationship_authorization.test.sql` (J17): j17_w10_tables_rls_enabled_and_no_client_write_privileges,
j17_w10_write_policies_deny_all, j17_w10_direct_writes_refused_for_every_role_including_trusted_insert,
j17_w10_internal_functions_not_client_executable, j17_w10_rpcs_denied_to_anon, j17_w10_definer_functions_pin_pg_temp_last,
j17_w10_tables_not_in_realtime_publication, j17_w10_other_owner_and_worker_read_nothing,
j17_w10_owner_read_has_no_progress_or_other_owner_columns, j17_w10_super_admin_and_customer_read_no_relationships.
`j18_w10_flows.test.sql` (J18): j18_w10_owner_account_deletion_keeps_worker_relationship_as_owner_removed,
j18_w10_worker_account_deletion_removes_relationships_and_audits, j18_w10_shop_verification_review_flow_unchanged_with_sync_trigger,
j18_w10_booking_quote_rating_and_verification_unchanged, j18_w10_w9_contract_lifecycle_unchanged.
Changed existing file (only this): `001_migration_replay.test.sql` (69 migrations, + 20261028000001..07; renamed
`replay_schema_migrations_has_baseline_w2_to_w10`; add `replay_w10_relationship_and_policy_tables_rls_enabled`). Every other file
unchanged and green.
Smoke `scripts/supabase-test/w10-api-smoke.mjs` (W9 rules: loopback only, keys from `supabase status` in memory, `smoke10-*@local.test`
users deleted at the end and asserted, no `.env`, no time shift, no trusted write; super_admin promoted as in w9): direct insert /
patch / delete on both W10 tables denied for owner, worker, service_role; `set_workforce_policy_value` denied for owner, worker,
service_role; policy read 3 / informational; three owners with verified shops, three active contracts -> worker progress 3 / remaining
0; a second contract with owner A at a second shop -> still 3, the owner A row shows 2 contracts; amendment accepted -> still 3;
super_admin sets the shop of owner B to `changes_requested` -> 2 (B suspended), re-approves -> 3; super_admin raises the minimum to 5
-> remaining 2, audit row without reason text; worker terminates the owner C contract -> succeeds, count 2 (J16); worker declines a
new offer from owner D -> succeeds, no relationship row; owner A reads only its own row and gets 0 rows from
`my_owner_relationship_progress`; other worker reads nothing; super_admin reads no relationships; `refresh_worker_owner_relationships`,
`worker_owner_relationship_derive` and `set_config` not callable; owner B deleteUser -> worker row `owner_removed`, count 1. Must end
`0 failed`.
Vitest (mocked; suffixes `.j13`, `.j14`, `.j15`, `.j16`, `.j17`, `.w10`): j13_progress_card_shows_count_and_remaining_from_policy,
j13_remaining_never_negative_and_goal_reached_copy, j14_relationship_list_one_row_per_owner_with_contract_count,
j15_status_labels_and_counting_explanations_match_d3, j15_suspended_relationship_explains_verification_not_current,
j16_progress_copy_is_informational_and_never_an_obligation, j16_decline_and_end_actions_unaffected_by_progress,
j16_terminate_and_decline_modals_show_no_owner_goal_text, j17_owner_relationship_repository_reads_only_through_rpcs,
j17_workforce_policy_repository_writes_only_through_rpc, w10_owner_relationship_view_hides_worker_progress_and_other_owners,
w10_policy_panel_validates_range_and_reason_and_maps_errors, w10_progress_loading_empty_error_states,
w10_owner_relationship_error_messages_mapped, w10_progress_find_work_link_switches_tab. The existing 191 stay green unchanged.

## 7. Frontend (UI -> hooks -> services -> repositories -> Supabase; each file <= 350 lines) and docs
Add: `domain/models/OwnerRelationship.ts` (`WorkerOwnerRelationshipStatus`, `OwnerRelationshipProgress`, `MyOwnerRelationship`,
`OwnerSideWorkerRelationship`), `domain/models/WorkforcePolicy.ts`; `domain/repositories/{OwnerRelationshipRepository.ts,
WorkforcePolicyRepository.ts}`; `domain/utilities/ownerRelationshipProgress.ts` (pure: remaining, goal state, status -> counts per
D-3); `infrastructure/supabase/{supabaseOwnerRelationshipRows.ts, supabaseWorkforcePolicyRows.ts}`; `infrastructure/repositories/
{SupabaseOwnerRelationshipRepository.ts (the three read RPCs only), SupabaseWorkforcePolicyRepository.ts (select `workforce_policies`;
writes only via `set_workforce_policy_value`)}`; `application/validation/workforcePolicySchemas.ts` (zod: integer 1..10, reason
10..300); `application/services/{OwnerRelationshipService.ts, WorkforcePolicyService.ts}`; `presentation/utilities/
{ownerRelationshipCopy.ts, ownerRelationshipDisplay.ts}` (informational notice, e.g. "This is a WashLink progress goal. It is not a
requirement and not an obligation to work for several shops at the same time. It never stops you from declining an offer or recording
the end of a contract."; status labels; reason texts; no "must" / "required" wording); hooks `useMyOwnerRelationshipProgress` (progress +
list), `useOwnerWorkerRelationships`, `useWorkforcePolicies`, `useWorkforcePolicyChange`; components
`worker/contracts/{OwnerRelationshipProgressCard.tsx (count of minimum, remaining, `role="progressbar"` with aria values, notice,
"Find work" button), MyOwnerRelationshipsList.tsx}`, `owner/workerContracts/OwnerWorkerRelationshipsList.tsx` (own rows only: worker
name, status, contracts with you; no goal), `superAdmin/{WorkforcePolicyPanel.tsx (current value, default 3, "Informational only",
revision, last change), ChangeWorkforcePolicyModal.tsx}`. Loading, empty and error states use `Skeleton`, `EmptyState`,
`LoadErrorNotice`.
Change: `presentation/dependencyInjection/createWorkerContractDependencies.ts` (+ `ownerRelationshipService`),
`createSuperAdminDependencies.ts` (+ `workforcePolicyService`), `worker/contracts/MyContractsPanel.tsx` (progress card + list above the
contract list; new optional prop `onFindWorkRequested`), `features/worker/WorkerWorkspaceTabs.tsx` (passes
`onFindWorkRequested` that switches to `find_work`), `owner/workerContracts/OwnerWorkerContractsPanel.tsx` (renders the owner list),
`features/superAdmin/SuperAdminDashboardPage.tsx` (policy panel section), `infrastructure/supabase/supabaseErrorMessages.ts` (merge
the W10 messages). Unchanged on purpose (J16): `contracts/TerminateContractModal.tsx`, `worker/contracts/DeclineContractModal.tsx`,
`AcceptContractModal.tsx`, `WorkerContractReview.tsx`.
Docs: add `docs/workforce/OWNER_RELATIONSHIPS.md` (P55-P64, D-36..D-40, counting table per status, live vs stored, RPCs and messages,
privacy, limitations, rollback); update `WORKER_CONTRACTS.md` (forward-only repairs), `AUDIT_AND_NOTIFICATIONS.md` (W10 actions, no
notifications), `ROLE_AND_PROFILE_SECURITY.md` (D-10 rows: the new AFTER triggers on `shops` and `profiles` must exist identically in
production), `LOCAL_TEST_HARNESS.md` (69 migrations, 5th helper, W10 smoke), `LEGAL_REVIEW_REGISTER.md` (W10-L1..L8; notes on W0-L1,
W2-L2, W9-L6, W9-L17, all OPEN). RECORD adds the W10 smoke row to LOOP.md and D-36..D-40 to DECISIONS.md.

## 8. Acceptance criteria (commands from repo root, local only: `cd frontend && npm run lint / build / test`; `backend/.venv/Scripts/python.exe -m pytest -q`; `node --test scripts/supabase-test/stage-local-workdir.test.mjs`; `node scripts/supabase-test/run-db-tests.mjs`; `w2-`..`w10-api-smoke.mjs`; stop `--workdir .local-supabase-test --no-backup`; never `--linked`, `--db-url`, `db push`, never `.env`)
| AC | Criterion | Evidence |
|---|---|---|
| AC1 | 7 new migrations `2026_10_28_w10[a-g]_<snake>.sql`, each with `-- ROLLBACK`; nothing committed changed | `ls supabase/migrations/2026_10_28_w10*`; `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_28_w10*` empty; `git diff --name-status e43c2db -- supabase/migrations` only `A` |
| AC2 | Clean replay of 69 migrations; PASS; 0 TODO | runner `Result: PASS`; `replay_schema_migrations_has_baseline_w2_to_w10`, `replay_w10_relationship_and_policy_tables_rls_enabled`; `grep -c "todo_start(" supabase/tests/database/*.sql` all 0 |
| AC3 | J13: distinct verified owners counted; count and remaining from the policy | every name in `j13_three_distinct_qualifying_owner_relationships_counted`; Vitest `j13_*`; smoke progress checks |
| AC4 | J14: several contracts, shops or amendments with one owner count once; one row per (worker, owner) | every name in `j14_same_owner_contracts_and_amendments_count_once`; Vitest `j14_*`; smoke second-shop and amendment checks |
| AC5 | J15: declined, withdrawn, accepted-not-started, expired, terminated, suspended, owner-removed per D-3 / D-36; stored = live | every name in `j15_relationship_counting_policy_for_each_status`; Vitest `j15_*`; smoke suspend / reinstate |
| AC6 | J16: decline and terminate never blocked; enforcement informational; no W9 path reads the policy | every name in `j16_three_owner_rule_never_blocks_decline_or_termination`; Vitest `j16_*`; smoke terminate / decline succeed with minimum 5; `git diff e43c2db -- frontend/src/presentation/components/contracts/TerminateContractModal.tsx frontend/src/presentation/components/worker/contracts/DeclineContractModal.tsx` empty |
| AC7 | C6 / D-40: trusted repairs forward-only; W9 guard otherwise unchanged | every name in `j15_w10_trusted_contract_repair_rules`; every W9 pgTAP file `ok` |
| AC8 | Policy governance: super_admin only, audited, default 3 seeded | every name in `j13_w10_workforce_policy_rules`; smoke policy checks; Vitest `w10_policy_panel_validates_range_and_reason_and_maps_errors` |
| AC9 | Audit and sync; no notifications | every name in `j13_w10_relationship_audit_and_sync` |
| AC10 | J17 and privacy (owner never sees progress or other owners) | every name in `j17_w10_owner_relationship_authorization`; Vitest `j17_*` (W10), `w10_owner_relationship_view_hides_worker_progress_and_other_owners`; `w10-api-smoke.mjs` ends `0 failed`; W2-W9 smokes `0 failed` |
| AC11 | J18 and retention | every name in `j18_w10_flows`; every pre-W10 pgTAP file `ok`; `git diff --stat e43c2db -- supabase/tests/database` only new files + `001_migration_replay.test.sql`; pytest `4 passed`; stager 19 pass |
| AC12 | Frontend | every section-6 Vitest name and the existing 191 pass; lint and build exit 0; `grep -rn "service_role" frontend/src` empty |
| AC13 | Size, safety, docs, legal | `wc -l` of every added / changed file <= 350; no `.env` read; `git diff --stat e43c2db -- backend` empty; section-7 docs exist; `grep -c "W10-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` >= 8 |

## 9. Rollback, risks and legal-review flags
Rollback (local stack only, reverse order g..a): g producer (audit rows stay); f reads; e triggers on `worker_contracts`, `shops`,
`profiles` and the derivation functions (drop the triggers FIRST so contract and shop updates keep working); d relationships
(IRREVERSIBLE: trusted `copy` first; re-derivable from contracts by re-applying d..g); c policies (IRREVERSIBLE for a changed value and
reason; the audit keeps from / to values); b re-creates the w9c guard body (re-opens W9-S1 / C1); a nothing. Stager: drop the 5th
helper entry. Frontend: revert. The W9 rollback is invalid while W10 triggers exist on `worker_contracts`.
Risks: R1 production drift (D-10): the new AFTER triggers on `shops` and `profiles` must match in production (w10a aborts on unknown
W10-named objects only). R2 an error in the sync trigger or its audit aborts the causing action, including a worker terminate or
decline (J16): mitigated by no RAISE paths, fixed-shape payloads and j16 tests in every state; still a single point of failure. R3 the
stored status can lag the date (expiry) until refresh or expiry runs: every read derives live (P63). R4 advisory-lock ordering vs the
W9 and shop-review locks: deadlock risk judged low (shop row before the pair lock everywhere); covered by design review, not by a
concurrency test. R5 the shop trigger adds work to every verification review update (j18 verification flow test). R6 the w10b guard
must equal w9c apart from the trusted branch (reviewer diffs the bodies; all W9 tests re-run). R7 a DB superuser can disable triggers
and fabricate rows (W3-L3, W9-S3). R8 `OwnerWorkerContractsPanel.tsx` (208) and `MyContractsPanel.tsx` (124) grow: the lists are
separate files. R9 live derivation per read is O(contracts of the worker); fine at current scale.
Legal (to `LEGAL_REVIEW_REGISTER.md`, all OPEN; nothing in UI or docs claims compliance or a legal requirement):
W10-L1 the three-owner goal (W0-L1): whether showing a numeric target, "remaining" and "goal reached" can be read as a condition of
platform participation or as pressure to take several jobs; wording of the informational notice.
W10-L2 multiple concurrent engagements: hours of work and rest across employers, statutory contributions (SSS, PhilHealth, Pag-IBIG)
with several employers, exclusivity or non-compete terms in another owner contract (W9-L3); WashLink checks none of these.
W10-L3 counting only `active` (D-3) and treating verification lapses, shop removal or transfer as "suspended": whether workers should be
told when a relationship stops counting and why (no notification in W10, D-39).
W10-L4 personal data (RA 10173): relationship status and counts are worker data; owners cannot see the count; owner name snapshots are
kept after owner deletion; relationships are deleted with the worker account (audit rows remain).
W10-L5 policy governance: a super_admin can change the minimum for every worker; notice to workers, change log, and the fixed
`informational` enforcement (any enforcement needs legal review first, spec F).
W10-L6 off-platform pressure: owners could ask workers about other relationships outside WashLink; not controlled.
W10-L7 forward-only trusted repairs still let a human end a contract by SQL without notifying either party (W9-L17).
W10-L8 a roster link, application, training enrollment or certificate never counts (W2-L2): confirm this is the intended meaning of
"contractual relationship".
