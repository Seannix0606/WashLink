# Workforce module: limitations (W13, W15, W16; D-74)

This file lists the limitations the W13 plan accepted (PLAN section 2), the gaps the W13 review added, the W15 and W16
outcomes, what the loop knows was not tested, and the open legal topics. It is not a proof that nothing else is missing. Earlier REVIEW files
hold the full record. A limitation here is a known gap, not a defect hidden from review. None of these entries is a legal claim. The loop does not
decide whether any of them is acceptable for production: humans review and sign this list (W13-L6,
`DEPLOYMENT_READINESS.md`).

Sources are REVIEW findings (`loop/workforce/increments/W<n>/REVIEW.md`, for example "W9 S2"), decisions
(`loop/workforce/DECISIONS.md`, "D-n") and legal items (`LEGAL_REVIEW_REGISTER.md`, "W<n>-L<m>").

## Verification scope

- **Local proof only (D-10).** Every database result was produced on the local Docker stack against a reconstructed
  baseline (D-1). Production RLS, triggers, the signup function, grants and Realtime settings are unknown to the repo.
  Until a human does the D-10 schema dump and diff (`DEPLOYMENT_READINESS.md`), no result says anything about
  production. Several migrations only NOTICE-log production drift (W2a policies, the w12b categories, the w13a unknown
  audit policies), so a human must read those NOTICEs at apply time.
- Vitest runs with mocked repositories. The real PostgREST / GoTrue surface is covered only by the local API smokes
  (15 since W16, D-88: `run-api-smokes: PASS (15 smokes)`, W16 LOG).
- Migration file names parse as version `2026` in the Supabase CLI (D-11). Local tests stage 14-digit copies. A human
  decides on renaming before any `db push`.

## Not tested

- **Concurrency.** Parallel contract-problem opens and raises (W11). The W10 C8 bulk-refresh concurrency and the
  pair-lock ordering (W10 PLAN R4). Row-lock contention between the scheduler and user actions (W12). The W7 lock paths
  that the W7 review noted as untested. A dblink session cannot see a test transaction's rows, so
  only advisory-lock contention was tested. The cross-increment, two-session lock order is untested too (F-S6).
- **Real cron firing.** No pg_cron job ever fired. Registration was checked only inside a rolled-back local
  transaction, and the runner was called directly as a trusted session. pg_cron's production identity (W12 R6) was
  never observed.
- **Time windows across real days.** The W11 N2 30-day window, the 14-day escalation window and the 90-day reporting
  window were tested with backdated rows, not over real time.
- **ROLLBACK blocks.** No `-- ROLLBACK` block has been executed, except the w15a, w16a and w16b blocks, on the local stack only,
  inside rolled-back transactions (`ROLLBACK_GUIDE.md`, W16 `VERDICT.md`).
- **GoTrue silent-restore branch** of the profile guard (W2 R4): covered by review only.
- **The w13a NOTICE about unknown audit select policies.** The local stack has no such policy, so the NOTICE never
  fired.
- **The W12 smoke** does not run a certification expiry notice through the runner. pgTAP covers it, and the W13 smoke
  covers the contract expiry run twice.
- **Production data volumes.** The W12 first-run backlog (W12 R5) was never measured.

## Product limitations

- In-app notices only. No email, SMS or push (D-61), no Realtime, and polling up to 60 s late (D-62).
- No e-signature provider. An acceptance is a recorded acceptance, not an electronic signature (D-6, W0-L4).
- **Free-training gaps.** The database forces the worker fee to 0 and blocks the training owner's customer bookings
  for a trainee in required training, through a roster row that is or was linked to the trainee. Since W15 (D-79) the gate is keyed on the roster row's link history: unlinking
  the trainee's row, by the owner or the worker, no longer lets the training shop assign or start bookings through
  that row (F-C2 closed for rows that are or were linked). Since W16 (D-83) the gate holds while the enrollment is
  accepted and progress is not `completed`, so a recorded fail or a deleted training shop no longer lifts it (SEC-5,
  "Final review outcomes" below). The gate can still be lifted by a recorded pass or a cancellation (W16-L1). Gaps that remain:
  - a roster row never linked to the trainee (name-only, or deleted and re-created, P6) is not detected; links ended
    before the W3 audit trail are not in the history (W15-L1);
  - other owners' bookings are outside the gate: the trainee can be assigned work by any other shop (W15-L1);
  - trusted SQL sessions bypass the gate (W15-L1);
  - a super_admin can still assign that trainee to another owner's booking (W13-L11);
  - a booking already in progress on a row can be completed by a trainee who links to that row later (W15-L1);
  - re-used rows (D-80) stay gated for a later worker, who gets a w6h message that reads as if that worker were in
    training; the new worker must unlink the old row first (`workers_owner_user_unique`), then the owner adds a new
    row. A leaked link code accepted by a trainee taints that row (W15-L1, `TRAINING.md`);
  - after completion, withdrawal or cancellation, paid work can be assigned without any contract (W6-L10);
  - owner-typed training terms can describe a fee, bond or deduction, and nothing flags it (W6-L11).

  See the table below.
- The three-distinct-owner count is informational only (D-3). It never blocks declining, leaving or terminating
  (J16).
- English only (W9-L10). There is no PDF and no translation.
- **No deep links (D-68).** Notices and dashboard items open an area, not a specific tab or record.
- **Capped queues.** The W11 certification-review and contract-problem queues and the W14f unreviewed-shop queue each
  return at most 200 rows, oldest first. Volume is bounded by per-event caps and a finite legacy set. Only the
  posting-report queue is paged (D-71: 50 per page, 1..100, "Load more"). The old 200-row
  `admin_job_opening_moderation_queue` stays for compatibility, and the frontend no longer calls it.
- Oldest-first paging can delay attention to new reports. There is no response-time standard (W13-L7).
- Scheduled jobs are not registered (D-63). Until a human registers them, contract expiry is derived on read and no
  certificate expiry notice is sent (W12-L4).
- **Retention periods are undefined.** No period exists for audit events, notifications, contracts, acceptance
  records or training evidence (W3-L1, W12-L6, W13-L5; D-18, D-32). The trusted purge procedure exists
  (`AUDIT_AND_NOTIFICATIONS.md`) but has no cut-off.
- The W14 admin reads are VOLATILE and write an audit row per call; React StrictMode doubles them in development
  (W14 F10).

## Security limitations

- A database superuser or table owner can disable triggers, drop tables or rewrite audit rows. The audit trail is an
  internal operational log, not tamper-proof or evidence-grade (W3-L3).
- **W9 S3:** a superuser (trusted SQL) can fake JWT claims. The trail then records the impersonated user
  (`actor_kind = 'user'`). Superusers are out of scope.
- Reads by database operators through trusted SQL are not logged. Only super_admin reads through the RPCs are
  logged (D-70, W13-L4).
- Rejected actions are not audited, because the raise rolls back the audit row (W3 review).
- Write flags rely on PostgREST not exposing `set_config` (smoke-checked in every increment).
- Clients still write `job_openings`, `worker_profiles` and `worker_private_contacts` directly, under RLS and guard
  triggers. These grants are justified in the J17 roll-up (D-78).

## Accepted limitations (W13 PLAN section 2)

| Source | Limitation | Why accepted / flag |
|---|---|---|
| W9-S1 (rest) | A trusted terminate cannot clear `pending_version_id`, so it leaves an open amendment. | Runbook in `ROLLBACK_GUIDE.md` "Trusted repairs"; pinned by `j15_w13_trusted_contract_end_runbook`; W9-L17, W10-L7 |
| W9 S2 | An owner can type text that imitates contract header lines. | The sealed hash still binds the real text; no server refusal |
| W9 S3 | A superuser can fake JWT claims. | Superuser out of scope (see above) |
| W9 S4 | Accept does not re-check `shops.owner_id`. | Moot: `shops.owner_id` has been frozen since W2 |
| W9 C4 | An amendment can change the relationship type (for example employee to independent contractor), pay, schedule and dates, and can start on a past date. No warning or separate flag for reclassification or a retroactive start was built; the worker's acceptance (plus the contractor acknowledgement) is the only safeguard. | Product / legal decision, not built; W9-L13 stays OPEN |
| W9 C5 | The keyword list has no category for statutory-benefit exclusions. | The list needs legal review; W9-L16 stays OPEN |
| W10 S4 | Toggling `is_active` writes an audit event every time, with no rate limit. | Intended semantics |
| W10 C8 | Concurrency of the bulk relationship refresh is untested (see "Not tested"). | W12 added try-locks and per-item subtransactions |
| W11 (parallel opens), W12 (row-lock contention), real cron firing | Untested. | See "Not tested" |
| W11 / W14f queues | Capped at 200 rows. | Volume bounded; see "Product limitations" |
| W2 R-6, W2-L3 | Only name or address edits trigger shop re-review. Phone, map pin and document changes do not. | W2-L3 stays OPEN |
| W2 (account enumeration) | Account enumeration noted in the W2 review. | Accepted (W13 PLAN section 2); link-code lookups are rate-limited (`ROLE_AND_PROFILE_SECURITY.md` R8) |
| W3 (rejected actions) | Rejected actions are not audited. | Needs an autonomous transaction; not built |
| W6 (orphan programs) | A program kept at shop removal (it had enrollments) stays after its last enrollment is removed. It holds no worker data and nobody can read it (`TRAINING.md`). | A trusted cleanup can delete it; D-18 evidence retention takes priority |
| W6 (admin assignment), W13-L11 | A gap in the free-training protection: a super_admin can assign a worker who is in required (free) training with one owner to another owner's customer booking. The w6h booking gate does not refuse it (W6 REVIEW). | Not fixed in W13; open legal item W13-L11 |
| W6-L13 | The worker cannot confirm or dispute attendance or an assessment and cannot ask for a correction. The owner or a trainer can later correct a day to absent, which removes a completion, without the worker's input (the worker is only notified). Since the W6 review polish a fail needs a 10..300 character reason and the worker can read which checklist items were met. | W6-L13 stays OPEN |
| W6-L10 | A gap in the free-training protection: after completion, withdrawal or cancellation the booking gate lifts (since W16, D-83; a fail or a shop removal alone no longer lifts it), and a worker without any contract can then be assigned paid customer bookings. Nothing requires a contract first. | W6-L10 stays OPEN |
| W6-L11 | A gap in the free-training protection: owner text in `terms`, `training_pay_details` and `reimbursement_details` can state a fee, deposit, charge, bond, repay-if-you-leave clause or future deduction. Nothing detects or flags it, and the worker then sees it as "Agreed training terms". | W6-L11 stays OPEN |
| W9-L17, W10-L7 | A trusted-SQL repair can end an accepted or active contract without a reason and without notifying either party; the relationship then stops counting. Repairs are forward-only (D-40) and audited as `trusted_session`. | W9-L17, W10-L7 stay OPEN; runbook in `ROLLBACK_GUIDE.md` |
| W7 (lock paths) | Some W7 lock paths are untested. | See "Not tested" |
| W4 (low) | `job_opening_missing_publish_fields` stays executable; `changed_fields` appear in the trusted audit. | An invoker helper used by the w4c trigger; revoking it would break owner publish |
| W3-L1, W12-L6 | Retention periods are undefined. | Legal decision (W13-L5); the trusted purge procedure is unchanged |
| D-68 | No deep links into tabs. | Product decision |
| W9-L13, W9-L16 | Reclassification by amendment; statutory-benefit keywords. | Stay OPEN for legal review |

## Open findings routed to W13 and their outcome

- W14 N1 (raw super_admin audit select): closed by D-70 (w13b).
- W14 N3 (queue paging): closed by D-71 (w13c).
- W12 C2 / W12-L9 (expiry notice says "has expired"): the notice text changed (D-72, w13d). The build changed the
  worker body. Fix cycle 1 added "What this means for you and the worker depends on the contract terms and the law."
  to the owner body (W13 C2) and named "Past end date" as the UI status label (C3, C4). The UI labels changed to "Past
  end date", "End date passed (recorded on WashLink)" and "The contract's end date has passed (recorded on WashLink)."
  The copy is changed, not reviewed: W13-L1, W13-L8 and W13-L9 are OPEN. Notices already sent keep the old text.
- W9 C2 / C3 (termination copy): the copy changed (D-73). The build changed the worker terminate text and added the owner
  caution. Fix cycle 1 (C1) changed the worker intro from "You can always decline an offer or end an accepted contract."
  to "You can decline an offer, or record the end of an accepted contract, on WashLink at any time." The texts are
  unreviewed (W13-L2, W13-L3). Termination still takes effect at once, and notice, cause, final pay and clearance are
  not modelled (W9-L6, W9-L14).
- W12 repeated test name: fixed (D-76, `ACCEPTANCE_TESTS.md` "Renamed tests").
- W10 S4: accepted (table above). W11 N6: built in W14 as the oversight flag (W14-L12).
- Earlier non-blocking review items (W0 S1-S8 and C1-C9, W2 R-1..R-6, W5, W9 S1-S5 and C1-C6) are routed in their
  REVIEW files. This file lists the items the W13 plan routed (PLAN section 2) and those the W13 review added. The
  loop did not re-check every earlier REVIEW item against this list. Read the REVIEW files for the full record.

## Final review outcomes (W16, K10)

Outcome of the `FINAL_REVIEW.md` findings and of W15 SEC-5. "Closed" means a local test covers the stated path. It is
not a statement that the free-training rule is met, and every W16-L item stays OPEN. Code changes:

- **SEC-5 (gate lifted while the enrollment stayed accepted): closed by D-83.** The owner deleting the training shop, or
  recording a failed assessment, no longer lifts the gate. A booking pre-assigned at the deleted shop cannot be started
  either. D-84 sets no time limit. The facts behind that: the hold restrains only that one owner's roster rows; a trainee
  can leave alone at any time with no reason (`withdraw_from_training`; W16 made the "Leave training" button reachable on
  `failed`); the owner can cancel a failed enrollment with a recorded reason and a notice to the worker; there is no new
  refusal on leave, decline, terminate, unlink, apply, other owners' work or account deletion; starting a gated booking is
  refused in more states (J16). A later worker on a re-used row has nothing to leave (below). After a shop removal only the worker can end it. Owner cancel gets
  42501 (run-tested, also after a fail plus a shop removal, where owner and designated-trainer corrections also get 42501).
- **F-C1 (safeguard text): pinned, D-87.** In a new platform version, every locked clause is pinned: a non-trusted session,
  so also a super_admin, cannot add, remove or change one (section, heading, body or owner-input flag). Changing that text needs a human-run migration (recipe in
  `CONTRACT_TEMPLATES.md`); no such migration has been run. Limits, W16-L3: nothing requires a second reviewer on that
  migration; added or changed editable clauses are still allowed and can contradict a safeguard (W8-L12); clause order is not
  compared, so locked clauses can be reordered within a section; versions published before the pin are not re-checked. The refusals of an added or removed locked clause ran in pgTAP with the constraint forced immediate. Through PostgREST at a real commit, only the changed-core-body refusal is exercised (same trigger).
- **F-C2 remainder: not closed.** The gate cannot detect a roster row never linked to the trainee, that is, a name-only
  row or one deleted and re-created (W15-L1, pinned by `w15_limitation_never_linked_name_only_row_not_detected`).
- **F-C3:** the absolute worker statement was replaced by copy stating what the gate refuses (D-81, D-85; W15-L1, W15-L2,
  W16-L2).
- **F-S2 (shop deletion with live workforce records): documented, no guard, D-86.** An owner can still delete a shop
  with live openings and applications. Its openings and not-accepted applications are permanently deleted, including
  applicants' cover notes, and applicants are told only that an application ended. Accepted applications keep a copy
  without the note (W5-L10). A guard would only delay this, because the cascade still runs once openings are closed.
  Keeping the shop and only deactivating it (soft-deactivation) was not chosen because it would change the existing owner flows and
  every read path, and it is a product decision left to a human. W16 adds an informed confirm in the owner UI (`shopRemovalConfirmationText`), which is not a guard: it does not bind a
  direct API call. Whether workers must keep more is W16-L4.

**W16-L1, what a dishonest owner can still do.** The gate does not stop a dishonest owner:

- Record 3 attended days and a pass. That lifts the gate, nothing checks that the days happened, and the worker cannot
  dispute the record (W6-L13). A failed assessment can be corrected to a pass in the same way.
- Cancel with a reason of 10..300 characters, including at 0 attended days, then assign the worker
  (`w16_limitation_owner_cancel_at_zero_days_then_assign_succeeds`). The cancel is audited and the worker is notified.
- Press the worker to leave. This is the only way to lift a `shop_removed` hold, or a hold after a fail followed by a shop removal. WashLink cannot detect pressure (W16-L2).
- Use a never-linked roster row, or arrange work outside WashLink (W15-L1).
- Delete the owner account. That also removes the gate. The deletion is audited, and the enrollment still reads `accepted`.

What W16 adds is narrow: a recorded fail or a shop deletion no longer lifts the gate with the record still reading
`accepted`. The recorded pass or correction leaves an append-only record, and the cancel, a leave and the account deletion
leave audited rows. Pressure on the worker, never-linked rows and work outside WashLink leave no record. Other effects of
the hold (W16-L1 unless stated):

- A contract can become active while the same owner's assignment is refused, because `activate_worker_contract` reads
  `training_enrollment_is_live`, which excludes `failed` and `shop_removed`. No contract releases the gate; the worker's
  leave action does. The owner's contract screen says a worker still in required training "cannot start yet"; that refers
  to the contract start, not to this gate.
- A worker who wants paid work from the same owner after a fail stays gated until the enrollment ends.
- **A later worker on a re-used row (D-79, D-80).** The hold on that row can be permanent, for example when the trainee
  never leaves after a shop removal. That worker has nothing of their own to leave, and the refusal message is false for
  them. The workaround is a new roster row: they unlink the old row, and the owner adds a new one. Changing D-79 is a human decision.
- **An `accepted` booking pre-assigned to a held trainee at a deleted shop** has no way forward except the trainee leaving:
  starting it is refused, the customer's cancel is refused, and no shop remains to act
  (`j18_w16_accepted_booking_at_deleted_shop_moves_only_after_trainee_leaves`).
- **No notification is sent when the training shop is deleted** (audit only), so the worker learns of it only by opening the
  training. The not-passed notice mentions neither the hold nor leaving (W16-L7).
- The w6h gate messages are unchanged but now appear in more states, and can read oddly after a shop is deleted: the owner
  sees "This worker is in required training with your shop ...", and the worker on a booking at a deleted shop sees "You are
  in required training with this shop ...".

Not code (no W16 change):

- **F-C5:** the pre-existing landing copy "Verified car wash professionals" (`AuthLandingPage.tsx:143`) stands although no
  worker identity verification exists (W16-L6).
- **F-C6:** a worker must give a 10..500 character reason to end a contract, and the shop sees it (W16-L5).
- **F-C7: no interview feature.** SPEC I names "interview scheduling" notices. WashLink has no interview scheduling and
  sends no interview notice (D-69).
- **F-S1:** the authenticated-executable function list is pinned in `j17_w16_authenticated_executable_function_list` (D-89),
  so a new one fails J17 until the list is updated. It has 155 rows: 152 non-trigger functions, the F-S1 figure, plus 3
  pre-workforce trigger functions. That F-S1 left those 3 out is inferred from the match.
- **F-S3:** `anon` keeps its default SELECT / INSERT / UPDATE / DELETE on the six pre-workforce tables. RLS gives zero
  rows locally. The revoke waits for the D-10 diff (`DEPLOYMENT_READINESS.md`).
- **F-S5:** `is_trusted_db_session()` trusts any no-JWT session except three API logins. An allow-list is a D-10
  decision (`DEPLOYMENT_READINESS.md`).
- **F-S6:** see "Not tested".

## Open legal topics

All 174 register items are OPEN (`LEGAL_REVIEW_REGISTER.md`; overlap map there). Main topics: the meaning of the
three-owner count (W0-L1, W10-L1), free training versus productive work (W0-L2, W6-L1, W15-L1, W15-L2, W16-L1, W16-L2, W16-L7), template safeguards (W8-L1, W16-L3), classification (W0-L3,
W9-L2, W9-L13), acceptance without an e-signature (W0-L4, W9-L1), certificate naming and fairness (W7-L1, W7-L3,
W11-L11), owner free text and waivers (W4-L8, W9-L16), termination and notice (W9-L6, W13-L2, W13-L3, W16-L5), expiry wording
(W12-L9, W13-L1), retention (W3-L1, W12-L6, W13-L5, W15-L3, W16-L4), landing copy (W16-L6), personal data (RA 10173), audit access (W13-L4), and human
sign-off of this file (W13-L6).
