import type { CertificationStatus } from '../../domain/models/Certification'
import type {
  AdminPlatformReviewCase,
  AdminPlatformReviewQueueItem,
  MyCertificationPlatformReview,
  OwnerCertificationPlatformReview,
  PlatformReviewBasis,
  PlatformReviewRecord,
  PlatformReviewStatus,
} from '../../domain/models/CertificationPlatformReview'

/** `my_certification_platform_reviews()` (w11d). */
export interface SupabaseMyPlatformReviewRow {
  certification_id: string
  can_open: boolean
  basis: PlatformReviewBasis | null
  open_review_id: string | null
  latest_status: PlatformReviewStatus | null
  latest_decision_reason: string | null
  latest_decided_at: string | null
  opened_at: string | null
}

/** `owner_certification_platform_reviews()` (w11d). */
export interface SupabaseOwnerPlatformReviewRow {
  certification_id: string
  review_id: string
  status: PlatformReviewStatus
  basis: PlatformReviewBasis
  worker_statement: string
  decision_reason: string | null
  opened_at: string
  decided_at: string | null
}

/** `admin_certification_platform_review_queue(p_status)` (w11d). */
export interface SupabaseAdminPlatformReviewQueueRow {
  review_id: string
  certification_id: string
  basis: PlatformReviewBasis
  status: PlatformReviewStatus
  revision: number
  opened_at: string
  decided_at: string | null
  certification_title: string
  shop_name_snapshot: string
  certification_status: CertificationStatus
  issuing_shop_present: boolean
  issuing_shop_currently_verified: boolean
}

/** The `certification_platform_reviews` row returned by open / withdraw / decide (w11c). */
export interface SupabasePlatformReviewRecordRow {
  id: string
  status: PlatformReviewStatus
  revision: number
}

type JsonObject = Readonly<Record<string, unknown>>

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function textOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

function objectOrEmpty(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonObject) : {}
}

function objectList(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(objectOrEmpty) : []
}

export function mapMyPlatformReviewRow(row: SupabaseMyPlatformReviewRow): MyCertificationPlatformReview {
  return {
    certificationId: row.certification_id,
    canOpen: row.can_open,
    basis: row.basis,
    openReviewId: row.open_review_id,
    latestStatus: row.latest_status,
    latestDecisionReason: row.latest_decision_reason,
    latestDecidedAt: row.latest_decided_at,
    openedAt: row.opened_at,
  }
}

export function mapOwnerPlatformReviewRow(row: SupabaseOwnerPlatformReviewRow): OwnerCertificationPlatformReview {
  return {
    certificationId: row.certification_id,
    reviewId: row.review_id,
    status: row.status,
    basis: row.basis,
    workerStatement: row.worker_statement,
    decisionReason: row.decision_reason,
    openedAt: row.opened_at,
    decidedAt: row.decided_at,
  }
}

export function mapAdminPlatformReviewQueueRow(row: SupabaseAdminPlatformReviewQueueRow): AdminPlatformReviewQueueItem {
  return {
    reviewId: row.review_id,
    certificationId: row.certification_id,
    basis: row.basis,
    status: row.status,
    revision: row.revision,
    openedAt: row.opened_at,
    decidedAt: row.decided_at,
    certificationTitle: row.certification_title,
    shopNameSnapshot: row.shop_name_snapshot,
    certificationStatus: row.certification_status,
    isIssuingShopPresent: row.issuing_shop_present,
    isIssuingShopCurrentlyVerified: row.issuing_shop_currently_verified,
  }
}

export function mapPlatformReviewRecordRow(row: SupabasePlatformReviewRecordRow): PlatformReviewRecord {
  return { reviewId: row.id, status: row.status, revision: row.revision }
}

/** The jsonb of `admin_certification_platform_review_case(p_review_id)` (w11d), read field by field. */
export function mapAdminPlatformReviewCase(caseJson: unknown): AdminPlatformReviewCase {
  const caseObject = objectOrEmpty(caseJson)
  const review = objectOrEmpty(caseObject.review)
  const certification = objectOrEmpty(caseObject.certification)
  return {
    review: {
      reviewId: textOrEmpty(review.id),
      certificationId: textOrEmpty(review.certification_id),
      basis: textOrEmpty(review.basis) as PlatformReviewBasis,
      status: textOrEmpty(review.status) as PlatformReviewStatus,
      revision: numberOrZero(review.revision),
      certificationStatusAtOpen: textOrEmpty(review.certification_status_at_open) as CertificationStatus,
      escalatedFromRequestId: textOrNull(review.escalated_from_request_id),
      workerStatement: textOrEmpty(review.worker_statement),
      openedAt: textOrEmpty(review.opened_at),
      decidedAt: textOrNull(review.decided_at),
      decisionReason: textOrNull(review.decision_reason),
      closedAt: textOrNull(review.closed_at),
    },
    workerDisplayName: textOrNull(caseObject.worker_display_name) ?? 'Worker',
    certification: {
      certificationTitle: textOrEmpty(certification.certification_title),
      programTitleSnapshot: textOrNull(certification.program_title_snapshot),
      shopNameSnapshot: textOrNull(certification.shop_name_snapshot),
      issuedAt: textOrEmpty(certification.issued_at),
      expiresAt: textOrEmpty(certification.expires_at),
      status: textOrEmpty(certification.status) as CertificationStatus,
      effectiveStatus: textOrEmpty(certification.effective_status),
      statusReason: textOrNull(certification.status_reason),
      attendedTrainingDays: numberOrZero(certification.attended_training_days),
      requiredTrainingDays: numberOrZero(certification.required_training_days),
      shopVerificationStatusAtIssue: textOrNull(certification.shop_verification_status_at_issue),
      shopVerifiedAtAtIssue: textOrNull(certification.shop_verified_at_at_issue),
      isIssuingShopPresent: certification.issuing_shop_present === true,
      isIssuingOwnerCurrent: certification.issuing_owner_current === true,
      isIssuingShopCurrentlyVerified: certification.issuing_shop_currently_verified === true,
      isTrainingRecordChangedAfterIssue: certification.training_record_changed_after_issue === true,
    },
    statusEvents: objectList(caseObject.status_events).map((statusEvent) => ({
      event: textOrEmpty(statusEvent.event),
      fromStatus: textOrNull(statusEvent.from_status),
      toStatus: textOrNull(statusEvent.to_status),
      reason: textOrNull(statusEvent.reason),
      actorRole: textOrNull(statusEvent.actor_role),
      actorDisplayName: textOrNull(statusEvent.actor_display_name),
      createdAt: textOrEmpty(statusEvent.created_at),
    })),
    shopRequests: objectList(caseObject.shop_requests).map((shopRequest) => ({
      workerStatement: textOrEmpty(shopRequest.worker_statement),
      status: textOrEmpty(shopRequest.status),
      decisionReason: textOrNull(shopRequest.decision_reason),
      requestedAt: textOrEmpty(shopRequest.requested_at),
      decidedAt: textOrNull(shopRequest.decided_at),
    })),
  }
}

export const jsonReaders = { textOrNull, textOrEmpty, numberOrZero, objectOrEmpty, objectList }
