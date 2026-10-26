# W8 Review findings

Security: no BLOCKING. Compliance: no BLOCKING. Legal flags: W8-L1…L13 (register).

## Fixed in review polish (W8 migrations uncommitted, edited in place)
- Owner validator: non-shop clause count must equal base count; `source_clause_id` unique per version.
- Safeguard impersonation: invisible characters rejected; normalised match for "washlink safeguard" and "platform safeguard" (server and client).
- Locked-only placeholders (`worker_classification`, party names) in owner versions.
- Single-pass placeholder render; `{{`/`}}` refused in values (W9 safety).
- Platform publishing: 15 core keys pinned to sections; claim words (compliant/approved/valid/reviewed/binding/signed) refused outside the negated draft sentence.
- Preflight refuses pre-existing non-W8 `contract_template%` functions.
- Section 4 `classification_reasons` locked; `safeguards_prevail` covers owner edits; parties/safety/customer-data clauses made core (W8-L10); locked training pay/reimbursement clause (W8-L11).
- Frontend updated for the new locked clauses, error messages and client-side checks.

## Carry-forward
- W9: J9 contract-draft half; problem-term flagging list (W8-L13) in CONTRACT_TEMPLATES.md and the W8 LOG hand-off; contract snapshots store their own rendered text (hashes don't cover titles/notices).
- W11: super_admin platform publishing UI.
- Rollback of w8e requires superuser/table owner (disables guard triggers); documented.
