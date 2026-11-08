# W8 - Contract templates & template versions - VERDICT

**Overall: PASS** (independent verifier, 2026-10-26; uncommitted tree on `feature/workforce`, HEAD dd58616)

Graded against PLAN.md as amended by LOG.md (deviations, orchestrator helper fix, both review-polish sections),
REVIEW.md and TEST_RESULTS.md; D-6, D-26..D-30 ADOPTED-DEFAULT in DECISIONS.md. J9 is split: W8 delivers the
"save a reusable template version" half; the contract-draft half belongs to W9 (LOG.md / REVIEW.md carry-forward).

## Check suite (re-run by the verifier, starting with the local stack stopped: no supabase containers)

| Check | Exit | Actual output |
|---|---|---|
| `npm run lint` | 0 | `eslint .`, no problems |
| `npm run build` | 0 | built; chunk `OwnerContractTemplatesPanel-*.js` 38.05 kB |
| `npx vitest run` (= `npm test`) | 0 | `Test Files 89 passed (89)`, `Tests 174 passed (174)` |
| `backend/.venv/Scripts/python.exe -m pytest -q` | 0 | `4 passed, 1 warning` |
| `node --test scripts/supabase-test/stage-local-workdir.test.mjs` | 0 | tests 19, pass 19, fail 0 |
| `node scripts/supabase-test/run-db-tests.mjs` run 1 (from a stopped stack) | 0 | 52 distinct migrations applied (w8a..h = 20261026000009..16 in order); `Files=54, Tests=1947`, `Result: PASS`; 54/54 files `ok` |
| `node scripts/supabase-test/run-db-tests.mjs` run 2 | 0 | `Files=54, Tests=1947`, `Result: PASS` |
| w2 / w3 / w4 / w5 / w6 / w7 / w8 smokes | 0 each | 48 / 33 / 43 / 39 / 40 / 38 / 30 passed, 0 failed each |
| `supabase stop --workdir <staged> --no-backup` (cwd = `.local-supabase-test`) | 0 | "Stopped supabase local development setup."; 0 supabase containers after |

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC1 | PASS | 8 files `2026_10_26_w8[a-h]_<snake>.sql` (name-regex check: 0 violations); `grep -L -- "-- ROLLBACK"` empty; `git diff --name-status dd58616 -- supabase/migrations` empty (all 8 new, untracked); staged 20261026000009..16 in a..h order |
| AC2 | PASS | 52 migrations replayed twice, `Result: PASS`; `replay_schema_migrations_has_baseline_w2_to_w8` and `replay_w8_contract_template_tables_rls_enabled` in `001_migration_replay.test.sql`; files containing `todo_start(` = 0 |
| AC3 | PASS | all 15 planned `j9_*` names present in the J9 file (plan 36, file `ok`); Vitest j9_editor_shows_locked_clauses_read_only, j9_editor_edits_only_editable_bodies, j9_add_shop_term_only_in_allowed_sections, j9_save_payload_never_contains_locked_clauses, j9_save_creates_version_and_refreshes_history, j9_preview_shows_draft_banner_and_section_notices, j9_diff_view_highlights_edited_and_added pass |
| AC4 | PASS | spot-check 1 below; `j9_locked_safeguard_clause_cannot_be_edited_through_rpc`, `w8_commit_validator_rejects_altered_locked_clause_even_for_trusted_sql`, `w8_platform_version_must_keep_core_safeguards_locked`, `w8_clause_cannot_be_added_to_sealed_version` present, files `ok`; core list amended 11 -> 15 (review polish) |
| AC5 | PASS | spot-check 3 below; named tests present, files `ok` |
| AC6 | PASS | all 20 planned `w8_*` names in `j9_w8_contract_template_rules` (plan 65, `ok`); extra `j9_w8_contract_template_gaps` (20) and `j19_w8_review_polish` (37) `ok` |
| AC7 | PASS | all 4 names in `j9_w8_contract_template_audit` (plan 15, `ok`) |
| AC8 | PASS | all 13 names in `j17_w8_contract_template_authorization` (plan 41, `ok`); Vitest `j17_contract_template_repository_writes_only_through_rpcs` pass; w8 smoke 30/0; w2..w7 smokes 0 failed |
| AC9 | PASS | all 4 names in `j18_w8_flows` (plan 19, `ok`); every pre-W8 pgTAP file `ok`; `git diff --stat dd58616 -- supabase/tests/database` = only `001_migration_replay.test.sql` (+ 7 new files); pytest 4 passed; stager 19 pass |
| AC10 | PASS | all 16 planned Vitest names + `w8_owner_text_rules_match_server` pass; 174 = 157 existing + 17; lint/build exit 0; `grep -rn service_role frontend/src` = 0 lines; `w8_copy_never_claims_review_or_compliance` passes |
| AC11 | PASS | max length of any added/changed file 350 (w8f), next 349; `.env` and `frontend/.env` mtimes (10-23, 10-21) predate HEAD (10-26), not tracked; `git diff --stat dd58616 -- backend` empty; `CONTRACT_TEMPLATES.md` exists, 4 docs updated; `grep -c "W8-L"` = 17 (W8-L1..L13 present) |

## Safety
- w7 and earlier migrations unchanged vs dd58616. Changed non-migration infra: `test_helpers.sql` (only the
  letters-only shop-name suffix, orchestrator flake fix), the stager `HELPERS_SOURCE_NAMES` (+ third helper file),
  the stager test.
- Only expected `.sql` files are added or changed (8 migrations, 7 pgTAP files, 1 helper, plus `001_*` and `test_helpers.sql`);
  stager `repo_has_no_stray_sql_under_supabase` passes.
- No JWTs, `sb_secret_` / `sb_publishable_`, `*.supabase.co` project refs or key literals in the changed files.
  `db push` / `--linked` / `--db-url` / `project-ref` appear only in prohibitions and guard code. The w8 smoke takes keys
  from `supabase status -o env --workdir <staged>` into memory (the same pattern as w7), refuses a non-loopback API URL,
  and uses `docker exec psql` for uuid-validated trusted counts only.
- 0 literal invisible characters (U+200B..U+200F, U+2060, U+FEFF, U+00AD, bidi controls) in any added/changed file.
- REVIEW.md: security and compliance report no BLOCKING findings; the review-polish fixes are verified by `j19_w8_review_polish` (`ok`).

## Error and clause mapping (frontend vs DB)
- All 59 messages in the W7/W8 block of `supabaseErrorMessages.ts` occur verbatim in the migrations (no stale UI strings).
  The DB messages without a mapping are preflight/migration aborts and commit-validator integrity errors (hash
  mismatch, contiguous positions, version numbering, counts, "must stay in place", "based on a standard version").
  These are only reachable through forged trusted SQL, never through the owner RPCs, and they fall back to the
  generic message. The 4 formatted messages are covered by bounded regexes.
- The frontend placeholder allowlist equals the DB 10 keys, and the locked-only keys are the same 3. Allowed shop-term
  sections come from the DB `owner_terms_allowed`, not a hard-coded list. The fixture clause keys and kinds match w8e
  (`classification_reasons` locked, section 8 has 3 locked clauses and 1 editable).

## Spot-checks (code plus the test that proves it)
1. Owners cannot alter locked clauses. In w8f lines 183-184, a locked key in `p_editable_bodies` raises 23514. In w8d
   lines 173-186, for every base clause the validator requires exactly one matching clause, and for locked clauses the
   same body and clause_hash. A deferred constraint trigger (w8d lines 237-239) runs this for every session. The rules
   test helper `pg_temp.forge` inserts a version as trusted SQL under the flag with a correct content hash: an
   unaltered list returns `validated` (positive control), and an altered `template_is_draft` body raises 23514 when the
   constraint is set immediate. The J9 file also checks that the RPC refuses `classification_not_preselected` edits.
2. Versions are immutable and the hash is server-side. In the w8c guards (lines 174, 180, 222, 225, 233), any version or
   clause UPDATE or DELETE raises 42501, and a clause insert needs `created_txid = txid_current()`. w8c line 240 always
   overwrites `clause_hash`, and w8d line 115 recomputes `content_hash` at commit. The tests cover a flagged update and
   delete (42501), an owner update (42501), a clause added to sealed platform v1 (42501), a forged all-a content hash
   (23514), and recomputed hashes equal to the stored ones (`j9_each_version_has_server_computed_content_hash`).
3. The starter text. A live query on the local DB found 15 sections, all carrying the exact draft notice, with titles
   in spec E order. Platform v1 has 33 clauses (16 locked, 17 editable) and covers all 15 sections. 0 headings, bodies
   or titles contain a digit, and 0 contain currency. Claim words appear only in the negated `template_is_draft`
   sentence. `worker_classification_options` has no default column, and `independent_contractor` has sort_order 8
   (last) with needs_extra_acknowledgement true. Template tables have 0 classification columns. Tests:
   `w8_starter_text_has_no_digits_amounts_or_compliance_claims`, `j9_starter_has_all_fifteen_sections_in_spec_order`,
   `j9_every_section_marked_draft_requires_labor_law_review`.

## Non-blocking observations
- `CONTRACT_TEMPLATES.md` line 9 cites W8-L1..L9, but the register now holds W8-L1..L13 (stale range, doc only).
- The lock badge copy is "Platform safeguard — cannot be edited", not the plan wording (deviation recorded in LOG.md).
