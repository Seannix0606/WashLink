# W2 - VERDICT (independent verifier, 2026-10-24)

**Overall: PASS**

Basis: PLAN.md AC1-AC15 as amended by the deviations recorded in LOG.md (both "Fix cycle 1"
sections) and REVIEW.md. Working tree uncommitted on `feature/workforce`, HEAD `eb38246`.
Started from a clean state: no supabase containers running. Only the local stack was used;
`.env` was not read; no remote commands; no commit.

## Check suite (re-run by the verifier)

| Check | Command | Exit | Actual result |
|---|---|---|---|
| Lint | `cd frontend && npm run lint` | 0 | `eslint .`, no findings |
| Build | `cd frontend && npm run build` | 0 | `built in 502ms` |
| Vitest | `cd frontend && npm test` | 0 | `Test Files 24 passed (24)`, `Tests 36 passed (36)`; no skip/only/todo in `frontend/src` |
| Backend | `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | `4 passed, 1 warning` |
| Stager | `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | `tests 18, pass 18, fail 0` (all 6 S10/S11 names present) |
| DB/RLS + replay | `node scripts/supabase-test/run-db-tests.mjs` | 0 | 13 migrations applied (baseline, 6 pre-W2, `20261024000001..06`); 10 files `ok`; `Files=10, Tests=341`; `Result: PASS`; 0 `Failed (TODO)` / `TODO passed` |
| W2 API smoke | `node scripts/supabase-test/w2-api-smoke.mjs` | 0 | `w2-api-smoke: 48 passed, 0 failed` (no keys printed) |
| Stack stop | `npx supabase stop --workdir .local-supabase-test --no-backup` (run from inside the staged workdir) | 0 | `Stopped`; 0 supabase containers afterwards |

## Safety

- `git diff --stat eb38246 -- supabase/migrations`: empty, so the 5 committed migrations are unchanged.
- 6 new migrations `2026_10_24_w2[a-f]_*.sql`. They all match `YYYY_MM_DD_<snake>.sql`.
  `grep -L -- "-- ROLLBACK"` is empty: each one has a ROLLBACK block (w2a:270, w2b:230,
  w2c:199, w2d:225, w2e:333, w2f:237).
- There is no stray `.sql` under `supabase/`. Every `.sql` there is in `migrations/` or `tests/database/`.
- `grep -c "todo_start("` gives 0 in all 10 pgTAP files.
- `supabase/config.toml` `[db.seed]` contains `enabled = false`.
- No `.env*` file was changed or added. Changed files contain no JWT, `sb_secret_`/`sb_publishable_` key,
  `*.supabase.co` ref or service key. `frontend/src` contains no `service_role`. Every
  `db push`/`--linked`/`--db-url`/`project-ref` match is a documentation note or a refusal guard.
  The smoke script refuses non-loopback URLs and reads its keys from `supabase status`
  without printing them.
- File sizes: every added or changed source file is at most 348 lines. The largest are
  `stage-local-workdir.test.mjs` 348, `w2e` 345, `stage-local-workdir.mjs` 343 and
  `j18_existing_flows` 343. The exception is `supabase/config.toml` at 417 lines: it is
  CLI-generated, was already 416 at eb38246, and W2 changed 3 lines. Accepted as pre-existing.
- `backend/` is unchanged. The untracked `.claude/` directory holds the installed loop
  agents and commands (from the install-agents step) and is not W2 code.
- Reviewer BLOCKING findings: S-B1 and C-B1 are recorded as FIXED in REVIEW.md, and the
  re-review found no BLOCKING findings. The fixes are proven by
  `j17_w2_fix1_fk_cascades` (31 assertions, ok), `j17_w2_fix1_review_and_hardening`
  (42 assertions, ok) and the smoke `deleteUser` and review-stamping checks (all ok).

## Acceptance criteria

| AC | Verdict | Evidence |
|---|---|---|
| AC1 | PASS | 6 files named `2026_10_24_w2[a-f]_*`. ROLLBACK is in every file. The committed-migration diff is empty. |
| AC2 | PASS | The runner reset applied 13 migrations in order. `replay_schema_migrations_has_baseline_and_w2` is in 001 (file ok). |
| AC3 | PASS | todo_start is 0 in all 10 files. No TODO lines. `Result: PASS`. |
| AC4 | PASS | `j17_signup_cannot_self_assign_super_admin` (j17_authorization_harness:122-125) and `j1_signup_unknown_role_defaults_to_customer` x2 (j1:14-19) both pass. The trigger is in w2a:139-160 (whitelist customer/owner/worker, all sessions). |
| AC5 | PASS | `j17_profile_owner_cannot_change_role` x2, `j17_metadata_update_cannot_change_profile_role` (files ok) and Vitest `j17_auth_role_comes_from_profiles_row_not_user_metadata` all pass. The repo comment is at SupabaseAuthRepository.ts:216. The GoTrue silent-restore branch (R4) is only proven by the smoke script. |
| AC6 | PASS | `j17_owner_cannot_insert_preapproved_shop`, `j17_customer_cannot_register_shop`, `j17_approved_shop_identity_change_requires_rereview`, `j17_verification_document_path_bound_to_own_shop`, `j18_owner_can_resubmit_after_changes_requested` (RPC as owner, j18:192-198), `j17_owner_cannot_directly_resubmit_changes_requested_shop` (P0001, also with a forged flag) and Vitest `j18_submit_shop_for_verification_uses_rpc` all pass. The code is in w2b:12-153. |
| AC7 | PASS | `j17_customer_cannot_change_quoted_price` x5, `j17_assigned_worker_cannot_change_protected_booking_fields` x6, `j17_customer_cannot_forge_booking_insert_fields` x3, `j17_owner_cannot_assign_foreign_worker`, `j17_customer_cannot_cancel_accepted_booking` and `j17_worker_cannot_skip_booking_status` all pass. The code is in w2c:16-158. |
| AC8 | PASS | `j17_user_cannot_read_other_profiles_contact`, `j17_worker_cannot_rewrite_roster_row` x3, `j17_worker_can_toggle_own_availability`, `j1_owner_cannot_set_worker_user_id_directly`, `j1_worker_can_link_roster_with_code`, `j1_worker_can_be_linked_to_multiple_owners` and `j1_roster_link_creates_no_worker_profile` all pass. `grep -rn fetchWorkerByUserIdentifier frontend/src` is empty. |
| AC9 | PASS | `j17_is_verified_shop_owner_requires_own_approved_shop` (7 occurrences) passes. Fix cycle 1 made it stricter: it now also requires reviewer, reviewed_at and is_active. |
| AC10 | PASS | All 19 planned pgTAP `j1_*` names are present in a passing file (j1 plan 55). All 13 planned Vitest `j1_*` names are present and pass. |
| AC11 | PASS | `j17_other_users_cannot_read_worker_profile`, `j17_other_users_cannot_read_worker_private_contact`, `j17_worker_profile_cannot_be_written_for_another_user`, `j17_link_tables_not_readable_by_clients` and `j17_trusted_session_false_for_end_users` all pass. |
| AC12 | PASS | `j18_existing_flows` (64) and `j18_w2_profile_reads` (19) are ok, including all 7 planned j18 additions. Vitest 36/36 includes the original 16. pytest `4 passed`. |
| AC13 | PASS | 18/18 stager tests pass, including the 6 planned names. config.toml shows `enabled = false`. |
| AC14 | PASS | `j1_role_picker_offers_worker`, `j1_duplicate_account_shows_sign_in_guidance`, `j1_sign_up_reports_confirmation_required`, `j1_worker_onboarding_flow_validates_and_submits` and `j1_owner_onboarding_checklist_reflects_verification_status` all pass. Lint and build both exit 0. |
| AC15 | PASS | Sizes as listed above: all source files are at most 348 lines, and config.toml is a pre-existing generated exception. There are no remote commands and no `.env` access. ROLE_AND_PROFILE_SECURITY.md:90 contains the D-10 checklist. |

## Spot-checks of closed weaknesses (migration and proving test, read by the verifier)

- E1: `sanitize_profile_role_on_insert` (w2a:139-160) is a BEFORE INSERT trigger on profiles
  for every session. It sets any role outside customer/owner/worker to customer. It is proven
  by j17_authorization_harness:122-125: even a trusted create_user with role super_admin
  gives 0 super_admin profiles.
- E3/C3: `guard_shop_insert` (w2b:12-42) requires role owner and a pending shop with no
  review fields set. It is proven by j17_authorization_harness:141-147 (a preapproved insert
  leaves 0 rows) and by j17_w2_shop_booking_guards:38-44 (42501 for a customer, and 42501
  for a forged reviewer).
- S1: `guard_booking_insert` (w2c:16-47) forces customer_id to auth.uid() and requires
  pending, unassigned and unrated. It is proven by j17_authorization_harness:245-259 (forged
  status, worker and rating each give 0 rows).
- F5: `submit_shop_for_verification` (w2b:119-153) is owner-only and uses a transaction
  flag. The guard (w2b:80-95) allows only pending or changes_requested to pending. It is
  proven by j18_existing_flows:192-198 (RPC as owner: pending and submitted_at set) and by
  j17_w2_shop_booking_guards:112-125 (a direct UPDATE gives P0001; a forged flag cannot
  approve). The frontend calls the RPC (SupabaseShopVerificationRepository.ts:189).

## Not verifiable locally (carried, not failing)

- R4: the GoTrue supabase_auth_admin silent-restore branch is only covered by the smoke script.
- D-10: the production schema is unknown. The checklist is in ROLE_AND_PROFILE_SECURITY.md.
- Non-blocking carry-forward items R-1 to R-6 in REVIEW.md, routed to W3, W4, W7, W10 and W13.
