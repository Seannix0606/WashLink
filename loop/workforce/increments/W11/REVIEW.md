# W11 - REVIEW (2026-10-29)

Security (`workforce-security-reviewer`) and compliance (`workforce-compliance-reviewer`) ran read-only in parallel on the
uncommitted W11 work over 6ce3f61 (both were interrupted once by an API rate limit and resumed). Recorded by the orchestrator.
**No BLOCKING findings from either reviewer.** Before review the orchestrator corrected the owner dashboard wording
"Suspended relationships" -> "Relationships needing attention" (W10 D-36 / W10-L9); N9 below saw the earlier text.

W11 is uncommitted and most findings are small and worker-protective, so the orchestrator ran **fix cycle 1** for N1-N5, N8,
C1-C5 before VERIFY.

## Security (N)

| ID | Class | Finding | Route |
|---|---|---|---|
| N1 | low | R-a: issuing owner reads the deciding admin's uuid in raw W7 rows (`certifications.status_changed_by`, `certification_status_events.actor_id`) | Fix cycle 1 (new W11 mask triggers, no W7 body replaced) |
| N2 | medium (design) | Owner can reinstate (closes review as `resolved_by_shop`) then re-suspend at once, repeatedly, so the worker never reaches a WashLink decision | Fix cycle 1 (re-suspend / revoke soon after `resolved_by_shop` is immediately eligible) |
| N3 | should-fix | super_admin raw SELECT policies on both W11 tables bypass the audited case reads | Fix cycle 1 (drop admin select policies; RPC-only) |
| N4 | should-fix | `admin_contract_dispute_queue('closed')` returns contract status / shop name after close, unaudited | Fix cycle 1 (null unless open) |
| N5 | low | Worker open/withdraw loop re-notifies the owner and re-applies holds | Fix cycle 1 (cap per suspension/revocation event, withdrawn ones count) |
| N6 | info / legal | Admin contract access lasts while the dispute is open | W14 audit UI flags long-open disputes; W11-L5 / L10 |
| N7 | info | StrictMode can double-audit case reads in development | Accepted (fails safe; documented) |
| N8 | info | `escalated_from_request_id` is `ON DELETE CASCADE` | Fix cycle 1 (`ON DELETE SET NULL`) |
| N9 | info | "Suspended relationships" owner wording | Already corrected before review |

Verified sound: RLS / grants / deny-all writes and guards on both tables; 26 definer functions pinned, internal ones revoked;
super_admin checks via `profiles.role` with no existence oracle; J12 contract access only while open, every read audited;
party isolation; holds fire after W7 guards and never block decline / terminate (J16); no W7 body replaced, decide only
reinstates / upholds (D-45), no W11 writer on contract tables (D-47); dashboards role-scoped with no cross-party leak;
reason-free audit and notification payloads; RPC-only frontend; loopback-only smoke.

## Compliance (C)

| ID | Class | Finding | Route |
|---|---|---|---|
| C1 | should-fix | Review copy promises an administrator "who does not work for the shop"; nothing enforces it (W11-L15) | Fix cycle 1 (state only what is enforced) |
| C2 | should-fix | Review / problem statement forms do not say the statement is shown to the shop / other party (W11-L13) | Fix cycle 1 |
| C3 | should-fix | 90-day window copy can read as a legal deadline (W11-L12) | Fix cycle 1 |
| C4 | should-fix | Admin "stranded suspensions" count includes certificates WashLink already decided for the current event | Fix cycle 1 (reuse the already-decided rule) |
| C5 | should-fix | Worker open-openings count includes certification-required openings the worker cannot apply to (D-20) | Fix cycle 1 (filter to applicable) |

Verified sound: owner-decides-own-review conflict removed (W7-L12); D-45 scope; dispute rules and D-47; J16; privacy of
statements in audit / notifications; dashboards next-action-first, DB counts, all states, "Latest openings" (no
recommendations); W10 progress card unchanged; free training / certification rules untouched; register W11-L1..L10 OPEN.

## Legal flags
W11-L1..L10 (plan) plus W11-L11..L15 (compliance, `LEGAL_FLAGS.md`), all OPEN; RECORD adds L11..L15 to the register. W11-L11
(gaps in the route to an independent decider: verified shop keeps a suspension with no request inside 30 days; 3-request
lifetime cap; issuer unavailable > 30 days after a revocation) stays a legal / product question; N2's fix narrows it.
