import {
  certificationLimits,
  type CertificationEffectiveStatus,
  type CertificationStatus,
  type CertificationStatusChange,
  type MyCertification,
  type OwnerCertification,
} from '../models/Certification'
import { toManilaCalendarDate } from './jobOpeningLifecycle'

/**
 * Who may do what to a certificate, mirroring the W7f transition table. Every input is a
 * SERVER value (stored status, effective status, window flags); the app never computes
 * expiry. The database re-checks everything and stays the authority.
 */

export type OwnerCertificationAction =
  | CertificationStatusChange
  | 'record_reassessment'
  | 'renew'
  | 'decide_review'

export const certificationStatusChangeTarget: Readonly<Record<CertificationStatusChange, CertificationStatus>> = {
  suspend: 'suspended',
  revoke: 'revoked',
  reinstate: 'active',
}

const millisecondsPerDay = 86_400_000

/** Whole Manila calendar days from `calendarDate` (YYYY-MM-DD) to today. */
function daysSinceManilaDate(calendarDate: string, currentInstant: Date): number {
  const todayValue = Date.parse(`${toManilaCalendarDate(currentInstant)}T00:00:00Z`)
  const dateValue = Date.parse(`${calendarDate}T00:00:00Z`)
  return Math.round((todayValue - dateValue) / millisecondsPerDay)
}

/** Renew needs the latest re-assessment passed, unused and recorded within the last 30 days. */
export function canRenewCertification(certification: OwnerCertification, currentInstant: Date): boolean {
  if (
    certification.status !== 'active' ||
    !certification.isRenewalWindowOpen ||
    certification.latestReassessmentId === null ||
    certification.latestReassessmentResult !== 'passed' ||
    certification.isLatestReassessmentUsed ||
    certification.latestReassessmentAssessedOn === null
  ) {
    return false
  }
  const daysSinceAssessment = daysSinceManilaDate(certification.latestReassessmentAssessedOn, currentInstant)
  return daysSinceAssessment >= 0 && daysSinceAssessment <= certificationLimits.reassessmentUsableDays
}

/** Actions the current owner of the issuing shop is offered for one certificate. */
export function ownerCertificationActions(
  certification: OwnerCertification,
  currentInstant: Date,
): readonly OwnerCertificationAction[] {
  const actions: OwnerCertificationAction[] = []
  if (certification.openReviewRequestId !== null) {
    actions.push('decide_review')
  }
  if (certification.status === 'active' && certification.effectiveStatus === 'active') {
    actions.push('suspend')
  }
  if (certification.status === 'suspended' && certification.openReviewRequestId === null) {
    actions.push('reinstate')
  }
  if (certification.status === 'active' || certification.status === 'suspended') {
    actions.push('revoke')
  }
  if (certification.status === 'active' && certification.isRenewalWindowOpen) {
    actions.push('record_reassessment')
  }
  if (canRenewCertification(certification, currentInstant)) {
    actions.push('renew')
  }
  return actions
}

/** D-21: a review is offered while suspended / revoked, none is open, fewer than 3 used, inside 30 days. */
export function canRequestCertificationReview(certification: MyCertification, currentInstant: Date): boolean {
  if (certification.status !== 'suspended' && certification.status !== 'revoked') {
    return false
  }
  if (certification.openReviewRequestId !== null || certification.reviewRequestsUsed >= certificationLimits.reviewRequestsMaximum) {
    return false
  }
  if (certification.reviewWindowEndsAt === null) {
    return false
  }
  return currentInstant.getTime() < Date.parse(certification.reviewWindowEndsAt)
}

/** D-20: the worker holds a current certificate when any row is effectively active. */
export function holdsCurrentCertification(certifications: readonly Pick<MyCertification, 'effectiveStatus'>[]): boolean {
  return certifications.some((certification) => certification.effectiveStatus === 'active')
}

/** "Expires soon": effectively active and the server expires_at is at most 30 days away. */
export function isCertificationExpiringSoon(
  certification: { readonly effectiveStatus: string; readonly expiresAt: string },
  currentInstant: Date,
): boolean {
  if (certification.effectiveStatus !== 'active') {
    return false
  }
  const remainingMilliseconds = Date.parse(certification.expiresAt) - currentInstant.getTime()
  return remainingMilliseconds <= certificationLimits.expiresSoonDays * millisecondsPerDay
}

/** Renew and reinstate need a verified issuing shop (J3); suspend, revoke and an uphold decision do not. */
const actionsNeedingVerifiedShop: readonly OwnerCertificationAction[] = ['renew', 'reinstate']

export function ownerCertificationActionsForShop(
  certification: OwnerCertification,
  isShopVerified: boolean,
  currentInstant: Date,
): readonly OwnerCertificationAction[] {
  const actions = ownerCertificationActions(certification, currentInstant)
  return isShopVerified ? actions : actions.filter((action) => !actionsNeedingVerifiedShop.includes(action))
}

export type OwnerCertificationFilter = 'all' | 'open_review' | CertificationEffectiveStatus

export function matchesOwnerCertificationFilter(certification: OwnerCertification, filter: OwnerCertificationFilter): boolean {
  if (filter === 'all') {
    return true
  }
  if (filter === 'open_review') {
    return certification.openReviewRequestId !== null
  }
  return certification.effectiveStatus === filter
}
