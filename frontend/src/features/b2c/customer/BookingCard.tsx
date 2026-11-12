import type { ReactElement } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import { MessageCircle, Star } from 'lucide-react'
import {
  isActiveServiceBooking,
  canCustomerCancel,
  canCustomerCancelOverdue,
  customerOverdueCancelNotice,
  formatManilaDateTime,
  formatPesos,
  type CustomerBooking,
} from '@washlink/shared'
import { Button, Card, StatusPill, statusEdgeStyle } from '../../../presentation/design/ui'
import { errorMessage, getB2cApi } from '../b2cApiClient'
import { useCurrentTime } from '../useCurrentTime'

interface BookingCardProps {
  readonly booking: CustomerBooking
  readonly onChanged: () => Promise<void>
  /** Opens this booking's conversation; shown while a washer is on the booking. */
  readonly onMessage?: (bookingId: string) => void
}

export function BookingCard({ booking, onChanged, onMessage }: BookingCardProps): ReactElement {
  const [isBusy, setIsBusy] = useState(false)
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false)
  const [rating, setRating] = useState(0)
  const isOverdue = canCustomerCancelOverdue(booking.status, booking.scheduledAt, booking.durationMinutes, useCurrentTime())

  const act = async (action: () => Promise<void>, success: string): Promise<void> => {
    setIsBusy(true)
    try {
      await action()
      toast.success(success)
      await onChanged()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setIsBusy(false)
      setIsConfirmingCancel(false)
    }
  }

  return (
    <Card className="space-y-3 p-4" style={statusEdgeStyle(booking.status)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-[var(--color-ink-900)]">{booking.serviceName}</h3>
        <StatusPill status={booking.status} />
      </div>
      <dl className="grid gap-1 text-sm text-[var(--color-ink-700)]">
        <div>{booking.isImmediate ? 'As soon as possible' : formatManilaDateTime(booking.scheduledAt)}</div>
        <div className="[overflow-wrap:anywhere]">{booking.address}</div>
        <div>{booking.vehicleMake} {booking.vehicleModel}</div>
        <div className="tabular-nums">
          {formatPesos(booking.customerTotalCents)}, pay in cash · <span className="whitespace-nowrap">Reference {booking.reference}</span>
        </div>
        {booking.workerName !== '' ? (
          <div>
            Your washer: {booking.workerName}
            {booking.workerPhone !== null ? (
              <> · <a className="font-medium text-[var(--color-brand-700)] underline" href={`tel:${booking.workerPhone}`}>Call</a></>
            ) : null}
          </div>
        ) : null}
      </dl>

      {onMessage !== undefined && booking.workerName !== '' && isActiveServiceBooking(booking.status) ? (
        <Button size="sm" variant="secondary" leadingIcon={<MessageCircle className="h-4 w-4" aria-hidden="true" />}
          onClick={(): void => { onMessage(booking.id) }}>
          Message {booking.workerName}
        </Button>
      ) : null}

      {booking.status === 'no_worker_available' ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="w-full text-sm text-[var(--color-ink-700)]">No washer accepted in time. Search again, or cancel and pick another time.</p>
          <Button size="sm" isLoading={isBusy} onClick={(): void => void act(() => getB2cApi().retrySearch(booking.id), 'Searching again')}>
            Search again
          </Button>
        </div>
      ) : null}

      {isOverdue ? <p className="text-sm text-[var(--color-ink-700)]">{customerOverdueCancelNotice}</p> : null}
      {canCustomerCancel(booking.status) || isOverdue ? (
        isConfirmingCancel ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--color-ink-700)]">Cancel this booking?</span>
            <Button size="sm" variant="danger" isLoading={isBusy} onClick={(): void => void act(() => getB2cApi().cancelBooking(booking.id), 'Booking cancelled')}>
              Cancel booking
            </Button>
            <Button size="sm" variant="ghost" onClick={(): void => { setIsConfirmingCancel(false) }}>Keep booking</Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={(): void => { setIsConfirmingCancel(true) }}>Cancel booking</Button>
        )
      ) : null}

      {booking.status === 'completed' && !booking.hasReview ? (
        <div className="flex flex-wrap items-center gap-2">
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">Rate this wash</legend>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${String(value)} out of 5`}
                aria-pressed={rating === value}
                className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)]"
                onClick={(): void => { setRating(value) }}
              >
                <Star className={value <= rating ? 'h-6 w-6 fill-[var(--color-warning-500)] text-[var(--color-warning-500)]' : 'h-6 w-6 text-[var(--color-ink-400)]'} aria-hidden="true" />
              </button>
            ))}
          </fieldset>
          <Button size="sm" disabled={rating === 0} isLoading={isBusy} onClick={(): void => void act(() => getB2cApi().reviewBooking(booking.id, rating, ''), 'Thanks for your rating')}>
            Submit rating
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
