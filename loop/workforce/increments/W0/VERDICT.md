# W0 - Verifier verdict

**Overall: PASS** (one condition applies to the RECORD/commit step, see AC8)

Verified 2026-10-24 by an independent workforce-verifier on `feature/workforce` @ ec6570a (nothing committed yet).
All evidence below was collected by the verifier. No Supabase project (local or remote) was contacted and no `.env` file was read.

## Check suite (re-run by verifier)

Only lint, build and pytest exist before W1. `npm test`, `supabase test db` and `supabase db reset` were not run and are not claimed.

| Check | Command | Exit | Result | BASELINE.md |
|---|---|---|---|---|
| Frontend lint | `cd frontend && npm run lint` | 0 | eslint printed no errors or warnings | matches (0) |
| Frontend build | `cd frontend && npm run build` | 0 | `2453 modules transformed`, `built in 478ms` | matches (2453 modules, exit 0) |
| Backend tests | `cd backend && .venv/Scripts/python.exe -m pytest -q` | 0 | `4 passed, 1 warning in 0.64s` | matches (4 passed, 1 warning) |

`git status --porcelain` after the runs is unchanged: `.claude/`, `docs/workforce/`, `loop/`, `supabase/.temp/`.
`git check-ignore -v`: `frontend/dist` ignored by `.gitignore:11`, `frontend/node_modules` by `.gitignore:10`.

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC1 audit file exists | PASS | `test -f docs/workforce/ARCHITECTURE_AUDIT.md` exit 0 (318 lines, under the ~350 limit, so no split needed) |
| AC2 eight headings | PASS | grep -c is 1 for each heading: Reconstructed schema (l.40), RLS inventory (l.128), Privilege escalation (l.159), Workers table (l.197), Auth and email verification (l.219), Notifications (l.229), Proposed ERD (l.246), Findings routed to increments (l.300) |
| AC3 E1/E2/E3/F5, each with target and test | PASS | audit l.11-14 and l.305-310: E1 W2 `j17_signup_cannot_self_assign_super_admin`; E2 W2 `j17_profile_owner_cannot_change_role`; E3 W2 `j17_owner_cannot_insert_preapproved_shop`; F5 W1 test / W2 fix `j18_owner_can_resubmit_after_changes_requested` |
| AC4 erDiagram | PASS | `grep -c erDiagram docs/workforce/*.md` = 1 (audit l.251) |
| AC5 inferred labels | PASS | `grep -c inferred` = 25; every row of the profiles (l.52-57), bookings (l.71-87) and workers (l.93-99) tables has a Source of `inferred` or `from migration` |
| AC6 BASELINE.md | PASS | file exists; has LINT_EXIT=0, BUILD_EXIT=0, PYTEST_EXIT=0 and the verbatim line `4 passed, 1 warning in 4.01s`; consistent with the verifier re-run |
| AC7 DECISIONS rows | PASS | `grep -cE "^[|] D-(8|9|10) "` = 3; D-1 (l.9) and D-2 (l.10) end with `ADOPTED-DEFAULT (loop, 2026-10-24)` |
| AC8 scope | PASS (conditional) | `git diff --name-only main...HEAD` is empty; tracked diff is empty. Untracked: `docs/workforce/`, `loop/workforce/` (in scope) plus `.claude/` (agent copies made by `install-agents.ps1` at 02:32, before W0 started) and `supabase/.temp/cli-latest` (8-byte Supabase CLI version cache `v2.122.0`, written at 02:39 by the `npx supabase --version` toolchain check that the plan requires; already named in PLAN F1). Neither is a source, migration or config change. **Condition:** the [W0] commit must stage only `docs/workforce/` and `loop/workforce/`, and must not include `supabase/.temp/`. `.claude/` should be committed separately as loop setup, or not at all. |
| AC9 no secrets | PASS | the secret-pattern grep over `docs/workforce` and `increments/W0` matches only `PLAN.md:185`, which is the AC9 command text itself. It matches no key or JWT. |

## Audit claim spot-checks (verifier read the cited lines)

1. E3: `2026_04_17_add_shops_and_booking_location.sql:34-38`. `shops_insert_own` is `with check (owner_id = auth.uid())` only. `2026_04_18...sql:146-150` shows the trigger is `before update` only. CONFIRMED.
2. F5: `SupabaseShopVerificationRepository.ts:224-238` sets `verification_status: 'pending'` with `.in('verification_status', ['pending','changes_requested'])`. `2026_04_18...sql:132-141` raises `Only super admins can change verification status or notes.` on any non-admin status change. CONFIRMED.
3. E1: `SupabaseAuthRepository.ts:22-33` passes `role` in `options.data`. `AuthLandingForms.tsx:306-319` offers only customer/owner. CONFIRMED.
4. F6: `SupabaseWorkerRepository.ts:49-54` looks up by `user_id` with `.single()`. CONFIRMED.
5. F3: `SupabaseBookingRepository.ts:26-38` selects all bookings with no filter. CONFIRMED.
6. F7: `useAuthLanding.ts:78` toast text matches, and `email_confirmed_at` has 0 matches in `frontend/src`. CONFIRMED.
7. F1: `supabase/` contains only `migrations/` and `.temp/`, with no `config.toml`. CONFIRMED.

## Guardrails

- Committed migrations: not edited (tracked diff empty; `git diff --name-only main...HEAD` empty).
- `.env*`: no changes (no tracked or untracked `.env` paths in status).
- Remote DB commands: none in the W0 artifacts or `install-agents.ps1` (grep for `db push`, `supabase link`, `psql ` returned nothing). DECISIONS D-10 asks a human to run a schema dump; the loop does not run it.
- Booking regression: the only existing automated regression suite is backend pytest, which reports 4 passed. No booking J-tests exist before W1.
- Reviewer findings: REVIEW.md reports no BLOCKING security or compliance findings. Non-blocking items are routed to W2-W10.

## Non-blocking notes for RECORD

- Audit l.317 still says "Legal: none for W0". REVIEW C9 records that LEGAL_FLAGS.md (W0-L1 to L7) supersedes it, but the audit line was not updated.
- REVIEW S3 (more RLS-dependent calls, e.g. `deleteWorker`, `updateWorkerAvailability`, `fetchWorkerByIdentifier`) is not yet reflected in the audit's "Unknown (not in repo)" list.
