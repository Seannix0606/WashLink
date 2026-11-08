# W7 - Certifications - VERDICT

**Overall: PASS** (verifier, 2026-10-26; local Docker stack only; no `.env` read, no remote, no commit)

Clean state: the staged stack was stopped first (`npx supabase stop --workdir .local-supabase-test --no-backup`, 0 supabase containers running),
then everything below was re-run. The stack was stopped again at the end.

## Check suite (actual output)
| Check | Exit | Result |
|---|---|---|
| `cd frontend && npm run lint` | 0 | `eslint .`, no problems |
| `cd frontend && npm run build` | 0 | `tsc -b` + vite `built in 427ms` |
| `cd frontend && npm test` | 0 | Test Files 83 passed (83); Tests 157 passed (157) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 (incl. `stager_seeds_every_helper_file_in_order`) |
| `node scripts/supabase-test/run-db-tests.mjs` run 1 | 0 | 44 staged migrations applied (start + reset); `Files=47, Tests=1713`, `Result: PASS`; 0 `not ok` files |
| `node scripts/supabase-test/run-db-tests.mjs` run 2 | 0 | `Files=47, Tests=1713`, `Result: PASS` (no flake) |
| w2 / w3 / w4 / w5 / w6 / w7 API smokes | 0 each | 48/0, 33/0, 43/0, 39/0, 40/0, 38/0 (passed/failed) |

## Acceptance criteria
| AC | Verdict | Evidence |
|---|---|---|
| AC1 | PASS | 8 files `2026_10_26_w7[a-h]_*.sql`, each exactly 1 `-- ROLLBACK`; `git diff --name-status d26865d -- supabase/migrations` empty (all W7 files untracked additions); every file in `supabase/migrations` matches `YYYY_MM_DD_<snake>.sql`; staged `20261026000001..08` in a..h order and byte-identical (`cmp`) |
| AC2 | PASS | runner `Result: PASS` twice; `001_migration_replay` ok with `replay_schema_migrations_has_baseline_w2_to_w7` and `replay_w7_certification_tables_rls_enabled` (plan 20); 0 files contain `todo_start(` |
| AC3 | PASS | `j6_worker_cannot_be_certified_without_three_days_and_assessment` ok; all 19 planned `j6_*` names present; w7e `issue_certification` (lines 93-119) takes `lock_certification_training` (shop/program/enrollment FOR SHARE, advisory `training_evidence:<id>` = W6 w6g:43 key, `certifications:<worker>`), then re-reads and checks verification, completion, attended days and current passed assessment, then the 55000 stale check; Vitest `j6_*` pass |
| AC4 | PASS | `j3_unverified_owner_cannot_issue_shop_certifications` ok, all 9 `j3_*` names present; w7 smoke unverified-shop check passes |
| AC5 | PASS | `j8_unauthorized_users_cannot_alter_certification_records` ok; w7b `certifications_guard_write` (lines 126-140) rejects any change outside status columns before the flag check, so trusted + flagged sessions still get 42501 (`j8_cert_issue_fields_and_snapshots_immutable_for_every_session` sets the flag and tries 12 columns + attestation); smoke patch/delete denied |
| AC6 | PASS | `j6_w7_certification_lifecycle` ok, all 17 `w7_*` names present; insert guard stamps `issued_at`/`approved_at`/`validity_months`/`expires_at` server-side (w7b:149-153); `j6_issue_and_expiry_stamps_server_set_no_backdating` present and passing |
| AC7 | PASS | `j4_w7_certification_required_openings` ok (9 names); j4 W5 file diff adds one fixture `select test_helpers.issue_test_certification(...)` line and one comment, with no `is(`/`ok(`/`throws_ok(`/`plan(` change; file ok |
| AC8 | PASS | `j6_w7_certification_audit_and_notifications` ok, all 7 names present |
| AC9 | PASS | `j17_w7_certification_authorization` ok (12 names); Vitest `j17_certification_repository_writes_only_through_rpcs` passes; w7 smoke 38/0; W2 48, W3 33, W4 43, W5 39, W6 40 all 0 failed |
| AC10 | PASS | `j6_issuer_kind_is_shop_issued_only` passes; Vitest copy-scan test passes; 9 `government-recogni[sz]ed` hits in frontend/src + w7 migrations (non-test), all negated ("not a government-recognized ...", "never government-recognized") |
| AC11 | PASS (as amended) | `j18_w7_flows` ok (7 names); every pre-W7 pgTAP file ok (incl. `j18_existing_flows`); pytest 4 passed; stager 19 = 18 + 1. Test-dir diff = new files + `001`, `j4` (named in plan) + `j5` (flake fix in LOG "Review polish (DB) follow-up": uuids masked in the payload text before the 650 pattern match, no plan/name change; the two runs here were clean) |
| AC12 | PASS | 83 files / 157 tests pass (128 earlier + 29 W7); every planned section-5 Vitest name is in the frontend/src test files; lint and build exit 0; `grep -rn service_role frontend/src` = 0 |
| AC13 | PASS | no added or changed file (md included) over 350 lines (largest migrations w7g 350, w7b 348); `git diff --stat d26865d -- backend` empty; `.env` and `frontend/.env` modified 2026-10-23 / 10-21, before HEAD; `docs/workforce/CERTIFICATIONS.md` exists and the other section-7 docs are modified; `grep -c "W7-L" LEGAL_REVIEW_REGISTER.md` = 20 |

## Safety
- W6-and-earlier migrations unchanged against d26865d. Test-helper `backdate_certification` exists only in
  `scripts/supabase-test/baseline/test_helpers_certifications.sql`: 0 hits in `supabase/migrations`, and 0 public functions named like backdate in the local DB.
- The only `.sql` files outside migrations and tests are the planned `scripts/supabase-test/baseline/test_helpers_certifications.sql`, so there are no stray `.sql` files.
  No JWT, sb_secret_, project-ref URL, --linked, --db-url or db push in any added line of code or scripts. The w7 smoke refuses hosts other than
  127.0.0.1/localhost and gets keys from `supabase status --workdir`. The stager diff only adds a second seed file.
- Reviewer BLOCKING findings: none (REVIEW.md). The review-polish fixes are present in code (w7c profile-delete guard, w7e pre-checks, w7f reinstate closes the review).

## Frontend mapping vs DB (checked against the local DB)
- `applicant_verified_certifications(uuid)` returns `TABLE(certification_id, certification_title, issuing_shop_name, issued_at, expires_at,
  issuing_shop_currently_verified boolean)`. That matches `supabaseJobApplicationRow.ts:134,146` and `supabaseCertificationRows.ts:43,75`.
- `worker_profiles_guard_certified_delete` raises "A worker profile with certifications cannot be deleted. Delete the account instead." with
  errcode 23503. That string is in the allowlist at `supabaseErrorMessages.ts:158`, which matches before the 23503 generic fallback, and
  `SupabaseWorkerProfileRepository.deleteOwnWorkerProfile` uses `toUserFacingError`.
- Every user-reachable W7 raise message is in the allowlist. The 12 messages that are not (direct-write guards, preflight, internal
  "A past time cannot be used.") are not reachable through client RPCs and fall back to the generic code message.

## Spot-checks (code + proving test)
1. Issue re-checks under locks: see AC3 (w7e:93-119). Proved by `j6_no_certification_after_attendance_corrected_to_absent`,
   `j6_no_certification_after_pass_corrected_to_fail`, `j6_stale_assessment_id_rejected` and `j3_owner_who_lost_verification_cannot_issue_renew_or_reinstate`.
2. Issue fields immutable for every session: see AC5 (w7b:126-140). Proved by `j8_cert_issue_fields_and_snapshots_immutable_for_every_session`.
3. History survives deletion attempts: w7c:194-212 BEFORE DELETE guard, every session, cascade allowed only once the profiles row is gone. Proved by
   `j19_certified_worker_profile_delete_refused`, `j19_certified_worker_profile_delete_refused_for_trusted_session`,
   `j19_certified_worker_account_deletion_still_works` and `j18_w7_certifications_survive_shop_deletion` (shop_id set to null, status active,
   `certification.shop_removed` audit, no worker notification).

## Non-blocking observations
- LOOP.md DB row still records the W7 build count (46 files / 1686). The current figure is 47 / 1713. RECORD should update it.
- In the j8 immutability test, one of the 12 attempts (shop_verification_status_at_issue set to approved) sets the existing value. It is refused
  by the same-status rule, not the column rule, so the 42501 is correct but the evidence for that column is weaker.
- No test runs concurrent transactions, so lock serialisation is shown by code review only (as REVIEW.md says).
