# Final full-branch review (LOOP.md Completion criterion 4) - 2026-11-03

Scope: `git diff ec6570a HEAD` on `feature/workforce` at 3967f32 (W0-W14, 1017 files). Both reviewers ran read-only and
fresh, focused on cross-increment and systemic risk (each increment already passed its own review). Recorded by the
orchestrator.

**Result: FULL-DIFF SECURITY: BLOCKING=0 · FULL-DIFF COMPLIANCE: BLOCKING=0.**

Security evidence: local `run-db-tests.mjs` 105 files / 3198 tests PASS; live catalog queried (anon executes only 5
pre-workforce functions; 152 authenticated-executable functions each gated by a caller-scoped check; RLS on every public
table; both views `security_invoker`); `washlink.*` bypass flags row-scoped and transaction-local; trigger interactions on
shops / profiles / bookings / job_openings / worker_contracts checked; no secrets, no `dangerouslySetInnerHTML`; stack stopped.

## Non-blocking findings (candidates for a follow-up increment; none fails a completion criterion)

| ID | Source | Finding | Suggested route |
|---|---|---|---|
| F-S1 | security NB-1 | J17 roll-up pins anon EXECUTE but not the 152 authenticated-executable functions | Pin the list in J17 |
| F-S2 | security NB-2 | An owner can delete a shop with live workforce records (pre-existing `shops_delete_own`): published openings and not-accepted applications (worker text) cascade-delete; contracts / certificates / cases keep `shop_id` null | BEFORE DELETE guard or soft-deactivation; DECISIONS + LIMITATIONS |
| F-S3 | security NB-3 | anon keeps default SELECT/INSERT/UPDATE/DELETE on the six pre-workforce tables (RLS gives zero rows; unchanged from main) | Revoke after the D-10 diff; add to J17 |
| F-S4 | security NB-4 | DEPLOYMENT_READINESS trigger-order gate omits bookings (`bookings_guard_update_training_gate` after `bookings_guard_update`) and profiles | Docs |
| F-S5 | security NB-5 | `is_trusted_db_session()` trusts any no-JWT session except three API logins | D-10 gate check; optional allow-list |
| F-S6 | security NB-6 | Cross-increment lock order / deadlock untested (W10 PLAN R4) | Two-session pgTAP case |
| F-C1 | compliance N1 | A single super_admin can change the TEXT of the 15 core locked safeguard clauses in a platform version (keys / lock / section pinned, text not); new owner templates inherit it; accepted contracts unaffected | Pin core text or require a migration; LIMITATIONS + register |
| F-C2 | compliance N2 | Training booking gate bypassable via an unlinked or name-only roster row (w6h checks `user_id is not null`) | Refuse unlinking during a live required enrollment, or list in LIMITATIONS free-training gaps |
| F-C3 | compliance N3 | Worker-facing "Trainees cannot be assigned to customer bookings while their required training is unfinished." is too absolute (super_admin cross-owner, F-C2, other owners' bookings); W6-L12 quotes removed text | Limit copy to the training shop; update W6-L12 |
| F-C4 | compliance N4 | ACCEPTANCE_TESTS says it does not repeat Vitest numbers but K9 does | Docs nit |
| F-C5 | compliance N5 | Pre-existing landing copy "Verified car wash professionals" vs no worker identity verification | Copy review |
| F-C6 | compliance N6 | Worker must give a 10..500 character reason to end a contract (shop sees it) | Legal review with W13-L2 / W7-L14 |
| F-C7 | compliance N7 | SPEC I "interview scheduling" notices: no interview feature (D-69) and not in LIMITATIONS | LIMITATIONS |

## Proposed legal-review items (not yet in the register)
1. Platform template versions can change the text of the 15 core safeguard clauses without a server check or second reviewer (F-C1).
2. Training booking gate bypass via unlinked / name-only roster rows (F-C2).
3. The absolute worker-facing trainee statement and the stale W6-L12 source (F-C3).
