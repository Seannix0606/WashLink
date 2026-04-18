import type { ReactElement } from 'react'
import { Check, X } from 'lucide-react'
import type { BookingStatus } from '../../../domain/models/Booking'
import { joinClassNames } from '../../design/classNames'

interface CustomerBookingProgressTrackProps {
  readonly bookingStatus: BookingStatus
}

interface CustomerProgressStepDefinition {
  readonly stepBookingStatus: Extract<
    BookingStatus,
    'pending' | 'accepted' | 'in_progress' | 'completed'
  >
  readonly stepLabel: string
}

const customerProgressStepDefinitions: readonly CustomerProgressStepDefinition[] =
  [
    { stepBookingStatus: 'pending', stepLabel: 'Requested' },
    { stepBookingStatus: 'accepted', stepLabel: 'Accepted' },
    { stepBookingStatus: 'in_progress', stepLabel: 'In progress' },
    { stepBookingStatus: 'completed', stepLabel: 'Completed' },
  ]

function resolveActiveProgressIndex(bookingStatus: BookingStatus): number {
  if (bookingStatus === 'pending') return 0
  if (bookingStatus === 'accepted') return 1
  if (bookingStatus === 'in_progress') return 2
  if (bookingStatus === 'completed') return 3
  return -1
}

export function CustomerBookingProgressTrack({
  bookingStatus,
}: CustomerBookingProgressTrackProps): ReactElement {
  if (bookingStatus === 'rejected') {
    return (
      <div
        className="flex items-center gap-2 rounded-[var(--radius-surface)] bg-[var(--color-danger-50)] px-3 py-2 text-xs font-medium text-[var(--color-danger-600)]"
        aria-label="Booking rejected"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-danger-600)] text-white">
          <X className="h-3.5 w-3.5" />
        </span>
        This booking was declined. You can try another shop or time.
      </div>
    )
  }

  const activeProgressIndex = resolveActiveProgressIndex(bookingStatus)

  return (
    <div
      className="rounded-[var(--radius-surface)] bg-[var(--color-surface-muted)] p-3"
      aria-label="Booking progress"
    >
      <div className="flex items-center gap-2">
        {customerProgressStepDefinitions.map((stepDefinition, stepIndex) => {
          const isStepCompleted =
            activeProgressIndex >= 0 && stepIndex < activeProgressIndex
          const isStepCurrent =
            activeProgressIndex >= 0 && stepIndex === activeProgressIndex
          const isLastStep =
            stepIndex === customerProgressStepDefinitions.length - 1

          return (
            <div
              key={stepDefinition.stepBookingStatus}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <div className="flex min-w-0 flex-col items-center gap-1">
                <span
                  aria-current={isStepCurrent ? 'step' : undefined}
                  className={joinClassNames(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors',
                    isStepCompleted
                      ? 'bg-[var(--color-brand-700)] text-white'
                      : isStepCurrent
                        ? 'bg-[var(--color-brand-100)] text-[var(--color-brand-800)] ring-2 ring-[var(--color-brand-500)] ring-offset-2 ring-offset-[var(--color-surface-muted)]'
                        : 'bg-white text-[var(--color-ink-400)] ring-1 ring-[var(--color-ink-200)]',
                  )}
                >
                  {isStepCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    stepIndex + 1
                  )}
                </span>
                <span
                  className={joinClassNames(
                    'max-w-[72px] truncate text-[10px] font-medium sm:max-w-none sm:text-[11px]',
                    isStepCurrent
                      ? 'text-[var(--color-brand-800)]'
                      : isStepCompleted
                        ? 'text-[var(--color-ink-700)]'
                        : 'text-[var(--color-ink-500)]',
                  )}
                >
                  {stepDefinition.stepLabel}
                </span>
              </div>
              {!isLastStep ? (
                <div
                  aria-hidden="true"
                  className={joinClassNames(
                    'h-0.5 flex-1 rounded-full transition-colors',
                    isStepCompleted
                      ? 'bg-[var(--color-brand-700)]'
                      : 'bg-[var(--color-ink-200)]',
                  )}
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
