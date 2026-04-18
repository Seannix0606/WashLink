import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { BookingService } from '../../../application/services/BookingService'
import type { Booking } from '../../../domain/models/Booking'
import type { Shop } from '../../../domain/models/Shop'
import { useCustomerBookingsRealtime } from '../../hooks/useCustomerBookingsRealtime'
import { Card } from '../../design/ui'
import { CustomerBookingsSection } from './CustomerBookingsSection'
import { CustomerHistoryLoadingShell } from './CustomerHistoryLoadingShell'

interface CustomerHistoryTabProps {
  readonly bookingService: BookingService
  readonly customerIdentifier: string
  readonly availableShops: readonly Shop[]
  readonly onRebookFromBooking: (booking: Booking) => void
}

export function CustomerHistoryTab({
  bookingService,
  customerIdentifier,
  availableShops,
  onRebookFromBooking,
}: CustomerHistoryTabProps): ReactElement {
  const {
    customerBookings,
    isLoadingCustomerBookings,
    customerBookingsLoadErrorMessage,
  } = useCustomerBookingsRealtime(bookingService, customerIdentifier)

  const shopLookupByIdentifier = useMemo<Readonly<Record<string, Shop>>>(() => {
    const nextShopLookup: Record<string, Shop> = {}
    for (const shop of availableShops) {
      nextShopLookup[shop.id] = shop
    }
    return nextShopLookup
  }, [availableShops])

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
      onRebookFromBooking={onRebookFromBooking}
    />
  )
}
