# W14 - Platform moderation, oversight reads and admin audit (super_admin) - VERDICT

**Overall: PASS** (independent verifier, 2026-10-29; uncommitted tree on `feature/workforce`, HEAD a880331, after fix cycle 1)

Graded against PLAN.md section 8 (AC1..AC14), the section-6 test names and REVIEW.md (B1, fix cycle 1). Item 6 (take-over) is out of scope (D-44).
LOG.md, TEST_RESULTS.md and REVIEW.md were read only to see what was claimed. Every number below comes from the verifier's own re-run.

## Check suite (re-run by the verifier; at the start Docker was up and no supabase containers were running)

| Check | Exit | Actual output |
|---|---|---|
| `cd frontend && npm run lint` | 0 | `eslint .`, no problems |
| `cd frontend && npm run build` | 0 | `tsc -b && vite build`, `built in 663ms` |
| `cd frontend && npm test` (run as `vitest run --reporter=verbose`) | 0 | `Test Files 131 passed (131)`, `Tests 263 passed (263)` (233 existing + 21 section-6 + 1 DI wiring test + 8 fix-cycle); 0 existing test files modified (`git diff --name-only a880331` has no `*.test.*`) |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | `4 passed, 1 warning` |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` (from a stopped stack, clean replay) | 0 | 87 staged migrations (85 repo + 2 local-test baseline files), each applied at start and again at `db reset` (174 `Applying migration` lines; w14a..i = 20261029000010..18 in a..i order); `All tests successful.` `Files=91, Tests=2876`, `Result: PASS`; 91/91 files `ok`, 0 `not ok` |
| w2 / w3 / w4 / w5 / w6 / w7 / w8 / w9 / w10 / w11 / w14 smokes (same stack, in order) | 0 each | 48 / 33 / 43 / 39 / 40 / 38 / 30 / 34 / 39 / 36 / 33 passed, 0 failed each |
| `npx supabase stop --workdir . --no-backup` (run inside `.local-supabase-test`) | 0 | "Stopped supabase local development setup." (project `washlink-local-test`); 0 supabase containers after |

## Acceptance criteria

All 78 pgTAP test names from PLAN section 6 (plus the 2 replay names) were found by `grep -F` in their planned files.
Plans of the new files: j2 reports 30, j2 takedown 51, j3 unreviewed shops 33, j17 audit reads 31, j17 lookups 24, j17 authorization 30,
j17 audit and notifications 13, j18 15, fix-cycle `j17_w14_fix1_report_privacy` 26 (sum 253); `001_migration_replay` 25 (was 24).
2622 + 253 + 1 = 2876. `todo_start(` count is 0 in every one of the 91 files. All 21 section-6 Vitest names show as passed in the verbose run.

| AC | Result | Evidence |
|---|---|---|
| AC1 | PASS | 9 files `2026_10_29_w14[a-i]_<snake>.sql`; `grep -L -- "-- ROLLBACK"` returns nothing (ROLLBACK line / file length: a 102/104, b 290/299, c 179/198, d 286/294, e 147/152, f 204/217, g 224/232, h 211/218, i 152/158); `git diff --name-status a880331 -- supabase/migrations` is empty (no M or D); all 9 files untracked (new) |
| AC2 | PASS | 87 migrations replayed, `Result: PASS`; `001_migration_replay.test.sql` (plan 25, `ok`) contains `replay_schema_migrations_has_baseline_w2_to_w14` and `replay_w14_moderation_tables_rls_enabled`; 0 files contain `todo_start(` |
| AC3 | PASS | all 10 names in `j2_w14_job_opening_reports` (`ok`, plan 30); Vitest `j2_w14_report_modal_validates_and_maps_errors`, `j2_w14_report_button_only_for_workers_on_readable_openings`, `j2_w14_my_reports_list_shows_outcome_without_owner_data` pass; smoke `worker_reports_with_rules_and_others_refused`, `report_limit_per_opening_23514`, `owner_sees_no_report_statement_or_reporter` ok |
| AC4 | PASS | all 18 names in `j2_w14_job_opening_takedown` (`ok`, plan 51), incl. `w14_w4_guard_body_unchanged_and_trigger_order`, `w14_application_snapshots_unchanged_after_takedown`, `w14_opening_content_unchanged_after_takedown`; Vitest `j2_w14_owner_notice_shows_reason_and_history_without_reports`, `j2_w14_owner_submit_changes_flow`, `w14_moderate_form_requires_reason_and_message`, `w14_decide_changes_form_actions_by_status` pass; smoke `super_admin_pauses_with_hold_owner_sees_reason_only`, `owner_edits_then_submits_super_admin_cannot_edit_or_publish`, `keep_pause_then_lift_owner_resumes`, `close_closes_applications_and_snapshots_unchanged` ok |
| AC5 | PASS | every pre-W14 `j2_*`, `j3_*`, `j17_w4_*`, `j17_w5_*` file `ok` (all 91 files `ok`); `w14_pause_holds_owner_republish_23514` and `w14_confirm_restores_publish_and_worker_visibility` in `ok` files; Vitest `j2_w14_resume_refusal_message_mapped` passes |
| AC6 | PASS | all 11 names in `j3_w14_unreviewed_approved_shops` (`ok`, plan 33); Vitest `j3_w14_unreviewed_shops_panel_and_rereview_drawer` passes; smoke `rereview_confirm_request_changes_reject` ok; `PLATFORM_MODERATION_AND_AUDIT.md:223` `## Runbook: approved shops without a recorded review` (5 steps, S3 worker effects in step 2) |
| AC7 | PASS | Vitest `w14_standard_contract_editor_builds_publish_payload`, `w14_standard_contract_publish_modal_says_still_draft_for_legal_review`, `w14_standard_contract_stale_version_message` pass; `j18_w14_platform_publish_leaves_owner_versions_and_contract_hashes_unchanged` in `j18_w14_flows` (`ok`); smoke `standard_template_published_by_super_admin_only_and_stays_draft`, `owner_versions_and_contract_hashes_unchanged_after_publish` ok; `git diff a880331 -- frontend/src/presentation/components/owner/contractTemplates` empty |
| AC8 | PASS | all 11 names in `j17_w14_audit_reads` (`ok`, plan 31); Vitest `j17_w14_activity_drawer_renders_labels_not_ids`, `w14_admin_audit_log_filters_and_paging`, `w14_admin_access_flags_list` pass; smoke `activity_redacted_per_role_no_ids`, `admin_audit_log_is_audited_and_admin_only` ok |
| AC9 | PASS (against recorded deviation D1) | all 8 names in `j17_w14_relationship_lookups` (`ok`, plan 24). `w14_worker_lookup_returns_rows_count_and_minimum` asserts `minimum_distinct_owners` is ABSENT (`j17_w14_relationship_lookups.test.sql:29-31`, expected `true,Local Test Worker,2,2,false`): DB deviation D1 (LOG.md BUILD (DB)) keeps the pre-existing `j16_only_w10_reads_and_setter_reference_workforce_policies` green; the console reads the minimum from the W10 policy instead (`RelationshipLookupPanel.tsx:44-51`, F6). Purpose + note, record and audit are asserted; Vitest `w14_relationship_lookup_requires_purpose_and_note` passes; smoke `relationship_lookups_need_purpose_note_are_audited_and_return_no_minimum`, `lookup_visible_in_subject_activity` ok |
| AC10 | PASS | all 10 names in `j17_w14_moderation_authorization` (`ok`, plan 30); w14 smoke 33 passed / 0 failed (incl. 4 `direct_writes_and_raw_selects_denied_*`, `internal_functions_and_set_config_not_callable`, `anon_cannot_call_w14_rpcs`); w2..w11 smokes 0 failed |
| AC11 | PASS | all 5 names in `j17_w14_moderation_audit_and_notifications` (`ok`, plan 13); smoke `moderation_notifications_have_no_free_text` ok |
| AC12 | PASS | all 5 names in `j18_w14_flows` (`ok`, plan 15), incl. `j18_w14_booking_quote_rating_and_verification_unchanged`; all 82 pre-W14 pgTAP files `ok`; `git diff --stat a880331 -- supabase/tests/database` = only `001_migration_replay.test.sql` (13+, 6-), the other 9 W14 files are new; pytest 4 passed; stager 19 pass |
| AC13 | PASS | all 21 section-6 Vitest names plus the existing 233 pass (263 in total); lint and build exit 0; `grep -rn "service_role" frontend/src` = 0 lines; `w14_super_admin_console_nine_tabs_default_overview` passes |
| AC14 | PASS | of 127 added or changed files, the longest are 350 lines (`PLATFORM_MODERATION_AND_AUDIT.md`, `AUDIT_AND_NOTIFICATIONS.md`), then 349 (`stage-local-workdir.test.mjs`, W14 `PLAN.md`), 348 (`stage-local-workdir.mjs`), 347 (W14 `LOG.md`), 344 (`DASHBOARDS_AND_OVERSIGHT.md`), 331 (`w14-api-smoke.mjs`), 321 (`OwnerJobOpeningsPanel.tsx`); none over 350; `git diff --stat a880331 -- backend` empty, no untracked backend file; `docs/workforce/PLATFORM_MODERATION_AND_AUDIT.md` exists, and JOB_OPENINGS, MARKETPLACE_AND_APPLICATIONS, CONTRACT_TEMPLATES, OWNER_RELATIONSHIPS, AUDIT_AND_NOTIFICATIONS, DASHBOARDS_AND_OVERSIGHT, ROLE_AND_PROFILE_SECURITY, LOCAL_TEST_HARNESS, LEGAL_REVIEW_REGISTER (and CERTIFICATIONS) are modified; `grep -c "W14-L" docs/workforce/LEGAL_REVIEW_REGISTER.md` = 17 (W14-L1..W14-L12 present); `grep -rni "take_over\|takeover" supabase/migrations/2026_10_29_w14*` = 0, and no take-over code under frontend/src, the W14 pgTAP files or the w14 smoke; no `.env` read (see Safety) |

## Safety
- No committed migration was edited: only untracked (new) files under `supabase/migrations`; the diff against a880331 is empty.
- No `.env*` change: `.env` and `frontend/.env` are git-ignored, their mtimes (2026-10-23, 2026-10-21) are older than HEAD
  (2026-10-29 13:31), and no `.env` path appears in the diff or untracked list. The verifier did not read either file.
- No remote DB commands. `--linked`, `--db-url`, `db push` and `project-ref` do not appear in the W14 migrations, the moderation
  helper, the W14 pgTAP files, the w14 smoke (its header states loopback-only, no `.env`) or the added lines of the stager diff.
  The verifier ran the supabase CLI only inside `.local-supabase-test`.
- Unchanged on purpose: `git diff a880331` is empty for TerminateContractModal.tsx, DeclineContractModal.tsx, AcceptContractModal.tsx,
  WorkerContractReview.tsx, RequestCertificationReviewModal.tsx (all 5 tracked), ApplicationSnapshotView.tsx,
  JobOpeningTransitionConfirmModal.tsx, `owner/contractTemplates/`, `worker/contracts/`, `owner/workerContracts/`, `contracts/`, and `backend/`.
- Changed infrastructure: the stager adds `test_helpers_moderation.sql` as the 7th helper; its test still has 19 tests.
- Booking regression: `j18_w14_booking_quote_rating_and_verification_unchanged` (`ok`), `j18_existing_flows` and every earlier J18
  file `ok`; the w2..w11 smokes are green.

## Review findings
- **B1 (BLOCKING) closed.** Code: w14h `my_workforce_activity` (`2026_10_29_w14h_workforce_audit_reads.sql:70-74`) shows `job_opening_report.*`
  only where `subject_profile_id = me`, and `job_opening_moderation.opened/.dismissed/.case_viewed/.deleted` only when the actor is the caller and
  the subject is not. Tests: `j17_w14_fix1_report_privacy` (`ok`, plan 26): `w14_fix1_owner_close_after_pause_hides_reports` asserts that the B1 path
  exists (raw `job_opening_report.closed` with actor = owner) AND that the owner sees `0,0` report / case rows; also `w14_fix1_owner_archive_hides_reports`,
  `w14_fix1_changes_submitted_close_hides_reports`, `w14_fix1_report_case_events_never_shown_to_owner_actor`, `w14_fix1_reporter_still_sees_own_report_events`.
  Smoke `b1_owner_close_never_shows_reports_to_owner` ok.
- **Independent verifier B1 check** (local DB through `docker exec psql`, one transaction, rolled back): pause, then a second report while
  paused, then the owner runs `transition_job_opening(paused -> closed)`. Raw `job_opening_report.closed` rows with actor = owner: 1.
  Owner `my_workforce_activity`: 7 rows, 0 of them `job_opening_report.*` / opened / dismissed / case_viewed / deleted, none with `report_count`;
  the `resolved_owner_closed` row carries only from_status, to_status, changed_by and reason_kind. The second reporter still sees
  `job_opening_report.submitted` and `job_opening_report.closed` (outcome opening_closed). The frontend safeguard in `WorkforceActivityService`
  drops report rows for owners (fix-cycle Vitest B1 x3 pass). Docs corrected: `PLATFORM_MODERATION_AND_AUDIT.md:170`, `JOB_OPENINGS.md:61`.
- Fix cycle 1 spot checks: N2 w14d:80 `pg_advisory_xact_lock(hashtextextended(...))` keyed on the reporting worker
  (`w14_fix1_report_limits_under_worker_advisory_lock`); N4 w14h:129-140 filter names plus values or `unrecognised`
  (`w14_fix1_log_searched_records_filter_values`); N5 w14d:29 `job_opening_moderation_changed_since_pause`, used at w14d:250 and w14e:39, revoked w14d:44
  (`w14_fix1_noop_edit_does_not_count`, `w14_fix1_compares_with_last_pause_kept_snapshot`); N6 `-- begin;` / `-- commit;` around the ROLLBACK blocks
  (w14c:185/198, w14f:208/217); N7 w14h:58-59 subject sees `washlink_review`, `workforceActivityCopy.ts:114`; N8 w14g header lines 8-10 (rows read
  first, record and audit in the SAME transaction); N9 `moderationSchemas.ts:81` `{1,40}`; S1 `jobOpeningModerationCopy.ts:21` "Unpaid work presented
  as a trial or training"; S3 runbook step 2 (effects on workers); S4 `PLATFORM_MODERATION_AND_AUDIT.md:44 / 191`, `OWNER_RELATIONSHIPS.md:271`
  (same transaction); S5 `adminOversightCopy.ts:51-52`. `moderationFixCycle.w14.test.tsx` (8 tests) passes.

## Non-blocking observations (carried forward, not grounds for FAIL)
- RECORD items still open in the tree: D-50..D-58 are not yet in `loop/workforce/DECISIONS.md` (count 0); W14-L13..L17 are in `LEGAL_FLAGS.md`
  but not yet in `docs/workforce/LEGAL_REVIEW_REGISTER.md` (count 0); LOOP.md has no W14 smoke row yet (S6).
- Deviation D1 (no minimum in the worker lookup) keeps the plan's test name with an inverted assertion; the name now misdescribes the check.
- The owner can still infer that a report led to a case from `job_opening_moderation.paused` (from_status open) and the notice itself; no count,
  report category, statement or reporter is revealed (consistent with D-53 / P73).
- N1 (raw W3 super_admin audit select) and N3 (queue limit 200 without a cursor) go to W13; S2 is a legal flag (W14-L17).
- The stop command was run as `npx supabase stop --workdir . --no-backup` from inside `.local-supabase-test` (same target as
  `--workdir .local-supabase-test`, without invoking the CLI from the repo root).
