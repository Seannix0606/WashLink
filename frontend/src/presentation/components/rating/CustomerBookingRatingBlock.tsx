import type { ReactElement } from 'react'
import { Sparkles, Star } from 'lucide-react'
import type { Booking } from '../../../domain/models/Booking'
import { Button } from '../../design/ui'
import { BookingRatingStars } from './BookingRatingStars'

interface CustomerBookingRatingBlockProps {
  readonly booking: Booking
  readonly isSubmittingRatingForThisBooking: boolean
  readonly onRequestRateBooking: (booking: Booking) => void
}

export function CustomerBookingRatingBlock({
  booking,
  isSubmittingRatingForThisBooking,
  onRequestRateBooking,
}: CustomerBookingRatingBlockProps): ReactElement | null {
  const hasExistingRating =
    typeof booking.customerRatingStars === 'number' &&
    booking.customerRatingStars > 0

  const isAwaitingRating =
    booking.bookingStatus === 'completed' && !hasExistingRating

  if (!hasExistingRating && !isAwaitingRating) {
    return null
  }

  if (hasExistingRating && booking.customerRatingStars !== null) {
    return (
      <div className="rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-[var(--color-surface-muted)] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-[var(--color-warning-500)]" />
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-700)]">
              Your rating
            </p>
          </div>
          <BookingRatingStars
            ratingStars={booking.customerRatingStars}
            size="sm"
          />
        </div>
        {booking.customerRatingComment ? (
          <p className="mt-2 text-sm italic text-[var(--color-ink-700)] whitespace-pre-wrap">
            &ldquo;{booking.customerRatingComment}&rdquo;
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="rounded-[var(--radius-control)] border border-dashed border-[var(--color-brand-400)] bg-[var(--color-brand-50)] p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-700)] text-white">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-sm font-semibold text-[var(--color-ink-900)]">
              How was your wash?
            </p>
            <p className="text-xs text-[var(--color-ink-700)]">
              Rate your experience to help us improve service quality.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            leadingIcon={<Star className="h-4 w-4" />}
            isLoading={isSubmittingRatingForThisBooking}
            disabled={isSubmittingRatingForThisBooking}
            onClick={() => onRequestRateBooking(booking)}
          >
            Rate your wash
          </Button>
        </div>
      </div>
    </div>
  )
}
