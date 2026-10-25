import {
  certificationLimits,
  type CertifiableEnrollment,
  type CertificationEffectiveStatus,
  type CertificationHistoryEntry,
  type CertificationHistoryEntryKind,
  type CertificationReassessmentRecord,
  type CertificationReviewRequestRecord,
  type CertificationReviewStatus,
  type CertificationStatus,
  type IssuedCertificationRecord,
  type MyCertification,
  type OwnerCertification,
  type ShopCertificationPolicy,
} from '../../domain/models/Certification'
import type { TrainingAssessmentResult } from '../../domain/models/TrainingEnrollment'
import type { TrainingRecorderRole } from '../../domain/models/TrainingEvidence'

/** Row of my_certifications() (w7g). */
export interface SupabaseMyCertificationRow {
  certification_id: string
  certification_title: string
  issuer_kind: string
  program_id: string
  enrollment_id: string
  renews_certification_id: string | null
  status: CertificationStatus
  effective_status: CertificationEffectiveStatus
  status_reason: string | null
  status_changed_at: string | null
  issued_at: string
  expires_at: string
  validity_months: number
  shop_name: string
  approver_display_name: string
  assessor_role: TrainingRecorderRole
  assessor_display_name: string
  attended_training_days: number
  required_training_days: number
  shop_verification_status_at_issue: string
  shop_verified_at_at_issue: string | null
  issuing_shop_present: boolean
  issuing_shop_currently_verified: boolean | null
  renewal_window_open: boolean
  training_record_changed_after_issue: boolean
  open_review_request_id: string | null
  review_requests_used: number
  review_window_ends_at: string | null
}

export function mapMyCertificationRow(certificationRow: SupabaseMyCertificationRow): MyCertification {
  return {
    certificationId: certificationRow.certification_id,
    certificationTitle: certificationRow.certification_title,
    issuerKind: certificationRow.issuer_kind,
    programId: certificationRow.program_id,
    enrollmentId: certificationRow.enrollment_id,
    renewsCertificationId: certificationRow.renews_certification_id,
    status: certificationRow.status,
    effectiveStatus: certificationRow.effective_status,
    statusReason: certificationRow.status_reason,
    statusChangedAt: certificationRow.status_changed_at,
    issuedAt: certificationRow.issued_at,
    expiresAt: certificationRow.expires_at,
    validityMonths: certificationRow.validity_months,
    shopName: certificationRow.shop_name,
    approverDisplayName: certificationRow.approver_display_name,
    assessorRole: certificationRow.assessor_role,
    assessorDisplayName: certificationRow.assessor_display_name,
    attendedTrainingDays: certificationRow.attended_training_days,
    requiredTrainingDays: certificationRow.required_training_days,
    shopVerificationStatusAtIssue: certificationRow.shop_verification_status_at_issue,
    shopVerifiedAtAtIssue: certificationRow.shop_verified_at_at_issue,
    isIssuingShopPresent: certificationRow.issuing_shop_present,
    isIssuingShopCurrentlyVerified: certificationRow.issuing_shop_currently_verified,
    isRenewalWindowOpen: certificationRow.renewal_window_open,
    isTrainingRecordChangedAfterIssue: certificationRow.training_record_changed_after_issue,
    openReviewRequestId: certificationRow.open_review_request_id,
    reviewRequestsUsed: certificationRow.review_requests_used,
    reviewWindowEndsAt: certificationRow.review_window_ends_at,
  }
}

/** Row of owner_certifications(p_shop_id) (w7g). */
export interface SupabaseOwnerCertificationRow {
  certification_id: string
  worker_id: string
  worker_display_name: string
  certification_title: string
  program_id: string
  enrollment_id: string
  renews_certification_id: string | null
  status: CertificationStatus
  effective_status: CertificationEffectiveStatus
  status_reason: string | null
  issued_at: string
  expires_at: string
  validity_months: number
  training_record_changed_after_issue: boolean
  renewal_window_open: boolean
  latest_reassessment_id: string | null
  latest_reassessment_result: TrainingAssessmentResult | null
  latest_reassessment_assessed_on: string | null
  latest_reassessment_used: boolean | null
  open_review_request_id: string | null
  open_review_statement: string | null
  open_review_requested_at: string | null
}

export function mapOwnerCertificationRow(certificationRow: SupabaseOwnerCertificationRow): OwnerCertification {
  return {
    certificationId: certificationRow.certification_id,
    workerId: certificationRow.worker_id,
    workerDisplayName: certificationRow.worker_display_name,
    certificationTitle: certificationRow.certification_title,
    programId: certificationRow.program_id,
    enrollmentId: certificationRow.enrollment_id,
    renewsCertificationId: certificationRow.renews_certification_id,
    status: certificationRow.status,
    effectiveStatus: certificationRow.effective_status,
    statusReason: certificationRow.status_reason,
    issuedAt: certificationRow.issued_at,
    expiresAt: certificationRow.expires_at,
    validityMonths: certificationRow.validity_months,
    isTrainingRecordChangedAfterIssue: certificationRow.training_record_changed_after_issue,
    isRenewalWindowOpen: certificationRow.renewal_window_open,
    latestReassessmentId: certificationRow.latest_reassessment_id,
    latestReassessmentResult: certificationRow.latest_reassessment_result,
    latestReassessmentAssessedOn: certificationRow.latest_reassessment_assessed_on,
    isLatestReassessmentUsed: certificationRow.latest_reassessment_used === true,
    openReviewRequestId: certificationRow.open_review_request_id,
    openReviewStatement: certificationRow.open_review_statement,
    openReviewRequestedAt: certificationRow.open_review_requested_at,
  }
}

/** Row of certification_history(p_certification_id) (w7g). */
export interface SupabaseCertificationHistoryRow {
  entry_kind: CertificationHistoryEntryKind
  entry_id: string
  event: string | null
  from_status: CertificationStatus | null
  to_status: CertificationStatus | null
  reason: string | null
  actor_role: string | null
  actor_display_name: string | null
  review_status: CertificationReviewStatus | null
  worker_statement: string | null
  decision_reason: string | null
  decider_display_name: string | null
  occurred_at: string
  decided_at: string | null
}

export function mapCertificationHistoryRow(historyRow: SupabaseCertificationHistoryRow): CertificationHistoryEntry {
  return {
    entryKind: historyRow.entry_kind,
    entryId: historyRow.entry_id,
    event: historyRow.event,
    fromStatus: historyRow.from_status,
    toStatus: historyRow.to_status,
    reason: historyRow.reason,
    actorRole: historyRow.actor_role,
    actorDisplayName: historyRow.actor_display_name,
    reviewStatus: historyRow.review_status,
    workerStatement: historyRow.worker_statement,
    decisionReason: historyRow.decision_reason,
    deciderDisplayName: historyRow.decider_display_name,
    occurredAt: historyRow.occurred_at,
    decidedAt: historyRow.decided_at,
  }
}

/** Row of certifiable_enrollments(p_program_id) (w7g). */
export interface SupabaseCertifiableEnrollmentRow {
  enrollment_id: string
  worker_id: string
  worker_display_name: string
  attended_training_days: number
  required_training_days: number
  current_assessment_id: string
  assessed_on: string | null
  assessor_display_name: string | null
  validity_months: number
}

export function mapCertifiableEnrollmentRow(enrollmentRow: SupabaseCertifiableEnrollmentRow): CertifiableEnrollment {
  return {
    enrollmentId: enrollmentRow.enrollment_id,
    workerId: enrollmentRow.worker_id,
    workerDisplayName: enrollmentRow.worker_display_name,
    attendedTrainingDays: enrollmentRow.attended_training_days,
    requiredTrainingDays: enrollmentRow.required_training_days,
    currentAssessmentId: enrollmentRow.current_assessment_id,
    assessedOn: enrollmentRow.assessed_on,
    assessorDisplayName: enrollmentRow.assessor_display_name,
    validityMonths: enrollmentRow.validity_months,
  }
}

/** Explicit columns of shop_certification_policies (owner-only under RLS). */
export const shopCertificationPolicySelectColumns = 'shop_id, validity_months, updated_at'

export interface SupabaseShopCertificationPolicyRow {
  shop_id: string | null
  validity_months: number
  updated_at: string | null
}

export function mapShopCertificationPolicyRow(policyRow: SupabaseShopCertificationPolicyRow, shopId: string): ShopCertificationPolicy {
  return { shopId: policyRow.shop_id ?? shopId, validityMonths: policyRow.validity_months, hasPolicyRow: true, updatedAt: policyRow.updated_at }
}

/** D-5: no policy row means 12 months. */
export function defaultShopCertificationPolicy(shopId: string): ShopCertificationPolicy {
  return { shopId, validityMonths: certificationLimits.defaultValidityMonths, hasPolicyRow: false, updatedAt: null }
}

/** The certifications composite returned by issue / renew / transition. */
export interface SupabaseCertificationRecordRow {
  id: string | null
  status: CertificationStatus
  issued_at: string
  expires_at: string
}

export function mapCertificationRecordRow(recordRow: SupabaseCertificationRecordRow & { id: string }): IssuedCertificationRecord {
  return { certificationId: recordRow.id, status: recordRow.status, issuedAt: recordRow.issued_at, expiresAt: recordRow.expires_at }
}

export interface SupabaseReassessmentRecordRow {
  id: string | null
  result: TrainingAssessmentResult
}

export function mapReassessmentRecordRow(recordRow: SupabaseReassessmentRecordRow & { id: string }): CertificationReassessmentRecord {
  return { reassessmentId: recordRow.id, result: recordRow.result }
}

export interface SupabaseReviewRequestRecordRow {
  id: string | null
  status: CertificationReviewStatus
}

export function mapReviewRequestRecordRow(recordRow: SupabaseReviewRequestRecordRow & { id: string }): CertificationReviewRequestRecord {
  return { requestId: recordRow.id, status: recordRow.status }
}

export const certificationNoRowMessage = 'This certification changed or is no longer available. Refresh and try again.'

/** A composite answer with a key column; an empty or all-null composite is a failure. */
export function hasCompositeKey(rpcData: unknown, keyColumn: string): boolean {
  if (rpcData === null || typeof rpcData !== 'object') {
    return false
  }
  const keyValue = (rpcData as Record<string, unknown>)[keyColumn]
  return typeof keyValue === 'string' && keyValue.length > 0
}
