# Contract templates and template versions (W8)

Spec E, H (owner "Contract-template management"), I. Migrations `supabase/migrations/2026_10_26_w8a..w8h_*.sql`
(staged `20261026000009..16`). Local proof only (D-10): nothing here was applied to a linked or production project.

**The starter template is a draft.** It is structural placeholder content written by the loop, not legal
advice, and it has not been reviewed by a qualified Philippine labor-law professional. Every section shows
"Draft — requires review by a qualified Philippine labor-law professional". WashLink does not state that any
template is legally compliant. Legal review items: `LEGAL_REVIEW_REGISTER.md` W8-L1..L13 (all OPEN).

## Principles (continue P1-P36)

- **P37** Every write to a W8 table goes through a definer RPC (or the w8e seed) under the transaction-local flag
  `washlink.contract_template_write` = template id. No client role (anon, authenticated, service_role) has
  INSERT / UPDATE / DELETE; write policies are deny-all; no trusted-session bypass for versions or clauses.
- **P38** Versions and clauses are write-once for every session (UPDATE -> 42501 `Contract template versions
  cannot be edited.`). A clause may be inserted only under the flag and only in the transaction that inserted
  its version (`created_txid = txid_current()`), so a sealed version can never gain, lose or change a clause.
  DELETE only by FK cascade once the parent is gone.
- **P39** Locked clauses never come from the client. Owner RPCs accept only new bodies for `editable` clauses
  (by `clause_key`) and `shop_specific` terms; the server copies every `locked_safeguard` clause verbatim from
  the base platform version. A DEFERRABLE INITIALLY DEFERRED constraint trigger re-validates every new version
  at commit for every session, so trusted SQL cannot slip a modified locked clause in either.
- **P40** Draft everywhere: `review_status` CHECK = `draft_requires_legal_review` (changing it needs a later,
  human-run migration recording a legal review, never an RPC, D-28); every section carries the notice (CHECK);
  the preview returns it on every row for the top banner and each section heading.
- **P41** No classification default (D-26): templates have no classification column. Section 4 holds the locked
  placeholder `{{worker_classification}}`, filled only by W9 from an explicit per-contract choice.
  `worker_classification_options` has no default column and no preselected row; `independent_contractor` sorts
  last and is flagged `needs_extra_acknowledgement`.
- **P42** No fabricated terms or pay: platform text holds no digits (enforced for every platform version),
  amounts, currency, statute citations, wage figures or dates; editable bodies are bracketed `[Shop: ...]`
  instructions (`requires_owner_input`); pay appears only as `{{pay_details}}`.
- **P43** Hashes are server-computed with the built-in `sha256` (no pgcrypto): `clause_hash` per clause (set by
  the clause guard) and `content_hash` per version, both re-checked by the validator. W9 snapshots reference
  version id + `content_hash`.
- **P44** Audit payloads carry ids, scope / status words and small counts only (`AUDIT_AND_NOTIFICATIONS.md`).

## Tables

| Table | Key columns | Notes |
|---|---|---|
| `contract_template_sections` | `section_number` 1..15, `title`, `review_notice`, `owner_terms_allowed` | spec E titles verbatim; shop terms not allowed in 1, 4, 14 (D-27) |
| `contract_template_placeholders` | `placeholder_key`, `preview_label` | allowlist: owner_full_name, worker_full_name, shop_name, shop_address, role_title, worker_classification, start_date, end_date, schedule_summary, pay_details |
| `worker_classification_options` | `classification_key`, `label`, `sort_order`, `needs_extra_acknowledgement`, `review_status` | draft vocabulary for W9 only; no default |
| `contract_templates` | `scope` (platform / owner), `owner_id` (cascade), `name` 3..120, `status` (active / archived; platform always active), `current_version_number`, `derived_from_version_id` (set null, lineage) | exactly one platform row |
| `contract_template_versions` | `template_id` (cascade), `version_number` (n+1), `base_platform_version_id` (restrict; null only for platform), `review_status`, `content_hash`, `edited_count`, `added_count`, `saved_by` (set null), `saved_by_role`, `created_txid` | immutable |
| `contract_template_clauses` | `version_id` (cascade), `section_number`, `position` 1..99, `clause_key` (null only for shop terms), `kind`, `heading` 3..160, `body` 1..4000, `source_clause_id` (restrict), `requires_owner_input`, `clause_hash` | immutable; bodies trimmed, CRLF -> LF, no control characters except newline and tab |

RLS (select only): reference tables for any signed-in user; platform template rows (and their versions and
clauses) for role owner or super_admin; owner rows for `owner_id = auth.uid()` with role owner only (no
super_admin, worker, customer or anon). Versions and clauses follow their template through the caller's own RLS.
No W8 table is in `supabase_realtime`.

## Clause model and the starter template (platform v1, w8e)

Kinds: `locked_safeguard` (platform-controlled, copied verbatim), `editable` (owner edits the body only;
heading, section and position stay), `shop_specific` (owner-added term; sections 2, 3, 5-13, 15; after that
section's standard clauses; at most 40 per version).

| Sec | Locked safeguard clauses ((core) = `contract_template_core_safeguard_keys()`) | Editable clauses |
|---|---|---|
| 1 | `parties_named` (core) | `parties_additional_details` |
| 2 | - | `business_and_location` |
| 3 | - | `role_and_duties` |
| 4 | `classification_not_preselected` (core), `classification_reasons` (core) | - (section 4 holds only locked clauses) |
| 5 | - | `start_duration_renewal` |
| 6 | - | `schedule` |
| 7 | `no_training_fee_or_deduction` (core), `deductions_listed_only` (core) | `pay_terms`, `listed_deductions` |
| 8 | `required_training_free_and_supervised` (core), `training_pay_or_reimbursement`, `certification_shop_issued` (core) | `training_details` |
| 9 | - | `worker_obligations`, `owner_obligations` |
| 10 | `safety_terms_need_review` (core) | `safety_and_workplace_rules` |
| 11 | `customer_data_minimum` (core) | `confidentiality_terms` |
| 12 | `right_to_decline_or_leave` (core) | `leave_and_absences`, `termination_and_notice`, `dispute_resolution` |
| 13 | `no_waiver_of_mandatory_rights` (core) | `benefits_listed` |
| 14 | `acceptance_record_not_e_signature` (core), `changes_need_new_version_and_consent` (core), `template_is_draft` (core) | - |
| 15 | `safeguards_prevail` (core) | `attachments_list` |

33 clauses (16 locked, 17 editable); 15 core keys, each pinned to its section by
`contract_template_core_safeguards()` (review polish: W8-L10 adds `parties_named`, `safety_terms_need_review`,
`customer_data_minimum`; W8-L12 makes `classification_reasons` a locked core clause saying the relationship type is
set only by the per-contract choice; W8-L11 adds the locked, neutral `training_pay_or_reimbursement`: the shop may
offer pay for training time or reimbursement of training costs as written in the contract, no amounts, no legal
claim; `safeguards_prevail` now covers shop-specific terms, attachments and any clause text the shop writes or
edits). The section-14 wording follows the D-6 proposed default (draft-and-acceptance, not an e-signature); if D-6
changes, a super_admin publishes a new platform version.

Placeholders `{{worker_classification}}`, `{{owner_full_name}}` and `{{worker_full_name}}` are locked-only by
design: they may appear only in `locked_safeguard` clauses (platform and owner versions). The other placeholders
may appear in editable and shop text.

## State machine

| Object | From | To | Who | How |
|---|---|---|---|---|
| owner template | (none) | active, v1 | role owner | `create_owner_contract_template`; <= 25 active |
| owner template | active | active, v n+1 | the template owner | `save_owner_contract_template_version`; expected version; content changed; base = current base or latest standard |
| owner template | active <-> archived | | the template owner | `set_owner_contract_template_status`; restore respects the 25 limit; versions kept |
| owner template | any | deleted | nobody directly | cascade when the owner account is deleted (audit `deleted`) |
| platform template | v n | v n+1 | super_admin | `publish_platform_contract_template_version`; core keys stay locked; review_status stays draft |
| version | (none) | sealed | the RPCs, the w8e seed | version + clauses in one transaction, validated at once and at commit, then immutable |

Everything else is refused: worker, customer, anon, another owner, super_admin on owner templates, an owner on
the platform template, any UPDATE or direct DELETE of a version or clause, archiving or deleting the platform
template. No shop verification is needed (D-29; W9 gates sending).

## Hashes

`contract_template_clause_hash(section, position, key, kind, heading, body)` = sha256 hex of the jsonb text of
`{section_number, position, clause_key, kind, heading, body}`. `content_hash` = sha256 hex of the jsonb text of
`{format: 'washlink_contract_template_v1', review_status, base_content_hash (null for platform), clause_hashes
[ordered by section, position]}`. Two versions with identical clauses on the same base share a content hash
(an identical owner save is refused, `Nothing changed since the last version.`). Canonical form caveat: W8 R7.

## Validator (`validate_contract_template_version`, raises 23514 naming the first broken rule)

All versions: every section 1..15 has a clause; positions contiguous; stored clause hashes and the content hash
recompute equal; placeholders allowlisted (`Unknown placeholder {{x}}.`, also for malformed braces); total body
length <= 120000; the relationship-type and party-name placeholders only in locked clauses. Clause text never
holds control characters or the invisible U+200B..U+200F, U+2060, U+FEFF (clause guard message `Remove invisible
characters (such as zero-width spaces) from the text.`, CHECK backstop). Platform: no base, no shop terms, no source
clauses, counts 0; every core key present, locked and in its own section; section 4 holds only locked clauses and
keeps one with `{{worker_classification}}`; no digits; no `reviewed / approved / valid / binding / signed /
complian*` wording (word start) except in negated sentences of `template_is_draft`. Owner: every base clause
present exactly once with the same key, kind, section, position, heading and source (non-shop clause count = base
clause count; `source_clause_id` unique per version, also a constraint); locked ones with identical body and hash;
no other locked / editable clause; shop terms only where allowed, after the standard clauses, <= 40, body
10..4000; no non-locked text that, lower-cased with everything but letters and digits removed, contains
`washlinksafeguard` or `platformsafeguard` (the UI badge says "Platform safeguard — cannot be edited"); edited /
added counts match.
Called by every RPC before it returns and by the deferred constraint trigger
`contract_template_versions_validate_at_commit` for every session.

## RPCs and reads

The exact parameters, returns and error messages are in `loop/workforce/increments/W8/LOG.md` ("API for the
frontend (W8)"). Writes: `create_owner_contract_template`, `save_owner_contract_template_version`,
`rename_owner_contract_template`, `set_owner_contract_template_status`, `publish_platform_contract_template_version`.
Reads (SECURITY INVOKER, RLS decides, foreign ids return 0 rows): `owner_contract_templates`,
`platform_contract_template_current`, `contract_template_version_history`, `contract_template_version_clauses`,
`preview_contract_template_version`, `contract_template_version_diff`, plus `render_contract_template_clause`.

Rebase: a save with the latest standard as base keeps every editable body the owner had changed (by key) and
takes the new standard body for clauses the owner never changed; locked clauses come from the new standard.

## W9 hand-off

A contract version stores `template_version_id` (FK on delete set null, so owner deletion never removes contract
records), `content_hash`, the base platform version id and hash, and its own rendered text. It renders with
`render_contract_template_clause(body, values)` and refuses unfilled placeholders (and editable clauses still
marked `requires_owner_input`); it requires an explicit `worker_classification_options` choice (NOT NULL, no
default, extra acknowledgement for `independent_contractor`, D-26). Diff vs the standard =
`contract_template_version_diff` rows plus contract-level edits; problem-term flagging runs on editable and shop
text there (W8-L5). Rendering is single-pass (values are never re-expanded) and refuses values containing `{{` or
`}}` (22023 `Placeholder values cannot contain {{ or }}.`).

Problem-term list proposed for W9 flagging (W8-L13, OPEN, for legal review; what list is adequate is a legal
question): training fees; training-cost reimbursement or clawback; deposits; cash bonds; uniform, equipment,
damage or shortage deductions; fines or penalties; waivers; quitclaims or releases; exclusivity or non-compete
clauses limiting work for other shops; liquidated damages or forfeited pay on leaving; unpaid trial shifts or
customer work during training; contractor labels in free text; forum or arbitration clauses; claims that a
certificate is government-recognized; claims that a contract is signed, binding, valid or compliant.

J9 ("owner can customize a contract draft and save a reusable template version") is split: W8 covers the reusable
template version half; the contract-draft half (customizing a per-worker contract draft from a template version)
is W9's.

W9 status (`docs/workforce/WORKER_CONTRACTS.md`): implemented as described above. A contract version references the
chosen template version (lineage only, `on delete set null`) and the base platform version (`restrict`), copies both
hashes and the template name, and stores its own rendered text, clause rows (with the standard clause rendered with the
same values, `change` and `edited_in` = template / contract), keyword flags and acceptance records; template saves,
new platform versions and owner account deletion never change it (J10). Contract-level edits override the template
version by clause key; the contract keeps its own full shop-term list (initialised from the template version). The
J9 contract-draft half is `j9_w9_owner_customizes_worker_contract_draft`. Problem-term flags use the W8-L13 list
(15 categories, W9-L3). W9 adds no function whose name contains `contract_template`, and its `contract_*` tables carry
comments starting `W8/W9 contract module (created by W9)` so the w8a preflight (re-run by `j19_w8_review_polish`)
still passes.

## Limitations

- R4: the write flag relies on PostgREST not exposing `set_config` (smoke-tested). Trusted SQL can set it but
  still meets the commit validator; not tamper-proof against a superuser or table owner (who can disable
  triggers).
- R5: owner account deletion removes the owner's templates (W9 snapshots must be self-contained).
- R6: owner free text is unfiltered except for safeguard impersonation (W8-L5).
- R7: the jsonb text form is the hash canonical form; a Postgres change to jsonb output would change new hashes
  only (stored hashes stay; the validator compares within one server version).
- No PDF / print export, no e-signature (D-6), no notifications (D-30), no super_admin UI (moved from W11 to W14, W11 PLAN D-49).
- Deviations from PLAN.md: `render_contract_template_clause` is STABLE (it reads the placeholder allowlist) and
  lives in w8g next to its reader; the copy helpers (`contract_template_latest_platform_version`,
  `contract_template_owner_clause_list`, `contract_template_editable_bodies`, `contract_template_shop_terms`)
  live in w8e (w8d / w8f size limit); the rebase rule above refines "a missing key keeps the current body"; v1 of every
  template is audited as `created` plus `version_saved`.

## Rollback

Per-file `-- ROLLBACK` blocks in reverse order h..a, local stack only. h: producers (audit rows stay). g: reads.
f: RPCs. e: the platform rows (the guards refuse deleting them; disable the guards as a trusted session or roll
back c instead). d: rules and the commit validator. c: the three template tables (IRREVERSIBLE loss of owner
templates; export with a trusted `copy` first). b: reference tables. a: nothing. Stager: drop the third
`HELPERS_SOURCE_NAMES` entry. Only valid before W9 ships (W9 FKs point at W8 tables): with W9 present, roll back W9
(j..a) first.
