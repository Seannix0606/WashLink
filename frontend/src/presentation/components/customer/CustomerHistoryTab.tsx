import type { ReactElement } from 'react'
import { useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { ShopService } from '../../../application/services/ShopService'
import type { Booking } from '../../../domain/models/Booking'
import type { Shop } from '../../../domain/models/Shop'
import { useCustomerShopLookup } from '../../hooks/useCustomerShopLookup'
import { Card } from '../../design/ui'
import { CustomerBookingsSection } from './CustomerBookingsSection'
import { CustomerHistoryLoadingShell } from './CustomerHistoryLoadingShell'

interface CustomerHistoryTabProps {
  readonly shopService: ShopService
  readonly availableShops: readonly Shop[]
  readonly customerBookings: readonly Booking[]
  readonly isLoadingCustomerBookings: boolean
  readonly customerBookingsLoadErrorMessage: string | null
  readonly cancellingBookingIdentifier: string | null
  readonly submittingRatingForBookingIdentifier: string | null
  readonly onRebookFromBooking: (booking: Booking) => void
  readonly onRequestCancelBooking: (booking: Booking) => void
  readonly onRequestRateBooking: (booking: Booking) => void
}

export function CustomerHistoryTab({
  shopService,
  availableShops,
  customerBookings,
  isLoadingCustomerBookings,
  customerBookingsLoadErrorMessage,
  cancellingBookingIdentifier,
  submittingRatingForBookingIdentifier,
  onRebookFromBooking,
  onRequestCancelBooking,
  onRequestRateBooking,
}: CustomerHistoryTabProps): ReactElement {
  const { shopLookupByIdentifier } = useCustomerShopLookup(
    shopService,
    availableShops,
    customerBookings,
  )

  const handleRebook = useCallback(
    (booking: Booking): void => {
      onRebookFromBooking(booking)
    },
    [onRebookFromBooking],
  )

  if (isLoadingCustomerBookings) {
    return <CustomerHistoryLoadingShell />
  }

  if (customerBookingsLoadErrorMessage !== null) {
    return (
      <Card
        elevation="flat"
        className="flex items-start gap-3 border-[var(--color-danger-500)] bg-[var(--color-danger-50)] p-4"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-danger-500)] text-white">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-danger-600)]">
            Couldn&apos;t load your bookings
          </p>
          <p className="mt-1 text-xs text-[var(--color-ink-700)]">
            {customerBookingsLoadErrorMessage}
          </p>
        </div>
      </Card>
    )
  }

  return (
    <CustomerBookingsSection
      customerBookings={customerBookings}
      shopLookupByIdentifier={shopLookupByIdentifier}
      cancellingBookingIdentifier={cancellingBookingIdentifier}
      submittingRatingForBookingIdentifier={submittingRatingForBookingIdentifier}
      onRebookFromBooking={handleRebook}
      onRequestCancelBooking={onRequestCancelBooking}
      onRequestRateBooking={onRequestRateBooking}
    />
  )
}
