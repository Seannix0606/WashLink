# W9 - Worker contracts, acceptance, snapshots, amendments - LOG

## BUILD (database part) - 2026-10-26

Local Docker stack only (staged `.local-supabase-test`, `--local`); no `.env` read, no link / push, no commit, no
repo-root CLI. No committed migration changed (w8 and earlier untouched).

- Migrations (new, each with `-- ROLLBACK`, each <= 350 lines; staged `20261026000017..26`):
  `2026_10_26_w9a_worker_contracts_preflight.sql` (94), `w9b_worker_contract_reference_data.sql` (264),
  `w9c_worker_contracts.sql` (281), `w9d_contract_version_records.sql` (350), `w9e_worker_contract_rules.sql` (349),
  `w9f_worker_contract_owner_rpcs.sql` (326), `w9g_worker_contract_party_rpcs.sql` (323), `w9h_worker_contract_reads.sql`
  (245), `w9i_worker_contract_retention.sql` (191), `w9j_worker_contract_audit_and_notifications.sql` (239).
- Seed helpers: new `scripts/supabase-test/baseline/test_helpers_worker_contracts.sql` (`create_accepted_application`,
  `create_test_contract_draft`, `fill_test_contract_draft`, `send_test_contract`, `accept_test_contract`; real RPCs as the
  actor, no acceptance ever inserted by a fixture). Stager `HELPERS_SOURCE_NAMES` gains it as the 4th entry;
  `stager_seeds_every_helper_file_in_order` updated (still 19 tests).
- pgTAP: 9 new files (`j9_w9_owner_customizes_worker_contract_draft` 30,
  `j10_accepted_contract_contents_preserved_after_template_change` 27, `j11_material_contract_amendments_require_acceptance` 28,
  `j12_worker_and_owner_cannot_access_other_parties_private_contracts` 28, `j9_w9_worker_contract_rules` 52, `j9_w9_problem_term_flags` 15, `j9_w9_worker_contract_audit`
  12, `j17_w9_worker_contract_authorization` 16, `j18_w9_flows` 22); `001_migration_replay` (62 migrations,
  `replay_schema_migrations_has_baseline_w2_to_w9`, + `replay_w9_worker_contract_tables_rls_enabled`; plan 22). No other
  test file changed.
- Smoke: `scripts/supabase-test/w9-api-smoke.mjs` (34 checks).
- Docs: new `docs/workforce/WORKER_CONTRACTS.md`; `LEGAL_REVIEW_REGISTER.md` (W9-L1..L12 OPEN, incl. the D-32 RA 10173
  question in W9-L5; notes on W0-L3, W0-L4, W5-L10, W6-L10, W8-L3, L4, L5, L9, L13); `ROLE_AND_PROFILE_SECURITY.md` (D-10
  rows 38-39, W9 guard matrix); `LOCAL_TEST_HARNESS.md`; `AUDIT_AND_NOTIFICATIONS.md`; `CONTRACT_TEMPLATES.md`;
  `MARKETPLACE_AND_APPLICATIONS.md` (retained application records); `loop/workforce/LOOP.md` (W9 smoke row, counts).

Deviations from PLAN.md (small, recorded):
- File layout (350-line limit; SQL functions need their tables): `discard_worker_contract_draft`,
  `create_worker_contract_amendment`, `activate_worker_contract` live in w9g; the owner-text helpers
  (`worker_contract_check_owner_text`, `worker_contract_checked_owner_values`) in w9b; the P46 version guard in w9d;
  `my_retained_application_records` in w9i; the Realtime exclusion in w9i (after the last W9 table exists).
- Columns: `contract_acknowledgement_texts.statement_text` (plan: "text"); acceptances also snapshot
  `contractor_ack_text`; versions store `render_values` (sealed with the text; the validator re-renders the base clauses
  with them). `send_worker_contract_version.p_acknowledged_flag_count` has `default null` (Postgres requires defaults after
  a defaulted parameter); null counts as a changed count (55000).
- Every `on delete set null` FK of the W9 tables is DEFERRABLE INITIALLY DEFERRED: one account deletion nulls several FKs
  of the same row in separate cascade steps, and a row inserted in the same transaction (every pgTAP test) is re-checked
  on each update.
- W8 compatibility: the committed w8a preflight is re-run by `j19_w8_review_polish` and refuses any `contract_*` relation
  whose comment does not start with `W8`; the six W9 `contract_*` tables therefore carry comments starting
  `W8/W9 contract module (created by W9)`, which w9a accepts besides `W9`. No W9 function name contains
  `contract_template` (`j17_w8` / `w8p` checks).
- Problem-term categories: the plan says 16 but lists 15 names (the W8-L13 list); 15 are seeded (17 rules incl. a Filipino
  deduction rule). `worker_contract_flag_notices()` (extra read) returns the disclaimer and the no-match text.
- C7 activation gate: an ACCEPTED required-initial enrollment of the worker with the same owner whose progress is live
  (`training_enrollment_is_live`), i.e. invitations do not block.
- `worker_contract_effective_status` is granted to `authenticated` (pure; the invoker reads call it).
- Extra internal helpers: `worker_contract_safe_value`, `worker_contract_rendered_clauses`, `worker_contract_party_name`,
  `worker_contract_lock_for_owner` / `_for_worker`, `worker_contract_pick_template_version`, `worker_contract_check_terms`,
  `worker_contract_close_open_versions`, `worker_contract_notify`, `worker_contract_changed_by`.

Actual results (final run of this step):
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: tests 19, pass 19, fail 0.
- `node scripts/supabase-test/run-db-tests.mjs`: 62 staged migrations replayed; `Files=63, Tests=2178`, `Result: PASS`;
  `grep -c "todo_start("` = 0 in every file.
- Smokes on the same stack: w2 48 passed / 0 failed; w3 33 / 0; w4 43 / 0; w5 39 / 0; w6 40 / 0; w7 38 / 0; w8 30 / 0;
  w9 34 / 0.
- Local stack stopped (`supabase stop --workdir .local-supabase-test --no-backup`).
- Not run in this step: frontend lint / build / Vitest and backend pytest (no frontend or backend file changed).

## API for the frontend (W9)

All writes are RPCs (`supabase.rpc(name, params)`); the eight W9 tables are select-only under RLS and the UI should use
the read RPCs. Never call internal functions (not granted). Map every message in `docs/workforce/WORKER_CONTRACTS.md`
("Messages") in `supabaseErrorMessages.ts`. Constants: record label `Acceptance record — not an e-signature` (show it on
every acceptance record, document view, download and print); draft notice `Draft — requires review by a qualified
Philippine labor-law professional`; statement keys `w9_owner_send_v1` (owner, send), `w9_worker_accept_v1` (worker, accept),
`w9_contractor_owner_v1` / `w9_contractor_worker_v1` (only for `independent_contractor`, read the texts from
`contract_acknowledgement_texts.statement_text`); flag texts from `worker_contract_flag_notices()` (`disclaimer`,
`no_match_text`). Classification options: `worker_classification_options` ordered by `sort_order`, none preselected,
extra checkbox when `needs_extra_acknowledgement`. Limits: role_title 3..120, schedule_summary 3..500, pay_details 3..1000
(verbatim, never prefilled), editable body 1..4000, shop terms as W8 (sections 2, 3, 5-13, 15; heading 3..160; body
10..4000; <= 40), decline note <= 500, termination reason 10..500.

### Writes

| RPC | Params | Returns | Caller |
|---|---|---|---|
| `create_worker_contract_draft` | `p_shop_id, p_worker_id, p_template_version_id` (an own active template version, or the CURRENT standard version), `p_classification_key` (required, no default), `p_start_date`, `p_end_date = null`, `p_owner_values = {}` | `worker_contracts` row (status draft; v1 draft created, shop terms copied from an own template version) | current shop owner; worker from `owner_contract_eligible_workers()` |
| `save_worker_contract_draft` | `p_contract_id, p_expected_draft_revision, p_classification_key, p_start_date, p_end_date, p_owner_values {role_title, schedule_summary, pay_details}, p_editable_bodies {clause_key: body} (the FULL set of contract-level edits; editable keys of the base only), p_shop_terms [{section_number, heading, body}] (the FULL list)` | `contract_versions` row (draft_revision + 1) | owner; the open draft (initial or amendment) |
| `send_worker_contract_version` | `p_contract_id, p_expected_draft_revision, p_acknowledgement_key 'w9_owner_send_v1', p_contractor_acknowledgement_key ('w9_contractor_owner_v1' or null), p_acknowledged_flag_count` (= `preview_worker_contract_draft().flag_count` the owner saw) | sealed `contract_versions` row (`content_hash`, `flag_count`) | owner; verified shop |
| `withdraw_worker_contract_version` | `p_contract_id, p_version_id` (the pending sent version) | `worker_contracts` row (initial -> withdrawn; amendment -> current stays) | owner |
| `discard_worker_contract_draft` | `p_contract_id, p_version_id` (an unsent draft) | `true` (initial: the contract is deleted; amendment: the version) | owner |
| `create_worker_contract_amendment` | `p_contract_id, p_expected_revision, p_template_version_id = null` | new draft `contract_versions` row copying the version in force | owner; accepted / active, not effectively expired |
| `activate_worker_contract` | `p_contract_id, p_expected_revision` | `worker_contracts` row (active) | owner; start date reached; verified shop; C7 |
| `accept_worker_contract_version` | `p_contract_id, p_version_id, p_content_hash` (of the document the worker read), `p_acknowledgement_key 'w9_worker_accept_v1', p_contractor_acknowledgement_key ('w9_contractor_worker_v1' or null)` | `worker_contracts` row (initial -> accepted; amendment -> new current version) | worker |
| `decline_worker_contract_version` | `p_contract_id, p_version_id, p_note = null` | `worker_contracts` row (initial -> declined; amendment -> current stays) | worker; always while sent |
| `terminate_worker_contract` | `p_contract_id, p_expected_revision, p_reason` (10..500) | `worker_contracts` row (terminated, `ended_by`) | the worker (always) or the current owner |

Concurrency: `p_expected_revision` = `revision` from `owner_worker_contracts()` / `my_worker_contracts()`;
`p_expected_draft_revision` = `draft_revision` (owner list or `preview_worker_contract_draft`). 55000 -> reload.
Editor state: `contract_versions` row of the draft (`editable_bodies`, `shop_terms`, `owner_values`, `classification_key`,
`start_date`, `end_date`, `draft_revision`) plus the base clause list (`contract_template_version_clauses(
base_platform_version_id)`); show locked clauses read-only.

### Reads (SECURITY INVOKER unless noted; foreign or unknown ids return 0 rows)

- `owner_worker_contracts()`: `contract_id, status, effective_status, revision, origin, shop_id, shop_name, worker_id,
  worker_name, current_version_id, current_version_number, pending_version_id, pending_version_number,
  pending_version_kind, draft_version_id, draft_version_number, draft_revision, start_date, end_date, sent_at,
  accepted_at, activated_at, ended_at, ended_by, end_reason, decline_note, owner_removed, shop_removed, worker_removed,
  allowed_actions (save_draft, send, discard, withdraw, withdraw_amendment, activate, amend, terminate), created_at,
  updated_at`.
- `my_worker_contracts()`: same without the draft and worker columns, plus `owner_name`; `allowed_actions` (accept,
  accept_amendment, decline, decline_amendment, terminate). Decline and terminate are always offered when allowed; accept
  is hidden when the shop or owner is gone.
- `owner_contract_eligible_workers()` (definer, owner only): `worker_id, display_name, shop_id, shop_name, origin,
  has_open_contract`. Names only, never contacts.
- `preview_worker_contract_draft(p_contract_id)` (definer, owner only; 0 rows without an open draft): `version_id,
  version_number, kind, draft_revision, flag_count, unfilled text[]` (`<placeholder>`, `clause:<key>`,
  `shop_term:<section>.<position>`), `clauses jsonb` ([{section_number, section_title, review_notice, position,
  clause_key, kind, heading, body (rendered), standard_heading, standard_body, change, edited_in, needs_input,
  amendment_change (unchanged / changed / added; null for v1)}]), `flags jsonb` ([{section_number, position, value_key,
  rule_key, category, label, guidance, excerpt}]).
- `worker_contract_versions(p_contract_id)`: `version_id, version_number, kind, state, classification_key,
  classification_label, start_date, end_date, content_hash, flag_count, sealed_at, sent_at, responded_at, decline_note,
  template_name, template_version_number, base_platform_version_number, draft_revision, is_current, is_pending,
  created_at` (newest first; workers see sealed versions only).
- `worker_contract_version_document(p_version_id)`: `contract_id, version_id, version_number, kind, state,
  rendered_text, content_hash, sealed_at, record_label`. Show `rendered_text` exactly (pre-wrap), the short hash (first 8
  chars) and the label; Download = Blob of `rendered_text`, file `washlink-contract-<8 chars>-v<n>.txt`; Print via a print
  stylesheet. Sealed versions only.
- `worker_contract_version_clauses(p_version_id)`: `section_number, section_title, review_notice, position, clause_key,
  kind, heading, body, standard_heading, standard_body, change, edited_in, clause_hash` (diff vs the standard; reuse
  `clauseTextDiff`).
- `worker_contract_version_flags(p_version_id)`: `section_number, position, value_key, rule_key, category, label,
  guidance, excerpt, disclaimer`; zero rows -> show `no_match_text`.
- `worker_contract_version_changes(p_version_id)`: `change_kind (clause_changed, clause_added, clause_removed,
  classification_changed, dates_changed, contract_detail_changed), section_number, item_key, heading, previous_text,
  new_text` vs the version it amends (clause rows only for sealed versions). Copy for the worker: "Your current terms
  stay until you accept this change."
- `worker_contract_acceptances(p_contract_id)`: `version_id, version_number, version_content_hash, party_role,
  party_name, statement_key, statement_text, contractor_ack_key, contractor_ack_text, accepted_at, record_label`.
- `my_retained_application_records()` (worker): `record_id, application_id, opening_snapshot, status, submitted_at,
  decided_at, removed_at, removal_reason` (reuse the W5 snapshot mapper).
- `worker_contract_effective_status(p_status, p_end_date)`: the derived status shown before W12 expires contracts.

Notifications: category `worker_contract`, `subject_type = 'worker_contract'`, `subject_id = contract id` (open the
contract); texts in `AUDIT_AND_NOTIFICATIONS.md`. No Realtime: poll.

## BUILD (frontend part) - 2026-10-26

Frontend only (`frontend/src`); no migration, SQL test, script, backend or `.env` touched; nothing committed.
Data flow UI -> hooks -> services -> repositories -> Supabase; every write is an RPC; reads are the w9h / w9i invoker
RPCs plus three select-only reads (`worker_classification_options`, `contract_acknowledgement_texts`, the owner's own
draft `contract_versions` row with explicit columns). `grep -rn "service_role" frontend/src` is empty. Every added /
changed file <= 350 lines (largest: `WorkerContract.ts` 333, `OwnerDashboardContent.tsx` 323, fixtures 323).

Added (src/):
- domain: `models/WorkerContract.ts`, `models/WorkerContractInputs.ts`, `repositories/WorkerContractRepository.ts`,
  `utilities/workerContractActions.ts`, `utilities/contractDocumentDownload.ts`.
- infrastructure: `supabase/supabaseWorkerContractRows.ts`, `supabase/supabaseContractVersionRows.ts`,
  `supabase/supabaseWorkerContractErrorMessages.ts`, `repositories/SupabaseWorkerContractRepository.ts` (reads),
  `repositories/SupabaseWorkerContractActionRepository.ts` (RPCs only).
- application: `validation/workerContractSchemas.ts` (reuses W8 `findOwnerTextProblem` / `firstIssueMessage`),
  `services/WorkerContractRecordReads.ts`, `services/WorkerContractService.ts`, `services/WorkerContractResponseService.ts`.
- presentation: DI `createWorkerContractDependencies.ts`; hooks `useOwnerWorkerContracts`, `useContractEligibleWorkers`,
  `useWorkerContractDraftEditor`, `useWorkerContractActions`, `useMyWorkerContracts` (+ `useContractReviewSupport`),
  `useWorkerContractDocument`, `useWorkerContractVersionHistory`, `useRetainedApplicationRecords`; utilities
  `workerContractCopy.ts`, `workerContractDisplay.ts`; components `contracts/{ContractDocumentView, ContractProblemTermFlags,
  ContractDiffWithStandard (reuses clauseTextDiff), ContractAmendmentChanges, ContractAcceptanceRecords, ContractStatusBadge,
  ClassificationChoice, TerminateContractModal, ContractVersionRecordView, ContractVersionHistory}`,
  `owner/workerContracts/{OwnerWorkerContractsPanel, NewWorkerContractModal, WorkerContractDraftEditor,
  WorkerContractDetailsFields, SendContractModal, OwnerWorkerContractDetail}`, `worker/contracts/{MyContractsPanel,
  WorkerContractReview, AcceptContractModal, DeclineContractModal, RetainedApplicationRecords}`.
- tests: `test/workerContractFixtures.ts`; `owner/workerContracts/WorkerContractDraftEditor.j9.test.tsx`,
  `contracts/ContractDocumentView.j10.test.tsx`, `worker/contracts/WorkerContractReview.j11.test.tsx`,
  `contracts/ContractRoleActions.j12.test.tsx`, `infrastructure/repositories/SupabaseWorkerContractRepository.j17.test.ts`,
  `worker/contracts/MyContractsPanel.w9.test.tsx`, `owner/workerContracts/OwnerWorkerContractsPanel.w9.test.tsx`,
  `utilities/workerContractCopy.w9.test.ts`.

Changed: `presentation/components/owner/OwnerDashboardContent.tsx` (lazy "Worker contracts" tab, 306 -> 323 lines, no
`ownerDashboardTabs.ts` split needed), `features/owner/OwnerDashboardPage.tsx` + `dependencyInjection/createDashboardDependencies.ts`
(pass `workerContractDependencies`), `features/worker/{WorkerWorkspaceTabs.tsx, workerWorkspaceView.ts}` (lazy "Contracts"
tab), `dependencyInjection/createWorkerMarketplaceDependencies.ts` (carries `workerContractDependencies`, as W7 did for
certifications), `infrastructure/supabase/supabaseErrorMessages.ts` (spreads the W9 message list and patterns),
`infrastructure/supabase/supabaseJobApplicationRow.ts` (`mapOpeningSnapshot` exported for the retained records; no
behaviour change).

UI rules applied: "Acceptance record — not an e-signature" on every document view (text, record view header, print area),
acceptance record and accept modal; `DraftLegalReviewBanner` ("Draft template — requires legal review", draft notice,
"recorded acceptance (not an electronic signature)") on both panels; stored `rendered_text` shown verbatim (`pre`,
pre-wrap), short hash, Download (.txt Blob of the stored text, `washlink-contract-<8>-v<n>.txt`) and Print (print
stylesheet showing only the stored text); classification radios in `sort_order`, none preselected, contractor extra
checkbox (server text); statement texts always read from `contract_acknowledgement_texts` (send / accept not offered
if missing); flags always with the server disclaimer, zero -> no-match text; flags never disable Send; the owner confirms
the current flag count; pay details never prefilled; Decline (while pending) and End contract (while accepted / active)
always shown to the worker, Accept hidden when the shop or owner left; owner never sees accept / decline, worker never
sees send / activate / amend / withdraw; 55000 answers are reported as "... The contract was reloaded." and re-read.

Deviations from PLAN.md section 7 (small):
- Extra files for the 350-line limit and reuse: `WorkerContractInputs.ts` (RPC input types, re-exported from
  `WorkerContract.ts`), `supabaseContractVersionRows.ts` (version rows split from `supabaseWorkerContractRows.ts`),
  `WorkerContractRecordReads.ts` (shared record reads + validation error, base class of both services),
  `ContractVersionRecordView.tsx` / `ContractVersionHistory.tsx` (shared by owner detail and worker review),
  `WorkerContractDetailsFields.tsx` (draft details form).
- The draft editor reuses W8 `ContractTemplateSectionEditor`, `validateContractTemplateDraft` and `buildSaveParts`; its
  clause list is `contract_template_version_clauses(template_version_id ?? base_platform_version_id)` (the template the
  draft starts from, so editable bodies show the template text) rather than only the base standard; locked clauses are
  identical either way. Saves send the FULL set of contract-level edits (bodies that differ from that template text).
- The preview / flags / unfilled list reflect the last saved draft; Send is disabled while there are unsaved changes.
- The "New contract draft" form requires the contractor checkbox before creating (UI friction only; the server checks
  the acknowledgement at send / accept). Owner values are entered in the editor, not at creation.
- `amend` always uses the version in force (`p_template_version_id = null`); choosing another template for an
  amendment is not offered.
- One extra Vitest test, `w9_owner_contract_list_states` (owner list loading / empty / error); the plan's
  `w9_contract_lists_loading_empty_error_states` covers the worker list.

Actual results (frontend/, final run):
- `npm run lint`: `eslint .` no output, exit 0.
- `npm run build`: `tsc -b && vite build`, 2737 modules transformed, `built in 460ms`, exit 0 (lazy chunks
  `OwnerWorkerContractsPanel-*.js` 30.52 kB, `MyContractsPanel-*.js` 15.02 kB).
- `npm test`: `Test Files 97 passed (97)`, `Tests 191 passed (191)` (174 before W9 + 17 new), exit 0.
- Not run in this step: pgTAP runner, smokes, stager test, backend pytest (no DB, script or backend file changed).

## TEST & RUN - 2026-10-27

Local stack only; no commit; no `.env` read. No test added or changed (every PLAN section 6 name already present; 0
`todo_start(`). Docker Desktop was stopped at the start (first runner try exit 1, no tests ran); started once, then all green.
- Frontend: lint exit 0; build exit 0; `npm test` 97 files / 191 tests passed.
- `pytest -q`: 4 passed. Stager: 19 / 19 pass.
- `run-db-tests.mjs`: 62 migrations replayed, Files=63, Tests=2178, Result: PASS.
- Smokes on the same stack: w2 48, w3 33, w4 43, w5 39, w6 40, w7 38, w8 30, w9 34, all 0 failed.
- Stack stopped (`supabase stop --workdir .local-supabase-test --no-backup`).
- AC evidence greps (ROLLBACK, migration diff, line counts, service_role, W9-L, backend diff) in `TEST_RESULTS.md`.

## REVIEW, VERIFY, RECORD - 2026-10-27

- REVIEW: security (S1–S5) and compliance (C1–C6) both read-only; no BLOCKING findings; recorded by the orchestrator in
  `REVIEW.md`. New legal flags W9-L13..L17 (`LEGAL_FLAGS.md`) added to `docs/workforce/LEGAL_REVIEW_REGISTER.md` (OPEN).
  Fix cycles: 0.
- VERIFY: fresh verifier re-ran the suite from a clean state: lint 0, build 0, Vitest 97 files / 191 tests, pytest 4
  passed, stager 19/19, `Files=63, Tests=2178`, `Result: PASS` (62 migrations), smokes w2..w9 48 / 33 / 43 / 39 / 40 /
  38 / 30 / 34 passed, 0 failed each; stack stopped. AC1–AC15 PASS (`VERDICT.md`).
- RECORD: STATE.md W9 passed; loop paused (step mode); next W10. Not done: S1/C1 (trusted repair transitions), S2, C2–C5
  remain open non-blocking items; C6 to W10.
