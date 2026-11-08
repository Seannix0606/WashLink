# W11 - Role-aware dashboards & navigation (worker / owner / admin) - PLAN

**SPLIT (orchestrator action required).** Everything routed to W11 does not fit one increment with files <= ~350 lines. W11 keeps the dashboards and navigation plus the
highest-risk worker-protection carry-forwards: the independent certification review with escalation after "upheld" and a decider for stranded suspensions (W7-L12,
W7-L13, D-21 conflict; partial W7-L14), and dispute access to contracts including review of owner terminations (W9), with a dispute-scoped relationship status (part of
W10). The rest moves to a NEW increment, to be appended to PLAN.md and STATE.md:
| ID | Increment | Spec | Depends on | Acceptance tests |
|---|---|---|---|---|
| W14 | Platform moderation, oversight reads & admin audit (super_admin) | A, B, H, I | W11 | J2, J3, J17, J18 + moderation / audit tests |
W14 contents: (1) worker reports of job postings (discrimination incl. age, fees, unpaid trials, misleading terms; W4, W4-L4 / L7 / L8 / L9) with a super_admin
moderation queue and an audited takedown (pause / close with a reason shown to the owner; W5 R4: snapshots never edited); (2) super_admin UI for
`publish_platform_contract_template_version` (W8); (3) redacted per-user audit reads and an admin audit log UI (W3); (4) audited super_admin relationship reads outside
disputes (W10, D-38); (5) queue of approved shops with no recorded reviewer, re-review from it, runbook (D-10 rows 14 / 22, W4 carry-forward); (6) admin take-over of
overdue / stranded shop review requests without a worker escalation, if the human changes D-44. Order: run W14 after W11 and before W12; set W12 "Depends on" to `W11,
W14` so W12 wires W14 events; W13 ("all") then covers it; LOOP.md completion criterion 1 becomes "W0-W14" (unplanned final-verification increments then start at W15).

Spec: H (worker, owner, administrator dashboards; next action first; accurate counts; loading / empty / success / error states; role-aware navigation; permissions
enforced in data layers), A (administrator handles disputes), D (appropriate review process for suspension / revocation), E (contract privacy, history subject to
authorization), F (worker may decline / terminate), I (audit, notifications without private details), J8, J12, J16, J17, J18. Depends on W4-W10: all `passed` in
STATE.md (HEAD 6ce3f61). Decisions used: D-13, D-18, D-20, D-21, D-23, D-32, D-35, D-36, D-38, D-41 (all ADOPTED-DEFAULT). **No dependency on an OPEN decision** other
than the standing, non-blocking D-10 gate. New decisions D-42..D-49 (section 5) carry proposed defaults for RECORD. Not BLOCKED.

## 1. Scope / out of scope
In: three DB summary functions (worker / owner / super_admin) giving accurate, role-scoped counts; worker "Overview" tab, owner "Next actions" strip + "Workforce" tab,
super_admin tabbed console (Overview, Shop verification, Certification reviews, Contract disputes, Policies); `certification_platform_reviews` (worker-initiated
WashLink review decided by a super_admin) with holds on W7 tables; `worker_contract_disputes` (either party reports a contract problem; the other party answers once; a
super_admin reads the contract only while the dispute is open, every case read audited, and closes it with a note to both parties); audit producers and fixed-text
notifications for both; pgTAP, Vitest, `w11-api-smoke.mjs`, docs, legal register. Out (reason): everything listed for W14 above; any super_admin power to suspend,
revoke, issue, renew certificates or to change a contract's status, terms, dates or acceptance (D-45, D-47: WashLink is not the issuer and not a party); automatic
lifting of suspensions (D-46; no scheduler, W12); email / SMS / push and notification de-duplication across events (W12); any recommendation algorithm (D-43). No
production apply, no `.env`, no SQLAlchemy / Alembic, no change to a committed migration.

## 2. Design principles (continue P1-P64)
P65. Counts come from the database. Each dashboard calls one definer summary function scoped to `auth.uid()` + profile role (wrong role or no JWT -> 0 rows); integers,
booleans and dates only; no names, text, contacts or other parties' ids. Each count reuses the predicate of the read it summarises (pgTAP asserts equality with that
read). P66. WashLink review is independent of the issuing shop: decided only by a super_admin (`auth.uid()` + `is_super_admin()` + role `super_admin`), shown as
"WashLink review"; never the admin's name. It is opened only by the certificate's worker (consent; D-44). P67. A WashLink review can only reinstate or keep a suspension
/ revocation (D-45). It never needs the issuer's current verification (D-23: validity rests on the issue-time snapshot) and never changes expiry, evidence or snapshots.
One decision per suspension / revocation event; the decision is final within WashLink. P68. Holds (D-46): while a WashLink review is open, the owner cannot revoke
(23514) and the worker cannot open a shop review request (23514); an owner reinstatement closes the WashLink review as `resolved_by_shop`. Holds are NEW triggers; no W7
function body changes. P69. Disputes never change contracts (D-47): no W11 function writes `worker_contracts`, `contract_versions` or acceptances (static
`pg_proc.prosrc` scan); W9 decline / terminate / accept / activate RPCs are untouched and never read dispute tables (J16). P70. Admin contract access is case-bound:
contract metadata, sealed versions, acceptance records and the live (worker, owner) relationship status (no count, remaining or other owners) are readable by a
super_admin only through the case functions, only while that dispute is `open`, and each call writes `worker_contract_dispute.case_viewed` (the functions are VOLATILE
for that reason). P71. Writes go through definer RPCs under transaction-local flags (`washlink.certification_platform_review_write`, `washlink.contract_dispute_write` =
row id); deny-all write policies; no client role (incl. service_role) has a write grant; FK set-null passes via `is_orphaned_fk_set_null`; deletes only by cascade.
Statements, reasons and notes live only in their rows (never in audit payloads or notification texts).

## 3. Migrations (`2026_10_29_w11<x>_<snake>.sql`, staged 20261029000001..09; 78 after W11; each ends with `-- ROLLBACK`; each <= 350 lines)
Idempotent; `notify pgrst, 'reload schema';` last; definer functions `set search_path = public, pg_temp`; comments start `W11:`; `revoke all ... from public, anon` (+
`authenticated`, `service_role` for internal / trigger functions); client RPCs granted to `authenticated` only. Lock order: certifications row ->
certification_review_requests row -> platform review row; worker_contracts row FOR SHARE -> dispute row.
### 3.1 `2026_10_29_w11a_oversight_preflight.sql` (creates nothing)
Abort naming each missing item: `certifications.{status, status_reason, shop_id, owner_id, worker_id, expires_at, program_title_snapshot, shop_name_snapshot}`,
`certification_status_events.{event, reason, review_request_id, actor_role}`, `certification_review_requests.{status, requested_at, decided_at, withdrawn_at}`,
`worker_contracts.{status, sent_at, ended_at, ended_by, end_reason, owner_id, worker_id, shop_id}`, `contract_versions.{rendered_text, content_hash, sealed_at}`,
`contract_acceptances.{party_role, version_content_hash}`; functions `is_super_admin`, `current_user_profile_role`, `shop_has_recorded_verification`,
`certification_effective_status`, `certification_reason_or_fail`, `worker_contract_effective_status`, `worker_owner_relationship_derive`,
`my_owner_relationship_progress`, `record_workforce_audit_event`, `enqueue_notification_safely`, `notification_safe_label`, `is_orphaned_fk_set_null`,
`training_enrollment_is_completed`. Abort if any `public.certification_platform_review%`, `public.worker_contract_dispute%` or `%dashboard_summary%` object exists
without a `W11` comment (D-10). Rollback: nothing.
### 3.2 `2026_10_29_w11b_certification_platform_reviews.sql`
Table `certification_platform_reviews`: id uuid PK; certification_id NOT NULL FK certifications ON DELETE CASCADE; worker_id NOT NULL FK worker_profiles(profile_id) ON
DELETE CASCADE; basis CHECK in (`upheld_by_shop`, `shop_decision_overdue`, `issuer_unavailable`); escalated_from_request_id uuid null FK certification_review_requests
ON DELETE CASCADE, UNIQUE; certification_status_at_open CHECK in (suspended, revoked); worker_statement 20..1000; status CHECK in (open, reinstated, upheld, withdrawn,
resolved_by_shop); opened_at, decided_at, decided_by FK profiles ON DELETE SET NULL, decision_reason (20..500), closed_at, revision >= 1, created_at, updated_at. CHECK
`cpr_status_consistency`: open -> no decision / close stamps; reinstated | upheld -> decided_at + decision_reason; withdrawn | resolved_by_shop -> closed_at, no
decision. Partial UNIQUE (certification_id) where status is open; indexes (status, opened_at), (worker_id, status), (decided_by). `alter table
certification_status_events add column if not exists platform_review_id uuid` (NO FK: reviews and events both cascade from the certificate; an FK cascade from the
review would trip the W7 event guard).
Guard `certification_platform_reviews_guard_write` (BEFORE, every session): INSERT / UPDATE only under the P71 flag = row id;
INSERT forces status open, stamps, revision 1; UPDATE only open -> another status, only status / decision / close / revision / updated_at columns change (42501
`Certification records cannot be edited.`); FK set-null passes; DELETE only when the certificate or worker profile is gone. RLS: enabled; select policy for super_admin
only (`is_super_admin()`); deny-all write policies; revoke all from public, anon, authenticated, service_role, then grant select to authenticated. Realtime exclusion
(abort on FOR ALL TABLES).
Holds (P68, new triggers, definer, internal):
- `certification_review_requests_platform_hold` BEFORE INSERT on `certification_review_requests`: an open platform review for the
  certificate -> 23514 `WashLink is reviewing this certification. Wait for its decision.`
- `certifications_platform_review_hold` BEFORE UPDATE on `certifications` when status changes: open platform review and new status
  `revoked` -> the same 23514.
- `certifications_platform_review_resolve` AFTER UPDATE on `certifications`: old status suspended / revoked, new `active`, and the
  transaction flag `washlink.certification_platform_review_decision` is not set -> the open review becomes `resolved_by_shop`.
ROLLBACK: drop holds, guard, column, table (IRREVERSIBLE loss of reviews: trusted `copy` first).
### 3.3 `2026_10_29_w11c_certification_platform_review_rpcs.sql`
`certification_platform_review_owner_decision_days()` immutable = 14 (D-44). Internal `certification_platform_review_basis(p_cert uuid) returns text` (null = not
eligible), precedence: `issuer_unavailable` (shop_id or owner_id null, `shops.owner_id` differs, `profiles(owner).role` not owner, or no
`shop_has_recorded_verification`; for a REVOKED certificate also needs the latest suspended / revoked event within 30 days or an open shop request; a SUSPENDED one has
no time limit) > `shop_decision_overdue` (open shop request with requested_at <= now() - 14 days) > `upheld_by_shop` (latest shop request `upheld`, decided after the
latest suspended / revoked event, decided_at within 30 days). `open_certification_platform_review(p_certification_id uuid, p_expected_status text, p_statement text)`:
role worker and own certificate else 42501 `Certification not found.`; cert FOR UPDATE; status <> expected -> 55000 `This certification changed. Refresh and try
again.`; not suspended / revoked -> 23514 `Only a suspended or revoked certification can be reviewed.`; open platform review -> 23505 `WashLink is already reviewing
this certification.`; an upheld / reinstated platform decision after the latest suspended / revoked event -> 23514 `WashLink already reviewed this decision.`; basis
null -> 23514 `Ask the shop to review this decision first. You can ask WashLink when the shop keeps its decision, has not decided within 14 days, or can no longer
decide.`; statement 20..1000 -> 23514 `Write a statement of 20 to 1000 characters.`. Then an open shop request (FOR UPDATE) is set `withdrawn` under the W7 flag (linked
by escalated_from_request_id), and the review is inserted. `withdraw_certification_platform_review(p_review_id uuid)`: the worker; open -> withdrawn (23514 `This review
is no longer open.`). `decide_certification_platform_review(p_review_id uuid, p_expected_revision integer, p_decision text, p_reason text)`: super_admin else 42501
`Only a platform administrator can decide WashLink reviews.`; review then cert FOR UPDATE; not open -> 23514; revision -> 55000; decision not reinstate / uphold ->
22023 `Choose reinstate or uphold.`; reason via `certification_reason_or_fail`; cert no longer suspended / revoked -> 23514 `This certification is no longer suspended
or revoked.`. Sets `washlink.certification_change_source = review_decision` (W7 producer: changed_by review_decision, no shop-style notice) and the decision flag;
reinstate -> status active, reason null (expiry unchanged); inserts a status event (`reinstated` / `review_upheld`, actor_display_name `WashLink review`,
platform_review_id); closes the review. Flags cleared. ROLLBACK: drop the five functions.
### 3.4 `2026_10_29_w11d_certification_platform_review_reads.sql` (definer)
`my_certification_platform_reviews()` (worker; own suspended / revoked certificates or any with a review): certification_id, can_open, basis, open_review_id,
latest_status, latest_decision_reason, latest_decided_at, opened_at. No admin ids or names. `owner_certification_platform_reviews()` (current issuing owner, as
`owner_certifications`): certification_id, review_id, status, basis, worker_statement, decision_reason, opened_at, decided_at.
`admin_certification_platform_review_queue(p_status text default open)` (super_admin; 22023 for an unknown status): review_id, certification_id, basis, status,
revision, opened_at, decided_at, certification_title, shop_name_snapshot, certification_status, issuing_shop_present, issuing_shop_currently_verified; oldest first;
limit 200. `admin_certification_platform_review_case(p_review_id uuid) returns jsonb` (VOLATILE; super_admin; audits `certification_platform_review.case_viewed`):
review row, worker display name (trimmed full_name or `Worker`), certificate facts (title, program and shop snapshots, issued / expires, status, status_reason, attended
/ required days, verification snapshot at issue, live shop flags, `training_record_changed_after_issue`), status events (event, from, to, reason, actor_role,
actor_display_name, created_at), shop requests (statement, status, decision_reason, requested_at, decided_at). No contacts, no attendance record ids. ROLLBACK: drop the
four functions.
### 3.5 `2026_10_29_w11e_worker_contract_disputes.sql`
Table `worker_contract_disputes`: id uuid PK; contract_id NOT NULL FK worker_contracts ON DELETE CASCADE; raised_by FK profiles ON DELETE SET NULL; raised_by_role CHECK
in (worker, owner); category CHECK in (`owner_ended_contract`, `worker_ended_contract`, `contract_terms`, `amendment`, `acceptance_record`, `other`); statement
20..1000; contract_status_at_raise text; response_statement (20..1000), response_by FK profiles SET NULL, responded_at; status CHECK in (open, closed, withdrawn);
resolution_kind CHECK in (`information_shared`, `referred_outside_washlink`, `no_platform_action`); resolution_note (20..1000); closed_by FK SET NULL; closed_at,
withdrawn_at, first_viewed_by_admin_at, revision, created_at, updated_at. CHECK `wcd_status_consistency` (closed <-> resolution kind + note + closed_at; withdrawn <->
withdrawn_at; open -> neither). Partial UNIQUE (contract_id, raised_by_role) where status is open; indexes (status, created_at), (contract_id). Guard
`worker_contract_disputes_guard_write` (P71 shape; immutable: id, contract_id, raised_by_role, category, statement, created_at; response once; open -> closed |
withdrawn only). RLS: super_admin select only; parties read via w11g; deny-all writes; grants as w11b; Realtime exclusion. ROLLBACK: drop guard and table (IRREVERSIBLE:
trusted `copy` first).
### 3.6 `2026_10_29_w11f_worker_contract_dispute_rpcs.sql`
`raise_contract_dispute(p_contract_id uuid, p_category text, p_statement text)`: party = worker (role worker, `worker_id`, sent) or owner (role owner, `owner_id`) else
42501 `Contract not found.`; contract FOR SHARE; never sent -> 23514; ended (declined, withdrawn, expired, terminated or effectively expired) more than 90 days ago ->
23514 `Problems can be reported up to 90 days after a contract ends.`; unknown category -> 22023; `owner_ended_contract` needs ended_by owner and a worker raiser,
`worker_ended_contract` ended_by worker and an owner raiser -> 23514 `This category does not match the contract.`; open dispute of the same party -> 23505 `You already
reported a problem with this contract.`; more than 3 per party and contract -> 23514; statement 20..1000 -> 23514. `respond_to_contract_dispute(p_dispute_id uuid,
p_statement text)`: the other party only; open; one response (23505 `A response was already recorded.`). `withdraw_contract_dispute(p_dispute_id uuid)`: the raiser;
open -> withdrawn. `close_contract_dispute(p_dispute_id uuid, p_expected_revision integer, p_resolution_kind text, p_resolution_note text)`: super_admin (42501 `Only a
platform administrator can close disputes.`); open (23514); revision (55000); kind (22023); note 20..1000 (23514). None of the four touches `worker_contracts` or its
children. ROLLBACK: drop the four functions.
### 3.7 `2026_10_29_w11g_worker_contract_dispute_reads.sql` (definer)
`my_contract_disputes()` (worker: contracts sent to them; owner: `owner_id` = caller): dispute_id, contract_id, shop_name, counterpart_name (snapshots both parties
already see), category, status, raised_by_me, statement, response_statement, resolution_kind, resolution_note, created_at, responded_at, closed_at, washlink_has_viewed,
can_respond, can_withdraw. No admin ids. `admin_contract_dispute_queue(p_status text default open)`: dispute_id, contract_id, category, status, revision,
raised_by_role, has_response, contract_status, effective_status, shop_name_snapshot, created_at; oldest first; limit 200. `admin_contract_dispute_case(p_dispute_id
uuid) returns jsonb` (VOLATILE; super_admin; audits `worker_contract_dispute.case_viewed`; stamps first_viewed_by_admin_at once): dispute row always; while OPEN also
contract {status, effective_status, classification_key, start / end date, sent / accepted / activated / ended stamps, ended_by, end_reason, decline_note, shop / owner /
worker name snapshots, removed flags}, versions {id, number, kind, state, sealed_at, content_hash, flag_count}, acceptances {party_role, version_number, accepted_at,
version_content_hash, record label}, relationship {status, status_reason} from `worker_owner_relationship_derive` (no count, remaining, minimum or other owners). Closed
/ withdrawn: no contract block. `admin_contract_dispute_version_document(p_dispute_id uuid, p_version_id uuid)` (VOLATILE; super_admin; dispute open; version of that
contract and sealed, else 0 rows; audits `.case_viewed` with version_id): rendered_text, content_hash, sealed_at, `Acceptance record — not an e-signature`. ROLLBACK:
drop the four functions.
### 3.8 `2026_10_29_w11h_workforce_dashboard_summaries.sql` (definer, stable, one row)
`my_worker_dashboard_summary()`: has_worker_profile, profile_missing_fields text[] (`headline`, `experience_summary`, `skills`, `preferred_locations`, `availability`),
open_opening_count (published, applicable, deadline not passed, not applied; same predicate as `search_job_openings`), draft / active (submitted, under_review,
shortlisted) / accepted application counts, training_invitation_count, training_in_progress_count, next_training_date (Manila), current / expiring_30d /
suspended_or_revoked certification counts, platform_review_available_count, open_platform_review_count, contract_offer_count, amendment_offer_count,
accepted_not_started_count, active_contract_count, open_dispute_count, dispute_response_needed_count, counted_as_of. `owner_dashboard_summary()`: shop_count,
verified_shop_count, shops_needing_verification_count, published / draft opening counts, new_application_count (submitted), in_review_application_count,
training_invitation_pending_count, trainee_in_progress_count, ready_to_certify_count, open_shop_review_request_count, open_platform_review_count,
expiring_certification_count, record_changed_certification_count, active_template_count, newer_standard_template_available, contract_draft_count,
offer_awaiting_worker_count, amendment_awaiting_worker_count, accepted_not_started_count, active_contract_count, relationship_needs_attention_count (live `suspended`),
open_dispute_count, dispute_response_needed_count. `admin_dashboard_summary()`: shops_pending_review_count, open_platform_review_count,
oldest_platform_review_opened_at, overdue_shop_review_request_count, stranded_suspended_certification_count, open_dispute_count, unviewed_dispute_count,
oldest_dispute_opened_at. No names anywhere. ROLLBACK: drop the three functions.
### 3.9 `2026_10_29_w11i_oversight_audit_and_notifications.sql`
Producers (AFTER INSERT / UPDATE / DELETE; definer; internal): `certification_platform_reviews_audit` -> `certification_platform_review.opened` / `.decided` /
`.withdrawn` / `.resolved_by_shop` / `.deleted` (subject certification, subject_profile worker; payload certification_id, platform_review_id, basis, from_status,
to_status, decision, escalated_from_request, changed_by); `worker_contract_disputes_audit` -> `worker_contract_dispute.raised` / `.responded` / `.withdrawn` / `.closed`
/ `.deleted` (subject worker_contract; payload dispute_id, contract_id, category, raised_by_role, from_status, to_status, resolution_kind, changed_by). Never
statements, reasons, notes, names or dates (W3 CHECK + test). Notifications (`enqueue_notification_safely`; keys `certification_platform_review:<id>:<event>`,
`contract_dispute:<id>:<event>`; labels via `notification_safe_label`): review opened -> current issuing owner `A worker asked WashLink to review a certification
decision for <program>.`; decided -> worker `WashLink reviewed your certification for <program>: reinstated.` / `: decision kept.` and current owner `WashLink reviewed
a certification decision for <program>.`; dispute raised -> other party: worker `<shop>: a problem with your contract was reported to WashLink. You can add your side.`,
owner `A worker reported a problem with a contract to WashLink. You can add your side.`; closed -> both parties `WashLink closed a reported contract problem. Open it to
read the note.`; withdrawn / resolved / case views -> none. Then the `W11` comment on every W11 function (a missing one aborts). ROLLBACK: drop producers (audit rows
and notifications stay).

## 4. State machines
WashLink certification review (`certification_platform_reviews`):
| From | To | Who | Condition |
|---|---|---|---|
| (none) | open | certificate worker | suspended / revoked; basis not null (D-44); no open review; not yet decided for this event; an open shop request becomes `withdrawn` |
| open | reinstated | super_admin | reason 20..500; certificate -> active, no verification check (D-45) |
| open | upheld | super_admin | reason; certificate unchanged; final for this suspension / revocation event |
| open | withdrawn | certificate worker | - |
| open | resolved_by_shop | system (hold trigger) | issuing owner reinstated through W7 |
| any | (deleted) | cascade | certificate or worker account removed (audited) |
While a review is open: owner suspended -> revoked refused 23514; worker shop request refused 23514; owner reinstate allowed (closes the review); other W7 transitions
unchanged. Never: super_admin suspend / revoke / issue / renew.
Contract dispute (`worker_contract_disputes`):
| From | To | Who | Condition |
|---|---|---|---|
| (none) | open | worker or owner party | sent contract; not ended > 90 days; category fits; one open per party; max 3 per party |
| open | open (+ response) | the other party | once |
| open | closed | super_admin | resolution kind + note 20..1000; contract unchanged |
| open | withdrawn | raiser | - |
| any | (deleted) | cascade | contract removed by W9 retention |
Refused for everyone: direct writes to both W11 tables (incl. service_role and trusted INSERT without the flag); super_admin access to a contract without an open
dispute; party reads of reviewer ids; any dispute effect on contract state.

## 5. Decisions taken in this plan (RECORD adds to DECISIONS.md as ADOPTED-DEFAULT (loop, 2026-10-29))
- D-42 Navigation: workers get an "Overview" tab first; default landing Overview, except roster-linked workers who keep "Assigned bookings" (J18). Owners keep
  "Bookings" as default, plus a "Next actions" strip (hidden when empty) and a "Workforce" tab. super_admin console tabs: Overview (default), Shop verification,
  Certification reviews, Contract disputes, Policies.
- D-43 Dashboard counts come from DB summary functions (P65); workers see "Latest openings" (newest 3 from `search_job_openings`), never "recommended for you"; no
  matching or ranking algorithm.
- D-44 Independent certification review = super_admin ("WashLink review"), worker-initiated only; bases: shop upheld (within 30 days), no shop decision within 14 days,
  issuer unavailable (shop removed / transferred / not verified, owner removed). Escalating withdraws the open shop request. Admin take-over without the worker -> W14,
  only if a human changes this row.
- D-45 WashLink reinstate needs no current issuer verification; WashLink never suspends, revokes, issues or renews; one decision per suspension / revocation event,
  final within WashLink.
- D-46 Holds while a WashLink review is open (P68). No automatic time limit on suspensions; stranded suspensions use the `issuer_unavailable` basis with no time
  window (W7-L13 stays OPEN).
- D-47 Contract disputes: either party, up to 90 days after the end; one answer from the other party; super_admin reads the contract only while open, every read
  audited; closes with `information_shared` / `referred_outside_washlink` / `no_platform_action` and a note to both; WashLink never reinstates a contract, awards pay
  or decides legal rights.
- D-48 W11 notifications: the fixed texts in 3.9, in-app only; W12 de-duplicates and schedules.
- D-49 Split: W14 as described at the top.

## 6. Tests (pgTAP `plan(n)` = actual; 0 `todo_start(`; each file <= 350 lines)
- Helpers: NEW `scripts/supabase-test/baseline/test_helpers_oversight.sql` (6th `HELPERS_SOURCE_NAMES` entry; update `stager_seeds_every_helper_file_in_order`;
  stager still 19 pass): `suspend_test_certification`, `request_test_shop_review` (REAL W7 RPCs), `backdate_shop_review_request(p_request, p_days)` (TEST-ONLY,
  technique of `backdate_certification`), `raise_test_contract_dispute` (real RPC). No helper inserts a review, dispute, status event or acceptance directly.
- `j8_w11_certification_platform_review_rules.test.sql` (J8): w11_worker_opens_review_after_shop_upheld, w11_open_refused_before_shop_decides_within_14_days,
  w11_open_allowed_when_shop_request_overdue_and_withdraws_it, w11_open_allowed_for_stranded_suspension_after_shop_removed, w11_open_allowed_when_owner_account_removed,
  w11_open_allowed_when_issuer_lost_verification, w11_revoked_issuer_unavailable_needs_30_day_window, w11_open_refused_for_active_or_superseded,
  w11_open_stale_status_55000, w11_statement_length_23514, w11_second_open_review_23505, w11_already_decided_event_refused,
  w11_super_admin_reinstates_without_issuer_verification, w11_reinstate_keeps_expiry_and_snapshots, w11_super_admin_upholds_certificate_unchanged,
  w11_decide_stale_revision_55000, w11_decide_reason_23514_and_decision_22023, w11_owner_worker_trainer_customer_cannot_decide, w11_worker_withdraws_open_review,
  w11_status_event_labelled_washlink_review.
- `j8_w11_certification_platform_review_holds.test.sql` (J8): w11_owner_revoke_refused_while_review_open, w11_worker_shop_request_refused_while_review_open,
  w11_owner_reinstate_resolves_review_by_shop, w11_holds_lift_after_decision_or_withdrawal, w11_no_w7_function_body_replaced (`pg_get_functiondef` unchanged).
- `j12_w11_contract_dispute_access.test.sql` (J12): j12_w11_admin_reads_contract_only_while_dispute_open, j12_w11_admin_case_read_audited_each_call,
  j12_w11_admin_document_only_for_versions_of_that_contract, j12_w11_admin_reads_nothing_without_dispute, j12_w11_other_owner_and_worker_cannot_raise_or_read_disputes,
  j12_w11_party_reads_hide_admin_ids, j12_w11_relationship_block_has_no_count_or_other_owners, j12_w11_closed_dispute_hides_contract_block.
- `j12_w11_contract_dispute_rules.test.sql`: w11_worker_disputes_owner_termination, w11_owner_raises_terms_dispute, w11_category_must_match_contract_end,
  w11_unsent_draft_cannot_be_disputed, w11_ninety_day_window_after_end, w11_one_open_dispute_per_party_23505, w11_max_three_per_party,
  w11_other_party_responds_once, w11_raiser_withdraws, w11_super_admin_closes_with_kind_and_note, w11_close_stale_revision_55000, w11_non_admin_cannot_close.
- `j16_w11_disputes_and_reviews_never_change_contracts.test.sql` (J16): j16_w11_open_dispute_does_not_block_terminate_or_decline,
  j16_w11_closing_dispute_leaves_contract_and_versions_unchanged, j16_w11_no_w11_function_writes_contract_tables (`prosrc` scan),
  j16_w11_w9_rpcs_do_not_reference_dispute_tables.
- `j17_w11_dashboard_summaries.test.sql` (J17, counts): w11_worker_summary_counts_match_reads, w11_worker_open_opening_count_matches_search,
  w11_owner_summary_counts_match_owner_reads, w11_owner_summary_counts_only_own_shops, w11_admin_summary_counts_reviews_disputes_overdue_stranded,
  w11_summaries_return_no_row_for_wrong_role_or_anon, w11_summary_columns_have_no_text_names (column type scan).
- `j17_w11_oversight_authorization.test.sql` (J17): j17_w11_tables_rls_enabled_and_no_client_write_privileges, j17_w11_write_policies_deny_all,
  j17_w11_direct_writes_refused_for_every_role_including_trusted_insert, j17_w11_internal_functions_not_client_executable, j17_w11_rpcs_denied_to_anon,
  j17_w11_definer_functions_pin_pg_temp_last, j17_w11_tables_not_in_realtime_publication, j17_w11_admin_functions_refuse_owner_worker_customer.
- `j6_w11_oversight_audit_and_notifications.test.sql`: w11_audit_actions_for_each_transition, w11_audit_payload_has_no_statements_reasons_notes_or_names,
  w11_notifications_fixed_text_one_per_event, w11_case_view_audits_without_notifications, w11_refused_action_writes_nothing.
- `j18_w11_flows.test.sql` (J18): j18_w11_owner_account_deletion_keeps_review_and_dispute, j18_w11_worker_account_deletion_cascades_and_audits,
  j18_w11_booking_quote_rating_and_verification_unchanged, j18_w11_w7_w9_w10_lifecycles_unchanged.
- Changed existing file (only this): `001_migration_replay.test.sql` (78 migrations, + 20261029000001..09; renamed `replay_schema_migrations_has_baseline_w2_to_w11`;
  add `replay_w11_review_and_dispute_tables_rls_enabled`).
- Smoke `scripts/supabase-test/w11-api-smoke.mjs` (W10 rules: loopback only, keys from local `supabase status` in memory, `smoke11-*@local.test` users deleted and
  asserted, no `.env`; TEST-ONLY 14-day backdate via `docker exec` psql as in W6 / W7): direct writes on both W11 tables denied for owner, worker, service_role;
  escalation refused before the shop decides, allowed after backdating (shop request withdrawn); owner revoke refused; owner / worker cannot decide; super_admin
  queue + case (audit row), uphold; second escalation refused; owner deleteUser -> issuer-unavailable escalation -> reinstate; worker `owner_ended_contract` dispute,
  owner response, admin case + document, close; contract unchanged; case after close has no contract block; other owner / worker read nothing; summaries return one
  row for the right role only; `set_config` and `certification_platform_review_basis` not callable. Must end `0 failed`.
- Vitest (mocked; suffixes `.j8`, `.j12`, `.j16`, `.j17`, `.w11`): w11_worker_overview_orders_next_actions_by_priority, w11_worker_overview_counts_render_from_summary,
  w11_latest_openings_never_says_recommended, w11_worker_default_tab_overview_unless_roster_linked, w11_owner_next_actions_strip_hidden_when_empty,
  w11_owner_next_action_switches_tab, w11_owner_bookings_stays_default_tab, w11_super_admin_console_tabs_and_default_overview,
  w11_dashboard_loading_empty_error_states, j8_w11_ask_washlink_review_only_when_eligible, j8_w11_review_modal_validates_statement_and_maps_errors,
  j8_w11_owner_sees_washlink_review_status_and_reason, w11_admin_review_decision_form_validates_reason, j12_w11_dispute_categories_follow_contract_end,
  j12_w11_party_dispute_list_respond_withdraw, w11_admin_dispute_case_shows_contract_only_while_open, j16_w11_dispute_copy_says_washlink_cannot_change_contract,
  j17_w11_repositories_use_rpcs_only, w11_error_messages_mapped. The existing 209 stay green unchanged.

## 7. Frontend (UI -> hooks -> services -> repositories -> Supabase; each file <= 350 lines) and docs
Add: `domain/models/{WorkforceDashboardSummary, CertificationPlatformReview, ContractDispute}.ts`; `domain/repositories/{WorkforceDashboardRepository,
CertificationPlatformReviewRepository, ContractDisputeRepository}.ts`; `domain/utilities/workforceNextActions.ts` (pure: summary -> ordered next actions per role);
`infrastructure/supabase/{supabaseWorkforceDashboardRows, supabaseCertificationPlatformReviewRows, supabaseContractDisputeRows}.ts`;
`infrastructure/repositories/Supabase{WorkforceDashboard, CertificationPlatformReview, ContractDispute}Repository.ts` (RPCs only);
`application/validation/oversightSchemas.ts` (zod); `application/services/{WorkforceDashboardService, CertificationPlatformReviewService, ContractDisputeService}.ts`;
`dependencyInjection/createOversightDependencies.ts`; `presentation/utilities/{workforceDashboardCopy, platformReviewCopy, contractDisputeCopy}.ts` (e.g. "WashLink can
read this contract only while the problem is open. WashLink cannot change, restart or end a contract, decide pay or decide legal rights. For those, contact the proper
government office or a lawyer."); hooks `useWorkforceDashboardSummary` (role-typed, `usePollWhileVisible`), `useCertificationPlatformReviews`,
`useOwnerCertificationPlatformReviews`, `useAdminCertificationReviewQueue`, `useAdminCertificationReviewCase`, `useContractDisputes`, `useAdminContractDisputeQueue`,
`useAdminContractDisputeCase`; components `shared/{NextActionList, DashboardCountGrid}.tsx`, `worker/dashboard/{WorkerOverviewPanel, LatestOpeningsList}.tsx` (reuses
`OwnerRelationshipProgressCard`), `worker/certifications/{AskWashLinkReviewModal, PlatformReviewStatusNotice}.tsx`, `contracts/{ReportContractProblemModal,
ContractDisputeList, RespondToContractProblemModal}.tsx`, `owner/dashboard/{OwnerNextActionsStrip, OwnerWorkforceOverviewPanel}.tsx`,
`owner/{OwnerDashboardTabPanels.tsx, ownerDashboardTabs.ts}` (extracted from `OwnerDashboardContent.tsx`, 326 lines today),
`owner/certifications/OwnerPlatformReviewNotice.tsx`, `superAdmin/{superAdminTabs.ts, AdminOverviewPanel, ShopVerificationSection (moved queue + drawer),
CertificationReviewQueuePanel, CertificationReviewCaseDrawer, DecidePlatformReviewForm, ContractDisputeQueuePanel, ContractDisputeCaseDrawer,
CloseContractDisputeForm}.tsx`. States: `Skeleton`, `EmptyState`, `LoadErrorNotice`, `applicationToast`. Change: `features/worker/{workerWorkspaceView.ts,
WorkerWorkspaceTabs.tsx}`, `features/superAdmin/SuperAdminDashboardPage.tsx` (tabs, lazy panels), `owner/OwnerDashboardContent.tsx`,
`dependencyInjection/{createDashboardDependencies, createWorkerMarketplaceDependencies, createSuperAdminDependencies}.ts`,
`worker/certifications/MyCertificationsPanel.tsx`, `owner/certifications/OwnerCertificationsPanel.tsx`, `worker/contracts/MyContractsPanel.tsx`,
`owner/workerContracts/OwnerWorkerContractsPanel.tsx` ("Report a problem" per row + list), `infrastructure/supabase/supabaseErrorMessages.ts`. Unchanged on purpose
(J16): `TerminateContractModal.tsx`, `DeclineContractModal.tsx`, `AcceptContractModal.tsx`, `WorkerContractReview.tsx`, `RequestCertificationReviewModal.tsx`. Docs: add
`docs/workforce/DASHBOARDS_AND_OVERSIGHT.md` (P65-P71, D-42..D-49, summaries, state machines, RPCs / messages, admin access and audit, limitations, rollback); update
`CERTIFICATIONS.md` (WashLink review, holds; close the W11 carry-forward section), `WORKER_CONTRACTS.md`, `OWNER_RELATIONSHIPS.md`, `AUDIT_AND_NOTIFICATIONS.md`,
`ROLE_AND_PROFILE_SECURITY.md` (D-10 rows 43-45: w11a preflight, new triggers on `certifications` / `certification_review_requests`, new column on
`certification_status_events`), `LOCAL_TEST_HARNESS.md` (78 migrations, 6th helper, W11 smoke), `LEGAL_REVIEW_REGISTER.md` (W11-L1..L10). RECORD: W11 smoke row in
LOOP.md, D-42..D-49 in DECISIONS.md, W14 in PLAN.md / STATE.md.

## 8. Acceptance criteria (repo root, local only: `cd frontend && npm run lint / build / test`; `backend/.venv/Scripts/python.exe -m pytest -q`; `node --test scripts/supabase-test/stage-local-workdir.test.mjs`; `node scripts/supabase-test/run-db-tests.mjs`; `w2-`..`w11-api-smoke.mjs`; never `--linked`, `--db-url`, `db push`, `.env`)
| AC | Criterion | Evidence |
|---|---|---|
| AC1 | 9 new migrations `2026_10_29_w11[a-i]_<snake>.sql`, each with `-- ROLLBACK`; nothing committed changed | `ls supabase/migrations/2026_10_29_w11*`; `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_29_w11*` empty; `git diff --name-status 6ce3f61 -- supabase/migrations` only `A` |
| AC2 | Clean replay of 78 migrations; PASS; 0 TODO | runner `Result: PASS`; `replay_schema_migrations_has_baseline_w2_to_w11`, `replay_w11_review_and_dispute_tables_rls_enabled`; `grep -c "todo_start(" supabase/tests/database/*.sql` all 0 |
| AC3 | Independent WashLink review (W7-L12): worker-initiated bases, super_admin-only decision, one decision per event | every name in `j8_w11_certification_platform_review_rules`; Vitest `j8_w11_*`; smoke review checks |
| AC4 | Holds and stranded suspensions (W7-L13) without replacing W7 bodies | every name in `j8_w11_certification_platform_review_holds`; every W7 pgTAP file `ok` |
| AC5 | J12 dispute access: contract readable by super_admin only via an open dispute, every read audited | every name in `j12_w11_contract_dispute_access`; Vitest `j12_w11_*`, `w11_admin_dispute_case_shows_contract_only_while_open`; smoke dispute checks |
| AC6 | Dispute rules incl. review of owner terminations | every name in `j12_w11_contract_dispute_rules` |
| AC7 | J16: disputes / reviews never change contracts or block decline / terminate | every name in `j16_w11_disputes_and_reviews_never_change_contracts`; Vitest `j16_w11_*`; `git diff 6ce3f61 --` the five J16 files in section 7 empty |
| AC8 | Accurate, role-scoped counts | every name in `j17_w11_dashboard_summaries`; smoke summary checks; Vitest `w11_worker_overview_counts_render_from_summary` |
| AC9 | Role-aware navigation, next action first, all states (D-42, D-43) | Vitest `w11_worker_*`, `w11_owner_*`, `w11_super_admin_console_tabs_and_default_overview`, `w11_dashboard_loading_empty_error_states`, `w11_latest_openings_never_says_recommended` |
| AC10 | J17 on W11 objects | every name in `j17_w11_oversight_authorization`; `w11-api-smoke.mjs` ends `0 failed`; W2-W10 smokes `0 failed` |
| AC11 | Audit and notifications private | every name in `j6_w11_oversight_audit_and_notifications` |
| AC12 | J18 and retention | every name in `j18_w11_flows`; every pre-W11 pgTAP file `ok`; `git diff --stat 6ce3f61 -- supabase/tests/database` only new files + `001_migration_replay.test.sql`; pytest `4 passed`; stager 19 pass |
| AC13 | Frontend | every section-6 Vitest name and the existing 209 pass; lint and build exit 0; `grep -rn "service_role" frontend/src` empty |
| AC14 | Size, safety, docs, legal | `wc -l` of every added / changed code file <= 350; no `.env` read; `git diff --stat 6ce3f61 -- backend` empty; section-7 docs exist; `grep -c "W11-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` >= 10 |

## 9. Rollback, risks and legal-review flags
Rollback (local only, reverse i..a): i producers (audit rows / notifications stay); h summaries; g, f dispute functions; e disputes table (IRREVERSIBLE: trusted `copy`
first); d, c review functions; b holds FIRST, then reviews table and `platform_review_id` column (IRREVERSIBLE: copy first); a nothing. Stager: drop the 6th helper.
Frontend: revert. W7 / W9 rollbacks are invalid while W11 objects exist.
Risks:
- R1 production drift (D-10): the new triggers on two W7 tables and the added column must match production (w11a aborts only on unknown W11-named objects).
- R2 holds add a lookup to each certificate status change and shop request (partial unique index; j8 holds tests).
- R3 VOLATILE case reads write an audit row per call; an audit failure aborts the read (fixed-shape payload).
- R4 escalation withdraws the shop request in the same transaction (W7 audits `review_withdrawn`; the W11 `opened` payload links it).
- R5 the W7 producer labels a WashLink decision `changed_by review_decision`; audit `actor_role` super_admin tells it apart (documented).
- R6 one super_admin decides alone (no panel, no second reviewer). R7 a DB superuser can disable triggers (W3-L3).
- R8 summaries run many counts per poll (polling as `usePollWhileVisible`). R9 `OwnerDashboardContent.tsx` (326) and `SuperAdminDashboardPage.tsx` must be split
  as listed in section 7 to stay <= 350.
Legal (to `LEGAL_REVIEW_REGISTER.md`, all OPEN; nothing in UI or docs claims compliance or legal effect):
- W11-L1 WashLink review of shop decisions (W7-L3, W7-L12): may a platform administrator reinstate a certificate a shop suspended or revoked, without assessing
  competence; no further appeal inside WashLink.
- W11-L2 stranded suspensions (W7-L13): no automatic time limit; whether one is needed, and notice to workers.
- W11-L3 cross-shop retaliation (W7-L14): the hold only blocks revocation during a WashLink review; whether cooling-off or disclosure is needed.
- W11-L4 the 14-day shop decision period and the 30 / 90-day windows: reasonableness.
- W11-L5 privacy (RA 10173): a super_admin reads contract text, acceptance records, statements and reasons; legal basis, audited access, retention, and telling
  the parties that WashLink read the contract.
- W11-L6 dispute channel vs labour dispute bodies (SEnA / DOLE / NLRC): wording of the referral note and of "WashLink cannot decide legal rights"; whether the
  channel creates duties or expectations.
- W11-L7 review of owner terminations (W9-L14): WashLink records and comments only; whether workers must be told of statutory remedies and deadlines.
- W11-L8 free-text statements, reasons and notes may defame or hold sensitive personal data; correction routes.
- W11-L9 dashboard wording must not pressure workers (W10-L1); "Latest openings" must not imply endorsement of postings (W4-L9).
- W11-L10 single-administrator decisions: conflicts of interest of a super_admin with a party; record keeping.
