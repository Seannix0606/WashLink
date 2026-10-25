# W5 - Marketplace & applications - LEGAL FLAGS

Written by the compliance REVIEW step (2026-10-25). These are items for review by a qualified
Philippine labor-law professional (data-privacy items also by a qualified data-privacy
professional). Nothing here says that anything is or is not legally compliant. Status of every
item: OPEN. W5-L1..L8 are already in `docs/workforce/LEGAL_REVIEW_REGISTER.md`. W5-L9..L11 are new
and must be added there (REVIEW may write only this file).

## From PLAN section 11 (already in the register)

| ID | Item | Where |
|---|---|---|
| W4-L10 | Recruitment and placement: whether a job marketplace with application handling counts as recruitment and placement (Labor Code Art. 13(b)), which would need DOLE registration or a license. Must be answered before production use of W5. | product-level |
| W5-L1 | Applicant name and worker profile shared with the owner while the application is submitted, under review, shortlisted or accepted: notice at apply, lawful basis (RA 10173), retention, account deletion. | w5d `applicant_profiles_for_job_opening`; `ApplyToOpeningModal.tsx:134-137` |
| W5-L2 | Meaning of `accepted`: the UI says "not a contract or a job guarantee". Whether an owner acceptance can still create obligations or expectations. | `jobApplicationDisplay.ts:13-14,86-93`; w5e:123 |
| W5-L3 | Free-training notice wording and the stored acknowledgement (`w5_v1`). The notice is a WashLink product rule, not legal advice. | `workforceNoticeCopy.ts:10-16` |
| W5-L4 | "Not selected" without recorded reasons; discrimination risk in owner decisions (RA 10911 and others). | w5c |
| W5-L5 | Certification-required openings accept applications while no certification records exist (D-12). | w5d; D-12 |
| W5-L6 | The cover note may carry sensitive personal data. There is guidance text only, no filter. | w5b `cover_note` |
| W5-L7 | No contact exchange (D-14); workers may still type contacts into the cover note. | D-14 |
| W5-L8 | Owner free text (fees, unpaid trials, waivers) is shown to workers verbatim and frozen in snapshots; publisher duties. | w5b snapshot; w5d search |

## New (REVIEW) - add to the register

| ID | Item | Where |
|---|---|---|
| W5-L9 | The notice tells workers that "A shop may not charge you a training fee or deduct one from your pay" and that training "is supervised learning, not productive work for customers". In W5 nothing enforces this: training records arrive in W6, and owner free text ("Required training", "Other terms") is shown next to the notice unchecked (W4-L3, W4-L8). A posting could contradict it. Review whether a platform statement of a rule it does not yet enforce is acceptable, how a contradicting posting should be handled, and whether the notice must also say that a shop may pay or reimburse training (spec D allows lawful compensation; D-7). | `workforceNoticeCopy.ts:12-13`; `MarketplaceOpeningDetail.tsx:79-98` |
| W5-L10 | Worker record of what they applied to: an owner can delete the shop (`SupabaseShopRepository.ts:231-240`) or their account, which cascades and deletes the worker's applications, accepted ones included, with their opening snapshots. The worker gets only "An application ended because the shop or its job opening was removed." Review whether the worker must keep (or be able to export) the snapshot of the terms they applied to and the decision history after the owner deletes the shop or account. This matters more once W9 links offers to accepted applications. | w5b FKs `on delete cascade`; w5e cascade notice |
| W5-L11 | D-12 warning "You have no verified certification on WashLink yet; the shop will see that." is shown to every worker, and owners see "Verified certifications: none yet" for every applicant, at a time when no worker can hold a WashLink certification (W7). Review whether this unfairly discourages applicants or disadvantages them in owner decisions, and whether the copy must say that certifications are not available on WashLink yet. The string becomes wrong for certified workers once W7 ships unless it is made conditional. | `workforceNoticeCopy.ts:23-24`; `ApplyToOpeningModal.tsx:110-118`; `ApplicantVerifiedCertificationsSection.tsx:41-47` |
