import type { ReactElement } from 'react'
import { useState } from 'react'
import { ChevronRight, ShieldQuestion } from 'lucide-react'
import type { AdminOversightService } from '../../../../application/services/AdminOversightService'
import type { ShopVerificationService } from '../../../../application/services/ShopVerificationService'
import type { UnreviewedApprovedShop } from '../../../../domain/models/AdminOversight'
import { Badge, EmptyState, Skeleton } from '../../../design/ui'
import { useUnreviewedApprovedShops } from '../../../hooks/useUnreviewedApprovedShops'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import {
  reviewerStateLabel,
  unreviewedShopsEmptyText,
  unreviewedShopsEmptyTitle,
  unreviewedShopsHeading,
  unreviewedShopsIntro,
} from '../../../utilities/adminOversightCopy'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { RereviewShopDrawer } from './RereviewShopDrawer'

interface UnreviewedApprovedShopsPanelProps {
  readonly adminOversightService: AdminOversightService
  readonly shopVerificationService: ShopVerificationService
}

/** Super_admin: approved shops without a recorded platform administrator review (D-10 row 14, D-56). */
export function UnreviewedApprovedShopsPanel({ adminOversightService, shopVerificationService }: UnreviewedApprovedShopsPanelProps): ReactElement {
  const shopsState = useUnreviewedApprovedShops(adminOversightService)
  const [selectedShop, setSelectedShop] = useState<UnreviewedApprovedShop | null>(null)

  const renderBody = (): ReactElement => {
    if (shopsState.isLoading) {
      return (
        <div aria-busy="true" aria-label="Loading approved shops without a recorded review" className="space-y-2">
          <Skeleton heightClassName="h-16" />
          <Skeleton heightClassName="h-16" />
        </div>
      )
    }
    if (shopsState.errorMessage !== null) {
      return (
        <LoadErrorNotice
          title="The approved shops could not be loaded"
          errorMessage={shopsState.errorMessage}
          onRetry={(): void => {
            void shopsState.reload()
          }}
        />
      )
    }
    if (shopsState.isEmpty) {
      return <EmptyState icon={<ShieldQuestion className="h-5 w-5" />} title={unreviewedShopsEmptyTitle} description={unreviewedShopsEmptyText} />
    }
    return (
      <ul aria-label={unreviewedShopsHeading} className="space-y-2">
        {shopsState.shops.map((shop) => (
          <li key={shop.shopId}>
            <button
              type="button"
              aria-label={`Review ${shop.shopName}`}
              onClick={(): void => {
                setSelectedShop(shop)
              }}
              className="flex w-full items-start justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-[var(--color-card)] p-3 text-left transition-colors hover:border-[var(--color-brand-400)]"
            >
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-semibold break-words text-[var(--color-ink-900)]">{shop.shopName}</span>
                <span className="block text-xs break-words text-[var(--color-ink-500)]">{`Owner: ${shop.ownerDisplayName}`}</span>
                <span className="block text-[11px] text-[var(--color-ink-500)]">
                  {`${reviewerStateLabel[shop.reviewerState]} · last decision ${
                    shop.lastDecisionAt === null ? 'not recorded' : formatShortDateTime(shop.lastDecisionAt)
                  }`}
                </span>
                <span className="block text-[11px] text-[var(--color-ink-500)]">
                  {`${String(shop.publishedOpeningCount)} published openings · ${String(shop.currentCertificationCount)} current certificates · ${String(
                    shop.activeContractCount,
                  )} active contracts · ${String(shop.suspendedRelationshipCount)} suspended relationships`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Badge tone={shop.isActive ? 'warning' : 'neutral'}>{shop.isActive ? 'Approved' : 'Approved, inactive'}</Badge>
                <ChevronRight className="h-4 w-4 text-[var(--color-ink-500)]" aria-hidden="true" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section aria-labelledby="unreviewed-shops-heading" className="space-y-4">
      <header className="flex flex-col gap-1">
        <h2 id="unreviewed-shops-heading" className="text-base font-semibold text-[var(--color-ink-900)]">
          {unreviewedShopsHeading}
        </h2>
        <p className="text-sm text-[var(--color-ink-500)]">{unreviewedShopsIntro}</p>
      </header>
      {renderBody()}
      <RereviewShopDrawer
        shop={selectedShop}
        shopVerificationService={shopVerificationService}
        isSubmitting={shopsState.isReviewing}
        onRereview={shopsState.rereview}
        onClose={(): void => {
          setSelectedShop(null)
        }}
      />
    </section>
  )
}
