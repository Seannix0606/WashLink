# Local test harness (W1, hardened in W2, extended in W3, W4, W5, W6, W7, W8, W9 and W10)

Local Docker Supabase only. Nothing here touches the linked project, and local results say
nothing about the linked project (D-10).

## Run

```sh
node --test scripts/supabase-test/stage-local-workdir.test.mjs   # stager unit tests
node scripts/supabase-test/run-db-tests.mjs                       # stage, start, reset, pgTAP
npx supabase stop --workdir .local-supabase-test --no-backup      # when done
```

`run-db-tests.mjs` is equivalent to:

```sh
node scripts/supabase-test/stage-local-workdir.mjs
npx supabase start --workdir .local-supabase-test   # skipped if `status` reports it running
npx supabase db reset --local --workdir .local-supabase-test
npx supabase test db  --local --workdir .local-supabase-test
```

Expected (after W10): the reset applies 69 migrations (baseline `00000000000000`, the 2026_04_17 copy, owner-policies baseline
`20260417000002`, the other 4 pre-W2 copies, the 6 W2 copies `20261024000001..06`, then the 5 W3 copies `20261024000007..11`: w3a, w3b,
w3c, w3d0 preflight, w3d, then the 4 W4 copies `20261024000012..15`: w4a preflight, w4b, w4c, w4d, then the 5 W5 copies
`20261025000001..05`: w5a preflight, w5b..w5e, then the 9 W6 copies `20261025000006..14`: w6a preflight, w6b..w6i, then the 8 W7 copies
`20261026000001..08`: w7a preflight, w7b..w7h, then the 8 W8 copies `20261026000009..16`: w8a preflight, w8b..w8h, then the 10 W9 copies
`20261026000017..26`: w9a preflight, w9b..w9j, then the 7 W10 copies `20261028000001..07`: w10a preflight, w10b..w10g) and seeds the
five helper files in order (`test_helpers.sql`, `test_helpers_certifications.sql`, `test_helpers_contract_templates.sql`,
`test_helpers_worker_contracts.sql`, then `test_helpers_owner_relationships.sql`); `test db` runs 72 files (2347 assertions after the W10
DB build; 63 files / 2179 on the 69 migrations before the W10 test files; 63 / 2178 after the W9 build; 54 / 1947 before W9; 47 / 1713
before W8; 38 / 1409 before W7) and ends with `Result: PASS`. There are 0 TODO blocks: any `Failed (TODO)` or `TODO passed` line is a finding.

## Why a staged workdir

- D-1: `profiles`, `workers`, `bookings` and the signup trigger are not in `supabase/migrations/`.
  `scripts/supabase-test/baseline/local_test_baseline.sql` reconstructs them (from code + migrations, see `ARCHITECTURE_AUDIT.md`). The baseline files
  live outside the repo's `supabase/` folder entirely: in `supabase/migrations/` `db push` would send them to a real project, and `supabase test db`
  (also with `--linked`/`--db-url`) runs EVERY `.sql` under `supabase/tests/`. Since W2 (S11) the stager refuses to run, and the stager test
  `repo_has_no_stray_sql_under_supabase` fails, if any `.sql` exists anywhere under `supabase/` other than `supabase/migrations/*.sql` and
  `supabase/tests/database/*.sql` (no `seed.sql`, no nested folders).
- Seed rule (W2, S10): the repo `supabase/config.toml` keeps `[db.seed] enabled = false`, so a reset run from the repo root by mistake never seeds
  anything. The stager rewrites it to `enabled = true` (with the staged `sql_paths`) in the staged copy only, and refuses to stage if the `enabled =
  false` line is missing from the repo config.
- Project id rule (W2, S11): the stager asserts the staged `project_id` ends in `-local-test`; `run-db-tests.mjs` re-reads
  `.local-supabase-test/supabase/config.toml` before every CLI call and exits 2 if it does not.
- Baseline sources (`scripts/supabase-test/baseline/`): `local_test_baseline.sql` -> staged migration `00000000000000` (profiles, workers, bookings,
  signup trigger); `local_test_baseline_owner_policies.sql` -> staged migration `20260417000002`, directly after the 2026_04_17 copy
  (`20260417000001`, adds `bookings.shop_id`) and before every later committed migration, so W2 migrations can drop or replace
  `bookings_owner_select_local_test` / `bookings_owner_update_local_test`; `test_helpers.sql`, `test_helpers_certifications.sql` (W7),
  `test_helpers_contract_templates.sql` (W8), `test_helpers_worker_contracts.sql` (W9) then `test_helpers_owner_relationships.sql` (W10;
  `HELPERS_SOURCE_NAMES`, all required) -> the staged seed in that order (helpers only, runs after all migrations). The stager aborts if any committed
  migration collides with that slot.
- D-11: Supabase CLI 2.122.0 parses `YYYY_MM_DD_<desc>.sql` as version `2026`, so the second file collides in `schema_migrations` (evidence in
  `loop/workforce/increments/W1/LOG.md`). The repo keeps its naming (LOOP rule 3); the stager copies each migration byte-identical (sha256-checked)
  under a 14-digit name (`YYYYMMDD` + per-date sequence). A human decides on renaming before any `db push`.
- The gitignored `.local-supabase-test/` has `project_id = "washlink-local-test"`, no `.temp/project-ref` and no `.env`, so the CLI cannot target a
  remote project from it. Layout: `supabase/migrations/` (the 2 baseline migrations + the 67 copies), `supabase/local_test_baseline/test_helpers.sql`
  and `test_helpers_certifications.sql` (seed; kept outside `tests/` because `test db` runs every `.sql` there), `supabase/tests/database/` (pgTAP
  files).
- Do not run `supabase start`/`db reset` from the repo root: the CLI loads the root `.env` and the root migrations cannot replay (no baseline, version
  collision).

## pgTAP conventions

- Files: `supabase/tests/database/*.test.sql`; each is `begin; ... plan(n); ... finish(); rollback;`. Fixture emails end in `@local.test`.
- Helpers (`test_helpers` schema, seed only): `create_user/customer/owner/worker/super_admin`, `act_as(uuid)`,
  `act_as_customer/owner/worker/admin(email)`, `act_as_anon()`, `act_as_service()`, `attempt(sql)`, fixtures `create_shop`, `set_shop_price`,
  `create_roster_worker`, `create_booking_fixture`, W4 `create_verified_shop(owner, reviewer)` (approved with a recorded review) and
  `create_job_opening(shop, title)` (complete draft), W5 `create_worker_profile(worker)`, `publish_job_opening(opening)` (trusted, skips the publish
  gate) and `create_job_application(opening, worker, status default 'submitted')` (trusted insert with the stamps and snapshot the status requires;
  audited `trusted_session`, no notification), W6 `manila_today()`, `create_training_program(shop, days default 3)` (complete draft, 2-item
  checklist), `add_training_session(program, date, kind default supervised_training)` (any date: past sessions are a TEST-ONLY time shift),
  `open_training_program(program)` (trusted, skips the open gate), `designate_trainer(program, roster row)` and `create_accepted_enrollment(program,
  worker, accepted_at default now() - 10 days)` (backdated acceptance with notice and snapshot); evidence is never seeded, tests record it through the
  real RPCs as the owner or a trainer (fixtures require `act_as_service()`). W7 (`test_helpers_certifications.sql`):
  `record_training_completion(enrollment, owner_email)` (present on every past supervised session since acceptance + a passed assessment, through the
  real W6 RPCs as the owner), `complete_training(shop, worker, owner_email)` (program with 3 past sessions, opened, accepted enrollment, then the
  completion) and `issue_test_certification(shop, worker, owner_email)` (`complete_training`, then the real `issue_certification` as the owner;
  returns the certification id); `backdate_certification(certification, days)` is a TEST-ONLY time shift (W7 R7): it disables the W7 guards for one
  statement each (superuser, inside the test transaction) to move issue / expiry stamps, status history and re-assessments into the past. All start
  and end in a trusted session.
- W9 (`test_helpers_worker_contracts.sql`, real RPCs as the actor): `create_accepted_application` (trusted), `create_test_contract_draft(owner_email,
  shop, worker, template_version = latest standard, classification = 'employee')`, `fill_test_contract_draft` (neutral text in every editable clause;
  JSON null keeps the template body), `send_test_contract` (statements + live flag count), `accept_test_contract`. No fixture inserts an acceptance
  (P47).
- W10 (`test_helpers_owner_relationships.sql`): `create_accepted_test_contract(owner_email, shop, worker, worker_email, end_date default null)`
  (trusted accepted application, then the real W9 RPCs: draft, fill, send, accept), `create_active_test_contract(...)` (then the owner activates),
  `relationship_row(worker, owner)` (stored status, reason, count), `relationship_live(worker, owner)`. No helper inserts a relationship, a policy or
  an acceptance.
- Ids are passed between statements with `set_config('fx.<name>', ..., true)` / `current_setting('fx.<name>')`, readable under any role.
- Never print a bare `ok` from a plain `select`: TAP counts it as a test.

## TODO placeholders (honesty rule)

W1 shipped 8 `todo_start(` wrappers (F5 in j18; E1, E2, E3, E5, S1, S2, S9 in j17). W2 removed all of them: `grep -c "todo_start("
supabase/tests/database/*.sql` is 0 for every file. The j17 assertions are unchanged; F5 was rewritten to call `submit_shop_for_verification()` (the
direct UPDATE stays rejected: `j17_owner_cannot_directly_resubmit_changes_requested_shop`). The baseline still reproduces the weaknesses on purpose,
so those assertions only pass because the W2 migrations fix them. Any new `todo_start(` is a FAIL unless a plan allows it.

## pgTAP files (after the W10 DB build: 72 files, 2347 assertions)

| File | Plan | Covers |
|---|---|---|
| `000_harness_sanity.test.sql` | 9 | helpers, identity switching |
| `001_migration_replay.test.sql` | 23 | replay of 69 migrations (`replay_schema_migrations_has_baseline_w2_to_w10`), W2 objects, W2..W10 RLS on, definer search_path |
| `j17_authorization_harness.test.sql` | 40 | W1 J17 + former placeholders, S4 counterparties, S5 |
| `j17_w2_fix1_fk_cascades.test.sql` | 31 | S-B1: `on delete set null` cascades (customer, linked worker account, reviewing admin, owner, roster rows in any booking status) pass every guard and change only the FK column |
| `j17_w2_fix1_review_and_hardening.test.sql` | 42 | C-B1 review stamping, stricter gate, D-10 audit query; fail-closed trusted session; booking/shop/document hardening; peppered, locked, pruned link-code attempts; realtime exclusion; no availability default |
| `j17_w2_shop_booking_guards.test.sql` | 32 | E3/C3, S6, S7, F5 guard, gate helper, trusted session, booking transitions |
| `j17_w2_worker_data_guards.test.sql` | 34 | worker profile / contact privacy, link-code RPC authorization |
| `j17_w3_audit_events.test.sql` | 60 | W3 audit table: server-only insert, append-only for every role, trusted retention purge, derived actor fields, super_admin read, payload rules, realtime exclusion, R-1 `pg_temp` pinning and temp-table shadowing |
| `j17_w3_audit_wiring.test.sql` | 31 | every wired W2 action writes its event (shop decision / submission / S6 reset, link code, link, worker / owner unlink, linked row delete, worker profile delete, trusted role change), review log survives reviewer deletion and is super_admin only, no private data in payloads |
| `j17_w3_notifications.test.sql` | 61 | recipient isolation, no direct insert / enqueue / edit, mark-read rules and idempotency, producer once-only, text rules and safe label, deleted recipients |
| `j18_existing_flows.test.sql` | 64 | W1 J18 + F5 RPC + every W2-guarded frontend write path |
| `j18_w2_profile_reads.test.sql` | 19 | R2: profile and counterparty-name reads, phone_number privacy |
| `j18_w3_flows.test.sql` | 21 | W2 review / link / unlink flows and shop, owner and worker deletes still work with the W3 AFTER triggers and leave sensible audit rows (j18_existing_flows is at the 350-line limit) |
| `j1_worker_registration_and_profile.test.sql` | 55 | J1 signup roles, worker profile, roster link codes (W4: the linked owner's shop is a `create_verified_shop` fixture, R-2) |
| `j17_w3_idempotency_and_leaks.test.sql` | 24 | W3 producer idempotency and payload leaks |
| `j2_owner_can_create_and_manage_only_own_job_openings.test.sql` | 63 | J2: own-shop create / edit / delete, drafts private, worker-only published reads, pay stored as entered, no defaults, limits, 50 per shop |
| `j2_job_opening_lifecycle.test.sql` | 48 | J2 lifecycle matrix, stale 55000, RPC-only status, read-only closed/archived, published edit rules, audit without content, no notifications |
| `j3_unverified_owner_cannot_publish_job_openings.test.sql` | 42 | J3: publish / resume need a recorded verification; losing it (decision, S6, reviewer deletion) hides openings from workers |
| `j17_w4_job_opening_authorization.test.sql` | 35 | privileges, internal functions, super_admin write denial, pinning, realtime, R-2 shared rule, cascades, trusted repair |
| `j18_w4_flows.test.sql` | 14 | shop edit / delete, admin review, roster preview and bookings unaffected by W4 |
| `j4_worker_can_browse_and_apply_without_duplicates.test.sql` | 90 | J4: worker-only search (filters, escaping, limits, stated pay only), apply with / without cover note, profile and notice required, duplicates, reapply and open-application limits, deadline (Manila), status and P15 refusals, write-once snapshot for every session (W7: fixture-only change, the applicant to the certification_required opening first receives a certificate, D-20) |
| `j5_application_status_transitions_are_validated.test.sql` | 73 | J5: owner pipeline, worker submit / withdraw, full (from, to, actor) matrix incl. super_admin, stale 55000, draft edit / delete, direct writes denied, accept needs a verified shop, auto-close on close / trusted archive, pause keeps applications open, trusted repair audited |
| `j5_application_audit_and_notifications.test.sql` | 38 | audit per action, payload and text rules, owner / worker notifications, pause once, idempotent keys, unsafe title label, cascades notify the surviving party |
| `j17_w5_application_authorization.test.sql` | 56 | privileges and RLS, cross-tenant reads and writes, applicant profiles (sharing statuses, no contact columns), no private contacts or worker_profiles for owners, certifications empty until W7, applicant opening read, internal functions, anon, pinning, realtime, invoker search, cascades |
| `j18_w5_flows.test.sql` | 20 | W4 lifecycle, published edits, worker profile self-service, roster links and bookings with applications present |
| `j6_worker_cannot_complete_training_without_three_days_and_assessment.test.sql` | 40 | J6 training part / C2: derived completion (>= 3 distinct attended supervised days + passed assessment), one row per day, absent and assessment days do not count, corrections, recording windows, predicate = view |
| `j6_w6_training_program_and_enrollment_lifecycle.test.sql` | 53 | program and enrollment state machines per actor, open gate (verified shop, 3 days, attestation), frozen content, stale 55000, invitations from accepted applications, notice + schedule check, write-once terms snapshot, session cancel rules |
| `j6_w6_training_audit_and_notifications.test.sql` | 23 | audit per action, payload keys and leaks, worker / owner / trainer notifications, schedule change once per event, idempotency, refused actions write nothing |
| `j7_required_initial_training_is_free_to_the_worker.test.sql` | 23 | J7: fee forced to 0 for every session, no fee / charge parameter or column, no FK or write path to bookings / pricing, pay optional / verbatim / all-or-nothing, notice and snapshot, trainee not assignable |
| `j8_unauthorized_users_cannot_alter_training_evidence.test.sql` | 41 | J8 training part: only owner or designated linked trainer records; trainee, other owner, revoked / unlinked trainer, customer, super_admin, anon refused; server stamps; linear corrections; append-only for every session; cascade-only delete |
| `j17_w6_training_authorization.test.sql` | 45 | privileges and policies, per-audience reads, no contact columns, invoker view, internal functions, anon, pinning, realtime, worker-account cascade |
| `j18_w6_flows.test.sql` | 24 | C7 gate scope (assign / start), other owners and finished trainees unaffected, quotes, ratings, W5 flow, shop and account deletion |
| `j18_w6_d18_training_evidence_retention.test.sql` | 30 | D-18: shop and owner-account deletion (untrusted) succeed and retain enrollments / evidence with snapshots, unenrolled programs removed, `shop_removed` progress, no recorder left, gate lifts, trusted program delete restricted |
| `j6_worker_cannot_be_certified_without_three_days_and_assessment.test.sql` | 42 | J6 certification part: no certificate without >= 3 days + current pass (incl. corrections), stale 55000, attestation, approver / assessor / time, evidence snapshot, server stamps (no backdating, also for a flagged trusted insert), validity 12 / per shop, one original, one live per program, withdrawn / cancelled / shop removed, `shop_issued` only, RPC-only insert |
| `j3_unverified_owner_cannot_issue_shop_certifications.test.sql` | 29 | J3 certification half: pending / rejected / changes_requested / unreviewed / inactive shops cannot issue; other owner, trainer, worker, customer, super_admin, anon refused; verification snapshot (status, reviewer, time, audit event); after losing verification no issue / renew / reinstate but suspend / revoke allowed; issued certificates survive |
| `j6_w7_certification_lifecycle.test.sql` | 68 | suspend / revoke reasons, reinstate rules, revoked final, disallowed / stale transitions, review requests (30 days, one open, max 3), decisions, derived expiry, re-assessment window and recorders, renewal rules and supersession, corrected evidence flags only, append-only history, expiry notices |
| `j8_unauthorized_users_cannot_alter_certification_records.test.sql` | 38 | J8 certification half: no client / service_role writes, issued facts immutable for every session, other owner / worker / trainer / customer / super_admin / anon refused, append-only history, review audiences, cascade-only delete |
| `j4_w7_certification_required_openings.test.sql` | 27 | D-20: create and draft submit refused without a current certificate, any shop counts, suspended / revoked / expired / superseded do not, trainees_welcome unaffected, existing applications untouched, applicant reads current-only with the W5 window, W5 check order |
| `j6_w7_certification_audit_and_notifications.test.sql` | 16 | audit per action, payload keys and leaks, worker / owner notifications, idempotent keys, text rules, refused actions write nothing |
| `j17_w7_certification_authorization.test.sql` | 31 | privileges and RLS, per-audience reads, other owners current-only inside the W5 window, no reasons / contacts, internal functions closed, anon, pinning, realtime, P35 |
| `j18_w7_flows.test.sql` | 26 | D-18 / D-23 shop and owner deletion retain certificates, worker deletion cascades with audit, training / applications / bookings / verification unchanged |
| `j9_owner_can_customize_contract_draft_and_save_reusable_template_version.test.sql` | 36 | J9 (W8 leg; W9 adds the worker-contract-draft leg): start from the standard, 15 spec sections each with the draft notice, customise editable bodies, shop terms, new immutable hashed version per save, identical / stale saves refused, reuse a version, history, preview labels, diff, locked safeguards, no preselected relationship type |
| `j9_w8_contract_template_rules.test.sql` | 65 | write flag for every session, write-once versions / clauses, sealed version, commit validator for trusted SQL (altered locked clause, missing section / base clause, forged hash, section-4 term), shop-term sections, placeholders, safeguard impersonation, size / count limits (40 terms, 4000 / 120000 chars, 200 versions), archived, 25 active, publish + rebase, older base, core safeguards, draft-only review status, classification vocabulary, starter text scan, platform never deleted |
| `j9_w8_contract_template_audit.test.sql` | 15 | audit per action (create, save, rename, status, publish, owner deletion), payload keys without names / text / hashes, refused actions write nothing, no notifications |
| `j17_w8_contract_template_authorization.test.sql` | 41 | privileges and RLS, owners own + standard, other owner / worker / customer / anon nothing, super_admin standard only, no owner publish, foreign ids return nothing, internal functions closed, anon, pinning, realtime, no fee / pay columns |
| `j18_w8_flows.test.sql` | 19 | owner deletion cascades templates and keeps audit, platform and other owners survive (publisher deletion: saved_by set null), bookings / verification / openings / training / certifications / applications unchanged |
| `j19_w7_review_polish.test.sql` | 27 | review polish: certified worker-profile delete refused (account deletion still works), direct reinstate closes the open review, no uphold on an active certificate, revoke keeps the review decidable, worker reads no raw rows, legacy approved shop without reviewer 23514, applicant read issuer-verified flag |
| `j9_w9_owner_customizes_worker_contract_draft.test.sql` | 30 | J9 contract half: draft from an own template version / the standard for an accepted applicant or completed trainee, eligibility, explicit classification, contract-level edits and shop terms, template unchanged, unfilled list and live flags, diff (template vs contract edits), locked clauses verbatim, stale save, one open contract |
| `j10_accepted_contract_contents_preserved_after_template_change.test.sql` | 27 | J10: sealed text + sha256 recompute, text format, immutability for every session, acceptance records and label, template save / platform publish / owner deletion leave the text unchanged |
| `j11_material_contract_amendments_require_acceptance.test.sql` | 28 | J11: amendment drafts, not in force until accepted, supersede and keep, decline / withdraw keep current terms, stale hash, no direct edit or minor path, one open amendment, verified send, change list, termination |
| `j12_worker_and_owner_cannot_access_other_parties_private_contracts.test.sql` | 28 | J12: other owner / worker / customer / super_admin / anon read nothing, no unsent drafts for the worker, foreign ids and actions, owner cannot respond for the worker, eligible list names only, notifications without text |
| `j9_w9_worker_contract_rules.test.sql` | 52 | state machine, send gates, start date, contractor acknowledgements, no fabricated acceptance, commit validator, braces, decline / terminate always, activation gates (C7), effective expiry, internal expiry, discard |
| `j9_w9_problem_term_flags.test.sql` | 15 | 15 W8-L13 categories incl. Filipino words, samples, excerpt, locked clauses never scanned, stored at seal and shown to both parties, never block, no validation claims |
| `j9_w9_worker_contract_audit.test.sql` | 12 | audit for every transition, payload keys and leaks, refused actions write nothing, one notification per event, text safety |
| `j17_w9_worker_contract_authorization.test.sql` | 16 | RLS and SELECT-only grants, deny-all write policies, 34 internal functions closed, 23 RPCs closed to anon / service_role, pinning, Realtime, no fee / pay / signature columns |
| `j18_w9_flows.test.sql` | 22 | owner / shop / worker deletion retention (D-32, D-35, W5-L10 copies), bookings, verification, applications, training, certifications and templates unchanged |
| `j13_three_distinct_qualifying_owner_relationships_counted.test.sql` | 12 | J13: distinct verified owners counted live, remaining from the policy and never negative, unverified shop excluded, policy change moves remaining only |
| `j14_same_owner_contracts_and_amendments_count_once.test.sql` | 15 | J14: two shops / contracts / amendments of one owner count once, one row per (worker, owner), row reused after termination, trusted duplicate insert refused |
| `j15_relationship_counting_policy_for_each_status.test.sql` | 27 | J15: drafts, offers, declines, withdrawals, pending_start, active, terminated, expired (also effectively), suspended (verification, inactive, transfer, deleted shop) and owner_removed per D-3 / D-36; no roster / application / training / certificate count; stored = live |
| `j15_w10_trusted_contract_repair_rules.test.sql` | 19 | D-40 / C6: forward-only trusted repairs; W9 guard otherwise unchanged |
| `j16_three_owner_rule_never_blocks_decline_or_termination.test.sql` | 19 | J16: decline / terminate in every relationship state and with the minimum at 10; enforcement CHECK; only the W10 reads and setter read the policy; W9 RPCs unchanged; no raising sync trigger |
| `j13_w10_workforce_policy_rules.test.sql` | 20 | seed 3 / informational, super_admin change with reason, refusals per role, 55000, 23514 range / reason / same value, immutable columns, no delete, trusted update audited, audit without reason text |
| `j13_w10_relationship_audit_and_sync.test.sql` | 18 | audit per create / change, unchanged refresh silent, payload leaks, no notifications, internal refresh (past date refused), refresh-all = live, owner_removed terminal |
| `j17_w10_owner_relationship_authorization.test.sql` | 21 | RLS and privileges, deny-all writes for every role incl. trusted insert, internal functions closed, anon, pinning, realtime, party isolation, owner read without progress columns |
| `j18_w10_flows.test.sql` | 17 | owner / worker account deletion, verification review with the shop trigger, bookings / quotes / ratings, W9 contract lifecycle unchanged |

## Safety rules

- Never `supabase link`, `db push`, `--linked`, `--db-url`, `--project-ref`, `SUPABASE_DB_URL`,
  `SUPABASE_ACCESS_TOKEN` or `SUPABASE_PROJECT_ID`; the runner aborts (exit 2) if any appears,
  and before every CLI call it aborts if `.local-supabase-test/supabase/.temp/project-ref` (or
  `.local-supabase-test/.temp/project-ref`) exists.
- Never run `supabase test db` from the repo root: it would execute `supabase/tests/database/`
  against whatever the root config targets.
- Never read or print `.env` files.
- Never copy anything from `scripts/supabase-test/baseline/` into the repo's `supabase/` folder
  or a real project.

## Vitest (frontend)

```sh
cd frontend && npm test          # vitest run (jsdom), all src/**/*.test.{ts,tsx}
cd frontend && npm run test:watch
```

- Tests import `describe/it/expect/vi` from `vitest` explicitly (no globals). Repositories and
  `../supabase/supabaseClient` are mocked with `vi.mock`; the real Supabase project is never used.
- Env isolation: `vitest.config.ts` sets `envDir` to `src/test/isolated-env` (empty), so
  `frontend/.env*` is never loaded, and `test.env` supplies `VITE_SUPABASE_URL=http://127.0.0.1:9`
  and a placeholder anon key. `harness_env_uses_placeholder_supabase_url` guards this.
- Fetch stub: `src/test/setup.ts` replaces global `fetch` with a function that throws
  "network disabled in unit tests"; `harness_unit_tests_cannot_reach_network` guards this.
  A test needing HTTP must mock the repository or stub `fetch` itself.
- Test files are named `*.j18.test.ts(x)` and titles `j18_<scenario>`; no `it.skip`. Use
  `it.fails` with the reason in the title if a known-failing test is ever needed.
- Tests are excluded from the production `tsconfig.app.json` and type-checked via
  `tsconfig.test.json` (`npm run build` runs `tsc -b`).

## W2 API smoke (local stack only)

```sh
node scripts/supabase-test/w2-api-smoke.mjs   # needs the stack left running by run-db-tests.mjs
```

Signs up synthetic `@local.test` users through the local GoTrue HTTP API with metadata roles, calls the W2 RPCs through PostgREST (supabase-js) and
deletes the users afterwards. The API URL and keys come from `supabase status -o env --workdir .local-supabase-test`, stay in memory, and a
non-loopback URL is refused. Note: the baseline signup trigger has no metadata-sync on update, so the `updateUser` assertions prove the profile never
follows metadata; the GoTrue silent-restore branch itself (R4) is still only covered by review.

## W3 API smoke (local stack only)

```sh
node scripts/supabase-test/w3-api-smoke.mjs   # after run-db-tests.mjs (and w2-api-smoke.mjs), before stopping the stack
```

Same safety rules as the W2 smoke script (loopback URL only, keys from `supabase status` held in memory and never printed, no `.env`, synthetic
`@local.test` users deleted with the result asserted). Checks through PostgREST / GoTrue: direct inserts into `workforce_audit_events` and
`notifications` fail (42501); `rpc('record_workforce_audit_event')` and `rpc('enqueue_notification')` fail with 42501 (also for the service_role key);
`rpc('set_config')` is not exposed; non-admin audit and review-log reads return 0 rows; a super admin approves a shop and the owner lists exactly 1
notification; `mark_notifications_read` returns 1, then 0; the service_role key cannot insert, update or delete audit rows; a GoTrue `deleteUser` of a
linked worker writes a `roster.unlinked` event with `account_deleted` and `actor_kind = system`; the review log survives owner and shop deletion. Must
end `0 failed` (W3 build: 33 checks).

## W4 API smoke (local stack only)

```sh
node scripts/supabase-test/w4-api-smoke.mjs   # after run-db-tests.mjs (and the W2 / W3 smokes), before stopping the stack
```

Same safety rules as the W2 / W3 smoke scripts (loopback URL only, keys from `supabase status` held in memory and never printed, no `.env`, synthetic
`@local.test` users deleted with the result asserted). Checks through PostgREST / GoTrue: anon read fails or returns 0 rows; the owner inserts a draft
without sending owner_id / status / stamps; publish is rejected with `Only a verified shop can publish job openings.` until a super admin approves the
shop; the worker then lists 1 opening, customer and other owner 0; the other owner's update changes 0 rows and its RPC gets 42501; direct status and
stamp PATCHes fail; `set_config` is not exposed; a stale transition gets 55000; deleting a published opening removes nothing; pause / resume / close /
archive succeed; archived cannot be reopened or edited; a draft delete works; 5 status events are audited; the owner has no job-opening notifications;
a GoTrue `deleteUser` of the owner cascades the opening and writes `job_opening.deleted` with `owner_account_deleted`. Must end `0 failed` (W4 build:
35 checks).

## W5 API smoke (local stack only)

```sh
node scripts/supabase-test/w5-api-smoke.mjs   # after run-db-tests.mjs (and the W2 / W3 / W4 smokes), before stopping the stack
```

Same safety rules as the earlier smoke scripts (loopback URL only, keys from `supabase status` held in memory and never printed, no `.env`, synthetic
`@local.test` users deleted with the result asserted). Checks through PostgREST / GoTrue: anon read of `job_applications` fails or returns 0 rows;
worker direct insert / patch / delete fail (42501); `search_job_openings` returns 1 row for the worker and 0 for the customer and owner; apply without
the notice version is refused; apply through `create_job_application` returns a submitted row with the snapshot; a duplicate gets 23505 `You have
already applied to this job opening.`; `set_config` is not exposed; the other worker sees 0 rows, the owner 1, the other owner 0 and its transition
gets 42501; the owner reads 0 `worker_private_contacts`; `applicant_profiles_for_job_opening` keys contain no contact / phone / email;
`applicant_verified_certifications` returns an empty list; a stale transition gets 55000; withdraw then reapply works; an owner edit leaves the
snapshot unchanged; closing the opening closes the application and the applicant still reads the opening; notifications exist for both parties without
the cover note or terms; a GoTrue `deleteUser` of the worker removes its applications and writes `job_application.deleted` with
`worker_profile_deleted`. Must end `0 failed` (W5 build: 39 checks).

## W6 API smoke (local stack only)

```sh
node scripts/supabase-test/w6-api-smoke.mjs   # after run-db-tests.mjs (and the W2..W5 smokes), before stopping the stack
```

Same safety rules as the earlier smoke scripts (loopback URL only, keys from `supabase status` held in memory and never printed, no `.env`, synthetic
`@local.test` users deleted with the result asserted). One addition, the TEST-ONLY time shift (W6 R3): two past sessions and an earlier `accepted_at`
are written through `docker exec supabase_db_<staged project_id> psql` as a trusted local session calling the seeded `test_helpers` (container name
derived from the asserted `*-local-test` project_id; only validated uuids / dates are interpolated); all evidence is then recorded through the real
RPCs. Checks through PostgREST / GoTrue: anon reads of the six tables and the progress view fail or return 0 rows; direct inserts by owner, worker and
service_role fail (42501); draft program with pay and sessions via RPC (worker_fee 0); a worker cannot see the draft; open refused without the
attestation, then opened; designation of a roster-linked trainer (link-code flow); invitations from accepted applications; accept refused without the
notice, then accepted with the snapshot (fee 0, pay as entered); worker_fee PATCH denied and still 0; the trainee's booking assignment refused
(23514); trainee and other-owner recording denied; trainer records; same-day duplicate 23505; assessment before 3 days refused; after the time shift 3
days give `awaiting_assessment`, a correction without reason is refused, a pass gives `completed`; evidence PATCH / DELETE denied; notifications exist
without dates, names or pay; `set_config` not exposed; GoTrue `deleteUser` of the owner keeps the other worker's enrollment (`shop_removed`, D-18);
`deleteUser` of the trainee removes its enrollment and keeps the audit rows; the retained program is removed by a trusted cleanup. Must end `0 failed`
(W6 build: 40 checks).

## W7 API smoke (local stack only)

```sh
node scripts/supabase-test/w7-api-smoke.mjs   # after the W6 smoke, before stopping the stack
```

Same safety rules as the W2..W6 smoke scripts. TEST-ONLY time shift as in W6 (R3 / W7 R7): a program with three past sessions and a backdated
acceptance is created through `docker exec` psql calling the seeded `test_helpers` (only validated uuids and synthetic `smoke7-*@local.test` emails
are interpolated); evidence, certificates, status changes, reviews, re-assessments and renewals then go through PostgREST. Checks: anon reads of the
five W7 tables return an error or 0 rows; direct inserts denied for worker, owner and service_role; issue refused before completion, for an unverified
shop, for a designated trainer, without the attestation and with a stale assessment (55000); issue succeeds (`shop_issued`, approver, server stamps,
expiry +12 months); PATCH / DELETE denied; another owner reads nothing; a certification_required apply is refused without and allowed with a current
certificate; `applicant_verified_certifications` lists it; suspend needs a reason and then blocks the next apply; review request and reinstate;
revoke; trainer re-assessment and owner renewal supersede (validity 1 then 12 months); notifications without reason, statement, name or date;
`set_config` and the expiry-notice function are not client callable; GoTrue `deleteUser` of the owner keeps the worker's certificate (D-18);
`deleteUser` of the worker removes it and keeps the audit row; retained programs are removed by a trusted cleanup. Must end `0 failed` (W7 build: 38
checks).

## W8 API smoke (local stack only)

```sh
node scripts/supabase-test/w8-api-smoke.mjs   # after the W7 smoke, before stopping the stack
```

Same safety rules as the W2..W7 smoke scripts; no time shift and no trusted write (one trusted READ through `docker exec` psql, validated uuid only,
confirms the cascade after the owner `deleteUser`). Synthetic `smoke8-*@local.test` users, all deleted. Checks: anon, worker and customer read 0 rows
of the three template tables (platform included); the owner reads the platform standard (v1 in its history); direct inserts denied for owner, worker
and service_role; create from the standard; save v2 with an edited body and a section-15 shop term (hash differs, v1 unchanged); a locked key in the
edits, an unknown placeholder and a section-4 shop term 23514; stale 55000; another owner and super_admin read nothing of it and cannot rename it;
owner publish denied; super_admin publishes the next platform version (letters-only run tag, so reruns stay distinct); the owner sees
`newer_standard_available` and rebases keeping the edit; preview carries the notice on 15 sections with no raw placeholder; diff rows (1 edited, 1
added_by_shop); archive blocks saves, restore reopens; PATCH / DELETE denied for owner and service_role; `set_config` and the internal version writer
not client callable; GoTrue `deleteUser` of the owner removes the templates and keeps the audit rows; the platform standard survives. The published
platform version stays on the local stack until the next reset. Must end `0 failed` (W8 build: 30 checks).

## W9 API smoke (local stack only)

`node scripts/supabase-test/w9-api-smoke.mjs` (after the W8 smoke, before stopping the stack). Same safety rules as W2..W8; no time shift, no
trusted write or read; synthetic `smoke9-*@local.test` users, all deleted. Checks: no direct insert / patch / delete on the eight W9 tables for
owner, worker, service_role; non-eligible and unclassified drafts refused; nothing visible to the worker before send; unverified-shop send 23514;
deposit flag and flag-count 55000; the worker reads document, flags and diff; stale-hash accept 55000; two acceptance records with the label;
template save and platform publish leave the hash unchanged; amendment declined, second accepted (old superseded); contractor acknowledgements;
other owner / worker / super_admin read nothing; activation; worker termination; notifications without pay, reasons or names; `set_config`, the
expiry function and the sealer not callable; owner `deleteUser` keeps the contract for the worker. Must end `0 failed` (W9 build: 34 checks).

## W10 API smoke (local stack only)

`node scripts/supabase-test/w10-api-smoke.mjs` (after the W9 smoke, before stopping the stack). Same safety rules as W2..W9; no time shift, no
trusted write; synthetic `smoke10-*@local.test` users, all deleted; the super_admin is promoted as in the W9 smoke. Planned checks (PLAN
section 6): direct insert / patch / delete on both W10 tables denied for owner, worker, service_role; `set_workforce_policy_value` denied for
owner, worker, service_role; policy 3 / informational; three verified owners -> progress 3 / remaining 0; a second shop of owner A -> still 3
(owner A row: 2 contracts); amendment -> still 3; owner B shop `changes_requested` -> 2, re-approved -> 3; minimum 5 -> remaining 2 (audit
without reason text); worker terminates owner C -> succeeds, 2; worker declines owner D -> succeeds, no row; owner and other-worker isolation;
internal functions and `set_config` not callable; owner B `deleteUser` -> `owner_removed`, 1. Must end `0 failed` (38 checks at W10 test step).
