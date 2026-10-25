# W4 - Job openings (owner) - LOG

## BUILD (database) - API for the frontend

Local Docker stack only. Migrations `2026_10_24_w4a..w4d` (staged `20261024000012..15`).
Full design: `docs/workforce/JOB_OPENINGS.md`.

### Table `public.job_openings` (PostgREST, role `authenticated`; anon has no privilege)

| Column | Type | Client-writable | Rule |
|---|---|---|---|
| id | uuid | no | PK, server default |
| shop_id | uuid | insert only | own shop; immutable |
| owner_id | uuid | never send | forced to the shop owner |
| status | text | never send | `draft` / `published` / `paused` / `closed` / `archived`; RPC only |
| title | text | yes | required, 3..120 (trimmed) |
| description | text | yes | <= 4000 |
| duties | text[] | yes | <= 20 items, each <= 200; trimmed, blanks dropped, case-insensitive de-dup |
| work_location | text | yes | <= 200 |
| openings_count | smallint | yes | 1..100 |
| job_type | text | yes | `full_time` / `part_time` / `temporary` / `other` |
| required_skills | text[] | yes | <= 30 items, each <= 60 |
| minimum_years_experience | smallint | yes | 0..60 |
| experience_requirement | text | yes | <= 500 |
| availability_requirement | text | yes | <= 300 |
| schedule_details | text | yes | <= 1000 |
| compensation_min_amount / compensation_max_amount | numeric(10,2) | yes | each > 0 and < 10000000; max >= min |
| compensation_currency | text | yes | `PHP` only |
| compensation_period | text | yes | `hour` / `day` / `week` / `month` / `per_task` |
| compensation_details | text | yes | <= 500 |
| benefits | text | yes | <= 1000 |
| other_terms | text | yes | <= 2000 |
| minimum_qualifications / preferred_qualifications | text[] | yes | <= 20 items, each <= 200 |
| required_training | text | yes | <= 1000 |
| applicant_requirement | text | yes | `certification_required` / `trainees_welcome` |
| certification_expectations | text | yes | <= 500 |
| application_deadline | date | yes | Asia/Manila calendar date |
| application_instructions | text | yes | <= 1000 |
| first_published_at, status_changed_at | timestamptz | never send | server stamps (null until first transition) |
| created_at, updated_at | timestamptz | never send | server stamps |

Text fields: trimmed, empty string stored as null. No pay / terms column has a default.
Compensation is all-or-nothing: at least one amount + currency + period, or none of them.
Arrays default to `{}`. Send `[]` (not null) to clear a list.

### RPCs

| Function | Returns | Notes |
|---|---|---|
| `transition_job_opening(p_job_opening_id uuid, p_from_status text, p_to_status text)` | `job_openings` row | Allowed pairs: draft>published, published>paused, paused>published, published>closed, paused>closed, closed>archived. Use `.single()`. |
| `is_verified_shop_owner(p_shop_id uuid)` | boolean | Caller is an owner, owns the shop, and the shop is approved with a recorded review and active. Use it to enable or disable Publish / Resume. |
| `job_opening_missing_publish_fields(job_openings)` | text[] | Missing names, in this order: `title, description, work_location, openings_count, job_type, applicant_requirement`. Granted to authenticated; use as a PostgREST computed column is NOT verified in the smoke (mirror the list client-side). |

### Error messages (13; map them in `supabaseErrorMessages.ts`)

| SQLSTATE | Message | When |
|---|---|---|
| 42501 | Only owner accounts can create job openings. | insert by a non-owner (super_admin included) |
| 42501 | You can create job openings only for your own shop. | insert for another owner's or unknown shop |
| 42501 | Job openings start as drafts. | insert with a status other than draft |
| 23514 | A shop can have at most 50 job openings that are not archived. | 51st non-archived opening |
| 42501 | Job opening not found. | RPC or guarded update by anyone but the owning owner (no existence leak) |
| 42501 | This job opening field cannot be changed. | id, shop_id, owner_id, created_at, first_published_at, status_changed_at sent |
| 42501 | This job opening status change is not allowed. | direct status update; pair outside the matrix |
| 42501 | Closed or archived job openings cannot be edited. | content edit on closed / archived |
| 23514 | Complete the required job opening fields before publishing. | publish / resume with missing fields; clearing a required field while published / paused |
| 23514 | The application deadline has passed. | publish / resume after the deadline; setting a past deadline while published / paused |
| 42501 | Only draft job openings can be deleted. | guard only (see the delete note below) |
| 42501 | Only a verified shop can publish job openings. | publish / resume while the shop is not verified (P15) |
| 55000 | This job opening changed. Refresh and try again. | `p_from_status` is not the current status |

Other 23514 errors are CHECK constraint violations (lengths, ranges, enums, compensation
completeness) and `Each duty|skill|qualification must be N characters or fewer.`. Validate
these client-side with the limits above.

Delete note: deleting a non-draft opening through PostgREST returns 0 rows and no error, because
RLS (`jo_delete_owner_draft`) filters it before the guard runs. Only offer delete for drafts, and
treat 0 deleted rows as "Only draft job openings can be deleted."
Updates by a non-owner also return 0 rows (RLS) rather than an error.

### Visibility rules

| Caller | Rows returned by `select` |
|---|---|
| owning owner | all own openings, every status (filter by `status`, `shop_id`) |
| worker | `published` openings of shops that currently pass the verified-shop rule |
| super_admin | all non-draft openings (no write access) |
| customer, other owner | none |
| anon | permission denied |

A published opening of a shop that loses verification stays `published` for the owner but is
hidden from workers until the shop is reviewed again. The owner UI should show this state.
Not in Realtime: refresh after each action. W4 sends no notifications.

### Verification (actual output, local stack)

- `node --test scripts/supabase-test/stage-local-workdir.test.mjs`: tests 18, pass 18, fail 0
- `node scripts/supabase-test/run-db-tests.mjs`: 22 migrations applied; `Files=20, Tests=749`; `Result: PASS`; 0 `todo_start(`
- `w2-api-smoke.mjs`: 48 passed, 0 failed; `w3-api-smoke.mjs`: 33 passed, 0 failed; `w4-api-smoke.mjs`: 35 passed, 0 failed
- New pgTAP plans: j2 own openings 63, j2 lifecycle 48, j3 42, j17_w4 35, j18_w4 14; 001 replay 16 -> 17
- Note: W4 migrations, test_helpers, 001/j1 edits and the j2/j3 files were committed by the user as `47b5d55`
  during the build (not by the DB engineer). The migrations were not changed after that commit.
  `j17_w4`, `j18_w4`, the W4 smoke, docs, the 3-line trim in test_helpers.sql (350-line limit) and this log are uncommitted.

## BUILD (frontend)

Owner "Job openings" tab (lazy-loaded chunk `OwnerJobOpeningsPanel-*.js`). UI -> hooks -> service -> repository -> Supabase.

### Added (`frontend/src/`)
- Domain: `domain/models/JobOpening.ts` (unions, `JobOpeningContent`, `SaveJobOpeningInput`, `jobOpeningLimits` = W4c CHECKs);
  `domain/utilities/jobOpeningLifecycle.ts` (matrix, `listMissingPublishFields` in the DB order, Manila deadline, `evaluateJobOpeningPublishReadiness`
  in the RPC's check order); `domain/repositories/JobOpeningRepository.ts`.
- Infrastructure: `infrastructure/supabase/supabaseJobOpeningRow.ts` (32 explicit columns, no `owner_id`; 25-column content payload);
  `infrastructure/repositories/SupabaseJobOpeningRepository.ts`.
- Application: `application/services/JobOpeningService.ts`; `application/validation/jobOpeningSchemas.ts`, `jobOpeningDraft.ts`;
  `application/validation/formFieldSchemas.ts` (shared `optionalText` / `textList` / `collectFieldErrors`, moved out of `workerProfileSchemas.ts`, which re-exports).
- Presentation: `utilities/jobOpeningDisplay.ts`, `utilities/jobOpeningActionDisplay.ts`; `hooks/useOwnerJobOpenings.ts`, `hooks/useJobOpeningEditor.ts`;
  `components/owner/jobOpenings/` (panel, list item, status badge, editor modal, 4 sections, preview, confirm modal, `jobOpeningSectionProps.ts`).
- Tests: `test/jobOpeningSupabaseDouble.ts`; fixtures `buildJobOpening`, `createMockJobOpeningRepository`.

### Changed
`supabaseErrorMessages.ts` (the 13 W4 messages), `createDashboardDependencies.ts`, `features/owner/OwnerDashboardPage.tsx`,
`OwnerDashboardContent.tsx` (tab `jobs`), `design/ui/Input.tsx` + `Select.tsx` (`aria-invalid`; `aria-describedby` points at the error/helper text).

### API use and 0-row handling
- Writes never send `id`, `owner_id`, `status` or stamps (j17 test). Status changes only via `rpc('transition_job_opening', {p_job_opening_id, p_from_status, p_to_status}).single()`
  with the status the owner saw; publish/resume enablement via `rpc('is_verified_shop_owner', {p_shop_id})`.
- Update: `.update(content).eq('id').eq('updated_at', <version the owner edited>).select(cols)`; 0 rows -> "This job opening changed or is no longer
  available. Refresh and try again." (covers RLS non-owner no-op and stale edits). Deviation from PLAN signature: `updateJobOpening(id, input, expectedUpdatedAt)`.
- Delete: `.delete().eq('id').eq('status','draft').select('id')`; 0 rows -> "Only draft job openings can be deleted."
- Stale requests: only the latest list load may set state; the list is re-read after every transition, delete and save (success or failure).
- Compensation display: only stored values, `en-PH` 2-decimal format, no range from one value; else "Not specified by the shop"; disclaimer
  "Details as entered by the shop. WashLink does not verify pay or employment terms." Currency and period are explicit choices (blank by default);
  "Use shop address" copies only on click. Published opening at an unverified shop: badge stays Published plus a "Hidden from workers" notice.
- Every transition, delete and save of a published opening asks for confirmation first; Publish/Resume are disabled with a visible, `aria-describedby` reason.

### Verification (actual output, `frontend/`)
- `npm run lint`: `eslint .` exit 0, no findings
- `npm run build`: `tsc -b && vite build` exit 0, `built in 1.03s`
- `npm test`: `Test Files 38 passed (38)`, `Tests 62 passed (62)` (46 existing + 15 planned + 1 extra `w4_job_opening_repository_treats_zero_affected_rows_as_failure`)
- `grep -rn service_role frontend/src`: empty; largest changed file 255 lines (`test/fixtures.ts`)

### For REVIEW
- VERIFY (not run against the local stack): the `eq('updated_at', ...)` round-trip with the PostgREST timestamptz text. If it misses, every edit fails
  with the "changed" message (fails closed, never saves silently). Worth adding to `w4-api-smoke.mjs`.
- (Superseded by the review fixes below.) The owner list read at most 200 openings including archived rows.

### Review fixes (W4 review, non-blocking)
1. Owner list query adds `.neq('status', 'archived')` (limit `jobOpeningLimits.ownListMaximum` = 200). When exactly 200 rows come back the panel shows
   "Showing the 200 most recently updated openings. Archived openings are not listed." Because archived rows are no longer loaded, the "Archived"
   filter tab is removed, and the archive confirmation now reads "It leaves this list and cannot be edited or restored." (archived rows stay in the DB).
2. Preview pluralisation: `formatMinimumYearsExperience` gives "At least 1 year of experience" / "At least N years of experience".
3. Requirements section has neutral guidance (linked to the fieldset with `aria-describedby`): "Describe the skills and experience the job needs. Don't include
   requirements about age, sex, civil status, religion or other personal characteristics unrelated to the work." Skills and qualification inputs
   say "Skills the work needs." / "Work-related qualifications only." This makes no compliance claim (W4-L4 stays open).
- New tests: `w4_owner_job_openings_list_shows_notice_when_limit_reached`, `w4_preview_pluralizes_minimum_years_experience`;
  `w4_supabase_job_opening_repository_selects_explicit_columns` now asserts the `neq` filter.
- Re-run (actual output): `npm run lint` exit 0, no findings; `npm run build` exit 0, `built in 651ms`;
  `npm test` `Test Files 38 passed (38)`, `Tests 64 passed (64)`.

## Orchestrator record (2026-10-25)
- Build interrupted by a usage limit; partial work committed by the user in 47b5d55 ("save whatever is done"). Build resumed and completed.
- REVIEW: security and compliance no BLOCKING; three frontend fixes before verify. REVIEW.md.
- VERIFY: PASS (VERDICT.md). Fix cycles: 0.
- Loop paused after W4 at the user's request.
