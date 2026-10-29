# Owner relationships and the three-distinct-owner progress goal (W10)

Local Docker proof only (D-10): nothing here was applied to the linked project. Every legal question is in
`LEGAL_REVIEW_REGISTER.md` (W10-L1..L8, all OPEN; notes on W0-L1, W2-L2, W9-L6, W9-L17). Nothing in WashLink states
that the goal is a legal requirement, a condition of using WashLink or an obligation to work for several shops; the
count is an informational progress metric only (D-3, spec F). Nothing here claims legal validity or compliance.

Migrations (staged `20261028000001..07`; 69 staged migrations in total):
`2026_10_28_w10a_owner_relationships_preflight.sql` (creates nothing), `w10b_worker_contract_forward_only_repairs.sql`,
`w10c_workforce_policies.sql`, `w10d_worker_owner_relationships.sql`, `w10e_owner_relationship_derivation_and_sync.sql`,
`w10f_owner_relationship_reads.sql`, `w10g_owner_relationship_audit.sql`. No committed migration was changed.

## Decisions (ADOPTED-DEFAULT (loop, 2026-10-28), DECISIONS.md)

- D-3 (2026-10-27) progress metric only; qualifying = `active`; declined / expired / terminated / revoked do not
  count; suspended does not count while suspended.
- D-36 a relationship row starts at the first ACCEPTED contract between a worker and an owner. "Suspended" is a
  relationship-level, derived state (verification lapse, shop removed or transferred, owner role changed) and lifts
  on its own. "Revoked" has no contract equivalent (W9 has no `suspended` or `revoked` contract status and W10 adds
  none); the nearest events (an owner withdrawing an offer, a trusted repair ending a contract) never count. The UI
  never shows the word "Suspended" for it (the contract stays active; fix cycle 1, C1, W10-L9): workers see "Not
  counting right now", owners "Needs attention".
- D-37 `minimum_distinct_owners` default 3, range 1..10, changed only by a super_admin through an audited RPC with a
  reason; enforcement fixed to `informational` by a CHECK.
- D-38 owners see only their own relationship rows with a worker, never the worker's count, remaining, goal or other
  owners; super_admin has no relationship read in W10. W11 added only a dispute-scoped read (below); audited
  super_admin relationship reads outside disputes moved to W14 (W11 PLAN D-49).
- D-39 no notifications for relationship changes (contract events already notify; W12 decides).
- D-40 trusted contract repairs are forward-only (accepted / active -> terminated / expired).

## Principles (P55-P64)

- P55 contracts are the source of truth. `worker_owner_relationships` is a derived, audited record: no client role
  (anon, authenticated, service_role) has INSERT / UPDATE / DELETE, write policies deny all, and a BEFORE guard
  (every session) allows writes only under the transaction-local flag `washlink.owner_relationship_write` =
  `<worker_id>:<owner_id>` set by the internal refresh, plus the owner FK set-null and the worker cascade delete. A
  trusted session cannot write rows without deliberately setting the internal flag; the audit trigger still records
  such writes.
- P56 qualifying contract as of a Manila date `d` (`worker_contract_qualifies`): worker and owner set; `status =
  'active'` and not `end_date < d`; `activated_at` set and `ended_at` null; a worker acceptance of the current version
  whose `version_content_hash` equals that version's `content_hash`; `shop_id` set, `shops.owner_id` = the contract
  owner (C6) and `shop_has_recorded_verification(shop_id)` (approved, reviewer and review time recorded, shop
  active); the owner's profile role is `owner`.
- P57 count = `count(distinct owner_id)` over the worker's qualifying contracts
  (`worker_distinct_qualifying_owner_count`), computed live from contracts only: never from relationship rows, shops,
  openings, applications, roster links (W2-L2), training enrollments or certificates. Remaining =
  `greatest(minimum - count, 0)`; goal reached = count >= minimum.
- P58 status per (worker, owner), precedence active > suspended > pending_start > ended; `owner_removed` is terminal.
- P59 informational only: no W9 RPC, guard, validator or RLS policy and no W10 trigger reads `workforce_policies`.
  The sync triggers are AFTER triggers with no RAISE on any contract or relationship state.
- P60 policy governance: one row per key, seeded with `on conflict do nothing`, immutable default shown next to the
  current value, changes only through `set_workforce_policy_value` (or a trusted no-JWT SQL session, audited
  `trusted_session`). Range 1..10. No delete.
- P61 privacy: the worker reads own progress and relationships (own rows also directly); the owner reads own rows
  only through `owner_worker_relationships()` (no direct table read, fix cycle 1); only super_admin selects
  `workforce_policies` (workers get the minimum through `my_owner_relationship_progress()`) and reads the W3 audit;
  customers and anon nothing. No contacts, contract text, pay, end reasons or notes.
- P62 audit under W3 rules; a refresh that changes nothing writes nothing. No W10 table in `supabase_realtime`.
- P63 every read derives status live as of Manila today; the stored row is refreshed by the sync triggers and by
  `refresh_worker_owner_relationships(p_as_of)` (internal; W12 schedules it).
- P64 forward-only trusted repairs (below).

## Counting per status (D-3, D-36)

| Situation | Relationship row | Status / reason | Counts |
|---|---|---|---|
| draft or sent offer, declined offer, withdrawn offer | none created | - | no |
| accepted, not started (not effectively expired) | created at first acceptance | `pending_start` / `contract_accepted_not_started` | no |
| active and qualifying (P56) | yes | `active` / `contract_active` | yes, once per owner |
| several contracts, shops or accepted amendments with the same owner | one row (unique (worker, owner)) | `active` | once |
| active, shop verification no longer recorded, or the shop set inactive | yes | `suspended` / `owner_verification_not_current` | no, while suspended |
| active, shop deleted (contract `shop_id` set null) | yes | `suspended` / `shop_removed` | no |
| active, shop transferred to another owner | yes | `suspended` / `shop_owner_changed` | no |
| active, owner profile role no longer `owner` (trusted repair, D-8) | yes | `suspended` / `owner_role_changed` | no |
| active, only the worker acceptance hash does not match | yes | `suspended` / `owner_verification_not_current` (fallback) | no |
| every contract terminated by worker, owner or a trusted repair | yes | `ended` / `contract_terminated` | no |
| every contract expired, or past its end date before the expiry job runs | yes | `ended` / `contract_expired` | no |
| new contract with the same owner after `ended` | same row reused (J14) | re-derived | per status |
| owner account deleted | `owner_id` set null, name snapshot kept | `owner_removed` / `owner_account_removed` (terminal) | no |
| worker account deleted | rows deleted (cascade), audited `.deleted` | - | - |
| roster link, application, training enrollment, certificate | never | - | never |

Suspended-reason priority among the live, non-qualifying active contracts: `shop_removed`, `shop_owner_changed`,
`owner_role_changed`, else `owner_verification_not_current`. `ended` is `contract_expired` when the most recently
ended contract expired (or is effectively expired), else `contract_terminated`.

## Tables

`workforce_policies` (w10c): `id`, `policy_key` (unique, CHECK in (`minimum_distinct_owners`)), `integer_value`,
`default_value`, `enforcement` (default and CHECK `informational`), `description` (20..300), `revision` (>= 1),
`last_change_reason` (null or 10..300), `updated_by` (FK profiles, on delete set null), `created_at`, `updated_at`.
CHECK `wp_minimum_owner_range`: 1..10 and `default_value = 3`. Seed: (`minimum_distinct_owners`, 3, 3,
`informational`, "Number of different verified shop owners with an active contract that WashLink shows to workers as
a progress goal. Informational only."). RLS: select only for a super_admin (`wp_select_super_admin`:
`auth.uid()` set and `is_super_admin()`; the row holds `last_change_reason` and `updated_by`, P61); deny-all write
policies; only SELECT granted to authenticated. Workers read the minimum through `my_owner_relationship_progress()`.

`worker_owner_relationships` (w10d): `id`; `worker_id` (FK `worker_profiles`, on delete cascade); `owner_id` (FK
profiles, on delete set null, deferrable initially deferred); `owner_name_snapshot`, `worker_name_snapshot` (<= 200,
copied from the latest accepted contract's snapshots; fallback `Shop owner` / `Worker` if a snapshot is null);
`status`, `status_reason` (CHECKs above, `wor_reason_matches_status`); `counts_toward_goal` (generated, `status =
'active'`); `qualifying_contract_count` (>= 1 when active, else 0); `first_accepted_at`, `last_active_at`,
`ended_at` (required when ended), `owner_removed_at` (required when owner_removed), `status_changed_at`,
`created_at`, `updated_at`, `revision`. Unique (worker_id, owner_id) (nulls distinct: removed-owner rows never
collide). Indexes (worker_id, status), (owner_id, status). RLS select (`wor_select_own_worker`): the worker only
(`worker_id = auth.uid()`, role worker). Owners have NO direct read (D-38: never `counts_toward_goal` or
`qualifying_contract_count`); they use `owner_worker_relationships()`. Deny-all write policies; only SELECT granted.

Guard (every session): INSERT / UPDATE only under the P55 flag equal to `new.worker_id:new.owner_id`; the
`owner_id` FK set-null turns the row into `owner_removed` (reason `owner_account_removed`, `owner_removed_at`, count
0); `id`, `worker_id`, `owner_id` (outside the set-null), `first_accepted_at`, `created_at` never change; an
`owner_removed` row never changes again; DELETE only when the worker profile is gone (cascade). Messages (42501):
`Owner relationships are changed only by WashLink.`, `Owner relationships are kept by WashLink.`

## State machine (applied by the sync triggers; nobody writes it directly)

| From | To | Caused by | Condition |
|---|---|---|---|
| (none) | pending_start | worker (W9 accept of an initial version) | first accepted contract with this owner |
| (none) | any derived | system (w10g backfill, audited `trusted_session`) | derived from existing contracts |
| pending_start | active | owner (W9 activate) | a qualifying contract |
| active | suspended | super_admin (review change), owner (shop inactive / deleted), super_admin (shop transfer), trusted SQL (owner role) | no qualifying contract left but a live active one |
| suspended | active | super_admin (verification recorded again), owner (another qualifying contract started) | a qualifying contract again |
| pending_start / active / suspended | ended | worker or owner (W9 terminate), system (`expire_worker_contracts`; effective expiry in reads), trusted SQL (forward-only repair) | no live accepted / active contract left |
| ended | pending_start / active | owner + worker (new contract with the same owner) | same row reused |
| any except owner_removed | owner_removed | owner account deleted (FK set null) | terminal |
| any | (deleted) | worker account deleted (cascade) | audited `.deleted` |

Never a transition: drafts, sent offers, declines, withdrawals, amendments sent / declined / withdrawn (an accepted
amendment only changes dates, which the refresh re-evaluates).

## Derivation, sync and live reads (w10e; every function internal: definer, pinned, revoked from every client role)

- `worker_contract_qualifies(contract, as_of)`, `worker_distinct_qualifying_owner_count(worker, as_of default
  null)`, `worker_owner_relationship_derive(worker, owner, as_of default null)` (one row; `has_accepted_contract`).
- `refresh_worker_owner_relationship(worker, owner, as_of default null)` (as built: third parameter added): no-op
  when either id is null, when either profile no longer exists (inside an account-deletion cascade the w10d FK
  handles the row), or when the pair has no accepted contract and no row. Otherwise takes the pair advisory lock
  `hashtextextended('w10:<worker>:<owner>', 0)`, derives AFTER the lock, sets the flag, upserts only when status,
  reason or count differ, clears the flag. Never raises for a contract state. Returns true when the row changed.
- `refresh_worker_owner_relationships(p_as_of date default null)`: refuses a past date (22023 `The refresh date
  cannot be in the past.`), refreshes every pair with an accepted contract as of that date, returns rows changed.
  Not callable by any client; W12 schedules it.
- Triggers (AFTER, no RAISE): `worker_contracts_sync_owner_relationship` (AFTER INSERT OR UPDATE on
  `worker_contracts`; as built the function returns early unless status, owner_id, shop_id, worker_id, end_date,
  activated_at, ended_at, accepted_at or current_version_id changed; refreshes the new pair and, if the pair changed,
  the old one); `shops_sync_owner_relationships` (AFTER UPDATE OF verification_status, verification_reviewed_by,
  verification_reviewed_at, is_active, owner_id, WHEN one of them differs: every pair with an accepted contract at
  that shop, in (worker, owner) order); `profiles_sync_owner_relationships` (AFTER UPDATE OF role WHEN it differs:
  that owner's pairs). Shop DELETE needs no trigger (the contract `shop_id` set null fires the contract trigger).
- Lock order: `worker_contracts` row (W9 RPC) -> `shops` row -> pair advisory lock -> relationship row.
- Live vs stored (P63): the reads derive status, reason and count as of Manila today; the stored row can lag a
  passed end date until the next refresh or `expire_worker_contracts` (W12 schedules both).

## Forward-only trusted repairs (w10b, D-40; closes W9-S1 / C1 status part and W9 REVIEW C6 repair path)

`worker_contracts_guard_write()` is replaced with the w9c body verbatim plus one block in the trusted branch
(reviewed by `diff` of the bodies): a trusted, no-JWT update that changes anything besides `updated_at` is refused
with 42501 `Contracts are changed only through WashLink.` when `old.status` is not `accepted` / `active`, when
`new.status` is not `old.status`, `terminated` or `expired`, or when `ended_at` would go back to null. So a repair can
no longer revive a terminated or expired contract, reopen a declined or withdrawn offer, or activate an accepted
contract without the W9 checks. The function comment keeps the W9 marker (`W9: worker contracts (created by the W9
migrations). W10: forward-only trusted repairs.`). A repair still notifies nobody (W9-L17 / W10-L7 stay OPEN).

## Workforce policy (w10c)

`set_workforce_policy_value(p_policy_key text, p_new_value integer, p_expected_revision integer, p_change_reason
text) returns public.workforce_policies` (definer, granted to authenticated only), checks in order:

| Check | Code | Message |
|---|---|---|
| no JWT, or not `is_super_admin()` | 42501 | `Only a platform administrator can change workforce policies.` |
| unknown key | 22023 | `Unknown workforce policy.` |
| revision differs | 55000 | `This policy changed. Reload it and try again.` |
| value outside 1..10 | 23514 | `Choose a whole number from 1 to 10.` |
| reason (normalised) not 10..300 characters | 23514 | `Give a reason of 10 to 300 characters.` |
| same value | 23514 | `This is already the current value.` |

Guard `workforce_policies_guard_write` (every session): DELETE always 42501 `Workforce policies cannot be deleted.`;
INSERT only in a trusted no-JWT session; UPDATE only under `washlink.workforce_policy_write` = id or in a trusted
no-JWT session, else 42501 `Workforce policies are changed only by a platform administrator.`; `id`, `policy_key`,
`default_value`, `enforcement`, `created_at` never change (as built: 42501 `This part of a workforce policy cannot be
changed.`); the `updated_by` FK set-null (administrator removed) passes; stamps revision + 1, `updated_at`,
`updated_by = auth.uid()`. Changing the enforcement needs a new migration and legal review first (W10-L5).

## Read RPCs (w10f; definer, scoped to `auth.uid()`; wrong role or no JWT -> 0 rows, no error)

| RPC | Caller | Columns |
|---|---|---|
| `my_owner_relationship_progress()` | worker | minimum_distinct_owners, default_minimum, qualifying_owner_count (live), remaining_owner_count, goal_reached, enforcement, policy_revision, counted_as_of (Manila date) |
| `my_owner_relationships()` | worker | relationship_id, owner_name (snapshot), owner_removed, shop_names (shop snapshots of the worker's accepted contracts with that owner), status / status_reason / counts_toward_goal (live), qualifying_contract_count, accepted_contract_count, first_accepted_at, status_changed_at; ordered active, suspended, pending_start, ended, owner_removed, then name |
| `owner_worker_relationships()` | owner | relationship_id, worker_id, worker_name (snapshot), status, status_reason (live), contracts_with_you_count, first_accepted_at, status_changed_at |

`status_changed_at` in both relationship reads is the stored "since" stamp of the current status. It is NULL when
the live status differs from the stored one (for example an end date passed before the expiry job or a refresh ran),
so the UI hides the "since" date when it is null instead of showing a stale one.

As built: for `owner_removed` rows `my_owner_relationships()` returns `shop_names = '{}'` and
`accepted_contract_count = 0` (the owner id is gone; contracts are not matched by name). Only
`my_owner_relationship_progress` and `set_workforce_policy_value` read `workforce_policies` (static pgTAP check over
`pg_proc.prosrc` for `(from|join|update|into) public.workforce_policies`).

## Privacy (D-38, W10-L4)

The owner's read has no goal, count, remaining or other-owner column, the owner has no direct select on
`worker_owner_relationships`, and the frontend never calls the worker reads for an owner. Customers, anon and
super_admin read no relationship rows (super_admin alone selects `workforce_policies` and reads the W3 audit). Owner name snapshots are kept for the worker after the owner account is deleted; relationship rows are
deleted with the worker account (the audit rows remain).

## Audit (w10g; W3 rules; details in `AUDIT_AND_NOTIFICATIONS.md`, W10 section)

`worker_owner_relationship.created`, `.status_changed`, `.owner_removed`, `.deleted` (subject_type
`worker_owner_relationship`, subject_profile_id = worker) and `workforce_policy.changed` (subject_type
`workforce_policy`). No names, free text, dates or another owner's ids; the policy reason never enters the payload.
w10g also backfills every (worker, owner) pair with an accepted contract (audited `trusted_session`) and comments
every W10 function `W10: ...` (a missing one aborts). No notifications (D-39).

## Frontend (UI -> hooks -> services -> repositories -> Supabase)

- Repositories: `SupabaseOwnerRelationshipRepository` (the three read RPCs only, no arguments) and
  `SupabaseWorkforcePolicyRepository` (select `workforce_policies`, which only a super_admin can read; the only write
  is `set_workforce_policy_value` with the expected revision; used only by the super_admin panel). No `service_role` anywhere in `frontend/src`.
- Worker, Contracts tab: `OwnerRelationshipProgressCard` (count of minimum, remaining, `role="progressbar"` with aria
  values capped at the minimum, the informational notice, a counting explanation, "Find work" which switches the
  workspace to Find work) and `MyOwnerRelationshipsList` (one row per owner: status, reason, counting text, shops,
  accepted contracts, "Since <date>" only when `status_changed_at` is not null). Shown in the contract list view only, never next to an open contract or its terminate /
  decline modals; re-read when the contract list changes and every 60 s while visible.
- Heading as built: "Progress toward working with different shop owners". Spec H's wording ("...three-distinct-owner
  business requirement") was not used: the minimum is configurable (1..10) and "requirement" would contradict D-3 /
  W10-L1. Notice (verbatim from the plan): "This is a WashLink progress goal. It is not a requirement and not an
  obligation to work for several shops at the same time. It never stops you from declining an offer or recording the
  end of a contract." A test rejects must / required / obligation / condition / block wording outside these negated
  phrases. Goal reached: "You have reached this WashLink progress goal." Goal source: "Goal set by WashLink: 3
  different shop owners." (a minimum of 1 reads "1 shop owner"; a changed minimum adds "(WashLink default: 3)").
- Status labels (worker / owner): `active` "Active"; `suspended` "Not counting right now" / "Needs attention" (the
  reason line says what: verification, a removed or transferred shop, or the account role; the owner label mentions no
  counting, D-38); `pending_start` "Accepted, not started"; `ended` "Ended"; `owner_removed` "Owner account removed".
  Worker counting text for `suspended`: "Does not count toward your progress goal right now. Your contract itself is
  unchanged. It counts again on its own once the reason below is resolved."
- Owner, Worker contracts tab: `OwnerWorkerRelationshipsList` ("Your relationships with workers": worker name,
  status, owner-worded reason, accepted contracts with you, since date when not null). No goal or progress text.
- super_admin dashboard: lazy-loaded `WorkforcePolicyPanel` (current value, WashLink default, "Informational only",
  revision, last change and its reason) and `ChangeWorkforcePolicyModal` (whole number 1..10 and a reason 10..300,
  checked client-side with the server's texts; server field messages shown next to the field; a stale revision
  re-reads the policy). The UI hides nothing as authorization: the database decides.
- `TerminateContractModal`, `DeclineContractModal`, `AcceptContractModal` and `WorkerContractReview` are unchanged
  from W9 (`git diff e43c2db` empty).

## Limitations and risks

- Informational only: a future enforcement needs a new migration and legal review (W10-L1, W10-L5).
- R1 production drift (D-10): the new AFTER triggers on `shops` and `profiles` must match in production (D-10 rows
  40-42 in `ROLE_AND_PROFILE_SECURITY.md`); w10a aborts only on unknown W10-named objects.
- R2 an error in a sync trigger or its audit aborts the causing action, including a decline or termination (no RAISE
  paths, fixed payloads, j16 tests in every state; still a single point of failure).
- R3 the stored row can lag the date until a refresh (reads are live). R4 lock ordering is reviewed, not
  concurrency-tested. R5 every shop verification update now refreshes its pairs. R7 a database superuser can disable
  triggers and fabricate rows (W3-L3, W9-S3).
- The reason `owner_verification_not_current` also covers an inactive shop and an acceptance-hash mismatch; the
  worker text "The shop's verification is not current right now." is approximate in those cases.
- No notification when a relationship stops counting (D-39, W10-L3).
- W11 (dispute-scoped status, `DASHBOARDS_AND_OVERSIGHT.md`): while a reported contract problem is OPEN,
  `admin_contract_dispute_case` returns a `relationship` block with only `status` and `status_reason` of that contract's
  (worker, owner) pair, derived live by `worker_owner_relationship_derive` (null when there is no accepted contract);
  never the count, remaining, minimum or other owners, and nothing once the problem is closed or withdrawn. Every call
  is audited. `owner_dashboard_summary().relationship_needs_attention_count` counts the owner's live `suspended` rows; the worker Overview (`worker/dashboard/WorkerOverviewPanel.tsx`) reuses the W10 progress card. The W11 owner copy labels this count "Relationships needing attention" (`presentation/utilities/workforceDashboardCopy.ts:34`, `workforceDashboardDisplay.ts:86`), matching the W10 owner label (C1, W10-L9). Other
  super_admin relationship reads are W14.

## Rollback (local test stack only; reverse order g..a)

g: drop the producer (audit rows stay). f: drop the three reads. e: drop the triggers on `worker_contracts`,
`shops`, `profiles` FIRST, then the derivation functions. d: drop the relationship table and guard (IRREVERSIBLE:
trusted `copy` first; every non-`owner_removed` row is re-derivable by re-applying d..g). c: drop RPC, producer, guard
and table (IRREVERSIBLE for a changed value and reason; the audit keeps from / to values). b: re-create the w9c guard
body from the w10b ROLLBACK block (re-opens W9-S1 / C1). a: nothing. Stager: drop the 5th helper entry. Frontend:
revert. The W9 rollback is invalid while the W10 triggers exist on `worker_contracts`. Roll back W11 (i..a) before W10:
its dispute case and summaries call `worker_owner_relationship_derive` and `owner_worker_relationships`.

## Tests

pgTAP (9 files, 168 assertions in the BUILD run): `j13_three_distinct_qualifying_owner_relationships_counted` (12),
`j14_same_owner_contracts_and_amendments_count_once` (15), `j15_relationship_counting_policy_for_each_status` (27),
`j15_w10_trusted_contract_repair_rules` (19), `j16_three_owner_rule_never_blocks_decline_or_termination` (19),
`j13_w10_workforce_policy_rules` (20), `j13_w10_relationship_audit_and_sync` (18),
`j17_w10_owner_relationship_authorization` (21), `j18_w10_flows` (17); `001_migration_replay` (plan 23, 69
migrations). Helpers `scripts/supabase-test/baseline/test_helpers_owner_relationships.sql`. Vitest: 10 files / 18
W10 tests (`.j13`, `.j14`, `.j15`, `.j16`, `.j17`, `.w10`; fix cycle 1 added `ownerRelationshipFixCycle.w10`). Smoke: `scripts/supabase-test/w10-api-smoke.mjs` (checks per
PLAN section 6; result recorded in the W10 LOG / TEST_RESULTS).
