/**
 * A shop-issued certification recorded by the WashLink certification workflow (W7).
 * Never worker-entered text. applicant_verified_certifications returns the applicant's
 * CURRENT certificates from any shop.
 */
export interface VerifiedCertification {
  readonly certificationId: string
  readonly certificationTitle: string
  readonly issuingShopName: string
  readonly issuedAt: string
  readonly expiresAt: string | null
  /**
   * Whether the issuing shop is verified and active on WashLink right now. Optional:
   * undefined or null when the read does not report it; never inferred by the client.
   */
  readonly isIssuingShopCurrentlyVerified?: boolean | null
}

/**
 * What the apply flow knows about the worker's own certificates (my_certifications).
 * "Current" means at least one row with effective_status 'active' (D-20).
 */
export type WorkerVerifiedCertificationState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'loaded'; readonly hasCurrentCertification: boolean }

export const loadingWorkerCertificationState: WorkerVerifiedCertificationState = { kind: 'loading' }
