import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { createDashboardDependencies } from '../../presentation/dependencyInjection/createDashboardDependencies'
import { useOwnerShopsBootstrap } from '../../presentation/hooks/useOwnerShopsBootstrap'
import { OwnerDashboardContent } from '../../presentation/components/owner/OwnerDashboardContent'
import { OwnerDashboardLoadingShell } from '../../presentation/components/owner/OwnerDashboardLoadingShell'

interface OwnerDashboardPageProps {
  readonly ownerIdentifier: string
}

export function OwnerDashboardPage({
  ownerIdentifier,
}: OwnerDashboardPageProps): ReactElement {
  const { bookingService, workerService, shopService, shopVerificationService } =
    useMemo(
      () => createDashboardDependencies(ownerIdentifier),
      [ownerIdentifier],
    )

  const {
    ownerShopList,
    isLoadingOwnerShopList,
    setOwnerShopList,
  } = useOwnerShopsBootstrap(shopService, ownerIdentifier)

  if (isLoadingOwnerShopList) {
    return <OwnerDashboardLoadingShell />
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
