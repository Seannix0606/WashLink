import type { ReactElement } from 'react'
import { useState } from 'react'
import { Star } from 'lucide-react'
import { joinClassNames } from '../../design/classNames'

interface BookingRatingStarInputProps {
  readonly selectedRatingStars: number
  readonly onRatingStarsChanged: (nextRatingStars: number) => void
  readonly isDisabled?: boolean
}

const totalStarCount = 5

const starButtonAccessibleLabelByStarCount: Record<number, string> = {
  1: 'Rate 1 star — Poor',
  2: 'Rate 2 stars — Fair',
  3: 'Rate 3 stars — Good',
  4: 'Rate 4 stars — Great',
  5: 'Rate 5 stars — Excellent',
}

const ratingDescriptionByStarCount: Record<number, string> = {
  0: 'Tap a star to rate',
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Great',
  5: 'Excellent',
}

export function BookingRatingStarInput({
  selectedRatingStars,
  onRatingStarsChanged,
  isDisabled = false,
}: BookingRatingStarInputProps): ReactElement {
  const [hoveredRatingStars, setHoveredRatingStars] = useState<number>(0)
  const effectiveRatingStarsForDisplay =
    hoveredRatingStars > 0 ? hoveredRatingStars : selectedRatingStars

  return (
    <div className="space-y-1.5">
      <div
        className="flex items-center gap-1"
        onMouseLeave={() => setHoveredRatingStars(0)}
      >
        {Array.from({ length: totalStarCount }).map((_, starIndex) => {
          const starValue = starIndex + 1
          const isHighlighted = starValue <= effectiveRatingStarsForDisplay
          return (
            <button
              key={starValue}
              type="button"
              aria-label={starButtonAccessibleLabelByStarCount[starValue]}
              aria-pressed={starValue === selectedRatingStars}
              disabled={isDisabled}
              onClick={() => onRatingStarsChanged(starValue)}
              onMouseEnter={() => setHoveredRatingStars(starValue)}
              onFocus={() => setHoveredRatingStars(starValue)}
              onBlur={() => setHoveredRatingStars(0)}
              className={joinClassNames(
                'flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] transition-all',
                'disabled:cursor-not-allowed disabled:opacity-60',
                isHighlighted
                  ? 'scale-110'
                  : 'hover:bg-[var(--color-surface-muted)]',
              )}
            >
              <Star
                className={joinClassNames(
                  'h-7 w-7 transition-colors',
                  isHighlighted
                    ? 'fill-[var(--color-warning-500)] text-[var(--color-warning-500)]'
                    : 'text-[var(--color-ink-300)]',
                )}
              />
            </button>
          )
        })}
      </div>
      <p className="text-xs font-medium text-[var(--color-ink-500)]">
        {ratingDescriptionByStarCount[effectiveRatingStarsForDisplay] ??
          ratingDescriptionByStarCount[0]}
      </p>
    </div>
  )
}
