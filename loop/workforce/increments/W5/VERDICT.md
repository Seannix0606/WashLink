# W5 - Marketplace & applications - VERDICT

**Overall: PASS**

Independent verifier, 2026-10-25. Branch `feature/workforce`, HEAD 50cb850, W5 changes uncommitted. Local Docker stack
only (staged `.local-supabase-test`). Started with the stack stopped (0 containers) and stopped it again afterwards
("Stopped supabase local development setup.", 0 containers). No `.env` read, no remote contact, no commit, no repo-root
CLI run by the verifier. Graded against PLAN.md as amended by the LOG.md deviations (BUILD DB 1-7, frontend 1-6,
orchestrator note, fix cycle 1 frontend and DB, security re-review follow-up) and D-12..D-14.

## Check suite (actual output, this run)
| Check | Exit | Result |
|---|---|---|
| `cd frontend && npm run lint` | 0 | eslint, no problems |
| `cd frontend && npm run build` | 0 | tsc -b clean, "built in 457ms" |
| `cd frontend && npm test` | 0 | Test Files 53 passed (53), Tests 92 passed (92); verbose run: every planned W5 Vitest name passes |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 18, pass 18, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | 27 migrations applied in order (start + reset); 29 files `ok`; `Files=29, Tests=1094`; `All tests successful`; `Result: PASS` |
| `w2-api-smoke.mjs` | 0 | 48 passed, 0 failed |
| `w3-api-smoke.mjs` | 0 | 33 passed, 0 failed |
| `w4-api-smoke.mjs` | 0 | 43 passed, 0 failed |
| `w5-api-smoke.mjs` | 0 | 39 passed, 0 failed |

## Safety
- `git diff --name-status 50cb850 -- supabase/migrations`: empty, so no W4-or-earlier migration changed. The 5 W5 files are new (untracked).
- Naming `2026_10_25_w5[a-e]_<snake>.sql`: all 5 match. `grep -L -- "-- ROLLBACK"`: empty. Staged as
  `20261025000001..05` in a-e order, and each one is byte-identical to its source (`cmp`).
- No stray `.sql` outside migrations / tests/database / baseline. `todo_start(`: 0 in every test file.
- `git diff 50cb850 -- supabase/tests/database`: only `001_migration_replay.test.sql` changed (plan 17 -> 18, the renamed
  version check plus `replay_w5_job_applications_rls_enabled`). Everything else there is new files.
- `git diff --stat 50cb850 -- backend`: empty. No `.env*` in the status. No added or changed file over 350 lines.
- No `db push` / `--linked` / `--db-url` / `link` in scripts (the only hits are prose in docs). No JWTs, project refs or
  keys. The W5 smoke reads keys in memory from `npx supabase status -o env --workdir .local-supabase-test` (cwd repo
  root, same as the committed W2/W4 smokes, read-only) and refuses any non-loopback URL (w5-api-smoke.mjs:51).
- `grep -rn worker_private_contacts frontend/src/presentation/components/owner` and `grep -rn service_role frontend/src`: empty.
- Reviewer BLOCKING S-B1 (owners reading never-sent drafts) is closed: see spot check 1. The security re-review found no BLOCKING issues.

## Spot checks (code plus proving test)
1. Owners never see never-sent drafts. Policy `ja_select_owner_non_draft` requires `submitted_at is not null` and
   `is_current_job_opening_owner` (w5b:259-263). The same condition applies in `applicant_profiles_for_job_opening`
   (w5d:139,152), `applicant_verified_certifications` (w5d:184-186) and the owner branch of `transition_job_application`
   (w5c:246-247). Tests: `j17_owner_cannot_read_draft_applications`, `j5_owner_cannot_see_or_transition_drafts`, and
   `j17_fix1_owner_never_reads_closed_draft` / `_no_profile_access_for_closed_draft` / `_cannot_act_on_closed_draft`
   (auto-closed draft holding a cover note; j17_w5_fix1:20-56). All pass.
2. Snapshot immutable. Guard step (a) raises 42501 whenever an UPDATE changes or clears a non-null `opening_snapshot` /
   `opening_snapshot_taken_at`. It runs before the trusted-session bypass (w5b:115-125). Tests:
   `j4_snapshot_write_once_for_every_session` (worker, owner, trusted, service_role; forge, clear and re-stamp all
   refused; the value is unchanged afterwards; j4:290-311), `j4_snapshot_unchanged_after_owner_edits_published_opening`,
   and smoke `snapshot_unchanged_after_owner_edit`. All pass.
3. Private contacts never visible to owners. No W5 migration widens `worker_private_contacts` (only a comment mentions
   it, w5d:11). The applicant RPC returns named `worker_profiles` fields plus `full_name` only (w5d:120-154). Tests seed a
   real contact row (j17_w5:16, visibility_window:15), then `j17_owner_cannot_read_applicant_private_contacts`,
   `j17_applicant_profiles_have_no_contact_columns` and `j17_owner_never_reads_private_contacts_at_any_stage`. Smoke:
   `worker_saves_private_contact`, `owner_reads_zero_private_contacts`, `applicant_profiles_have_no_contact_keys`. All pass.

## Acceptance criteria
All 114 test names planned in section 5 exist: 91 pgTAP plus 23 Vitest (`j18_w5_flows` is the file name). Every pgTAP
file reports `ok` and every Vitest test passes.
| AC | Verdict | Evidence |
|---|---|---|
| AC1 | PASS | 5 w5a-e files, ROLLBACK in each, no committed migration diff |
| AC2 | PASS | 27 migrations replayed, `Result: PASS`, `replay_schema_migrations_has_baseline_w2_w3_w4_w5` and `replay_w5_job_applications_rls_enabled` present, 0 todo_start |
| AC3 | PASS | every `j4_*` name present (j4 file ok, plus the cap file ok); Vitest j4 names pass |
| AC4 | PASS | every `j5_*` name in both j5 files ok (plus the fix1 lock-order file); Vitest j5 lifecycle and pipeline names pass |
| AC5 | PASS | spot check 2; smoke snapshot check ok |
| AC6 | PASS | `j4_cannot_apply_after_deadline`, `_on_deadline_day_manila`, `_paused_closed_or_archived`, `_shop_loses_verification`, `j5_submit_rechecks_...` in passing files |
| AC7 | PASS | `j5_closing_opening_closes_open_applications`, `j5_archiving_from_trusted_repair_also_closes`; smoke `closing_opening_closes_application`. Amended by fix cycle 1: drafts become worker-only closed drafts |
| AC8 | PASS | `j17_applicant_verified_certifications_authorized_and_empty_until_w7`, `j4_application_has_no_certification_claim_column`; Vitest self-reported / none-yet names pass |
| AC9 | PASS | spot check 3; `j17_owner_cannot_read_worker_profiles_table_directly`; Vitest `w5_applicant_view_never_renders_private_contact_fields` |
| AC10 | PASS | j5_application_audit_and_notifications file ok (all names present); smoke `notifications_have_no_cover_note_or_terms` |
| AC11 | PASS | j17_w5_application_authorization ok, plus the fix1 and visibility-window files; Vitest `j17_job_application_repository_never_sends_status_owner_or_snapshot` |
| AC12 | PASS | Vitest notice / disclaimer / not-a-contract / visibility-copy names pass (copy per frontend deviation 1); `j4_application_requires_current_notice_version` |
| AC13 | PASS | w5 39/0, w2 48/0, w3 33/0, w4 43/0 |
| AC14 | PASS | 92/92 (the 64 pre-existing plus the W5 tests), lint and build exit 0, both greps empty |
| AC15 | PASS | all pre-W5 pgTAP files ok; tests diff = new files plus 001 only; j18_w5_flows names ok; pytest 4 passed; stager 18/18 |
| AC16 | PASS | no file over 350 lines; no remote commands; backend diff empty; docs present (`MARKETPLACE_AND_APPLICATIONS.md` replaces `JOB_APPLICATIONS.md`, BUILD deviation 2); `W4-L10` hits in LEGAL_REVIEW_REGISTER.md; D-12..D-14 ADOPTED-DEFAULT |

## Non-blocking notes (for RECORD)
- `docs/workforce/LOCAL_TEST_HARNESS.md` (lines 27, 94) and the LOOP.md DB row still say "25 files, 1027". The actual
  count is now 29 files, 1094 tests.
- Two things remain checked only structurally, as the LOG states: concurrency (lock order and the cap race were not
  exercised with two live sessions) and production `profiles.full_name` content (D-10 row 27, human step).
