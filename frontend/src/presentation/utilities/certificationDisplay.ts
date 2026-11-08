import type {
  CertificationEffectiveStatus,
  CertificationHistoryEntry,
  CertificationReviewStatus,
  CertificationStatusChange,
} from '../../domain/models/Certification'
import { isCertificationExpiringSoon } from '../../domain/utilities/certificationLifecycle'
import type { BadgeTone } from '../design/ui/Badge'

export interface CertificationStatusDisplay {
  readonly displayLabel: string
  readonly badgeTone: BadgeTone
}

const statusDisplayByEffectiveStatus: Readonly<Record<CertificationEffectiveStatus, CertificationStatusDisplay>> = {
  active: { displayLabel: 'Active', badgeTone: 'success' },
  expired: { displayLabel: 'Expired', badgeTone: 'neutral' },
  suspended: { displayLabel: 'Suspended', badgeTone: 'warning' },
  revoked: { displayLabel: 'Revoked', badgeTone: 'danger' },
  superseded: { displayLabel: 'Renewed', badgeTone: 'info' },
}

const expiresSoonDisplay: CertificationStatusDisplay = { displayLabel: 'Expires soon', badgeTone: 'warning' }

/** Label from the SERVER effective status; "Expires soon" only adds a window on the server expires_at. */
export function describeCertificationStatus(
  certification: { readonly effectiveStatus: CertificationEffectiveStatus; readonly expiresAt: string },
  currentInstant: Date,
): CertificationStatusDisplay {
  if (isCertificationExpiringSoon(certification, currentInstant)) {
    return expiresSoonDisplay
  }
  return statusDisplayByEffectiveStatus[certification.effectiveStatus]
}

/** Calendar date of a stored timestamp, in the reader's locale. Unparseable input is shown as stored. */
export function formatCertificationDate(rawTimestamp: string): string {
  const parsedDate = new Date(rawTimestamp)
  if (Number.isNaN(parsedDate.getTime())) {
    return rawTimestamp
  }
  return parsedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function describeExpiryLine(effectiveStatus: CertificationEffectiveStatus, expiresAt: string): string {
  return effectiveStatus === 'expired'
    ? `Expired ${formatCertificationDate(expiresAt)}`
    : `Expires ${formatCertificationDate(expiresAt)}`
}

export interface StatusChangeCopy {
  readonly buttonLabel: string
  readonly title: string
  readonly message: string
  readonly confirmButtonLabel: string
  readonly successMessage: string
  readonly isDestructive: boolean
}

export const statusChangeCopy: Readonly<Record<CertificationStatusChange, StatusChangeCopy>> = {
  suspend: {
    buttonLabel: 'Suspend',
    title: 'Suspend this certificate?',
    message:
      'It stops counting as current until you reinstate it. The worker is told and sees your reason, and can ask for a review within 30 days.',
    confirmButtonLabel: 'Suspend certificate',
    successMessage: 'Certificate suspended.',
    isDestructive: true,
  },
  revoke: {
    buttonLabel: 'Revoke',
    title: 'Revoke this certificate?',
    message:
      'Revocation is final unless the worker asks for a review within 30 days and you reinstate it. The worker is told and sees your reason.',
    confirmButtonLabel: 'Revoke certificate',
    successMessage: 'Certificate revoked.',
    isDestructive: true,
  },
  reinstate: {
    buttonLabel: 'Reinstate',
    title: 'Reinstate this certificate?',
    message:
      'It becomes active again with its original expiry date (it may already be expired). The worker is told and sees your reason.',
    confirmButtonLabel: 'Reinstate certificate',
    successMessage: 'Certificate reinstated.',
    isDestructive: false,
  },
}

const historyEventLabels: Readonly<Partial<Record<string, string>>> = {
  issued: 'Issued',
  renewed: 'Issued as a renewal',
  suspended: 'Suspended',
  revoked: 'Revoked',
  reinstated: 'Reinstated',
  superseded: 'Renewed (replaced by a new certificate)',
  review_upheld: 'Review decided: decision upheld',
}

const reviewStatusLabels: Readonly<Record<CertificationReviewStatus, string>> = {
  open: 'Review requested (open)',
  reinstated: 'Review decided: reinstated',
  upheld: 'Review decided: upheld',
  withdrawn: 'Review request withdrawn',
}

export function describeHistoryEntryTitle(historyEntry: CertificationHistoryEntry): string {
  if (historyEntry.entryKind === 'review_request') {
    return historyEntry.reviewStatus === null ? 'Review request' : reviewStatusLabels[historyEntry.reviewStatus]
  }
  return historyEventLabels[historyEntry.event ?? ''] ?? 'Status change'
}

export function describeShopVerificationAtIssue(shopVerificationStatusAtIssue: string, shopVerifiedAtAtIssue: string | null): string {
  if (shopVerificationStatusAtIssue !== 'approved') {
    return 'Shop verification at issue: not recorded'
  }
  return shopVerifiedAtAtIssue === null
    ? 'The shop was verified on WashLink when this was issued.'
    : `The shop was verified on WashLink when this was issued (verified ${formatCertificationDate(shopVerifiedAtAtIssue)}).`
}
