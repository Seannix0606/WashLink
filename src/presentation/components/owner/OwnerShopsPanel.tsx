import type { ReactElement } from 'react'
import { useState } from 'react'
import { Plus, Store } from 'lucide-react'
import type { ShopService } from '../../../application/services/ShopService'
import type { Shop } from '../../../domain/models/Shop'
import { Button, Card, EmptyState } from '../../design/ui'
import { useOwnerShopManagement } from '../../hooks/useOwnerShopManagement'
import { AddShopModal } from './AddShopModal'
import { OwnerShopListItem } from './OwnerShopListItem'

interface OwnerShopsPanelProps {
  readonly ownerIdentifier: string
  readonly shopService: ShopService
  readonly ownerShopList: readonly Shop[]
  readonly onOwnerShopListChanged: (nextOwnerShopList: Shop[]) => void
}

export function OwnerShopsPanel({
  ownerIdentifier,
  shopService,
  ownerShopList,
  onOwnerShopListChanged,
}: OwnerShopsPanelProps): ReactElement {
  const [isAddShopModalOpen, setIsAddShopModalOpen] = useState<boolean>(false)

  const {
    isSubmittingShopCreation,
    togglingShopIdentifier,
    deletingShopIdentifier,
    createShopForOwner,
    toggleShopActiveStatus,
    removeShop,
  } = useOwnerShopManagement({
    ownerIdentifier,
    shopService,
    ownerShopList,
    onOwnerShopListChanged,
  })

  return (
    <Card elevation="raised" className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
            <Store className="h-4 w-4 text-[var(--color-brand-700)]" />
            My shops
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">
            Manage the storefronts customers can book from.
          </p>
        </div>
        <Button
          size="sm"
          leadingIcon={<Plus className="h-4 w-4" />}
          onClick={() => setIsAddShopModalOpen(true)}
        >
          Add shop
        </Button>
      </header>

      {ownerShopList.length === 0 ? (
        <EmptyState
          icon={<Store className="h-5 w-5" />}
          title="No shops yet"
          description="Add a shop to start receiving bookings."
          primaryAction={
            <Button
              leadingIcon={<Plus className="h-4 w-4" />}
              onClick={() => setIsAddShopModalOpen(true)}
            >
              Add your first shop
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {ownerShopList.map((shop) => (
            <OwnerShopListItem
              key={shop.id}
              shop={shop}
              isTogglingActiveStatus={togglingShopIdentifier === shop.id}
              isDeleting={deletingShopIdentifier === shop.id}
              onToggleActiveStatus={(targetShop) =>
                void toggleShopActiveStatus(targetShop)
              }
              onRemoveShop={(targetShop) => void removeShop(targetShop)}
            />
          ))}
        </ul>
      )}

      <AddShopModal
        isOpen={isAddShopModalOpen}
        isSubmitting={isSubmittingShopCreation}
        onClose={() => setIsAddShopModalOpen(false)}
        onShopSetupSubmitted={async (createShopInput) => {
          const createdShop = await createShopForOwner(createShopInput)
          if (createdShop !== null) {
            setIsAddShopModalOpen(false)
          }
        }}
      />
    </Card>
  )
}
