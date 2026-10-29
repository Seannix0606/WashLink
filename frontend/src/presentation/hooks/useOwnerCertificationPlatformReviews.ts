import { useCallback } from 'react'
import type { CertificationPlatformReviewService } from '../../application/services/CertificationPlatformReviewService'
import type { OwnerCertificationPlatformReview } from '../../domain/models/CertificationPlatformReview'
import { useLatestResource } from './useLatestResource'

const noOwnerReviews: readonly OwnerCertificationPlatformReview[] = []

export interface UseOwnerCertificationPlatformReviewsResult {
  readonly reviews: readonly OwnerCertificationPlatformReview[]
  readonly errorMessage: string | null
  /** The newest review of a certificate (open reviews come first from the database). */
  readonly findReview: (certificationId: string) => OwnerCertificationPlatformReview | undefined
}

/** The issuing owner's view of WashLink reviews of its certificates. Empty without a service. */
export function useOwnerCertificationPlatformReviews(
  platformReviewService: CertificationPlatformReviewService | undefined,
): UseOwnerCertificationPlatformReviewsResult {
  const loadReviews = useCallback(
    async (): Promise<readonly OwnerCertificationPlatformReview[]> =>
      platformReviewService === undefined ? noOwnerReviews : platformReviewService.listOwnerReviews(),
    [platformReviewService],
  )
  const reviewsResource = useLatestResource({
    load: loadReviews,
    initialResource: noOwnerReviews,
    loadFailedMessage: 'Could not load the WashLink reviews of your certificates.',
    isPolling: platformReviewService !== undefined,
  })
  const reviews = reviewsResource.resource
  const findReview = useCallback(
    (certificationId: string): OwnerCertificationPlatformReview | undefined =>
      reviews.find((platformReview) => platformReview.certificationId === certificationId),
    [reviews],
  )
  return { reviews, errorMessage: reviewsResource.errorMessage, findReview }
}
