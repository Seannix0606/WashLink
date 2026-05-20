import type { ReactElement } from 'react'
import {
  Ban,
  CalendarClock,
  Car,
  MapPin,
  Navigation,
  RefreshCw,
  Store,
  UserRound,
} from 'lucide-react'
import type { Booking } from '../../../domain/models/Booking'
import type { Shop } from '../../../domain/models/Shop'
import { Badge, Button, Card } from '../../design/ui'
import {
  buildGoogleMapsSearchUrlForAddress,
  openExternalUrlInNewTab,
} from '../../utilities/buildExternalNavigationUrl'
import { describeBookingStatus } from '../../utilities/bookingStatusDisplay'
import { formatScheduledDateTime } from '../../utilities/datetimeFormatting'
import { BookingNotesBlock } from '../booking/BookingNotesBlock'
import { CustomerBookingRatingBlock } from '../rating/CustomerBookingRatingBlock'
import { CustomerBookingProgressTrack } from './CustomerBookingProgressTrack'

interface CustomerBookingCardProps {
  readonly booking: Booking
  readonly shopLookupByIdentifier: Readonly<Record<string, Shop>>
  readonly isCancellingBooking: boolean
  readonly isSubmittingRatingForThisBooking: boolean
  readonly onRebookFromBooking: (booking: Booking) => void
  readonly onRequestCancelBooking: (booking: Booking) => void
  readonly onRequestRateBooking: (booking: Booking) => void
}

export function CustomerBookingCard({
  booking,
  shopLookupByIdentifier,
  isCancellingBooking,
  isSubmittingRatingForThisBooking,
  onRebookFromBooking,
  onRequestCancelBooking,
  onRequestRateBooking,
}: CustomerBookingCardProps): ReactElement {
  const statusDisplay = describeBookingStatus(booking.bookingStatus)
  const scheduledTimeDisplay = formatScheduledDateTime(booking.time)

  const matchedShop =
    typeof booking.shopIdentifier === 'string'
      ? shopLookupByIdentifier[booking.shopIdentifier]
      : undefined

  const hasAssignedWorker =
    typeof booking.assignedWorkerIdentifier === 'string' &&
    booking.assignedWorkerIdentifier.length > 0
  const hasNonEmptyServiceAddress = booking.address.trim().length > 0
  const isTerminalBooking =
    booking.bookingStatus === 'completed' ||
    booking.bookingStatus === 'rejected' ||
    booking.bookingStatus === 'cancelled'
  const isCancellable = booking.bookingStatus === 'pending'

  const handleOpenAddressInMaps = (): void => {
    if (!hasNonEmptyServiceAddress) {
      return
    }
    openExternalUrlInNewTab(buildGoogleMapsSearchUrlForAddress(booking.address))
  }

  const handleRebookClicked = (): void => {
    onRebookFromBooking(booking)
  }

  const handleCancelClicked = (): void => {
    onRequestCancelBooking(booking)
  }

  return (
    <Card elevation="raised" className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-semibold text-[var(--color-ink-900)]">
            {booking.serviceType}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-[var(--color-ink-500)]">
            <CalendarClock className="h-3.5 w-3.5" />
            {scheduledTimeDisplay}
          </p>
        </div>
        <Badge tone={statusDisplay.badgeTone}>{statusDisplay.displayLabel}</Badge>
      </div>

      <CustomerBookingProgressTrack bookingStatus={booking.bookingStatus} />

      <div className="space-y-2 text-sm text-[var(--color-ink-700)]">
        <div className="flex items-start gap-2">
          <Car className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-500)]" />
          <p className="min-w-0">
            <span className="font-medium text-[var(--color-ink-900)]">
              {booking.vehicleType}
            </span>
          </p>
        </div>

        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-500)]" />
          <p className="min-w-0 flex-1 break-words">{booking.address}</p>
        </div>

        {matchedShop ? (
          <div className="flex items-start gap-2">
            <Store className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-500)]" />
            <p className="min-w-0 flex-1 break-words">
              <span className="font-medium text-[var(--color-ink-900)]">
                {matchedShop.name}
              </span>
              {matchedShop.phoneNumber ? (
                <span className="text-[var(--color-ink-500)]">
                  {' · '}
                  {matchedShop.phoneNumber}
                </span>
              ) : null}
            </p>
          </div>
        ) : null}

        {hasAssignedWorker ? (
          <div className="flex items-start gap-2">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-500)]" />
            <p className="min-w-0 flex-1">
              {booking.bookingStatus === 'in_progress'
                ? 'Your washer is working on your vehicle.'
                : 'A washer has been assigned to your booking.'}
            </p>
          </div>
        ) : null}
      </div>

      <BookingNotesBlock
        customerNotes={booking.customerNotes}
        titleText="Your notes"
      />

      <CustomerBookingRatingBlock
        booking={booking}
        isSubmittingRatingForThisBooking={isSubmittingRatingForThisBooking}
        onRequestRateBooking={onRequestRateBooking}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
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
        {isCancellable ? (
          <Button
            type="button"
            variant="danger"
            size="sm"
            isFullWidth
            leadingIcon={<Ban className="h-4 w-4" />}
            isLoading={isCancellingBooking}
            disabled={isCancellingBooking}
            onClick={handleCancelClicked}
          >
            Cancel booking
          </Button>
        ) : null}
        {isTerminalBooking ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            isFullWidth
            leadingIcon={<RefreshCw className="h-4 w-4" />}
            onClick={handleRebookClicked}
          >
            Book again
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
