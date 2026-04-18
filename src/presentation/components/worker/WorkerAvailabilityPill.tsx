import type { ReactElement } from 'react'
import { joinClassNames } from '../../design/classNames'

interface WorkerAvailabilityPillProps {
  readonly isAvailableForJobs: boolean
  readonly isInteractionDisabled: boolean
  readonly onAvailabilityChange: (nextAvailability: boolean) => void
}

export function WorkerAvailabilityPill({
  isAvailableForJobs,
  isInteractionDisabled,
  onAvailabilityChange,
}: WorkerAvailabilityPillProps): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isAvailableForJobs}
      disabled={isInteractionDisabled}
      onClick={() => onAvailabilityChange(!isAvailableForJobs)}
      className={joinClassNames(
        'group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        isAvailableForJobs
          ? 'border-white/20 bg-white/15 text-white hover:bg-white/20'
          : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10',
      )}
    >
      <span
        className={joinClassNames(
          'relative h-4 w-8 rounded-full transition-colors',
          isAvailableForJobs ? 'bg-[var(--color-success-500)]' : 'bg-white/30',
        )}
        aria-hidden="true"
      >
        <span
          className={joinClassNames(
            'absolute top-0.5 block h-3 w-3 rounded-full bg-white shadow transition-all',
            isAvailableForJobs ? 'left-[calc(100%-0.875rem)]' : 'left-0.5',
          )}
        />
      </span>
      {isAvailableForJobs ? 'Available' : 'Off-duty'}
    </button>
  )
}
