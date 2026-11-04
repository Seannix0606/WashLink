# Local test harness (W1, hardened in W2, extended in W3..W14)

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

Expected (after the W15 DB build): the reset applies 97 migrations (96 after W13; baseline `00000000000000`, the 2026_04_17 copy, owner-policies baseline
`20260417000002`, the other 4 pre-W2 copies, then per increment, each starting with its preflight where it has one: W2 `20261024000001..06`, W3
`20261024000007..11` (w3a, w3b, w3c, w3d0 preflight, w3d), W4 `20261024000012..15`, W5 `20261025000001..05`, W6 `20261025000006..14`, W7
`20261026000001..08`, W8 `20261026000009..16`, W9 `20261026000017..26`, W10 `20261028000001..07`, W11 `20261029000001..09`, W14 `20261029000010..18`:
w14a preflight, w14b..w14i; W12 `20261030000001..05`: w12a preflight, w12b..w12e; W13 `20261030000006..09`: w13a preflight, w13b..w13d; W15 `20261103000001`: w15a, preflight inside the file) and seeds the eight helper files in order (`test_helpers.sql`, `test_helpers_certifications.sql`,
`test_helpers_contract_templates.sql`, `test_helpers_worker_contracts.sql`, `test_helpers_owner_relationships.sql`, `test_helpers_oversight.sql`,
`test_helpers_moderation.sql`, then `test_helpers_scheduling.sql`); `test db` ran 108 files / 3280 tests `Result: PASS` after W15 fix cycle 1 (2026-11-03, W15 LOG "FIX CYCLE 1 (DB)"; 105 / 3198 after W13 fix cycle 1, W13 LOG "FIX CYCLE 1 (DB) runs"; 105 / 3185 after the W13 DB build and the D-78 addendum; 99 / 3051 after W12 fix cycle 1; 98 / 3028 after the W12 DB build; 91 / 2876 after W14 fix cycle 1; 90 / 2850 after the W14 DB build; 82 / 2622 after W11 fix cycle 1; 81 / 2589 after the W11 DB build; 72 /
2347 after the W10 DB build; 63 / 2178 after W9; 54 / 1947 before W9; 47 / 1713 before W8; 38 / 1409 before W7) and ends with `Result: PASS`. There
are 0 TODO blocks: any `Failed (TODO)` or `TODO passed` line is a finding.

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
  `test_helpers_contract_templates.sql` (W8), `test_helpers_worker_contracts.sql` (W9), `test_helpers_owner_relationships.sql` (W10)
  `test_helpers_oversight.sql` (W11), `test_helpers_moderation.sql` (W14) then `test_helpers_scheduling.sql` (W12; `HELPERS_SOURCE_NAMES`, all required) -> the staged seed in that order (helpers only, runs after all migrations). The stager aborts if any committed
  migration collides with that slot.
- D-11: Supabase CLI 2.122.0 parses `YYYY_MM_DD_<desc>.sql` as version `2026`, so the second file collides in `schema_migrations` (evidence in
  `loop/workforce/increments/W1/LOG.md`). The repo keeps its naming (LOOP rule 3); the stager copies each migration byte-identical (sha256-checked)
  under a 14-digit name (`YYYYMMDD` + per-date sequence). A human decides on renaming before any `db push`.
- The gitignored `.local-supabase-test/` has `project_id = "washlink-local-test"`, no `.temp/project-ref` and no `.env`, so the CLI cannot target a
  remote project from it. Layout: `supabase/migrations/` (the 2 baseline migrations + the 90 copies), `supabase/local_test_baseline/test_helpers.sql`
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
- W11 (`test_helpers_oversight.sql`): `suspend_test_certification` and `request_test_shop_review` (real W7 RPCs),
  `backdate_shop_review_request(request, days)` (TEST-ONLY time shift, technique of `backdate_certification`), `raise_test_contract_dispute` (real
  W11 RPC). No helper inserts a WashLink review, a dispute, a status event or an acceptance.
- W14 (`test_helpers_moderation.sql`): `report_test_job_opening` (real RPC as the worker), `make_test_shop_legacy_unreviewed(shop, keep_reviewer
  default false)` (TEST-ONLY trusted update: a pre-W2 approved shop without a recorded review), `delete_test_admin_profile` (real `auth.users`
  cascade), TEST-ONLY time shifts `backdate_test_moderation_case(case, minutes default 60)` and `backdate_test_contract_dispute(dispute, days)` (N6;
  guards disabled for one statement, as `backdate_shop_review_request`). No helper inserts a case, report, action or access record.
- W12 (`test_helpers_scheduling.sql`): `backdate_test_worker_contract(contract, days)` (TEST-ONLY time shift; one UPDATE under `SET LOCAL
  session_replication_role = replica`, which also skips the W10 sync trigger, W12 D9), `hold_lock_in_second_session(key bigint)` /
  `release_second_session()` (TEST-ONLY dblink to the local DB via the container alias `db` with the local default credentials, W12 D10; the
  extension is created inside the test transaction), `notification_marker()` = `ZQXW12PRIVATE`. It also registers the local-only `test.notice`,
  `test.dup`, `test.text` categories for the unchanged W3 writer tests by a plain trusted INSERT (W12 D3; never a migration). No helper
  function writes the registry, job state or notifications. Runner tests clear `washlink.scheduled_job` between two calls (one transaction, D13).
- Ids are passed between statements with `set_config('fx.<name>', ..., true)` / `current_setting('fx.<name>')`, readable under any role.
- Never print a bare `ok` from a plain `select`: TAP counts it as a test.

## TODO placeholders (honesty rule)

W1 shipped 8 `todo_start(` wrappers (F5 in j18; E1, E2, E3, E5, S1, S2, S9 in j17). W2 removed all of them: `grep -c "todo_start("
supabase/tests/database/*.sql` is 0 for every file. The j17 assertions are unchanged; F5 was rewritten to call `submit_shop_for_verification()` (the
direct UPDATE stays rejected: `j17_owner_cannot_directly_resubmit_changes_requested_shop`). The baseline still reproduces the weaknesses on purpose,
so those assertions only pass because the W2 migrations fix them. Any new `todo_start(` is a FAIL unless a plan allows it.

## pgTAP files (108 files; 3280 assertions after W15 fix cycle 1, `Result: PASS`)

| File | Plan | Covers |
|---|---|---|
| `000_harness_sanity.test.sql` | 9 | helpers, identity switching |
| `001_migration_replay.test.sql` | 28 (27 before W15) | replay of 97 migrations (W15 added `20261103000001` and `replay_w15_link_history_table_trigger_and_backfill_present`; `replay_schema_migrations_has_baseline_w2_to_w14_w12_and_w13`; W13 renamed it from `..._w2_to_w14_and_w12`, D-76), W2 objects, W2..W10 RLS on, `replay_w11_review_and_dispute_tables_rls_enabled`, `replay_w14_moderation_tables_rls_enabled`, `replay_w12_registry_and_job_state_rls_enabled`, definer search_path, `replay_w13_audit_table_has_no_client_select_policy` |
| `j17_authorization_harness.test.sql` | 40 | W1 J17 + former placeholders, S4 counterparties, S5 |
| `j17_w2_fix1_fk_cascades.test.sql` | 31 | S-B1: `on delete set null` cascades (customer, linked worker account, reviewing admin, owner, roster rows in any booking status) pass every guard and change only the FK column |
| `j17_w2_fix1_review_and_hardening.test.sql` | 42 | C-B1 review stamping, stricter gate, D-10 audit query; fail-closed trusted session; booking/shop/document hardening; peppered, locked, pruned link-code attempts; realtime exclusion; no availability default |
| `j17_w2_shop_booking_guards.test.sql` | 32 | E3/C3, S6, S7, F5 guard, gate helper, trusted session, booking transitions |
| `j17_w2_worker_data_guards.test.sql` | 34 | worker profile / contact privacy, link-code RPC authorization |
| `j17_w3_audit_events.test.sql` | 60 | W3 audit table: server-only insert, append-only for every role, trusted retention purge, derived actor fields, raw table unreadable by every client role since W13 (`j17_audit_raw_table_not_readable_by_any_client_role`, renamed from `j17_audit_readable_only_by_super_admin`), payload rules, realtime exclusion, R-1 `pg_temp` pinning and temp-table shadowing |
| `j17_w3_audit_wiring.test.sql` | 35 | every wired W2 action writes its event (shop decision / submission / S6 reset, link code, link, worker / owner unlink, linked row delete, worker profile delete, trusted role change), review log survives reviewer deletion and is trusted SQL only since W13 (`w3_shop_review_log_view_is_trusted_sql_only`, renamed from `w3_shop_review_log_view_is_super_admin_only`), no private data in payloads |
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
| `j8_w11_certification_platform_review_rules.test.sql` | 51 | J8: bases (shop upheld, overdue after 14 days and withdrawn, stranded after shop / owner removal or lost verification, revoked 30-day window), refusals (active, stale 55000, statement, second open 23505, already decided), super_admin reinstate without issuer verification (expiry and snapshots kept) / uphold, stale revision, reason / decision errors, other roles cannot decide, withdraw, `WashLink review` event label |
| `j8_w11_certification_platform_review_holds.test.sql` | 18 | owner revoke and worker shop request refused while open, owner reinstate resolves by shop, holds lift after decision / withdrawal, no W7 function body replaced (trigger list incl. the fix cycle 1 `zz_` masks) |
| `j8_w11_fix1_review_mask_resuspend_cap.test.sql` | 32 | W11 fix cycle 1: N2 owner re-suspension within 30 days after `resolved_by_shop` eligible at once (and not after 31 days), N1 admin id null in the owner's raw W7 rows (decider kept in `decided_by` and audit; owner changes unmasked), N8 escalated request removal sets the link null, N5 3 reviews per event incl. withdrawn, C4 stranded count skips decided, N4 closed dispute queue hides contract fields, C5 open-openings count without a current certificate |
| `j12_w11_contract_dispute_access.test.sql` | 31 | J12: admin reads the contract only while the dispute is open, every case read audited, documents only for that contract's sealed versions, nothing without a dispute, other owner / worker isolation, no admin ids in party reads, relationship block without counts, closed case without contract block |
| `j12_w11_contract_dispute_rules.test.sql` | 42 | owner-termination dispute, owner terms dispute, category vs contract end, unsent draft, 90-day window, one open per party 23505, max 3, one response, withdraw, close with kind and note, stale 55000, non-admin close refused |
| `j16_w11_disputes_and_reviews_never_change_contracts.test.sql` | 14 | J16: open dispute never blocks terminate / decline, close leaves contract and versions unchanged, `prosrc` scan of W11 functions, W9 RPCs never reference dispute tables |
| `j17_w11_dashboard_summaries.test.sql` | 24 | J17 counts: worker / owner summaries equal their reads, opening count equals search, own shops only, admin counts (reviews, disputes, overdue, stranded), no row for wrong role / anon, no text-name columns |
| `j17_w11_oversight_authorization.test.sql` | 25 | RLS and privileges, deny-all select (super_admin has no raw read, N3) and writes for every role incl. trusted insert, internal functions closed, anon denied, pinning, Realtime, admin functions refuse owner / worker / customer |
| `j6_w11_oversight_audit_and_notifications.test.sql` | 12 | audit per transition, payloads without statements / reasons / notes / names, fixed texts once per event, case views audited without notifications, refused actions write nothing |
| `j18_w11_flows.test.sql` | 16 | owner deletion keeps review and dispute, worker deletion cascades with audit, bookings / quotes / ratings / verification and W7 / W9 / W10 lifecycles unchanged |
| `j2_w14_job_opening_reports.test.sql` | 30 | J2: report published / applied-paused openings, unreadable or draft refused, category 22023 / statement 23514, duplicate 23505, limits (3 per opening, 10 open), write-once snapshot, second reporter joins the case, withdraw, owner / customer / trainer cannot report |
| `j2_w14_job_opening_takedown.test.sql` | 51 | pause with reason and hold (owner resume 23514), edit + submit (refused without edit), lift then resume with verification check, pause kept, close with W5 auto-close, snapshots and content unchanged, owner close resolves, dismiss note, stale 55000, action 23514, removed opening only dismiss, non-admin refused, flag without case 42501, W4 guard md5 and trigger order, no direct super_admin edit / transition |
| `j3_w14_unreviewed_approved_shops.test.sql` | 33 | J3: queue lists reviewer missing (admin deleted), legacy null review time, reviewer not super_admin; confirm stamps without status change, restores publish and worker visibility, refreshes relationships; request changes / reject via the decision path; reviewed shop refused; notes required; non-admin refused; stamp inert without flag |
| `j17_w14_audit_reads.test.sql` | 31 | own actor / subject events only, contract events for the sent party only, no ids (columns and uuid values), details allow-list, actor labels, reports hidden from the owner, admin log filters / paging / audited search / non-admin refused, N6 flag and its exclusions |
| `j17_w14_relationship_lookups.test.sql` | 24 | worker lookup rows and count (minimum absent, D1), owner lookup without worker counts or other owners, purpose and note required, every lookup recorded and audited, unknown id recorded, visible in the subject's activity with the generic purpose `washlink_review` (N7), owner / worker refused, raw select denied |
| `j17_w14_moderation_authorization.test.sql` | 30 | RLS and privileges, deny-all policies, direct writes refused for every role incl. trusted insert, internal functions closed, anon denied, pinning, Realtime, admin functions refuse owner / worker / customer, owner read has no report columns, `prosrc` scan: no W14 function writes `job_applications` or opening content |
| `j17_w14_moderation_audit_and_notifications.test.sql` | 13 | audit per transition, payloads without statements / messages / notes / names, fixed texts once per event, reports and case views notify nobody, refused actions write nothing |
| `j17_w14_fix1_report_privacy.test.sql` | 26 | W14 fix cycle 1: after pause -> owner close, close -> archive and changes_submitted -> close the owner's activity has no `job_opening_report%` or report-revealing case rows while the reporter sees their own (B1); owner-actor `job_opening_moderation.deleted` hidden; no-op edit does not count and the last pause_kept snapshot is compared (N5); per-worker advisory lock (N2); `log_searched` subject / prefix values or `unrecognised` (N4) |
| `j18_w14_flows.test.sql` | 15 | owner deletion keeps the case with a null opening, worker deletion cascades reports with audit, platform publish leaves owner versions and contract hashes unchanged, W4 / W5 lifecycles and bookings / quotes / ratings / verification unchanged |
| `j17_w12_notification_registry.test.sql` | 31 | 37 categories equal a fixed list and a scan of every producer body (categories, families, key prefixes), `external_delivery` never, unregistered category / prefix / subject type 23514, safe enqueue skips and the action succeeds, trigger after the W3 writer guard, not client readable / writable, trusted-SQL-only changes, not in Realtime, W4 / W8 / W10 actions notify nobody |
| `j17_w12_notification_dedup.test.sql` | 21 | one notice per recipient per audit event, review reinstatements send the decision only, termination / scheduled expiry with an open amendment one per party, WashLink close owner one / applicants one each, relationship change none, superseded certificate none, due then expired once, repeated runs nothing, mark-read never resends |
| `j17_w12_notification_privacy.test.sql` | 12 | marker in names, notes, reasons, statements, clause text, pay, owner message and admin note through the real RPCs, plus (fix cycle 1) an amendment proposal and the scheduler-written contract expiry and certificate due / expired notices via `run_workforce_scheduled_job`; unique assertion names; header maps every other producer to its earlier file: no marker, `@` or phone shape in any notice, labels from the allow-list only, no payload column, recipient isolation |
| `j13_w12_scheduled_jobs.test.sql` | 31 | contract expiry (past end only, each party once, J15 stops counting, terminated / declined / future untouched), notices job, relationship cursor walk and reset, disabled job, 55000 one job per transaction, no date parameter, batch bounds 22023, state and audit without ids, runner refused for authenticated and service_role JWTs; W13 gave lines 73 / 76 / 82 their own names (D-76, `ACCEPTANCE_TESTS.md`) |
| `j16_w12_fix1_scheduler_liveness.test.sql` | 20 | W12 fix cycle 1 N3 / N4: a planted contract and a planted pair raise 23514; each run completes, the item is skipped_failed with its SQLSTATE only and writes nothing, its pair lock is released (dblink), both cursors move past it, the rest is processed, it is retried next pass; audit SQLSTATE only; try-lock before row lock; `lock_timeout` 1 s |
| `j16_w12_scheduler_locking.test.sql` | 18 | dblink second session: pair try-lock collides with the w10e key both ways (same key text), busy contract skipped then expired, busy pair skipped, busy job `already_running` writes nothing, terminate and decline succeed after runs (J16) |
| `j17_w12_scheduler_authorization.test.sql` | 25 | both tables RLS on with no client privilege, internal functions closed to every client role, admin read super_admin only with no ids or names, `pg_temp` pinned, no migration created pg_cron or a cron job, state guard refuses direct writes (runbook change only; the runner flag needs a trusted session, fix cycle 1 N2) |
| `j18_w12_flows.test.sql` | 16 | W3..W14 flows write the same notices as before W12, bookings / quotes / ratings / verification unchanged, `mark_notifications_read` unchanged, raw W7 / W9 / W10 functions internal and still accept a future test clock |
| `j17_database_constraints_and_authorization_prevent_unauthorized_access.test.sql` | 37 (29 before fix cycle 1) | W13 J17 roll-up: explicit list of 44 workforce tables (W15 added `roster_link_history`) + 2 views equals the catalogue, RLS on every table, client write grants only on the 3 justified tables, no service_role privilege (D-78) and no client sequence grant, no unconditional client policy, definer `pg_temp` last, anon executes no workforce function, nothing in Realtime, raw audit unreadable, private contract tables unreadable by non-parties, no `set_config` wrapper; fix cycle 1: every public sequence, column-level grants, TRUNCATE / REFERENCES / TRIGGER on every public table, pepper / `washlink_private` for service_role, guard triggers on the three client-writable tables pinned, N1 renames |
| `j18_existing_booking_pricing_verification_and_rating_workflows_still_work.test.sql` | 27 (25 before W15, 26 at the W15 DB build) | W13 J18 roll-up after all 97 migrations (W15 added `j18_trainee_not_assignable_after_owner_unlink`) with workforce data present: server quote, owner assigns a contracted roster worker, completion, one rating, own pricing only, verification submit / review / resubmit, trainee still not assignable, no workforce columns on booking tables |
| `j17_w13_admin_audit_reads.test.sql` | 25 (21 before fix cycle 1) | D-70: super_admin raw select 0 rows, review-log view 42501 for every client and readable by trusted SQL, `admin_workforce_audit_log` returns rows and records the search, `my_workforce_activity` unchanged, deny-all select policies, rows still append-only; `w13_audit_select_deny_all_is_restrictive` (S1: a planted permissive policy still yields 0 rows) |
| `j2_w13_moderation_queue_paging.test.sql` | 27 | D-71: oldest first, default 50, keyset walk without gaps or duplicates, `total_count`, newest case reachable, rows equal the w14e queue, limit and cursor 22023, super_admin only, no statement / reporter / note columns |
| `j15_w13_contract_expiry_notice_wording.test.sql` | 20 (19 before fix cycle 1) | D-72: worker and owner bodies use the record wording, no body says "has expired", title / category / key unchanged, other contract notice bodies unchanged, one notice per party, expired still stops counting, function comment records W13; owner caveat (C2); md5 of the w9j and live w13d bodies (S4) |
| `j7_w15_training_gate_survives_roster_unlink.test.sql` | 51 (45 before fix cycle 1) | W15 D-79 / D-80: probe replay (owner unlink then assign 23514), worker self-unlink, link before training, re-linked row, pre-assigned booking cannot start (API-style updates by super_admin and the former worker match 0 rows under RLS; the start check is run in an RLS-bypassing session with a super_admin JWT: 23514), unassign allowed, gate lifts, other owner unaffected, never-linked row not detected (W15-L1 pin), history rows, no-op `user_id` update records nothing (SEC-1), backfill from `roster.linked` and `roster.unlinked` audit rows (SEC-7), RLS / no client access, cascades, functions not executable, trusted bypass |
| `j16_w15_worker_unlink_and_decline_still_succeed.test.sql` | 12 | J16: worker and owner unlink, withdraw after unlink, decline with a history row, re-link after unlink |
| `j18_w15_flows.test.sql` | 16 | non-trainee roster add / edit / unlink, assign / reassign / unassign, start and complete, row delete unassigns, customer booking insert unchanged (an insert carrying a worker is refused 42501 by the w2c guard) |
| `j15_w13_trusted_contract_end_runbook.test.sql` | 12 | W9-S1 (accepted): raw trusted terminate leaves an open amendment; the runbook closes it, then terminates; notifies nobody, audited as trusted_session; worker decline and terminate unaffected (J16) |

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
- `scripts/supabase-scheduling/*.sql` are HUMAN-RUN (runbook in `NOTIFICATIONS_AND_SCHEDULING.md`); the loop runs them only on the
  local stack inside `begin; ... rollback;` and never copies them into `supabase/migrations/`.

## Vitest (frontend)

After W12 fix cycle 1: 137 files / 282 tests pass (136 / 274 after the W12 frontend build; 131 / 263 after W14 fix cycle 1; 118 / 233 after W11 fix cycle 1 + 12 files / 29 W14 tests + 1 DI wiring test, suffixes `.j2`, `.j3`,
`.j17`, `.w14`; fixtures `src/test/moderationFixtures.ts`). W12 added 11 tests in 5 `*.w12.test.ts(x)` files (W12 LOG
"BUILD (frontend)") and fix cycle 1 added 8 more (card health / badge, `ScheduledJobService.w12.test.ts`, keyset cursor); `w12_every_registered_category_has_an_area` reads the w12b migration with `node:fs` from `../supabase/migrations`
(F4: a Vite `?raw` import outside the root is refused), so `npm test` must run in `frontend/`.

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

## API smokes (local stack only)

Run after `run-db-tests.mjs`, before stopping the stack, with one command (W13, D-77): `node scripts/supabase-test/run-api-smokes.mjs`.
It runs `w2-` .. `w11-`, `w14-`, `w12-`, `w15-`, then `w13-api-smoke.mjs` in that required order (14 smokes since W15, D-82) (w13 must be last: it runs the real
`worker_contract_expiry` job, which commits, so re-running w12 alone afterwards on the same stack fails until a fresh reset), prints each
NOT OK line and tail line, and stops at the first non-zero exit. It runs no Supabase CLI command and refuses remote arguments and
environment variables. Since W13 every super_admin audit read in the smokes goes through `smoke-admin-audit-log.mjs` (`adminAuditRows`,
the audited `admin_workforce_audit_log`; D-70; since fix cycle 1 (N4) it pages with `p_before_id` until a short page, at most 50 pages, then fails loudly). After W13 fix cycle 1 (2026-11-03, same counts as at the W13 DB step) every smoke ended `0 failed`: w2 48, w3 33,
w4 43, w5 39, w6 40, w7 38, w8 30, w9 34, w10 39, w11 36, w14 33, w12 22, w13 17; `run-api-smokes: PASS (13 smokes)`. With the w15 smoke
the W15 run ended `w15-api-smoke: 17 passed, 0 failed`, `w13-api-smoke: 17 passed, 0 failed`, `run-api-smokes: PASS (14 smokes)`.
Shared safety rules: loopback API URL only (a non-loopback URL is refused); URL and keys come from `supabase status -o env --workdir
.local-supabase-test`, stay in memory and are never printed; no `.env`; synthetic `@local.test` users (`smoke<n>-*` from W7) are deleted and the
deletion is asserted. TEST-ONLY time shifts (W6, W7, W11) run through `docker exec supabase_db_<staged project_id> psql` as a trusted local session
calling the seeded `test_helpers` (container name derived from the asserted `*-local-test` project_id; only validated uuids / dates / synthetic
emails are interpolated). Each must end `0 failed`; counts are the passed checks in the W14 DB-step run (all `0 failed`).

- **W2** (48): signs up users through GoTrue with metadata roles, calls the W2 RPCs through PostgREST (supabase-js). The baseline signup trigger has
  no metadata sync on update, so the `updateUser` assertions prove the profile never follows metadata; the GoTrue silent-restore branch (R4) is
  covered by review only.
- **W3** (33): direct inserts into `workforce_audit_events` / `notifications` and `rpc('record_workforce_audit_event')` / `rpc('enqueue_notification')`
  fail 42501 (service_role too); `rpc('set_config')` not exposed; non-admin audit and review-log reads 0 rows; a super admin approves a shop and the
  owner lists exactly 1 notification; `mark_notifications_read` 1 then 0; service_role cannot change audit rows; GoTrue `deleteUser` of a linked worker
  writes `roster.unlinked` (`account_deleted`, `actor_kind = system`); the review log survives owner and shop deletion.
- **W4** (43; 35 at the W4 build): anon read fails or 0 rows; the owner inserts a draft without owner_id / status / stamps; publish refused (`Only a verified shop can
  publish job openings.`) until a super admin approves; the worker lists 1 opening, customer and other owner 0; other-owner update 0 rows, RPC 42501;
  status / stamp PATCHes fail; stale transition 55000; deleting a published opening removes nothing; pause / resume / close / archive; archived
  read-only; draft delete; 5 status events audited; no owner notifications; owner `deleteUser` writes `job_opening.deleted` (`owner_account_deleted`).
- **W5** (39): anon 0 rows; worker direct writes 42501; `search_job_openings` 1 row for the worker, 0 for customer / owner; apply needs the notice
  version, returns a submitted row with the snapshot; duplicate 23505; other worker 0 rows, owner 1, other owner 0 (transition 42501); owner reads 0
  `worker_private_contacts`; applicant profiles without contact keys; certifications empty; stale 55000; withdraw then reapply; owner edit keeps the
  snapshot; close closes the application; notifications without cover note or terms; worker `deleteUser` writes `job_application.deleted`.
- **W6** (40, time shift for two past sessions and an earlier `accepted_at`): anon reads of the six tables / progress view fail; direct inserts by
  owner, worker, service_role 42501; draft program (worker_fee 0); open needs the attestation; trainer designation via link code; invitations; accept
  needs the notice (fee 0, pay as entered); worker_fee PATCH denied; trainee booking assignment 23514; trainee / other-owner recording denied; same-day
  duplicate 23505; assessment before 3 days refused, then `awaiting_assessment`, correction needs a reason, pass -> `completed`; evidence PATCH / DELETE
  denied; notifications without dates, names or pay; owner `deleteUser` keeps the other worker's enrollment (D-18); trainee `deleteUser` keeps audit rows.
- **W7** (38, same time shift): anon 0 rows on the five tables; direct inserts denied; issue refused before completion, for an unverified shop, for a
  trainer, without the attestation, with a stale assessment (55000); issue (`shop_issued`, stamps, +12 months); PATCH / DELETE denied; certification-
  required apply refused without / allowed with a certificate; suspend with reason blocks the next apply; review request, reinstate, revoke, re-assessment
  and renewal; notifications without reason, statement, name or date; owner `deleteUser` keeps the certificate (D-18), worker `deleteUser` removes it.
- **W8** (30; one trusted READ confirms the cascade): anon / worker / customer read 0 template rows; the owner reads the standard; direct inserts
  denied; create, save v2 (hash differs, v1 unchanged); locked key, unknown placeholder and section-4 term 23514; stale 55000; other owner / super_admin
  read nothing; owner publish denied; super_admin publishes the next platform version (stays until the next reset); `newer_standard_available` and
  rebase; preview notice on 15 sections; diff rows; archive / restore; PATCH / DELETE denied; owner `deleteUser` removes templates, keeps audit rows.
- **W9** (34): no direct writes on the eight tables; non-eligible / unclassified drafts refused; nothing visible before send; unverified send 23514;
  deposit flag and flag-count 55000; worker reads document, flags, diff; stale-hash accept 55000; two acceptance records with the label; template save
  and platform publish keep the hash; amendments; contractor acknowledgements; other parties read nothing; activation; termination; owner `deleteUser`
  keeps the contract for the worker.
- **W10** (39; 38 at the W10 test step): direct writes on both tables and `set_workforce_policy_value` denied for owner, worker, service_role; policy
  3 / informational; three verified owners -> 3 / remaining 0; same owner, second shop or amendment -> still 3; `changes_requested` -> 2, re-approved
  -> 3; minimum 5 -> remaining 2; worker terminates -> 2; decline -> no row; isolation; owner `deleteUser` -> `owner_removed`.
- **W11** (36 after fix cycle 1; 14-day backdate of a shop review request): direct writes on both tables denied; escalation refused before the shop
  decides, allowed after (request withdrawn); revoke refused while open; super_admin queue + case (audit row), uphold; issuer-unavailable escalation ->
  reinstate; `owner_ended_contract` dispute, response, admin case + document, close, contract unchanged, no contract block after close; summaries for
  the right role only; N3 raw selects empty; N4 closed queue row without contract data; the worker-delete cascade counted via a trusted query.
- **W14** (`w14-api-smoke.mjs`, PLAN section 6; 32 checks at the W14 test step, 33 after fix cycle 1 (`b1_owner_close_never_shows_reports_to_owner`;
  no-op edit 23514, `log_searched` prefix and the subject's `washlink_review` purpose added to existing checks); `smoke14-*@local.test`; TEST-ONLY legacy-unreviewed shop via
  `docker exec` psql): direct insert / patch / delete / select on the four W14 tables denied for owner, worker, service_role and super_admin; worker
  report, duplicate 23505, owner reads no report; admin queue + case (audit row), pause, owner resume 23514, owner edit + submit, lift, owner resume ok;
  second report, close, applications closed with byte-equal snapshots; super_admin publishes the standard template with the UI payload shape, the owner
  sees "newer standard", a sent contract hash unchanged; `my_workforce_activity` has no id fields; admin log search audited; relationship lookup needs a
  purpose, owner / worker denied; unreviewed-shop queue + confirm makes the opening visible to workers; `set_config`, guard and stamp functions not callable.
- **W12** (`w12-api-smoke.mjs`, PLAN section 6; 22 checks at the W12 test step): `smoke12-*@local.test`; registry and job state select /
  insert / patch / delete denied for anon, owner, worker, super_admin, service_role; the runner, both batch functions, the pair try-lock,
  `enqueue_notification` and `set_config` not callable through PostgREST; contract send / accept / activate give one notice per step to the right
  party without the marker; TEST-ONLY backdate, then the runner via `docker exec` psql expires it (one notice each, second run nothing);
  certification notice run; `admin_workforce_scheduled_jobs` super_admin only, no id columns; the register script inside `begin; ... rollback;`
  registers exactly 3 `washlink_workforce_%` jobs and leaves no job or pg_cron after rollback; notifications not in `supabase_realtime`; mark-read.
- **W13** (`w13-api-smoke.mjs`, 17 checks at the W13 DB step (13 named checks plus 4 `delete_user_*`); `smoke13-*@local.test`; TEST-ONLY `docker exec` psql with uuid values only):
  raw audit select returns 0 rows for super_admin, owner and worker; review-log view 42501; `admin_workforce_audit_log` returns rows and
  logs the search; queue page walks three cases two per page, `total_count`, 0 rows for owner and worker, denied for anon and service_role;
  a real contract through the expiry runner gives one notice per party with the D-72 wording, no notice body says "has expired", and a second
  runner call creates nothing; `set_config` not exposed; the `smoke13-*` users are deleted and the deletion asserted. Run last (see above).
- **W15** (`w15-api-smoke.mjs`, PLAN section 6; 17 checks at the W15 test step; TEST-ONLY `docker exec` psql fixtures through `test_helpers`):
  owner unlink of a trainee row succeeds, assign afterwards 23514, booking still unassigned; worker self-unlink succeeds, assign 23514; withdraw
  then assign succeeds; a non-trainee row assigns; `roster_link_history` not readable or writable by anon, owner, worker or service_role; the
  gate functions not callable; `deleteUser` removes the history rows. Runs before w13 (D-82).
