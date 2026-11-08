# W13 - REVIEW (2026-10-30)

Security (`workforce-security-reviewer`) and compliance (`workforce-compliance-reviewer`) ran read-only in parallel on the
uncommitted W13 work over eeb552b. Recorded by the orchestrator. **No BLOCKING findings from either reviewer.**

W13 is the last increment and is uncommitted, so the orchestrator ran **fix cycle 1** for the items marked below before VERIFY.

## Security

| ID | Class | Finding | Route |
|---|---|---|---|
| S1 | should-fix | D-70 deny-all select policy is PERMISSIVE; an unknown production select policy would keep raw admin reads open (w13a only NOTICEs) | Fix cycle 1 (RESTRICTIVE policy; readiness gate "must be dropped") |
| S2 | should-fix | J17 roll-up sequence check misses USAGE / SELECT / UPDATE combinations and standalone sequences | Fix cycle 1 |
| S3 | should-fix | J17 roll-up ignores column-level grants | Fix cycle 1 |
| S4 | should-fix | w13a pins only two strings, not the w9j body; W13 skip matches 'W13' anywhere | Fix cycle 1 (md5 of the w9j / w13d bodies) |
| S5 | should-fix | w13b ROLLBACK / guide re-grants the D-78 holes; guide does not say rolling back w13b re-opens W14 N1 | Fix cycle 1 |
| S6 | should-fix | TRUNCATE / REFERENCES / TRIGGER defaults likely remain on the six pre-workforce tables; roll-up excludes them | Fix cycle 1 (verify locally, revoke from anon / authenticated, extend roll-up) |
| S7 | should-fix | Readiness: Realtime gate checks only `puballtables`; no gate runs the J17 catalogue assertions against the restored production schema | Fix cycle 1 docs |
| N1 | note | "no using(true)" check matches only the literal | Fix cycle 1 (rename / document scope) |
| N2 | note | Roll-up does not pin guard triggers on the three client-writable tables | Fix cycle 1 |
| N3 | note | `washlink_private.roster_link_code_pepper` outside the roll-up | Fix cycle 1 |
| N4 | note | Smoke audit helper reads only the newest 200 rows | Fix cycle 1 (page) |
| N5, N6 | note | service-key profile promotion in smokes; ARCHITECTURE trusted-session sentence | N5 local only; N6 docs |

## Compliance

| ID | Class | Finding | Route |
|---|---|---|---|
| C1 | should-fix | Worker intro "You can always decline an offer or end an accepted contract." unchanged (W9 C2 remainder) | Fix cycle 1 copy |
| C2 | should-fix | Owner expiry notice (w13d) lacks the "depends on the contract terms and the law" caveat (W13-L8) | Fix cycle 1 |
| C3 | should-fix | UI labels "Ended (end date passed)" / "The contract reached its end date." still present expiry as an ending (W13-L9) | Fix cycle 1 copy |
| C4 | should-fix | w13d header calls "Contract expired" the UI label | Fix cycle 1 |
| C5 | should-fix | LIMITATIONS: overstated D-73 closure; free-training gaps (W6-L10, W6-L11), admin cross-owner trainee assignment (W13-L11), W9 C4 / W9-L13, trusted end with no notice, W6-L13 understated; unverified sweeping claim | Fix cycle 1 docs |
| C6 | should-fix | ARCHITECTURE.md:108 absolute trainee statement contradicts the super_admin exception | Fix cycle 1 docs |
| C7 | should-fix | ACCEPTANCE_TESTS K evidence: K1 weak (mocked only, say so), K3 (ROLLBACK never executed), K5 / K6 / K8 missing key assertions, K9 depends on RECORD | Fix cycle 1 docs (K9 at RECORD) |
| C8 | minor | Register index line 18 says part 2 holds W13; readiness could name spec D / E gates explicitly | Fix cycle 1 docs |
| C9 | note | D-70..D-78 not yet in DECISIONS.md | RECORD |

## Legal flags
W13-L1..L7 (plan) plus W13-L8..L11 (compliance), all OPEN; the fix-cycle docs pass adds L8..L11 to the index (164 items).
