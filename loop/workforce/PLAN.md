# Workforce Module — Increment Plan

Each increment is independently verifiable, ships DB + service + UI + tests for its slice,
and must leave the existing booking, pricing, verification and rating flows working (J18).

| ID | Increment | Spec | Depends on | Acceptance tests |
|---|---|---|---|---|
| W0 | Architecture audit & baseline | A, G | — | baseline checks recorded |
| W1 | Test infrastructure (local Supabase, pgTAP, Vitest) | G, J | W0 | J17, J18 harness |
| W2 | Role hardening & worker profiles / onboarding | A | W1 | J1, J17 |
| W3 | Audit events & notification foundation | I | W2 | audit writes tested |
| W4 | Job openings (owner) | B | W3 | J2, J3 |
| W5 | Marketplace & applications | C | W4 | J4, J5 |
| W6 | Training programs, attendance, assessment, free-training rule | D | W5 | J6 (part), J7, J8 |
| W7 | Certifications: issue, expire, suspend, revoke | D | W6 | J6, J8 |
| W8 | Contract templates & template versions | E | W3 | J9 |
| W9 | Worker contracts, acceptance, snapshots, amendments | E | W8, W5 | J10, J11, J12 |
| W10 | Owner relationships & three-distinct-owner policy | F | W9, D-3 | J13, J14, J15, J16 |
| W11 | Role-aware dashboards & navigation (worker/owner/admin) | H | W4–W10 | UI states, counts |
| W12 | Notification wiring for all events | I | W11, W14 | no-duplicate, no-private-leak |
| W13 | Hardening, docs, rollback guide, legal-review register | K | all | full J1–J18 green |
| W14 | Platform moderation, oversight reads & admin audit (super_admin) | A, B, H, I | W11 | J2, J3, J17, J18 + moderation / audit tests |
| W15 | Close the required-training booking-gate bypass (unlink path) and fix the trainee notice | D | W13 | J7, J8, J16, J18 + probe replay |
| W16 | Complete LIMITATIONS and the legal register; final docs nits | K | W15 | K10 evidence |

## Increment details

### W0 — Architecture audit & baseline (read-only + docs)
- Reconstruct the real schema: `profiles`, `bookings`, `workers` are referenced but NOT
  created in `supabase/migrations/`. Determine their columns, constraints and RLS (ask the
  human for a schema-only dump of the linked project, or derive from code; never query prod
  with write access).
- Confirm whether `profiles.role` can be updated by its owner via RLS (privilege-escalation risk).
- Map how the current `workers` table (owner-managed roster with `owner_id`, nullable
  `user_id`) relates to the new worker identity; propose keep/extend/migrate.
- Check email verification settings in the auth flow; notification mechanisms present (sonner
  toasts only? nodemailer smtp-test scripts?).
- Run baseline: lint, build, pytest. Record actual numbers.
- Output: `docs/workforce/ARCHITECTURE_AUDIT.md`, proposed ERD, and updates to DECISIONS.md.

### W1 — Test infrastructure
- `supabase init` config + a **baseline migration** that recreates the missing core tables
  locally only (or a `supabase/tests/fixtures` schema) so migrations replay on a clean local DB.
  Must not alter the remote project. (Requires D-1.)
- pgTAP tests under `supabase/tests/` with helpers to act as customer/owner/worker/admin.
- Vitest + Testing Library in `frontend/` with `npm test`.
- Regression tests for booking creation, shop pricing quote, verification, ratings (J18).

### W2 — Role hardening & worker profiles
- Trigger/policy preventing users from changing their own `role` or verification fields.
- `worker_profiles` (1:1 with auth user/profile): experience, skills, preferred locations,
  availability, contact (private columns protected). Owner shop verification gate helper
  `is_verified_shop_owner(shop_id)`.
- Registration/onboarding UI for worker and owner via existing Supabase auth; duplicate
  account handling; loading/error states.

### W3 — Audit & notifications foundation
- `workforce_audit_events` (append-only, insert via security-definer functions only).
- `notifications` table + RLS (recipient-only read) unless W0 finds an existing system.
  Notification bodies carry no private contract text.

### W4 — Job openings
- `job_openings` with lifecycle draft → published ⇄ paused → closed → archived;
  transition function; publish requires verified shop. Compensation fields optional and
  displayed only as entered. Owner CRUD UI with preview.

### W5 — Marketplace & applications
- `job_applications`; unique (opening, worker) for non-withdrawn applications; state machine
  draft/submitted/under_review/shortlisted/accepted/rejected/withdrawn/closed enforced in a DB
  function; owner pipeline UI; worker search/filter, apply, withdraw, track.
- Qualifications shown to owners come only from verified certification records.
- Carry-forwards (W4 review): snapshot the job opening's content at application time (owners can edit
  published openings, C-W4-1); refuse applications after the opening's deadline (W4 R4); show the
  free-training notice and the training-vs-paid-work distinction before workers see openings (C7);
  only openings at shops passing `shop_has_recorded_verification` are applicable. Resolve legal flag
  W4-L10 (DOLE recruitment registration) in the legal-review register before production.

### W6 — Training
- `training_programs` (≥3 distinct training days, objectives, terms, `worker_fee` forced to 0
  for required initial training via CHECK; optional compensation/reimbursement fields),
  `training_enrollments`, `training_sessions`, `training_attendance`, `training_assessments`.
- Status derived from evidence; "completed" requires ≥3 attended distinct days + passed
  assessment signed off by authorized trainer/owner. Free-training notice shown pre-enrollment.
- Training vs productive work distinction recorded; legal-review flag on arrangement.

### W7 — Certifications
- `certifications` issued only via function that checks W6 evidence and verified shop;
  records approver + timestamp; expiry/renewal; suspend/revoke with reason + audit + review.
- Labelled "shop-issued", never "government-recognized".
- Carry-forwards: certification half of J3 (W4); snapshot shop verification at issue (W2 R-4).

### W8 — Contract templates
- Platform starter template (15 sections from spec E), marked "Draft — requires review by a
  qualified Philippine labor-law professional". Locked platform safeguard clauses vs editable
  clauses. Owner template versions (immutable rows; new version per save). Preview.

### W9 — Contracts
- `worker_contracts`, `contract_versions` (immutable snapshot of rendered text + hash),
  `contract_acceptances` (who, when, version hash). Statuses draft → sent_for_review →
  accepted/declined → active → expired/terminated. Amendments = new version requiring
  consent. Diff vs standard template. Clearly labelled draft-and-acceptance workflow, not an
  e-signature; no fabricated signatures. Carry-forward (W5 review, W5-L10): deleting a
  shop or owner account must not delete accepted applications' snapshots or contract records
  (retain worker-facing records; no cascade delete of evidence). Problem-term flagging (keyword/rule based) without
  claiming legal validation. Classification never defaults to independent contractor.

### W10 — Owner relationships
- `worker_owner_relationships` unique (worker, owner); derived from qualifying contracts.
- `workforce_policies` with `minimum_distinct_owners = 3` (configurable, default unchanged).
- Count = distinct verified owners with qualifying status per D-3. View shows count/remaining.
- Rule is informational/progress only unless D-3 decides otherwise — never blocks a worker
  from declining or terminating (J16).

### W14 — Platform moderation, oversight reads & admin audit (split from W11, D-49; run after W11, before W12)
- Worker reports of job postings (discrimination incl. age, fees, unpaid trials, misleading terms; W4, W4-L4/L7/L8/L9) with a
  super_admin moderation queue and audited takedown (pause / close with a reason shown to the owner; snapshots never edited).
- super_admin UI for `publish_platform_contract_template_version` (W8).
- Redacted per-user audit reads and an admin audit log UI (W3).
- Audited super_admin relationship reads outside disputes (W10, D-38).
- Queue of approved shops with no recorded reviewer, re-review from it, runbook (D-10, W4).
- Admin take-over of overdue / stranded shop review requests, only if a human changes D-44.

### W15, W16 — from the failed final verification (2026-11-03, `FINAL_VERDICT.md`)
- W15: refuse the unlink → assign path (owner unlinks a linked trainee mid required training, then assigns the roster row to a customer booking), in a new migration (no edit to w2d / w6h); pgTAP replaying the verifier probe; accurate trainee notice copy; register item for the gate's limits; W6-L12 source update.
- W16: LIMITATIONS.md free-training paragraph corrected, plus F-C1 (core clause text changeable by a super_admin), F-C2 remainder (name-only rows), F-C7 (no interview feature), F-S2 (shop deletion cascade + decision); register adds F-C1 / F-C2 / F-C3 and any W15 item (all OPEN); DEPLOYMENT_READINESS trigger-order gate covers bookings and profiles; ACCEPTANCE_TESTS K9 nit; STATE.md final-suite output.
- Then re-run the full-diff security and compliance review and the final verification.

### W11–W13
- Dashboards prioritizing next action; admin queues only for `super_admin`.
- W11 carry-forwards: independent certification review decider + escalation after "upheld" (D-21 conflict,
  W7-L12); handling of suspensions stranded when the issuer loses verification or is removed (W7-L13);
  moderation/reporting of discriminatory postings (W4); approved shops with no recorded reviewer (D-10).
- Notification wiring with idempotency keys.
- Final regression, `docs/workforce/` docs, rollback guide, `LEGAL_REVIEW_REGISTER.md`.
