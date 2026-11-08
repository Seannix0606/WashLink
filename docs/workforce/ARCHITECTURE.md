# Workforce module: architecture (as built, W0-W16)

This is an overview of what the workforce loop built on branch `feature/workforce`. Each area has its own
document, linked below, with the exact rules, error texts, tests and rollback steps. `ARCHITECTURE_AUDIT.md` is the
W0 pre-build audit (reconstructed baseline and ERD proposal). It is kept unchanged as history and does not describe
what was built.

Everything here was proven on the local Docker Supabase stack only (`LOCAL_TEST_HARNESS.md`). Nothing has been applied
to a shared or production database. The production schema is unknown to the repo until the D-10 schema diff is done
(`DEPLOYMENT_READINESS.md`). Nothing in this module is a legal determination; open legal items are in
`LEGAL_REVIEW_REGISTER.md`.

## Increments

| Increment | What it added | Document |
|---|---|---|
| W0 | Baseline audit, legal flags, decisions | `ARCHITECTURE_AUDIT.md` |
| W1 | Local test harness: staged workdir, local baseline (D-1), pgTAP and Vitest conventions | `LOCAL_TEST_HARNESS.md` |
| W2 | Role and profile guards, shop verification hardening, booking guards, roster links, worker profiles | `ROLE_AND_PROFILE_SECURITY.md` |
| W3 | Append-only audit events, in-app notifications, producers | `AUDIT_AND_NOTIFICATIONS.md` |
| W4 | Owner job openings and their lifecycle | `JOB_OPENINGS.md` |
| W5 | Marketplace search, applications with snapshots, free-training notice | `MARKETPLACE_AND_APPLICATIONS.md` |
| W6 | Training programs, trainers, sessions, attendance, assessments, booking gate | `TRAINING.md` |
| W7 | Shop-issued certifications, reviews, re-assessment, renewal | `CERTIFICATIONS.md` |
| W8 | Contract templates and immutable template versions (draft, requires legal review) | `CONTRACT_TEMPLATES.md` |
| W9 | Worker contracts, sealed versions, acceptance records, amendments, keyword flags | `WORKER_CONTRACTS.md` |
| W10 | Derived owner relationships and the informational three-distinct-owner count | `OWNER_RELATIONSHIPS.md` |
| W11 | WashLink certification review, reported contract problems, role-aware dashboards | `DASHBOARDS_AND_OVERSIGHT.md` |
| W14 | Job-opening reports and moderation, oversight reads, audited admin reads | `PLATFORM_MODERATION_AND_AUDIT.md` |
| W12 | Notification category registry, de-duplication, scheduled jobs (not registered) | `NOTIFICATIONS_AND_SCHEDULING.md` |
| W13 | Audit reads only through the audited RPC, paged moderation queue, expiry wording, docs | this file and the W13 docs below |
| W15 | Training booking gate keyed on roster link history (internal `roster_link_history`, its recorder trigger and the private `backfill_roster_link_history()`), training copy (D-79..D-81) | `TRAINING.md` |
| W16 | Gate holds until the enrollment ends (D-83, D-84), leave and cancel reachable on `failed`, training and shop-removal copy (D-85, D-86), locked clause pin (D-87), authenticated function list pin (D-89) | `TRAINING.md`, `CONTRACT_TEMPLATES.md`, `LIMITATIONS.md` |

W14 was split from W11 (D-49) and built before W12. Its migrations are dated `2026_10_29`, W12's `2026_10_30`, so
the apply order by file name is W2..W11, W14, W12, W13, W15, W16. Rollback runs in the exact reverse (`ROLLBACK_GUIDE.md`).

Cross-cutting documents added in W13:

- `ROLLBACK_GUIDE.md`: the order of rollback, the cron step that must run first, and what data each step loses.
- `LIMITATIONS.md`: accepted limitations, untested areas and open legal topics.
- `DEPLOYMENT_READINESS.md`: human gates before any production use (all unchecked).
- `ACCEPTANCE_TESTS.md`: J1-J18 index, SPEC K evidence map and the renamed-tests trail.
- `LEGAL_REVIEW_REGISTER.md`: index of the legal register and the W13 items. The earlier items are in
  `legal/REGISTER_PART_1_W0_W8.md` and `legal/REGISTER_PART_2_W9_W14.md`.

## Source of truth and data flow

Supabase Postgres is the only source of truth for workforce data. The FastAPI scaffold in `backend/` has no workforce
table, model or route; it took no part in this module (its 4 pytest tests are the J18 regression check for it).

```
React page (features/*)  ->  hook (presentation/hooks)  ->  service (application/services, zod in application/validation)
  ->  repository interface (domain/repositories)  ->  Supabase*Repository (infrastructure/repositories)
  ->  supabase-js: PostgREST table reads under RLS, or rpc('<definer function>')
  ->  Postgres: RLS policies, BEFORE guard triggers, SECURITY DEFINER RPCs, AFTER producer triggers
  ->  workforce_audit_events (append-only) and notifications (in-app, registry-checked)
```

- Components never call Supabase or fetch. Repositories are the only Supabase callers and map rows to domain models.
- Services hold business rules and validation that mirror the database. The database stays the authority: a UI that
  hides an action is convenience, not authorization.
- Hooks own loading, empty, error and success states. Pages are wired through
  `presentation/dependencyInjection/create*Dependencies.ts` (one factory per area) and new routes are lazy-loaded.
- Notifications are polled (up to 60 s late); there is no Realtime subscription (D-62).

## Authorization model

| Layer | What it does | Where described |
|---|---|---|
| RLS | Enabled on every workforce table (J17 roll-up `j17_every_workforce_table_has_rls_enabled`). Client reads are row-filtered; tables no client reads have deny-all policies. | each area doc |
| Grants | Clients write directly only to `job_openings` (owner drafts), `worker_profiles` and `worker_private_contacts` (own rows), under RLS and guard triggers. Every other write goes through a definer RPC. `service_role` holds no workforce table privilege after D-78. | `ROLE_AND_PROFILE_SECURITY.md` (D-10 rows 53-56) |
| Guard triggers | BEFORE triggers enforce state machines, immutable columns and write-once facts for every session, so they hold whatever production policies exist (P1, P2). | `ROLE_AND_PROFILE_SECURITY.md` guard matrices |
| Definer RPCs | `SECURITY DEFINER`, `set search_path = public, pg_temp` (pg_temp last, P8). They check the caller's role and ownership and set a transaction-local write flag (`washlink.*`) that the guard accepts for one row and one transition (P6). | each area doc |
| Trusted session | `is_trusted_db_session()`: SQL editor, psql, migrations, service_role. It fails closed for every end-user JWT and for PostgREST, GoTrue and Storage sessions (P5). A service-key request counts as trusted, but after D-78 `service_role` holds no workforce table, sequence or `washlink_private` privilege, so service-key access reaches workforce data only through definer RPCs that grant it EXECUTE. Trusted repairs are forward-only (D-40). | `ROLE_AND_PROFILE_SECURITY.md` |
| Audited reads | super_admin reads of private records are definer functions that write an audit event first: `admin_workforce_audit_log` (`workforce_audit.log_searched`), moderation case reads, contract-problem case reads, relationship lookups with a purpose. Since W13 (D-70) the raw audit table returns 0 rows to every client role and the review-log view is trusted-SQL only. | `PLATFORM_MODERATION_AND_AUDIT.md` |
| Notification registry | Every notice must match one of 37 registered categories; `external_delivery` is fixed to `never`. | `NOTIFICATIONS_AND_SCHEDULING.md` |

Roles: `customer`, `owner`, `worker`, `super_admin` (profile column `role`). Signup can only create customer, owner or
worker. A super_admin is created by trusted SQL only (D-8). A database superuser or the table owner can bypass any
trigger. This is outside the threat model and listed in `LIMITATIONS.md`.

## Data model by area

The J17 roll-up pins the list of 44 workforce tables (43 before W15 added `roster_link_history`) and 2 views
(`j17_workforce_table_list_is_complete`). The pre-workforce tables `profiles`, `workers`, `bookings`, `shops`,
`shop_pricing` and `shop_verification_documents` were hardened in W2 but are not workforce tables. J18 proves that
bookings, pricing, verification and ratings still work.

| Area | Tables (views in italics) | Main entry points |
|---|---|---|
| Roles, worker data, roster (W2, W15) | `worker_profiles`, `worker_private_contacts`, `worker_roster_link_codes`, `worker_roster_link_attempts`, `roster_link_history` (W15, internal, no client access) | `submit_shop_for_verification`, `create_roster_link_code`, `preview_roster_link_code`, `accept_roster_link_code`, `list_my_roster_links` |
| Audit and notices (W3, W12) | `workforce_audit_events`, `notifications`, `notification_categories`, *`shop_verification_review_log`* | `record_workforce_audit_event` (internal), `enqueue_notification` (internal), `mark_notifications_read` |
| Job openings (W4) | `job_openings` | `transition_job_opening`, `shop_has_recorded_verification` |
| Applications (W5) | `job_applications`, `retained_job_application_records` (W9) | `search_job_openings`, `create_job_application`, `transition_job_application`, `applicant_profiles_for_job_opening` |
| Training (W6) | `training_programs`, `training_program_trainers`, `training_sessions`, `training_enrollments`, `training_attendance_records`, `training_assessments`, *`training_enrollment_progress`* | w6e..w6g RPCs; booking gate `bookings_guard_training_assignment` (w6h) |
| Certifications (W7, W11) | `certifications`, `certification_status_events`, `certification_review_requests`, `certification_reassessments`, `shop_certification_policies`, `certification_platform_reviews` | `insert_certification`, `renew_certification`, `transition_certification`, `decide_certification_review`, `decide_certification_platform_review` |
| Contract templates (W8) | `contract_templates`, `contract_template_versions`, `contract_template_sections`, `contract_template_clauses`, `contract_template_placeholders`, `worker_classification_options` | `create_owner_contract_template`, `platform_contract_template_current`, `publish_platform_contract_template_version` |
| Worker contracts (W9) | `worker_contracts`, `contract_versions`, `contract_version_clauses`, `contract_version_flags`, `contract_acceptances`, `contract_acknowledgement_texts`, `contract_problem_term_rules` | `create_worker_contract_draft`, `save_worker_contract_draft`, `send_worker_contract_version`, `activate_worker_contract`, `terminate_worker_contract`, `decline_worker_contract_version` |
| Owner relationships (W10) | `worker_owner_relationships`, `workforce_policies` | `worker_distinct_qualifying_owner_count`, `refresh_worker_owner_relationship`, `set_workforce_policy_value` |
| Oversight (W11) | `worker_contract_disputes` | `raise_contract_dispute`, `close_contract_dispute`, dashboard summaries |
| Moderation and access (W14, W13) | `job_opening_reports`, `job_opening_moderation_cases`, `job_opening_moderation_actions`, `admin_access_records` | `report_job_opening`, `moderate_job_opening`, `submit_job_opening_changes`, `admin_job_opening_moderation_queue_page` (W13), `my_workforce_activity`, `admin_workforce_audit_log` |
| Scheduling (W12) | `workforce_scheduled_jobs` | `run_workforce_scheduled_job`, `expire_worker_contracts_batch`, `enqueue_certification_expiry_notices`, `admin_workforce_scheduled_jobs` |

Key data rules (details in the area docs):

- Snapshots are write-once: application snapshots of the opening (W5), the shop verification snapshot at certificate
  issue (W7), sealed contract versions with their rendered text and sha256 hash (W9).
- Required initial training is free to the worker: `worker_fee` is forced to 0 by a CHECK, and no fee or deduction
  column exists (J7). The w6h gate (D-17; keyed on link history since W15, D-79; holding until the enrollment ends since W16, D-83) refuses, for every
  client role including super_admin, to assign a roster row that is or was linked to a trainee in required training to
  a customer booking of the training owner, or to start a booking assigned to that row. It holds after a recorded fail
  and after the training shop is deleted, and lifts on completion, withdrawal or cancellation, so a recorded pass or a
  cancel by the owner lifts it (W16-L1). Trusted sessions bypass it. A
  row never linked to the trainee (name-only, or deleted and re-created) is not detected (W15-L1). Exception: a super_admin can assign that trainee to another owner's booking, which is
  outside the gate's scope (W6 REVIEW; W13-L11, `LIMITATIONS.md`). Off-platform work is not visible.
- A certificate needs at least 3 attended supervised days and a current passed assessment, re-checked under locks (J6).
  Its issuer kind is always `shop_issued`.
- Contract templates carry `review_status = draft_requires_legal_review` only (D-28). A locked clause in the standard
  template changes only through a human-run migration (D-87, W16-L3). A contract acceptance is a
  recorded acceptance, not an electronic signature (D-6).
- The distinct-owner count is informational. No contract action reads it, so declining, leaving and terminating are
  never blocked (D-3, J16).
- Retention after account, shop or owner deletion follows D-18, D-32 and D-35. No retention period is defined
  (W13-L5).

## Notices and scheduling path

1. A business action (RPC or guarded write) fires an AFTER producer trigger. The producer writes one
   `workforce_audit_events` row through `record_workforce_audit_event`. The payload is checked by
   `workforce_audit_payload_is_safe`: no contact data, notes or free text.
2. If the action concerns another party, the producer calls `enqueue_notification` (or `_safely`) with an idempotency
   key `<family>:<subject id>:<audit event id>`. The W12 registry trigger checks the category, key prefix and subject
   type. Text passes `notification_text_is_safe`, and owner-typed labels pass `notification_safe_label`.
3. The frontend polls `notifications` (own rows only) and marks them read with `mark_notifications_read`. Delivery is
   in-app only; no email, SMS or push exists (D-61).
4. Three scheduled jobs (certificate expiry notices, worker contract expiry, relationship refresh) go through one
   date-free runner, `run_workforce_scheduled_job`. **They are not registered anywhere.** Registration is a human step
   in the runbook in `NOTIFICATIONS_AND_SCHEDULING.md`, done only after written approval (D-63). Until then, contract
   expiry is derived on read only.
5. Since W13 (D-72) the contract expiry notice says WashLink "now shows it as expired" from the end date written in
   the contract. It does not say the work relationship ended (W13-L1).

## Frontend structure

`frontend/src/` follows the layers above:

- `domain/models` (types) and `domain/repositories` (interfaces).
- `infrastructure/repositories/Supabase*Repository.ts`: every Supabase call.
- `application/services` and `application/validation`: rules and zod schemas.
- `presentation/hooks`: state, loading and errors.
- `presentation/components`: shared UI by role and area.
- `features/<auth|owner|worker|superAdmin>`: pages.

Shared UI states use `Skeleton`, `EmptyState` and `LoadErrorNotice`. Feedback uses `sonner`. Design tokens live in
`presentation/design`. Copy constants live in `presentation/utilities/*Copy.ts`. Vitest pins the safety copy:

- the free-training notice before enrollment;
- "Shop-issued certification" and "Not a government-recognized credential";
- "Draft template — requires legal review";
- "recorded acceptance (not an electronic signature)";
- the D-73 termination copy.

Vitest runs with mocked repositories only (`LOCAL_TEST_HARNESS.md`).

## Tests and evidence

- pgTAP: 113 files from a clean reset that applies 99 staged migrations: `Files=113, Tests=3423`, `Result: PASS`
  (W16 LOG "FIX CYCLE 1 (DB)"; 113 / 99 / 3405 at the W16 DB build; 108 files / 97 migrations / 3280 assertions after W15 fix cycle 1; 105 / 96 / 3198 after W13 fix cycle 1).
- API smokes: 15 local smokes, run in order by `scripts/supabase-test/run-api-smokes.mjs` (D-77; w15, then w16, before
  w13, D-88): `run-api-smokes: PASS (15 smokes)` in the W16 test step.
- Vitest, lint and build: numbers recorded in STATE.md by the W13 test step.
- `ACCEPTANCE_TESTS.md` maps J1-J18 and SPEC K to files.

## What this module does not claim

It does not claim legal compliance, a legal effect of any record, notice or takedown, government recognition of
certificates, or that an acceptance is an electronic signature. It does not claim that any production database matches
the local stack. `LIMITATIONS.md` and the legal register list what remains open.
