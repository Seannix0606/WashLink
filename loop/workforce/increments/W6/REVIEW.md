# W6 Review findings

Security: no BLOCKING. Compliance: no BLOCKING. Legal flags: W6-L1…L13 (register).

## Fixed in review polish (W6 migrations uncommitted, edited in place)
- Trainer authority: recorder lock takes the trainer's roster row FOR SHARE; designations auto-revoke on unlink/re-link (D-16), audited and notified.
- Shop-delete race with concurrent invites: programs locked FOR UPDATE before the check.
- Booking gate scoped to the booking shop owner's roster; fires after the W2 guard (`bookings_guard_update_training_gate`).
- Realtime preflight raises instead of NOTICE; "no trusted bypass" comment corrected (W6-L5, not tamper-proof).
- Completed/failed enrollments no longer count toward live limits; failed workers can leave; owners can cancel.
- Failed assessment requires a reason (DB CHECK 10..300 + UI); worker sees each checklist item met/not met.
- Copy: "Training is not productive work for customers"; owner warning on fee-like words in terms (non-blocking, no legal claim).
- Regression found and fixed: trainer-account deletion failed with 23503 after auto-revoke trigger.

## Carry-forward
- W7: completion can go backwards after attendance corrections; certification issue must re-check completion at issue time and snapshot evidence + shop verification (W2 R-4).
- Orphan programs (shop deleted, last enrollment gone) remain invisible; documented limitation.
- Super_admin can assign one owner's trainee to another owner's booking (outside the gate scope); W2 admin bypass, documented.
- Concurrency checked by reading lock order only; ROLLBACK blocks not executed; production parity (D-10 rows 29-32).
- Worker confirm/dispute process for records (W6-L13) → W13 limitations / legal review.
