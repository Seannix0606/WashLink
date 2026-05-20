import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { createDashboardDependencies } from '../../presentation/dependencyInjection/createDashboardDependencies'
import { useAuthenticatedUser } from '../../presentation/auth/AuthenticatedUserContext'
import { useOwnerShopsBootstrap } from '../../presentation/hooks/useOwnerShopsBootstrap'
import { OwnerOnboardingFlow } from '../../presentation/components/onboarding/OwnerOnboardingFlow'
import { OwnerDashboardContent } from '../../presentation/components/owner/OwnerDashboardContent'
import { OwnerDashboardLoadingShell } from '../../presentation/components/owner/OwnerDashboardLoadingShell'

interface OwnerDashboardPageProps {
  readonly ownerIdentifier: string
}

export function OwnerDashboardPage({
  ownerIdentifier,
}: OwnerDashboardPageProps): ReactElement {
  const { authenticatedUser } = useAuthenticatedUser()
  const { bookingService, workerService, shopService, shopVerificationService } =
    useMemo(
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
      shopVerificationService={shopVerificationService}
      ownerShopList={ownerShopList}
      onOwnerShopListChanged={setOwnerShopList}
    />
  )
}
