# W6 - Training - LEGAL FLAGS

Written by the compliance REVIEW step (2026-10-26). These are items for review by a qualified
Philippine labor-law professional (data-privacy items also by a qualified data-privacy
professional). Nothing here says that anything is or is not legally compliant. Status of every
item: OPEN. W6-L1..L10 are already in `docs/workforce/LEGAL_REVIEW_REGISTER.md`. W6-L11..L13 are
new and must be added there (REVIEW may write only this file).

## New items

| ID | Item | Where |
|---|---|---|
| W6-L11 | Owner free text can contradict the free-training rule. `terms` (up to 4000 chars), `training_pay_details` and `reimbursement_details` may state a fee, deposit, materials or uniform charge, a training bond, a repayment-if-you-leave clause or a future pay deduction. Nothing detects or flags this (spec D: "Flag any proposed training arrangement or contract terms requiring legal review"). The text is then snapshotted and shown to the worker as "Agreed training terms" they accepted. Review whether such clauses must be blocked or flagged, and whether calling the snapshot "agreed terms" is appropriate. | w6b `training_programs.terms` (line 23, 43), pay/reimbursement details; w6c `training_enrollment_terms_snapshot`; `frontend/src/presentation/components/worker/training/MyTrainingProgress.tsx:58`; `frontend/src/presentation/utilities/trainingNoticeCopy.ts:21-22` |
| W6-L12 | The copy "Training is not paid work." is shown next to optional training pay (D-7). A worker may read it as "training is unpaid", and it may conflict with how compensation for training time has to be treated. Review the wording together with W6-L1 and W6-L3. | `frontend/src/presentation/utilities/trainingNoticeCopy.ts:35-36`; `frontend/src/presentation/components/training/TrainingNotices.tsx:34` |
| W6-L13 | Fair process for training records. The worker cannot confirm or dispute attendance or an assessment, and cannot ask for a correction. A fail needs no reason (the assessor comment is optional). The worker sees only "n of m checklist items met", not which items were not met. The owner or a trainer can later correct a day to absent, which removes a completion, without the worker's input (the worker is only notified). This adds to W6-L6. Review it before W7 certification relies on these records. | w6d `training_assessments.assessor_comment`; w6g `correct_training_attendance`, `correct_training_assessment`; `frontend/src/presentation/components/training/TrainingEvidenceHistory.tsx:20-22`; `frontend/src/presentation/components/training/AssessmentSignOffModal.tsx:116-121` |
