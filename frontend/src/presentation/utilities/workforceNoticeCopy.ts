import { jobApplicationNoticeVersion } from '../../domain/models/JobApplication'
import type { WorkerVerifiedCertificationState } from '../../domain/models/VerifiedCertification'

/**
 * The training and work notice (C7). A WashLink product rule, not legal advice and not a
 * compliance claim. The text and the version change together: the version is what the
 * worker's acknowledgement is recorded against (notice_version).
 */
export const applicationNoticeVersion = jobApplicationNoticeVersion

export const trainingAndWorkNoticeTitle = 'Training and paid work are different'

export const trainingAndWorkNoticeText =
  'WashLink rule: required initial training for a shop certification lasts at least 3 days and is free for you. A shop may not charge you a training fee or deduct one from your pay. Training and assessment are supervised learning, not productive work for customers. A shop may still choose to offer pay or reimbursement for training; check the opening or ask the shop. Applying does not enroll you in training, and an accepted application is not a contract.'

export const trainingAndWorkNoticeAcknowledgementLabel =
  'I have read the training and work notice above.'

export const contactsNotSharedNotice = 'Your phone and email are not shared with the shop.'

export const coverNoteGuidanceText =
  'Optional. Do not include ID numbers, health details or contact details.'

export const certificationsNotAvailableYetWarning =
  'WashLink certifications are not available yet, so shops will not see any verified certifications for any applicant.'

export const noVerifiedCertificationWarning =
  'You have no verified WashLink certification yet; the shop will see that.'

/**
 * The certification note for a certification-required opening, or null when there is nothing
 * to warn about. W7 supplies the real state; until then the workflow is unavailable.
 */
export function describeWorkerCertificationWarning(
  certificationState: WorkerVerifiedCertificationState,
): string | null {
  if (!certificationState.isWorkflowAvailable) {
    return certificationsNotAvailableYetWarning
  }
  return certificationState.hasVerifiedCertifications ? null : noVerifiedCertificationWarning
}
