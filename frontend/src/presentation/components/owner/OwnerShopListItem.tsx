import type { ReactElement } from 'react'
import { MapPin, Phone, PowerOff, Trash2 } from 'lucide-react'
import type { Shop } from '../../../domain/models/Shop'
import { Badge, Button } from '../../design/ui'

interface OwnerShopListItemProps {
  readonly shop: Shop
  readonly isTogglingActiveStatus: boolean
  readonly isDeleting: boolean
  readonly onToggleActiveStatus: (shop: Shop) => void
  readonly onRemoveShop: (shop: Shop) => void
}

export function OwnerShopListItem({
  shop,
  isTogglingActiveStatus,
  isDeleting,
  onToggleActiveStatus,
  onRemoveShop,
}: OwnerShopListItemProps): ReactElement {
  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-surface)] border border-[var(--color-ink-200)] bg-white p-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-[var(--color-ink-900)]">
            {shop.name}
          </p>
          <Badge tone={shop.isActive ? 'success' : 'neutral'}>
            {shop.isActive ? 'Active' : 'Hidden'}
          </Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-ink-500)]">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            <span className="max-w-[260px] truncate">{shop.address}</span>
          </span>
          {shop.phoneNumber ? (
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {shop.phoneNumber}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<PowerOff className="h-4 w-4" />}
          isLoading={isTogglingActiveStatus}
          onClick={() => onToggleActiveStatus(shop)}
        >
          {shop.isActive ? 'Hide' : 'Show'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<Trash2 className="h-4 w-4" />}
          isLoading={isDeleting}
          onClick={() => onRemoveShop(shop)}
          className="text-[var(--color-danger-500)] hover:bg-[var(--color-danger-50)]"
        >
          Remove
        </Button>
      </div>
    </li>
  )
}
