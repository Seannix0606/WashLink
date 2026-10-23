# W0 - Architecture audit & baseline - Increment Plan

Spec: SPEC.md 7A sections A and G. Depends on: none. Branch: `feature/workforce` (from `main` @ ec6570a).
Nature: **read-only investigation + documentation**. No application code, no migrations, no DB.

## 1. Dependency / decision check
- No dependency increments. No DECISIONS.md item blocks W0 (D-1 blocks W1, not W0).
- W0 adopts the D-1 and D-2 defaults (continuous mode) and adds D-8, D-9, D-10 (section 5).

## 2. Scope / out of scope
In scope:
- `docs/workforce/ARCHITECTURE_AUDIT.md` (new; split into `ARCHITECTURE_AUDIT.md` +
  `WORKFORCE_ERD.md` if the audit would exceed ~350 lines).
- `loop/workforce/increments/W0/BASELINE.md` with verbatim output of the baseline checks.
- Edits to `loop/workforce/DECISIONS.md` (status changes and new rows only; never delete rows).

Out of scope:
- Any file under `supabase/`, `frontend/src/`, `backend/` (no fixes, even for bugs found below;
  they are recorded as findings and routed to W1/W2).
- `npx supabase init/start/db dump/link`: nothing touches any Supabase project in W0
  (local stack is W1). Never read or print `.env`, `frontend/.env`, `backend/.env*`.

## 3. Concrete findings the audit doc must record (investigated by architect; cite file:line)

### F1. Core tables have no CREATE in `supabase/migrations/` (D-1)
Only ALTERs: `bookings` is altered in 2026_04_17 (shop_id, latitude, longitude), 2026_10_21
(quoted_price + BEFORE INSERT trigger `bookings_set_quote_from_shop_pricing`), 2026_10_22
(customer_notes, customer_rating_*). `profiles` is referenced by FKs in shops/svd and by
`is_super_admin()`. `workers` is never referenced by any migration. There is **no**
`supabase/config.toml` (only untracked `supabase/.temp/cli-latest`), so W1 must run `supabase init`.
README says migrations were applied to the linked project by hand via SQL Editor, in filename order.

### F2. Reconstructed schema (derived; label every item "inferred" vs "from migration")
Sources: frontend select lists and inserts, backend SQLAlchemy models (`backend/app/models/*.py`)
and Alembic `0001_create_initial_schema.py` (scaffold; drifts from Supabase, e.g. backend
`bookings.scheduled_at` vs frontend `bookings.time`). Frontend usage wins where they disagree.
- `profiles`: id uuid PK (= auth.users.id, inferred), role text or enum
  (`customer|owner|worker|super_admin`; 2026_04_18 rewrites a role CHECK only IF one exists,
  so if none existed the column may be unconstrained), full_name, phone_number,
  created_at, updated_at (backend model). Read: `SupabaseAuthRepository.ts:150-153`;
  update of full_name/phone_number by id: `SupabaseProfileRepository.ts:39-45`.
- Profile creation: frontend `auth.signUp` passes `options.data = {role, full_name, phone_number}`
  (`SupabaseAuthRepository.ts:22-33`) and never inserts into `profiles`, so an `auth.users`
  trigger (name unknown, conventionally `handle_new_user`) must copy the **client-controlled**
  `raw_user_meta_data.role` into profiles. Not in repo.
- `bookings`: id, customer_name, customer_id, vehicle_type, service_type, address, time,
  booking_status (`pending|accepted|in_progress|completed|rejected|cancelled` per
  `supabaseBookingRow.ts:3-10`; DB constraint unknown), created_at, assigned_worker_id
  (-> workers.id, inferred), shop_id, latitude, longitude, customer_notes, quoted_price,
  customer_rating_stars (CHECK 1..5), customer_rating_comment, customer_rated_at.
- `workers`: id, owner_id (-> profiles.id), user_id (nullable, no FK in scaffold), name,
  phone_number, is_available bool default true, created_at, updated_at.
- Document the migrated objects precisely: `shops` (+verification columns, CHECK on
  verification_status), `shop_verification_documents`, `shop_pricing`, storage bucket
  `shop-verification-documents`, functions `is_super_admin()`,
  `prevent_owner_verification_mutation()`, `set_booking_quote_from_shop_pricing()`,
  `can_manage_shop_verification_storage(text)`, `set_shop_pricing_updated_at()`.

### F3. RLS inventory
- Known (in repo): shops, shop_verification_documents, shop_pricing, storage.objects. Table of
  policy name + command + predicate for each.
- Unknown (not in repo): RLS on profiles, bookings, workers. The code relies on RLS for scoping:
  `SupabaseBookingRepository.fetchBookings()` (around line 26) selects ALL bookings with no filter;
  realtime channel `bookings-realtime-channel` subscribes to every INSERT/UPDATE on bookings;
  booking status, rating and cancel updates rely on client-side `.eq()` filters only.

### F4. Privilege-escalation analysis (spec A: no owner/admin via client-side data)
- E1 (HIGH, unverified): signup role comes from client metadata. Calling
  `supabase.auth.signUp({ options: { data: { role: 'super_admin' } } })` yields super_admin
  UNLESS the unknown signup trigger whitelists roles. The UI only offers customer/owner
  (`AuthLandingForms.tsx:306-319`), which is not a control.
- E2 (HIGH, unverified): if profiles has a self-update policy without column restriction,
  `update profiles set role = 'super_admin' where id = auth.uid()` succeeds, and
  `is_super_admin()` then grants admin access to shops, verification docs and storage.
  No trigger in repo prevents it.
- E3 (MEDIUM, verified from repo): `shops_insert_own` only checks `owner_id = auth.uid()` and
  the verification trigger is BEFORE UPDATE only, so any authenticated user (no role check)
  can INSERT a shop with `verification_status = 'approved'`, bypassing admin review and
  becoming bookable.
- E4 (LOW, verified from repo): owners may still change `verification_submitted_at` and
  `is_active` on their shops (probably intended; record).
- E5 (unknown): bookings UPDATE scope; a customer may be able to change quoted_price or
  booking_status on own rows (quote trigger is INSERT-only), depending on unknown RLS.
- Route each to W2 with the test names W1/W2 must create:
  `j17_signup_cannot_self_assign_super_admin`, `j17_profile_owner_cannot_change_role`,
  `j17_owner_cannot_insert_preapproved_shop`, `j17_customer_cannot_change_quoted_price`.

### F5. Existing bug spotted (regression note; do NOT fix in W0)
`SupabaseShopVerificationRepository.ts:229-236` (owner resubmission) sets
`verification_status: 'pending'` from `changes_requested`, but
`prevent_owner_verification_mutation()` raises on any non-admin change of verification_status,
so resubmission after "changes requested" should fail. W1 J18 regression test
`j18_owner_can_resubmit_after_changes_requested` should expose it; fix in W2 via a
security-definer `submit_shop_for_verification(shop_id)`.

### F6. `workers` relationship and keep/extend/migrate proposal (D-2)
- Today: owner-managed roster row per (owner, person). Owners create rows without user_id
  (`SupabaseWorkerRepository.createWorkerForOwner`); worker-role users find their row via
  `user_id` (`fetchWorkerByUserIdentifier` uses `.single()`, which breaks once a user is on two
  rosters, the expected case under spec F). Nothing in code ever sets `user_id`, and there is
  no worker self-signup (role picker = customer/owner). `bookings.assigned_worker_id` points
  at the roster row, not the user.
- Proposal (adopt D-2 default, keep and link): keep `workers` unchanged as the shop roster /
  booking-assignment entity; new `worker_profiles` (PK = profiles.id) is the worker identity;
  `workers.user_id` is the link (W2 adds FK -> profiles.id and partial unique
  (owner_id, user_id) where user_id is not null, and changes lookup from `.single()` to a list
  or a per-owner lookup). Contracts and relationships reference worker_profiles, never roster
  rows. Roster rows may later be created from an active contract (W9/W10). No data migration.

### F7. Auth email verification and notifications
- Email verification: after signup the UI toasts "Account created. You can sign in now."
  (`useAuthLanding.ts`) and the app never reads `email_confirmed_at`, which implies confirmation
  is disabled on the linked project or the message is misleading. Not verifiable without
  project config; do NOT check the remote. W1 local `config.toml` sets the testable default.
  Password reset uses `resetPasswordForEmail` with redirectTo (needs auth email/SMTP configured).
- Notifications: only in-app `sonner` toasts (`presentation/design/ui/Toast.tsx`,
  `presentation/utilities/customerBookingStatusTransitions.ts`) driven by Supabase Realtime
  postgres_changes. No notifications table, no email sending from app code.
  `frontend/smtp-test.cjs` and `frontend/smtp-test.js` are standalone nodemailer scripts reading
  `SMTP_*` from process.env; `nodemailer` is a frontend runtime dependency (note only).
  Conclusion: W3 creates the `notifications` table; there is no existing system to reuse.

### F8. Backend scaffold
FastAPI + SQLAlchemy/Alembic with SQLite fallback and its own profiles/shops/workers/bookings
models that drift from Supabase. Confirms LOOP rule 2: no workforce tables in SQLAlchemy/Alembic.

## 4. Proposed ERD (Mermaid `erDiagram` in the audit; conceptual, final columns per increment)
- auth.users 1-1 profiles 1-0..1 worker_profiles (W2); profiles(owner) 1-* shops.
- shops 1-* job_openings (W4) 1-* job_applications (W5) *-1 worker_profiles.
- shops 1-* training_programs (W6) 1-* training_sessions 1-* training_attendance;
  training_programs 1-* training_enrollments *-1 worker_profiles; enrollments 1-* training_assessments.
- certifications (W7) *-1 worker_profiles, *-1 shops, *-1 training_enrollments (evidence).
- contract_templates 1-* contract_template_versions (W8; platform- or shop-owned).
- worker_contracts (W9) *-1 worker_profiles, *-1 shops, *-1 template version;
  1-* contract_versions 1-* contract_acceptances.
- worker_owner_relationships unique(worker, owner) (W10); workforce_policies (W10).
- notifications *-1 profiles(recipient) (W3); workforce_audit_events append-only (W3).
- workers.user_id -> profiles.id (existing roster link, W2).
Annotate each table with its creating increment and RLS principle (worker-own / shop-owner /
super_admin / write only via security-definer function).

## 5. DECISIONS.md updates
- D-1 -> `ADOPTED-DEFAULT (loop, 2026-10-24)`; note the W1 baseline that recreates core tables is
  local-test only and must live outside `supabase/migrations/` (e.g. a test fixture or seed loaded
  by the harness) so it can never be pushed to a real project.
- D-2 -> `ADOPTED-DEFAULT (loop, 2026-10-24)` with the F6 detail.
- Add D-8 "Signup role trust": default = W2 makes signup profile creation whitelist metadata role
  to `customer|owner|worker`, `super_admin` only via SQL by a human, role immutable for
  authenticated users. Mark ADOPTED-DEFAULT.
- Add D-9 "Worker self-registration": default = add `worker` to the signup role picker in W2.
  Mark ADOPTED-DEFAULT.
- Add D-10 "Linked-project RLS/trigger for profiles, bookings, workers is unknown": loop fixes are
  verified only against the local baseline; a human must run `supabase db dump --schema-only`
  themselves and diff before any deploy. Standing gate, not blocking.

## 6. Baseline checks (from a clean tree; verbatim output tails + exit codes in BASELINE.md)
| Check | Command | Record |
|---|---|---|
| Toolchain | `node -v`, `npm -v`, `python --version`, `docker --version`, `npx supabase --version` | versions |
| Frontend deps | `npm ci` in frontend, only if node_modules is missing | exit code |
| Frontend lint | `npm run lint` in frontend | exit code, warning/error counts |
| Frontend build | `npm run build` in frontend | exit code, last ~15 lines |
| Backend tests | `python -m pytest -q` in backend (existing venv if present; else record how deps were installed) | exit code, the "N passed" line |

Rules: record what actually happened, including failures. Do not claim `npm test`,
`supabase test db` or `db reset` (they do not exist until W1). Run `git status` before and after
and confirm `frontend/dist` and caches are gitignored, not staged.

## 7. Acceptance criteria (each checkable by command)
- AC1 `test -f docs/workforce/ARCHITECTURE_AUDIT.md`
- AC2 each heading present (grep -c >= 1): `## Reconstructed schema`, `## RLS inventory`,
  `## Privilege escalation`, `## Workers table`, `## Auth and email verification`,
  `## Notifications`, `## Proposed ERD`, `## Findings routed to increments`.
- AC3 `grep -E "E1|E2|E3|F5" docs/workforce/*.md` finds E1, E2, E3 and the shop-resubmission
  finding; each names a target increment and a test name from F4/F5.
- AC4 `grep -c "erDiagram" docs/workforce/*.md` >= 1.
- AC5 `grep -c "inferred" docs/workforce/ARCHITECTURE_AUDIT.md` >= 1 and every column of
  profiles/bookings/workers is labelled inferred or from-migration.
- AC6 `test -f loop/workforce/increments/W0/BASELINE.md`, containing exit codes for lint, build and
  pytest plus the pytest summary line verbatim.
- AC7 `grep -cE "^[|] D-(8|9|10) " loop/workforce/DECISIONS.md` returns 3; the D-1 and D-2 rows
  contain `ADOPTED-DEFAULT`.
- AC8 `git status --porcelain` and `git diff --name-only main...HEAD` list only paths under
  `docs/workforce/` and `loop/workforce/` (no `supabase/`, `frontend/`, `backend/` changes).
- AC9 `grep -rniE "service_role|eyJ[a-zA-Z0-9]{20}|SMTP_PASS=" docs/workforce loop/workforce/increments/W0`
  returns nothing.

J-tests: none (documentation increment). The audit lists the J17/J18 tests W1/W2 must create.

## 8. Rollback
Docs only: `git revert` the [W0] commit. No database state.

## 9. Risks / legal-review flags
- R1: reconstructed schema may differ from the linked project (constraints, RLS, signup trigger).
  Mitigation: everything labelled inferred; D-10 gate before any deploy.
- R2: E1/E2 may be live in production today. Put them in the audit top summary for the human; the
  loop must NOT probe production to confirm.
- R3: pytest may fail if the backend venv/deps are absent; record the actual result and do not
  edit backend code in W0.
- Legal: none for W0. Audit notes that spec D/E/F items will populate
  `docs/workforce/LEGAL_REVIEW_REGISTER.md` (W13; items appended from W6 on).
