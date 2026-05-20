import { useCallback, useState } from 'react'
import type { ShopService } from '../../application/services/ShopService'
import type { CreateShopInput, Shop } from '../../domain/models/Shop'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'

interface UseOwnerShopManagementOptions {
  readonly ownerIdentifier: string
  readonly shopService: ShopService
  readonly ownerShopList: readonly Shop[]
  readonly onOwnerShopListChanged: (nextOwnerShopList: Shop[]) => void
}

interface UseOwnerShopManagementResult {
  readonly isSubmittingShopCreation: boolean
  readonly togglingShopIdentifier: string | null
  readonly deletingShopIdentifier: string | null
  readonly createShopForOwner: (createShopInput: CreateShopInput) => Promise<Shop | null>
  readonly toggleShopActiveStatus: (shop: Shop) => Promise<void>
  readonly removeShop: (shop: Shop) => Promise<void>
}

export function useOwnerShopManagement({
  ownerIdentifier,
  shopService,
  ownerShopList,
  onOwnerShopListChanged,
}: UseOwnerShopManagementOptions): UseOwnerShopManagementResult {
  const [isSubmittingShopCreation, setIsSubmittingShopCreation] =
    useState<boolean>(false)
  const [togglingShopIdentifier, setTogglingShopIdentifier] = useState<
    string | null
  >(null)
  const [deletingShopIdentifier, setDeletingShopIdentifier] = useState<
    string | null
  >(null)

  const createShopForOwner = useCallback(
    async (createShopInput: CreateShopInput): Promise<Shop | null> => {
      setIsSubmittingShopCreation(true)
      const createdShop = await runServiceActionWithToast(
        () =>
          shopService.createShopForOwner(ownerIdentifier, createShopInput),
        {
          successMessage: (persistedShop) => `${persistedShop.name} added.`,
          fallbackErrorMessage: 'Could not create this shop.',
        },
      )
      setIsSubmittingShopCreation(false)
      if (createdShop !== null) {
        onOwnerShopListChanged([...ownerShopList, createdShop])
      }
      return createdShop
    },
    [ownerIdentifier, shopService, ownerShopList, onOwnerShopListChanged],
  )

  const toggleShopActiveStatus = useCallback(
    async (shop: Shop): Promise<void> => {
      setTogglingShopIdentifier(shop.id)
      const updatedShop = await runServiceActionWithToast(
        () => shopService.updateShop(shop.id, { isActive: !shop.isActive }),
        {
          successMessage: (nextShop) =>
            nextShop.isActive
              ? `${nextShop.name} is now visible to customers.`
              : `${nextShop.name} is now hidden from customers.`,
          fallbackErrorMessage: 'Could not update this shop.',
        },
      )
      setTogglingShopIdentifier(null)
      if (updatedShop !== null) {
        onOwnerShopListChanged(
          ownerShopList.map((existingShop) =>
            existingShop.id === updatedShop.id ? updatedShop : existingShop,
          ),
        )
      }
    },
    [shopService, ownerShopList, onOwnerShopListChanged],
  )

  const removeShop = useCallback(
    async (shop: Shop): Promise<void> => {
      const shouldDelete =
        typeof window === 'undefined'
          ? true
          : window.confirm(
              `Remove ${shop.name}? Customers will no longer be able to book this shop.`,
            )
      if (!shouldDelete) {
        return
      }
      setDeletingShopIdentifier(shop.id)
      const deleteActionResult = await runServiceActionWithToast(
        () => shopService.deleteShop(shop.id),
        {
          successMessage: `${shop.name} removed.`,
          fallbackErrorMessage: 'Could not remove this shop.',
        },
      )
      setDeletingShopIdentifier(null)
      if (deleteActionResult !== null) {
        onOwnerShopListChanged(
          ownerShopList.filter((existingShop) => existingShop.id !== shop.id),
        )
      }
    },
    [shopService, ownerShopList, onOwnerShopListChanged],
  )

  return {
    isSubmittingShopCreation,
    togglingShopIdentifier,
    deletingShopIdentifier,
    createShopForOwner,
    toggleShopActiveStatus,
    removeShop,
  }
}
