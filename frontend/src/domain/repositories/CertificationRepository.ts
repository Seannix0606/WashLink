import type {
  CertifiableEnrollment,
  CertificationHistoryEntry,
  CertificationReassessmentRecord,
  CertificationReviewDecision,
  CertificationReviewRequestRecord,
  IssuedCertificationRecord,
  MyCertification,
  OwnerCertification,
  RecordCertificationReassessmentInput,
  ShopCertificationPolicy,
  TransitionCertificationInput,
} from '../models/Certification'

/** Certificate reads (definer RPCs and one select under RLS). No contact columns. */
export interface CertificationRepository {
  /** The signed-in worker's certificates; other roles get none. */
  listMyCertifications(): Promise<MyCertification[]>
  /** Certificates the current owner issued from one shop. */
  listOwnerCertifications(shopId: string): Promise<OwnerCertification[]>
  /** Status events and review requests, oldest first (worker or issuing owner). */
  listHistory(certificationId: string): Promise<CertificationHistoryEntry[]>
  /** Completed enrollments of one program that have no original certificate yet. */
  listCertifiableEnrollments(programId: string): Promise<CertifiableEnrollment[]>
  /** The shop's validity policy; no row means the default (12 months). */
  fetchShopPolicy(shopId: string): Promise<ShopCertificationPolicy>
}

/**
 * Every certificate write is an RPC. No payload carries a worker, owner, approver, stamp or
 * expiry; the database derives them. An RPC answering without a row is a failure.
 */
export interface CertificationActionRepository {
  issue(enrollmentId: string, expectedAssessmentId: string, attestationVersion: string): Promise<IssuedCertificationRecord>
  setShopValidity(shopId: string, validityMonths: number): Promise<ShopCertificationPolicy>
  recordReassessment(reassessmentInput: RecordCertificationReassessmentInput): Promise<CertificationReassessmentRecord>
  renew(certificationId: string, reassessmentId: string, attestationVersion: string): Promise<IssuedCertificationRecord>
  transition(transitionInput: TransitionCertificationInput): Promise<IssuedCertificationRecord>
  requestReview(certificationId: string, statement: string): Promise<CertificationReviewRequestRecord>
  withdrawReview(requestId: string): Promise<CertificationReviewRequestRecord>
  decideReview(requestId: string, decision: CertificationReviewDecision, reason: string): Promise<CertificationReviewRequestRecord>
}
