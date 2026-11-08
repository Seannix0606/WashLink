# W4 - Job openings (owner) - VERDICT

**Overall: PASS**

The verifier re-ran every check itself on 2026-10-25, starting with the stack stopped (no supabase containers). Range checked: 36784d6..HEAD (47b5d55) plus the uncommitted and untracked files. The plan was graded as amended by the deviations in LOG.md:
- `updateJobOpening(id, input, expectedUpdatedAt)` (optimistic concurrency)
- archived openings are left out of the owner list, with a notice at the 200-row limit
- neutral helper text in the requirements section

Nothing was committed, no `.env` was read and the remote was not contacted. The Supabase CLI ran only through the runner or smoke scripts, or from `.local-supabase-test` (project_id `washlink-local-test`, no project-ref).

## Check suite (actual output)
| Check | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | `eslint .`, no findings |
| `npm run build` | 0 | `built in 634ms` |
| `npm test` | 0 | Test Files 38 passed (38); Tests 64 passed (64) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | 4 passed, 1 warning |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 18, pass 18, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` | 0 | 22 migrations applied (w4a..d staged as 20261024000012..15, in order); all 20 files `ok`; `Files=20, Tests=749`; `Result: PASS`; 0 TODO lines |
| `w2-api-smoke.mjs` | 0 | 48 passed, 0 failed |
| `w3-api-smoke.mjs` | 0 | 33 passed, 0 failed |
| `w4-api-smoke.mjs` | 0 | 43 passed, 0 failed (35 planned + 8 `occ_*`) |
| `supabase stop --workdir . --no-backup` (cwd `.local-supabase-test`) | 0 | stopped; 0 supabase containers left |

## Acceptance criteria
| AC | Verdict | Evidence |
|---|---|---|
| AC1 | PASS | `git diff --name-status 36784d6 -- supabase/migrations` lists only 4 `A` lines (w4a..w4d) and the worktree has no migration changes. `grep -L -- "-- ROLLBACK"` over w4* returns nothing. Names match `2026_10_24_w4[a-d]_<snake>.sql`. |
| AC2 | PASS | Runner `Result: PASS` with 22 migrations. `001_migration_replay` is `ok` with plan(17). `grep -c "todo_start("` is 0 in every file. |
| AC3 | PASS | `j2_owner_can_create_and_manage_only_own_job_openings` (63) and `j2_job_opening_lifecycle` (48) are `ok`. Vitest `j2_job_opening_lifecycle_offers_only_allowed_transitions` passes. Every j2 name from PLAN section 5 is in the test files. |
| AC4 | PASS | `j3_unverified_owner_cannot_publish_job_openings` (42) is `ok`. Vitest `j3_publish_action_disabled_with_reason_for_unverified_shop` passes. Code: w4d:56-58 calls `is_verified_shop_owner` before publish/resume; w4b:26-33 defines the predicate (approved, reviewed_by, reviewed_at, is_active). |
| AC5 | PASS | w4c:29-36 has no DEFAULT on any compensation, benefits, schedule or terms column. pgTAP `j2_compensation_columns_have_no_default` (information_schema count 0) and `j2_compensation_is_optional_and_stored_as_entered` pass. Vitest `w4_compensation_display_shows_only_entered_values`, `w4_compensation_display_says_not_specified_when_empty` and `w4_job_opening_form_has_no_prefilled_compensation_benefits_or_schedule` pass. |
| AC6 | PASS | Policies w4c:283-297: owner `owner_id = auth.uid()`, worker `status = 'published'` plus the verified rule, super_admin `status <> 'draft'`. Test lines j2_owner...:144-166 check other owner, worker, customer and super_admin (0 rows) and anon (42501). `j2_published_opening_visible_to_workers_only` passes. |
| AC7 | PASS | `j17_shared_verified_rule_matches_gate_and_shop_names`, `j17_approved_shop_names_require_recorded_review` and `j18_roster_link_preview_still_lists_verified_shop` pass (their files are `ok`). |
| AC8 | PASS | The audit and no-notification names (`j2_audit_*`, `j2_draft_edits_write_no_audit_event`, `j3_rejected_publish_writes_no_status_event`, `w4_job_opening_actions_enqueue_no_notifications`) are in files that are all `ok`. |
| AC9 | PASS | `j17_w4_job_opening_authorization.test.sql` (35) is `ok`. All 11 planned j17 names are present. |
| AC10 | PASS | Smokes: W4 43/0, W2 48/0, W3 33/0. The W4 smoke refuses non-loopback URLs (w4-api-smoke.mjs:51). |
| AC11 | PASS | All 15 planned Vitest names pass by name (verbose run); 64/64 total (46 existing + 15 planned + 3 extra). Lint and build exit 0. `grep -rn service_role frontend/src` is empty. |
| AC12 | PASS | Every pre-W4 pgTAP file is `ok`, including the booking regression `j18_existing_flows` and `j18_w3_flows`. The j1 diff is one fixture line only (`create_shop` replaced by `create_verified_shop`). `j18_w4_flows` (14) is `ok`. pytest 4 passed; stager 18/18. |
| AC13 | PASS | Largest added or changed files are 350 lines (w4c migration, test_helpers.sql, PLAN.md); none is over 350. `git diff --stat 36784d6 -- backend` is empty. No `.env` in the diff. The only `db push`/`link` mentions are prohibitions in docs. No JWTs, `sb_secret`, `*.supabase.co` or project refs in the diff. Docs: JOB_OPENINGS.md added; ROLE_AND_PROFILE_SECURITY, AUDIT_AND_NOTIFICATIONS and LOCAL_TEST_HARNESS updated. |

## Safety confirmations
- w3-and-earlier migrations are unchanged vs 36784d6. The w4 files are unchanged since 47b5d55 (no worktree diff).
- No stray `.sql`. Only the 4 migrations, test_helpers.sql (seed) and the 7 pgTAP files under `supabase/tests/database/`.
- Every security and compliance finding in REVIEW.md is NON-BLOCKING. The three fixes made before verify are present and covered by tests:
  - `w4_owner_job_openings_list_shows_notice_when_limit_reached`
  - `w4_preview_pluralizes_minimum_years_experience`
  - the neq-archived assertion in `w4_supabase_job_opening_repository_selects_explicit_columns`

## Notes (non-blocking)
- TEST_RESULTS.md records Vitest 62/62. That was before the review fixes; the current count is 64/64 (as in LOG.md). STATE.md should record 64.
- The LOOP.md W4 smoke row says "35 checks at W4 build". The actual count is now 43; RECORD should update it.
- Three files are exactly 350 lines, at the limit.
