import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { Booking } from '../../../domain/models/Booking'
import { Button, Modal } from '../../design/ui'
import { BookingRatingStarInput } from './BookingRatingStarInput'

const ratingCommentCharacterLimit = 280

interface RateBookingModalProps {
  readonly isOpen: boolean
  readonly booking: Booking | null
  readonly isSubmittingRating: boolean
  readonly onClose: () => void
  readonly onSubmitRating: (submitRatingInput: {
    readonly bookingIdentifier: string
    readonly ratingStars: number
    readonly ratingComment: string | null
  }) => Promise<boolean>
}

export function RateBookingModal({
  isOpen,
  booking,
  isSubmittingRating,
  onClose,
  onSubmitRating,
}: RateBookingModalProps): ReactElement {
  const [selectedRatingStars, setSelectedRatingStars] = useState<number>(0)
  const [draftRatingComment, setDraftRatingComment] = useState<string>('')

  useEffect(() => {
    if (!isOpen) {
      return
    }
    setSelectedRatingStars(0)
    setDraftRatingComment('')
  }, [isOpen, booking?.id])

  const isSubmitRatingDisabled =
    booking === null ||
    selectedRatingStars < 1 ||
    selectedRatingStars > 5 ||
    isSubmittingRating

  const handleSubmitRating = async (): Promise<void> => {
    if (booking === null) {
      return
    }
    if (selectedRatingStars < 1) {
      return
    }
    const trimmedRatingComment = draftRatingComment.trim()
    const wasRatingSubmitted = await onSubmitRating({
      bookingIdentifier: booking.id,
      ratingStars: selectedRatingStars,
      ratingComment:
        trimmedRatingComment.length > 0 ? trimmedRatingComment : null,
    })
    if (wasRatingSubmitted) {
      onClose()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Rate your wash"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isSubmittingRating}
          >
            Not now
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSubmitRating()}
            disabled={isSubmitRatingDisabled}
            isLoading={isSubmittingRating}
          >
            Submit rating
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {booking !== null ? (
          <div className="rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-[var(--color-surface-muted)] p-3">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--color-ink-500)]">
              Booking
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--color-ink-900)]">
              {booking.serviceType}
            </p>
            <p className="text-xs text-[var(--color-ink-700)]">
              {booking.vehicleType} · {booking.address}
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-sm font-semibold text-[var(--color-ink-900)]">
            How was your wash?
          </p>
          <BookingRatingStarInput
            selectedRatingStars={selectedRatingStars}
            onRatingStarsChanged={setSelectedRatingStars}
            isDisabled={isSubmittingRating}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="booking-rating-comment"
            className="text-sm font-semibold text-[var(--color-ink-900)]"
          >
            Leave a comment{' '}
            <span className="font-normal text-[var(--color-ink-500)]">
              (optional)
            </span>
          </label>
          <textarea
            id="booking-rating-comment"
            rows={3}
            maxLength={ratingCommentCharacterLimit}
            value={draftRatingComment}
            onChange={(event) => setDraftRatingComment(event.target.value)}
            disabled={isSubmittingRating}
            placeholder="Tell us what went well, or what could be better."
            className="w-full rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-white px-3 py-2 text-sm text-[var(--color-ink-900)] placeholder:text-[var(--color-ink-400)] focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-200)] disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p className="text-right text-[11px] text-[var(--color-ink-500)]">
            {draftRatingComment.length}/{ratingCommentCharacterLimit}
          </p>
        </div>
      </div>
    </Modal>
  )
}
