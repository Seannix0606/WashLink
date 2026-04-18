import type { ReactElement } from 'react'
import { useCallback, useMemo, useState } from 'react'
import type { Shop } from '../../domain/models/Shop'
import { createSuperAdminDependencies } from '../dependencyInjection/createSuperAdminDependencies'
import { useShopReviewQueue } from '../hooks/useShopReviewQueue'
import { AppShell, Tabs, type TabItemDefinition } from '../design/ui'
import { AuthenticatedTopBar } from '../components/AuthenticatedTopBar'
import { ShopReviewQueueList } from '../components/superAdmin/ShopReviewQueueList'
import { ShopVerificationReviewDrawer } from '../components/superAdmin/ShopVerificationReviewDrawer'

type SuperAdminReviewScopeTabKey = 'pending' | 'all'

interface SuperAdminDashboardPageProps {
  readonly superAdminIdentifier: string
}

export function SuperAdminDashboardPage({
  superAdminIdentifier,
}: SuperAdminDashboardPageProps): ReactElement {
  const { shopService, shopVerificationService } = useMemo(
    () => createSuperAdminDependencies(),
    [],
  )

  const {
    shopsInReviewQueue,
    isLoadingShopsInReviewQueue,
    shopsInReviewQueueLoadErrorMessage,
    reviewQueueScope,
    setReviewQueueScope,
    reloadShopsInReviewQueue,
    replaceShopInReviewQueueLocally,
  } = useShopReviewQueue({ shopService })

  const [shopSelectedForReview, setShopSelectedForReview] =
    useState<Shop | null>(null)

  const scopeTabItems: TabItemDefinition<SuperAdminReviewScopeTabKey>[] = [
    {
      value: 'pending',
      label: 'Pending',
      badgeContent:
        reviewQueueScope === 'pending' ? shopsInReviewQueue.length : undefined,
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

  return (
    <AppShell topBar={<AuthenticatedTopBar />}>
      <div className="space-y-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-[var(--color-ink-900)] sm:text-3xl">
            Verification review
          </h1>
          <p className="text-sm text-[var(--color-ink-500)]">
            Review shops submitted by owners, inspect their business documents,
            and approve or request changes.
          </p>
        </header>

        <Tabs
          accessibleLabel="Shop review scope"
          tabItems={scopeTabItems}
          activeTabValue={reviewQueueScope}
          onTabChange={handleScopeChanged}
        />

        <ShopReviewQueueList
          shopsInReviewQueue={shopsInReviewQueue}
          isLoadingShopsInReviewQueue={isLoadingShopsInReviewQueue}
          shopsInReviewQueueLoadErrorMessage={
            shopsInReviewQueueLoadErrorMessage
          }
          onShopSelectedForReview={setShopSelectedForReview}
        />
      </div>

      <ShopVerificationReviewDrawer
        isOpen={shopSelectedForReview !== null}
        shopUnderReview={shopSelectedForReview}
        reviewerIdentifier={superAdminIdentifier}
        shopVerificationService={shopVerificationService}
        onClose={() => setShopSelectedForReview(null)}
        onShopReviewDecisionApplied={handleShopReviewDecisionApplied}
      />
    </AppShell>
  )
}
