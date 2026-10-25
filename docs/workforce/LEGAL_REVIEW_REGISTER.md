# Legal review register (first version, W5)

Consolidated register of every legal-review flag raised by the workforce loop in W0-W5
(`loop/workforce/increments/*/LEGAL_FLAGS.md` and W5 PLAN section 11). Every item is **OPEN**
and is for review by a qualified Philippine labor-law professional (data-privacy items also by a
qualified data-privacy professional). The loop cannot resolve any of them.

This register makes no compliance claim. Nothing in WashLink's code, UI copy or docs states that
any feature is legally compliant, and no item here may be read as advice. Production use of the
features named in an item requires that review first. W13 completes this register (final
sources, owners, decisions); items are never deleted, only given a recorded outcome by a human.

Status key: OPEN = not reviewed. Source paths are relative to the repository root.

## W0 (baseline review)

| ID | Status | Item for review | Source |
|---|---|---|---|
| W0-L1 | OPEN | Operational and legal meaning of the "minimum three distinct owners" rule; whether it may be anything more than a progress metric; it must never restrict declining, leaving or terminating. | SPEC F, DECISIONS D-3 |
| W0-L2 | OPEN | Boundary between free supervised training and productive work: trainees must not be assignable to paid customer bookings during required training; any compensation / reimbursement treatment (D-7). | SPEC D; `workers`, `bookings.assigned_worker_id` |
| W0-L3 | OPEN | Worker relationship classification (employee vs other types); the template must not default to independent contractor. | SPEC E.4 |
| W0-L4 | OPEN | Whether the draft-and-acceptance workflow without an e-signature provider is adequate evidence of consent; it must not be labelled an e-signature. | SPEC E, D-6 |
| W0-L5 | OPEN | Certificates are platform / shop-issued only; never represented as government-recognized unless verified. Validity and renewal rule (D-5). | SPEC D |
| W0-L6 | OPEN | Personal-data handling of identity documents and worker contact / profile data (retention, access, consent). | `shop_verification_documents`, SPEC A |
| W0-L7 | OPEN | Linking a worker account to an owner roster should require the worker's consent; a roster row must not imply an employment or contract relationship. | D-2 (`workers.user_id`) |

## W2 (roles, worker profiles, roster links)

| ID | Status | Item for review | Source |
|---|---|---|---|
| W2-L1 | OPEN | Collection of worker profile data and private contacts: privacy notice and lawful basis at collection; super admins can read profiles; W5 now shows profiles to owners of applied-to openings (fresh notice before widening); retention and deletion; the claim that staff cannot view contacts (DB operators / service role can). | `2026_10_24_w2f_worker_profiles.sql`; `workerProfileDisplay.ts` |
| W2-L2 | OPEN | Roster-link consent wording: telling the worker the link "is not ... an employment relationship" may be a characterisation the platform cannot make; review neutral wording, disclosure that the link enables paid booking assignment, and that a roster link never counts toward the three-owner metric. | `rosterLinkResultDisplay.ts`; `WorkerRosterLinksPanel.tsx`; w2d |
| W2-L3 | OPEN | Shop re-verification and identity documents: only name / address edits trigger re-review; shops approved before W2 keep "approved"; what "verified shop" may be represented as to workers; retention and access for ID documents; re-verification after ownership or identity changes. | w2b; D-10 row 8 |
| W2-L4 | OPEN | Deleting a reviewing super admin nulls `verification_reviewed_by`, so the shop stops being verified and the approver is lost from the row: later loss of verification must not void issued certifications or accepted contracts (snapshot at issue); worker notice; approver retention; "deactivate, do not delete" is only a documented procedure. | w2b; P9 |
| W2-L5 | OPEN | Profile visibility copy promised future owner access. W5 makes it real (owners of openings the worker applied to, while the application is submitted, under review, shortlisted or accepted). Review whether the updated copy and the apply-time notice are enough, or whether fresh consent is needed; DB operators / service role can still read the data. | `workerProfileDisplay.ts`; W5 D-13 |

## W3 (audit trail, notifications)

| ID | Status | Item for review | Source |
|---|---|---|---|
| W3-L1 | OPEN | Retention of audit rows (RA 10173): pseudonymous ids and role snapshots kept after account deletion; no retention period defined; manual purge path; disclosure in the privacy notice; access / erasure requests against an append-only table; export before purge. Notifications cascade-delete with the recipient. | w3b; `AUDIT_AND_NOTIFICATIONS.md` |
| W3-L2 | OPEN | Notification content and channels before W12 adds email / SMS / push: consent per channel, minimum content, never contract text, pay terms or contact data externally. Roster unlink wording after an owner account closes (now neutral text). | w3c, w3d |
| W3-L3 | OPEN | The audit trail is an internal operational log, not tamper-proof or certified; never presented as legal evidence or an e-signature record. Record-keeping standard for training attendance, assessment, certification and contract evidence (W6-W10). | w3b; `AUDIT_AND_NOTIFICATIONS.md` |
| W3-L4 | OPEN | Loss of shop verification is logged but not snapshotted into certifications or contracts and workers are not told. Review in W7 / W10. | w3d; W2-L4 |
| W3-L5 | OPEN | Which value is the authoritative approver record (`shops.verification_reviewed_by` payload vs server-derived `actor_id`) before it is used as approval evidence for certifications (W7). They differ only for trusted-session decisions. | w3d |

## W4 (owner job openings)

| ID | Status | Item for review | Source |
|---|---|---|---|
| W4-L1 | OPEN | Pay, benefits, schedule and terms are owner-typed and shown as entered, unchecked against wage orders or labor standards (e.g. below the regional minimum wage). Extra disclosures or validation; adequacy of "Details as entered by the shop. WashLink does not verify pay or employment terms." | `jobOpeningDisplay.ts`; w4c |
| W4-L2 | OPEN | `job_type` is a schedule category only, never an employment classification; whether "Temporary" or "Other" could suggest one. | `jobOpeningDisplay.ts`; `JobOpeningBasicsSection.tsx` |
| W4-L3 | OPEN | `trainees_welcome` and "Required training" must not advertise unpaid work as training or a training fee. W5 adds the WashLink free-training notice before openings and before applying (W5-L3). | `JobOpeningRequirementsSection.tsx`; `JobOpeningPreview.tsx` |
| W4-L4 | OPEN | Free-text requirements are not filtered for discriminatory content (e.g. age preference, RA 10911); moderation and notice duties. | `JobOpeningRequirementsSection.tsx`; `JobOpeningBasicsSection.tsx` |
| W4-L5 | OPEN | "Shop-issued certification required" means shop-issued only, never government-recognized; whether such a hiring requirement is acceptable. | `jobOpeningDisplay.ts` |
| W4-L6 | OPEN | Retention of deleted drafts, archived openings and their audit rows (with W3-L1). | w4d |
| W4-L7 | OPEN | Discriminatory requirements other than age (sex, civil status, pregnancy, disability, religion, ethnicity, appearance, height) and whether a lawful minimum age for hazardous work is an allowed exception and how to state it; owner helper text and moderation (W11). | same fields as W4-L4 |
| W4-L8 | OPEN | "Other terms", "Benefits" and pay details shown verbatim could contain waivers of mandatory rights, unpaid trial periods, deposits, fees or training-fee terms; blocked terms or flagging; platform exposure from verbatim display. | `JobOpeningPayAndTermsSection.tsx`; `JobOpeningPreview.tsx` |
| W4-L9 | OPEN | Publisher role: the age-advertising prohibition (RA 10911) also covers publishing job notices; WashLink's duties as the party that publishes owner postings. | `jo_select_published_for_workers` (w4c, w5b) |
| W4-L10 | OPEN | Recruitment and placement: whether running a job-posting and application marketplace counts as recruitment and placement activity, which includes advertising for employment (Labor Code Art. 13(b)), and so needs DOLE registration or a license. W5 opens applications locally; this must be answered before production use of W5. | product-level; W5 |
| W4-L11 | OPEN | Pay periods `per_task` and `hour`, and "From PHP X" when only a minimum is entered: whether piece-rate or open-ended pay statements need extra disclosure. | `jobOpeningDisplay.ts` |

## W5 (marketplace and applications)

| ID | Status | Item for review | Source |
|---|---|---|---|
| W5-L1 | OPEN | Applicant data (full name and worker profile) shared with the owner of an applied-to opening while the application is submitted, under review, shortlisted or accepted: notice at apply, lawful basis (RA 10173), retention of applications and opening snapshots, and what happens on account deletion (rows cascade; audit rows stay). | w5b, w5d `applicant_profiles_for_job_opening`; D-13 |
| W5-L2 | OPEN | Meaning of `accepted`: the copy says it is not a contract or a job guarantee; whether an owner acceptance can still create obligations or expectations. | w5c; w5e owner-decision notification ("This is not a contract."); `frontend/src/presentation/utilities/jobApplicationDisplay.ts` (accepted label and explanation) |
| W5-L3 | OPEN | Free-training notice wording and the stored acknowledgement (`notice_version = 'w5_v1'`): a WashLink product rule shown to workers, not legal advice; W6 records the actual training terms. | w5c `job_application_notice_version`; `frontend/src/presentation/utilities/workforceNoticeCopy.ts` (notice text); `frontend/src/presentation/components/worker/marketplace/TrainingAndWorkNotice.tsx`; `frontend/src/presentation/components/worker/marketplace/ApplyToOpeningModal.tsx` (acknowledgement) |
| W5-L4 | OPEN | Rejection ("Not selected") without recorded reasons; discrimination risk in owner decisions (RA 10911 and others); whether reasons or records are required. | w5c |
| W5-L5 | OPEN | Certification-required openings accept applications while no certification records exist (D-12); fairness of showing "No verified certification on record" to owners. | w5d `applicant_verified_certifications`; D-12 |
| W5-L6 | OPEN | The optional cover note may carry sensitive personal data; there is guidance text only, no filter. | w5b `cover_note` |
| W5-L7 | OPEN | No contact exchange between owner and applicant (D-14); workers may still type contacts into the cover note; whether the platform must mediate communication or offer a controlled channel. | D-14 |
| W5-L8 | OPEN | Owner free text (W4-L8: terms, fees, unpaid trials) is now shown to every worker verbatim and frozen permanently in application snapshots (P20); publisher duties (W4-L9) and takedown limits (a snapshot can only be removed with its application row). | w5b snapshot; w5d search |
| W5-L9 | OPEN | The notice tells workers that "A shop may not charge you a training fee or deduct one from your pay" and that training "is supervised learning, not productive work for customers". In W5 nothing enforces this: training records arrive in W6, and owner free text ("Required training", "Other terms") is shown next to the notice unchecked (W4-L3, W4-L8). A posting could contradict it. Review whether a platform statement of a rule it does not yet enforce is acceptable, how a contradicting posting should be handled, and whether the notice must also say that a shop may pay or reimburse training (spec D allows lawful compensation; D-7). | `frontend/src/presentation/utilities/workforceNoticeCopy.ts`; `frontend/src/presentation/components/worker/marketplace/MarketplaceOpeningDetail.tsx` (W5 LEGAL_FLAGS) |
| W5-L10 | OPEN | Worker record of what they applied to: an owner can delete the shop (`SupabaseShopRepository.ts`) or their account, which cascades and deletes the worker's applications, accepted ones included, with their opening snapshots. The worker gets only "An application ended because the shop or its job opening was removed." Review whether the worker must keep (or be able to export) the snapshot of the terms they applied to and the decision history after the owner deletes the shop or account. This matters more once W9 links offers to accepted applications. | w5b FKs `on delete cascade`; w5e cascade notice (W5 LEGAL_FLAGS) |
| W5-L11 | OPEN | D-12 warning "You have no verified certification on WashLink yet; the shop will see that." is shown to every worker, and owners see "Verified certifications: none yet" for every applicant, at a time when no worker can hold a WashLink certification (W7). Review whether this unfairly discourages applicants or disadvantages them in owner decisions, and whether the copy must say that certifications are not available on WashLink yet. The string becomes wrong for certified workers once W7 ships unless it is made conditional. | `frontend/src/presentation/utilities/workforceNoticeCopy.ts`; `frontend/src/presentation/components/worker/marketplace/ApplyToOpeningModal.tsx`; `frontend/src/presentation/components/owner/applicants/ApplicantVerifiedCertificationsSection.tsx` (W5 LEGAL_FLAGS) |
