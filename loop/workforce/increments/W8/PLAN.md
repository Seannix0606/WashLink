# W8 - Contract templates & template versions - PLAN

Spec: E (starter template with the 15 sections, preview, customise editable clauses, shop-specific terms, reusable versions, compare with
the standard, contract safety: template marked for review, no silent independent-contractor classification, no unlawful waivers, owners
cannot edit safeguards, contents private), G, H (owner "Contract-template management"), I (audit), J9, J17, J18. Depends on W3 (`passed`,
STATE.md; HEAD dd58616, W7 passed). D-6 (OPEN, blocks W9 only) is not needed to build W8: the section-14 safeguard text follows the D-6
proposed default (draft-and-acceptance, not an e-signature) and can be replaced by a new platform version if D-6 changes. D-3 not needed.
D-10 (local proof only) and D-11 (staged 14-digit copies) apply. Not BLOCKED. Closes carry-forwards: W0 C5 (clause-level model, locked
safeguard clauses, classification with no default), W3 C-W3-1 (payload keys; template text lives only in its own immutable tables).

## 1. Scope / out of scope
In: reference tables (15 sections, placeholder allowlist, classification vocabulary with NO default); `contract_templates`,
`contract_template_versions`, `contract_template_clauses` (immutable, hashed); the platform starter template v1 seeded by migration; owner
templates derived from a platform version; a new sealed version per save; locked-clause, structure and hash rules enforced in the DB at
commit; super_admin-only platform version publishing (RPC); preview rendering and diff vs the standard (invoker reads); audit events;
owner UI (list, editor, version history, preview, compare); pgTAP J9 / J17 / J18 + rules / audit files, Vitest, w8 smoke, docs, legal register.
Out (reason): worker contracts, acceptance, snapshots, amendments, choosing a classification, problem-term flagging (W9, PLAN.md); any
worker or customer visibility (W9 sends contracts); super_admin UI for platform versions (W11 admin dashboard; DB path tested here);
notifications (owner acts on own data; W12 wiring); PDF / print export (not required by spec E); e-signature (D-6). No production apply,
no `.env`, no SQLAlchemy/Alembic tables.

## 2. Design principles (continue P1-P36)
P37. Every write to a W8 table goes through a definer RPC under the transaction-local flag `washlink.contract_template_write` = template id.
No client role (anon, authenticated, service_role) has INSERT / UPDATE / DELETE; write policies are deny-all; no trusted-session bypass for
versions or clauses (the platform seed in w8e sets the flag itself).
P38. Versions and clauses are write-once for EVERY session: UPDATE -> 42501 `Contract template versions cannot be edited.`; a clause may be
inserted only under the flag AND only in the transaction that inserted its version (`created_txid = txid_current()`), so a sealed
version can never gain, lose or change a clause. DELETE only by FK cascade after the parent template is gone.
P39. Locked clauses never come from the client. Owner RPCs accept only (a) new bodies for `editable` clauses, keyed by `clause_key`, and
(b) `shop_specific` clauses; the server copies every `locked_safeguard` clause verbatim from the base platform version. A DEFERRABLE
INITIALLY DEFERRED constraint trigger re-validates every new version at commit for every session (3.4), so trusted SQL cannot slip a
modified locked clause in either.
P40. Template text is labelled draft everywhere: `review_status` CHECK = `draft_requires_legal_review` (the only value W8 allows; changing
it needs a later migration recording a human legal review, never an RPC); every section carries the notice "Draft — requires review by a
qualified Philippine labor-law professional" (CHECK = that exact string) and the preview renders it under every section heading and as a
top banner. No string anywhere says the template is reviewed, approved, valid or compliant (only the negated `template_is_draft` sentence, plan section 4).
P41. No classification default: templates carry NO classification column at all; section 4 holds the locked placeholder
`{{worker_classification}}`, filled only by W9 from an explicit per-contract choice. `worker_classification_options` has no `is_default`
column and no row is preselected; `independent_contractor` sorts last and is flagged `needs_extra_acknowledgement`.
P42. No fabricated terms or pay: platform text contains no digits, amounts, currency, statute citations, wage figures or dates; owner
inputs are bracketed instructions until the owner writes them; pay appears only as the placeholder `{{pay_details}}` (W9 fills it with
what the owner typed, never a WashLink value).
P43. Content hashes are server-computed (`sha256`, no pgcrypto): `clause_hash` per clause and `content_hash` per version (3.4), re-checked
at commit. W9 snapshots reference version id + content_hash.
P44. Audit payloads carry ids, scope / status words and small counts only; never names, headings, bodies, keys or hashes (the W3 payload
regex forbids `clause|text|body|code` keys).

## 3. Migrations (`2026_10_26_w8<x>_<snake>.sql`, staged 20261026000009..16; each ends with `-- ROLLBACK`; each <= 350 lines)
Idempotent, `notify pgrst, 'reload schema';` last; every function `set search_path = public, pg_temp`; `revoke all ... from public, anon`
(+ `authenticated`, `service_role` for trigger / internal); client RPCs `grant execute ... to authenticated`. Table comments start `W8:`.
All W8 tables dropped from / refused in `supabase_realtime` (raise like w6d on FOR ALL TABLES). Lock order: `contract_templates` row FOR
UPDATE -> platform version rows FOR SHARE. Platform publish also takes advisory lock `contract_template_platform`.
### 3.1 `2026_10_26_w8a_contract_templates_preflight.sql` (creates nothing)
Abort naming every missing item: `profiles.{id, role, full_name}`, `workforce_audit_events.{id, action}`; functions
`record_workforce_audit_event(...)`, `current_user_profile_role()`, `is_super_admin()`, `is_trusted_db_session()`,
`is_orphaned_fk_set_null(...)`. Abort if any `public.contract_*` or `public.worker_classification_options` relation exists without a
comment starting `W8` (D-10 row 36). Rollback: nothing.
### 3.2 `2026_10_26_w8b_contract_template_reference_data.sql`
`contract_template_sections` (section_number smallint PK CHECK 1..15; title 3..160; review_notice text CHECK = the P40 string;
`owner_terms_allowed` boolean not null) seeded with the 15 spec E titles verbatim; `owner_terms_allowed = false` for 1, 4 and 14 (D-27).
`contract_template_placeholders` (placeholder_key PK `^[a-z_]{3,40}$`, preview_label 3..80): owner_full_name, worker_full_name, shop_name,
shop_address, role_title, worker_classification, start_date, end_date, schedule_summary, pay_details; labels such as "[Worker's full name -
filled in on the contract]", "[Pay as written by the shop on the contract]", "[Relationship type - chosen per contract, not preselected]".
`worker_classification_options` (classification_key PK, label, sort_order unique, `needs_extra_acknowledgement` boolean, `review_status`
CHECK = 'draft_requires_legal_review'; NO default column): employee, probationary_employee, fixed_term_employee, project_employee,
seasonal_employee, casual_employee, other_needs_review, independent_contractor (last; needs_extra_acknowledgement true). Each label ends
"(draft list - confirm with a qualified professional)". Consumed by W9 only. All three: select policy for authenticated; no client write
privilege; a guard refuses every write except from a trusted session (migrations).
### 3.3 `2026_10_26_w8c_contract_templates.sql`
`contract_templates`: id uuid PK; scope CHECK in (platform, owner); owner_id FK profiles on delete cascade, CHECK (scope = 'platform') =
(owner_id is null); unique `one_platform_template (scope) where scope = 'platform'`; name 3..120 (trimmed); status CHECK in (active,
archived) default active, platform always active (CHECK); current_version_number int not null >= 1; derived_from_version_id FK
contract_template_versions on delete set null (lineage only); created_at, updated_at. Index (owner_id, status).
`contract_template_versions`: id uuid PK; template_id FK contract_templates on delete cascade; version_number int >= 1, unique
(template_id, version_number); base_platform_version_id FK contract_template_versions on delete restrict, null exactly for platform-scope
versions (trigger: the base must be a platform version); review_status CHECK = 'draft_requires_legal_review'; content_hash CHECK
`^[0-9a-f]{64}$`; edited_count, added_count smallint >= 0 (0 for platform); saved_by FK profiles on delete set null; saved_by_role CHECK
in (owner, super_admin, trusted_session); created_txid bigint not null default txid_current(); created_at = now() (forced). Index
(base_platform_version_id).
`contract_template_clauses`: id uuid PK; version_id FK versions on delete cascade; section_number FK contract_template_sections; position
smallint 1..99, unique (version_id, section_number, position); clause_key `^[a-z][a-z0-9_]{2,59}$`, null only for shop_specific, unique
(version_id, clause_key); kind CHECK in (locked_safeguard, editable, shop_specific); heading 3..160; body 1..4000 (normaliser: trim, CRLF
-> LF, no control characters except newline and tab); source_clause_id FK clauses on delete restrict (the platform clause it copies or
edits; null for shop_specific and for platform clauses); requires_owner_input boolean (platform editable placeholders); clause_hash CHECK
`^[0-9a-f]{64}$`.
Guards (BEFORE, every session): inserts only under the flag (42501 `Contract templates are changed only through WashLink.`); P38 clause
rule; version / clause UPDATE -> 42501; template UPDATE only of name, status, current_version_number, updated_at under the flag, or an FK
set-null (`is_orphaned_fk_set_null`); template DELETE only when the owner profile is gone (cascade), platform never; version / clause
DELETE only when the parent row is gone. RLS (select): platform-scope rows (and their versions / clauses) for role owner or super_admin;
owner-scope rows for `owner_id = auth.uid()` with role owner only (no super_admin, worker, customer or anon); deny-all writes.
### 3.4 `2026_10_26_w8d_contract_template_rules.sql` (internal unless stated)
`contract_template_clause_hash(section, position, key, kind, heading, body)` immutable = sha256 hex of the jsonb object text.
`contract_template_version_hash(p_version_id)` = sha256 hex of jsonb {format 'washlink_contract_template_v1', review_status,
base_content_hash (null for platform), clause_hashes [ordered by section, position]}.
`contract_template_core_safeguard_keys()` = the 11 locked keys marked (core) in plan section 4; every platform version must keep each as
`locked_safeguard` (super_admin cannot drop or downgrade them; only a migration can).
`contract_template_placeholders_in(text) returns text[]`; an unknown `{{x}}` or malformed braces -> 23514 `Unknown placeholder {{x}}.`
`validate_contract_template_version(p_version_id)` (raises 23514 naming the first broken rule): every section 1..15 has >= 1 clause;
positions contiguous; every stored clause_hash and the content_hash recompute equal; placeholders allowlisted; owner text never contains
"WashLink safeguard" (case-insensitive: owners cannot impersonate a locked clause); total body length <= 120000. Platform: every core key
present and locked, section 4 has a locked clause containing `{{worker_classification}}`, no shop_specific. Owner: for EVERY clause of
the base platform version exactly one clause with the same key, kind, section, position, heading and source_clause_id; locked ones also
with identical body and clause_hash; editable bodies non-empty; no locked or editable clause without a base source; shop_specific only in
sections with `owner_terms_allowed`, after that section's platform clauses, <= 40 per version, heading 3..160, body 10..4000;
edited_count / added_count match. Constraint trigger `contract_template_versions_validate_at_commit` AFTER INSERT DEFERRABLE INITIALLY
DEFERRED on versions calls it for every session.
`render_contract_template_clause(p_body text, p_values jsonb default null)` immutable: replaces each `{{key}}` with the value from
`p_values` or, when absent, the preview label (W9 calls it with real values and refuses unfilled keys).
### 3.5 `2026_10_26_w8e_platform_starter_contract_template.sql`
Inserts the platform template ("WashLink standard worker agreement - draft"), version 1 (saved_by_role trusted_session, flag set) and its
clauses per plan section 4, in one transaction so the commit validator runs. Rollback: delete the platform rows (refused while owner templates
reference them; then roll back w8c instead).
### 3.6 `2026_10_26_w8f_contract_template_rpcs.sql` (client RPCs, authenticated)
`create_owner_contract_template(p_name text, p_from_version_id uuid default null) returns contract_templates`: role owner else 42501 `Only
shop owners can create contract templates.`; <= 25 active templates per owner else 23514 `You can keep up to 25 active templates. Archive
one first.`; from null -> copy of the LATEST platform version verbatim (v1, edited 0, added 0); from an own version (any template of the
caller) -> its editable bodies and shop terms on that version's base, locked clauses re-copied from the base; a foreign id -> 42501
`Contract template not found.` No shop verification needed (D-29).
`save_owner_contract_template_version(p_template_id uuid, p_expected_version_number int, p_base_platform_version_id uuid,
p_editable_bodies jsonb, p_shop_terms jsonb) returns contract_template_versions`. Checks in order: caller owns an owner-scope template
(role owner) else 42501 `Contract template not found.`; status active else 23514 `Archived templates cannot be changed. Restore it first.`;
current version = expected else 55000 `This template changed. Reload it and try again.`; base = the current version's base or the latest
platform version (never older) else 23514 `Use the current standard template version.`; `p_editable_bodies` is an object of base
editable keys -> text (a locked key -> 23514 `This clause is a WashLink safeguard and cannot be changed.`; an unknown key -> 22023
`Unknown clause.`; a missing key keeps the CURRENT version's body when the key exists there, else the base body); `p_shop_terms` is an
array of {section_number, heading, body} in order; <= 200 versions per template else 23514; a content_hash equal to the current version
-> 23514 `Nothing changed since the last version.` Inserts version n+1 (edited_count = editable bodies differing from the base;
added_count = shop terms) and its clauses; sets current_version_number. Previous versions are untouched.
`rename_owner_contract_template(p_template_id, p_name)` and `set_owner_contract_template_status(p_template_id, p_from_status, p_to_status)`
(active <-> archived; stale -> 55000; same -> 23514; restore respects the 25 limit): the template owner only.
`publish_platform_contract_template_version(p_expected_version_number int, p_clauses jsonb) returns contract_template_versions`:
super_admin only else 42501 `Only WashLink administrators can change the standard template.`; stale -> 55000; full clause list
{section_number, clause_key, kind (locked_safeguard / editable), heading, body, requires_owner_input}; platform validator rules. Existing
owner versions keep their old base (P38); owners rebase on their next save.
### 3.7 `2026_10_26_w8g_contract_template_reads.sql` (SECURITY INVOKER: RLS decides; granted to authenticated)
`owner_contract_templates()` (own templates: name, status, current version number, last saved, base platform version number,
`newer_standard_available`); `platform_contract_template_current()` (latest platform version id, number, hash);
`contract_template_version_history(p_template_id)` (number, created_at, content_hash, base version number, edited / added counts,
saved_by_role); `contract_template_version_clauses(p_version_id)` (ordered clauses with section title and review notice);
`preview_contract_template_version(p_version_id)` (same rows plus `rendered_body` = `render_contract_template_clause(body, null)`);
`contract_template_version_diff(p_version_id)` (one row per base clause and shop term: section_number, section_title, clause_key, kind,
change `unchanged` / `edited` / `added_by_shop`, standard_heading, standard_body, version_body; all `unchanged` for a platform version).
A foreign or unknown id returns 0 rows (no existence oracle).
### 3.8 `2026_10_26_w8h_contract_template_audit.sql`
AFTER INSERT / UPDATE / DELETE producer on `contract_templates` and AFTER INSERT on versions (definer, pinned, revoked). subject_type
`contract_template`, subject_id template id, subject_profile_id owner_id (null for platform). Actions: `contract_template.created`
(scope, version_number, changed_by), `.version_saved` (scope, version_number, base_platform_version_number, edited_count, added_count,
changed_by owner / super_admin / trusted_session), `.renamed` (no name), `.status_changed` (from_status, to_status), `.deleted`
(deleted_by `owner_account_deleted` / `trusted_session`). No notifications (D-30). Refused actions write nothing.

## 4. Platform starter template v1 (structural placeholder content; every section shows the P40 notice)
Rules for the db engineer: plain sentences in exactly the meaning given below (gist, not final wording); no digits, currency, statute
numbers, amounts or dates; no "compliant / approved / valid / reviewed" except the negated sentence in `template_is_draft`; editable
bodies are bracketed instructions `[Shop: ...]` with `requires_owner_input = true`. (core) = in `contract_template_core_safeguard_keys()`.
| Sec | Title (spec E, verbatim) | Locked safeguard clauses | Editable clauses |
|---|---|---|---|
| 1 | Parties and verified identities | `parties_named`: the parties are {{owner_full_name}} for {{shop_name}} and {{worker_full_name}}; names come from WashLink accounts; WashLink records the shop's verification status, does not verify the worker's identity, and this document does not re-check identities | `parties_additional_details`: [Shop: other party details both parties agree to include, or "None".] |
| 2 | Car wash business and work location | - | `business_and_location`: [Shop: the business and where the work happens: {{shop_name}}, {{shop_address}}.] |
| 3 | Role, responsibilities, and scope of work | - | `role_and_duties`: [Shop: the role {{role_title}}, duties and scope of work.] |
| 4 | Contract type and legal classification | `classification_not_preselected` (core): the relationship type is {{worker_classification}}; it is chosen for each contract, not preselected by WashLink or this template, and should be confirmed with a qualified professional | `classification_reasons`: [Optional: why the parties chose this type, or "None".] |
| 5 | Start date, duration, and renewal terms | - | `start_duration_renewal`: [Shop: start {{start_date}}, end or duration {{end_date}}, renewal terms.] |
| 6 | Work schedule and availability | - | `schedule`: [Shop: working days and hours {{schedule_summary}}; how availability is agreed.] |
| 7 | Compensation, payment frequency, and lawful deductions, if any | `no_training_fee_or_deduction` (core): the worker is not charged, and nothing is deducted from pay, for the required initial training; `deductions_listed_only` (core): only deductions listed in this section are part of this draft, and whether a listed deduction is allowed needs legal review | `pay_terms`: [Shop: pay as agreed {{pay_details}} and payment frequency. WashLink does not fill in, suggest or check pay.]; `listed_deductions`: [Shop: list each deduction, or "None".] |
| 8 | Training requirements, the minimum three-day training process, and certification conditions | `required_training_free_and_supervised` (core): required initial training is at least three days of supervised learning, free to the worker, and is not productive work for customers; `certification_shop_issued` (core): a certification is shop-issued, not a government-recognized credential | `training_details`: [Shop: training plan, schedule and certification conditions.] |
| 9 | Worker and owner obligations | - | `worker_obligations`, `owner_obligations`: [Shop: list the obligations.] |
| 10 | Occupational safety, protective equipment, and workplace rules | `safety_terms_need_review`: safety rules, protective equipment and instruction for chemicals and equipment must be described here and need review by a qualified professional | `safety_and_workplace_rules`: [Shop: safety rules, equipment provided, workplace rules.] |
| 11 | Customer privacy, confidential information, and responsible data handling | `customer_data_minimum`: customer information seen during work is used only to perform the service and is not copied, kept or shared for anything else | `confidentiality_terms`: [Shop: other confidentiality terms, or "None".] |
| 12 | Leave, absences, termination, notice, and dispute resolution as applicable | `right_to_decline_or_leave` (core): nothing here stops the worker from declining the offer or ending the relationship as the law allows; a WashLink goal of working with several shops is not a condition of this agreement | `leave_and_absences`, `termination_and_notice`, `dispute_resolution`: [Shop: describe.] |
| 13 | Applicable statutory benefits, contributions, and other mandatory rights when legally required | `no_waiver_of_mandatory_rights` (core): this document does not waive or reduce any right, benefit or contribution the law gives the worker; such rights apply even if not listed | `benefits_listed`: [Shop: benefits and contributions provided; a qualified professional should confirm what is required.] |
| 14 | Acknowledgment, acceptance, signatures, and dated copies | `acceptance_record_not_e_signature` (core): acceptance on WashLink records who accepted which version and when; it is a draft-and-acceptance record, not an electronic signature, and WashLink does not state that it meets any signature requirement; `changes_need_new_version_and_consent` (core): after acceptance any change creates a new version that the parties must accept before it applies, and each party can view the accepted version and its date on WashLink; `template_is_draft` (core): this template is a draft, has not been reviewed by a qualified Philippine labor-law professional, and WashLink does not state that it is legally compliant | - |
| 15 | Attachments or shop-specific terms | `safeguards_prevail` (core): shop-specific terms and attachments cannot change or override WashLink safeguard clauses; if they conflict, the safeguard clause applies | `attachments_list`: [Shop: list attachments, or "None".] |
Shop-specific terms are allowed in sections 2, 3, 5-13 and 15 (not 1, 4, 14). The core keys: classification_not_preselected,
no_training_fee_or_deduction, deductions_listed_only, required_training_free_and_supervised, certification_shop_issued,
right_to_decline_or_leave, no_waiver_of_mandatory_rights, acceptance_record_not_e_signature, changes_need_new_version_and_consent,
template_is_draft, safeguards_prevail (11 keys).

## 5. State machines
| Object | From | To | Who | How / condition |
|---|---|---|---|---|
| owner template | (none) | active, v1 | owner (role owner) | `create_owner_contract_template`; <= 25 active |
| owner template | active | active, v n+1 | the template owner | `save_owner_contract_template_version`; expected version; content changed; base current or latest |
| owner template | active | archived | the template owner | `set_owner_contract_template_status`; versions kept |
| owner template | archived | active | the template owner | same; <= 25 active |
| owner template | any | deleted | nobody directly | only by cascade when the owner account is deleted (audit `deleted`) |
| platform template | v n | v n+1 | super_admin | `publish_platform_contract_template_version`; core keys stay locked; review_status stays draft |
| version | (none) | sealed | the RPCs above, the w8e seed | version + clauses in one transaction, validated at commit, then immutable (P38) |
Everything else is refused: worker, customer, anon, another owner, super_admin on owner templates, an owner on the platform template,
any UPDATE or direct DELETE of a version or clause, archiving the platform template.

## 6. Decisions taken in this plan (RECORD adds to DECISIONS.md as ADOPTED-DEFAULT (loop, 2026-10-26))
D-26 Templates carry no classification; W9 contracts require an explicit choice from `worker_classification_options` (NOT NULL, no
default); `independent_contractor` is last and needs an extra acknowledgement in W9.
D-27 Owners edit only the bodies of editable clauses and add shop-specific terms (not in sections 1, 4, 14); headings, sections and
locked clauses are platform-controlled.
D-28 Platform versions only by super_admin through the RPC; `review_status` stays `draft_requires_legal_review` until a human-run
migration records a legal review.
D-29 Owner templates need no shop verification (W9 gates sending) and are archived, never deleted, except by account deletion.
D-30 No notifications in W8; the owner list shows "A newer standard template is available" from live state.

## 7. Tests (pgTAP `plan(n)` = actual; 0 `todo_start(`; each file <= 350 lines)
Helpers in NEW `scripts/supabase-test/baseline/test_helpers_contract_templates.sql`: `test_helpers.create_test_contract_template(p_owner_email,
p_name) returns uuid`, `test_helpers.save_test_template_version(p_template, p_owner_email, p_editable jsonb, p_terms jsonb) returns uuid`
(real RPCs as the owner) and `test_helpers.latest_platform_contract_version() returns uuid`. The stager `sql_paths` gains the third path
(the existing `stager_seeds_every_helper_file_in_order` covers it; still 19 pass).
`j9_owner_can_customize_contract_draft_and_save_reusable_template_version.test.sql` (J9, spec wording; W9 extends it with the
worker-contract-draft leg): j9_owner_starts_draft_template_from_platform_standard, j9_starter_has_all_fifteen_sections_in_spec_order,
j9_every_section_marked_draft_requires_labor_law_review, j9_owner_customizes_editable_clause_bodies, j9_owner_adds_shop_specific_terms,
j9_save_creates_new_version_and_keeps_previous_unchanged, j9_each_version_has_server_computed_content_hash, j9_identical_save_refused,
j9_stale_save_rejected, j9_saved_version_reusable_as_start_of_new_template, j9_saved_version_listed_in_history_with_base_standard,
j9_preview_renders_placeholders_as_labels_with_draft_notice, j9_diff_marks_unchanged_edited_and_added_by_shop,
j9_locked_safeguard_clause_cannot_be_edited_through_rpc, j9_classification_not_preselected_in_template.
`j9_w8_contract_template_rules.test.sql`: w8_trusted_insert_without_flag_refused, w8_versions_and_clauses_immutable_for_every_session,
w8_clause_cannot_be_added_to_sealed_version, w8_commit_validator_rejects_altered_locked_clause_even_for_trusted_sql,
w8_commit_validator_rejects_missing_section_or_base_clause, w8_commit_validator_rejects_forged_hash, w8_shop_terms_refused_in_sections_1_4_14,
w8_unknown_placeholder_refused, w8_owner_text_cannot_impersonate_safeguard, w8_size_and_count_limits, w8_archived_template_cannot_be_saved,
w8_active_template_limit, w8_rebase_to_latest_standard_keeps_edits_by_key, w8_older_base_refused,
w8_super_admin_publishes_platform_version_existing_owner_versions_unchanged, w8_platform_version_must_keep_core_safeguards_locked,
w8_review_status_only_draft_value, w8_classification_options_have_no_default_and_contractor_last,
w8_starter_text_has_no_digits_amounts_or_compliance_claims (scans every platform clause heading and body and every section title;
only the negated `template_is_draft` sentence may match `complian|approved|valid|reviewed`),
w8_platform_template_never_deleted.
`j9_w8_contract_template_audit.test.sql`: w8_audit_written_for_create_save_rename_status_publish_and_delete,
w8_audit_payload_has_no_names_headings_bodies_or_hashes, w8_refused_action_writes_nothing, w8_no_notifications_enqueued.
`j17_w8_contract_template_authorization.test.sql` (J17): j17_w8_tables_rls_enabled_and_no_client_write_privileges,
j17_owner_reads_only_own_templates_and_the_platform_standard, j17_other_owner_cannot_read_or_save_foreign_template,
j17_worker_reads_no_contract_template_rows_including_platform, j17_customer_and_anon_read_no_contract_template_rows,
j17_super_admin_reads_platform_but_not_owner_templates, j17_owner_cannot_publish_platform_version, j17_reads_return_nothing_for_foreign_ids,
j17_w8_internal_functions_not_client_executable, j17_w8_rpcs_denied_to_anon, j17_w8_definer_functions_pin_pg_temp_last,
j17_w8_tables_not_in_realtime_publication, j17_w8_no_fee_or_pay_amount_columns.
`j18_w8_flows.test.sql` (J18): j18_w8_owner_account_deletion_cascades_templates_and_keeps_audit, j18_w8_platform_template_survives_owner_deletion,
j18_w8_booking_quote_rating_and_verification_unchanged, j18_w8_job_opening_training_and_certification_flows_unchanged.
Changed existing file (only this): `001_migration_replay.test.sql` (52 migrations; + 20261026000009..16; renamed
`replay_schema_migrations_has_baseline_w2_to_w8`; add `replay_w8_contract_template_tables_rls_enabled`). Every other file unchanged and green.
Smoke `scripts/supabase-test/w8-api-smoke.mjs` (W7 rules: loopback, keys from `supabase status` in memory, synthetic `smoke8-*@local.test`
users deleted, no `.env`, no time shift): anon / worker / customer read 0 rows of the three template tables (platform included); owner
reads platform v1; direct insert / patch / delete denied for owner, worker, service_role; create from standard; save v2 with an edited
body and a section-15 shop term (hash differs, v1 unchanged); a locked key in edits 23514; unknown placeholder 23514; section-4 shop term
23514; stale 55000; another owner and super_admin read nothing of it; owner publish denied; super_admin publishes platform v2; the owner
sees `newer_standard_available` and rebases; preview carries the notice on 15 sections; diff rows; archive / restore; `set_config` not
exposed; owner `deleteUser` removes the templates and keeps the audit rows. Must end `0 failed`.
Vitest (mocked; suffixes `.j9`, `.j17`, `.w8`): j9_editor_shows_locked_clauses_read_only, j9_editor_edits_only_editable_bodies,
j9_add_shop_term_only_in_allowed_sections, j9_save_payload_never_contains_locked_clauses, j9_save_creates_version_and_refreshes_history,
j9_preview_shows_draft_banner_and_section_notices, j9_diff_view_highlights_edited_and_added,
j17_contract_template_repository_writes_only_through_rpcs, w8_placeholder_validation_matches_allowlist, w8_clause_text_diff_word_level,
w8_stale_template_error_reloads, w8_template_list_loading_empty_error_states, w8_newer_standard_banner_and_rebase,
w8_archived_template_read_only, w8_copy_never_claims_review_or_compliance (scans every copy constant),
w8_contract_template_error_messages_mapped. The existing 157 stay green unchanged.

## 8. Frontend (UI -> hooks -> services -> repositories -> Supabase; each file <= 350 lines)
Add: `domain/models/ContractTemplate.ts` (template, version, clause, kind, section, placeholder, diff row, classification option);
`domain/repositories/ContractTemplateRepository.ts`; `domain/utilities/{contractTemplateDraft.ts (editor state from the current version;
builds only `{editableBodies, shopTerms}`), clauseTextDiff.ts (word-level LCS, no library), contractTemplatePlaceholders.ts}`;
`infrastructure/supabase/supabaseContractTemplateRows.ts`; `infrastructure/repositories/{SupabaseContractTemplateRepository.ts (invoker
reads), SupabaseContractTemplateActionRepository.ts (RPCs only, `toUserFacingError`)}`; `application/validation/contractTemplateSchemas.ts`
(zod: name 3..120, editable body 1..4000, shop term heading 3..160 / body 10..4000, <= 40 terms, allowlisted placeholders);
`application/services/ContractTemplateService.ts`; `presentation/utilities/{contractTemplateCopy.ts (banner "Draft — requires review by a
qualified Philippine labor-law professional"; kind labels "WashLink safeguard - cannot be changed", "Editable", "Shop-specific term";
"WashLink does not state that this template is legally compliant."), contractTemplateDisplay.ts}`;
`presentation/dependencyInjection/createContractTemplateDependencies.ts`; hooks `useOwnerContractTemplates`, `useContractTemplateEditor`,
`useContractTemplateVersionHistory`, `useContractTemplatePreview`, `useContractTemplateDiff`.
Components: shared `components/contracts/DraftLegalReviewBanner.tsx`; owner `components/owner/contractTemplates/{OwnerContractTemplatesPanel
(list, status filter, "New from standard", "Newer standard available" badge, empty state), ContractTemplateEditor (per section; locked
clauses read-only with a lock badge; textareas for editable bodies; placeholder help; save with the expected version),
ContractTemplateSectionEditor, ShopSpecificTermForm, ContractTemplateVersionHistory (number, saved at, short hash, base standard version,
counts; Preview, Compare with standard, Start a new template from this version), ContractTemplatePreview (top banner + per-section notice;
placeholder labels), ContractTemplateDiffView, ContractTemplateNameModal}`.
Change: `owner/OwnerDashboardContent.tsx` (lazy "Contract templates" tab); `infrastructure/supabase/supabaseErrorMessages.ts` (every
section-3 message).

## 9. Docs
Add `docs/workforce/CONTRACT_TEMPLATES.md` (P37-P44, tables, clause model, starter sections, state machine, hashes, validator, reads, W9
hand-off, limitations, rollback). Update `AUDIT_AND_NOTIFICATIONS.md` (3.8); `ROLE_AND_PROFILE_SECURITY.md` (guard matrix; D-10 rows 36 no
pre-existing contract objects, 37 w8a items); `LOCAL_TEST_HARNESS.md` (52 migrations, third helper file, W8 smoke); `LEGAL_REVIEW_REGISTER.md`
(W8-L1..L9 OPEN; notes on W0-L3, W0-L4, W4-L8, W6-L11, all still OPEN). RECORD adds the W8 smoke row to LOOP.md and D-26..D-30 to DECISIONS.md.
W9 hand-off: a contract version stores template_version_id (FK on delete set null, so owner deletion never removes contract records),
content_hash, base platform version id + hash and its own rendered text; it renders with `render_contract_template_clause(body, values)`
and refuses unfilled placeholders; it requires an explicit classification (D-26); diff vs standard = `contract_template_version_diff` rows
plus contract-level edits; problem-term flagging runs on editable and shop text there.

## 10. Check commands (repo root, local only)
`cd frontend && npm run lint`, `npm run build`, `npm test`; `backend/.venv/Scripts/python.exe -m pytest -q`;
`node --test scripts/supabase-test/stage-local-workdir.test.mjs`; `node scripts/supabase-test/run-db-tests.mjs`; then `w2-` .. `w8-api-smoke.mjs`;
stop with `--workdir .local-supabase-test --no-backup`. Never `--linked`, `--db-url`, `db push`.

## 11. Acceptance criteria
| AC | Criterion | Evidence |
|---|---|---|
| AC1 | 8 new migrations `2026_10_26_w8[a-h]_<snake>.sql`, each with `-- ROLLBACK`; no committed migration changed | `ls supabase/migrations/2026_10_26_w8*`; `grep -L -- "-- ROLLBACK" supabase/migrations/2026_10_26_w8*` empty; `git diff --name-status dd58616 -- supabase/migrations` only `A` |
| AC2 | Clean replay of 52 migrations; suite PASS; 0 TODO | runner `Result: PASS`; `replay_schema_migrations_has_baseline_w2_to_w8`, `replay_w8_contract_template_tables_rls_enabled`; `grep -c "todo_start(" supabase/tests/database/*.sql` all 0 |
| AC3 | J9: customise a draft from the standard, save reusable immutable hashed versions, preview, diff | every `j9_*` name in the J9 file; Vitest `j9_*` |
| AC4 | Locked safeguards enforced in the DB for owners and trusted SQL; core keys kept by super_admin | `j9_locked_safeguard_clause_cannot_be_edited_through_rpc`, `w8_commit_validator_rejects_altered_locked_clause_even_for_trusted_sql`, `w8_platform_version_must_keep_core_safeguards_locked`, `w8_clause_cannot_be_added_to_sealed_version` |
| AC5 | 15 spec sections, each with the draft notice; no amounts, digits or compliance claims; no classification default | `j9_starter_has_all_fifteen_sections_in_spec_order`, `j9_every_section_marked_draft_requires_labor_law_review`, `w8_starter_text_has_no_digits_amounts_or_compliance_claims`, `w8_classification_options_have_no_default_and_contractor_last`, `j9_classification_not_preselected_in_template`, `w8_review_status_only_draft_value` |
| AC6 | Every other plan-section-7 rule | every `w8_*` name in `j9_w8_contract_template_rules` |
| AC7 | Audit without content; no notifications | every name in `j9_w8_contract_template_audit` |
| AC8 | J17: owners see own + standard; workers, customers, anon see nothing; super_admin platform only | every name in `j17_w8_contract_template_authorization`; Vitest `j17_contract_template_repository_writes_only_through_rpcs`; `w8-api-smoke.mjs` ends `0 failed`; W2-W7 smokes still `0 failed` |
| AC9 | J18 regression | every name in `j18_w8_flows`; every pre-W8 pgTAP file `ok`; `git diff --stat dd58616 -- supabase/tests/database` only new files plus `001_migration_replay.test.sql`; pytest `4 passed`; stager 19 pass |
| AC10 | Frontend | every plan-section-7 Vitest name and the existing 157 pass; lint and build exit 0; `grep -rn "service_role" frontend/src` empty; `w8_copy_never_claims_review_or_compliance` |
| AC11 | Size, safety, docs, legal | `wc -l` of every added / changed file <= 350; no `.env` read; `git diff --stat dd58616 -- backend` empty; section 9 docs exist; `grep -c "W8-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` >= 9 |

## 12. Rollback
Per-file `-- ROLLBACK` blocks in reverse order h..a, local stack only. h: producers (audit rows stay). g: reads. f: RPCs. e: delete the
platform v1 rows (refused while owner templates reference them; then roll back c). d: rules and the commit validator. c: the three
template tables (IRREVERSIBLE loss of owner templates; export with a trusted `copy` first). b: reference tables. a: nothing. Stager:
revert the third `sql_paths` entry. Frontend: revert. Only valid before W9 ships (W9 FKs point at W8 tables).

## 13. Risks and legal-review flags
R1 (D-10 rows 36-37) production drift; w8a aborts on missing objects. R2 the commit validator runs on every version insert; a bug in it
blocks all saves (covered by the rules file). R3 an audit failure aborts the save. R4 the write flag relies on PostgREST not exposing
`set_config`; trusted SQL can set it but still meets the commit validator (not tamper-proof against a superuser or table owner). R5 owner
account deletion removes the owner's templates (W9 snapshots must be self-contained). R6 editable and shop text is free text: waivers,
fees, deposits or penalties can be typed; W8 adds only the `safeguards_prevail` and `no_waiver_of_mandatory_rights` clauses, keyword
flagging is W9. R7 the jsonb text form is the hash canonical form; a Postgres change to jsonb output would change new hashes only (stored
hashes stay, the validator compares within one server version).
Legal (to `LEGAL_REVIEW_REGISTER.md`, all OPEN; no compliance claim in UI or docs):
W8-L1 the whole starter template (structure, section titles, every locked sentence) needs review before any production use.
W8-L2 the locked safeguard sentences (no training fee or deduction, listed deductions only, free supervised training, non-waiver, right to
decline or leave, customer-data rule, safeguards prevail) may themselves be inaccurate or insufficient.
W8-L3 the classification vocabulary, labels and order, and whether `independent_contractor` should be selectable at all (W0-L3).
W8-L4 section-14 acceptance wording without an e-signature provider (W0-L4; D-6 OPEN).
W8-L5 owner free text in editable clauses and shop terms is unfiltered (W4-L8, W6-L11): unlawful waivers or fees can be written and will
appear in W9 drafts.
W8-L6 whether a "safeguards prevail" precedence clause is effective.
W8-L7 the safety section only asks for content (W6-L7).
W8-L8 the statutory-benefits section lists nothing and relies on the non-waiver sentence.
W8-L9 retention of templates and audit rows after owner deletion (W3-L1).
