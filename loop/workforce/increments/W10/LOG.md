# W10 - Owner relationships & three-distinct-owner policy - LOG

## BUILD (DB) - 2026-10-28

Local Docker stack only (staged `.local-supabase-test`, `--local`); no `.env` read, no link / push, no commit, no
repo-root CLI. No committed migration changed (`git status`: only new files under `supabase/migrations/`).

- Migrations (new, each with `-- ROLLBACK`, each <= 350 lines; staged `20261028000001..07`, 69 staged in total):
  `2026_10_28_w10a_owner_relationships_preflight.sql` (75), `w10b_worker_contract_forward_only_repairs.sql` (152),
  `w10c_workforce_policies.sql` (201), `w10d_worker_owner_relationships.sql` (171),
  `w10e_owner_relationship_derivation_and_sync.sql` (265), `w10f_owner_relationship_reads.sql` (77),
  `w10g_owner_relationship_audit.sql` (87).
- w10b guard = w9c body verbatim plus one block in the trusted branch (checked with `diff` of the two function bodies:
  the only difference is the 8-line W10 (D-40, P64) block). Comment keeps the `W9:` marker (+ `W10: forward-only trusted
  repairs.`); the full w9c body is in the ROLLBACK block.
- Seed helpers: new `scripts/supabase-test/baseline/test_helpers_owner_relationships.sql` (`create_accepted_test_contract`,
  `create_active_test_contract`, `relationship_row`, `relationship_live`; real W9 RPCs only, no relationship / policy /
  acceptance inserted). Stager `HELPERS_SOURCE_NAMES` gains it as the 5th entry; `stager_seeds_every_helper_file_in_order`
  updated (still 19 tests; test file stays at 350 lines).
- pgTAP: 9 new files: `j13_three_distinct_qualifying_owner_relationships_counted` 12,
  `j14_same_owner_contracts_and_amendments_count_once` 15, `j15_relationship_counting_policy_for_each_status` 27,
  `j15_w10_trusted_contract_repair_rules` 19, `j16_three_owner_rule_never_blocks_decline_or_termination` 19,
  `j13_w10_workforce_policy_rules` 20, `j13_w10_relationship_audit_and_sync` 18, `j17_w10_owner_relationship_authorization`
  21, `j18_w10_flows` 17. `001_migration_replay` (69 migrations, renamed `replay_schema_migrations_has_baseline_w2_to_w10`,
  + `replay_w10_relationship_and_policy_tables_rls_enabled`; plan 23). No other test file changed.

Deviations from PLAN.md (small):
- `refresh_worker_owner_relationship` has a third parameter `p_as_of date default null` (signature
  `(uuid, uuid, date)`), so `refresh_worker_owner_relationships(p_as_of)` derives every pair as of that date; the sync
  triggers call it with the default (Manila today).
- The refresh is also a no-op when the worker profile or the owner profile no longer exists (inside an account-deletion
  cascade the w10d FK cascade / set-null handles the row; re-inserting would violate the FK).
- `worker_owner_relationships.owner_id` FK is `on delete set null deferrable initially deferred` (W9 pattern).
  The guard compares old / new without the generated `counts_toward_goal` column when detecting the FK set-null.
- The relationship guard also keeps `owner_id` immutable outside the FK set-null and refuses any update of an
  owner_removed row; `workforce_policies_guard_write` also passes the `updated_by` FK set-null (admin removed) and
  uses `This part of a workforce policy cannot be changed.` (42501) for the immutable columns (plan gives no text).
- `my_owner_relationships()` returns `shop_names = '{}'` and `accepted_contract_count = 0` for owner_removed rows (the
  owner id is gone, so contracts cannot be matched without guessing by name).
- Suspended reason priority over the non-qualifying live active contracts: shop_removed, shop_owner_changed,
  owner_role_changed, else owner_verification_not_current (also the fallback when only the acceptance hash fails).
- The j16 static check matches `(from|join|update|into) public.workforce_policies` in `pg_proc.prosrc`; only
  `my_owner_relationship_progress` and `set_workforce_policy_value` read it (the other two reads do not need it).
- Policy realtime exclusion runs in w10c (policies) and again in w10d (both tables).

Actual results (final run of this step):
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: tests 19, pass 19, fail 0.
- `node scripts/supabase-test/run-db-tests.mjs`: 69 staged migrations replayed (20261028000001..07 applied);
  `Files=72, Tests=2347`, `Result: PASS` (before W10 files: 63 files / 2179 tests on the 69 migrations, also PASS);
  `grep -c "todo_start("` = 0 in every file.
- Existing smokes on the same stack: w2 48 passed / 0 failed; w3 33 / 0; w4 43 / 0; w5 39 / 0; w6 40 / 0; w7 38 / 0;
  w8 30 / 0; w9 34 / 0.
- Local stack stopped (`supabase stop --workdir .local-supabase-test --no-backup`).
- Not done in this step: `scripts/supabase-test/w10-api-smoke.mjs` (not written), frontend, docs, Vitest, pytest.

## BUILD (frontend) - 2026-10-28

Frontend only (`frontend/src`); no `.env` read, no Supabase call outside `infrastructure/`, no `service_role`, no commit.

- Added (domain): `domain/models/{OwnerRelationship.ts, WorkforcePolicy.ts}`, `domain/repositories/{OwnerRelationshipRepository.ts,
  WorkforcePolicyRepository.ts}`, `domain/utilities/ownerRelationshipProgress.ts` (remaining, goal state, progress bar value,
  status -> counts per D-3, `contractListSignal`).
- Added (infrastructure): `infrastructure/supabase/{supabaseOwnerRelationshipRows.ts, supabaseWorkforcePolicyRows.ts,
  supabaseOwnerRelationshipErrorMessages.ts}`, `infrastructure/repositories/{SupabaseOwnerRelationshipRepository.ts (the three read
  RPCs only, no arguments), SupabaseWorkforcePolicyRepository.ts (select `workforce_policies`; write only via
  `set_workforce_policy_value`)}`.
- Added (application): `application/validation/workforcePolicySchemas.ts` (zod: whole number 1..10, reason 10..300; same texts as
  w10c), `application/services/{OwnerRelationshipService.ts, WorkforcePolicyService.ts}`.
- Added (presentation): `utilities/{ownerRelationshipCopy.ts, ownerRelationshipDisplay.ts}`; hooks `useMyOwnerRelationshipProgress`,
  `useOwnerWorkerRelationships`, `useWorkforcePolicies`, `useWorkforcePolicyChange`; components
  `worker/contracts/{OwnerRelationshipProgressCard.tsx, MyOwnerRelationshipsList.tsx}`,
  `owner/workerContracts/OwnerWorkerRelationshipsList.tsx`, `superAdmin/{WorkforcePolicyPanel.tsx, ChangeWorkforcePolicyModal.tsx}`.
- Changed: `createWorkerContractDependencies.ts` (+ `ownerRelationshipService`), `createSuperAdminDependencies.ts`
  (+ `workforcePolicyService`), `MyContractsPanel.tsx` (progress card + list above the contract list in the list view only; new
  optional `onFindWorkRequested`), `WorkerWorkspaceTabs.tsx` (Find work switches to `find_work`), `OwnerWorkerContractsPanel.tsx`
  (owner relationship list under the contract list), `SuperAdminDashboardPage.tsx` (lazy-loaded policy panel section),
  `supabaseErrorMessages.ts` (spreads the W10 messages), `OwnerDashboardContent.tsx` (passes the service; see deviations).
- Unchanged on purpose (J16 / AC6): `git diff e43c2db -- frontend/src/presentation/components/contracts/TerminateContractModal.tsx
  frontend/src/presentation/components/worker/contracts/DeclineContractModal.tsx .../AcceptContractModal.tsx
  .../WorkerContractReview.tsx` = 0 lines. No existing test file changed.
- Vitest (new, 9 files / 15 tests, all section-6 names): `OwnerRelationshipProgressCard.j13` (2), `MyOwnerRelationshipsList.j14` (1),
  `ownerRelationshipDisplay.j15` (2), `MyContractsPanel.j16` (3), `SupabaseOwnerRelationshipRepository.j17` (2),
  `OwnerWorkerRelationshipsList.w10` (2), `WorkforcePolicyPanel.w10` (1), `OwnerRelationshipProgressCard.w10` (1),
  `WorkerWorkspaceTabs.w10` (1). New fixture `src/test/ownerRelationshipFixtures.ts`.

Deviations from PLAN.md (small):
- `WorkerContractDependencies.ownerRelationshipService` and `OwnerWorkerContractsPanel`'s `ownerRelationshipService` prop are
  OPTIONAL (the factory always provides the service; the card / owner list render only when it is given), so the existing W9 tests
  that build the dependencies by hand stay unchanged and type-check.
- `OwnerDashboardContent.tsx` (not listed in section 7) changed by one prop to pass the service to `OwnerWorkerContractsPanel`.
- W10 database messages live in a new `supabaseOwnerRelationshipErrorMessages.ts`, spread into `supabaseErrorMessages.ts`
  (W9 pattern). The internal 22023 refresh-date message is not mapped (no client can call the refresh).
- Worker card heading is "Progress toward working with different shop owners" rather than spec H's "...three-distinct-owner
  business requirement": the minimum is configurable (1..10) and "requirement" would contradict D-3 / W10-L1; the plan's notice
  text is used verbatim. Copy is checked by `j16_progress_copy_is_informational_and_never_an_obligation` (no must / required /
  obligation / condition / block wording outside the negated notice phrases).
- The progress card is hidden while a single contract is open (so the terminate / decline modals never sit next to goal text) and
  re-reads progress when the contract list signature (id, revision, effective status) changes, besides the 60 s poll.
- `owner_removed` rows show no shop names or contract count (the DB returns `{}` / 0 for them, per BUILD (DB)).

Actual results (final run, in `frontend/`):
- `npm run lint`: exit 0, no problems.
- `npm run build`: exit 0 (`tsc -b && vite build`, built in 885ms; separate lazy chunk `WorkforcePolicyPanel-*.js` 6.58 kB).
- `npm test`: Test Files 106 passed (106), Tests 206 passed (206) (baseline before W10: 97 files / 191 tests).
- `grep -rn "service_role" frontend/src`: 0 matches. Largest changed / added file: `OwnerDashboardContent.tsx` 326 lines (all <= 350).
- Not done in this step: docs (`docs/workforce/OWNER_RELATIONSHIPS.md` etc.), `w10-api-smoke.mjs`, pytest.

## BUILD (docs) - 2026-10-28

Added `docs/workforce/OWNER_RELATIONSHIPS.md` (263 lines: D-3 / D-36..D-40, P55-P64, counting table per status,
tables, state machine, derivation / sync / live vs stored, forward-only repairs, policy RPC and messages, read RPCs,
privacy, audit, frontend, limitations, rollback, tests) describing the DB as built, including the BUILD (DB) deviations
(refresh `p_as_of`, no-op for missing profiles, deferrable owner FK, immutable-column message, `owner_removed` reads,
suspended-reason priority; also: the contract sync trigger filters columns in its body rather than a WHEN clause, an
inactive shop and a hash mismatch both give `owner_verification_not_current`, name-snapshot fallbacks `Shop owner` /
`Worker`) and the frontend deviations (card heading wording instead of spec H's "requirement", card hidden while a
contract is open, optional dependency props). Updated `WORKER_CONTRACTS.md` (forward-only repairs in P45, limitations,
rollback order; 239 lines), `AUDIT_AND_NOTIFICATIONS.md` (W10 section; W3 paragraphs re-wrapped to 118 columns with
identical words to stay at 350 lines), `ROLE_AND_PROFILE_SECURITY.md` (D-10 rows 40-42 incl. the parity note for the
new AFTER triggers on `shops` / `profiles` / `worker_contracts` and the replaced w9c guard body; W10 guard matrix; 218
lines), `LOCAL_TEST_HARNESS.md` (69 migrations, 5th helper file, W10 fixtures, 72 files / 2347 assertions, 9 pgTAP rows,
W10 smoke section with the planned checks and the count left to the test step; W2..W8 smoke and staging sections
re-wrapped to 150 columns with identical words; 333 lines) and `LEGAL_REVIEW_REGISTER.md` (W10 section with notes on
W0-L1, W2-L2, W9-L6, W9-L17 and W10-L1..L8, all OPEN; `grep -c "W10-L"` = 11; 232 lines). Added
`loop/workforce/increments/W10/LEGAL_FLAGS.md` (W9 format, W10-L1..L8 OPEN with as-built sources). No file under
`scripts/`, `supabase/` or `frontend/` touched in this step; nothing claims legal validity or compliance; no commit.

## TEST & RUN - 2026-10-28

Local stack only; no `.env` read, no `--linked` / `--db-url` / `db push`, no commit, no `docs/` edit.

- Added `scripts/supabase-test/w10-api-smoke.mjs` (38 checks): direct insert / update / delete denied on both W10 tables for owner,
  worker, service_role, super_admin and anon; `set_workforce_policy_value` denied for owner, worker, customer, service_role, anon;
  policy seeded 3 / informational; worker progress 0 / remaining 3, then 1, then 3 / 0 with three owners; second shop of owner A
  still 3 with 2 contracts on the owner A row; accepted amendment still 3; verification lapse suspends owner B (2), re-approval
  restores (3); super_admin raises the minimum to 5 (remaining 2, stale revision 55000), audit row without reason text; worker
  terminates owner C below the minimum (count 2) and declines owner D's offer (no relationship row); policy restored to 3 (second
  audit); owner A sees only its own row, no progress, exact column set; other worker / other owner / super_admin / customer / anon
  see no relationships; refresh, derive, qualifies, count and `set_config` not callable by owner, worker, service_role, anon;
  owner B deleteUser -> `owner_removed`, count 1, audited; worker deleteUser -> rows gone, 3 `.deleted` audit events.
- Results: frontend lint 0, build 0, `npm test` 106 files / 206 tests; pytest 4 passed; stager 19 pass; `run-db-tests.mjs`
  Files=72, Tests=2347, Result: PASS (69 migrations); smokes w2..w10 = 48 / 33 / 43 / 39 / 40 / 38 / 30 / 34 / 38 passed, 0 failed;
  stack stopped. Full table: `TEST_RESULTS.md`. No product bug found; the AC13 docs part is still in progress (not final).

## FIX CYCLE 1 (DB) - 2026-10-28

Uncommitted W10 migrations edited in place (local stack only; no commit, no `.env`, no link / push).

- w10c: `workforce_policies` SELECT is super_admin only (`wp_select_super_admin`: `auth.uid()` set and `is_super_admin()`;
  replaces `wp_select_signed_in`). Workers read the minimum only through the definer RPC `my_owner_relationship_progress`
  (still works: pgTAP j13 / j17, smoke). The super_admin panel's direct select is unaffected (smoke `policy()` reads as
  super_admin).
- w10d: owner branch dropped from the select policy (now `wor_select_own_worker`: worker's own rows only); owners read
  through `owner_worker_relationships()` only (D-38). Header P55 wording: "a trusted session cannot write rows without
  deliberately setting the internal flag; the audit trigger still records such writes".
- w10f: `status_changed_at` in `my_owner_relationships()` and `owner_worker_relationships()` is NULL when the live
  status differs from the stored one (stale "since" date); otherwise the stored stamp.
- pgTAP: `j17_w10_owner_relationship_authorization` 21 -> 26 (owner direct select returns 0 rows; owner / worker /
  customer select 0 policy rows; the worker still gets the minimum via the RPC; service_role has no INSERT / UPDATE /
  DELETE on `worker_contracts`, `workforce_policies`, `worker_owner_relationships`); `j13_w10_relationship_audit_and_sync`
  18 -> 22 (`w10_stale_since_date_is_null`, using a TEST-ONLY end-date shift under `session_replication_role = replica`
  inside the test transaction; the later full-refresh expectation is now 1 changed row). `j13_three_distinct...`
  reads the policy as the trusted session (the worker can no longer select it). Other files unchanged.
- Smoke `w10-api-smoke.mjs`: owner direct table read must now return 0 rows; new check
  `only_super_admin_selects_workforce_policies` (owner, worker, customer).
- Docs: `OWNER_RELATIONSHIPS.md` (P55 wording, P61, RLS of both tables, `status_changed_at` null semantics, privacy),
  `ROLE_AND_PROFILE_SECURITY.md` (W10 guard matrix read column and trusted row), `ARCHITECTURE_AUDIT.md` (table row),
  `LEGAL_REVIEW_REGISTER.md` (W10-L4 / L5 line references). Frontend comments only in
  `SupabaseWorkforcePolicyRepository.ts` and `supabaseWorkforcePolicyRows.ts` (no behaviour change; the policy table is
  read only by the super_admin panel).

Actual results:
- `node scripts/supabase-test/run-db-tests.mjs`: 69 migrations replayed; `Files=72, Tests=2356`, `Result: PASS`;
  0 `todo_start(` in every file. (The first run of this cycle failed: 2 test-only issues, an `ALTER TABLE` with pending
  deferred-FK trigger events and an expectation broken by an earlier trusted policy write in the same file; both fixed.)
- Smokes on the same stack: w2 48 / 0; w3 33 / 0; w4 43 / 0; w5 39 / 0; w6 40 / 0; w7 38 / 0; w8 30 / 0; w9 34 / 0;
  w10 39 / 0.
- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: 19 / 19 pass.
- Local stack stopped (`supabase stop --workdir .local-supabase-test --no-backup`).
- Not run: frontend lint / build / Vitest (only two doc comments changed in frontend).

## FIX CYCLE 1 (frontend) - 2026-10-28

Frontend and `docs/workforce/OWNER_RELATIONSHIPS.md` only; no `.env` read, no commit.
- `status_changed_at` is nullable: `MyOwnerRelationship.statusChangedAt` / `OwnerSideWorkerRelationship.statusChangedAt`
  are `string | null` (`domain/models/OwnerRelationship.ts`, `infrastructure/supabase/supabaseOwnerRelationshipRows.ts`);
  `describeStatusSince` (in `ownerRelationshipDisplay.ts`) returns null for a null stamp, and `MyOwnerRelationshipsList` /
  `OwnerWorkerRelationshipsList` then show no "Since" line.
- C1 / W10-L9: the label for the database status `suspended` is no longer "Suspended". Worker: "Not counting right
  now"; owner: "Needs attention" (new `ownerSideStatusDisplay` and `relationshipStatusLabel(status, viewerRole)`; the
  owner list uses the owner labels). The coordinator suggested "Shop verification needs attention" for the owner; I used
  "Needs attention" because `suspended` also covers a removed shop, a transferred shop and an owner role change, and
  the owner-worded reason line beneath it names the cause. Worker counting text: "Does not count toward your progress
  goal right now. Your contract itself is unchanged. It counts again on its own once the reason below is resolved."
- `describeOwnerGoalSource`: a minimum of 1 reads "Goal set by WashLink: 1 shop owner." (was "1 different shop owners").
- Tests: `ownerRelationshipDisplay.j15.test.tsx` adjusted to the new label and counting text (and asserts no
  "suspend" in the row); new `presentation/utilities/ownerRelationshipFixCycle.w10.test.tsx` (3 tests:
  `w10_suspended_label_is_counting_neutral_for_worker_and_owner`, `w10_since_date_hidden_when_status_changed_at_is_null`,
  `w10_goal_source_grammar_for_minimum_one`). The j16 wording test (`j16_progress_copy_is_informational_and_never_an_obligation`)
  still passes; it now also covers the owner label.
- Docs: `OWNER_RELATIONSHIPS.md` updated (D-36 UI-label note, status labels, counting text, goal-source grammar, since
  date shown only when not null, super_admin-only policy select, Vitest counts; 280 lines).

Actual results (in `frontend/`): `npm run lint` exit 0; `npm run build` exit 0 (built in 616ms); `npm test` Test Files
107 passed (107), Tests 209 passed (209) (was 106 / 206). `git diff e43c2db --` on `TerminateContractModal.tsx`,
`DeclineContractModal.tsx`, `AcceptContractModal.tsx` and `WorkerContractReview.tsx`: 0 lines. `grep -rn "service_role"
frontend/src`: 0 matches.

## REVIEW, VERIFY, RECORD - 2026-10-28

- REVIEW: security (S1–S7) and compliance (C1–C8) read-only in parallel; no BLOCKING findings (`REVIEW.md`). Both flagged the
  policy row being readable by every signed-in user (S1 = C3, contrary to PLAN P61). Orchestrator ran fix cycle 1 (W10 still
  uncommitted, migrations edited in place): policy select super_admin only; owners read relationships only via the RPC;
  `status_changed_at` null when live differs from stored; service_role write-privilege assertion; P55 wording; counting-neutral
  labels; goal-source grammar. New legal flags W10-L9..L11 added to the register (OPEN). Fix cycles: 1.
- VERIFY: fresh verifier re-ran the suite from a clean state: lint 0, build 0, Vitest 107 files / 209 tests, pytest 4 passed,
  stager 19/19, `Files=72, Tests=2356`, `Result: PASS` (69 migrations), smokes w2..w10 48 / 33 / 43 / 39 / 40 / 38 / 30 / 34 / 39
  passed, 0 failed each; stack stopped. AC1–AC13 PASS (`VERDICT.md`); note: PLAN.md 357 lines, treated as a planning document.
- RECORD: DECISIONS D-36..D-41 ADOPTED-DEFAULT (loop, 2026-10-28); LOOP.md check suite gains the W10 smoke row and counts;
  STATE.md W10 passed; loop paused (step mode); next W11. Carry-forwards: S2/S3/C8 to W12, S4 to W13.
