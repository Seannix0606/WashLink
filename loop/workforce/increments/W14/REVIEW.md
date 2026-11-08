# W14 - REVIEW (2026-10-29)

Security (`workforce-security-reviewer`) and compliance (`workforce-compliance-reviewer`) ran read-only in parallel on the
uncommitted W14 work over a880331. Recorded by the orchestrator.

**One BLOCKING finding, raised independently by both reviewers (B1).** W14 goes back to BUILD for **fix cycle 1**, which also
takes the cheap non-blocking items marked below.

## BLOCKING

| ID | Finding | Route |
|---|---|---|
| B1 | Owner closing / archiving a WashLink-held opening runs `job_opening_moderation_close_reports` in the owner's session; each `job_opening_report.closed` audit row has `actor_id` = owner and `category` / `outcome` in its payload, and `my_workforce_activity` returns `actor_id = me` events with no `job_opening_report.*` exclusion, so the owner sees the number of reports and each alleged category (D-53 / P73; contradicts worker copy and docs). Test `w14_activity_hides_reports_from_owner` covers only an open case. | Fix cycle 1: `job_opening_report.*` events visible only to the reporter (subject profile); pgTAP for pause -> owner close; correct `PLATFORM_MODERATION_AND_AUDIT.md:171` and `JOB_OPENINGS.md:59` |

## Security (non-blocking)

| ID | Finding | Route |
|---|---|---|
| N1 | W3 `wae_select_super_admin` policy and `shop_verification_review_log` view still let a super_admin read the raw audit table without a `log_searched` event (kept on purpose, D-54) | W13 (drop the policy, route through `admin_workforce_audit_log`) |
| N2 | 10-open-reports-per-worker cap is a race under parallel requests | Fix cycle 1 (per-worker advisory lock) |
| N3 | Admin queue oldest-first `limit 200` with no cursor; a report flood can push new cases off the active view | W13 (cursor / paging) |
| N4 | `log_searched` audit omits the searched subject id / type / action prefix | Fix cycle 1 (enum / uuid values only) |
| N5 | A no-op owner edit satisfies "edit before asking WashLink to check" | Fix cycle 1 (compare the opening snapshot with the last pause snapshot) |
| N6 | w14c rollback drops the update guard before re-creating the combined trigger; a partial rollback leaves owner UPDATEs unguarded | Fix cycle 1 (single transaction in the ROLLBACK block); pgTAP trigger-order pin stays |
| N7 | Lookup purpose (e.g. `legal_or_regulatory_request`) shown to the person looked up | Fix cycle 1 (generic label for the subject); W14-L15 |
| N8 | w14g comment says the access record is written first; the read runs first (same transaction) | Fix cycle 1 (comment) |
| N9 | Frontend `subjectTypeSchema` allows 64 chars, DB 40 | Fix cycle 1 |

## Compliance (non-blocking)

| ID | Finding | Route |
|---|---|---|
| S1 | Report reason "Unpaid trial work or training" conflicts with the free-training model and is shown to owners | Fix cycle 1 copy ("Unpaid work presented as a trial or training"); W14-L13 |
| S2 | Owner cannot contest a pause without editing; a close has no route back | W14-L17 (product / legal decision; no code change) |
| S3 | Runbook step 2 omits effects on workers (informational count may drop, no notice, decline / leave / terminate unaffected) | Fix cycle 1 docs |
| S4 | Docs say lookups record "first"; code reads first in the same transaction | Fix cycle 1 docs (with N8) |
| S5 | `relationshipsIntro` says the person sees the lookup; counterpart workers in an owner lookup do not | Fix cycle 1 copy; W14-L15 |
| S6 | D-50..D-58 not yet in DECISIONS.md | RECORD |

## Legal flags
W14-L1..L12 (plan) plus W14-L13..L17 (compliance, `LEGAL_FLAGS.md`), all OPEN; RECORD adds L13..L17 to the register.
