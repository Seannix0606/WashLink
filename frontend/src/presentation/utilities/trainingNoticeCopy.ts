import { trainingEnrollmentNoticeVersion as enrollmentNoticeVersion } from '../../domain/models/TrainingEnrollment'
import { trainingOwnerAttestationVersion as ownerAttestationVersion } from '../../domain/models/TrainingProgram'

/**
 * The free-training notice (w6_v1) and the owner's free-training statement (w6_owner_v1).
 * WashLink product rules, not legal advice and not a compliance claim. Each text changes
 * only together with its version, which is what the acknowledgement is recorded against.
 */
export const trainingEnrollmentNoticeVersion = enrollmentNoticeVersion

export const trainingOwnerAttestationNoticeVersion = ownerAttestationVersion

export const trainingNoticeTitle = 'Free training notice'

export const trainingNoticeText =
  'WashLink rule: this required initial training is free for you. The shop may not charge you a training fee or deduct one from any pay. Training days and the assessment are supervised learning, not productive work: the shop may not assign you to customer bookings during this training. Any training pay or reimbursement below is as entered by the shop; WashLink does not verify it. Completion needs at least 3 attended training days and a passed assessment recorded by the shop owner or a designated trainer. Enrolling is not a contract or a job offer, and you may leave unfinished training at any time.'

export const trainingNoticeAcknowledgementLabel =
  'I have read the free training notice and the training details below.'

export const trainingSnapshotNotice =
  'When you accept, these details and dates are recorded with your enrollment as the agreed training terms.'

export const ownerAttestationTitle = 'Your free-training statement'

export const ownerAttestationText =
  'I confirm this required initial training is free for the worker: no training fee and no deduction from any pay. Trainees do supervised practice and assessment only; my shop will not assign them to customer bookings or use them in place of paid staff during the training. Any training pay or reimbursement shown is what my shop will provide.'

export const ownerAttestationCheckboxLabel = 'I confirm the statement above for this program.'

export const ownerAttestationFootnote =
  'This is your own confirmation, recorded by version. It is not a signature and not a WashLink compliance statement.'

/** Shown wherever training and paid work could be confused (C7). */
export const trainingVersusPaidWorkText =
  "Training is not productive work for customers. While your required training is unfinished, WashLink refuses requests by the training shop's owner to assign you to that owner's customer bookings through a roster entry that is or was linked to your account. This continues after a not-passed assessment or if the shop is removed, until the training is completed, is cancelled or you leave it; once the shop is removed, only leaving ends it. WashLink cannot detect a roster entry that was never linked to your account, or work arranged outside WashLink. Terms for any later customer work are agreed separately and are not part of this training."

/**
 * W15 fix cycle 1 (C-SF-1, W15-L2): the same distinction addressed to the shop, for owner and designated-trainer
 * views. States the rule and what WashLink refuses; trainee views keep `trainingVersusPaidWorkText` (D-81).
 */
export const shopTrainingVersusPaidWorkText =
  "Training is not productive work for customers. The training shop's owner may not assign trainees to that owner's customer bookings while their required training is unfinished. WashLink refuses such assignments through roster entries that are or were linked to the trainee's account. This continues after a not-passed assessment or a shop removal, until the training is completed, is cancelled or the trainee leaves. Terms for any later customer work are agreed separately and are not part of this training."

/** W16 fix cycle 1 (C-S1): the explanations are read in the progress window; "Leave training" is on the list behind it. */
export const leaveTrainingLocationText =
  'You can leave at any time: close this window and press "Leave training" on this training in your list.'

/**
 * W16 D-85 amendment: progress `failed` with the shop gone. No owner or trainer can correct or cancel any more
 * (`is_current_training_program_owner` and `is_authorised_training_recorder` need the shop), so only leaving ends it.
 */
export const failedAfterShopRemovedExplanation = `Your assessment is recorded as not passed and the shop is no longer on WashLink. This training stays open until you leave it. While it stays open, WashLink refuses this owner's requests to assign you to their customer bookings through a linked roster entry. ${leaveTrainingLocationText}`

/** W16 fix cycle 1 (C-S2): plain facts about what leaving changes; the worker reads them before confirming. */
export const leaveTrainingConfirmationText =
  "Your training ends unfinished. Your records stay visible to you. This cannot be undone; the shop would need to invite you again. This training's owner may then be able to assign you to their customer bookings. If a not-passed assessment is recorded, it can no longer be corrected once you leave. A new invitation starts again at 0 attended days."

export const enrollmentIsNotContractText =
  'An invitation or an accepted enrollment is not a contract, a job offer or a certification.'

export const assessmentDecisionNotice =
  'This records your assessment decision. It is not a certificate or a signature.'

export const evidenceAppendOnlyNotice =
  'Records are never edited or deleted. A correction is added as a new record with a reason, and the earlier record stays visible.'
