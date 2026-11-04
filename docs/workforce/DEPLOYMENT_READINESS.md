# Workforce module: deployment readiness (human gates)

Every box below is a human gate and is **unchecked**. The loop ticks none of them and cannot do so. Nothing in this
file states that a gate is done, that the module is ready for production, or that any feature is lawful. A gate is
done only when a named person ticks it in a reviewed commit, with the date and a link to the record (dump file, sign-off
row, approval message).

SPEC K: "Do not deploy this feature or apply migrations to a shared or production database without explicit
authorization." The gates run roughly in the order below. A later gate assumes the earlier ones.

## 1. Production schema diff (D-10, standing gate)

The repo does not know the production schema. All loop results are local only (`LIMITATIONS.md`).

- [ ] A human takes a schema-only dump of the production project themselves (read-only, outside the loop) and keeps
      it as a restricted file.
- [ ] The dump is diffed against a clean local reset (99 staged migrations). Every row of the D-10 checklist in
      `ROLE_AND_PROFILE_SECURITY.md` (rows 1-58) is answered and recorded: W2 rows 1-16, W3 17-20, W4 21-23,
      W5 24-26, W6 27-32, W7 33-35, W8 36-37, W9 38-39, W10 40-42, W11 43-45, W14 46-48, W12 49-52, W13 53-56,
      W15 57, W16 58.
- [ ] **Triggers on `public.workers` (row 57, W15 R4 / SEC-8).** List every production trigger on `public.workers`
      (BEFORE and AFTER, with function bodies). Record any trigger the repo does not create, in particular a BEFORE
      trigger that changes or nulls `user_id`, and decide with the project owner before applying W15. The w15a AFTER
      trigger `workers_record_link_history` writes only `roster_link_history` and skips no-op updates and orphaned
      `user_id` values (SEC-1); `backfill_roster_link_history()` (private, not client- or service_role-executable)
      reports its row counts (current links; `roster.linked` / `roster.unlinked` audit rows) in a NOTICE.
- [ ] **Trigger name order (rows 46-48).** On `public.job_openings` the BEFORE UPDATE order is exactly
      `job_openings_guard_moderation` < `job_openings_guard_write_update` < `job_openings_moderation_hold` <
      `job_openings_normalize`, with no production trigger sorting between them. On `public.shops`,
      `shops_zz_rereview_stamp` sorts after `shops_prevent_owner_verification_mutation`, with no other BEFORE UPDATE
      trigger after it. The production `job_openings_guard_write()` body matches w4c. On `public.bookings`,
      `bookings_guard_update_training_gate` sorts after `bookings_guard_update`. On `public.profiles`,
      `profiles_sanitize_role_on_insert` and `profiles_guard_protected_columns` are present, with no production BEFORE
      trigger writing `role` after the guard (F-S4). On `public.contract_template_versions`,
      `contract_template_versions_zz_core_text_pin` sorts after `contract_template_versions_validate_at_commit`.
- [ ] **W16 pre-apply count (row 58).** On a restored copy of production with w16a applied (the rule is w16a's, and it reads
      link history), as a trusted session: `select count(*) from public.bookings where booking_status = 'accepted' and
      assigned_worker_id is not null and public.roster_worker_in_required_training(assigned_worker_id, shop_id);`. These
      bookings stop being startable once w16a is applied. The count is expected to be 0 because the workforce tables are not yet in
      production; the actual result is recorded, and any hit is decided with the project owner before applying W16.
- [ ] **Anon default grants (F-S3).** Using the diff, a human decides whether to revoke `anon` SELECT / INSERT / UPDATE /
      DELETE on the six pre-workforce tables, records the decision, and on a revoke adds it to J17.
- [ ] **EXECUTE on the 3 trigger functions (W16 REVIEW N7).** `authenticated` can execute `handle_new_user`,
      `set_booking_quote_from_shop_pricing` and `set_shop_pricing_updated_at` (pinned in `j17_w16_authenticated_executable_function_list`).
      After the D-10 diff, a human decides whether to revoke it and records the decision; a revoke updates that list.
- [ ] **Trusted-session allow-list (F-S5).** `is_trusted_db_session()` trusts any no-JWT session except three API logins.
      A human lists the production database roles and login paths from the diff and decides whether an allow-list is
      needed.
- [ ] **Realtime and every publication (row 52, S7).** Across **all** publications, not only `supabase_realtime`:
      `select pubname, puballtables from pg_publication;` shows no `puballtables = true`, and
      `select * from pg_publication_namespace;` shows no publication of the whole `public` schema, and
      `select pubname, tablename from pg_publication_tables where schemaname = 'public';` lists no workforce table and
      no table that must stay private. Any hit is recorded and decided with the project owner before applying W12.
- [ ] **Grants versus D-78 (row 56).** Record the production grants on `job_openings`, `worker_profiles`,
      `worker_private_contacts`, `worker_roster_link_codes`, `worker_roster_link_attempts` and the sequence of
      `certification_status_events`. Confirm that nothing outside this repo uses the grants w13b revokes:
      `authenticated` TRUNCATE / REFERENCES / TRIGGER on `job_openings`, TRUNCATE / REFERENCES / TRIGGER of `public`,
      `anon` and `authenticated` on the six pre-workforce tables (S6), every `service_role` privilege on the five
      tables, every client privilege on the sequence, and `service_role` access to `washlink_private` (N3).
- [ ] **Audit read policies (row 54, S1).** Every select policy on `workforce_audit_events` other than
      `wae_select_super_admin` is listed from the dump (the w13a NOTICE also lists them at apply time). Each one is
      **dropped before W13 is applied**, by a reviewed migration or trusted SQL, and the drop is recorded. The w13b policy
      `wae_no_client_select` is RESTRICTIVE and should keep raw reads closed anyway. The gate still requires the drop,
      because a restrictive policy is the only guard against a permissive one and a later change could remove it.
- [ ] **Replaced bodies (rows 35, 42, 53).** The production bodies of the functions that W7 g, W10 b and W13 d replace
      match the repo versions. w13a aborts unless md5(prosrc) of `worker_contracts_audit()` is exactly the w9j
      or the w13d body (S4). A differing body is reviewed by a human before w13d runs.
- [ ] Every preflight (w3d0, w4a, w5a, w6a, w7a, w8a, w9a, w10a, w11a, w14a, w12a, w13a, w15a, w16a, w16b) passes against a restored copy
      of the production schema, and every NOTICE is recorded.
- [ ] **J17 catalogue on the production copy (S7).** On a restored copy of the production schema, with every migration
      applied (never on production itself), the catalogue assertions of
      `j17_database_constraints_and_authorization_prevent_unauthorized_access` are run and pass. They cover tables, RLS,
      grants, sequences, column grants, policies, definer search_path, Realtime and guard triggers. Any failure is
      recorded and fixed by a reviewed migration before deploy.

## 2. Migration versions (D-11)

- [ ] A human decides how the `YYYY_MM_DD_*` files are versioned before any `db push`. They parse as version `2026`
      and collide in `schema_migrations`. The decision is recorded in `DECISIONS.md`, and `ROLLBACK_GUIDE.md`
      precondition 3 is updated.

## 3. Data backfill and operating rules

- [ ] Row 14 query run on production: approved shops with a null `verification_reviewed_by` or
      `verification_reviewed_at` are listed (W4 rows 21-23, R-2). After W4 they lose verified behaviour until a
      super_admin confirms them in the "Approved without a recorded review" queue (W14 D-56).
- [ ] Operating rule adopted: deactivate reviewing super_admins, never delete them (W2 R-5). Deleting one nulls
      `verification_reviewed_by`, and the shop stops counting as verified (W2-L4).
- [ ] super_admin accounts are created by trusted SQL only (D-8), and the list of holders is recorded.
- [ ] Who may hold trusted database access (SQL editor, psql, service key) is decided and recorded. Those reads are
      not logged (W13-L4).
- [ ] The frontend is deployed together with the matching migrations (D-10 row 12 for W2). The RPCs it calls,
      including the W13 page function `admin_job_opening_moderation_queue_page` (row 55), exist before that
      frontend goes live.

## 4. Legal and privacy review

- [ ] A qualified Philippine labor-law professional reviews every item of the legal register
      (`LEGAL_REVIEW_REGISTER.md`, 174 items, all OPEN) and records an outcome per item and a signed row in its
      "Human sign-off" table.
- [ ] A qualified data-privacy professional (RA 10173) reviews the data-privacy items: retention (W13-L5), personal
      data and access (see the overlap map), audit access (W13-L4), and the privacy notice at collection (W2-L1).
- [ ] Retention periods are decided for audit events, notifications, contracts, acceptance records and training
      evidence, and the trusted purge procedure gets its cut-offs (W3-L1, W12-L6, W13-L5).
- [ ] `LIMITATIONS.md` is reviewed and accepted in writing (W13-L6).
- [ ] **Spec D training model.** A qualified labor-law professional reviews the training model before any trainee
      uses it: free required training of at least 3 supervised days, the trainee booking gate and its gaps (W6-L10,
      W6-L11, W13-L11, W15-L1, W16-L1), the hold and the leave action (W16-L2, W16-L7), owner attestations and the notice wording.
- [ ] **Spec E templates and workflow.** The final contract template content ("Draft template — requires legal review",
      D-28) and the whole draft, send, accept, amend and terminate workflow are reviewed before any owner relies on them.
      A change to a locked clause goes through a human-run migration (D-87, W16-L3); a change to an editable clause goes
      through a platform version. Either needs its own review, which nothing in the system requires.
- [ ] All user-facing safety copy is reviewed: the free-training notice, the shop-issued certificate labels, the
      acceptance label, the D-72 expiry notice, the D-73 termination copy, the D-85 training copy (W16-L2), the D-86 shop-removal
      confirm (W16-L4) and the landing copy "Verified car wash professionals" (W16-L6).

## 5. Scheduled jobs (D-63, row 51)

- [ ] Written approval to register the jobs is recorded.
- [ ] pg_cron is available on the production plan, and the role cron runs as reaches `run_workforce_scheduled_job` as
      a trusted session (W12 R6).
- [ ] The first-run backlog is checked (`admin_workforce_scheduled_jobs().pending_count`, W12 R5, W12-L8). Owners
      and workers are prepared for a burst of true "expired" notices.
- [ ] `scripts/supabase-scheduling/register_workforce_jobs.sql` is run as `postgres`, following the runbook in
      `NOTIFICATIONS_AND_SCHEDULING.md`. The three `washlink_workforce_%` jobs are recorded, and
      `unregister_workforce_jobs.sql` is kept ready (`ROLLBACK_GUIDE.md` step 0).

## 6. Branch review, merge and deploy

- [ ] The final whole-branch verification (`loop/workforce/FINAL_VERDICT.md`) is read by a human. The full local
      suite is re-run from a clean reset: `run-db-tests.mjs`, then `run-api-smokes.mjs` (w13 last), Vitest, lint,
      build and pytest.
- [ ] A human reviews the `feature/workforce` diff against `main`, including every migration and every `-- ROLLBACK`
      block. The blocks have never been executed, except the w15a, w16a and w16b blocks, on the local stack
      only, inside rolled-back transactions.
- [ ] A human with authority approves the merge of `feature/workforce` into `main` and performs it.
- [ ] A human with authority approves applying the migrations to production after gates 1-5, and applies them.
- [ ] A human with authority approves the frontend deploy (Render) and performs it.
- [ ] A post-deploy check is run on production by a human: role guards, a test booking, notices, and no workforce
      table in Realtime.
