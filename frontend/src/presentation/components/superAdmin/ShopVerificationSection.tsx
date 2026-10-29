import type { ReactElement } from 'react'
import { lazy, Suspense, useCallback, useState } from 'react'
import type { AdminOversightService } from '../../../application/services/AdminOversightService'
import type { ShopService } from '../../../application/services/ShopService'
import type { ShopVerificationService } from '../../../application/services/ShopVerificationService'
import type { Shop } from '../../../domain/models/Shop'
import { Skeleton, Tabs, type TabItemDefinition } from '../../design/ui'
import { useShopReviewQueue } from '../../hooks/useShopReviewQueue'
import { ShopReviewQueueList } from './ShopReviewQueueList'
import { ShopVerificationReviewDrawer } from './ShopVerificationReviewDrawer'
import { shopReviewQueueViewLabel, shopViewToggleLabel, unreviewedShopsViewLabel } from '../../utilities/adminOversightCopy'

// W14: the "approved without a recorded review" view loads only when opened.
const UnreviewedApprovedShopsPanel = lazy(async () => {
  const unreviewedModule = await import('./shops/UnreviewedApprovedShopsPanel')
  return { default: unreviewedModule.UnreviewedApprovedShopsPanel }
})

type SuperAdminReviewScopeTabKey = 'pending' | 'all'

type ShopVerificationViewKey = 'review_queue' | 'unreviewed_approved'

const viewTabItems: readonly TabItemDefinition<ShopVerificationViewKey>[] = [
  { value: 'review_queue', label: shopReviewQueueViewLabel },
  { value: 'unreviewed_approved', label: unreviewedShopsViewLabel },
]

interface ShopVerificationSectionProps {
  readonly superAdminIdentifier: string
  readonly shopService: ShopService
  readonly shopVerificationService: ShopVerificationService
  /** W14: adds the "Approved without a recorded review" view (D-56). */
  readonly adminOversightService?: AdminOversightService
}

/** Shop verification review (moved unchanged from SuperAdminDashboardPage in W11): queue scope, list and drawer. */
export function ShopVerificationSection({
  superAdminIdentifier,
  shopService,
  shopVerificationService,
  adminOversightService,
}: ShopVerificationSectionProps): ReactElement {
  const [activeView, setActiveView] = useState<ShopVerificationViewKey>('review_queue')
  const {
    shopsInReviewQueue,
    isLoadingShopsInReviewQueue,
    shopsInReviewQueueLoadErrorMessage,
    reviewQueueScope,
    setReviewQueueScope,
    reloadShopsInReviewQueue,
    replaceShopInReviewQueueLocally,
  } = useShopReviewQueue({ shopService })

  const [shopSelectedForReview, setShopSelectedForReview] = useState<Shop | null>(null)

  const scopeTabItems: TabItemDefinition<SuperAdminReviewScopeTabKey>[] = [
    {
      value: 'pending',
      label: 'Pending',
      badgeContent: reviewQueueScope === 'pending' ? shopsInReviewQueue.length : undefined,
    },
    { value: 'all', label: 'All shops' },
  ]

  const handleScopeChanged = useCallback(
    (nextScope: SuperAdminReviewScopeTabKey): void => {
      setReviewQueueScope(nextScope)
    },
    [setReviewQueueScope],
  )

  const handleShopReviewDecisionApplied = useCallback(
    (updatedShop: Shop): void => {
      if (reviewQueueScope === 'pending') {
        void reloadShopsInReviewQueue()
      } else {
        replaceShopInReviewQueueLocally(updatedShop)
      }
    },
    [reloadShopsInReviewQueue, replaceShopInReviewQueueLocally, reviewQueueScope],
  )

  const viewToggle =
    adminOversightService === undefined ? null : (
      <div className="overflow-x-auto">
        <Tabs accessibleLabel={shopViewToggleLabel} tabItems={viewTabItems} activeTabValue={activeView} onTabChange={setActiveView} />
      </div>
    )

  if (adminOversightService !== undefined && activeView === 'unreviewed_approved') {
    return (
      <div className="space-y-4">
        {viewToggle}
        <Suspense fallback={<Skeleton heightClassName="h-40" />}>
          <UnreviewedApprovedShopsPanel adminOversightService={adminOversightService} shopVerificationService={shopVerificationService} />
        </Suspense>
      </div>
    )
  }

  return (
    <section aria-labelledby="shop-verification-heading" className="space-y-4">
      {viewToggle}
      <header className="flex flex-col gap-1">
        <h2 id="shop-verification-heading" className="text-base font-semibold text-[var(--color-ink-900)]">
          Verification review
        </h2>
        <p className="text-sm text-[var(--color-ink-500)]">
          Review shops submitted by owners, inspect their business documents, and approve or request changes.
        </p>
      </header>

      <Tabs accessibleLabel="Shop review scope" tabItems={scopeTabItems} activeTabValue={reviewQueueScope} onTabChange={handleScopeChanged} />

      <ShopReviewQueueList
        shopsInReviewQueue={shopsInReviewQueue}
        isLoadingShopsInReviewQueue={isLoadingShopsInReviewQueue}
        shopsInReviewQueueLoadErrorMessage={shopsInReviewQueueLoadErrorMessage}
        onShopSelectedForReview={setShopSelectedForReview}
      />

      <ShopVerificationReviewDrawer
        isOpen={shopSelectedForReview !== null}
        shopUnderReview={shopSelectedForReview}
        reviewerIdentifier={superAdminIdentifier}
        shopVerificationService={shopVerificationService}
        onClose={(): void => {
          setShopSelectedForReview(null)
        }}
        onShopReviewDecisionApplied={handleShopReviewDecisionApplied}
      />
    </section>
  )
}
