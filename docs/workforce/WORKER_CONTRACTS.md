# Worker contracts, acceptance records, snapshots and amendments (W9; forward-only trusted repairs W10; reported problems W11)

Local Docker proof only (D-10): nothing here was applied to the linked project. Every legal question is in
`LEGAL_REVIEW_REGISTER.md` (W9-L1..L12, all OPEN). Nothing in WashLink states that a contract is valid, binding,
signed or compliant; the acceptance record is labelled "Acceptance record — not an e-signature" everywhere.

Migrations (staged `20261026000017..26`): `2026_10_26_w9a_worker_contracts_preflight.sql` (creates nothing),
`w9b_worker_contract_reference_data.sql`, `w9c_worker_contracts.sql`, `w9d_contract_version_records.sql`,
`w9e_worker_contract_rules.sql`, `w9f_worker_contract_owner_rpcs.sql`, `w9g_worker_contract_party_rpcs.sql`,
`w9h_worker_contract_reads.sql`, `w9i_worker_contract_retention.sql`, `w9j_worker_contract_audit_and_notifications.sql`.

## Decisions (ADOPTED-DEFAULT, DECISIONS.md)

- D-31: drafts only for workers with an accepted application (submitted, under the shop's current owner) or a
  completed training enrollment at that shop; one open contract (draft, sent_for_review, accepted, active) per shop
  and worker; the owner records the start after acceptance; both parties get acceptance records (the owner's at send).
- D-32: worker account deletion keeps contracts the worker accepted (owner's record, name snapshot) and removes the
  rest. Privacy / retention basis needs legal review (RA 10173, W9-L5).
- D-33: problem-term flags are keyword based, never block sending, are shown to both parties; the owner acknowledges
  the current count when sending. Not legal advice.
- D-34: every change after the first acceptance is a material amendment needing the worker's acceptance; one open
  amendment at a time; declining or a withdrawal keeps the current terms.
- D-35: owner / shop removal never terminates or alters a sent contract; never-sent drafts are removed; an open offer
  becomes declinable only.
- Also applied: D-6 (no e-signature; draft-and-acceptance record, labelled), D-26 (explicit classification, no
  default, contractor last + extra acknowledgement), D-29 (sending needs a recorded shop verification).

## Principles (P45-P54)

- P45 every write to a W9 table goes through a definer RPC under the transaction-local flag
  `washlink.worker_contract_write` = contract id. No client role (anon, authenticated, service_role) has INSERT /
  UPDATE / DELETE; write policies deny all. A trusted SQL session may repair the status columns of
  `worker_contracts` only (audited `trusted_session`, no notification); never versions, clauses, flags or acceptances.
  W10 (`2026_10_28_w10b`, D-40) makes that repair forward-only: only an `accepted` / `active` row, only to the same
  status, `terminated` or `expired`, and never `ended_at` back to null; anything else 42501 `Contracts are changed
  only through WashLink.` (no revival of an ended contract, no reopened offer, no activation that skips the W9
  checks). The rest of the w9c guard is unchanged (verbatim body). See `OWNER_RELATIONSHIPS.md`.
- P46 sealed versions are write-once for every session. A version is `draft` (inputs editable by the owner RPC only)
  until sent; sending seals it in one transaction under `washlink.worker_contract_seal` = version id (render values,
  rendered text, sha256 hash, flag count, clauses, flags, owner acceptance), validated at once and again by the
  DEFERRABLE INITIALLY DEFERRED constraint trigger `contract_versions_validate_at_commit`. Afterwards only `state` and
  the response stamps change through the state machine (42501 `Sent contract versions cannot be edited.`). Clauses
  and flags insert only while their version is being sealed (`created_txid = sealed_txid = txid_current()`).
- P47 no fabricated acceptance: a `contract_acceptances` row is inserted only inside `send_worker_contract_version`
  (party owner) or `accept_worker_contract_version` (party worker), under the flag AND with `party_id = auth.uid()`
  whose role and contract party match `party_role` (trigger, every session; a trusted session without a JWT cannot
  insert one at all; a superuser with another user's claims cannot record a different party). Version number,
  `version_content_hash` (must equal the sealed hash), statement text, contractor acknowledgement text, party name
  snapshot, `accepted_at = now()` and `record_label` are set by the server. No signature image, typed-name signature,
  IP address or device data is collected. Immutable; deleted only with its contract or version.
- P48 snapshots are self-contained (text format below); template / platform ids are lineage only (template FK
  `on delete set null`, base platform FK `restrict`); their hashes are copied.
- P49 classification is explicit: `contract_versions.classification_key` NOT NULL, FK, no default; the create / save
  parameter `p_classification_key` has no default; `independent_contractor` needs `w9_contractor_owner_v1` at send and
  `w9_contractor_worker_v1` at accept. The label is snapshotted and fills `{{worker_classification}}` (locked only).
- P50 rendering is single-pass through `render_contract_template_clause` (W8). Server values: `owner_full_name`,
  `worker_full_name`, `shop_name`, `shop_address` (from profiles / shops at seal, fallback `Name not provided on
  WashLink`, braces neutralised), `worker_classification`, `start_date` / `end_date` (ISO; no end date -> `No end
  date stated by the shop`). Owner-typed values, kept verbatim: `role_title` 3..120, `schedule_summary` 3..500,
  `pay_details` 3..1000 (WashLink never fills in pay; `{{` / `}}` refused with 22023). Send refuses any placeholder
  without a value and any editable clause still holding the platform instruction (unchanged `requires_owner_input`
  body, or text containing `[Shop:`).
- P51 problem-term flags inform, never block and never validate (below).
- P52 consent before change (D-34); the worker can always decline an offer or amendment and always terminate an
  accepted / active contract (reason 10..500; no verification, notice-period, three-owner or other gate).
- P53 retention (below). P54 audit payloads hold ids, status / kind words and small counts only; notifications hold
  only the shop label and fixed wording; no W9 table is in `supabase_realtime`.

## Tables

| Table | Purpose | Readers |
|---|---|---|
| `contract_acknowledgement_texts` | statements `w9_owner_send_v1`, `w9_worker_accept_v1`, `w9_contractor_owner_v1`, `w9_contractor_worker_v1` (draft wording, W9-L12) | any signed-in user |
| `contract_problem_term_rules` | keyword rules (POSIX ARE, `~*`), 15 W8-L13 categories, Filipino words included; pattern validity is a CHECK | any signed-in user |
| `worker_contracts` | one per shop + worker relationship; status, party / shop name snapshots, dates of the version in force, revision, stamps, `*_removed_at` | owner (role owner, `owner_id`); worker once `sent_at` is set |
| `contract_versions` | inputs while draft (classification, dates, owner values, editable bodies, shop terms); sealed `render_values`, `rendered_text`, `content_hash`, `flag_count`, `sealed_at`, `sealed_txid` | owner all; worker sealed only (`state <> 'draft'`) |
| `contract_version_clauses` | rendered clauses with section title / notice snapshots, the base standard clause rendered with the same values, `change` (unchanged / edited / added_by_shop), `edited_in` (template / contract), `clause_hash` | follow the version |
| `contract_version_flags` | keyword matches at seal (clause position or owner value key, rule, category, excerpt <= 160) | follow the version |
| `contract_acceptances` | acceptance records (P47), unique per version and party | follow the version |
| `retained_job_application_records` | accepted applications copied before a shop / owner cascade deleted them (W5-L10) | the worker only |

Column notes: the plan's `contract_acknowledgement_texts.text` is `statement_text`; acceptances also snapshot
`contractor_ack_text`; versions also store `render_values` (the values used at seal, so the validator can re-render
the base clauses). Every set-null FK is DEFERRABLE INITIALLY DEFERRED (one deletion can null several FKs of a row in
separate cascade steps). The W9 `contract_*` tables carry comments starting `W8/W9 contract module (created by W9)`:
the committed w8a preflight (re-run by `j19_w8_review_polish`) refuses `contract_*` relations whose comment does not
start with `W8`; w9a accepts that prefix or `W9`.

## State machines (anything else -> 42501 `This contract change is not allowed.`; stale -> 55000)

| Object | From | To | Who | Condition |
|---|---|---|---|---|
| contract + v1 | (none) | draft | current shop owner | D-31 eligibility; explicit classification; one open contract per shop + worker |
| draft version | draft | draft (saved) | owner | expected `draft_revision` |
| contract | draft | (deleted) | owner | never sent |
| contract / v1 | draft | sent_for_review | owner | verified shop; filled; statements; flag count; start not in the past; seal + owner acceptance |
| contract / v1 | sent_for_review | withdrawn | owner | current owner |
| contract / v1 | sent_for_review | accepted | worker | hash match; owner and shop present; recorded verification; statements |
| contract / v1 | sent_for_review | declined | worker | always (optional note <= 500) |
| contract | accepted | active | owner | start_date <= Manila today; verified shop; no live required training with this owner (C7) |
| contract | accepted, active | terminated | worker (always) or current owner | reason 10..500; open amendments withdrawn / deleted |
| contract | accepted, active | expired | system | end_date before the date (`expire_worker_contracts`; reads derive it first) |
| amendment vN | (none) | draft | owner | contract accepted / active, not effectively expired, worker present; one open version |
| amendment | draft | sent_for_review / (deleted) | owner | as the initial send (start may be past) / discard |
| amendment | sent_for_review | accepted | worker | as the initial accept; previous current -> superseded (kept) |
| amendment | sent_for_review | declined / withdrawn | worker / owner | contract stays on its current version |
| pending version | sent_for_review | withdrawn | system | contract terminated / expired; party removed (P53) |

`effective_status` (reads, `worker_contract_effective_status`) shows accepted / active contracts whose end date is
before Manila today as `expired` until it is recorded. Since W12 the `worker_contract_expiry` job records it through
`expire_worker_contracts_batch` (no date, 25 per run, skip-locked, `ended_by 'system'`; the same update as the internal
`expire_worker_contracts(date)`, which stays a test-clock tool); it runs only after a human registers the jobs
(`NOTIFICATIONS_AND_SCHEDULING.md`). The recorded `expired` is a WashLink record, not the legal end of work (W12-L2).

## Text format and hash (P48)

`rendered_text` is plain text, lines joined with LF: the agreement title (template name snapshot), `Contract
reference: <contract id>`, `Version <n> (initial|amendment)`, `Based on WashLink standard template version <m>`,
`Relationship type: <label>`, `Draft — requires review by a qualified Philippine labor-law professional`,
`Acceptance record — not an e-signature`; then for every section a blank line, `N. Title`, its review notice, and
for each clause a blank line, the heading and the rendered body. `content_hash` = sha256 hex of
`convert_to(rendered_text, 'UTF8')` (built-in `sha256`). The validator (`validate_worker_contract_version`) checks:
sections 1..15 present; every base clause in place with its key, kind, position, and the standard heading / body
rendered with `render_values`; locked clauses equal to the standard; clause hashes; the text rebuilt from the clause
rows and header fields; the hash; no braces left; stored flags equal the live result; the owner acceptance with the
hash. Download / Print use `rendered_text` verbatim (an uncertified copy, W9-L10).

## Problem-term flags (P51, D-33)

Rules run only on owner-written text: editable clause headings and bodies, shop terms, and the three owner values;
never on locked WashLink clauses. One flag per location and matching rule, excerpt of up to 160 characters around
the first match (input capped at 4000 characters). Categories (W8-L13): training_fee, training_cost_clawback,
deposit, cash_bond, work_item_deduction (uniform / equipment / damage / shortage), fine_or_penalty, waiver,
quitclaim_or_release, exclusivity_or_non_compete, liquidated_damages_or_forfeit,
unpaid_trial_or_customer_work_in_training, contractor_label, forum_or_arbitration, certificate_government_claim,
contract_validity_claim (the plan text says 16; the list has 15 names). Guidance always says "may need legal
review". Shown to both parties with `Automatic keyword check. It may miss problems or flag acceptable text. It is not
legal advice and WashLink does not check whether terms are lawful.`; zero flags: `No keyword matches. This does not
mean the terms are lawful.` (`worker_contract_flag_notices()`). The owner passes the current live count
(`preview_worker_contract_draft.flag_count`) as `p_acknowledged_flag_count`; a different count -> 55000.

## Retention (P53; W5-L10, D-18 / D-23 applied, D-32, D-35)

`worker_contracts.owner_id`, `shop_id`, `worker_id`, `job_application_id`, `training_enrollment_id` are `on delete set
null` with name / address snapshots; `worker_contracts_retention` (AFTER UPDATE, cascades only):
- owner or shop gone: never-sent drafts are deleted; unsent amendment drafts are deleted; a sent amendment is
  withdrawn (the current version stays); a sent initial offer stays and can only be declined; accepted / active /
  ended contracts keep their status; `owner_removed_at` / `shop_removed_at` are stamped;
- worker gone: contracts the worker never accepted are deleted; accepted ones are kept for the owner with pending
  versions withdrawn; `worker_removed_at` is stamped;
- accepted applications deleted by a shop / owner cascade are first copied to `retained_job_application_records`
  (opening snapshot, status, submitted / decided stamps; no cover note) while the worker profile exists; the worker
  reads them with `my_retained_application_records()`.
Acceptance records keep their party name snapshot when `party_id` is nulled. Contracts kept after both parties left
stay until a human decides on retention (W9-L5).

## RPCs (all `authenticated`; foreign or unknown ids -> 42501 `Contract not found.` for writes, 0 rows for reads)

Owner: `create_worker_contract_draft(p_shop_id, p_worker_id, p_template_version_id, p_classification_key,
p_start_date, p_end_date = null, p_owner_values = '{}')`, `save_worker_contract_draft(p_contract_id,
p_expected_draft_revision, p_classification_key, p_start_date, p_end_date, p_owner_values, p_editable_bodies,
p_shop_terms)`, `send_worker_contract_version(p_contract_id, p_expected_draft_revision, p_acknowledgement_key,
p_contractor_acknowledgement_key = null, p_acknowledged_flag_count = null)`, `withdraw_worker_contract_version(
p_contract_id, p_version_id)`, `discard_worker_contract_draft(p_contract_id, p_version_id)`,
`create_worker_contract_amendment(p_contract_id, p_expected_revision, p_template_version_id = null)`,
`activate_worker_contract(p_contract_id, p_expected_revision)`, `terminate_worker_contract(p_contract_id,
p_expected_revision, p_reason)`. Worker: `accept_worker_contract_version(p_contract_id, p_version_id,
p_content_hash, p_acknowledgement_key, p_contractor_acknowledgement_key = null)`,
`decline_worker_contract_version(p_contract_id, p_version_id, p_note = null)`, `terminate_worker_contract(...)`.
Reads: `owner_worker_contracts()`, `my_worker_contracts()`, `owner_contract_eligible_workers()` (definer, owner only,
names only), `worker_contract_versions(p_contract_id)`, `worker_contract_version_document(p_version_id)`,
`worker_contract_version_clauses(p_version_id)`, `worker_contract_version_flags(p_version_id)`,
`worker_contract_flag_notices()`, `worker_contract_version_changes(p_version_id)`,
`worker_contract_acceptances(p_contract_id)`, `preview_worker_contract_draft(p_contract_id)` (definer, owner only),
`my_retained_application_records()`, `worker_contract_effective_status(p_status, p_end_date)`. Internal (no client
role): the sealer, validator, render / draft / flag helpers, `expire_worker_contracts(p_as_of)`, guards, producers.
Deviations from the plan file layout: `discard_worker_contract_draft`, `create_worker_contract_amendment` and
`activate_worker_contract` live in w9g; the owner-text helpers in w9b; `my_retained_application_records` in w9i
(each file <= 350 lines; SQL functions need their table to exist).

Messages (code: text), for `supabaseErrorMessages.ts`:
- 42501: `Contract not found.` / `This contract change is not allowed.` / `Contracts are changed only through
  WashLink.` / `Sent contract versions cannot be edited.` / `Acceptance records are created only by the accepting
  party.` / `Acceptance records cannot be changed.` / `Contract template not found.`
- 23514: `You can draft a contract only for a worker with an accepted application or completed training at this
  shop.` / `Choose a contract template.` / `Use the current standard template version.` / `Archived templates cannot
  be changed. Restore it first.` / `Choose the relationship type for this contract.` / `Unknown relationship type.` /
  `Give a start date.` / `The end date cannot be before the start date.` / `Write the role title in 3 to 120
  characters.` / `Write the schedule in 3 to 500 characters.` / `Write the pay details in 3 to 1000 characters.` /
  `This clause is a WashLink safeguard and cannot be changed.` / `Editable clauses cannot be empty.` / `A clause can
  hold up to 4000 characters.` / W8 shop-term and owner-text messages / `Your shop needs a recorded verification
  before you send a contract.` / `The start date cannot be in the past.` / `Fill in every shop clause and contract
  detail before sending (missing: <keys>).` (`<placeholder>`, `clause:<clause_key>`, `shop_term:<section>.<position>`) /
  `Confirm the offer statement before sending.` / `Confirm the independent contractor acknowledgement.` / `Confirm
  the acceptance statement before accepting.` / `This shop is no longer on WashLink, so this offer can only be
  declined.` / `This shop's verification is not current. You can decline or wait.` / `Keep the note to 500
  characters.` / `Give a reason of 10 to 500 characters.` / `The contract start date has not been reached yet.` /
  `Your shop needs a recorded verification before you record the start.` / `This worker is still in required
  training with your shop. Training is not productive work, so the contract cannot start yet.` / validator texts.
- 23505: `This worker already has an open contract with this shop.` / `This contract already has an open change.`
- 55000: `This contract changed. Reload it and try again.` / `This contract changed. Read the new version before you
  accept.` / `The keyword check changed. Review the flags again.`
- 22023: `Contract details must be text.` / `Unknown contract detail.` / `Placeholder values cannot contain {{ or
  }}.` / `Unknown clause.` / `Editable clause bodies must be text.` / `The expiry date cannot be in the past.`

## Audit and notifications

See `AUDIT_AND_NOTIFICATIONS.md` (W9 section): `worker_contract.*` actions and `job_application_record.retained`;
keys `worker_contract:<contract id>:<audit event id>`; no contract text, names, reasons, notes, pay, dates or hashes.
W11 adds `worker_contract_dispute.*` (raised, responded, withdrawn, closed, deleted, case_viewed) with the same subject
rule and keys `contract_dispute:<id>:<event>` (`DASHBOARDS_AND_OVERSIGHT.md`).

## Reported contract problems (W11; details in `DASHBOARDS_AND_OVERSIGHT.md`)

- Either party of a SENT contract (the worker it was sent to, or its owner) can report a problem to WashLink with
  `raise_contract_dispute` up to 90 days after the contract ends (declined, withdrawn, expired, terminated or
  effectively expired). Categories: `owner_ended_contract` (worker raiser, `ended_by` owner; the review of owner
  terminations carried forward from W9-L14), `worker_ended_contract` (owner raiser, `ended_by` worker),
  `contract_terms`, `amendment`, `acceptance_record`, `other`. One open problem per party and contract, at most 3 per
  party; the other party may answer once; the raiser may withdraw.
- A super_admin reads the contract (metadata, sealed versions and their text, acceptance records, the live (worker,
  owner) relationship status without any count) only through `admin_contract_dispute_case` /
  `admin_contract_dispute_version_document`, only while that problem is open, and every call is audited
  (`worker_contract_dispute.case_viewed`). There is still no super_admin access to a contract without an open problem.
- The super_admin closes a problem with `information_shared`, `referred_outside_washlink` or `no_platform_action` and
  a note shown to both parties. Nothing changes the contract: no W11 function writes `worker_contracts`,
  `contract_versions` or acceptances, the W9 RPCs never read the dispute table, and an open problem never blocks a
  decline or termination (J16). WashLink never reinstates or ends a contract, awards pay or decides legal rights
  (D-47; W11-L5..L8). Frontend (built): "Report a problem" per row in `MyContractsPanel` /
  `OwnerWorkerContractsPanel` (optional `contractDisputeService`), `ContractDisputeList` with respond / withdraw; the W9
  accept / decline / terminate modals are byte-identical to HEAD.

## Limitations

- English only; no PDF, translation or e-signature provider (D-6; W9-L10). Not a tamper-proof or certified record: a
  database superuser or table owner can disable triggers (R4); the write flag relies on PostgREST not exposing
  `set_config` (smoke-checked).
- Keyword flags miss paraphrases, other languages and misspellings and flag harmless text (W9-L3). The hash covers
  the rendered text, not the jsonb inputs (R6). The C7 activation check reads training state without a lock (R7).
- Expiry is derived on read until the W12 `worker_contract_expiry` job records it; that job runs only once a human
  registers it (R9, W12-L4). Each party gets one notice; a terminate or decline is never refused and waits at most until
  the running batch commits (J16, `j16_w12_scheduler_locking`). Paid booking assignment of a worker without a
  contract is not blocked (W6-L10 stays OPEN). super_admin access exists only through an open reported problem (W11,
  below). The W10 distinct-owner count (`OWNER_RELATIONSHIPS.md`) is derived from
  these contracts and is informational only: no W9 RPC, guard or policy reads it, and decline / terminate never depend on it.
- A commit-validator bug would block every send (R2); an audit failure aborts the action, cascades included (R3).

## Rollback (local test stack only; reverse order j..a; valid only before W10 ships)

W10 and W11 are now built: roll back W11 first (i..a, `DASHBOARDS_AND_OVERSIGHT.md`; `worker_contract_disputes` has an
FK to `worker_contracts`), then W10 (g..a, `OWNER_RELATIONSHIPS.md`). Its w10b rollback restores the w9c guard
body (re-opening W9-S1 / C1); the W10 sync trigger on `worker_contracts` must be gone before any W9 step.

j: drop the producers (audit rows and notifications stay). i: drop the retention trigger, the `job_applications`
AFTER DELETE trigger and `retained_job_application_records` (IRREVERSIBLE: export first). h: drop the reads. g, f:
drop the RPCs and the expiry function. e: drop the commit validator and rules. d, c: drop the guards, then
acceptances, flags, clauses, versions and contracts (IRREVERSIBLE loss of every contract, sealed snapshot and
acceptance record: trusted `copy` first). b: drop the reference tables and owner-text helpers. a: nothing. Stager:
remove `test_helpers_worker_contracts.sql` from `HELPERS_SOURCE_NAMES`. Once W9 exists, the W8 rollback is invalid
(W9 FKs point at W8 tables).

## Tests

pgTAP (9 files): `j9_w9_owner_customizes_worker_contract_draft` (J9 contract half),
`j10_accepted_contract_contents_preserved_after_template_change`, `j11_material_contract_amendments_require_acceptance`,
`j12_worker_and_owner_cannot_access_other_parties_private_contracts`, `j9_w9_worker_contract_rules`,
`j9_w9_problem_term_flags`, `j9_w9_worker_contract_audit`, `j17_w9_worker_contract_authorization`, `j18_w9_flows`;
helpers `scripts/supabase-test/baseline/test_helpers_worker_contracts.sql`; smoke `scripts/supabase-test/w9-api-smoke.mjs`.
