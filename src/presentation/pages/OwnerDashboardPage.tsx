import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { createDashboardDependencies } from '../dependencyInjection/createDashboardDependencies'
import { useAuthenticatedUser } from '../auth/AuthenticatedUserContext'
import { useOwnerShopsBootstrap } from '../hooks/useOwnerShopsBootstrap'
import { OwnerOnboardingFlow } from '../components/onboarding/OwnerOnboardingFlow'
import { OwnerDashboardContent } from '../components/owner/OwnerDashboardContent'
import { OwnerDashboardLoadingShell } from '../components/owner/OwnerDashboardLoadingShell'

interface OwnerDashboardPageProps {
  readonly ownerIdentifier: string
}

export function OwnerDashboardPage({
  ownerIdentifier,
}: OwnerDashboardPageProps): ReactElement {
  const { authenticatedUser } = useAuthenticatedUser()
  const { bookingService, workerService, shopService } = useMemo(
    () => createDashboardDependencies(ownerIdentifier),
    [ownerIdentifier],
  )

  const {
    ownerShopList,
    isLoadingOwnerShopList,
    reloadOwnerShops,
    setOwnerShopList,
  } = useOwnerShopsBootstrap(shopService, ownerIdentifier)

  const [hasDismissedOnboarding, setHasDismissedOnboarding] =
    useState<boolean>(false)

  if (isLoadingOwnerShopList) {
    return <OwnerDashboardLoadingShell />
  }

  const shouldShowOwnerOnboardingFlow =
    ownerShopList.length === 0 && !hasDismissedOnboarding

  if (shouldShowOwnerOnboardingFlow) {
    return (
      <OwnerOnboardingFlow
        ownerIdentifier={ownerIdentifier}
        ownerDisplayName={authenticatedUser?.fullName ?? null}
        shopService={shopService}
        workerService={workerService}
        onOwnerOnboardingCompleted={() => {
          setHasDismissedOnboarding(true)
          void reloadOwnerShops()
        }}
      />
    )
  }

  return (
    <OwnerDashboardContent
      ownerIdentifier={ownerIdentifier}
      bookingService={bookingService}
      workerService={workerService}
      shopService={shopService}
      ownerShopList={ownerShopList}
      onOwnerShopListChanged={setOwnerShopList}
    />
  )
}
