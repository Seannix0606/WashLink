import type { ReactElement } from 'react'
import { Check } from 'lucide-react'
import type { BookingStatus } from '../../../domain/models/Booking'
import { joinClassNames } from '../../design/classNames'

interface WorkerJobProgressStepsProps {
  readonly bookingStatus: BookingStatus
}

interface WorkerJobProgressStepDefinition {
  readonly stepBookingStatus: Extract<
    BookingStatus,
    'accepted' | 'in_progress' | 'completed'
  >
  readonly stepLabel: string
}

const workerJobProgressStepDefinitions: readonly WorkerJobProgressStepDefinition[] =
  [
    { stepBookingStatus: 'accepted', stepLabel: 'Accepted' },
    { stepBookingStatus: 'in_progress', stepLabel: 'In progress' },
    { stepBookingStatus: 'completed', stepLabel: 'Completed' },
  ]

function resolveActiveProgressIndex(bookingStatus: BookingStatus): number {
  if (bookingStatus === 'accepted') return 0
  if (bookingStatus === 'in_progress') return 1
  if (bookingStatus === 'completed') return 2
  return -1
}

export function WorkerJobProgressSteps({
  bookingStatus,
}: WorkerJobProgressStepsProps): ReactElement {
  const activeProgressIndex = resolveActiveProgressIndex(bookingStatus)

  return (
    <div
      className="rounded-[var(--radius-surface)] bg-[var(--color-surface-muted)] p-3"
      aria-label="Job progress"
    >
      <div className="flex items-center gap-2">
        {workerJobProgressStepDefinitions.map((stepDefinition, stepIndex) => {
          const isStepCompleted =
            activeProgressIndex >= 0 && stepIndex < activeProgressIndex
          const isStepCurrent =
            activeProgressIndex >= 0 && stepIndex === activeProgressIndex
          const isLastStep =
            stepIndex === workerJobProgressStepDefinitions.length - 1

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
