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
  'Training is not productive work for customers. Trainees cannot be assigned to customer bookings while their required training is unfinished. Terms for any later customer work are agreed separately and are not part of this training.'

export const enrollmentIsNotContractText =
  'An invitation or an accepted enrollment is not a contract, a job offer or a certification.'

export const assessmentDecisionNotice =
  'This records your assessment decision. It is not a certificate or a signature.'

export const evidenceAppendOnlyNotice =
  'Records are never edited or deleted. A correction is added as a new record with a reason, and the earlier record stays visible.'
