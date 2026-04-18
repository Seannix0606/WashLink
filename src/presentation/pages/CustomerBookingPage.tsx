import type { ReactElement } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { Clock3, Sparkles, User } from 'lucide-react'
import type { Booking, BookingStatus } from '../../domain/models/Booking'
import { createCustomerBookingDependencies } from '../dependencyInjection/createCustomerBookingDependencies'
import { useActiveShopsLoader } from '../hooks/useActiveShopsLoader'
import { useCustomerBookingsRealtime } from '../hooks/useCustomerBookingsRealtime'
import { useCustomerBookingCancellation } from '../hooks/useCustomerBookingCancellation'
import { useSubmitBookingRating } from '../hooks/useSubmitBookingRating'
import { useAuthenticatedUser } from '../auth/AuthenticatedUserContext'
import { AuthenticatedTopBar } from '../components/AuthenticatedTopBar'
import { CustomerBookTab } from '../components/customer/CustomerBookTab'
import { CustomerHistoryTab } from '../components/customer/CustomerHistoryTab'
import { CustomerProfilePanel } from '../components/customer/CustomerProfilePanel'
import { RateBookingModal } from '../components/rating/RateBookingModal'
import { fireCustomerBookingTransitionToast } from '../utilities/fireCustomerBookingTransitionToast'
import {
  AppShell,
  BottomNav,
  type BottomNavItemDefinition,
} from '../design/ui'

type CustomerNavTabKey = 'book' | 'history' | 'profile'

const activeBookingStatusSetForBadge: ReadonlySet<BookingStatus> =
  new Set<BookingStatus>(['pending', 'accepted', 'in_progress'])

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

  const handleBookingStatusTransitioned = useCallback(
    (updatedBooking: Booking, previousBookingStatus: BookingStatus): void => {
      fireCustomerBookingTransitionToast(updatedBooking, previousBookingStatus)
    },
    [],
  )

  const {
    customerBookings,
    isLoadingCustomerBookings,
    customerBookingsLoadErrorMessage,
  } = useCustomerBookingsRealtime(bookingService, customerIdentifier, {
    onBookingStatusTransitioned: handleBookingStatusTransitioned,
  })

  const { cancelPendingBooking, cancellingBookingIdentifier } =
    useCustomerBookingCancellation({ bookingService, customerIdentifier })

  const { submitBookingRating, submittingRatingForBookingIdentifier } =
    useSubmitBookingRating({ bookingService, customerIdentifier })

  const [bookingPendingRating, setBookingPendingRating] =
    useState<Booking | null>(null)

  const handleRequestRateBooking = useCallback((bookingToRate: Booking): void => {
    setBookingPendingRating(bookingToRate)
  }, [])

  const handleCloseRateBookingModal = useCallback((): void => {
    setBookingPendingRating(null)
  }, [])

  const handleRequestCancelBooking = useCallback(
    (bookingToCancel: Booking): void => {
      const hasUserConfirmedCancellation =
        typeof window === 'undefined'
          ? true
          : window.confirm(
              'Cancel this booking? The shop will be notified that you no longer need this wash.',
            )
      if (!hasUserConfirmedCancellation) {
        return
      }
      void cancelPendingBooking(bookingToCancel.id)
    },
    [cancelPendingBooking],
  )

  const handleRebookFromBooking = useCallback((_booking: Booking): void => {
    setActiveNavTab('book')
  }, [])

  const activeBookingsCountForHistoryBadge = useMemo<number>(() => {
    return customerBookings.filter((customerBooking) =>
      activeBookingStatusSetForBadge.has(customerBooking.bookingStatus),
    ).length
  }, [customerBookings])

  const customerNavItemDefinitions: readonly BottomNavItemDefinition<CustomerNavTabKey>[] =
    useMemo(
      () => [
        { value: 'book', label: 'Book', icon: <Sparkles className="h-5 w-5" /> },
        {
          value: 'history',
          label: 'History',
          icon: <Clock3 className="h-5 w-5" />,
          badgeCount: activeBookingsCountForHistoryBadge,
        },
        { value: 'profile', label: 'Profile', icon: <User className="h-5 w-5" /> },
      ],
      [activeBookingsCountForHistoryBadge],
    )

  const customerFullName = authenticatedUser?.fullName ?? ''

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
          shopService={shopService}
          availableShops={availableShops}
          customerBookings={customerBookings}
          isLoadingCustomerBookings={isLoadingCustomerBookings}
          customerBookingsLoadErrorMessage={customerBookingsLoadErrorMessage}
          cancellingBookingIdentifier={cancellingBookingIdentifier}
          submittingRatingForBookingIdentifier={
            submittingRatingForBookingIdentifier
          }
          onRebookFromBooking={handleRebookFromBooking}
          onRequestCancelBooking={handleRequestCancelBooking}
          onRequestRateBooking={handleRequestRateBooking}
        />
      ) : null}

      {activeNavTab === 'profile' ? (
        <CustomerProfilePanel authenticatedUser={authenticatedUser} />
      ) : null}

      <RateBookingModal
        isOpen={bookingPendingRating !== null}
        booking={bookingPendingRating}
        isSubmittingRating={
          bookingPendingRating !== null &&
          submittingRatingForBookingIdentifier === bookingPendingRating.id
        }
        onClose={handleCloseRateBookingModal}
        onSubmitRating={submitBookingRating}
      />
    </AppShell>
  )
}
