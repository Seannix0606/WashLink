# W15 - REVIEW (2026-11-03)

Security and compliance reviewers ran read-only in parallel on the uncommitted W15 work over 3967f32. **No BLOCKING findings.**
Both confirm the F-C2 bypass (FINAL_VERDICT) is closed for every detectable path (P1-P5) and that no worker action is refused (J16).
Fix cycle 1 takes the items marked below before VERIFY.

| ID | Source | Finding | Route |
|---|---|---|---|
| SEC-1 | security | History trigger fires on a no-op `update of user_id`; an orphan-linked production row would fail 23503 | Fix cycle 1 (early return when unchanged; insert only if the profile exists) |
| SEC-2 | security | Probe replays do not assert the unlink changed the row | Fix cycle 1 (assert `user_id is null` after unlink in j7_w15 and the J18 roll-up) |
| SEC-3 | security | D-80: a later worker on a re-used row gets "You are in required training..." on start; a leaked link code can taint a row | Fix cycle 1 docs (TRAINING, LIMITATIONS, W15-L1); message change would replace w6h (not done) |
| SEC-4 | security | A booking already in progress on a row can be completed by a trainee who links later | Fix cycle 1 docs (W15-L1) |
| SEC-5 | security | Owner can lift the gate by recording a failed assessment or removing the training shop while the enrollment stays accepted | W16 register / LIMITATIONS |
| SEC-6 / C-SF-4 | both | ROLLBACK_GUIDE says the W15 ROLLBACK block never ran; it ran locally in a rolled-back transaction | Fix cycle 1 docs |
| SEC-7 | security | Backfill could also use `roster.unlinked` audit rows | Fix cycle 1 |
| SEC-8 | security | R4 unknown production triggers on `workers` | Fix cycle 1 docs (D-10 / DEPLOYMENT_READINESS) |
| C-SF-1 | compliance | Second-person trainee copy is shown to owners / trainers, reads wrongly and describes how to avoid the gate; owner views lost the rule statement (W15-L2) | Fix cycle 1 (owner / trainer variant) |
| C-SF-2 | compliance | D-80 side effects (misleading w6h message, unlink-first workaround) undocumented | Fix cycle 1 docs (with SEC-3) |
| C-SF-3 | compliance | LIMITATIONS lead sentence still unqualified; gap list omits other owners' bookings and trusted SQL | Fix cycle 1 docs |
| C-N-1 | compliance | D-79..D-82 not yet in DECISIONS.md | RECORD |
| C-N-3 | compliance | Register must add W15-L2, W15-L3 (167 items) and update every count / test pin | Fix cycle 1 |

Legal flags: W15-L1 (plan), W15-L2 (owner / trainer copy), W15-L3 (`roster_link_history` retention, RA 10173), all OPEN.
