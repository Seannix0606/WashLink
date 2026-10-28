# W10 - REVIEW (2026-10-28)

Security (`workforce-security-reviewer`) and compliance (`workforce-compliance-reviewer`) ran read-only in parallel on the
uncommitted W10 work over e43c2db. Recorded by the orchestrator. **No BLOCKING findings from either reviewer.**

Both reviewers independently flagged the same plan deviation (S1 = C3: the policy row, including the admin's reason text, is
readable by every signed-in user, contrary to PLAN P61). W10 is uncommitted and the fixes are small, so the orchestrator ran
**fix cycle 1** for S1/C3, C2, C4, S5, S6 and the C1/C7 copy items before VERIFY. Everything else is routed below.

## Security (S)

| ID | Class | Finding | Route |
|---|---|---|---|
| S1 | should-fix | `workforce_policies` select granted to every authenticated user exposes `last_change_reason` and `updated_by` (w10c select policy) | Fix cycle 1 |
| S2 | note | Bulk `refresh_worker_owner_relationships()` holds every pair advisory lock until commit; a scheduled run can stall worker terminate/decline past `statement_timeout` (57014) and can deadlock with an expiry job in the same transaction | W12 (when scheduling: one pair per transaction or try-lock, separate from expiry) |
| S3 | note | Trusted bulk refresh accepts future `p_as_of`, storing premature `ended` state and audit noise; reads stay correct (live) | W12 |
| S4 | note | Owner toggling own shop `is_active` produces per-pair `.status_changed` audit events (intended semantics; cheap audit-spam path) | W13 (document or rate-limit) |
| S5 | note | Docs and w10d header overstate "a trusted session cannot write rows"; a superuser can set the flag deliberately | Fix cycle 1 (wording) |
| S6 | note | `is_trusted_db_session()` is true for a service_role JWT; safe only because service_role has no table grants | Fix cycle 1 (pgTAP privilege assertion) |
| S7 | note | Worker-profile existence check runs before the advisory lock; a concurrent self-deletion can fail its own insert | No change (only affects the deleting worker) |

Verified sound: w10b guard is the w9c body plus only the forward-only trusted block; write flag not settable by clients
and unusable without grants; all security-definer functions pinned and internal ones revoked; no escalation via the
profiles/shops triggers; owner RPC has no count/remaining/other-owner columns; audit payloads are reason-free and pass the
payload-safety CHECK; the sync trigger has no error path (J16); no new lock cycle on worker actions.

## Compliance (C)

| ID | Class | Finding | Route |
|---|---|---|---|
| C1 | should-fix | "Suspended" badge while the contract is still active can read as an employment/pay suspension (W10-L9) | Fix cycle 1 (counting-neutral label) |
| C2 | should-fix | Owners can select their own `worker_owner_relationships` rows directly and see `counts_toward_goal` / `qualifying_contract_count`, contrary to the docs and D-38 (W10-L11) | Fix cycle 1 |
| C3 | should-fix | = S1 (W10-L10) | Fix cycle 1 |
| C4 | should-fix | "Since" date comes from the stored row while the status is derived live; can show a stale date before a refresh | Fix cycle 1 |
| C5 | should-fix | Worker card heading departs from spec H wording without a recorded decision | RECORD (D-41) |
| C6 | should-fix | D-36..D-40 only in PLAN.md | RECORD (DECISIONS.md) |
| C7 | minor | `describeOwnerGoalSource` says "1 different shop owners" when the minimum is 1 | Fix cycle 1 |
| C8 | note | Residual J16 risk from trigger failure / lock contention; no concurrency test (PLAN R2/R4) | W12 with S2; W13 hardening |

Verified sound: D-3 counting (only `active`), J14 distinct owner ids live from contracts, J16 (informational CHECK, no W9 path
reads the policy, modals unchanged), policy governance, no legal-validity claims, W9 carry-forward C6 closed, register has
W10-L1..L8 OPEN.

## Legal flags
W10-L1..L8 (plan) plus W10-L9..L11 (compliance reviewer, `LEGAL_FLAGS.md`), all OPEN; RECORD adds L9..L11 to
`docs/workforce/LEGAL_REVIEW_REGISTER.md`.
