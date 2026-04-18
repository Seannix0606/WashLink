import type { ReactElement } from 'react'
import { Store } from 'lucide-react'
import type { ShopVerificationService } from '../../../application/services/ShopVerificationService'
import type { Shop } from '../../../domain/models/Shop'
import { Card, EmptyState } from '../../design/ui'
import { OwnerShopVerificationCard } from './OwnerShopVerificationCard'

interface OwnerVerificationPanelProps {
  readonly ownerIdentifier: string
  readonly ownerShopList: readonly Shop[]
  readonly shopVerificationService: ShopVerificationService
  readonly onOwnerShopUpdatedAfterVerificationChange: (
    updatedShop: Shop,
  ) => void
}

export function OwnerVerificationPanel({
  ownerIdentifier,
  ownerShopList,
  shopVerificationService,
  onOwnerShopUpdatedAfterVerificationChange,
}: OwnerVerificationPanelProps): ReactElement {
  if (ownerShopList.length === 0) {
    return (
      <Card elevation="raised">
        <EmptyState
          icon={<Store className="h-5 w-5" />}
          title="Add a shop first"
          description="Once you add a shop, you can upload verification documents and submit it for review."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-base font-semibold text-[var(--color-ink-900)]">
          Verification center
        </h2>
        <p className="text-xs text-[var(--color-ink-500)]">
          Upload the required documents for each shop. Our team reviews each
          submission before your shop becomes visible to customers.
        </p>
      </header>

      {ownerShopList.map((ownerShop) => (
        <OwnerShopVerificationCard
          key={ownerShop.id}
          ownerIdentifier={ownerIdentifier}
          shop={ownerShop}
          shopVerificationService={shopVerificationService}
          onShopVerificationStatusChanged={
            onOwnerShopUpdatedAfterVerificationChange
          }
        />
      ))}
    </div>
  )
}
