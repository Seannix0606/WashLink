# W8 - Contract templates & template versions - LOG

## BUILD (database part) - 2026-10-26

Local Docker stack only (staged `.local-supabase-test`, `--local`); no `.env` read, no link / push, no commit.

- Migrations (new, each with `-- ROLLBACK`, each <= 350 lines): `2026_10_26_w8a_contract_templates_preflight.sql`,
  `w8b_contract_template_reference_data.sql`, `w8c_contract_templates.sql`, `w8d_contract_template_rules.sql`,
  `w8e_platform_starter_contract_template.sql`, `w8f_contract_template_rpcs.sql`, `w8g_contract_template_reads.sql`,
  `w8h_contract_template_audit.sql` (staged `20261026000009..16`). No committed migration changed.
- Seed helpers: new `scripts/supabase-test/baseline/test_helpers_contract_templates.sql`
  (`latest_platform_contract_version`, `create_test_contract_template`, `save_test_template_version`); the stager
  `HELPERS_SOURCE_NAMES` gains it as the third entry (stager test `stager_seeds_every_helper_file_in_order`
  updated to the three names; still 19 tests).
- pgTAP: 5 new files (`j9_owner_can_customize_contract_draft_and_save_reusable_template_version` 36,
  `j9_w8_contract_template_rules` 65, `j9_w8_contract_template_audit` 15, `j17_w8_contract_template_authorization`
  41, `j18_w8_flows` 19); `001_migration_replay` (52 migrations, `replay_schema_migrations_has_baseline_w2_to_w8`,
  `replay_w8_contract_template_tables_rls_enabled`; plan 21). No other test file changed.
- Smoke: `scripts/supabase-test/w8-api-smoke.mjs`.
- Docs: `docs/workforce/CONTRACT_TEMPLATES.md` (new); `LEGAL_REVIEW_REGISTER.md` (W8-L1..L9 OPEN + notes on W0-L3,
  W0-L4, W4-L8, W6-L11); `ROLE_AND_PROFILE_SECURITY.md` (D-10 rows 36-37, W8 guard matrix);
  `LOCAL_TEST_HARNESS.md`; `AUDIT_AND_NOTIFICATIONS.md`; `loop/workforce/LOOP.md` (W8 smoke row).

Deviations from PLAN.md (small, recorded): `render_contract_template_clause` is STABLE (it reads the placeholder
allowlist) and lives in w8g next to its only reader; copy helpers `contract_template_latest_platform_version`,
`contract_template_owner_clause_list`, `contract_template_editable_bodies`, `contract_template_shop_terms` live
in w8d (w8f would exceed 350 lines); extra internal helpers `contract_template_normalize_text`,
`contract_template_hash_of`, `contract_template_clauses_content_hash`, `contract_template_insert_version`,
`contract_template_name_or_fail`, `contract_template_assert_active_limit`, `lock_owner_contract_template`,
`contract_template_checked_shop_terms`, `contract_template_changed_by`; rebase refinement: a key missing from
`p_editable_bodies` keeps the CURRENT body only if the owner had edited it (body differs from its own standard
clause), else takes the base body (otherwise a rebase would keep the old standard text and count it as an
owner edit); every template's v1 is audited as `created` + `version_saved`; w8h back-fills the two audit rows
for the w8e seed (producers did not exist yet); platform versions must contain no digits (P42, validator);
`clause_hash` is always set by the clause guard (so a forged hash test targets `content_hash`);
`w8_clause_cannot_be_added_to_sealed_version` is proven on platform v1 (pgTAP runs in one transaction, so an
owner version created in the test shares its txid).

Actual results (final run of this step):
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: tests 19, pass 19, fail 0.
- `node scripts/supabase-test/run-db-tests.mjs`: 52 staged migrations replayed; `Files=52, Tests=1890`,
  `Result: PASS`; `grep -c "todo_start("` = 0 in every file. One earlier run of the same tree failed 1 assertion
  in the UNCHANGED `j6_w6_training_audit_and_notifications.test.sql` (test 9): `test_helpers.create_verified_shop`
  names shops `Local Test Verified Shop <first 8 hex chars of a uuid>`; when those 8 chars are all digits,
  `notification_safe_label` rejects the name as phone-like and the body says "The shop". Pre-existing,
  intermittent (about 2 % per run), not caused by W8; rerun PASS. Suggested fix (not applied, out of W8 scope):
  use a letters-only suffix in that helper.
- Smokes: w2 48 passed / 0 failed; w3 33 / 0; w4 43 / 0; w5 39 / 0; w6 40 / 0; w7 38 / 0; w8 30 / 0 (also
  rerun on the same stack: 30 / 0).
- Local stack stopped (`supabase stop --workdir .local-supabase-test --no-backup`).

## API for the frontend (W8)

All writes are RPCs (`supabase.rpc(name, params)`); the tables are select-only under RLS and the UI should use the
read RPCs. Map every message below in `supabaseErrorMessages.ts`. Never call internal functions (not granted).
No notifications (D-30). Nothing here needs shop verification (D-29).

Constants: draft notice (also `review_notice` on every read row) `Draft — requires review by a qualified Philippine
labor-law professional`; `review_status` is always `draft_requires_legal_review`; clause kinds `locked_safeguard`
/ `editable` / `shop_specific`; shop terms allowed in sections 2, 3, 5-13, 15 (`owner_terms_allowed`); limits:
name 3..120, editable body 1..4000, shop term heading 3..160 / body 10..4000, <= 40 shop terms per version, total
text <= 120000, <= 25 active templates per owner, <= 200 versions per template. Placeholders (`{{key}}`): read
`contract_template_placeholders` (`placeholder_key`, `preview_label`); anything else is refused.

### Writes

| RPC | Params | Returns | Caller |
|---|---|---|---|
| `create_owner_contract_template` | `p_name text, p_from_version_id uuid = null` (null / the latest standard version id = start from the standard; an own version id = copy its editable bodies and shop terms on that version's base) | `contract_templates` row (v1 created) | role owner |
| `save_owner_contract_template_version` | `p_template_id uuid, p_expected_version_number int, p_base_platform_version_id uuid, p_editable_bodies jsonb ({clause_key: body}, editable keys of the base only; omitted keys keep the current edited body), p_shop_terms jsonb ([{section_number, heading, body}] = the FULL list for the new version, in order)` | `contract_template_versions` row (n+1) | the template owner |
| `rename_owner_contract_template` | `p_template_id uuid, p_name text` | template row (unchanged row, no audit, if the name is the same) | the template owner, active only |
| `set_owner_contract_template_status` | `p_template_id uuid, p_from_status text, p_to_status text` ('active' / 'archived') | template row | the template owner |
| `publish_platform_contract_template_version` | `p_expected_version_number int, p_clauses jsonb ([{section_number, clause_key, kind ('locked_safeguard' / 'editable'), heading, body, requires_owner_input}], positions by order within a section)` | version row | super_admin only (W11 UI) |

Save flow: pass `p_base_platform_version_id` = `base_platform_version_id` of the current version (from
`owner_contract_templates()`), or `latest_platform_version_id` to rebase ("Use the newer standard"); never send
locked clauses; send the full shop-term list every time; `p_expected_version_number` = `current_version_number`.

Error messages (code: text):
- 42501: `Only shop owners can create contract templates.` / `Contract template not found.` (foreign, unknown,
  platform or non-owner caller) / `Only WashLink administrators can change the standard template.` /
  `Contract templates are changed only through WashLink.` / `Contract template versions cannot be edited.`
- 23514: `Template names must be 3 to 120 characters.` / `You can keep up to 25 active templates. Archive one
  first.` / `Archived templates cannot be changed. Restore it first.` / `Use the current standard template
  version.` / `This clause is a WashLink safeguard and cannot be changed.` / `Editable clauses cannot be empty.` /
  `A clause can hold up to 4000 characters.` / `Shop-specific terms are not allowed in this section.` /
  `A version can have up to 40 shop-specific terms.` / `Give each shop-specific term a heading of 3 to 160
  characters.` / `Write each shop-specific term in 10 to 4000 characters.` / `A template can keep up to 200
  versions. Start a new template from this version.` / `Nothing changed since the last version.` /
  `Unknown placeholder {{x}}.` / `Shop text cannot be labelled as a WashLink safeguard.` / `A contract template
  can hold up to 120000 characters.` / `The template already has this status.` / validator texts (trusted or
  admin paths): `Every contract section needs at least one clause (missing: n).`, `The standard template must
  keep these WashLink safeguard clauses locked: <keys>.`, `Section 4 must keep the relationship-type placeholder
  in a WashLink safeguard clause.`, `The standard template cannot contain digits or amounts.`, `The standard
  template has only WashLink safeguard and editable clauses.`
- 55000: `This template changed. Reload it and try again.` (stale expected version or from_status) -> reload.
- 22023: `Unknown clause.` / `Editable clause bodies must be text.` / `Shop-specific terms must be a list of
  section, heading and text.` / `Unknown template status.` / `Give the standard template as a list of 1 to 120
  clauses.` / `Each clause needs a section, key, kind, heading and text.`

### Reads (SECURITY INVOKER, `authenticated`; owners: own + the standard; super_admin: the standard only; others: 0 rows)

- `owner_contract_templates()`: `template_id, name, status, current_version_number, current_version_id,
  last_saved_at, base_platform_version_id, base_platform_version_number, latest_platform_version_id,
  latest_platform_version_number, newer_standard_available, derived_from_version_id, created_at`; active first,
  then last saved desc. Badge "A newer standard template is available" = `newer_standard_available`.
- `platform_contract_template_current()`: `template_id, name, version_id, version_number, content_hash, created_at`.
- `contract_template_version_history(p_template_id)`: `version_id, version_number, created_at, content_hash,
  base_platform_version_id, base_platform_version_number, edited_count, added_count, saved_by_role, is_current`;
  newest first (short hash = first 8 chars of `content_hash`).
- `contract_template_version_clauses(p_version_id)`: `clause_id, section_number, section_title, review_notice,
  owner_terms_allowed, position, clause_key, kind, heading, body, requires_owner_input, source_clause_id,
  clause_hash`; ordered by section, position. Editor state = this for the current version.
- `preview_contract_template_version(p_version_id)`: `clause_id, section_number, section_title, review_notice,
  position, clause_key, kind, heading, rendered_heading, body, rendered_body, requires_owner_input`
  (placeholders rendered as their preview labels). Show the notice as a top banner and under every section.
- `contract_template_version_diff(p_version_id)`: `section_number, section_title, position, clause_key, kind,
  change ('unchanged' | 'edited' | 'added_by_shop'), standard_heading, standard_body, version_heading,
  version_body` (standard_* null for shop terms; all `unchanged` for a platform version).
- `render_contract_template_clause(p_body text, p_values jsonb = null)`: label rendering (W9 passes real values).
- Tables (select only): `contract_template_sections`, `contract_template_placeholders`,
  `worker_classification_options` (any signed-in user; W9 only for the last), `contract_templates`,
  `contract_template_versions`, `contract_template_clauses` (owners own + standard, super_admin standard).
  A foreign or unknown id returns 0 rows (show "Template not found").

### W9 hand-off

- A W9 contract version stores `template_version_id` (FK `on delete set null`), `content_hash`, the base
  platform version id + its `content_hash`, and its own rendered text (owner deletion removes templates, W8-L9).
- Render with `render_contract_template_clause(body, values)`; refuse any placeholder without a value and any
  editable clause still `requires_owner_input = true` (the bracketed `[Shop: ...]` instruction was never edited).
- Require an explicit `worker_classification_options.classification_key` (NOT NULL, no default; an extra
  acknowledgement for `independent_contractor`, `needs_extra_acknowledgement`, D-26); fill
  `{{worker_classification}}` from its label.
- Diff vs the standard = `contract_template_version_diff` rows plus contract-level edits; problem-term flagging
  runs on `editable` and `shop_specific` text (W8-L5). Proposed problem-term list (W8-L13, OPEN, legal review):
  training fees; training-cost reimbursement or clawback; deposits; cash bonds; uniform / equipment / damage /
  shortage deductions; fines or penalties; waivers; quitclaims or releases; exclusivity or non-compete clauses
  limiting work for other shops; liquidated damages or forfeited pay on leaving; unpaid trial shifts or customer
  work during training; contractor labels in free text; forum / arbitration clauses; claims that a certificate is
  government-recognized; claims that a contract is signed, binding, valid or compliant.
- Owner-side gate for sending (verified shop, D-29) and worker visibility are W9; W8 grants workers nothing.
- J9 is split: W8 delivers the "save a reusable template version" half; the "customize a contract draft" half
  (a per-worker draft built from a template version) is W9's.
- Platform versions keep the 15 core safeguard keys locked, each in its own section (review polish); a D-6
  outcome is applied by publishing a new platform version, and W9 should show contracts the base platform version
  they were drafted on.
- `render_contract_template_clause` is single-pass and refuses values containing `{{` / `}}` (22023).

## Orchestrator note (2026-10-26)
- Fixed intermittent `j6_w6_training_audit_and_notifications` test 9: `test_helpers.create_shop`/`create_verified_shop` suffixes are now letters-only (`translate(..., '0123456789', 'ghijklmnop')`), so an all-digit suffix can no longer trip `notification_safe_label`. Test-helper change only.

## BUILD (frontend part) - 2026-10-26

No `.env` read, nothing under `supabase/` or `scripts/` touched, no commit. Every file <= 350 lines (largest
changed: `OwnerDashboardContent.tsx` 306).

- Domain: `models/ContractTemplate.ts`, `repositories/ContractTemplateRepository.ts`, `utilities/{contractTemplateDraft,
  clauseTextDiff, contractTemplatePlaceholders}.ts`.
- Infrastructure: `supabase/supabaseContractTemplateRows.ts`; `repositories/SupabaseContractTemplateRepository.ts`
  (invoker read RPCs + select on `contract_template_placeholders`), `SupabaseContractTemplateActionRepository.ts`
  (the 4 owner RPCs only, `toUserFacingError`, reuses `hasCompositeKey`); `supabaseErrorMessages.ts` gains every
  W8 raised message (plus 3 bounded patterns: unknown placeholder, missing sections, core keys).
- Application: `validation/{contractTemplateSchemas, contractTemplateDraftValidation}.ts`, `services/ContractTemplateService.ts`.
- Presentation: `utilities/{contractTemplateCopy, contractTemplateDisplay}.ts`; DI `createContractTemplateDependencies.ts`
  (wired through `createDashboardDependencies` / `OwnerDashboardPage`); hooks `useOwnerContractTemplates` (polled, so
  "A newer standard template is available" follows live `newer_standard_available`), `useContractTemplateActions`,
  `useContractTemplateEditor`, `useContractTemplateVersionHistory`, `useContractTemplatePreview`, `useContractTemplateDiff`;
  components `contracts/DraftLegalReviewBanner.tsx` and `owner/contractTemplates/{OwnerContractTemplatesPanel,
  ContractTemplateListItem, ContractTemplateEditor, ContractTemplateSectionEditor, ShopSpecificTermForm,
  ContractTemplateVersionHistory, ContractTemplatePreview, ContractTemplateDiffView, ContractTemplateNameModal}.tsx`;
  new lazy "Contract templates" tab in `OwnerDashboardContent.tsx` (own chunk in the build).
- Behaviour: save sends only editable bodies changed in this session (by clause key) + the full shop-term list, with
  `p_expected_version_number` and the current base; locked clauses are never editor state or payload. 55000 reloads the
  template row and its current version (unsaved edits dropped, toast says so). "Update to standard version N" sends
  `{}` bodies + current shop terms on `latest_platform_version_id`, after a confirmation, blocked while edits are
  unsaved. Archived templates are read-only (view, versions, restore). Archive is confirmed. Preview / diff render
  stored text exactly (`whitespace-pre-line`); placeholders come rendered as bracketed labels from the server.
- Deviations: the lock badge says "Platform safeguard — cannot be edited" (orchestrator wording) instead of the plan's
  "WashLink safeguard - cannot be changed"; extra hook `useContractTemplateActions` (list actions); confirm dialogs
  reuse `training/TrainingConfirmModal`. No classification type/picker (D-26, W9). No super_admin platform-publish UI:
  the plan puts it in W11 (section 1 "Out"), DB path is tested here.
- Vitest (16 new, names per plan section 7): `ContractTemplateEditor.j9.test.tsx` (5), `ContractTemplateViews.j9.test.tsx`
  (2), `SupabaseContractTemplateRepository.j17.test.ts` (1), `contractTemplateUtilities.w8.test.ts` (2),
  `OwnerContractTemplatesPanel.w8.test.tsx` (4), `contractTemplateCopy.w8.test.ts` (2); fixtures `test/contractTemplateFixtures.ts`.

Actual results (final run, `frontend/`):
- `npm run lint`: exit 0, no problems.
- `npm run build`: `tsc -b` + vite, `✓ built` (chunk `OwnerContractTemplatesPanel-*.js` 37.78 kB).
- `npm test`: `Test Files 89 passed (89)`, `Tests 173 passed (173)` (157 existing + 16 W8).
- `grep -rn "service_role" frontend/src`: empty.

## Review polish (DB) - 2026-10-26

Local Docker stack only (staged `.local-supabase-test`); no `.env` read, no link / push, no commit. Only the
uncommitted W8 migrations were edited in place; w7 and earlier untouched. Every file <= 350 lines (w8a 69, w8c 338,
w8d 310, w8e 194, w8f 350 unchanged, w8g 181, w8h 148; new test 154).

- w8a: also refuses any pre-existing public function whose name contains `contract_template` without a `W8`
  comment; w8h now comments all 38 W8 functions `W8: ...` (aborts if one is missing).
- w8c: `ctc_heading_length` / `ctc_body_length` also refuse U+200B..U+200F, U+2060, U+FEFF (ASCII `\u` escapes in
  the source); the clause guard raises a friendly 23514 first; new `ctc_source_unique (version_id, source_clause_id)`.
- w8d: core keys now come from `contract_template_core_safeguards()` (key + section, 15 keys: the 11 + W8-L10
  `parties_named`, `safety_terms_need_review`, `customer_data_minimum` + `classification_reasons`);
  `contract_template_core_safeguard_keys()` derives from it. Validator, all scopes: `{{worker_classification}}`,
  `{{owner_full_name}}`, `{{worker_full_name}}` only in locked clauses (the party names are locked-only by design:
  the starter uses them only in `parties_named`). Platform: core keys pinned to their sections; section 4 locked
  only; no `\m(complian|approved|valid|reviewed|binding|signed)` in heading / body except in sentences of
  `template_is_draft` that contain `not` (word-start match, so "assigned" / "designed" pass). Owner: non-shop clause
  count = base clause count and `source_clause_id` unique; impersonation check lower-cases and strips everything
  but letters / digits, then refuses `washlinksafeguard` or `platformsafeguard`. Copy helpers moved w8d -> w8e
  (size limit; rollback blocks updated).
- w8e starter (33 clauses, 16 locked, 17 editable; still no digits or claims): `classification_reasons` is locked
  ("The relationship type is set only by the choice made for each contract. Text that the shop writes or edits
  elsewhere in this agreement does not change it."); new locked section-8 `training_pay_or_reimbursement`
  ("The shop may offer pay for training time or reimbursement of training costs, as written in this contract.
  Free to the worker means that the worker does not pay for the training."); `safeguards_prevail` now reads
  "Shop-specific terms, attachments, and any clause text that the shop writes or edits cannot change or override
  WashLink safeguard clauses. ...".
- w8g: `render_contract_template_clause` is single-pass (split on the placeholder pattern, rebuild in order) and
  refuses values containing `{{` / `}}` (22023).
- Tests: new `j19_w8_review_polish.test.sql` (plan 37); `j9_w8_contract_template_gaps` core count 11 -> 15 (test
  renamed `w8g_fifteen_core_keys`); `j17_w8_contract_template_authorization` internal list + 1
  (`contract_template_core_safeguards()`, 25 -> 26).
- Docs: `LEGAL_REVIEW_REGISTER.md` W8-L10..L13 (OPEN); `CONTRACT_TEMPLATES.md` (starter table, validator, locked-only
  placeholders, W8-L13 problem-term list, J9 split); W9 hand-off above (W8-L13 list, J9 split, 15 core keys).

Frontend impact (not changed in this step; for the frontend agent):
- `classification_reasons` is now `locked_safeguard`: the editor shows it read-only with the lock badge (no code
  change needed if rendering is by `kind`); `frontend/src/test/contractTemplateFixtures.ts` line 64 still builds it
  as editable (fixture drift only). The starter also gains locked `training_pay_or_reimbursement` (section 8,
  position 2; `certification_shop_issued` and `training_details` move to positions 3 and 4).
- `contractTemplateSchemas.ts` impersonation refine (`/washlink safeguard/i`) is weaker than the server: mirror
  it (strip non-alphanumerics, lower-case, refuse `washlinksafeguard|platformsafeguard`), and refuse
  `{{worker_classification}}`, `{{owner_full_name}}`, `{{worker_full_name}}` in editable / shop text and the
  invisible characters U+200B..U+200F, U+2060, U+FEFF; `contractTemplatePlaceholders.ts` help should list those
  three as not usable in owner text.
- New messages for `supabaseErrorMessages.ts` (all 23514 unless noted): `Remove invisible characters (such as
  zero-width spaces) from the text.` / `The relationship type and the party names can appear only in WashLink
  safeguard clauses.` / `Each clause of the standard template must appear exactly once.` / `These WashLink
  safeguard clauses must stay in their own sections: <keys>.` (bounded pattern like the core-keys one) / `Section 4
  can hold only WashLink safeguard clauses.` / `The standard template cannot say it is reviewed, approved, valid,
  binding, signed or compliant.` / 22023 `Placeholder values cannot contain {{ or }}.` (W9 render). A duplicate
  source in forged trusted SQL raises 23505 `ctc_source_unique` (not reachable through the RPCs).

Actual results (this step):
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: tests 19, pass 19, fail 0.
- `node scripts/supabase-test/run-db-tests.mjs`: before the new test file, `Files=53, Tests=1910`, `Result: PASS`
  (migration changes alone break nothing). First run with the new file: 2 of 36 failed (test bugs: a regex over
  the constraint text, because the editor had written literal invisible characters into w8c and the test, now
  replaced by ASCII `\u` escapes; and downgrading `parties_named` trips the new placeholder rule first, so the test
  now downgrades `safety_terms_need_review` and checks the core list, plan 37). Final run: 52 staged migrations
  replayed, `Files=54, Tests=1947`, `Result: PASS`; 0 `todo_start(` in the new file.
- Smokes (same stack): w2 48 passed / 0 failed; w3 33 / 0; w4 43 / 0; w5 39 / 0; w6 40 / 0; w7 38 / 0; w8 30 / 0.
- Safety: `git diff --name-status dd58616 -- supabase/migrations` empty; `grep -L -- "-- ROLLBACK"` on the w8 files
  empty.
- Local stack stopped (`supabase stop --workdir .local-supabase-test --no-backup`: "Stopped supabase local
  development setup.").
- Not verified: frontend lint / build / tests were not run (no frontend file changed in this step).

## Review polish (frontend) - 2026-10-26

frontend/ only; no `.env`, no commit; every file <= 350 lines.
- Fixtures (`test/contractTemplateFixtures.ts`): `classification_reasons` is now `locked_safeguard` (section 4 locked
  only); section 8 added with locked `required_training_free_and_supervised` (1), `training_pay_or_reimbursement` (2),
  `certification_shop_issued` (3) and editable `training_details` (4). The editor renders by `kind`, so no code change
  was needed: section 4 shows no text box. `j9_editor_shows_locked_clauses_read_only` now checks section 4 (2 locked,
  0 text boxes), the section-8 safeguard and 7 section notices; the save-payload test's locked-key list has 9 keys;
  the allowed-sections test includes 8.
- Owner-text check aligned with the server (`application/validation/contractTemplateSchemas.ts` `findOwnerTextProblem`,
  helpers in `domain/utilities/contractTemplatePlaceholders.ts`): invisible characters U+200B..U+200F, U+2060, U+FEFF
  (regex written with `\u` escapes; a repo scan of changed files finds 0 literal ones); allowlisted placeholders; the
  locked-only `{{worker_classification}}`, `{{owner_full_name}}`, `{{worker_full_name}}` refused; impersonation =
  lower-case, keep letters / digits only (`\p{L}\p{N}`), refuse `washlinksafeguard` / `platformsafeguard`. The
  editor's placeholder help lists only the owner-usable keys and says the three locked-only ones cannot be used.
- `supabaseErrorMessages.ts`: the 6 new 23514 messages (one as a bounded pattern: `These WashLink safeguard clauses
  must stay in their own sections: <keys>.`) and 22023 `Placeholder values cannot contain {{ or }}.`
- Vitest: new `w8_owner_text_rules_match_server`; `w8_contract_template_error_messages_mapped` gains the 7 messages.

Actual results (`frontend/`): `npm run lint` exit 0, no problems; `npm run build` `✓ built`; `npm test`
`Test Files 89 passed (89)`, `Tests 174 passed (174)` (157 pre-W8 + 17 W8).

## Orchestrator record (2026-10-26)
- Reviews interrupted once by a usage limit and resumed.
- REVIEW: security and compliance no BLOCKING; review polish applied (DB + frontend). REVIEW.md.
- VERIFY: PASS (VERDICT.md). Fix cycles: 0 (polish only).
