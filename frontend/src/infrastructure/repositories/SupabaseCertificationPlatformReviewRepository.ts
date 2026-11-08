import type { CertificationStatus } from '../../domain/models/Certification'
import type {
  AdminPlatformReviewCase,
  AdminPlatformReviewQueueItem,
  MyCertificationPlatformReview,
  OwnerCertificationPlatformReview,
  PlatformReviewDecision,
  PlatformReviewRecord,
  PlatformReviewStatus,
} from '../../domain/models/CertificationPlatformReview'
import type { CertificationPlatformReviewRepository } from '../../domain/repositories/CertificationPlatformReviewRepository'
import {
  mapAdminPlatformReviewCase,
  mapAdminPlatformReviewQueueRow,
  mapMyPlatformReviewRow,
  mapOwnerPlatformReviewRow,
  mapPlatformReviewRecordRow,
  type SupabaseAdminPlatformReviewQueueRow,
  type SupabaseMyPlatformReviewRow,
  type SupabaseOwnerPlatformReviewRow,
  type SupabasePlatformReviewRecordRow,
} from '../supabase/supabaseCertificationPlatformReviewRows'
import { callRpcRows, callRpcSingle } from './supabaseRpcCalls'

/**
 * W11 WashLink review RPCs only (w11c, w11d). The client never sends a role, an actor or a
 * decider; the database takes them from the session and checks them on every call.
 */
export class SupabaseCertificationPlatformReviewRepository implements CertificationPlatformReviewRepository {
  public async listMyReviews(): Promise<MyCertificationPlatformReview[]> {
    const reviewRows = await callRpcRows<SupabaseMyPlatformReviewRow>('my_certification_platform_reviews', undefined, 'Could not load your WashLink reviews.')
    return reviewRows.map(mapMyPlatformReviewRow)
  }

  public async listOwnerReviews(): Promise<OwnerCertificationPlatformReview[]> {
    const reviewRows = await callRpcRows<SupabaseOwnerPlatformReviewRow>(
      'owner_certification_platform_reviews',
      undefined,
      'Could not load the WashLink reviews of your certificates.',
    )
    return reviewRows.map(mapOwnerPlatformReviewRow)
  }

  public async listAdminQueue(status: PlatformReviewStatus): Promise<AdminPlatformReviewQueueItem[]> {
    const queueRows = await callRpcRows<SupabaseAdminPlatformReviewQueueRow>(
      'admin_certification_platform_review_queue',
      { p_status: status },
      'Could not load the WashLink review queue.',
    )
    return queueRows.map(mapAdminPlatformReviewQueueRow)
  }

  public async fetchAdminCase(reviewId: string): Promise<AdminPlatformReviewCase> {
    const caseJson = await callRpcSingle<unknown>('admin_certification_platform_review_case', { p_review_id: reviewId }, 'Could not load this review.')
    return mapAdminPlatformReviewCase(caseJson)
  }

  public async openReview(certificationId: string, expectedStatus: CertificationStatus, statement: string): Promise<PlatformReviewRecord> {
    const recordRow = await callRpcSingle<SupabasePlatformReviewRecordRow>(
      'open_certification_platform_review',
      { p_certification_id: certificationId, p_expected_status: expectedStatus, p_statement: statement },
      'Could not ask WashLink to review this certification.',
    )
    return mapPlatformReviewRecordRow(recordRow)
  }

  public async withdrawReview(reviewId: string): Promise<PlatformReviewRecord> {
    const recordRow = await callRpcSingle<SupabasePlatformReviewRecordRow>(
      'withdraw_certification_platform_review',
      { p_review_id: reviewId },
      'Could not withdraw the WashLink review.',
    )
    return mapPlatformReviewRecordRow(recordRow)
  }

  public async decideReview(
    reviewId: string,
    expectedRevision: number,
    decision: PlatformReviewDecision,
    reason: string,
  ): Promise<PlatformReviewRecord> {
    const recordRow = await callRpcSingle<SupabasePlatformReviewRecordRow>(
      'decide_certification_platform_review',
      { p_review_id: reviewId, p_expected_revision: expectedRevision, p_decision: decision, p_reason: reason },
      'Could not record the WashLink review decision.',
    )
    return mapPlatformReviewRecordRow(recordRow)
  }
}
