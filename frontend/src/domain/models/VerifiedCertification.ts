/**
 * A shop-issued certification recorded by the WashLink certification workflow (W7).
 * Never worker-entered text. applicant_verified_certifications returns none in W5.
 */
export interface VerifiedCertification {
  readonly certificationId: string
  readonly certificationTitle: string
  readonly issuingShopName: string
  readonly issuedAt: string
  readonly expiresAt: string | null
}

/** Whether the WashLink certification workflow can issue certifications yet. */
export interface CertificationWorkflowStatus {
  readonly isAvailable: boolean
}

/** The certification workflow arrives in W7; until then no applicant can hold a verified certification. */
export const certificationWorkflowStatus: CertificationWorkflowStatus = { isAvailable: false }

/** What the apply flow knows about the worker's own verified certifications. */
export interface WorkerVerifiedCertificationState {
  readonly isWorkflowAvailable: boolean
  readonly hasVerifiedCertifications: boolean
}

/** Until W7 supplies the real state, every worker has none and the workflow is unavailable. */
export const currentWorkerVerifiedCertificationState: WorkerVerifiedCertificationState = {
  isWorkflowAvailable: certificationWorkflowStatus.isAvailable,
  hasVerifiedCertifications: false,
}
