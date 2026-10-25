# W4 Review findings

Security: no BLOCKING. Compliance: no BLOCKING. Legal flags: `LEGAL_FLAGS.md` (W4-L1…L11).
Note: w4a–w4d were committed mid-build in 47b5d55 (user "save whatever is done"); any DB fix is a new migration.

## Fixed before verify (frontend, uncommitted)
- Owner list could silently truncate at 200 (multi-shop owners): archived excluded + truncation notice.
- "At least 1 years" pluralisation.
- Owner helper text discouraging discriminatory requirements (no legal-compliance claim).

## Carry-forward (NON-BLOCKING, routed)
- C-W4-1 → W5: snapshot opening at application time; refuse applications after deadline (recorded in PLAN.md W5).
- C7 → W5/W6: free-training notice and training-vs-paid-work distinction before workers see openings; free-text terms could advertise unpaid trials/fees (W4-L8).
- J3 certification half → W7 (recorded in PLAN.md W7).
- D-10 rows 21–23: before production, count approved shops with NULL review columns; backfill via trusted session (new migration) or runbook "re-verify after reviewer deletion" (W13 docs).
- New migration later (low): revoke `job_opening_missing_publish_fields` from authenticated; include `changed_fields` in trusted-session status_changed audit payloads.
- Moderation/reporting of discriminatory postings → W11 (admin queues).
- W4-L10 (DOLE recruitment registration) → legal register before W5 production use.
