# Workforce module: rollback guide (W13, W15, W16)

**No ROLLBACK block has ever been executed, with three limited exceptions.** That holds for every increment: W2 to W14 and the
four W13 migrations. The W15 (w15a) block was executed once, on the local stack only, inside a transaction that was
rolled back (W15 LOG "BUILD (DB) + TEST"); it has run nowhere else, never with data kept. The w16a and w16b blocks were also run on the local stack inside rolled-back transactions (W16 `VERDICT.md`); neither has run anywhere else. Each migration ends with a commented `-- ROLLBACK` block. Apart from
those local runs, they were written and reviewed but never run, not even on the local stack. Treat each block as an untested draft. Read it and try it on a fresh local stack before you
rely on it. This guide does not claim that any rollback works.

There is no second database (SPEC G). A rollback removes objects and, at several steps, data. Nothing here may run
against a shared or production database without the written approval of the project owner.

## Preconditions

1. **Local first.** Run the full sequence on the local Docker stack (`LOCAL_TEST_HARNESS.md`). Run the
   `-- ROLLBACK` blocks in psql as a trusted session. Re-run `run-db-tests.mjs` after each increment you roll back
   and expect the later increments' tests to fail.
2. **Production only after D-10.** No block is valid on production until the D-10 schema dump and diff is done and
   recorded (`DEPLOYMENT_READINESS.md`). Several blocks restore W2..W12 bodies verbatim from the repo. If production
   bodies, policies or triggers differ, a block can silently drop production-only behaviour. Production also needs
   written approval before any step.
3. **D-11 versions.** The local stager applies byte-identical copies under 14-digit versions (W13 = `20261030000006..09`, W15 = `20261103000001`, W16 = `20261104000001..02`).
   The repo files are named `YYYY_MM_DD_*` (D-11). Which `schema_migrations` rows a production rollback must remove
   depends on how a human renames the files before any `db push`. Decide that first.
4. **Export before every IRREVERSIBLE step.** Use a trusted `copy (select ...) to ...` of each table the step drops.
   Treat the export as personal data (RA 10173).
5. **Revert the frontend with the database.** The deployed frontend must not call functions that no longer exist.

## Step 0: unregister the scheduled jobs

Before any rollback, run `scripts/supabase-scheduling/unregister_workforce_jobs.sql` wherever
`register_workforce_jobs.sql` was ever run. Run it as `postgres`, the same role that registered the jobs. It
unschedules every `washlink_workforce_%` job by jobid and is idempotent. Otherwise pg_cron keeps calling
`run_workforce_scheduled_job` after W12 is gone. The jobs are not registered by any migration, and the loop never
registered them anywhere. This step is still required, because a human may have registered them.

## Order

Order: W16 -> W15 -> W13 -> W12 -> W14 -> W11 -> W10 -> W9 -> W8 -> W7 -> W6 -> W5 -> W4 -> W3 -> W2.

This is the exact reverse of the apply order by file name. W14 comes after W12 because the W14 migrations are dated
`2026_10_29` and W12's are `2026_10_30`. W16 (`2026_11_04`) is last applied, so it is rolled back first, then W15 (`2026_11_03`). Within an increment, run its blocks in reverse letter order, starting at the
last migration (for example W13 d, c, b, a). W1 and W0 have no migrations: the local baseline is test-only (D-1) and
is not part of the repo's migrations.

Never roll back an earlier increment while a later one exists. The area docs list each dependency (W8 is invalid
while W9 FKs exist, W4 / W5 while the w14c triggers exist, W7 / W9 / W10 while W11 exists, and so on).

## Per-increment blocks

`file:line` is the line of the `-- ROLLBACK` header in `supabase/migrations/`. The area doc has the step-by-step text.

| Step | Blocks (reverse order) | Data lost | What stays | Stager / other |
|---|---|---|---|---|
| W16 | `2026_11_04_w16b_contract_template_core_text_pin.sql:95`, `2026_11_04_w16a_training_gate_holds_until_enrollment_ends.sql:68` | none | enrollments, bookings and template versions (versions stay write-once) | b drops the core text pin; a restores the w15a body of `roster_worker_in_required_training` verbatim; this re-opens SEC-5 and F-C1; revert the frontend lifecycle and copy edits together; `TRAINING.md`, `CONTRACT_TEMPLATES.md` |
| W15 | `2026_11_03_w15a_training_gate_roster_link_history.sql:154` | the link-history rows (derived; a re-apply backfills only current links and surviving `roster.linked` / `roster.unlinked` audit rows) | links stay as `workers.user_id` and the audit rows | restores the w6h body of `roster_worker_in_required_training` FIRST (it references the table), then drops the trigger, `backfill_roster_link_history()`, `record_roster_link_history()` and the table; this re-opens the F-C2 unlink bypass; revert the frontend copy line (`trainingVersusPaidWorkText`); `TRAINING.md` |
| W13 | `2026_10_30_w13d_contract_expiry_notice_wording.sql:112`, `w13c...:68`, `w13b...:81`, `w13a...:80` | none | d: notices already sent keep the D-72 text; b: `log_searched` rows written meanwhile stay | revert the W13 frontend paging and copy; see "D-78 / S6 grant revokes and the w13b rollback" (b re-opens W14 N1) |
| W12 | `w12e:206`, `w12d:186`, `w12c:150`, `w12b:219`, `w12a:101` | c: job state history | audit rows; notices (unchecked again); contracts recorded expired stay expired (D-40) | Step 0 first; drop the 8th helper from `HELPERS_SOURCE_NAMES`; `NOTIFICATIONS_AND_SCHEDULING.md` |
| W14 | `w14i:152`, `w14h:211`, `w14g:224`, `w14f:204`, `w14e:147`, `w14d:286`, `w14c:179`, `w14b:290`, `w14a:102` | g: admin access records; b: reports, cases, actions (IRREVERSIBLE) | audit rows, notifications, stamped shop reviewers | w14c and w14f each in ONE `begin ... commit`; 7th helper; `PLATFORM_MODERATION_AND_AUDIT.md` |
| W11 | `w11i:179` .. `w11a:79` | e: contract problems; b: WashLink reviews and linked events (IRREVERSIBLE) | audit rows, notifications, contracts | b drops the holds FIRST; 6th helper; `DASHBOARDS_AND_OVERSIGHT.md` |
| W10 | `w10g:83` .. `w10a:73` | d: relationship rows (re-derivable except `owner_removed`); c: policy value and reason | audit rows (from / to values) | e drops the triggers FIRST; b restores the w9c guard body (re-opens W9-S1 / C1); 5th helper; `OWNER_RELATIONSHIPS.md` |
| W9 | `w9j:231` .. `w9a:94` | c / d: **every contract, sealed version and acceptance record**; i: retained application records (IRREVERSIBLE) | audit rows, notifications | 4th helper; `WORKER_CONTRACTS.md` |
| W8 | `w8h:141` .. `w8a:67` | c: owner templates and versions (IRREVERSIBLE) | audit rows | e: platform rows are guarded (roll back c instead); 3rd helper; `CONTRACT_TEMPLATES.md` |
| W7 | `w7h:303` .. `w7a:76` | b: issued certificates and events (IRREVERSIBLE); c: reviews, re-assessments | audit rows, notifications | g restores the W5 bodies (re-opens D-12); 2nd helper; `CERTIFICATIONS.md` |
| W6 | `w6i:304` .. `w6a:66` | d: attendance, assessments (training evidence, D-18; IRREVERSIBLE); c: enrollments, sessions; b: programs | audit rows, notifications | h: bookings behave as after W5; `TRAINING.md` |
| W5 | `w5e:271` .. `w5a:72` | b: applications and their snapshots (IRREVERSIBLE) | audit rows, notifications | b restores the W4 `jo_select_published_for_workers` policy; `MARKETPLACE_AND_APPLICATIONS.md` |
| W4 | `w4d:179` .. `w4a:56` | c: job openings (IRREVERSIBLE) | audit rows | b restores the w2b / w2d bodies (re-opens R-2); `JOB_OPENINGS.md` |
| W3 | `w3d:322`, `w3d0:42`, `w3c:260`, `w3b:269`, `w3a:96` | c: every notification (inbox); b: **the whole audit history** (IRREVERSIBLE) | rows other increments wrote are gone with b | a resets `search_path = public` (re-opens R-1); `AUDIT_AND_NOTIFICATIONS.md` |
| W2 | `w2f:237`, `w2e:333`, `w2d:225`, `w2c:199`, `w2b:230`, `w2a:270` | f: worker profiles and private contacts (IRREVERSIBLE) | links already made stay as `workers.user_id` | a / c: restore the pre-W2 policies from the D-10 dump, not the local baseline; `ROLE_AND_PROFILE_SECURITY.md` |

All files are `supabase/migrations/2026_10_<dd>_<id>_*.sql`, except W15 (`2026_11_03_w15a_*.sql`) and W16 (`2026_11_04_w16*.sql`). Use `ls supabase/migrations/*_w14c_*` to find the full name.

## Trigger-order caveats

Postgres fires same-timing triggers in name order, and several guarantees depend on that order. A rollback must
remove triggers in the stated order, inside one transaction where noted:

- **w14c** (D-10 rows 46-48). It split the w4c `job_openings_guard_write` trigger into an INSERT / DELETE trigger
  and `job_openings_guard_write_update`. It added `job_openings_guard_moderation`, `job_openings_moderation_hold` and
  `job_openings_moderation_resolve`. The BEFORE UPDATE order is `job_openings_guard_moderation` <
  `job_openings_guard_write_update` < `job_openings_moderation_hold` < `job_openings_normalize`. Its rollback drops
  the W14 triggers and re-creates the single w4c trigger in ONE `begin ... commit`. Done in parts, a failure could
  leave owner UPDATEs unguarded. The W4 and W5 rollbacks are invalid while these triggers exist.
- **w14f**. `shops_zz_rereview_stamp` is named with `zz_` so that it sorts after
  `shops_prevent_owner_verification_mutation`; the AFTER trigger `shops_audit_rereview` comes with it. Roll back the
  re-review triggers, then their functions, in one transaction. A production trigger that sorts after `zz_` and
  rewrites `verification_reviewed_by` / `_at` would undo the stamp. This is a D-10 check, not a rollback step.
- **W3 producers versus guards.** The w3d AFTER producer triggers sit on W2-guarded tables (shops, roster, worker
  profiles). Drop them (w3d) before any W2 step. Rolling back W2 while W3 exists is invalid.
- **W6 booking gate.** `bookings_guard_update_training_gate` sorts after the W2 `bookings_guard_update`. The W6 h
  rollback removes only the gate. Do not rename the W2 trigger. W16 a replaces only the gate's body, not the trigger.
- **W16 core text pin.** `contract_template_versions_zz_core_text_pin` sorts after
  `contract_template_versions_validate_at_commit`. Its rollback drops the trigger, then the function, before any W8 step.
- **W11 holds after W7 guards.** The W11 BEFORE triggers on W7 tables (for example
  `certification_review_requests_platform_hold`) sort after the W7 guards. The w11b rollback drops the holds FIRST,
  then the guard, the reviews table and `certification_status_events.platform_review_id`.
- **W12 registry.** `notifications_guard_registered_category` sorts after the W3 `notifications_guard_insert`.
  The w12b rollback drops the registry trigger and function before the table.
- **W10 sync triggers** on `worker_contracts`, `shops` and `profiles` must be gone before any W9 step.

## D-78 / S6 grant revokes and the w13b rollback (W13 b)

W13 b revoked grants that earlier increments or Supabase defaults had left behind (D-78; fix cycle 1 S6, N3):

- `truncate, references, trigger` on `job_openings` from `authenticated`;
- `truncate, references, trigger` on the six pre-workforce tables (`profiles`, `shops`, `bookings`, `workers`,
  `shop_pricing`, `shop_verification_documents`) from `public`, `anon` and `authenticated`;
- all privileges on `job_openings`, `worker_profiles`, `worker_private_contacts`, `worker_roster_link_codes` and
  `worker_roster_link_attempts` from `service_role`;
- all privileges on the sequence `certification_status_events_id_seq` (W7) from `public`, `anon`, `authenticated` and
  `service_role`;
- all privileges on schema `washlink_private` and on `roster_link_code_pepper` from `service_role`.

**The w13b ROLLBACK block does not re-grant any of these** (fix cycle 1, S5). Do not re-grant them unless the D-10 diff
proves that production depended on them. On production, re-grant only what the diff shows production held and used
before W13, never anything it did not have. Each re-grant re-opens a hole: TRUNCATE bypasses RLS and row triggers, and
`anon` could call `nextval` on the sequence. It also makes the J17 roll-up fail on purpose
(`j17_no_client_role_has_insert_update_delete_on_workforce_tables`, `j17_service_role_has_no_workforce_table_privileges`,
`j17_no_client_role_has_privileges_on_any_public_sequence`,
`j17_no_client_role_has_truncate_references_or_trigger_on_any_public_table`,
`j17_service_role_cannot_reach_roster_link_code_pepper`).

What the w13b ROLLBACK block does:

- It drops the restrictive deny-all policy `wae_no_client_select`. Rolling back w13b therefore removes the restrictive
  guard, and any permissive select policy on `workforce_audit_events` decides raw reads again.
- It re-creates `wae_select_super_admin` exactly as in w3b. This **re-opens W14 N1**: a super_admin can again read raw
  audit rows without a `workforce_audit.log_searched` event. Only roll back w13b if that is accepted in writing.
- It re-grants `select` on `shop_verification_review_log` to `authenticated` and restores the earlier comments.

The J17 policy checks `j17_no_workforce_policy_qual_is_the_literal_true` and
`j17_no_anon_or_public_write_policy_on_workforce_tables` are unaffected by a w13b rollback (the w3b policy is not
literal `true`).

## Data loss summary

The following steps are IRREVERSIBLE without an export: W14 b and g, W11 b and e, W10 c and d, W9 c, d and i, W8 c,
W7 b and c, W6 b, c and d, W5 b, W4 c, W3 b and c, and W2 f.

- The worst losses are every contract with its sealed text and acceptance records (W9), the whole audit history (W3)
  and training evidence that D-18 promised to keep (W6).
- Rows written by a later increment's producers into W3 tables (audit events, notifications) stay until W3 itself is
  rolled back.
- Records that were true when written stay true: contracts recorded as expired, notices already sent, `log_searched`
  rows. A rollback never rewrites history.
- No retention period is defined (W13-L5). An export made for a rollback is a new copy of personal data and needs
  its own retention decision.

## Trusted repairs (not a rollback)

A trusted-SQL terminate of a contract (w10b forward-only repair) cannot clear `pending_version_id`, so it leaves an
open amendment behind. This is an accepted limitation (W9-S1), pinned by `w13_raw_trusted_terminate_leaves_open_amendment`.
The runbook, as the W12 expiry batch does it and as `j15_w13_trusted_contract_end_runbook.test.sql` proves:

```sql
begin;
select set_config('washlink.worker_contract_write', '<contract id>', true);
select public.worker_contract_close_open_versions('<contract id>');
select set_config('washlink.worker_contract_write', '', true);
update public.worker_contracts set status = 'terminated' where id = '<contract id>';
commit;
```

The repair notifies nobody. It is audited as `trusted_session`, and a worker's decline or termination is never
affected (J16). It is a WashLink record only. It does not end a work relationship (W9-L17, W10-L7). It needs the same
written approval as any production change.
