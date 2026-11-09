import type { ReactElement } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import type { WorkerProfileStepKey } from '../../../application/validation/workerProfileDraft'
import type {
  SaveWorkerPrivateContactInput,
  SaveWorkerProfileInput,
  WorkerPrivateContact,
  WorkerProfile,
} from '../../../domain/models/WorkerProfile'
import { Button } from '../../design/ui'
import { useWorkerProfileOnboarding } from '../../hooks/useWorkerProfileOnboarding'
import { workerProfileVisibilityNotice } from '../../utilities/workerProfileDisplay'
import { WorkerPrivateContactStep } from './WorkerPrivateContactStep'
import { WorkerProfileAboutStep } from './WorkerProfileAboutStep'
import { WorkerProfileAvailabilityStep } from './WorkerProfileAvailabilityStep'
import { WorkerProfileSkillsStep } from './WorkerProfileSkillsStep'
import type { WorkerProfileStepProps } from './workerProfileStepProps'

const stepHeadings: Readonly<Record<WorkerProfileStepKey, string>> = {
  about: 'About you',
  skills: 'Skills and locations',
  availability: 'Availability',
  contact: 'Private contact',
}

const stepComponents: Readonly<
  Record<WorkerProfileStepKey, (stepProps: WorkerProfileStepProps) => ReactElement>
> = {
  about: WorkerProfileAboutStep,
  skills: WorkerProfileSkillsStep,
  availability: WorkerProfileAvailabilityStep,
  contact: WorkerPrivateContactStep,
}

interface WorkerProfileOnboardingFlowProps {
  readonly initialWorkerProfile: WorkerProfile | null
  readonly initialWorkerPrivateContact: WorkerPrivateContact | null
  readonly submitLabel: string
  readonly onSubmitWorkerProfile: (
    workerProfileInput: SaveWorkerProfileInput,
    workerPrivateContactInput: SaveWorkerPrivateContactInput,
  ) => Promise<boolean>
  readonly onWorkerProfileSaved?: () => void
  readonly onSkip?: () => void
}

export function WorkerProfileOnboardingFlow({
  initialWorkerProfile,
  initialWorkerPrivateContact,
  submitLabel,
  onSubmitWorkerProfile,
  onWorkerProfileSaved,
  onSkip,
}: WorkerProfileOnboardingFlowProps): ReactElement {
  const {
    draft,
    currentStepKey,
    currentStepIndex,
    stepCount,
    isFirstStep,
    isLastStep,
    fieldErrors,
    isSubmittingWorkerProfile,
    updateDraft,
    goToNextStep,
    goToPreviousStep,
    submitWorkerProfile,
  } = useWorkerProfileOnboarding({
    initialWorkerProfile,
    initialWorkerPrivateContact,
    onSubmitWorkerProfile,
  })

  const CurrentStep = stepComponents[currentStepKey]

  return (
    <form
      noValidate
      aria-labelledby="worker-profile-step-heading"
      className="space-y-5"
      onSubmit={(submitEvent): void => {
        submitEvent.preventDefault()
        if (!isLastStep) {
          goToNextStep()
          return
        }
        void (async (): Promise<void> => {
          if (await submitWorkerProfile()) {
            onWorkerProfileSaved?.()
          }
        })()
      }}
    >
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-700)]">
          Step {String(currentStepIndex + 1)} of {String(stepCount)}
        </p>
        <h2
          id="worker-profile-step-heading"
          className="text-lg font-semibold text-[var(--color-ink-900)]"
        >
          {stepHeadings[currentStepKey]}
        </h2>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-ink-100)]"
          role="progressbar"
          aria-label="Profile progress"
          aria-valuemin={1}
          aria-valuemax={stepCount}
          aria-valuenow={currentStepIndex + 1}
        >
          <div
            className="h-full rounded-full bg-[var(--color-primary-soft)] transition-all"
            style={{ width: `${String(((currentStepIndex + 1) / stepCount) * 100)}%` }}
          />
        </div>
        {currentStepKey !== 'contact' ? (
          <p className="text-xs text-[var(--color-ink-500)]">{workerProfileVisibilityNotice}</p>
        ) : null}
      </header>

      <CurrentStep draft={draft} fieldErrors={fieldErrors} onDraftChange={updateDraft} />

      <footer className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {!isFirstStep ? (
            <Button
              variant="secondary"
              leadingIcon={<ArrowLeft className="h-4 w-4" />}
              onClick={goToPreviousStep}
            >
              Back
            </Button>
          ) : null}
          {onSkip ? (
            <Button variant="ghost" onClick={onSkip}>
              Skip for now
            </Button>
          ) : null}
        </div>
        <Button
          type="submit"
          isLoading={isSubmittingWorkerProfile}
          trailingIcon={
            isLastStep ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />
          }
        >
          {isLastStep ? submitLabel : 'Next'}
        </Button>
      </footer>
    </form>
  )
}
