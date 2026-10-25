import type {
  CertificationReviewDecision,
  CertificationReviewRequestRecord,
  MyCertification,
  OwnerCertification,
} from '../../domain/models/Certification'
import type { CertificationActionRepository } from '../../domain/repositories/CertificationRepository'
import { canRequestCertificationReview } from '../../domain/utilities/certificationLifecycle'
import { certificationReasonSchema, reviewStatementSchema } from '../validation/certificationSchemas'
import { parseCertificationInput } from './CertificationService'

export const reviewNotOfferedMessage = 'A review cannot be requested for this certification now.'

/**
 * D-21 reviews: the worker asks (30 days after the latest suspension / revocation, at most
 * 3 per certificate, one open at a time); the issuing owner reinstates or upholds with a reason.
 */
export class CertificationReviewService {
  public constructor(private readonly certificationActionRepository: CertificationActionRepository) {}

  public async requestReview(
    certification: MyCertification,
    statement: string,
    currentInstant: Date,
  ): Promise<CertificationReviewRequestRecord> {
    if (!canRequestCertificationReview(certification, currentInstant)) {
      throw new Error(reviewNotOfferedMessage)
    }
    const validStatement = parseCertificationInput(reviewStatementSchema, statement)
    return this.certificationActionRepository.requestReview(certification.certificationId, validStatement)
  }

  public async withdrawReview(certification: MyCertification): Promise<CertificationReviewRequestRecord> {
    if (certification.openReviewRequestId === null) {
      throw new Error('This review request is no longer open.')
    }
    return this.certificationActionRepository.withdrawReview(certification.openReviewRequestId)
  }

  public async decideReview(
    certification: OwnerCertification,
    decision: CertificationReviewDecision,
    reason: string,
  ): Promise<CertificationReviewRequestRecord> {
    if (certification.openReviewRequestId === null) {
      throw new Error('This review request is no longer open.')
    }
    const validReason = parseCertificationInput(certificationReasonSchema, reason)
    return this.certificationActionRepository.decideReview(certification.openReviewRequestId, decision, validReason)
  }
}
