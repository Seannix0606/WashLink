# Shop-issued certifications (W7)

Migrations `2026_10_26_w7a` .. `w7h` (staged `20261026000001..08`). Spec D (certification decision, approver and
time, expiry / renewal, revoke / suspend with audit and review; never government-recognized), A (only verified
shops issue), B / C (certification-required openings), H, I; acceptance tests J3 (certification half), J6
(certification part), J8 (certification half), J17, J18. Decisions: D-5, D-12 -> D-20, D-18, D-20..D-25
(`loop/workforce/DECISIONS.md`). Verified on the local Docker stack only (D-10 rows 33-35 in
`ROLE_AND_PROFILE_SECURITY.md`); nothing here says anything about the linked project. No item in this document
is a compliance claim; open legal questions are W7-L1..L11 in `LEGAL_REVIEW_REGISTER.md`.

A WashLink certification is a **shop-issued certification**: a record that one shop, with a verification
recorded on WashLink, confirmed that the worker attended its required training and passed its assessment. It is
not a government-recognized credential, licence or TESDA National Certificate, and WashLink does not vouch for
the worker's competence.

## Principles (continue P1-P29)

| ID | Rule |
|---|---|
| P30 | Every write to a W7 table goes through a definer RPC under the transaction-local flag `washlink.certification_write` = row id (certification id for status events, shop id for the policy row). No client role (anon, authenticated, service_role) has INSERT / UPDATE / DELETE; write policies are deny-all. There is no trusted-session bypass; trusted SQL is told apart only by audit `changed_by` / `actor_kind`. The only UPDATE accepted without the flag is a D-18 FK set-null. |
| P31 | Issued facts are write-once for EVERY session (42501 `Certification records cannot be edited.`): worker, enrollment, program, assessment, title, issuer kind, issued / approved stamps, approver, assessor, validity, expiry, attestation, shop verification snapshot, evidence snapshot. Only `status`, `status_reason`, `status_changed_at`, `status_changed_by`, `updated_at` change (under the flag). |
| P32 | No backdating: the BEFORE INSERT guard sets `issued_at = approved_at = now()`, `validity_months = shop_certification_validity_months(shop)` and `expires_at = (Manila local issue time + validity months)` for every session, ignoring supplied values. No RPC takes a date, a validity or a time; functions with `p_at` / `p_as_of` refuse a past value (22023). |
| P33 | Expiry is derived: `certification_effective_status(status, expires_at, at)` = `expired` when status is `active` and `at >= expires_at`, else status. "Current" = effective `active`. Time never changes a stored row. |
| P34 | `issuer_kind` CHECK = `shop_issued`. Copy says "Shop-issued certification" and "Not a government-recognized credential."; no string claims recognition, accreditation, a licence or compliance. |
| P35 | No fee: no W7 column, parameter or function body mentions fees, charges, prices, deductions, bookings or pricing (`j17_w7_no_fee_columns_parameters_or_booking_references`). |
| P36 | Audit payloads carry ids, status words, booleans and small counts only; reasons and statements live only in their own tables, readable by the certificate's worker and the issuing shop's current owner. |

## Tables

| Table | Purpose | Key rules |
|---|---|---|
| `shop_certification_policies` | per-shop validity (D-5) | PK `shop_id` (cascade with the shop); `validity_months` 1..36, absent row = 12; applies to future issues and renewals only |
| `certifications` | one row per issue or renewal | FKs: worker (cascade), enrollment NOT NULL (cascade, W0 C1), program (restrict), assessment (cascade), `renews_certification_id` (cascade), `reassessment_id` (cascade; set exactly for renewals), shop / owner / approver (set null, D-18); snapshots: shop name, program title, approver and assessor display names, attended / required days (>= 3), attestation `w7_issuer_v1`, shop verification at issue (status `approved`, reviewer id, review time, latest `shop.verification_decided` audit id, null for pre-W3 approvals), evidence JSON (<= 32 KB); status active / suspended / revoked / superseded; reason 20..500 exactly while suspended or revoked |
| `certification_status_events` | append-only history | events issued, renewed, suspended, revoked, reinstated, superseded, review_upheld; reason required for suspended / revoked / reinstated / review_upheld; actor id / role server-set |
| `certification_review_requests` | worker review of a suspension / revocation | open -> reinstated / upheld (issuing owner, reason 20..500) or withdrawn (worker); statement 20..1000; one open per certificate, at most 3 per certificate |
| `certification_reassessments` | renewal by re-assessment (D-5, D-22) | append-only; checklist frozen from the program; pass needs every item; fail needs a reason 10..300; recorder owner or designated trainer (W6 rules, never the worker); latest row (by `recorded_at`, a clock timestamp) is current |

Indexes: one original certificate per enrollment (`renews_certification_id is null`), a certificate renewed
once, a re-assessment used once, plus FK / filter indexes. All five tables have RLS enabled and are excluded
from `supabase_realtime` (w7c aborts if the publication is FOR ALL TABLES).

The evidence snapshot (version 1) holds: enrollment and program ids, program title, required and attended days,
attended dates and attendance record ids (CURRENT, non-superseded present supervised rows only), assessment id,
result, date, assessor role and display name, checklist and items met, acceptance time. Renewals add the old
certificate id, the re-assessment id and date, the re-assessor role / name and items met.

## Issue (`issue_certification(enrollment, expected_assessment, attestation)`, w7e)

Lock order (global): shops row FOR SHARE -> training_programs FOR SHARE -> training_enrollments FOR SHARE ->
advisory `training_evidence:<enrollment>` (the W6 recorder key, so an issue and an evidence write or correction
serialise) -> advisory `certifications:<worker>` -> certifications row FOR UPDATE. Checks, in order:

| Check | Error |
|---|---|
| caller is not role owner (workers, trainers, customers, super_admin) | 42501 `Only the shop owner can issue certifications.` |
| enrollment missing, or caller not the CURRENT owner of its shop (`enrollment.owner_id = shops.owner_id = auth.uid()`; also a removed shop) | 42501 `Training enrollment not found.` |
| shop has no recorded verification (`is_verified_shop_owner`) | 23514 `Only a verified shop can issue certifications.` |
| attestation is not `w7_issuer_v1` | 23514 `Confirm the certification statement before issuing.` |
| enrollment not accepted, not `training_enrollment_is_completed`, attended < greatest(3, min days) or current assessment not passed (re-read after the locks) | 23514 `This training is not completed. A certification needs at least 3 attended training days and a passed assessment.` |
| current assessment id <> expected | 55000 `The training record changed. Review it again.` |
| an original certificate exists for the enrollment | 23505 `A certification was already issued for this training.` |
| the worker holds a live (active and not expired, or suspended) certificate of this program | 23505 `This worker already holds a current certification from this program.` |

Approver = the caller (role `owner`); assessor copied from the current assessment row.

## Status state machine (`transition_certification`, w7f)

| From (stored / effective) | To | Who | Condition |
|---|---|---|---|
| (none) | active | current owner of a verified program shop | `issue_certification` only |
| active, effective active | suspended | current owner of the issuing shop | reason 20..500; verification NOT required (protective action) |
| active (also effective expired), suspended | revoked | same | reason |
| suspended | active (reinstate) | same | reason; recorded verification; expiry unchanged |
| active, renewal window open | superseded | same, verified | `renew_certification` only |
| revoked or suspended | active | same, verified | only `decide_certification_review(..., 'reinstate', ...)` |

Everything else is refused: 42501 `This certification status change is not allowed.` (also same status, out of
revoked / superseded, worker actor); 42501 `Certification not found.` for a caller who is neither the worker nor
the current issuing owner (trainers, other owners, super_admin, customers); 55000 `This certification changed.
Refresh and try again.` for a stale `p_from_status`; 23514 `Give a reason of 20 to 500 characters.`; 23514
`Only a verified shop can reinstate certifications.`

## Review (D-21)

`request_certification_review(certification, statement)`: the certificate's worker only; status suspended or
revoked (23514 `Only a suspended or revoked certification can be reviewed.`); within 30 days of the latest
suspended / revoked event (23514 `The review period for this decision has ended.`); no open request (23505);
at most 3 per certificate (23514); statement 20..1000 (23514). `withdraw_certification_review(request)`: the
worker; open -> withdrawn. `decide_certification_review(request, 'reinstate' | 'uphold', reason)`: the current
issuing owner (42501 `Certification not found.` otherwise); open only (23514 `This review request is no longer
open.`); either decision needs a still suspended / revoked certificate (23514 `This certification is no longer
suspended or revoked.`, so `upheld` is never recorded against an active certificate); reinstate also needs a
recorded verification, sets it active (event `reinstated` with the request id); uphold changes nothing (event
`review_upheld`). Review polish: a direct `transition_certification` reinstate (suspended -> active) while a
request is open decides that request in the same transaction (status `reinstated`, the reinstate reason as
decision reason, event `reinstated` with the request id; one `certification.review_decided` notification, no
separate `certification.reinstated`). A direct revoke (suspended -> revoked) keeps the open request open; it can
still be decided (uphold records revoked -> revoked). A request on a removed shop stays open (W11 admin queue).

## Renewal (D-5, D-22)

`record_certification_reassessment(certification, items_met, result, comment, failure_reason)`: recorder through
`lock_training_enrollment_for_recorder` (current owner or a designated linked trainer, never the worker; W6
errors); certificate stored status `active` (effective active or expired; 23514 `This certification cannot be
renewed.` otherwise); window expiry - 60 days .. expiry + 90 days (23514 `Re-assessment opens 60 days before
expiry and closes 90 days after it.`); W6 checklist rules (22023 / 23514).

`renew_certification(certification, reassessment, attestation)`: the issue role / owner / verification /
attestation checks; old row active and window open; latest re-assessment = the given id (55000); passed,
assessed within the last 30 Manila days and unused (23514 `Record a passed re-assessment first.`); original
training still completed (23514 `The training record no longer shows completion.`). Inserts a NEW row (same
worker / enrollment / program / assessment, new snapshots, current shop validity, starts now) and marks the old
row superseded (events `superseded` then `renewed`). After the window a new training enrollment is needed.

## Effective status, loss of verification, corrected evidence

- Effective status is computed on read with the DB clock (`my_certifications`, `owner_certifications`, the D-20
  check, `applicant_verified_certifications`). The UI shows "Expires soon" for <= 30 days.
- D-23 / R-4: losing shop verification or deleting the shop / owner never changes an issued certificate; the
  issue-time snapshot stays and workers are not notified. The worker sees live `issuing_shop_present` /
  `issuing_shop_currently_verified`. An owner who lost verification can still suspend or revoke, not issue,
  renew or reinstate.
- D-24: `training_evidence_flag_certifications` (AFTER INSERT on attendance and assessments) audits
  `certification.training_record_changed` and notifies the owner when evidence leaves a certified enrollment not
  completed; reads expose `training_record_changed_after_issue`. Never an automatic suspension.

## D-18 retention

Shop or owner deletion (also untrusted, like GoTrue) succeeds and RETAINS certificates: `shop_id`, `owner_id`,
`approved_by`, `status_changed_by` become null through `is_orphaned_fk_set_null`; every snapshot stays; the
program row is kept by W6 (it has enrollments) and `certifications.program_id` is RESTRICT. The policy row goes
with the shop. Deleting the worker's own account removes their certificates, history, reviews and
re-assessments (audit `certification.deleted`, deleted_by `worker_profile_deleted`; audit rows stay).
Review polish: deleting only the `worker_profiles` row (W2 `wp_delete_self`, or a trusted session) while the worker
has any certification is refused (w7c trigger `worker_profiles_guard_certified_delete`, 23503 `A worker profile with
certifications cannot be deleted. Delete the account instead.`), so a delete-and-recreate cannot erase suspended /
revoked certificates and their history. The account deletion cascade is unaffected (the profiles row is already
gone when it reaches `worker_profiles`).

## Visibility

| Who | Rows / reads |
|---|---|
| certificate worker (role worker) | no raw W7 table rows (review polish: no actor / approver / assessor / reviewer ids); `my_certifications()` (status, effective status, reason, expiry, shop and verification snapshots, live shop flags, renewal window, record-changed flag, open review, requests used, review window end); `certification_history(id)` |
| current owner of the issuing shop | the shop's rows (copied `owner_id` AND `shops.owner_id`); `owner_certifications(shop)` (worker display name, effective status, flags, latest re-assessment, open review first); `certifiable_enrollments(program)`; the policy row |
| other owners | only `applicant_verified_certifications(application)`: CURRENT certificates of an applicant inside the W5 window (D-13), no reasons, statements or history; plus `issuing_shop_currently_verified boolean` (false when the issuing shop was removed, is inactive or has no recorded verification; no reviewer data; W7-L16) |
| trainers | nothing directly; they record re-assessments through the RPC |
| customers, super_admin | nothing (W11 adds admin review) |
| anon | no privilege |

No read returns contact data; display names are a trimmed `full_name`, else `Worker` / `Trainee`.

## D-20 apply gate

`job_application_apply_checks` (same signature, every W5 check in the same order) adds one check right after the
deadline: a `certification_required` opening needs `worker_holds_current_certification(worker)` (any shop, any
program, effective active), else 23514 `This opening needs a current shop-issued certification recorded on
WashLink.` It applies to create and draft -> submit; trainees_welcome openings are unaffected; applications sent
earlier are never touched (no auto-close, no transition block). No lock on certificate rows (R3).

## Expiry notices (D-25)

`enqueue_certification_expiry_notices(p_as_of default now())` (internal; trusted SQL or the W12 scheduler only)
enqueues `certification.expiring` for active certificates expiring within 30 days of `p_as_of` and
`certification.expired` for expired ones, keys `certification_expiry:<id>:due` / `:expired`, and returns the
number of new notices (idempotent). It refuses a past `p_as_of` (22023). Nothing schedules it until W12.

## Limitations

- Local proof only (D-10 rows 33-35); production drift is caught only by the w7a preflight; two W5 function
  bodies are replaced (row 35).
- Not tamper-proof (R5): trusted SQL can set the flag and change status, or disable triggers (W6-L5). Flags rely
  on PostgREST not exposing `set_config` (smoke `rpc_set_config_not_exposed`).
- Effective status uses the DB clock; expiry notices are unscheduled until W12 (R2, W7-L10).
- The D-20 check reads certificate state without a lock: a suspension committed concurrently with an apply may
  not be seen (R3).
- An audit failure aborts the action, cascades included (R4). A worker account deletion removes the worker's
  certificates (R6, W7-L8).
- Time-shift fixtures (`test_helpers.backdate_certification`, past sessions, backdated acceptance) exist only in
  test helpers and the smoke (R7). A corrected training record leaves the certificate valid until the owner
  acts (R8, D-24).
- No public / third-party verification, QR codes or PDFs (W7-L11); no super_admin suspension or review queue
  (W11); no email / SMS / push / Realtime (W12); no certification or renewal fee exists.

## W11 carry-forwards (review polish)

- Independent review decider: a super_admin (or designated panel) independent of the issuing shop can decide or
  escalate any review request; the worker can escalate an `upheld` decision; an owner decision deadline after
  which the request escalates; the reviewer sees the owner's reason and the worker's statement and records a
  reason (W7-L12, D-21).
- Stranded suspensions: when the issuing shop loses verification, is deleted, or its owner account is deleted
  (`owner_id` null), a suspended certificate can never be reinstated and an open review has no decider. W11 must
  give such certificates and open reviews a decider (and decide whether suspensions need a time limit) (W7-L13,
  D-23).

## Rollback

Per-file `-- ROLLBACK` blocks in reverse order h..a, local stack only. h: producers, the training evidence
trigger, the expiry function (audit rows and notifications stay). g: drop the reads; restore the W5 bodies of
`applicant_verified_certifications` (drop first: the return type differs; zero rows, W5d comment) and `job_application_apply_checks` (verbatim copies in the block;
re-opens D-12). f, e: RPCs. d: helpers. c: reviews and re-assessments (drop the certifications FK / CHECK
first). b: certifications, events, policies (IRREVERSIBLE loss of issued records; export with a trusted `copy`
first). a: nothing. Stager: remove `test_helpers_certifications.sql` from `HELPERS_SOURCE_NAMES`. Frontend:
revert.
