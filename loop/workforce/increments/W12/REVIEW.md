# W12 - REVIEW (2026-10-30)

Security (`workforce-security-reviewer`) and compliance (`workforce-compliance-reviewer`) ran read-only in parallel on the
uncommitted W12 work over 8c84bf8. Recorded by the orchestrator. **No BLOCKING findings from either reviewer.**

W12 is uncommitted and several items are operational risks for the scheduled jobs, so the orchestrator ran **fix cycle 1**
for the items marked below before VERIFY.

## Security

| ID | Class | Finding | Route |
|---|---|---|---|
| S1 | should-fix | Privacy marker sweep does not cover scheduler-written notices (W9 `expired`, W7 `certification.expiring` / `.expired`) or several older producers | Fix cycle 1 (with C5) |
| N1 | note | D2 repeat-key registry skip is safe (W3 unique pair, read_at-only updates, `_safely` wrapper) | No change |
| N2 | note | Job-state guard accepts the runner flag without `trusted` | Fix cycle 1 (defence in depth) |
| N3 | note | Batch row-locks before the pair try-lock; a skipped row stays locked until commit, so a worker action can wait up to one batch; `lock_timeout` 5s | Fix cycle 1 (try-lock before row lock, lower `lock_timeout`, document the bound) |
| N4 | note | Liveness: one failing contract / pair aborts the whole run every time (only `lock_not_available` is caught; refresh has no subtransaction), stalling the backlog | Fix cycle 1 (per-item catch, counted as skipped, SQLSTATE only) |
| N5 | note | Production runtime identity (postgres, no JWT) is correct; no client path takes a date | No change |
| N6 | note | Unregister by name fails for jobs owned by another role; register under a different role duplicates | Fix cycle 1 (unschedule by jobid; header "run as postgres") |
| N7 | note | Realtime FOR ALL TABLES now raises (W3 only noticed) | Fix cycle 1 docs (D-10 pre-apply check of `puballtables`) |
| N8 | note | Exported `buildNotificationKeysetFilter` does not validate on its own | Fix cycle 1 |
| N9 | note | Local dblink default credential string in the test helper | Fix cycle 1 (label LOCAL DEFAULT) |

## Compliance

| ID | Class | Finding | Route |
|---|---|---|---|
| C1 | should-fix | Scheduled-jobs card shows "Enabled" before any cron registration; the not-running warning only appears when every job never ran | Fix cycle 1 (per-job "not run recently" state; badge wording) |
| C2 | should-fix | W9 contract expiry notice "has expired" reads as a legal fact; W12 activates it, possibly late from backlog | W13 (changing it replaces a committed W9 producer, which W12 AC10 forbids); W12-L9 |
| C3 | should-fix | Register W12-L3 says "30 days before"; the code notifies within 30 days on the first run in the window | Fix cycle 1 docs |
| C4 | should-fix | Three privacy assertions share one name; the coverage check is misnamed | Fix cycle 1 |
| C5 | should-fix | Privacy sweep misses scheduled certificate-expiry and amendment-proposal notices | Fix cycle 1 (with S1) |

Verified sound: spec I notification coverage (no required event missing); D-59 / D-60 / D-69 acceptable (residuals W12-L5,
L12); scheduling disclosure and HUMAN-RUN runbook; in-app only (CHECK + guard); no private text in bodies; J16 / free training
unaffected; no legal-validity claims; keyset cursor validated and RLS-bounded.

## Legal flags
W12-L1..L8 (plan) plus W12-L9..L12 (compliance), all OPEN; RECORD adds L9..L12 to the register.
