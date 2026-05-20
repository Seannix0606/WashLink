import type { ReactElement } from 'react'
import { Star } from 'lucide-react'
import { joinClassNames } from '../../design/classNames'

type BookingRatingStarsSize = 'sm' | 'md' | 'lg'

interface BookingRatingStarsProps {
  readonly ratingStars: number
  readonly size?: BookingRatingStarsSize
  readonly accessibleLabel?: string
}

const starIconClassNameBySize: Record<BookingRatingStarsSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
}

const totalStarCount = 5

export function BookingRatingStars({
  ratingStars,
  size = 'md',
  accessibleLabel,
}: BookingRatingStarsProps): ReactElement {
  const clampedRatingStars = Math.max(
    0,
    Math.min(totalStarCount, Math.round(ratingStars)),
  )
  const computedAccessibleLabel =
    accessibleLabel ?? `Rated ${clampedRatingStars} out of ${totalStarCount} stars`
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={computedAccessibleLabel}
      role="img"
    >
      {Array.from({ length: totalStarCount }).map((_, starIndex) => {
        const isFilled = starIndex < clampedRatingStars
        return (
          <Star
            key={starIndex}
            aria-hidden="true"
            className={joinClassNames(
              starIconClassNameBySize[size],
              isFilled
                ? 'fill-[var(--color-warning-500)] text-[var(--color-warning-500)]'
                : 'text-[var(--color-ink-300)]',
            )}
          />
        )
      })}
    </span>
  )
}
