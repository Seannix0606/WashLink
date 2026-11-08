import { useCallback } from 'react'
import type { CertificationPlatformReviewService } from '../../application/services/CertificationPlatformReviewService'
import type { AdminPlatformReviewCase } from '../../domain/models/CertificationPlatformReview'
import { useLatestResource } from './useLatestResource'
import { useOversightActionRunner } from './useOversightActionRunner'

export interface UseAdminCertificationReviewCaseResult {
  readonly reviewCase: AdminPlatformReviewCase | null
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isDeciding: boolean
  /** Resolves true when the decision was recorded. */
  readonly decide: (decision: string, reason: string) => Promise<boolean>
  readonly reload: () => Promise<void>
}

/**
 * Super_admin: one WashLink review case. Every read writes an audit row in the database, so the
 * case is read once when opened (and after a decision), never polled.
 */
export function useAdminCertificationReviewCase(
  platformReviewService: CertificationPlatformReviewService,
  reviewId: string,
  onDecided: () => Promise<void>,
): UseAdminCertificationReviewCaseResult {
  const loadCase = useCallback(
    async (): Promise<AdminPlatformReviewCase | null> => platformReviewService.loadAdminCase(reviewId),
    [platformReviewService, reviewId],
  )
  const caseResource = useLatestResource<AdminPlatformReviewCase | null>({
    load: loadCase,
    initialResource: null,
    loadFailedMessage: 'Could not load this review.',
  })
  const { refresh } = caseResource
  const refreshAfterDecision = useCallback(async (): Promise<void> => {
    await Promise.all([refresh(), onDecided()])
  }, [refresh, onDecided])
  const { pendingActionKey, runAction } = useOversightActionRunner(refreshAfterDecision)
  const reviewCase = caseResource.resource

  const decide = useCallback(
    async (decision: string, reason: string): Promise<boolean> => {
      if (reviewCase === null) {
        return false
      }
      const decidedReview = await runAction(
        `decide:${reviewCase.review.reviewId}`,
        async () => platformReviewService.decideReview(reviewCase, decision, reason),
        'The WashLink review decision was recorded.',
        'Could not record the WashLink review decision.',
      )
      return decidedReview !== null
    },
    [platformReviewService, reviewCase, runAction],
  )

  return {
    reviewCase,
    isLoading: caseResource.isLoading,
    errorMessage: caseResource.errorMessage,
    isDeciding: pendingActionKey !== null,
    decide,
    reload: caseResource.reload,
  }
}
