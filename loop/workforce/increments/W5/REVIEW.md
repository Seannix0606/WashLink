# W5 Review findings

## Initial review
- Security BLOCKING S-B1: auto-close turned drafts into `closed`, so owners could read never-sent drafts and cover notes → FIXED in fix cycle 1 (every owner path requires `submitted_at is not null` and the current shop owner; closed drafts are worker-only and unsendable).
- Compliance: no BLOCKING. Fixed: Apply always shows qualifications and required training first (spec C); training notice mentions optional pay/reimbursement (D-7); D-12 certification copy says certifications are not available yet; register updated with W5-L9…L11.
- Security non-blocking fixed: `worker_has_applied` uses submitted_at; per-opening advisory lock for the 500 cap; current-owner check (`is_current_job_opening_owner`); D-10 row 27 (production `profiles.full_name` must hold no email/phone).

## Re-review: no BLOCKING
- Fixed: lock order opening → application (deadlock with close/auto-close); notifications go to the current shop owner only when it matches the application owner; D-10 row 28 records the deliberate applicant widening of `jo_select_published_for_workers`.

## Carry-forward
- W5-L10 → W9: deleting a shop or owner account must not delete accepted applications' snapshots or contract records (recorded in PLAN.md W9).
- W7: supply the real verified-certification state to `describeWorkerCertificationWarning` / owner copy; decide enforcement of certification-required openings (D-12).
- Notice text changed without a version bump (`w5_v1`; no acknowledgements exist yet). Any future wording change must bump the version.
- Lock ordering is checked by function-body tests, not by two live sessions.
