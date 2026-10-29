import type { MyCertification } from '../../domain/models/Certification'
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
  parseOversightInput,
  platformReviewDecisionSchema,
  platformReviewReasonSchema,
  platformReviewStatementSchema,
} from '../validation/oversightSchemas'

export const platformReviewNotOfferedMessage = 'WashLink cannot be asked to review this certification now.'
export const platformReviewNotOpenMessage = 'This review is no longer open.'

/**
 * W11 WashLink review (D-44, D-45). The worker asks (the database decides whether they may);
 * a platform administrator reinstates or keeps the shop's decision. Nothing here can suspend,
 * revoke, issue or renew a certificate: the shop stays its issuer.
 */
export class CertificationPlatformReviewService {
  public constructor(private readonly platformReviewRepository: CertificationPlatformReviewRepository) {}

  public async listMyReviews(): Promise<MyCertificationPlatformReview[]> {
    return this.platformReviewRepository.listMyReviews()
  }

  public async listOwnerReviews(): Promise<OwnerCertificationPlatformReview[]> {
    return this.platformReviewRepository.listOwnerReviews()
  }

  /** Sends the certificate status the worker saw; a different server status fails with 55000. */
  public async openReview(
    certification: MyCertification,
    platformReview: MyCertificationPlatformReview | undefined,
    statement: string,
  ): Promise<PlatformReviewRecord> {
    if (platformReview?.canOpen !== true) {
      throw new Error(platformReviewNotOfferedMessage)
    }
    const validStatement = parseOversightInput(platformReviewStatementSchema, statement)
    return this.platformReviewRepository.openReview(certification.certificationId, certification.status, validStatement)
  }

  public async withdrawReview(platformReview: MyCertificationPlatformReview): Promise<PlatformReviewRecord> {
    if (platformReview.openReviewId === null) {
      throw new Error(platformReviewNotOpenMessage)
    }
    return this.platformReviewRepository.withdrawReview(platformReview.openReviewId)
  }

  public async listAdminQueue(status: PlatformReviewStatus): Promise<AdminPlatformReviewQueueItem[]> {
    return this.platformReviewRepository.listAdminQueue(status)
  }

  /** Each call is a new audited read in the database; callers load it once per opening. */
  public async loadAdminCase(reviewId: string): Promise<AdminPlatformReviewCase> {
    return this.platformReviewRepository.fetchAdminCase(reviewId)
  }

  /** Sends the revision the administrator read; a newer server revision fails with 55000. */
  public async decideReview(reviewCase: AdminPlatformReviewCase, decision: string, reason: string): Promise<PlatformReviewRecord> {
    if (reviewCase.review.status !== 'open') {
      throw new Error(platformReviewNotOpenMessage)
    }
    const validDecision: PlatformReviewDecision = parseOversightInput(platformReviewDecisionSchema, decision)
    const validReason = parseOversightInput(platformReviewReasonSchema, reason)
    return this.platformReviewRepository.decideReview(reviewCase.review.reviewId, reviewCase.review.revision, validDecision, validReason)
  }
}
