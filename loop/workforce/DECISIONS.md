# Open Decisions & Human Gates

In continuous mode the loop does NOT stop on OPEN items: it adopts the proposed default and
marks it `ADOPTED-DEFAULT`. Edit a row any time to override; the loop picks up the change
on its next increment and adds rework if needed.

| ID | Question | Blocks | Proposed default | Status |
|---|---|---|---|---|
| D-1 | Core tables (`profiles`, `bookings`, `workers`) are not in `supabase/migrations/`. Can you provide a schema-only dump of the linked project (`supabase db dump --schema-only`, run by you) so the loop can build a local baseline? | W1 | Derive baseline from code + existing migrations, mark as "local test baseline only". W0 note: the W1 baseline that recreates `profiles`/`bookings`/`workers` is local-test only and must live OUTSIDE `supabase/migrations/` (e.g. a test fixture or seed loaded by the test harness) so it can never be pushed to a real project. Reconstruction: `docs/workforce/ARCHITECTURE_AUDIT.md` | ADOPTED-DEFAULT (loop, 2026-10-24) |
| D-2 | Existing `workers` table is an owner-managed roster. Keep it as the owner's roster and link it to new `worker_profiles` via `user_id`, or migrate? | W2 | Keep and link; no data migration. W0 detail: `workers` stays the shop roster / booking-assignment entity; new `worker_profiles` (PK = profiles.id) is the worker identity; `workers.user_id` is the link (W2 adds FK -> profiles.id, partial unique (owner_id, user_id) where user_id is not null, and replaces the `.single()` user lookup with a list/per-owner lookup); contracts and relationships reference `worker_profiles`, never roster rows | ADOPTED-DEFAULT (loop, 2026-10-24) |
| D-3 | What does "worker contracts with minimum three owners" mean operationally? Which statuses qualify (active only? accepted?), and is it a goal/progress metric or a requirement for anything? | W10 | Progress metric only; qualifying = `active`; declined/expired/terminated/revoked do not count; suspended does not count while suspended | OPEN |
| D-4 | Who may act as trainer/assessor: the owner only, or named staff the owner designates? | W6 | Owner + owner-designated trainers recorded per program | ADOPTED-DEFAULT (loop, 2026-10-25) |
| D-5 | Certification validity period and renewal rule? | W7 | 12 months, renewal by re-assessment; configurable per shop | ADOPTED-DEFAULT (loop, 2026-10-26) |
| D-6 | Is a compliant e-signature provider in scope? | W9 | No — draft-and-acceptance workflow, labelled as such | OPEN |
| D-7 | Should training compensation/reimbursement be offered as optional fields? | W6 | Yes, optional, owner-entered, displayed verbatim | ADOPTED-DEFAULT (loop, 2026-10-25) |
| D-8 | Signup role trust: signup sends `role` in client-controlled `auth.signUp` metadata and the profile-creation trigger is not in the repo (audit E1/E2). How is the role trusted? | W2 | W2 makes signup profile creation whitelist the metadata role to `customer`, `owner`, `worker`; `super_admin` only via SQL run by a human; `role` immutable for authenticated users (trigger) | ADOPTED-DEFAULT (loop, 2026-10-24) |
| D-9 | Worker self-registration: the role picker offers only customer/owner, so worker accounts cannot sign up. Allow it? | W2 | Add `worker` to the signup role picker in W2 | ADOPTED-DEFAULT (loop, 2026-10-24) |
| D-10 | Linked-project RLS/triggers for `profiles`, `bookings`, `workers` (and the signup trigger) are unknown to the repo. How are loop fixes validated against the real project? | none (standing gate) | Loop fixes are verified only against the local baseline; before any deploy a human runs `supabase db dump --schema-only` themselves and diffs it against the local baseline | OPEN (standing gate, not blocking) |
| D-11 | Migration naming `YYYY_MM_DD_*.sql` (LOOP rule 3) parses as version `2026` in Supabase CLI v2.122.0, so files collide in `schema_migrations`. Rename committed migrations to 14-digit timestamps? | none (local tests stage 14-digit copies) | Keep naming per rule 3; local test workdir stages byte-identical copies under 14-digit names; a human decides on renaming before any `db push` | ADOPTED-DEFAULT (loop, 2026-10-24) |
| D-12 | Should openings that require a certification accept applications before certifications exist (W7)? | W5 | Yes, accept until W7; W7 decides enforcement | ADOPTED-DEFAULT (loop, 2026-10-25) |
| D-13 | When may an owner see an applicant's worker profile? | W5 | Only while the application is submitted, under_review, shortlisted or accepted; via a narrow definer function; never private contacts | ADOPTED-DEFAULT (loop, 2026-10-25) |
| D-14 | Is contact exchange between owner and applicant in scope for W5? | W5 | No contact exchange in W5; in-app status only | ADOPTED-DEFAULT (loop, 2026-10-25) |
| D-15 | How does a worker enter training? | W6 | Owner invites from an accepted W5 application at the same shop; worker accepts after acknowledging the notice | ADOPTED-DEFAULT (loop, 2026-10-25) |
| D-16 | Who may be a designated trainer? | W6 | A worker already linked to the owner's roster, designated per program; revocation or unlinking ends authority | ADOPTED-DEFAULT (loop, 2026-10-25) |
| D-17 | Scope of the training booking gate (C7) | W6 | Block assigning, or a trainee starting, a booking while mid-way through required training; other workers unaffected | ADOPTED-DEFAULT (loop, 2026-10-25) |
| D-18 | What happens to training records when a shop or owner account is deleted? | W6, W7 | Orchestrator override of the architect's proposal (delete with shop): RETAIN worker-facing enrollment, attendance and assessment evidence; shop/owner deletion must not delete it (consistent with W5-L10) | ADOPTED-DEFAULT (loop, 2026-10-25) |
| D-19 | Which training types exist? | W6 | Only required initial training, always free (worker_fee = 0) | ADOPTED-DEFAULT (loop, 2026-10-25) |
| D-20 | Do certification-required openings now require a certificate to apply? | W7 | Yes: create/submit refused unless the worker holds a current certificate from any shop; existing applications untouched; other owners see only current certificates | ADOPTED-DEFAULT (loop, 2026-10-26) |
| D-21 | Suspension, revocation and review | W7 | Reason required; suspension can be reinstated; revocation final except via a worker review request (30 days, max 3) decided by the issuing owner; super_admin escalation in W11 | ADOPTED-DEFAULT (loop, 2026-10-26) |
| D-22 | Renewal | W7 | By re-assessment within 60 days before to 90 days after expiry; issues a new certificate; old one marked superseded | ADOPTED-DEFAULT (loop, 2026-10-26) |
| D-23 | Effect of losing shop verification or deleting the shop/owner | W7 | Certificates are not voided (D-18); workers not notified | ADOPTED-DEFAULT (loop, 2026-10-26) |
| D-24 | Training record corrected after a certificate was issued | W7 | Flag the certificate and notify the owner; never auto-suspend | ADOPTED-DEFAULT (loop, 2026-10-26) |
| D-25 | Expiry notices | W7, W12 | W7 adds the expiry-notice function; W12 schedules it | ADOPTED-DEFAULT (loop, 2026-10-26) |

## Standing human gates (never automated — the only things the loop stops for)
- Applying any migration to the linked/shared/production Supabase project.
- Merging any `feature/workforce-*` branch into `main`; deploying via Render.
- Philippine labor-law review before production use. The loop does not stop for this; it
  records items in `docs/workforce/LEGAL_REVIEW_REGISTER.md` and continues.
