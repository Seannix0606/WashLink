# Role-aware dashboards, WashLink certification reviews and reported contract problems (W11)

Local Docker proof only (D-10): nothing here was applied to the linked project. Every legal question is in
`LEGAL_REVIEW_REGISTER.md` (W11-L1..L10, all OPEN). Nothing in WashLink states that a WashLink review or a closed
contract problem has legal effect, that WashLink decides anyone's legal rights, or that any feature is compliant. A
WashLink review is a platform decision about a platform record (a shop-issued certification), not an appeal under any
law; a reported contract problem is a message channel, not a labour dispute procedure. The database part below
describes what was built (W11 LOG "BUILD (DB)" and "BUILD (frontend)").

Migrations (staged `20261029000001..09`; 78 staged migrations in total; each <= 350 lines with a commented `-- ROLLBACK`
block; no committed migration changed, no W7 / W9 function body replaced): `2026_10_29_w11a_oversight_preflight.sql`
(creates nothing), `w11b_certification_platform_reviews.sql`, `w11c_certification_platform_review_rpcs.sql`,
`w11d_certification_platform_review_reads.sql`, `w11e_worker_contract_disputes.sql`, `w11f_worker_contract_dispute_rpcs.sql`,
`w11g_worker_contract_dispute_reads.sql`, `w11h_workforce_dashboard_summaries.sql`, `w11i_oversight_audit_and_notifications.sql`.

## Split: what moved to W14 (D-49) and what W14 delivered

W11 keeps the dashboards and navigation, the independent certification review (W7-L12, W7-L13, D-21 conflict; part of
W7-L14) and contract-problem access including review of owner terminations (W9, W9-L14) with a dispute-scoped
relationship status (part of W10). **W14 "Platform moderation, oversight reads & admin audit"** delivered (database
w14a..w14i, and frontend built; `PLATFORM_MODERATION_AND_AUDIT.md`): worker reports of job openings with a
super_admin queue and an audited pause (with a hold) / close (W4-L4 / L7 / L8 / L9 -> W14-L1..L3); a super_admin UI for
`publish_platform_contract_template_version` (W8; frontend only); the redacted per-user `my_workforce_activity`, the
audited `admin_workforce_audit_log` and the N6 flag below (W3); audited super_admin relationship lookups outside
disputes (W10, D-38, D-55); a queue and re-review of approved shops without a recorded super_admin review (D-10 rows
14 / 22, D-56, with a runbook). Not delivered: admin take-over of overdue or stranded shop review requests (W14 plan
item 6 out; D-44 unchanged).

## Decisions (proposed defaults in W11 PLAN section 5; RECORD adds them to DECISIONS.md as ADOPTED-DEFAULT)

- D-42 navigation: workers get an "Overview" tab first and land on it, except roster-linked workers, who keep "Assigned
  bookings" (J18). Owners keep "Bookings" as default, plus a "Next actions" strip (hidden when empty) and a "Workforce"
  tab. super_admin console tabs: Overview (default), Shop verification, Certification reviews, Contract disputes, Policies
  (W14 D-57 shows nine when `moderationDependencies` is wired, as in production: adds Posting reports, Standard
  contract, Relationships, Audit log; without it the five W11 tabs stay, W14 F1 / F2).
- D-43 counts come from DB summary functions; workers see "Latest openings" (newest 3 from `search_job_openings`), never
  "recommended for you"; no matching or ranking algorithm.
- D-44 independent certification review = super_admin ("WashLink review"), opened by the certificate's worker only; bases:
  shop upheld (within 30 days), no shop decision within 14 days, issuer unavailable. Escalating withdraws the open shop
  request. Admin take-over without the worker only if a human changes this row (unchanged; W14 did not build it).
- D-45 a WashLink reinstatement needs no current issuer verification; WashLink never suspends, revokes, issues or renews;
  one decision per suspension / revocation event, final within WashLink.
- D-46 holds while a WashLink review is open (P68). No automatic time limit on suspensions; stranded suspensions use the
  `issuer_unavailable` basis with no time window (W7-L13 stays OPEN).
- D-47 contract problems: either party, up to 90 days after the end; one answer from the other party; super_admin reads
  the contract only while the problem is open, every read audited; closes with `information_shared` /
  `referred_outside_washlink` / `no_platform_action` and a note to both; WashLink never reinstates a contract, awards pay
  or decides legal rights.
- D-48 fixed notification texts (below), in-app only; W12 registered them and proved de-duplication (`NOTIFICATIONS_AND_SCHEDULING.md`). D-49 the W14 split above.

## Principles (P65-P71)

- P65 counts come from the database: one definer summary function per role, scoped to `auth.uid()` + profile role (wrong
  role or no JWT -> 0 rows, no error); integers, booleans, dates, timestamps and field KEYS only; each count reuses the
  read it summarises (pgTAP asserts equality).
- P66 a WashLink review is independent of the issuing shop: decided only by a super_admin (`auth.uid()` +
  `is_super_admin()` + role `super_admin`), shown as "WashLink review", never the admin's name; opened only by the
  certificate's worker (consent).
- P67 a WashLink review can only reinstate or keep a suspension / revocation; it never needs the issuer's current
  verification (D-23: validity rests on the issue-time snapshot) and never changes expiry, evidence or snapshots.
- P68 holds are NEW triggers on W7 tables (no W7 body changed): while a review is open the owner cannot revoke and the
  worker cannot open a shop review request (23514); an owner reinstatement closes the review as `resolved_by_shop`.
- P69 disputes never change contracts: no W11 function writes `worker_contracts`, `contract_versions` or acceptances
  (`prosrc` scan); the W9 decline / terminate / accept / activate RPCs are untouched and never read dispute tables (J16).
- P70 admin contract access is case-bound: contract metadata, sealed versions, acceptance records and the live (worker,
  owner) relationship status are readable by a super_admin only through the case functions, only while that dispute is
  `open`, and each call writes `worker_contract_dispute.case_viewed` (the functions are VOLATILE for that reason).
- P71 writes go through definer RPCs under transaction-local flags (`washlink.certification_platform_review_write`,
  `washlink.contract_dispute_write` = row id); deny-all write policies; no client role (incl. service_role) has a write
  grant; a trusted session without the flag is refused; FK set-null passes via `is_orphaned_fk_set_null`; deletes only by
  cascade. Statements, reasons and notes live only in their rows, never in audit payloads or notification texts.

## Dashboard summaries (w11h; definer, STABLE, one row for the right role, else 0 rows)

| Function | Columns |
|---|---|
| `my_worker_dashboard_summary()` (role worker) | `has_worker_profile`, `profile_missing_fields text[]` (`headline`, `experience_summary`, `skills`, `preferred_locations`, `availability`), `open_opening_count`, `draft_application_count`, `active_application_count` (submitted, under_review, shortlisted), `accepted_application_count`, `training_invitation_count`, `training_in_progress_count`, `next_training_date date` (Manila), `current_certification_count`, `expiring_30d_certification_count`, `suspended_or_revoked_certification_count`, `platform_review_available_count`, `open_platform_review_count`, `contract_offer_count`, `amendment_offer_count`, `accepted_not_started_count`, `active_contract_count`, `open_dispute_count`, `dispute_response_needed_count`, `counted_as_of` |
| `owner_dashboard_summary()` (role owner) | `shop_count`, `verified_shop_count`, `shops_needing_verification_count`, `published_opening_count`, `draft_opening_count`, `new_application_count` (submitted), `in_review_application_count`, `training_invitation_pending_count`, `trainee_in_progress_count`, `ready_to_certify_count`, `open_shop_review_request_count`, `open_platform_review_count`, `expiring_certification_count`, `record_changed_certification_count`, `active_template_count`, `newer_standard_template_available`, `contract_draft_count`, `offer_awaiting_worker_count`, `amendment_awaiting_worker_count`, `accepted_not_started_count`, `active_contract_count`, `relationship_needs_attention_count` (live `suspended`), `open_dispute_count`, `dispute_response_needed_count` |
| `admin_dashboard_summary()` (super_admin) | `shops_pending_review_count` (pending, changes_requested), `open_platform_review_count`, `oldest_platform_review_opened_at`, `overdue_shop_review_request_count` (open > 14 days), `stranded_suspended_certification_count`, `open_dispute_count`, `unviewed_dispute_count`, `oldest_dispute_opened_at` |

As built (W11 LOG deviation 6): `open_opening_count` uses the `search_job_openings` predicate (published, recorded shop
verification, deadline not passed) without its page limit, minus openings with a non-withdrawn application of the worker
and (fix cycle 1, C5) minus `certification_required` openings while the worker holds no current certificate (D-20, the W7
apply gate `worker_holds_current_certification`). `availability` is reported missing only when there
is no worker profile (`availability_status` is NOT NULL). `stranded_suspended_certification_count` = suspended
certificates whose basis is `issuer_unavailable` and whose `certification_platform_review_blocker()` is neither `open` nor
`decided` (fix cycle 1, C4: the same rule as `open` / `can_open`; a certificate at the 3-review limit stays counted, it has
no route left). Worker and owner counts call the
role's own reads (`my_certifications`, `my_worker_contracts`, `owner_certifications`, `owner_worker_contracts`,
`owner_worker_relationships`, `my_contract_disputes`, ...). The owner summary has no `counted_as_of` column. No names,
free text, contacts or other parties' ids (column type scan in `j17_w11_dashboard_summaries`).

## WashLink certification review (`certification_platform_reviews`, w11b..w11d)

Columns: `id`, `certification_id` (FK cascade), `worker_id` (FK `worker_profiles` cascade), `basis`,
`escalated_from_request_id` (FK `certification_review_requests` ON DELETE SET NULL, UNIQUE; fix cycle 1 N8, the guard
lets the set-null through via `is_orphaned_fk_set_null`), `status_event_id` (the latest suspended / revoked status event
at open, set by the guard from `certification_platform_review_current_event()`; no FK), `certification_status_at_open`
(suspended / revoked), `worker_statement` (20..1000), `status`, `opened_at`, `decided_at`, `decided_by` (FK profiles set
null), `decision_reason` (20..500), `closed_at`, `revision`, stamps. CHECK `cpr_status_consistency`; one open review per
certificate (partial UNIQUE). `certification_status_events.platform_review_id uuid` was added with NO FK (reviews and
events both cascade from the certificate; an FK cascade from the review would trip the W7 event guard). The guard
forces status `open`, stamps and revision 1 on INSERT, allows only open -> another status with only status / decision /
close / revision columns changing, stamps `decided_by = auth.uid()`, and refuses everything else (42501 `Certification
records cannot be edited.`; without the flag 42501 `WashLink reviews change only through the WashLink review actions.`).

Bases (internal `certification_platform_review_basis`, precedence top to bottom; null = not eligible):

| Basis | Condition |
|---|---|
| `issuer_unavailable` | `shop_id` or `owner_id` null, `shops.owner_id` differs, the owner's profile role is not owner, or the shop has no recorded verification. A SUSPENDED certificate: no time limit (stranded suspensions, W7-L13). A REVOKED one: the latest suspended / revoked event within 30 days or an open shop request. |
| `shop_decision_overdue` | an open shop review request with `requested_at <= now() - 14 days` (`certification_platform_review_owner_decision_days()` = 14, granted to `authenticated` so the UI can show it) |
| `resuspended_after_shop_resolution` | fix cycle 1 (N2): the latest suspended / revoked event was made by the issuing owner (`actor_role` owner, `actor_id` = `owner_id`) within 30 days after a WashLink review of this certificate closed as `resolved_by_shop`. Eligible at once, no new shop request; no expiry while that event is current. Stops the reinstate / re-suspend loop. |
| `upheld_by_shop` | the latest shop request was `upheld` by a shop event after the latest suspended / revoked event, decided within 30 days |

"After the latest event" compares `certification_status_events.id` (identity), not timestamps, because `now()` is
constant inside a transaction (LOG deviation 1).

| From | To | Who | Condition / effect |
|---|---|---|---|
| (none) | open | certificate worker | suspended / revoked; a basis; `certification_platform_review_blocker()` null: no open review, no WashLink decision yet for the latest suspended / revoked event, fewer than 3 reviews of that event (withdrawn and resolved ones count; fix cycle 1 N5); an open shop request becomes `withdrawn` (W7 flag, linked by `escalated_from_request_id`) |
| open | reinstated | super_admin | reason 20..500; certificate -> active, reason null, expiry / evidence / snapshots unchanged, no verification check |
| open | upheld | super_admin | reason; certificate unchanged; final for this event |
| open | withdrawn | certificate worker | - |
| open | resolved_by_shop | system (trigger) | the issuing owner reinstated through W7 |
| any | (deleted) | cascade | certificate or worker account removed (audited) |

Holds (definer, revoked from every client role): `certification_review_requests_platform_hold` (BEFORE INSERT on
`certification_review_requests`), `certifications_platform_review_hold` (BEFORE UPDATE OF status on `certifications`,
new status `revoked`) -> 23514 `WashLink is reviewing this certification. Wait for its decision.`;
`certifications_platform_review_resolve` (AFTER UPDATE OF status, suspended / revoked -> active, skipped when
`washlink.certification_platform_review_decision` is set) closes the open review as `resolved_by_shop`. Other W7
transitions (e.g. owner suspend -> reinstate) are unchanged. A decision sets
`washlink.certification_change_source = review_decision`, updates the certificate under the W7 flag (reinstate only) and
inserts a status event `reinstated` / `review_upheld` with `actor_display_name = 'WashLink review'` and
`platform_review_id`; the W7 producer audits it as `changed_by review_decision` (audit `actor_role` super_admin tells it
apart from a shop decision, R5). Admin id mask (fix cycle 1 N1; definer, revoked from every client role; names sort after
the W7 guards): `certifications_zz_platform_review_mask` (BEFORE UPDATE OF status; decision flag naming an open review of
the certificate, caller super_admin) nulls `status_changed_by`; `certification_status_events_zz_platform_review_mask`
(BEFORE INSERT) nulls `actor_id` when `platform_review_id` is set (`actor_role` stays `super_admin`). The issuing owner's
raw W7 rows therefore never hold the deciding administrator's id; accountability stays in `decided_by` and
`workforce_audit_events.actor_id` (super_admin only). Owner changes are not masked.

RPCs (`authenticated` only; anon / service_role have no EXECUTE):

| Function | Errors (code, text) |
|---|---|
| `open_certification_platform_review(p_certification_id, p_expected_status, p_statement)` | 42501 `Certification not found.`; 55000 `This certification changed. Refresh and try again.`; 23514 `Only a suspended or revoked certification can be reviewed.`; 23505 `WashLink is already reviewing this certification.`; 23514 `WashLink already reviewed this decision.`; 23514 `You can ask WashLink to review this decision at most 3 times.` (fix cycle 1 N5); 23514 `Ask the shop to review this decision first. You can ask WashLink when the shop keeps its decision, has not decided within 14 days, or can no longer decide.`; 23514 `Write a statement of 20 to 1000 characters.` |
| `withdraw_certification_platform_review(p_review_id)` | 42501 `WashLink review not found.`; 23514 `This review is no longer open.` |
| `decide_certification_platform_review(p_review_id, p_expected_revision, p_decision, p_reason)` | 42501 `Only a platform administrator can decide WashLink reviews.` / `WashLink review not found.`; 23514 `This review is no longer open.`; 55000 `This review changed. Refresh and try again.`; 22023 `Choose reinstate or uphold.`; 23514 `Give a reason of 20 to 500 characters.`; 23514 `This certification is no longer suspended or revoked.` |
| holds (W7 `transition_certification(..., 'revoked', ...)`, `request_certification_review`) | 23514 `WashLink is reviewing this certification. Wait for its decision.` |

Reads (w11d, definer): `my_certification_platform_reviews()` (worker: own suspended / revoked certificates and any with
a review; `certification_id, can_open, basis, open_review_id, latest_status, latest_decision_reason, latest_decided_at,
opened_at`); `owner_certification_platform_reviews()` (current issuing owner, as `owner_certifications`;
`certification_id, review_id, status, basis, worker_statement, decision_reason, opened_at, decided_at`);
`admin_certification_platform_review_queue(p_status default 'open')` (22023 `Choose a review status.`; non-admin 0 rows;
oldest first, limit 200); `admin_certification_platform_review_case(p_review_id) -> jsonb` (VOLATILE, audits
`certification_platform_review.case_viewed`; keys `review`, `worker_display_name` (trimmed `full_name` or `Worker`),
`certification` (titles and snapshots, issued / expires, status, effective status, reason, attended / required days,
verification snapshot at issue, live shop / owner flags, `training_record_changed_after_issue`), `status_events`,
`shop_requests`; 42501 `Only a platform administrator can read WashLink reviews.` / `WashLink review not found.`). Party
reads expose no admin ids or names. No client role (super_admin included) has a raw table SELECT: the select policy is
deny-all (fix cycle 1 N3), so admin reads go only through the queue and the audited case read.

## Reported contract problems (`worker_contract_disputes`, w11e..w11g)

Columns: `id`, `contract_id` (FK cascade), `raised_by` (FK set null), `raised_by_role` (worker / owner), `category`
(`owner_ended_contract`, `worker_ended_contract`, `contract_terms`, `amendment`, `acceptance_record`, `other`),
`statement` (20..1000), `contract_status_at_raise` (the EFFECTIVE status, LOG deviation 4), `response_statement`
(20..1000), `response_by`, `responded_at`, `status` (open / closed / withdrawn), `resolution_kind`
(`information_shared`, `referred_outside_washlink`, `no_platform_action`), `resolution_note` (20..1000), `closed_by`,
`closed_at`, `withdrawn_at`, `first_viewed_by_admin_at`, `revision`, stamps. One open dispute per (contract, party)
(partial UNIQUE) plus an advisory lock per (contract, party) in the raise RPC. Immutable after insert: id, contract,
raiser role, category, statement, status at raise, created_at; one response; closed and withdrawn rows are final.
Without the flag: 42501 `Reported contract problems change only through WashLink.`; other edits 42501 `Reported
contract problems cannot be edited.`. A first admin case view stamps `first_viewed_by_admin_at` WITHOUT bumping the
revision, so the queue revision stays valid for closing (LOG deviation 3); responses, withdrawals and closes bump it.

| From | To | Who | Condition |
|---|---|---|---|
| (none) | open | worker (contract sent to them) or owner (`owner_id`) | contract sent; not ended more than 90 days ago (declined / withdrawn / expired / terminated: `ended_at`; effectively expired: end of `end_date` in Manila); category fits (`owner_ended_contract` needs `ended_by` owner and a worker raiser, `worker_ended_contract` the reverse); one open per party; at most 3 per party and contract |
| open | open (+ response) | the other party | once |
| open | closed | super_admin | resolution kind + note 20..1000; contract unchanged |
| open | withdrawn | raiser | - |
| any | (deleted) | cascade | contract removed by W9 retention |

| Function | Errors (code, text) |
|---|---|
| `raise_contract_dispute(p_contract_id, p_category, p_statement)` | 42501 `Contract not found.`; 23514 `Only a contract that was sent can be reported.`; 23514 `Problems can be reported up to 90 days after a contract ends.`; 22023 `Choose a problem category.`; 23514 `This category does not match the contract.`; 23505 `You already reported a problem with this contract.`; 23514 `You can report at most 3 problems with this contract.`; 23514 `Write a statement of 20 to 1000 characters.` |
| `respond_to_contract_dispute(p_dispute_id, p_statement)` | 42501 `Reported problem not found.` / `Only the other party can add a response.`; 23514 `This reported problem is no longer open.`; 23505 `A response was already recorded.`; 23514 statement length |
| `withdraw_contract_dispute(p_dispute_id)` | 42501 `Reported problem not found.`; 23514 `This reported problem is no longer open.` |
| `close_contract_dispute(p_dispute_id, p_expected_revision, p_resolution_kind, p_resolution_note)` | 42501 `Only a platform administrator can close disputes.` / `Reported problem not found.`; 23514 `This reported problem is no longer open.`; 55000 `This reported problem changed. Refresh and try again.`; 22023 `Choose how the problem was closed.`; 23514 `Write a note of 20 to 1000 characters.` |

None of the four writes `worker_contracts` or a contract child table; the contract row is locked FOR SHARE only for the
statement's transaction, so a decline or termination is never blocked (J16).

Reads (w11g, definer): `my_contract_disputes()` (parties; `dispute_id, contract_id, shop_name, counterpart_name` (name
snapshots both parties already see), `category, status, raised_by_me, statement, response_statement, resolution_kind,
resolution_note, created_at, responded_at, closed_at, washlink_has_viewed, can_respond, can_withdraw`; no admin ids);
`admin_contract_dispute_queue(p_status default 'open')` (22023 `Choose a dispute status.`; oldest first, limit 200;
`dispute_id, contract_id, category, status, revision, raised_by_role, has_response, contract_status, effective_status,
shop_name_snapshot, created_at`; the queue is not audited, so `contract_status`, `effective_status` and
`shop_name_snapshot` are null unless the dispute is open, fix cycle 1 N4). Raw table SELECT: deny-all for every client
role incl. super_admin (N3).

## Admin case access and audit (P70)

`admin_contract_dispute_case(p_dispute_id) -> jsonb` (VOLATILE; 42501 `Only a platform administrator can read reported
contract problems.` / `Reported problem not found.`) returns `dispute` always. While the dispute is OPEN it adds
`contract` (status, effective status, `classification_key` from the current version, else the latest sealed one, start /
end dates, sent / accepted / activated / ended stamps, `ended_by`, `end_reason`, `decline_note`, shop / owner / worker
name snapshots, removed flags), `versions` (sealed only: id, number, kind, state, sealed_at, content_hash, flag_count),
`acceptances` (party role, version number, accepted_at, version hash, record label) and `relationship` (`status`,
`status_reason` from `worker_owner_relationship_derive`; no count, remaining, minimum or other owners).
`admin_contract_dispute_version_document(p_dispute_id, p_version_id)` returns `rendered_text, content_hash, sealed_at,
record_label` (`Acceptance record — not an e-signature`) only for an open dispute and a sealed version of that contract
(else 0 rows). Every case call and every returned document writes `worker_contract_dispute.case_viewed` (payload
dispute_id, contract_id, to_status, `contract_block` or `version_id`); the review case writes
`certification_platform_review.case_viewed`. An audit failure aborts the read (R3). Parties see `washlink_has_viewed`.
N6 (W11 REVIEW) is addressed by W14 `admin_oversight_access_flags()`: an OPEN dispute open >= 30 days with >= 5
`worker_contract_dispute.case_viewed` events (case and document reads) is listed for the administrators; it informs,
it does not block reads (W14-L12).

## Audit and notifications (w11i; W3 rules: an audit failure aborts the action, a notification problem never does)

| Event | Audit action (subject) | Notification (category: recipient, title, body) |
|---|---|---|
| review opened | `certification_platform_review.opened` (certification; subject_profile worker) | `certification_platform_review.opened`: current issuing owner, "WashLink review requested", `A worker asked WashLink to review a certification decision for <program>.` |
| review decided | `.decided` (decision reinstated / upheld) | `certification_platform_review.decided`: worker, "WashLink review decided", `WashLink reviewed your certification for <program>: reinstated.` / `: decision kept.`; current issuing owner, `WashLink reviewed a certification decision for <program>.` |
| review withdrawn / resolved by the shop / deleted | `.withdrawn` / `.resolved_by_shop` / `.deleted` | none |
| problem raised | `worker_contract_dispute.raised` (worker_contract; subject_profile owner, the worker once the owner is gone) | `worker_contract_dispute.raised`, "Contract problem reported": owner `A worker reported a problem with a contract to WashLink. You can add your side.`; worker `<shop>: a problem with your contract was reported to WashLink. You can add your side.` |
| response / withdrawn / deleted | `.responded` / `.withdrawn` / `.deleted` | none |
| problem closed | `.closed` | `worker_contract_dispute.closed`, "Contract problem closed": both parties, `WashLink closed a reported contract problem. Open it to read the note.` |
| case views | `.case_viewed` (see above) | none |

Review payload keys: certification_id, platform_review_id, basis, from_status, to_status, decision,
escalated_from_request, changed_by (`worker` / `super_admin` / `issuing_owner` / `trusted_session`; `.deleted`:
`worker_profile_deleted` / `certification_deleted`). Dispute payload keys: dispute_id, contract_id, category,
raised_by_role, from_status, to_status, resolution_kind, changed_by (caller role / `trusted_session` /
`contract_deleted`). Never statements, reasons, notes, names or dates. Labels: `notification_safe_label(program
snapshot, 'a training program')`, `(shop snapshot, 'The shop')`. Keys `certification_platform_review:<id>:<event>` and
`contract_dispute:<id>:<event>`. Trusted SQL (no `auth.uid()`) and cascades notify nobody. Neither table is in Realtime.

## Frontend (as built, W11 LOG "BUILD (frontend)"; paths under `frontend/src/`, component paths under `presentation/components/`)

UI -> hooks -> services -> repositories (RPCs only) -> Supabase; every file <= 350 lines; no `service_role` in
`frontend/src`. No browser / visual check and no run against the local stack yet (Vitest is mocked).

- Layers: models `domain/models/{WorkforceDashboardSummary, CertificationPlatformReview, ContractDispute}.ts` (the
  category rule and the 90-day hint live in `ContractDispute.ts`); repository interfaces in `domain/repositories/`;
  `infrastructure/repositories/Supabase{WorkforceDashboard, CertificationPlatformReview, ContractDispute}Repository.ts`
  plus `supabaseRpcCalls.ts`; row mappers `infrastructure/supabase/supabase{WorkforceDashboard, CertificationPlatformReview,
  ContractDispute}Rows.ts`; `infrastructure/supabase/supabaseOversightErrorMessages.ts` (every user-facing W11 error text,
  merged into `supabaseErrorMessages.ts`; preflight / Realtime / "W11i: missing" texts are not mapped); zod
  `application/validation/oversightSchemas.ts`; services `application/services/{WorkforceDashboardService,
  CertificationPlatformReviewService, ContractDisputeService}.ts`; pure `domain/utilities/workforceNextActions.ts`
  (summary -> ordered next actions per role).
- Wiring (deviation 1): `presentation/dependencyInjection/createOversightDependencies.ts`, exposed as
  `oversightDependencies` by `createDashboardDependencies`, `createSuperAdminDependencies` and (OPTIONAL)
  `createWorkerMarketplaceDependencies`. The W7 / W9 panels get new optional props (`platformReviewService` on
  `MyCertificationsPanel` / `OwnerCertificationsPanel`, `contractDisputeService` on `MyContractsPanel` /
  `OwnerWorkerContractsPanel`); without them nothing W11 is shown or read, and the worker Overview and owner Workforce
  tabs are hidden. `createCertificationDependencies` / `createWorkerContractDependencies` are unchanged.
- Hooks (`presentation/hooks/`): `useWorkforceDashboardSummary`, `useLatestOpenings`, `useCertificationPlatformReviews`,
  `useOwnerCertificationPlatformReviews`, `useAdminCertificationReviewQueue` / `Case`, `useContractDisputes`,
  `useAdminContractDisputeQueue` / `Case`, `useOversightActionRunner`. Summaries and queues poll every 60 s while visible
  (`usePollWhileVisible`). Admin case reads (both kinds, VOLATILE and audited) run once when the drawer opens and once
  after a decide / close; they are never polled or refreshed on focus. Under React StrictMode in development the mount
  effect can run twice (two audited reads). Version text is read only on "Read this version".
- Worker (`features/worker/{workerWorkspaceView.ts, WorkerWorkspaceTabs.tsx}`): Overview tab first and default, except
  roster-linked workers (Assigned bookings); `worker/dashboard/{WorkerOverviewPanel,
  LatestOpeningsList}.tsx` (next actions via `shared/NextActionList.tsx`, counts via `shared/DashboardCountGrid.tsx`, the
  W10 progress card; "complete your profile" opens the existing profile editor). "Latest openings" = newest 3 from
  `search_job_openings`, never "recommended"; it shows the stated amount line or "Pay: see the opening details" (search
  rows carry no compensation details).
- Certificates: `worker/certifications/{AskWashLinkReviewModal, PlatformReviewStatusNotice}.tsx`; "Ask WashLink to
  review" only when `can_open` is true (the client never decides eligibility); `p_expected_status` = the status the
  worker saw. Owner: `owner/certifications/OwnerPlatformReviewNotice.tsx` (changed: `OwnerCertificationsPanel`,
  `OwnerShopCertifications`, `OwnerCertificationListItem`, `certifications/CertificationCard.tsx`, optional slots only).
  UI holds (deviation 3, hints only, the database enforces): while a WashLink review is open the worker's shop "Ask for
  a review" button is hidden and the owner is not offered "Revoke"; "Reinstate" stays.
- Contracts: `contracts/{ReportContractProblemModal, ContractDisputeList, RespondToContractProblemModal}.tsx`, "Report a
  problem" per row in `MyContractsPanel` / `OwnerWorkerContractsPanel`; categories offered per the contract end.
- Owner: `OwnerDashboardContent.tsx` split (326 -> 239 lines) into `owner/OwnerDashboardTabPanels.tsx` (tab bodies) and
  `owner/ownerDashboardTabs.ts` (tab list); `owner/dashboard/{OwnerNextActionsStrip, OwnerWorkforceOverviewPanel}.tsx`.
  Bookings stays default; Workforce tab after Bookings; the strip is hidden when empty and while the summary is loading,
  failed or absent (the Workforce tab shows those states).
- super_admin: `features/superAdmin/SuperAdminDashboardPage.tsx` (123 -> 99 lines, lazy tab panels) with
  `superAdmin/{superAdminTabs.ts, AdminOverviewPanel, ShopVerificationSection, CertificationReviewQueuePanel,
  CertificationReviewCaseDrawer, DecidePlatformReviewForm, ContractDisputeQueuePanel, ContractDisputeCaseDrawer,
  CloseContractDisputeForm}.tsx`. The open-dispute next action shows `open_dispute_count` as returned; unviewed is a
  separate item.
- Copy (`presentation/utilities/`): `workforceDashboardCopy.ts` (incl. the "Latest openings" note: not ranked or matched,
  listing does not mean WashLink vouches for them), `workforceDashboardDisplay.ts`, `platformReviewCopy.ts` (decider
  always "WashLink review"), `contractDisputeCopy.ts` ("WashLink can read this contract only while the problem is open.
  WashLink cannot change, restart or end a contract, decide pay or decide legal rights. For those, contact the proper
  government office or a lawyer.").
- States and feedback: loading / empty / error / success on every view; 55000 answers are toasted with " It was
  reloaded." and re-read, never shown as success; forms use `noValidate` so the database's own texts (zod) appear.
  `TerminateContractModal`, `DeclineContractModal`, `AcceptContractModal`, `WorkerContractReview` and
  `RequestCertificationReviewModal` are byte-identical to HEAD (J16). Hiding actions is never authorization.

## Tests

pgTAP (10 files, 265 assertions, plan = actual, 0 `todo_start(`): `j8_w11_certification_platform_review_rules` (51),
`j8_w11_certification_platform_review_holds` (18), `j8_w11_fix1_review_mask_resuspend_cap` (32: N1 mask, N2, N5, N8, N4,
C4, C5), `j12_w11_contract_dispute_access` (31), `j12_w11_contract_dispute_rules` (42),
`j16_w11_disputes_and_reviews_never_change_contracts` (14), `j17_w11_dashboard_summaries` (24),
`j17_w11_oversight_authorization` (25, incl. N3), `j6_w11_oversight_audit_and_notifications` (12), `j18_w11_flows` (16);
`001_migration_replay` plan 24 (78 migrations). Full run after fix cycle 1: 82 files / 2622 tests, `Result: PASS`;
W2..W11 smokes `0 failed` (w11: 36 checks). Helper `scripts/supabase-test/baseline/test_helpers_oversight.sql` (6th entry).
31 functions carry the `W11:` comment (30 definer + the immutable days function).
Vitest (frontend build): 117 files / 228 tests pass (the existing 209 unchanged + 19 new, one per PLAN section-6 name;
suffixes `.j8`, `.j12`, `.j16`, `.j17`, `.w11`; fixtures `test/oversightFixtures.ts`). Smoke
`scripts/supabase-test/w11-api-smoke.mjs`: see `LOCAL_TEST_HARNESS.md`.

## Limitations, risks and open findings

- The deciding administrator's id is masked in the raw W7 rows the issuing owner can read (fix cycle 1 N1, mask triggers
  above; tested in `j8_w11_fix1_review_mask_resuspend_cap`). The W7 guard bodies are unchanged.
- R1 production drift (D-10 rows 43-45 in `ROLE_AND_PROFILE_SECURITY.md`): new triggers on three W7 tables and a new
  column; w11a aborts only on unknown W11-named objects. R2 holds add a lookup to each certificate status change and
  shop request. R3 case reads write an audit row per call; an audit failure aborts the read. R4 escalation withdraws
  the shop request in the same transaction (W7 audits `review_withdrawn`; the W11 `opened` payload links it). R5 the
  W7 producer labels a WashLink decision `changed_by review_decision`. R6 one super_admin decides alone (no panel, no
  second reviewer, no conflict check). R7 a database superuser can disable triggers (W3-L3). R8 the summaries run many
  counts per poll.
- The owner overview labels `relationship_needs_attention_count` "Relationships needing attention" / "N worker relationships
  need attention" (`presentation/utilities/workforceDashboardDisplay.ts:86`, `workforceDashboardCopy.ts:34`), matching W10's
  owner label "Needs attention" (D-36, W10-L9); an earlier "Suspended" wording was corrected before review. StrictMode double
  case reads (dev only).
- Concurrency (two simultaneous raises / opens) relies on partial unique indexes and an advisory lock; not exercised
  with parallel sessions. No automatic lifting of suspensions; no email / SMS / push (W12 kept in-app only, D-61); the reviewer sees only the
  records, not the worker in person (W11-L1).

## Rollback (local test stack only; reverse order i..a)

i: drop the producers (audit rows and notifications stay). h: drop the three summaries. g, f: drop the dispute reads and
RPCs. e: drop the dispute guard and table (IRREVERSIBLE: trusted `copy` first). d, c: drop the review reads and RPCs. b:
drop the holds FIRST, then the guard, the reviews table and `certification_status_events.platform_review_id`
(IRREVERSIBLE: copy the reviews and linked events first). a: nothing. Stager: drop the 6th helper entry. Frontend:
revert. W7 / W9 / W10 rollbacks are invalid while W11 objects exist; roll back W14 (i..a) before W11 (w14h reads the
W11 disputes).
