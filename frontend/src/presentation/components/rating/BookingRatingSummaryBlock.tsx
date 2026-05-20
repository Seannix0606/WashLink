import type { ReactElement } from 'react'
import type { Booking } from '../../../domain/models/Booking'
import { BookingRatingStars } from './BookingRatingStars'

interface BookingRatingSummaryBlockProps {
  readonly booking: Booking
  readonly titleText?: string
}

export function BookingRatingSummaryBlock({
  booking,
  titleText = 'Customer rating',
}: BookingRatingSummaryBlockProps): ReactElement | null {
  if (
    typeof booking.customerRatingStars !== 'number' ||
    booking.customerRatingStars <= 0
  ) {
    return null
  }

  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--color-warning-500)]/40 bg-[var(--color-warning-50)] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-warning-600)]">
          {titleText}
        </p>
        <BookingRatingStars
          ratingStars={booking.customerRatingStars}
          size="sm"
        />
      </div>
      {booking.customerRatingComment ? (
        <p className="mt-1.5 text-sm italic text-[var(--color-ink-700)] whitespace-pre-wrap">
          &ldquo;{booking.customerRatingComment}&rdquo;
        </p>
      ) : null}
    </div>
  )
}
