import type { ReactElement } from 'react'
import { Car, MapPin, Navigation } from 'lucide-react'
import type { Booking } from '../../../domain/models/Booking'
import { Button } from '../../design/ui'
import {
  buildGoogleMapsSearchUrlForAddress,
  openExternalUrlInNewTab,
} from '../../utilities/buildExternalNavigationUrl'
import { BookingNotesBlock } from '../booking/BookingNotesBlock'
import { BookingRatingSummaryBlock } from '../rating/BookingRatingSummaryBlock'

interface WorkerJobCardDetailsProps {
  readonly booking: Booking
}

export function WorkerJobCardDetails({
  booking,
}: WorkerJobCardDetailsProps): ReactElement {
  const hasNonEmptyServiceAddress = booking.address.trim().length > 0

  const handleOpenAddressInMaps = (): void => {
    if (!hasNonEmptyServiceAddress) {
      return
    }
    openExternalUrlInNewTab(buildGoogleMapsSearchUrlForAddress(booking.address))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 text-sm text-[var(--color-ink-700)]">
        <Car className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-500)]" />
        <p className="min-w-0">
          <span className="font-medium text-[var(--color-ink-900)]">
            {booking.vehicleType}
          </span>
          <span className="text-[var(--color-ink-500)]"> · {booking.serviceType}</span>
        </p>
      </div>

      <div className="flex items-start gap-2 text-sm text-[var(--color-ink-700)]">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-500)]" />
        <p className="min-w-0 flex-1 break-words">{booking.address}</p>
      </div>

      <BookingNotesBlock
        customerNotes={booking.customerNotes}
        tone="highlight"
        titleText="Customer notes"
      />

      <BookingRatingSummaryBlock booking={booking} />

      <Button
        type="button"
        variant="secondary"
        size="sm"
        isFullWidth
        leadingIcon={<Navigation className="h-4 w-4" />}
        disabled={!hasNonEmptyServiceAddress}
        onClick={handleOpenAddressInMaps}
      >
        Open in Maps
      </Button>
    </div>
  )
}
