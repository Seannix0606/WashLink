# W7 Review findings

Security: no BLOCKING. Compliance: no BLOCKING. Legal flags: W7-L1…L16 (register).

## Fixed in review polish (W7 migrations uncommitted, edited in place)
- Worker could delete/re-create worker_profiles to erase revoked/suspended certificates → deletion refused while certificates exist (account deletion still works); frontend explains it.
- Direct reinstate closes an open review; "upheld" can never be recorded against an active certificate.
- Workers read certificates only via `my_certifications` / `certification_history` (no raw reviewer/approver/assessor ids).
- w7g rollback now word for word with W5d.
- Ownership pre-check before locks in issue/renew; legacy shop with no recorded reviewer → mapped 23514.
- Owner applicant view: "Shop-issued certifications" + `issuing_shop_currently_verified` line.
- Worker card: renewal window guidance and "expired no longer counts" copy.
- Flaky W5 test (`like '%650%'` vs random uuid) made deterministic; 3 consecutive clean runs.

## Carry-forward
- W11: independent review decider + escalation (D-21 conflict, W7-L12); stranded suspensions (W7-L13); cross-shop effect of one owner's revocation under D-20 (W7-L14) — recorded in PLAN.md W11.
- W12: schedule expiry notices (D-25, W7-L10/L15).
- Not tested: refused callers never take locks; decide-on-active refusal is unreachable via RPC.
