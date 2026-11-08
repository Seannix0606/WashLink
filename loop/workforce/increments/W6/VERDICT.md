# W6 - VERDICT (independent verifier, 2026-10-26)

**Overall: PASS**

Scope: uncommitted tree on `feature/workforce`, HEAD caca376 (W5). PLAN.md graded as amended by LOG.md (D-18 retention
override replacing PLAN 4.4 / R4; both "Review polish" sections). Local staged stack only (`.local-supabase-test`,
project_id `washlink-local-test`, no `.temp/project-ref`); no `.env` read, no remote contact, no commit. Supabase CLI
run only from inside the staged workdir (stop) or through the runner (which uses the staged workdir as cwd).

## Check suite (clean state: stack stopped first, 0 supabase containers before the run)
| Check | Exit | Actual output |
|---|---|---|
| `npx supabase stop --workdir . --no-backup` (in `.local-supabase-test`) | 0 | Stopped supabase local development setup |
| `cd frontend && npm run lint` | 0 | eslint, no problems |
| `cd frontend && npm run build` | 0 | tsc -b clean, vite "built in 448ms" |
| `cd frontend && npm test` | 0 | Test Files 74 passed (74), Tests 128 passed (128); no `.skip` / `.only` / `.todo` in frontend/src |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 18, pass 18, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | 36 distinct migrations applied (W6 = 20261025000006..14, in a..i order); Files=38, Tests=1408, "All tests successful", Result: PASS; 0 `not ok`; 38/38 files `ok` |
| `w2-api-smoke.mjs` | 0 | 48 passed, 0 failed |
| `w3-api-smoke.mjs` | 0 | 33 passed, 0 failed |
| `w4-api-smoke.mjs` | 0 | 43 passed, 0 failed |
| `w5-api-smoke.mjs` | 0 | 39 passed, 0 failed |
| `w6-api-smoke.mjs` | 0 | 40 passed, 0 failed (incl. worker_fee_patch_denied_and_still_zero, trainee_booking_assignment_refused, evidence_patch_and_delete_denied, owner_account_delete_retains_worker_training_d18) |
| `npx supabase stop` (staged workdir) | 0 | Stopped; 0 supabase containers |

## Acceptance criteria
| AC | Verdict | Evidence |
|---|---|---|
| AC1 | PASS | 9 files `supabase/migrations/2026_10_25_w6[a-i]_*.sql`, all match `YYYY_MM_DD_<snake>.sql`; `grep -L -- "-- ROLLBACK"` empty; `git diff --name-status caca376 -- supabase/migrations` empty (w5 and earlier unchanged; W6 files untracked/new) |
| AC2 | PASS | runner Result: PASS, 36 migrations; `001_migration_replay` ok (replay_schema_migrations_has_baseline_w2_to_w6, replay_w6_training_tables_rls_enabled present); `todo_start(` count 0 in every test file |
| AC3 | PASS | all 19 planned `j6_*` names present in the J6 file (file ok); Vitest j6_* pass; code: w6d `training_progress_status` -> completed only when accepted AND distinct present supervised days on scheduled sessions (current rows) >= min_training_days (CHECK 3..30) AND current assessment = 'passed' |
| AC4 | PASS | all `j7_*` names present (file ok); live DB CHECKs `tp_required_initial_training_is_free`, `tp_worker_fee_is_zero` (worker_fee = 0), `tp_training_kind_check`; w6-lifecycle snapshot tests present; smoke worker_fee check ok; Vitest j7_training_repository_never_sends_worker_fee |
| AC5 | PASS | all `j8_*` names present (file ok); smoke evidence_patch_and_delete_denied ok |
| AC6 | PASS | all `w6_*` lifecycle names present (file ok); Vitest w6_program_lifecycle_offers_only_allowed_transitions / w6_enrollment_lifecycle_offers_only_allowed_actions pass |
| AC7 | PASS | j7_trainee_not_assignable_to_customer_bookings, every j18_* name in j18_w6_flows (file ok), w6rp gate tests; smoke trainee_booking_assignment_refused ok |
| AC8 | PASS | every name in j6_w6_training_audit_and_notifications present; file ok |
| AC9 | PASS | j17_w6_training_authorization ok; Vitest j17_training_repositories_write_only_through_rpcs; w6 smoke 40/0; W2 48, W3 33, W4 43, W5 39 all 0 failed |
| AC10 | PASS | lint/build exit 0; 128/128 Vitest (92 pre-W6 + 36 W6); `grep -rn service_role frontend/src` empty; `worker_fee` in repositories/rows only in the read select list, row mapping and tests (no RPC payload) |
| AC11 | PASS | every pre-W6 pgTAP file ok; `git diff --name-status caca376 -- supabase/tests/database` = only `M 001_migration_replay.test.sql` (rest new); pytest 4 passed; stager 18/18 |
| AC12 | PASS | 130 added/changed files, none > 350 lines; `git diff --stat caca376 -- backend` empty; no `.env*` in the diff; TRAINING.md exists and section-7 docs updated; `grep -c "W6-L" LEGAL_REVIEW_REGISTER.md` = 13 |

All 122 planned identifiers in PLAN.md (test names plus file names) were found in tests/files.

## Frontend vs DB: assessment-fail payload
Live DB (staged): `record_training_assessment(p_enrollment_id, p_items_met, p_result, p_assessor_comment default null,
p_failure_reason default null)`; `correct_training_assessment(..., p_correction_reason, p_failure_reason default null)`;
`training_evidence_for_enrollment` returns `failure_reason` between `assessor_comment` and `recorder_role`;
`ta_failure_reason_check` = (result = 'failed') = (failure_reason is not null) and 10..300; the message `Give a reason for
the fail of 10 to 300 characters.` exists in one function. Frontend matches: `SupabaseTrainingEvidenceRepository.ts:35-44`
sends `p_failure_reason` (null for a pass) on both RPCs; `supabaseTrainingEnrollmentRows.ts:213,242` reads
`failure_reason`; identical message in `supabaseErrorMessages.ts:90`, `trainingEvidenceSchemas.ts:17`,
`AssessmentSignOffModal.tsx:30`. MATCH.

## Safety
- Committed migrations unchanged vs caca376; W6 migrations staged in order 20261025000006..14 (w6a..w6i).
- No stray `.sql` (only planned `scripts/supabase-test/baseline/test_helpers.sql` changed, plus migrations / tests).
- No `.env*` changes; no secret / JWT / `sb_secret_` / project-ref patterns in added or changed files; remote-command
  mentions (`db push`, `--linked`, `--db-url`) appear only as prohibitions in docs; w6 smoke refuses non-loopback hosts.
- Reviewer BLOCKING findings: none open (REVIEW.md: security and compliance no BLOCKING; polish items fixed and covered
  by `j17_w6_review_polish`, 34 tests, ok).

## Spot-checks (code + proving test)
1. worker_fee always 0: w6b:27,48-49 CHECKs plus guard freezing worker_fee (w6b:155); no RPC fee argument;
   j7_worker_fee_check_forces_zero_for_required_initial (trusted insert/update -> 23514 naming either CHECK); smoke
   worker_fee_patch_denied_and_still_zero. CONFIRMED.
2. Completion = >= 3 distinct attended days + signed-off pass: w6d:163-228 (pure rule, distinct `session_date` count of
   present, supervised, scheduled, non-superseded rows; current assessment `passed`; `min_training_days` CHECK >= 3;
   assessments only via authorised-recorder RPCs); j6_two_attended_days_cannot_be_assessed, j6_same_day_counts_once,
   j6_three_days_and_passed_assessment_completes, j6_min_training_days_cannot_be_below_three. CONFIRMED.
3. Evidence survives shop deletion (D-18): programs/enrollments shop_id/owner_id `on delete set null` (w6b:18-19,
   w6c:42-43), enrollment program_id and attendance session_id `restrict`; j18_w6_d18_training_evidence_retention
   (plan 30, ok): d18_shop_deletion_succeeds_and_retains_worker_training_records, progress completed / shop_removed,
   worker still reads and withdraws, no recording afterwards. CONFIRMED.

## Notes (non-blocking)
- TEST_RESULTS.md first table still shows the pre-polish frontend count (70 files / 117 tests); actual now 74 / 128.
- LOOP.md DB row records W6 build 37 / 1374; actual final 38 files / 1408 tests (RECORD should update).
- Not verified (as stated by the builders): parallel-session concurrency, ROLLBACK block execution, production parity
  (D-10 rows 29-32), browser review.
