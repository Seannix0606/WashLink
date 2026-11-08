# W1 Review findings

## Security — initial review: 2 BLOCKING (fixed in fix cycle 1)
- B1 FIXED: baseline/helper SQL under repo `supabase/tests/` could be applied by `test db --linked`. Moved to `scripts/supabase-test/baseline/`; stager guard + test.
- B2 FIXED: owner booking policies lived in the seed (after migrations). Now staged migration `20260417000002`.
- N3–N8 FIXED: stronger E2/E5/S1 asserts, F5 RPC note, S9 TODO, runner env/project-ref refusal + quoting, WebSocket/XHR stubs.

## Security — re-review: no BLOCKING
- SUPABASE_DB_PASSWORD refusal: FIXED by orchestrator.
- Seed guard (S10) and test_helpers grant warning (S11): routed to W2 (see W0/REVIEW.md).
- Runtime deps `nodemailer`, `ws` have 2 high npm-audit findings; predate W1; W1 devDeps don't ship.

## Compliance: no BLOCKING, no new legal items
- Future fixtures (training days, assessor, contract acceptance) must be synthetic; no worker fee in training fixtures.
- Synthetic 250.00 price in test_helpers is a booking price, not pay.
