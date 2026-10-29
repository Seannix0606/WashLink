import { useCallback } from 'react'
import type { CertificationPlatformReviewService } from '../../application/services/CertificationPlatformReviewService'
import type { MyCertification } from '../../domain/models/Certification'
import type { MyCertificationPlatformReview } from '../../domain/models/CertificationPlatformReview'
import { useLatestResource } from './useLatestResource'
import { useOversightActionRunner } from './useOversightActionRunner'

const noMyReviews: readonly MyCertificationPlatformReview[] = []

export interface UseCertificationPlatformReviewsResult {
  readonly reviews: readonly MyCertificationPlatformReview[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly findReview: (certificationId: string) => MyCertificationPlatformReview | undefined
  readonly pendingActionKey: string | null
  /** Resolves true when WashLink was asked (the caller may close its dialog). */
  readonly openReview: (certification: MyCertification, statement: string) => Promise<boolean>
  readonly withdrawReview: (platformReview: MyCertificationPlatformReview) => Promise<boolean>
  readonly reload: () => Promise<void>
}

/**
 * The worker's WashLink review state per certificate (W11). Without a service (older callers)
 * it is empty and offers nothing. `onChanged` re-reads the certificates after an action, since
 * asking WashLink withdraws an open shop request.
 */
export function useCertificationPlatformReviews(
  platformReviewService: CertificationPlatformReviewService | undefined,
  onChanged: () => Promise<void>,
): UseCertificationPlatformReviewsResult {
  const loadReviews = useCallback(
    async (): Promise<readonly MyCertificationPlatformReview[]> =>
      platformReviewService === undefined ? noMyReviews : platformReviewService.listMyReviews(),
    [platformReviewService],
  )
  const reviewsResource = useLatestResource({
    load: loadReviews,
    initialResource: noMyReviews,
    loadFailedMessage: 'Could not load your WashLink reviews.',
    isPolling: platformReviewService !== undefined,
  })
  const { refresh } = reviewsResource
  const refreshAll = useCallback(async (): Promise<void> => {
    await Promise.all([refresh(), onChanged()])
  }, [refresh, onChanged])
  const { pendingActionKey, runAction } = useOversightActionRunner(refreshAll)
  const reviews = reviewsResource.resource

  const findReview = useCallback(
    (certificationId: string): MyCertificationPlatformReview | undefined =>
      reviews.find((platformReview) => platformReview.certificationId === certificationId),
    [reviews],
  )

  const openReview = useCallback(
    async (certification: MyCertification, statement: string): Promise<boolean> => {
      if (platformReviewService === undefined) {
        return false
      }
      const openedReview = await runAction(
        `open:${certification.certificationId}`,
        async () => platformReviewService.openReview(certification, findReview(certification.certificationId), statement),
        'WashLink was asked to review the shop decision.',
        'Could not ask WashLink to review this certification.',
      )
      return openedReview !== null
    },
    [platformReviewService, runAction, findReview],
  )

  const withdrawReview = useCallback(
    async (platformReview: MyCertificationPlatformReview): Promise<boolean> => {
      if (platformReviewService === undefined) {
        return false
      }
      const withdrawnReview = await runAction(
        `withdraw:${platformReview.certificationId}`,
        async () => platformReviewService.withdrawReview(platformReview),
        'The WashLink review was withdrawn.',
        'Could not withdraw the WashLink review.',
      )
      return withdrawnReview !== null
    },
    [platformReviewService, runAction],
  )

  return {
    reviews,
    isLoading: platformReviewService !== undefined && reviewsResource.isLoading,
    errorMessage: reviewsResource.errorMessage,
    findReview,
    pendingActionKey,
    openReview,
    withdrawReview,
    reload: reviewsResource.reload,
  }
}
