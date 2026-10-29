import type { CertificationStatus } from '../models/Certification'
import type {
  AdminPlatformReviewCase,
  AdminPlatformReviewQueueItem,
  MyCertificationPlatformReview,
  OwnerCertificationPlatformReview,
  PlatformReviewDecision,
  PlatformReviewRecord,
  PlatformReviewStatus,
} from '../models/CertificationPlatformReview'

/** W11 WashLink reviews: RPCs only. The database checks the role and ownership of every call. */
export interface CertificationPlatformReviewRepository {
  listMyReviews(): Promise<MyCertificationPlatformReview[]>
  listOwnerReviews(): Promise<OwnerCertificationPlatformReview[]>
  listAdminQueue(status: PlatformReviewStatus): Promise<AdminPlatformReviewQueueItem[]>
  /** Audited by the database on every call; never polled. */
  fetchAdminCase(reviewId: string): Promise<AdminPlatformReviewCase>
  openReview(certificationId: string, expectedStatus: CertificationStatus, statement: string): Promise<PlatformReviewRecord>
  withdrawReview(reviewId: string): Promise<PlatformReviewRecord>
  decideReview(reviewId: string, expectedRevision: number, decision: PlatformReviewDecision, reason: string): Promise<PlatformReviewRecord>
}
