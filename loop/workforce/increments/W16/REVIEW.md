# W16 - REVIEW (2026-11-04)

Security and compliance reviewers ran read-only in parallel on the uncommitted W16 work over bad4f80. **No BLOCKING findings.**
SEC-5 is closed (deleted shop, failed assessment, both, pre-assigned start); no worker is stuck; the 155-function list has nothing
wrongly exposed; K10 has its required content. Fix cycle 1 takes the items marked below before VERIFY.

## Security
| ID | Finding | Route |
|---|---|---|
| N1 | Pin scope too narrow: an unchanged publish plus an ADDED `locked_safeguard` clause contradicting the safeguards is accepted and reaches owners as a WashLink safeguard | Fix cycle 1: non-trusted sessions cannot add, remove or change any `locked_safeguard` clause (also covers `training_pay_or_reimbursement`); added editable clauses stay a documented limit |
| N2 | Later worker on a re-used row can be held indefinitely with nothing of their own to leave; message false for them; workaround exists | Fix cycle 1 docs (LIMITATIONS, W16-L1); changing D-79 is a human decision |
| N3 | LIMITATIONS "no worker action gains a refusal" overstated | Fix cycle 1 docs |
| N4 | Accepted booking at a deleted shop with a held trainee has no way forward except the trainee leaving; not pinned or documented | Fix cycle 1 (test + docs) |
| N5 | Pre-apply count ignores link history | Fix cycle 1 docs (use the gate's own predicate) |
| N6 | Shop-removal confirm silent on live trainees | Fix cycle 1 copy (with C-S6) |
| N7 | Trigger functions executable (harmless; after D-10); no recipe for the trusted route | Fix cycle 1 docs |
| extra | Trainer correction after fail + shop removal returned 42501 in the reviewer's probe, not pinned | Fix cycle 1 test |
| extra | Owner account deletion also removes the gate (audited) | Fix cycle 1 docs (W16-L1) |

## Compliance
| ID | Finding | Route |
|---|---|---|
| C-S1 | Hold explanations do not name the "Leave training" button, which is behind the progress dialog; no notice on shop deletion (W16-L7) | Fix cycle 1 copy + LIMITATIONS |
| C-S2 | Leave confirm omits consequences (same owner may then assign, wrong not-passed cannot be corrected, restart at 0 days) (W16-L7) | Fix cycle 1 copy: facts only, no "your choice" wording |
| C-S3 | `shopRemovedExplanation` does not say only leaving ends it; note says "cancelled" | Fix cycle 1 copy (D-85 amendment) |
| C-S4 | `failedTrainingExplanation` overstates a correction | Fix cycle 1 copy |
| C-S5 | Shop-side text not updated to owner scope; register does not quote shipped texts | Fix cycle 1 copy + W16-L2 |
| C-S6 | D-86 confirm silent on training | Fix cycle 1 copy (with N6) |
| C-S7 | LIMITATIONS absolute "cannot trap" and overbroad "each lift ... record" | Fix cycle 1 docs |
| C-S8 | "reviewed migration" implies a review nobody requires; no runbook | Fix cycle 1: "human-run migration" in the error text, frontend map, docs; runbook lines |
| C-S9 | D-86 records no reason for rejecting soft-deactivation | RECORD + docs |
| N1-N7 | Nits: "always free" absolute (pre-existing), preflight list, LIMITATIONS title, "all W16-L1", contract UI vs gate, K10 citations, RECORD items | Fix cycle 1 docs where cheap; RECORD |

Legal flags: W16-L1..L6 (plan), W16-L7 (compliance), all OPEN; register becomes 174.
