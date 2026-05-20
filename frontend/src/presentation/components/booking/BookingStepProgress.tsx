import type { ReactElement } from 'react'
import { Check } from 'lucide-react'
import { joinClassNames } from '../../design/classNames'

export interface BookingStepDefinition<StepKey extends string> {
  readonly key: StepKey
  readonly label: string
}

interface BookingStepProgressProps<StepKey extends string> {
  readonly steps: readonly BookingStepDefinition<StepKey>[]
  readonly activeStepKey: StepKey
}

export function BookingStepProgress<StepKey extends string>({
  steps,
  activeStepKey,
}: BookingStepProgressProps<StepKey>): ReactElement {
  const activeStepIndex = steps.findIndex(
    (stepDefinition) => stepDefinition.key === activeStepKey,
  )
  const safeActiveStepIndex = activeStepIndex === -1 ? 0 : activeStepIndex

  return (
    <ol className="flex w-full items-center gap-2">
      {steps.map((stepDefinition, stepIndex) => {
        const isCompleted = stepIndex < safeActiveStepIndex
        const isCurrent = stepIndex === safeActiveStepIndex
        const isLastStep = stepIndex === steps.length - 1
        return (
          <li
            key={stepDefinition.key}
            className="flex flex-1 items-center gap-2"
          >
            <div className="flex min-w-0 flex-col items-start gap-1">
              <div className="flex items-center gap-2">
                <span
                  className={joinClassNames(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                    isCompleted
                      ? 'bg-[var(--color-brand-700)] text-white'
                      : isCurrent
                        ? 'bg-[var(--color-brand-700)] text-white shadow-[var(--shadow-card)]'
                        : 'bg-[var(--color-ink-100)] text-[var(--color-ink-500)]',
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    stepIndex + 1
                  )}
                </span>
                <span
                  className={joinClassNames(
                    'hidden truncate text-xs font-medium sm:inline',
                    isCurrent || isCompleted
                      ? 'text-[var(--color-ink-900)]'
                      : 'text-[var(--color-ink-500)]',
                  )}
                >
                  {stepDefinition.label}
                </span>
              </div>
            </div>
            {!isLastStep ? (
              <span
                aria-hidden="true"
                className={joinClassNames(
                  'h-0.5 flex-1 rounded-full transition-colors',
                  isCompleted
                    ? 'bg-[var(--color-brand-600)]'
                    : 'bg-[var(--color-ink-200)]',
                )}
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
