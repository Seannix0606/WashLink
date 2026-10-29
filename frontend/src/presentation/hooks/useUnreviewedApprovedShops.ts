import { useCallback } from 'react'
import type { AdminOversightService } from '../../application/services/AdminOversightService'
import { shopRereviewDecisions, type UnreviewedApprovedShop } from '../../domain/models/AdminOversight'
import { rereviewSuccessText } from '../utilities/adminOversightCopy'
import { useLatestResource } from './useLatestResource'
import { useOversightActionRunner } from './useOversightActionRunner'

const noShops: readonly UnreviewedApprovedShop[] = []

export interface UseUnreviewedApprovedShopsResult {
  readonly shops: readonly UnreviewedApprovedShop[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isEmpty: boolean
  readonly isReviewing: boolean
  readonly rereview: (shopId: string, decision: string, notes: string) => Promise<boolean>
  readonly reload: () => Promise<void>
}

/** Super_admin: approved shops without a recorded review (D-10 row 14) and the re-review action (D-56). */
export function useUnreviewedApprovedShops(adminOversightService: AdminOversightService): UseUnreviewedApprovedShopsResult {
  const loadShops = useCallback(
    async (): Promise<readonly UnreviewedApprovedShop[]> => adminOversightService.listUnreviewedApprovedShops(),
    [adminOversightService],
  )
  const shopsResource = useLatestResource({
    load: loadShops,
    initialResource: noShops,
    loadFailedMessage: 'Could not load the approved shops without a recorded review.',
  })
  const { pendingActionKey, runAction } = useOversightActionRunner(shopsResource.refresh)

  const rereview = useCallback(
    async (shopId: string, decision: string, notes: string): Promise<boolean> => {
      const decisionKey = shopRereviewDecisions.find((candidate) => candidate === decision)
      const record = await runAction(
        `rereview:${shopId}`,
        async () => adminOversightService.rereviewShop(shopId, decision, notes),
        decisionKey === undefined ? 'The review was recorded.' : rereviewSuccessText[decisionKey],
        'Could not record the review.',
      )
      return record !== null
    },
    [adminOversightService, runAction],
  )

  return {
    shops: shopsResource.resource,
    isLoading: shopsResource.isLoading,
    errorMessage: shopsResource.errorMessage,
    isEmpty: !shopsResource.isLoading && shopsResource.errorMessage === null && shopsResource.resource.length === 0,
    isReviewing: pendingActionKey !== null,
    rereview,
    reload: shopsResource.reload,
  }
}
