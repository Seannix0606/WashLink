# W9 - Worker contracts, acceptance, snapshots, amendments - PLAN

Spec: E (create a contract draft for a worker and shop, compare with the standard, record review and acceptance, statuses draft / sent
for review / accepted / declined / active / expired / terminated, immutable snapshot of each accepted agreement, history and audit,
no silent modification, no fabricated signatures, no silent independent-contractor classification, flag problem terms without claiming
legal validation, private to the parties), F (worker may always decline or terminate), G, H (owner "Contract drafts, acceptance, and
active relationships"; worker "Contract offers and active relationships"), I, J9 (contract-draft half), J10, J11, J12, J17, J18.
Depends on W8 and W5: both `passed` (STATE.md; HEAD 81be37d). Decisions: D-6 ADOPTED-DEFAULT (no e-signature; draft-and-acceptance
record, labelled), D-26 ADOPTED-DEFAULT (explicit classification, no default, contractor last + extra acknowledgement), D-13, D-14,
D-18 / D-23 (retention, applied here to contracts), D-29 (W9 gates sending on verification). D-3 is not needed (W10). Not BLOCKED.
Closes carry-forwards: W5-L10 (owner / shop deletion keeps contract records and accepted-application snapshots), W0 C7 (contract start
vs required training), W8 review (snapshots store their own fully rendered text incl. titles and notices; single-pass render), W8 J9 split.

## 1. Scope / out of scope
In: `worker_contracts`, `contract_versions` (inputs while draft; sealed rendered text + sha256 when sent), `contract_version_clauses`,
`contract_version_flags`, `contract_acceptances`, reference tables `contract_problem_term_rules` and `contract_acknowledgement_texts`,
`retained_job_application_records` (W5-L10); RPC state machines for contracts and versions (incl. amendments); problem-term flagging;
diff vs the standard and amendment-change lists; retention on owner / shop / worker deletion; expiry function (internal; W12 schedules);
audit + notifications (no contract text); owner and worker UI incl. a text-only snapshot view with Download (.txt) and Print; pgTAP
J9-contract / J10 / J11 / J12 / J17 / J18 + rules / flags / audit files, Vitest, w9 smoke, docs, legal register.
Out (reason): owner relationships and the three-owner count (W10, D-3); super_admin / dispute access to contracts (W11); scheduled
expiry and email / push (W12); e-signature provider, PDF export, translations (D-6; legal flag W9-L10); blocking paid booking
assignment for workers without a contract (W6-L10 stays OPEN; changes J18 booking flows); contract text in notifications (never).
No production apply, no `.env`, no SQLAlchemy/Alembic tables.

## 2. Design principles (continue P1-P44)
P45. Every write to a W9 table goes through a definer RPC under the transaction-local flag `washlink.worker_contract_write` = contract
id. No client role (anon, authenticated, service_role) has INSERT / UPDATE / DELETE; write policies deny-all. Trusted SQL may repair
`worker_contracts` status columns (audited `trusted_session`) but never sealed versions, clauses, flags or acceptances (P46, P47).
P46. Sealed versions are write-once for EVERY session: a version is `draft` (inputs editable by the owner RPC only) until sent; sending
seals it in one transaction (clauses + flags + `rendered_text` + `content_hash` + owner acceptance), validated at once and again by a
DEFERRABLE INITIALLY DEFERRED constraint trigger. After sealing only `state` and response stamps change, through the state machine;
text, inputs, hash, clauses and flags never (42501 `Sent contract versions cannot be edited.`). Clauses and flags insert only when
`created_txid = sealed_txid = txid_current()`.
P47. No fabricated acceptance: a `contract_acceptances` row is inserted only inside `send_worker_contract_version` (party owner) or
`accept_worker_contract_version` (party worker), under the flag AND with `party_id = auth.uid()` whose role matches `party_role`
(trigger, every session; a trusted session without a JWT cannot insert one at all). It stores version id, version number and
`version_content_hash` (trigger: must equal the sealed hash), the statement key plus a snapshot of the statement text, the party name
snapshot, `accepted_at = now()` (forced) and `record_label` CHECK = `Acceptance record — not an e-signature`. No signature image,
typed-name-as-signature, IP or device data is collected. Immutable; deleted only with its contract (P53).
P48. Snapshots are self-contained (W8 R5 and review carry-forward): `rendered_text` is the whole document as plain text: header
(agreement title, contract reference, version number and kind, base standard version number, relationship-type label, the notice
"Draft — requires review by a qualified Philippine labor-law professional", the label "Acceptance record — not an e-signature"), then
every section "N. Title", its review notice, each clause heading and rendered body in order. `content_hash` = sha256 hex of
`convert_to(rendered_text, 'UTF8')` (built-in `sha256`). The validator rebuilds the text from the clause rows and header fields and
compares text and hash. Template and platform ids are lineage only (FK `on delete set null`; platform `restrict`); hashes are copied.
P49. Classification is explicit (D-26): `contract_versions.classification_key` NOT NULL, FK `worker_classification_options`, NO
default; the create / save RPC parameter `p_classification_key` has no default either. `independent_contractor`
(`needs_extra_acknowledgement`) requires owner acknowledgement `w9_contractor_owner_v1` at send and worker acknowledgement
`w9_contractor_worker_v1` at accept. The label is snapshotted and rendered into `{{worker_classification}}` (locked clause only).
P50. Rendering is single-pass via `render_contract_template_clause(body, values)` (W8; values with `{{` / `}}` -> 22023). Server values:
`owner_full_name`, `worker_full_name`, `shop_name`, `shop_address` from profiles / shops at seal (fallback `Name not provided on
WashLink`), `worker_classification` from the option label, `start_date` / `end_date` as ISO dates (null end -> `No end date stated by
the shop`). Owner-typed values, shown verbatim: `role_title` 3..120, `schedule_summary` 3..500, `pay_details` 3..1000 (WashLink never
fills in pay). Send refuses any unfilled placeholder and any editable clause still holding the platform instruction
(`requires_owner_input` with an unchanged body, or text containing `[Shop:`).
P51. Problem-term flags inform, never block and never validate (D-33): keyword rules run only on owner-written text (editable bodies,
shop terms, owner-typed values), never on locked clauses. Stored at seal and shown to both parties with "Automatic keyword check. It may
miss problems or flag acceptable text. It is not legal advice and WashLink does not check whether terms are lawful." Zero flags shows
"No keyword matches. This does not mean the terms are lawful." The owner acknowledges the current flag count to send.
P52. Consent before change (spec E): after the first acceptance every change is an amendment, a new version in force only after the
worker accepts it; the accepted version stays in force on decline or withdrawal. No "minor change" path: every amendment is material
(D-34). The worker can always decline an offer or amendment and always terminate an accepted / active contract (reason 10..500; no
verification, notice-period, three-owner or other gate).
P53. Retention (W5-L10; D-18 / D-23 applied; D-32; D-35): `worker_contracts.owner_id`, `shop_id`, `worker_id`, `job_application_id`,
`training_enrollment_id` are `on delete set null` with name / address snapshots. Owner or shop removal never deletes a sent contract,
its versions or acceptances and never changes its status (no fabricated termination); only never-sent drafts and unsent amendment
drafts are removed. Worker account removal keeps contracts the worker accepted (owner's record) and removes the rest. Accepted
applications removed by a shop / owner cascade are first copied to `retained_job_application_records` (worker-only).
P54. Audit payloads carry ids, status / kind words and small counts only (`contract_id`, `version_id`, `version_number`, `version_kind`,
`shop_id`, `from_status`, `to_status`, `flag_count`, `classification_key`, `party_role`, `changed_by`, `ended_by`, `deleted_by`,
`removed_party`); never text, names, reasons, notes, pay, dates or hashes. Notifications carry only the shop label
(`notification_safe_label(shop_name_snapshot, 'The shop')`) and fixed wording. No W9 table is in `supabase_realtime`.

## 3. Migrations (`2026_10_26_w9<x>_<snake>.sql`, staged 20261026000017..26; each ends with `-- ROLLBACK`; each <= 350 lines)
Idempotent, `notify pgrst, 'reload schema';` last; every function `set search_path = public, pg_temp` and comment `W9: ...`; `revoke
all ... from public, anon` (+ `authenticated`, `service_role` for internal and trigger functions); client RPCs `grant execute ... to
authenticated`. Lock order everywhere: `worker_contracts` row FOR UPDATE -> its `contract_versions` rows FOR UPDATE -> shop row FOR
SHARE; nothing else locks contracts. Manila date = `(now() at time zone 'Asia/Manila')::date`.
### 3.1 `2026_10_26_w9a_worker_contracts_preflight.sql` (creates nothing)
Abort naming every missing item: W8 tables and `worker_classification_options.needs_extra_acknowledgement`,
`render_contract_template_clause`, `contract_template_placeholders`; `job_applications.{status, submitted_at, shop_id, owner_id,
opening_snapshot}`; `training_enrollments`, `training_enrollment_is_completed`, `training_enrollment_is_live`;
`shop_has_recorded_verification`, `is_verified_shop_owner`, `record_workforce_audit_event`, `enqueue_notification_safely`,
`notification_safe_label`, `is_trusted_db_session`, `is_orphaned_fk_set_null`. Abort if any `public.worker_contract%`,
`contract_version%`, `contract_acceptance%`, `contract_problem_term%`, `contract_acknowledgement%` or `retained_job_application%`
relation or function exists without a `W9` comment (D-10 row 38). Rollback: nothing.
### 3.2 `2026_10_26_w9b_worker_contract_reference_data.sql`
`contract_acknowledgement_texts` (ack_key PK, text 20..600, review_status = 'draft_requires_legal_review'), seeded:
`w9_owner_send_v1` ("I offer these terms to the worker as shown. This is an acceptance record on WashLink, not an electronic
signature."), `w9_worker_accept_v1` ("I have read this version of the contract and I accept it. This is an acceptance record on
WashLink, not an electronic signature. I can still end the contract as the law allows."), `w9_contractor_owner_v1` and
`w9_contractor_worker_v1` ("The relationship type chosen is independent contractor. This choice has legal consequences and should be
confirmed with a qualified professional. WashLink does not decide or check it.").
`contract_problem_term_rules` (rule_key PK, category, label 3..80, pattern (POSIX ARE, matched with `~*`, validity checked by a CHECK
that evaluates `'' ~* pattern`), guidance 20..300, sort_order unique, review_status draft): at least one rule for each of the 16 W8-L13
categories: training_fee, training_cost_clawback, deposit, cash_bond, work_item_deduction (uniform, equipment, damage, shortage),
fine_or_penalty, waiver, quitclaim_or_release, exclusivity_or_non_compete, liquidated_damages_or_forfeit, unpaid_trial_or_customer_work_in_training,
contractor_label, forum_or_arbitration, certificate_government_claim, contract_validity_claim (signed, binding, valid, compliant), plus
common Filipino keywords in the same categories (e.g. multa, kaltas, bawas, deposito, piyansa). Guidance says "may need legal review",
never "unlawful", "illegal" or "compliant". Both tables: select for authenticated; guard refuses every write except a trusted session.
`contract_problem_term_matches(p_text text) returns table(rule_key, category, excerpt)` (internal, stable): one row per matching rule,
excerpt up to 160 chars around the first match; input capped at 4000 chars.
### 3.3 `2026_10_26_w9c_worker_contracts.sql`
`worker_contracts`: id uuid PK; shop_id FK shops set null; owner_id FK profiles set null; worker_id FK worker_profiles(profile_id) set
null; origin CHECK in (accepted_application, completed_training); job_application_id, training_enrollment_id FK set null; status CHECK
in (draft, sent_for_review, accepted, declined, withdrawn, active, expired, terminated) default draft; current_version_id,
pending_version_id FK contract_versions (deferrable); shop_name_snapshot, shop_address_snapshot, owner_name_snapshot,
worker_name_snapshot (<= 200); start_date, end_date of the version in force (CHECK end >= start); revision int (+1 per change); sent_at,
accepted_at, activated_at, ended_at; ended_by CHECK in (worker, owner, system, trusted_session); end_reason 10..500; decline_note <= 500;
owner_removed_at, shop_removed_at, worker_removed_at, status_changed_at, created_at, updated_at. `wc_lifecycle_consistency`: draft has no
sent_at; accepted / active / expired / terminated have accepted_at and current_version_id; active has activated_at; declined / withdrawn /
expired / terminated have ended_at; terminated has ended_by and (unless trusted_session) end_reason. Unique partial index
`worker_contracts_one_open_per_shop_worker (shop_id, worker_id) where status in (draft, sent_for_review, accepted, active)` (23505 `This
worker already has an open contract with this shop.`). Indexes (owner_id, status), (worker_id, status), (shop_id).
`contract_versions`: id uuid PK; contract_id FK cascade; version_number >= 1, unique (contract_id, version_number); kind CHECK in
(initial, amendment); state CHECK in (draft, sent_for_review, accepted, declined, withdrawn, superseded); unique partial
`contract_versions_one_open_per_contract (contract_id) where state in (draft, sent_for_review)`; template_version_id FK
contract_template_versions set null, template_content_hash, template_name_snapshot, template_version_number; base_platform_version_id FK
restrict NOT NULL, base_platform_content_hash, base_platform_version_number; classification_key NOT NULL FK restrict (no default),
classification_label; editable_bodies jsonb object; shop_terms jsonb array; owner_values jsonb object (keys role_title,
schedule_summary, pay_details only); start_date NOT NULL; end_date; draft_revision int; rendered_text (<= 200000); content_hash
`^[0-9a-f]{64}$`; flag_count; sealed_at; sealed_txid; sent_at; responded_at; decline_note; created_by FK profiles set null; created_at,
updated_at. `cv_seal_consistency`: state = draft exactly when rendered_text, content_hash, flag_count, sealed_at, sealed_txid are null.
Guards (BEFORE, every session): writes only under the flag (42501 `Contracts are changed only through WashLink.`); trusted repair only of
contract status columns; P46 on versions; contract DELETE only for never-sent rows under the flag or the P53 cleanup paths.
RLS select: contracts - owner (role owner and owner_id = auth.uid()) every own row; worker (worker_id = auth.uid()) rows with sent_at
not null. Versions - owner: own contracts; worker: own contracts and state <> draft. Nobody else (super_admin, customers, anon: none).
### 3.4 `2026_10_26_w9d_contract_version_records.sql`
`contract_version_clauses` (version_id cascade; section_number FK sections; section_title and review_notice snapshots; position;
clause_key; kind; heading; body (rendered); standard_heading, standard_body (base platform clause rendered with the same values; null for
shop terms); change CHECK in (unchanged, edited, added_by_shop); edited_in CHECK in (template, contract), null when unchanged;
clause_hash; created_txid). `contract_version_flags` (version_id cascade; section_number and position, null for values; value_key;
rule_key FK restrict; category; excerpt <= 160; created_txid). `contract_acceptances` (P47: contract_id and version_id cascade,
version_number, version_content_hash, party_role CHECK in (owner, worker), party_id FK profiles set null, party_name_snapshot,
statement_key FK texts, statement_text, contractor_ack_key, accepted_at, record_label; unique (version_id, party_role)). Same
immutability guards; RLS follows the version (worker: sealed versions only).
### 3.5 `2026_10_26_w9e_worker_contract_rules.sql` (internal)
`worker_contract_eligibility(p_shop, p_worker)`: an accepted application (submitted_at set) at that shop whose owner_id is the current
`shops.owner_id`, or an enrollment at that shop with `training_enrollment_is_completed`. `worker_contract_draft_clauses(p_version)`:
base platform locked clauses verbatim + editable bodies by key from the template version, overlaid by contract-level edits and shop
terms (W8 placement rules: sections 2, 3, 5-13, 15; <= 40 terms; owner-text checks incl. safeguard impersonation and locked-only
placeholders). `worker_contract_render_values`, `worker_contract_unfilled`, `worker_contract_build_text`, `worker_contract_live_flags`,
`worker_contract_seal_version`; `validate_worker_contract_version` (sections 1..15 present; locked clauses equal to the base; text and
hash recompute; flags equal the live result; owner acceptance with the hash) and constraint trigger `contract_versions_validate_at_commit`
(AFTER UPDATE when state leaves draft, DEFERRABLE INITIALLY DEFERRED, every session). `worker_contract_effective_status(status,
end_date)`: accepted / active with end_date before Manila today -> expired.
### 3.6 `2026_10_26_w9f_worker_contract_owner_rpcs.sql` (caller: role owner and current `shops.owner_id`, else 42501 `Contract not found.`)
`create_worker_contract_draft(p_shop_id, p_worker_id, p_template_version_id, p_classification_key, p_start_date, p_end_date default
null, p_owner_values jsonb default '{}')` returns the contract (template version = a version of an own template or the latest platform
version; not eligible -> 23514 `You can draft a contract only for a worker with an accepted application or completed training at this
shop.`). `save_worker_contract_draft(p_contract_id, p_expected_draft_revision, p_classification_key, p_start_date, p_end_date,
p_owner_values, p_editable_bodies, p_shop_terms)` (open draft version only; stale -> 55000 `This contract changed. Reload it and try
again.`; locked key -> 23514 as W8). `send_worker_contract_version(p_contract_id, p_expected_draft_revision, p_acknowledgement_key,
p_contractor_acknowledgement_key default null, p_acknowledged_flag_count int)`, checks in order: owner; `is_verified_shop_owner` else
23514 `Your shop needs a recorded verification before you send a contract.`; initial version start_date >= Manila today else 23514
`The start date cannot be in the past.`; unfilled -> 23514 `Fill in every shop clause and contract detail before sending (missing:
...).`; acknowledgement keys; contractor acknowledgement when needed else 23514 `Confirm the independent contractor acknowledgement.`;
flag count differs -> 55000 `The keyword check changed. Review the flags again.`; then seal, owner acceptance, and contract ->
sent_for_review (initial) or pending_version_id (amendment). `withdraw_worker_contract_version(p_contract_id, p_version_id)`;
`discard_worker_contract_draft(p_contract_id, p_version_id)` (unsent only); `create_worker_contract_amendment(p_contract_id,
p_expected_revision, p_template_version_id default null)` (accepted / active and not effectively expired; copies the current version's
inputs; 23505 when an open version exists); `activate_worker_contract(p_contract_id, p_expected_revision)` (accepted; start_date <= Manila
today; verified shop; no `training_enrollment_is_live` enrollment of the worker with this owner, else 23514 `This worker is still in
required training with your shop. Training is not productive work, so the contract cannot start yet.`).
### 3.7 `2026_10_26_w9g_worker_contract_party_rpcs.sql`
`accept_worker_contract_version(p_contract_id, p_version_id, p_content_hash, p_acknowledgement_key, p_contractor_acknowledgement_key
default null)`: worker only; the pending sent version; hash differs -> 55000 `This contract changed. Read the new version before you
accept.`; owner or shop gone -> 23514 `This shop is no longer on WashLink, so this offer can only be declined.`; no recorded verification
-> 23514 `This shop's verification is not current. You can decline or wait.`; inserts the worker acceptance; initial -> contract
accepted; amendment -> version accepted, previous current -> superseded, contract dates from it. `decline_worker_contract_version(
p_contract_id, p_version_id, p_note default null)`: worker, always while sent (note <= 500). `terminate_worker_contract(p_contract_id,
p_expected_revision, p_reason)`: the worker (always) or the current owner; accepted or active; reason 10..500 else 23514 `Give a reason
of 10 to 500 characters.`; a pending amendment -> withdrawn. `expire_worker_contracts(p_as_of date)`: internal, idempotent, refuses a
past `p_as_of` (22023); W12 schedules it.
### 3.8 `2026_10_26_w9h_worker_contract_reads.sql` (SECURITY INVOKER unless noted; a foreign or unknown id returns 0 rows)
`owner_worker_contracts()`, `my_worker_contracts()` (status, effective_status, party / shop snapshots, current and pending version
numbers, dates, removed flags, allowed actions); `owner_contract_eligible_workers()` (definer, owner only: worker id, display name, shop,
origin, has_open_contract; only workers reachable per D-31 inside the D-13 window, never contacts); `worker_contract_versions(p_contract_id)`;
`worker_contract_version_document(p_version_id)` (rendered_text, content_hash, number, kind, state, sealed_at, record label);
`worker_contract_version_clauses(p_version_id)` (diff vs standard columns); `worker_contract_version_flags(p_version_id)` (+ disclaimer);
`worker_contract_version_changes(p_version_id)` (vs the version it amends: clause changed / added / removed; classification, dates and
owner values changed); `worker_contract_acceptances(p_contract_id)`; `preview_worker_contract_draft(p_contract_id)` (owner only: rendered
clauses, diff, unfilled list, live flags, flag_count, draft_revision); `my_retained_application_records()`.
### 3.9 `2026_10_26_w9i_worker_contract_retention.sql`
AFTER UPDATE trigger on `worker_contracts` detecting `is_orphaned_fk_set_null` of owner_id / shop_id / worker_id: stamps `*_removed_at`.
Owner or shop gone: delete never-sent drafts and unsent amendment drafts; withdraw a sent amendment (current version stays); a sent
initial offer stays, declinable only; accepted / active status never changes. Worker gone: delete contracts the worker never accepted;
withdraw pending versions on accepted ones. `retained_job_application_records` (id, worker_id FK worker_profiles cascade, application_id
uuid without FK, opening_snapshot jsonb, status, submitted_at, decided_at, removed_at, removal_reason `shop_or_owner_removed`); an AFTER
DELETE trigger on `job_applications` copies accepted rows when the worker profile still exists and the opening, shop or owner is gone.
RLS worker-only select; no client writes.
### 3.10 `2026_10_26_w9j_worker_contract_audit_and_notifications.sql`
Producers (definer, pinned, revoked) on contracts, versions, acceptances and retained records. Actions: `worker_contract.created`,
`.sent`, `.withdrawn`, `.accepted` (party_role worker; the owner acceptance is part of `.sent`), `.declined`, `.activated`, `.terminated`,
`.expired`, `.amendment_created`, `.draft_discarded`, `.party_removed`, `.deleted`; `job_application_record.retained`. Draft saves are not
audited (W5 / W6 rule); refused actions write nothing. Notifications, key `worker_contract:<contract id>:<audit event id>`: offer sent ->
worker `<shop> sent you a contract draft to review. It applies only if you accept it.`; amendment sent -> worker `<shop> proposed a
change to your contract. Your current terms stay until you accept it.`; accepted / declined -> owner `A worker accepted (declined) your
contract offer (the proposed change).`; withdrawn -> worker; activated -> worker `<shop> recorded that your contract has started.`;
terminated -> the other party `... ended a contract. Open it to see the reason.`; expired -> both; party removed -> the remaining party
`A contract's other party left WashLink. Your contract record is kept.` Trusted repairs notify nobody.

## 4. State machines (anything else -> 42501 `This contract change is not allowed.`; stale -> 55000)
| Object | From | To | Who | Condition |
|---|---|---|---|---|
| contract + v1 | (none) | draft | current shop owner | D-31 eligibility; explicit classification; one open contract per shop + worker |
| draft version | draft | draft (saved) | owner | expected draft_revision |
| contract | draft | (deleted) | owner | never sent |
| contract / v1 | draft | sent_for_review | owner | verified shop; filled; acknowledgements; flag count; start not in the past; seal + owner acceptance |
| contract / v1 | sent_for_review | withdrawn | owner | current owner |
| contract / v1 | sent_for_review | accepted | worker | hash match; owner and shop present; recorded verification; acknowledgements |
| contract / v1 | sent_for_review | declined | worker | always (optional note) |
| contract | accepted | active | owner | start_date <= today; verified shop; no live required training with this owner (C7) |
| contract | accepted, active | terminated | worker (always) or current owner | reason 10..500; pending amendment withdrawn |
| contract | accepted, active | expired | system | end_date before today (`expire_worker_contracts`; reads derive it first) |
| amendment vN | (none) | draft | owner | contract accepted / active, not expired; one open version |
| amendment | draft | sent_for_review / (deleted) | owner | as the initial send (start may be past) / discard |
| amendment | sent_for_review | accepted | worker | as the initial accept; previous current -> superseded |
| amendment | sent_for_review | declined / withdrawn | worker / owner | contract stays on its current version |
| pending version | sent_for_review | withdrawn | system | contract terminated / expired; party removed (P53) |
Refused for everyone: workers drafting or activating; owners accepting or declining for the worker; another owner, super_admin,
customer, anon; editing a sealed version; leaving declined / withdrawn / superseded / expired / terminated; any direct table write.

## 5. Decisions taken in this plan (RECORD adds to DECISIONS.md as ADOPTED-DEFAULT (loop, 2026-10-26))
D-31 Drafts only for workers with an accepted application or a completed training enrollment at that shop; one open contract per shop
and worker; the owner records the start after acceptance; both parties get acceptance records (the owner's at send).
D-32 Worker account deletion keeps contracts the worker accepted (owner's record, name snapshot) and removes the rest.
D-33 Problem-term flags are keyword based, never block sending, are shown to both parties; the owner acknowledges the count.
D-34 Every post-acceptance change is a material amendment needing worker acceptance; one open amendment at a time.
D-35 Owner / shop removal never terminates or alters a sent contract; unsent drafts are removed; open offers become declinable only.

## 6. Tests (pgTAP `plan(n)` = actual; 0 `todo_start(`; each file <= 350 lines)
Helpers: NEW `scripts/supabase-test/baseline/test_helpers_worker_contracts.sql` (real RPCs as the actor): `create_test_contract_draft(
p_owner_email, p_shop, p_worker, p_template_version default null, p_classification default 'employee')`, `fill_test_contract_draft`,
`send_test_contract`, `accept_test_contract(p_contract, p_worker_email)`. Stager `HELPERS_SOURCE_NAMES` gains it as the 4th entry
(`stager_seeds_every_helper_file_in_order` updated; still 19 pass).
`j9_w9_owner_customizes_worker_contract_draft.test.sql` (J9 contract half): j9_owner_creates_contract_draft_from_own_template_version_for_accepted_applicant,
j9_owner_creates_contract_draft_for_worker_with_completed_training, j9_draft_refused_without_accepted_application_or_completed_training,
j9_draft_requires_explicit_classification_no_default, j9_owner_customizes_editable_bodies_and_shop_terms_on_contract_draft,
j9_contract_draft_customization_leaves_template_version_unchanged, j9_contract_locked_clauses_copied_verbatim_from_base_standard,
j9_draft_preview_lists_unfilled_placeholders_and_live_flags, j9_draft_diff_vs_standard_marks_template_and_contract_edits,
j9_stale_contract_draft_save_rejected, j9_one_open_contract_per_shop_and_worker.
`j10_accepted_contract_contents_preserved_after_template_change.test.sql` (J10): j10_sent_version_sealed_with_rendered_text_and_sha256_hash,
j10_hash_recomputes_from_stored_text, j10_rendered_text_includes_section_titles_notices_and_labels, j10_owner_saves_new_template_version_accepted_text_unchanged,
j10_new_platform_standard_published_accepted_text_unchanged, j10_owner_account_deletion_keeps_accepted_text_for_worker,
j10_sealed_versions_clauses_flags_and_acceptances_immutable_for_every_session, j10_acceptance_records_version_hash_and_label_not_e_signature.
`j11_material_contract_amendments_require_acceptance.test.sql` (J11): j11_amendment_is_new_draft_version_current_terms_unchanged,
j11_amendment_not_in_force_until_worker_accepts, j11_worker_accepts_amendment_previous_version_superseded_and_kept,
j11_worker_declines_amendment_contract_continues_on_current_version, j11_accept_with_stale_hash_refused, j11_owner_cannot_edit_accepted_version_directly,
j11_every_change_requires_acceptance_no_minor_change_path, j11_one_open_amendment_at_a_time, j11_amendment_send_requires_verified_shop,
j11_owner_withdraws_amendment, j11_amendment_changes_listed_for_worker, j11_termination_withdraws_pending_amendment_and_blocks_new_ones.
`j12_worker_and_owner_cannot_access_other_parties_private_contracts.test.sql` (J12): j12_other_owner_reads_no_contracts_versions_clauses_flags_or_acceptances,
j12_other_worker_reads_nothing, j12_worker_cannot_read_unsent_draft_or_draft_amendment, j12_customer_anon_and_super_admin_read_nothing,
j12_reads_return_nothing_for_foreign_ids, j12_foreign_contract_actions_report_not_found, j12_owner_cannot_accept_or_decline_for_worker,
j12_eligible_worker_list_shows_no_contacts_and_only_reachable_workers, j12_notifications_carry_no_contract_text_pay_reasons_or_names.
`j9_w9_worker_contract_rules.test.sql`: w9_unlisted_transitions_rejected, w9_send_requires_recorded_shop_verification,
w9_send_refuses_unfilled_placeholders_and_shop_instructions, w9_send_requires_owner_acknowledgement_and_current_flag_count, w9_initial_start_date_not_in_past,
w9_contractor_classification_needs_owner_and_worker_acknowledgement, w9_classification_options_have_no_default_and_contractor_last,
w9_acceptance_cannot_be_fabricated_by_trusted_sql, w9_commit_validator_rejects_altered_text_or_hash, w9_placeholder_braces_in_values_refused,
w9_worker_can_always_decline_even_if_shop_unverified_or_removed, w9_worker_can_always_terminate_with_reason, w9_owner_terminates_with_reason,
w9_activation_blocked_during_live_required_training, w9_activation_requires_start_date_and_verified_shop, w9_effective_status_expired_after_end_date,
w9_expire_function_internal_and_idempotent, w9_discard_only_never_sent_drafts.
`j9_w9_problem_term_flags.test.sql`: w9_rules_cover_every_w8_l13_category, w9_each_category_flags_sample_text, w9_locked_clauses_never_flagged,
w9_flags_stored_at_seal_and_visible_to_both_parties, w9_flags_never_block_sending, w9_flag_texts_make_no_legal_validation_claim (rules,
acknowledgement texts and disclaimers contain no unlawful / illegal / compliant / valid / approved claims).
`j9_w9_worker_contract_audit.test.sql`: w9_audit_written_for_every_transition, w9_audit_payload_has_no_text_names_reasons_dates_or_hashes,
w9_refused_action_writes_nothing, w9_notifications_one_per_event_idempotent, w9_notification_texts_pass_safety_checks.
`j17_w9_worker_contract_authorization.test.sql` (J17): j17_w9_tables_rls_enabled_and_no_client_write_privileges, j17_w9_write_policies_deny_all,
j17_w9_internal_functions_not_client_executable, j17_w9_rpcs_denied_to_anon, j17_w9_definer_functions_pin_pg_temp_last,
j17_w9_tables_not_in_realtime_publication, j17_w9_no_fee_signature_or_amount_columns.
`j18_w9_flows.test.sql` (J18): j18_w9_owner_account_deletion_keeps_sent_and_accepted_contracts_for_worker,
j18_w9_shop_deletion_keeps_contracts_and_removes_never_sent_drafts, j18_w9_accepted_application_snapshot_retained_after_shop_deletion,
j18_w9_worker_account_deletion_keeps_accepted_contracts_for_owner, j18_w9_booking_quote_rating_and_verification_unchanged,
j18_w9_application_training_certification_and_template_flows_unchanged.
Changed existing file (only this): `001_migration_replay.test.sql` (62 migrations, + 20261026000017..26; renamed
`replay_schema_migrations_has_baseline_w2_to_w9`; add `replay_w9_worker_contract_tables_rls_enabled`). Every other file unchanged and green.
Smoke `scripts/supabase-test/w9-api-smoke.mjs` (W8 rules: loopback, keys from `supabase status` in memory, `smoke9-*@local.test` users
deleted, no `.env`): direct insert / patch / delete on every W9 table denied for owner, worker, service_role; draft for a non-eligible
worker and draft without classification refused; worker sees nothing before send; unverified-shop send 23514; send with a "deposit"
term and the flag acknowledgement; worker reads document, flags and diff; stale-hash accept 55000; missing contractor acknowledgement
23514; accept; template save and platform publish leave the document hash unchanged; amendment declined (current unchanged), second
amendment accepted (old superseded); other owner / worker / super_admin read nothing; activation; worker terminates with a reason; owner
deleteUser keeps the contract for the worker; notifications hold no text; `set_config` and `expire_worker_contracts` not callable.
Must end `0 failed`.
Vitest (mocked; suffixes `.j9`, `.j10`, `.j11`, `.j12`, `.j17`, `.w9`): j9_contract_draft_editor_edits_only_editable_bodies_and_shop_terms,
j9_classification_choice_has_no_preselection_and_contractor_last_with_extra_acknowledgement, j9_send_modal_requires_flag_acknowledgement,
j10_document_view_shows_stored_text_hash_and_not_e_signature_label, j10_download_text_uses_stored_rendered_text_verbatim,
j11_amendment_review_shows_changes_and_current_terms_stay_copy, j11_worker_can_decline_amendment, j12_contract_views_hide_other_role_actions,
j17_worker_contract_repository_writes_only_through_rpcs, w9_worker_decline_and_terminate_always_available, w9_flags_disclaimer_and_no_match_copy,
w9_stale_contract_error_reloads, w9_contract_lists_loading_empty_error_states, w9_copy_never_claims_signature_validity_or_compliance,
w9_worker_contract_error_messages_mapped, w9_retained_application_records_listed. The existing 174 stay green unchanged.

## 7. Frontend (UI -> hooks -> services -> repositories -> Supabase; each file <= 350 lines) and docs
Add: `domain/models/WorkerContract.ts`; `domain/repositories/WorkerContractRepository.ts`; `domain/utilities/{workerContractActions.ts
(allowed actions by role / status / effective status), contractDocumentDownload.ts (Blob of the stored `rendered_text`, file
`washlink-contract-<8 chars>-v<n>.txt`)}`; `infrastructure/supabase/{supabaseWorkerContractRows.ts, supabaseWorkerContractErrorMessages.ts}`;
`infrastructure/repositories/{SupabaseWorkerContractRepository.ts (invoker reads), SupabaseWorkerContractActionRepository.ts (RPCs only)}`;
`application/validation/workerContractSchemas.ts` (reuses W8 `findOwnerTextProblem`); `application/services/{WorkerContractService.ts,
WorkerContractResponseService.ts}`; `presentation/utilities/{workerContractCopy.ts, workerContractDisplay.ts}`; DI
`createWorkerContractDependencies.ts`; hooks `useOwnerWorkerContracts`, `useContractEligibleWorkers`, `useWorkerContractDraftEditor`,
`useWorkerContractActions`, `useMyWorkerContracts`, `useWorkerContractDocument`, `useWorkerContractVersionHistory`, `useRetainedApplicationRecords`.
Components: `contracts/{ContractDocumentView (stored text exactly, short hash, "Acceptance record — not an e-signature", Download text,
Print via a print stylesheet), ContractProblemTermFlags, ContractDiffWithStandard (reuses `clauseTextDiff`), ContractAmendmentChanges,
ContractAcceptanceRecords, ContractStatusBadge, ClassificationChoice (radios in sort order, none preselected, extra checkbox for the
contractor option), TerminateContractModal}`; `owner/workerContracts/{OwnerWorkerContractsPanel, NewWorkerContractModal,
WorkerContractDraftEditor, SendContractModal, OwnerWorkerContractDetail}`; `worker/contracts/{MyContractsPanel, WorkerContractReview,
AcceptContractModal, DeclineContractModal, RetainedApplicationRecords}`. Change: `OwnerDashboardContent.tsx` (lazy "Worker contracts"
tab; move tab definitions to `ownerDashboardTabs.ts` if needed for 350), `features/worker/{WorkerWorkspaceTabs.tsx,
workerWorkspaceView.ts}` ("Contracts" tab), `supabaseErrorMessages.ts` (merge). Decline and Terminate are always shown to the worker.
Docs: add `docs/workforce/WORKER_CONTRACTS.md` (P45-P54, tables, state machines, text format and hash, flag rules, retention, RPCs and
messages, limitations, rollback); update `CONTRACT_TEMPLATES.md`, `AUDIT_AND_NOTIFICATIONS.md`, `MARKETPLACE_AND_APPLICATIONS.md`,
`ROLE_AND_PROFILE_SECURITY.md` (D-10 rows 38-39), `LOCAL_TEST_HARNESS.md` (62 migrations, 4th helper, W9 smoke), `LEGAL_REVIEW_REGISTER.md`
(W9-L1..L12; notes on W0-L3, W0-L4, W5-L10, W6-L10, W8-L3, L4, L5, L9, L13, all OPEN). The build LOG records the frontend API (as W8);
RECORD adds the W9 smoke row to LOOP.md and D-31..D-35 to DECISIONS.md.

## 8. Acceptance criteria (commands from repo root, local only: `cd frontend && npm run lint / build / test`; `backend/.venv/Scripts/python.exe -m pytest -q`; stager test; `node scripts/supabase-test/run-db-tests.mjs`; `w2-`..`w9-api-smoke.mjs`; stop `--workdir .local-supabase-test --no-backup`; never `--linked`, `--db-url`, `db push`, never `.env`)
| AC | Criterion | Evidence |
|---|---|---|
| AC1 | 10 new migrations `2026_10_26_w9[a-j]_<snake>.sql`, each with `-- ROLLBACK`; nothing committed changed | `ls supabase/migrations/2026_10_26_w9*`; `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_26_w9*` empty; `git diff --name-status 81be37d -- supabase/migrations` only `A` |
| AC2 | Clean replay of 62 migrations; PASS; 0 TODO | runner `Result: PASS`; `replay_schema_migrations_has_baseline_w2_to_w9`, `replay_w9_worker_contract_tables_rls_enabled`; `grep -c "todo_start(" supabase/tests/database/*.sql` all 0 |
| AC3 | J9 contract half | every `j9_*` name in `j9_w9_owner_customizes_worker_contract_draft`; Vitest `j9_*` (W9) |
| AC4 | J10 | every name in `j10_accepted_contract_contents_preserved_after_template_change`; Vitest `j10_*` |
| AC5 | J11 | every name in `j11_material_contract_amendments_require_acceptance`; Vitest `j11_*` |
| AC6 | J12 | every name in `j12_worker_and_owner_cannot_access_other_parties_private_contracts`; Vitest `j12_*`; smoke |
| AC7 | No fabricated acceptance; not-an-e-signature label; explicit classification | `w9_acceptance_cannot_be_fabricated_by_trusted_sql`, `j10_acceptance_records_version_hash_and_label_not_e_signature`, `j9_draft_requires_explicit_classification_no_default`, `w9_contractor_classification_needs_owner_and_worker_acknowledgement`, `w9_classification_options_have_no_default_and_contractor_last` |
| AC8 | Worker can always decline / terminate; C7 gate | `w9_worker_can_always_decline_even_if_shop_unverified_or_removed`, `w9_worker_can_always_terminate_with_reason`, `w9_activation_blocked_during_live_required_training`; Vitest `w9_worker_decline_and_terminate_always_available` |
| AC9 | Flags cover W8-L13, inform only, no validation claim | every name in `j9_w9_problem_term_flags`; Vitest `w9_flags_disclaimer_and_no_match_copy` |
| AC10 | Retention (W5-L10, D-32, D-35) | `j18_w9_owner_account_deletion_keeps_sent_and_accepted_contracts_for_worker`, `j18_w9_shop_deletion_keeps_contracts_and_removes_never_sent_drafts`, `j18_w9_accepted_application_snapshot_retained_after_shop_deletion`, `j18_w9_worker_account_deletion_keeps_accepted_contracts_for_owner`, `j10_owner_account_deletion_keeps_accepted_text_for_worker` |
| AC11 | Rules, audit, notifications without text | every name in `j9_w9_worker_contract_rules`, `j9_w9_worker_contract_audit`; `j12_notifications_carry_no_contract_text_pay_reasons_or_names` |
| AC12 | J17 | every name in `j17_w9_worker_contract_authorization`; Vitest `j17_worker_contract_repository_writes_only_through_rpcs`; `w9-api-smoke.mjs` ends `0 failed`; W2-W8 smokes `0 failed` |
| AC13 | J18 | every name in `j18_w9_flows`; every pre-W9 pgTAP file `ok`; `git diff --stat 81be37d -- supabase/tests/database` only new files + `001_migration_replay.test.sql`; pytest `4 passed`; stager 19 pass |
| AC14 | Frontend | every section-6 Vitest name and the existing 174 pass; lint, build exit 0; `grep -rn "service_role" frontend/src` empty; `w9_copy_never_claims_signature_validity_or_compliance` |
| AC15 | Size, safety, docs, legal | `wc -l` of every added / changed file <= 350; no `.env` read; `git diff --stat 81be37d -- backend` empty; section-7 docs exist; `grep -c "W9-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` >= 12 |
## 9. Rollback, risks and legal-review flags
Rollback: per-file `-- ROLLBACK` in reverse order j..a, local stack only: j producers (audit rows, notifications stay); i retention and retained copies (IRREVERSIBLE; export first); h reads; g, f RPCs and expiry; e rules and the commit validator; d, c records, acceptances, contracts (IRREVERSIBLE loss of every contract, snapshot and acceptance; trusted `copy` first; drop guards before tables); b reference tables; a nothing. Stager: drop the 4th helper entry. Frontend: revert. Valid only before W10 ships; W8 rollback is invalid once W9 exists (FKs).
Risks: R1 production drift (D-10 rows 38-39; w9a aborts). R2 a commit-validator bug blocks every send (rules file). R3 an audit failure aborts the action, cascades included. R4 the write flag relies on PostgREST not exposing `set_config` (smoke); a superuser or table owner can disable triggers (P47 holds for every other session). R5 keyword flags miss paraphrases, other languages and misspellings and flag harmless text; a bad seeded pattern aborts the migration (CHECK). R6 the hash covers the rendered text, not the jsonb inputs. R7 the C7 activation check reads training state without a lock. R8 `OwnerDashboardContent.tsx` is at 306 lines. R9 expiry is derived until W12 schedules `expire_worker_contracts`.
Legal (to `LEGAL_REVIEW_REGISTER.md`, all OPEN; nothing in UI or docs claims compliance):
W9-L1 whether the draft-and-acceptance record (who, when, version hash, statement text), and owner acceptance at send, is adequate evidence of consent without an e-signature provider (W0-L4, W8-L4, D-6).
W9-L2 the per-contract classification choice, labels and contractor acknowledgement; whether the contractor option should be selectable at all; misclassification risk (W0-L3, W8-L3, D-26).
W9-L3 the problem-term list and keywords (incl. Filipino terms), false negatives / positives, and whether some terms must be blocked rather than flagged (W8-L5, W8-L13, D-33).
W9-L4 showing keyword flags to the worker may be read as legal advice, or "no matches" as WashLink approval.
W9-L5 retention after owner / shop / worker deletion (D-32, D-35), name snapshots of deleted users, retained application copies (W5-L10): periods, export, erasure rights (RA 10173; W3-L1, W8-L9).
W9-L6 termination: immediate effect only; notice periods, final pay and clearance are not modelled; free-text reasons may defame or hold sensitive data; whether a worker may be required to give a reason at all.
W9-L7 the owner alone records the start (activation) after acceptance; whether the worker must confirm it.
W9-L8 owner / shop removal leaves accepted / active contracts unchanged (D-35): what the record means once a party is gone.
W9-L9 training vs productive work: the C7 gate covers only activation during live required training with the same owner; paid work without a contract (W6-L10) and off-platform work are not controlled.
W9-L10 English only (informed consent; Filipino version or translation); the text download / print is an uncertified copy, not an official or notarised document.
W9-L11 every amendment is treated as material (D-34); whether some changes need more (fresh notice) or need no consent.
W9-L12 the acknowledgement statements (`w9_owner_send_v1`, `w9_worker_accept_v1`, contractor acknowledgements) are loop-written placeholder wording.
