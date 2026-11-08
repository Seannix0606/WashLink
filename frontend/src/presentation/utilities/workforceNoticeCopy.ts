import { jobApplicationNoticeVersion } from '../../domain/models/JobApplication'
import type { JobOpeningApplicantRequirement } from '../../domain/models/JobOpening'
import type { WorkerVerifiedCertificationState } from '../../domain/models/VerifiedCertification'
import {
  certificationRequiredApplyBlockedText,
  certificationStateLoadingText,
  certificationStateUnavailableText,
} from './certificationCopy'

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

/**
 * The certification note for a certification-required opening, from the worker's real
 * my_certifications state (D-20), or null when the worker holds a current certificate.
 */
export function describeWorkerCertificationWarning(
  certificationState: WorkerVerifiedCertificationState,
): string | null {
  if (certificationState.kind === 'loading') {
    return certificationStateLoadingText
  }
  if (certificationState.kind === 'unavailable') {
    return certificationStateUnavailableText
  }
  return certificationState.hasCurrentCertification ? null : certificationRequiredApplyBlockedText
}

/**
 * D-20: Apply stays disabled for a certification-required opening while the worker's state
 * is loading or known to hold no current certificate. If the state could not be read the
 * database still refuses the application, so Apply is not blocked on a read failure.
 */
export function isApplyBlockedByCertification(
  applicantRequirement: JobOpeningApplicantRequirement | null,
  certificationState: WorkerVerifiedCertificationState,
): boolean {
  if (applicantRequirement !== 'certification_required') {
    return false
  }
  return (
    certificationState.kind === 'loading' ||
    (certificationState.kind === 'loaded' && !certificationState.hasCurrentCertification)
  )
}
