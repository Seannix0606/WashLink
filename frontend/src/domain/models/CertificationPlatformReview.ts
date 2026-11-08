import type { CertificationStatus } from './Certification'

/**
 * W11 WashLink review of a shop's suspension or revocation (P66, P67, D-44, D-45).
 * Opened only by the certificate's worker; decided only by a platform administrator, shown as
 * "WashLink review" and never with the administrator's name. It can only reinstate or keep the
 * shop's decision; the shop stays the issuer of the certificate.
 */

export const platformReviewBases = ['upheld_by_shop', 'shop_decision_overdue', 'issuer_unavailable', 'resuspended_after_shop_resolution'] as const

export type PlatformReviewBasis = (typeof platformReviewBases)[number]

export const platformReviewStatuses = ['open', 'reinstated', 'upheld', 'withdrawn', 'resolved_by_shop'] as const

export type PlatformReviewStatus = (typeof platformReviewStatuses)[number]

export type PlatformReviewDecision = 'reinstate' | 'uphold'

/** Mirrors the W11 CHECKs and RPC rules (w11b, w11c). The database stays the authority. */
export const platformReviewLimits = {
  statementMinLength: 20,
  statementMaxLength: 1000,
  reasonMinLength: 20,
  reasonMaxLength: 500,
  /** D-44: days the issuing shop has to decide a review request before WashLink can be asked. */
  shopDecisionDays: 14,
} as const

/** `my_certification_platform_reviews()` (w11d): the worker's suspended / revoked certificates or any with a review. */
export interface MyCertificationPlatformReview {
  readonly certificationId: string
  /** The database's answer; the client never decides eligibility itself. */
  readonly canOpen: boolean
  readonly basis: PlatformReviewBasis | null
  readonly openReviewId: string | null
  readonly latestStatus: PlatformReviewStatus | null
  readonly latestDecisionReason: string | null
  readonly latestDecidedAt: string | null
  readonly openedAt: string | null
}

/** `owner_certification_platform_reviews()` (w11d): reviews of certificates the owner currently issues. */
export interface OwnerCertificationPlatformReview {
  readonly certificationId: string
  readonly reviewId: string
  readonly status: PlatformReviewStatus
  readonly basis: PlatformReviewBasis
  readonly workerStatement: string
  readonly decisionReason: string | null
  readonly openedAt: string
  readonly decidedAt: string | null
}

/** `admin_certification_platform_review_queue(p_status)` (w11d). */
export interface AdminPlatformReviewQueueItem {
  readonly reviewId: string
  readonly certificationId: string
  readonly basis: PlatformReviewBasis
  readonly status: PlatformReviewStatus
  readonly revision: number
  readonly openedAt: string
  readonly decidedAt: string | null
  readonly certificationTitle: string
  readonly shopNameSnapshot: string
  readonly certificationStatus: CertificationStatus
  readonly isIssuingShopPresent: boolean
  readonly isIssuingShopCurrentlyVerified: boolean
}

export interface AdminPlatformReviewCaseReview {
  readonly reviewId: string
  readonly certificationId: string
  readonly basis: PlatformReviewBasis
  readonly status: PlatformReviewStatus
  readonly revision: number
  readonly certificationStatusAtOpen: CertificationStatus
  readonly escalatedFromRequestId: string | null
  readonly workerStatement: string
  readonly openedAt: string
  readonly decidedAt: string | null
  readonly decisionReason: string | null
  readonly closedAt: string | null
}

export interface AdminPlatformReviewCaseCertification {
  readonly certificationTitle: string
  readonly programTitleSnapshot: string | null
  readonly shopNameSnapshot: string | null
  readonly issuedAt: string
  readonly expiresAt: string
  readonly status: CertificationStatus
  readonly effectiveStatus: string
  readonly statusReason: string | null
  readonly attendedTrainingDays: number
  readonly requiredTrainingDays: number
  readonly shopVerificationStatusAtIssue: string | null
  readonly shopVerifiedAtAtIssue: string | null
  readonly isIssuingShopPresent: boolean
  readonly isIssuingOwnerCurrent: boolean
  readonly isIssuingShopCurrentlyVerified: boolean
  readonly isTrainingRecordChangedAfterIssue: boolean
}

export interface AdminPlatformReviewCaseStatusEvent {
  readonly event: string
  readonly fromStatus: string | null
  readonly toStatus: string | null
  readonly reason: string | null
  readonly actorRole: string | null
  readonly actorDisplayName: string | null
  readonly createdAt: string
}

export interface AdminPlatformReviewCaseShopRequest {
  readonly workerStatement: string
  readonly status: string
  readonly decisionReason: string | null
  readonly requestedAt: string
  readonly decidedAt: string | null
}

/** `admin_certification_platform_review_case(p_review_id)` (w11d). Every read is audited by the database. */
export interface AdminPlatformReviewCase {
  readonly review: AdminPlatformReviewCaseReview
  readonly workerDisplayName: string
  readonly certification: AdminPlatformReviewCaseCertification
  readonly statusEvents: readonly AdminPlatformReviewCaseStatusEvent[]
  readonly shopRequests: readonly AdminPlatformReviewCaseShopRequest[]
}

/** The row the open / withdraw / decide RPCs return. */
export interface PlatformReviewRecord {
  readonly reviewId: string
  readonly status: PlatformReviewStatus
  readonly revision: number
}

/** Database messages the UI reacts to (55000 stale answers). */
export const stalePlatformReviewMessage = 'This review changed. Refresh and try again.'
