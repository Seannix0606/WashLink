import { useCallback, useEffect, useState } from 'react'
import type { ShopService } from '../../application/services/ShopService'
import type { Shop } from '../../domain/models/Shop'

type ShopReviewQueueScope = 'pending' | 'all'

interface UseShopReviewQueueOptions {
  readonly shopService: ShopService
  readonly initialScope?: ShopReviewQueueScope
}

interface UseShopReviewQueueResult {
  readonly shopsInReviewQueue: readonly Shop[]
  readonly isLoadingShopsInReviewQueue: boolean
  readonly shopsInReviewQueueLoadErrorMessage: string | null
  readonly reviewQueueScope: ShopReviewQueueScope
  readonly setReviewQueueScope: (
    nextReviewQueueScope: ShopReviewQueueScope,
  ) => void
  readonly reloadShopsInReviewQueue: () => Promise<void>
  readonly replaceShopInReviewQueueLocally: (updatedShop: Shop) => void
}

export function useShopReviewQueue({
  shopService,
  initialScope = 'pending',
}: UseShopReviewQueueOptions): UseShopReviewQueueResult {
  const [reviewQueueScope, setReviewQueueScope] =
    useState<ShopReviewQueueScope>(initialScope)
  const [shopsInReviewQueue, setShopsInReviewQueue] = useState<readonly Shop[]>(
    [],
  )
  const [isLoadingShopsInReviewQueue, setIsLoadingShopsInReviewQueue] =
    useState<boolean>(false)
  const [
    shopsInReviewQueueLoadErrorMessage,
    setShopsInReviewQueueLoadErrorMessage,
  ] = useState<string | null>(null)

  const loadShopsInReviewQueue = useCallback(async (): Promise<void> => {
    setIsLoadingShopsInReviewQueue(true)
    setShopsInReviewQueueLoadErrorMessage(null)
    try {
      const fetchedShops =
        reviewQueueScope === 'pending'
          ? await shopService.listShopsPendingReview()
          : await shopService.listAllShopsForReview()
      setShopsInReviewQueue(fetchedShops)
    } catch (unexpectedError) {
      const resolvedMessage =
        unexpectedError instanceof Error
          ? unexpectedError.message
          : 'Could not load shops for review.'
      setShopsInReviewQueueLoadErrorMessage(resolvedMessage)
    } finally {
      setIsLoadingShopsInReviewQueue(false)
    }
  }, [reviewQueueScope, shopService])

  useEffect(() => {
    void loadShopsInReviewQueue()
  }, [loadShopsInReviewQueue])

  const replaceShopInReviewQueueLocally = useCallback(
    (updatedShop: Shop): void => {
      setShopsInReviewQueue((previousShopsInReviewQueue) => {
        const alreadyContainsShop = previousShopsInReviewQueue.some(
          (existingShop) => existingShop.id === updatedShop.id,
        )
        if (!alreadyContainsShop) {
          return previousShopsInReviewQueue
        }
        return previousShopsInReviewQueue.map((existingShop) =>
          existingShop.id === updatedShop.id ? updatedShop : existingShop,
        )
      })
    },
    [],
  )

  return {
    shopsInReviewQueue,
    isLoadingShopsInReviewQueue,
    shopsInReviewQueueLoadErrorMessage,
    reviewQueueScope,
    setReviewQueueScope,
    reloadShopsInReviewQueue: loadShopsInReviewQueue,
    replaceShopInReviewQueueLocally,
  }
}
