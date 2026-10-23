# W0 - Legal-review flags (raised by REVIEW, 2026-10-24)

These items are for review by a qualified Philippine labor-law professional. The reviewer does not
state that anything is or is not legally compliant. Carry into `docs/workforce/LEGAL_REVIEW_REGISTER.md` (W13).

| ID | Source | Item for legal review |
|---|---|---|
| W0-L1 | SPEC F, DECISIONS D-3 (OPEN) | Operational and legal meaning of the "minimum three distinct owners" rule; whether it may be anything more than a progress metric; that it must never restrict declining, leaving or terminating. |
| W0-L2 | SPEC D, audit F6 (`workers` roster, `bookings.assigned_worker_id`) | Boundary between free supervised training and productive work: trainees must not be assignable to paid customer bookings during required training; need for any compensation/reimbursement treatment (D-7). |
| W0-L3 | SPEC E.4 | Worker relationship classification (employee vs other types); the template must not default to independent contractor. |
| W0-L4 | SPEC E, DECISIONS D-6 | Whether the draft-and-acceptance workflow without an e-signature provider is adequate evidence of consent; it must not be labelled an e-signature. |
| W0-L5 | SPEC D | Certificates are platform/shop-issued only; not to be represented as government-recognized unless verified. Validity/renewal rule (D-5). |
| W0-L6 | Audit `shop_verification_documents` (valid_government_id), SPEC A | Personal-data handling of identity documents and worker contact/profile data (retention, access, consent). |
| W0-L7 | Audit D-2 (`workers.user_id` link) | Linking a worker account to an owner roster should require the worker's consent; a roster row must not imply an employment or contract relationship. |
