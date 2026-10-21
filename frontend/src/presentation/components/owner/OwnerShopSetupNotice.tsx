import type { ReactElement } from 'react'
import { ArrowRight, Store } from 'lucide-react'
import type { Shop } from '../../../domain/models/Shop'
import { Button } from '../../design/ui'
import { shopHasCompletePricing } from '../../../domain/utilities/shopPricing'

interface OwnerShopSetupNoticeProps {
  readonly ownerShopList: readonly Shop[]
  readonly onSetupRequested: () => void
}

export function OwnerShopSetupNotice({
  ownerShopList,
  onSetupRequested,
}: OwnerShopSetupNoticeProps): ReactElement | null {
  const hasShopWithoutCompletePricing = ownerShopList.some(
    (shop) => !shopHasCompletePricing(shop),
  )

  if (ownerShopList.length > 0 && !hasShopWithoutCompletePricing) {
    return null
  }

  const hasNoShops = ownerShopList.length === 0

  return (
    <section
      aria-labelledby="owner-shop-setup-title"
      className="flex flex-col gap-4 rounded-[var(--radius-surface)] border border-[var(--color-warning-500)]/40 bg-[var(--color-warning-50)] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--color-warning-600)]">
          <Store className="h-5 w-5" />
        </span>
        <div>
          <h2
            id="owner-shop-setup-title"
            className="text-sm font-semibold text-[var(--color-ink-900)]"
          >
            {hasNoShops
              ? 'Set up your car wash'
              : 'Finish setting up your car wash rates'}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink-700)]">
            {hasNoShops
              ? 'Add your shop details and prices so customers can find and book your car wash.'
              : 'Add prices for every vehicle and wash package so customers can book your shop.'}
          </p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        trailingIcon={<ArrowRight className="h-4 w-4" />}
        onClick={onSetupRequested}
        className="shrink-0"
      >
        {hasNoShops ? 'Set up my car wash' : 'Finish setup'}
      </Button>
    </section>
  )
}
