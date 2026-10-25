import type { TrainingAssessmentResult } from './TrainingEnrollment'
import type { TrainingRecorderRole } from './TrainingEvidence'

/** Stored status of public.certifications (W7b). Expiry is never stored. */
export type CertificationStatus = 'active' | 'suspended' | 'revoked' | 'superseded'

/** Status as derived by the database (`effective_status`); the app never computes expiry itself. */
export type CertificationEffectiveStatus = CertificationStatus | 'expired'

/**
 * The owner confirmation sent with issue and renew (p_issuer_attestation_version). The
 * database refuses any other value. Change only together with the attestation text.
 */
export const certificationIssuerAttestationVersion = 'w7_issuer_v1'

/** Mirrors the W7 CHECKs and RPC rules (w7b, w7c, w7e, w7f). */
export const certificationLimits = {
  reasonMinLength: 20,
  reasonMaxLength: 500,
  statementMinLength: 20,
  statementMaxLength: 1000,
  failureReasonMinLength: 10,
  failureReasonMaxLength: 300,
  assessorCommentMaxLength: 500,
  validityMinMonths: 1,
  validityMaxMonths: 36,
  /** D-5: the validity that applies when a shop has no policy row. */
  defaultValidityMonths: 12,
  reviewRequestsMaximum: 3,
  /** "Expires soon" label window (D-25), measured from the server expires_at. */
  expiresSoonDays: 30,
  /** A passed re-assessment can be used for a renewal for this many days. */
  reassessmentUsableDays: 30,
} as const

/** Database message (55000) on issue / renew when the training record changed since it was loaded. */
export const staleTrainingRecordMessage = 'The training record changed. Review it again.'

/** Database message (55000) when the expected status is out of date. */
export const staleCertificationMessage = 'This certification changed. Refresh and try again.'

/** One row of my_certifications() (the worker's own certificates, newest first). */
export interface MyCertification {
  readonly certificationId: string
  readonly certificationTitle: string
  readonly issuerKind: string
  readonly programId: string
  readonly enrollmentId: string
  readonly renewsCertificationId: string | null
  readonly status: CertificationStatus
  readonly effectiveStatus: CertificationEffectiveStatus
  /** The issuing owner's reason, stored only while suspended or revoked. */
  readonly statusReason: string | null
  readonly statusChangedAt: string | null
  readonly issuedAt: string
  readonly expiresAt: string
  readonly validityMonths: number
  readonly shopName: string
  readonly approverDisplayName: string
  readonly assessorRole: TrainingRecorderRole
  readonly assessorDisplayName: string
  readonly attendedTrainingDays: number
  readonly requiredTrainingDays: number
  readonly shopVerificationStatusAtIssue: string
  readonly shopVerifiedAtAtIssue: string | null
  readonly isIssuingShopPresent: boolean
  /** Null when the issuing shop was removed. */
  readonly isIssuingShopCurrentlyVerified: boolean | null
  readonly isRenewalWindowOpen: boolean
  readonly isTrainingRecordChangedAfterIssue: boolean
  readonly openReviewRequestId: string | null
  readonly reviewRequestsUsed: number
  /** Set only while suspended or revoked. */
  readonly reviewWindowEndsAt: string | null
}

/** One row of owner_certifications(p_shop_id) (open reviews first, then newest). */
export interface OwnerCertification {
  readonly certificationId: string
  readonly workerId: string
  readonly workerDisplayName: string
  readonly certificationTitle: string
  readonly programId: string
  readonly enrollmentId: string
  readonly renewsCertificationId: string | null
  readonly status: CertificationStatus
  readonly effectiveStatus: CertificationEffectiveStatus
  readonly statusReason: string | null
  readonly issuedAt: string
  readonly expiresAt: string
  readonly validityMonths: number
  readonly isTrainingRecordChangedAfterIssue: boolean
  readonly isRenewalWindowOpen: boolean
  readonly latestReassessmentId: string | null
  readonly latestReassessmentResult: TrainingAssessmentResult | null
  /** Manila calendar date (YYYY-MM-DD). */
  readonly latestReassessmentAssessedOn: string | null
  readonly isLatestReassessmentUsed: boolean
  readonly openReviewRequestId: string | null
  readonly openReviewStatement: string | null
  readonly openReviewRequestedAt: string | null
}

export type CertificationHistoryEntryKind = 'status_event' | 'review_request'

export type CertificationReviewStatus = 'open' | 'reinstated' | 'upheld' | 'withdrawn'

/** One row of certification_history(p_certification_id), oldest first. */
export interface CertificationHistoryEntry {
  readonly entryKind: CertificationHistoryEntryKind
  readonly entryId: string
  readonly event: string | null
  readonly fromStatus: CertificationStatus | null
  readonly toStatus: CertificationStatus | null
  readonly reason: string | null
  readonly actorRole: string | null
  readonly actorDisplayName: string | null
  readonly reviewStatus: CertificationReviewStatus | null
  readonly workerStatement: string | null
  readonly decisionReason: string | null
  readonly deciderDisplayName: string | null
  readonly occurredAt: string
  readonly decidedAt: string | null
}

/** One row of certifiable_enrollments(p_program_id): completed, without an original certificate. */
export interface CertifiableEnrollment {
  readonly enrollmentId: string
  readonly workerId: string
  readonly workerDisplayName: string
  readonly attendedTrainingDays: number
  readonly requiredTrainingDays: number
  /** Sent back as p_expected_assessment_id; a different current id fails with 55000. */
  readonly currentAssessmentId: string
  readonly assessedOn: string | null
  readonly assessorDisplayName: string | null
  /** The validity that would apply if issued now (shop policy, default 12). */
  readonly validityMonths: number
}

/** The shop's validity policy; `hasPolicyRow` false means the default 12 months applies. */
export interface ShopCertificationPolicy {
  readonly shopId: string
  readonly validityMonths: number
  readonly hasPolicyRow: boolean
  readonly updatedAt: string | null
}

/** The row returned by issue_certification / renew_certification / transition_certification. */
export interface IssuedCertificationRecord {
  readonly certificationId: string
  readonly status: CertificationStatus
  readonly issuedAt: string
  readonly expiresAt: string
}

export interface CertificationReassessmentRecord {
  readonly reassessmentId: string
  readonly result: TrainingAssessmentResult
}

export interface CertificationReviewRequestRecord {
  readonly requestId: string
  readonly status: CertificationReviewStatus
}

export interface IssueCertificationInput {
  readonly enrollmentId: string
  readonly expectedAssessmentId: string
  readonly hasConfirmedAttestation: boolean
}

export interface RecordCertificationReassessmentInput {
  readonly certificationId: string
  readonly itemsMet: readonly boolean[]
  readonly result: TrainingAssessmentResult
  readonly assessorComment: string | null
  readonly failureReason: string | null
}

export type CertificationStatusChange = 'suspend' | 'revoke' | 'reinstate'

export interface TransitionCertificationInput {
  readonly certificationId: string
  readonly fromStatus: CertificationStatus
  readonly toStatus: CertificationStatus
  readonly reason: string
}

export type CertificationReviewDecision = 'reinstate' | 'uphold'
