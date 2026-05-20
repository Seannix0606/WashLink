import { useCallback, useState } from 'react'
import type { ShopVerificationService } from '../../application/services/ShopVerificationService'
import type { Shop } from '../../domain/models/Shop'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'

type ShopVerificationDecisionKind = 'approve' | 'reject' | 'request_changes'

interface UseShopVerificationDecisionActionsOptions {
  readonly shopVerificationService: ShopVerificationService
  readonly reviewerIdentifier: string
}

interface UseShopVerificationDecisionActionsResult {
  readonly activeDecisionKind: ShopVerificationDecisionKind | null
  readonly approveShop: (
    shopIdentifier: string,
    decisionNotes: string | null,
  ) => Promise<Shop | null>
  readonly rejectShop: (
    shopIdentifier: string,
    decisionNotes: string | null,
  ) => Promise<Shop | null>
  readonly requestShopChanges: (
    shopIdentifier: string,
    decisionNotes: string | null,
  ) => Promise<Shop | null>
}

export function useShopVerificationDecisionActions({
  shopVerificationService,
  reviewerIdentifier,
}: UseShopVerificationDecisionActionsOptions): UseShopVerificationDecisionActionsResult {
  const [activeDecisionKind, setActiveDecisionKind] =
    useState<ShopVerificationDecisionKind | null>(null)

  const approveShop = useCallback(
    async (
      shopIdentifier: string,
      decisionNotes: string | null,
    ): Promise<Shop | null> => {
      setActiveDecisionKind('approve')
      try {
        return await runServiceActionWithToast(
          () =>
            shopVerificationService.approveShop({
              shopIdentifier,
              reviewerIdentifier,
              decisionNotes,
            }),
          {
            successMessage: 'Shop approved.',
            fallbackErrorMessage: 'Could not approve this shop.',
          },
        )
      } finally {
        setActiveDecisionKind(null)
      }
    },
    [reviewerIdentifier, shopVerificationService],
  )

  const rejectShop = useCallback(
    async (
      shopIdentifier: string,
      decisionNotes: string | null,
    ): Promise<Shop | null> => {
      setActiveDecisionKind('reject')
      try {
        return await runServiceActionWithToast(
          () =>
            shopVerificationService.rejectShop({
              shopIdentifier,
              reviewerIdentifier,
              decisionNotes,
            }),
          {
            successMessage: 'Shop rejected.',
            fallbackErrorMessage: 'Could not reject this shop.',
          },
        )
      } finally {
        setActiveDecisionKind(null)
      }
    },
    [reviewerIdentifier, shopVerificationService],
  )

  const requestShopChanges = useCallback(
    async (
      shopIdentifier: string,
      decisionNotes: string | null,
    ): Promise<Shop | null> => {
      setActiveDecisionKind('request_changes')
      try {
        return await runServiceActionWithToast(
          () =>
            shopVerificationService.requestShopChanges({
              shopIdentifier,
              reviewerIdentifier,
              decisionNotes,
            }),
          {
            successMessage: 'Requested changes from owner.',
            fallbackErrorMessage: 'Could not request changes.',
          },
        )
      } finally {
        setActiveDecisionKind(null)
      }
    },
    [reviewerIdentifier, shopVerificationService],
  )

  return {
    activeDecisionKind,
    approveShop,
    rejectShop,
    requestShopChanges,
  }
}
