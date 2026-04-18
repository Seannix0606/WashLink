import type { ReactElement } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { Clock3, Sparkles, User } from 'lucide-react'
import type { Booking } from '../../domain/models/Booking'
import { createCustomerBookingDependencies } from '../dependencyInjection/createCustomerBookingDependencies'
import { useActiveShopsLoader } from '../hooks/useActiveShopsLoader'
import { useAuthenticatedUser } from '../auth/AuthenticatedUserContext'
import { AuthenticatedTopBar } from '../components/AuthenticatedTopBar'
import { CustomerBookTab } from '../components/customer/CustomerBookTab'
import { CustomerHistoryTab } from '../components/customer/CustomerHistoryTab'
import { CustomerProfilePanel } from '../components/customer/CustomerProfilePanel'
import {
  AppShell,
  BottomNav,
  type BottomNavItemDefinition,
} from '../design/ui'

type CustomerNavTabKey = 'book' | 'history' | 'profile'

const customerNavItemDefinitions: readonly BottomNavItemDefinition<CustomerNavTabKey>[] =
  [
    { value: 'book', label: 'Book', icon: <Sparkles className="h-5 w-5" /> },
    { value: 'history', label: 'History', icon: <Clock3 className="h-5 w-5" /> },
    { value: 'profile', label: 'Profile', icon: <User className="h-5 w-5" /> },
  ]

interface CustomerBookingPageProps {
  readonly customerIdentifier: string
}

export function CustomerBookingPage({
  customerIdentifier,
}: CustomerBookingPageProps): ReactElement {
  const { authenticatedUser } = useAuthenticatedUser()
  const [activeNavTab, setActiveNavTab] = useState<CustomerNavTabKey>('book')

  const { bookingService, shopService } = useMemo(
    () => createCustomerBookingDependencies(customerIdentifier),
    [customerIdentifier],
  )

  const { availableShops, isLoadingShops } = useActiveShopsLoader(shopService)

  const customerFullName = authenticatedUser?.fullName ?? ''

  const handleRebookFromBooking = useCallback(
    (_booking: Booking): void => {
      setActiveNavTab('book')
    },
    [],
  )

  return (
    <AppShell
      topBar={<AuthenticatedTopBar />}
      bottomNav={
        <BottomNav
          navItems={customerNavItemDefinitions}
          activeNavItemValue={activeNavTab}
          onNavItemSelected={setActiveNavTab}
        />
      }
    >
      {activeNavTab === 'book' ? (
        <CustomerBookTab
          bookingService={bookingService}
          customerIdentifier={customerIdentifier}
          customerFullName={customerFullName}
          availableShops={availableShops}
          isLoadingShops={isLoadingShops}
        />
      ) : null}

      {activeNavTab === 'history' ? (
        <CustomerHistoryTab
          bookingService={bookingService}
          customerIdentifier={customerIdentifier}
          availableShops={availableShops}
          onRebookFromBooking={handleRebookFromBooking}
        />
      ) : null}

      {activeNavTab === 'profile' ? (
        <CustomerProfilePanel authenticatedUser={authenticatedUser} />
      ) : null}
    </AppShell>
  )
}
