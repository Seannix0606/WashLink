import type { ReactElement } from 'react'
import { useId, useState } from 'react'
import { platformReviewDecisionSchema, platformReviewReasonSchema } from '../../../application/validation/oversightSchemas'
import { platformReviewLimits, type PlatformReviewDecision } from '../../../domain/models/CertificationPlatformReview'
import { Button } from '../../design/ui'
import {
  decideButtonLabel,
  decideNoIssuerCheckText,
  decideReasonGuidance,
  decideReasonLabel,
  decideReinstateLabel,
  decideUpholdLabel,
} from '../../utilities/platformReviewCopy'
import { WorkerProfileTextArea } from '../workerProfile/WorkerProfileTextArea'

interface DecidePlatformReviewFormProps {
  readonly isSubmitting: boolean
  /** Resolves true when the decision was recorded. */
  readonly onDecide: (decision: PlatformReviewDecision, reason: string) => Promise<boolean>
}

interface FieldErrors {
  readonly decision?: string
  readonly reason?: string
}

const decisionOptions: readonly { readonly value: PlatformReviewDecision; readonly label: string }[] = [
  { value: 'reinstate', label: decideReinstateLabel },
  { value: 'uphold', label: decideUpholdLabel },
]

/** D-45: reinstate or keep the shop decision, with a reason of 20 to 500 characters. Nothing is sent before both are valid. */
export function DecidePlatformReviewForm({ isSubmitting, onDecide }: DecidePlatformReviewFormProps): ReactElement {
  const fieldId = useId()
  const [decisionInput, setDecisionInput] = useState<string>('')
  const [reasonInput, setReasonInput] = useState<string>('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const submitDecision = async (): Promise<void> => {
    const decisionResult = platformReviewDecisionSchema.safeParse(decisionInput)
    const reasonResult = platformReviewReasonSchema.safeParse(reasonInput)
    setFieldErrors({
      decision: decisionResult.success ? undefined : decisionResult.error.issues.at(0)?.message,
      reason: reasonResult.success ? undefined : reasonResult.error.issues.at(0)?.message,
    })
    if (!decisionResult.success || !reasonResult.success) {
      return
    }
    const isDecided = await onDecide(decisionResult.data, reasonResult.data)
    if (isDecided) {
      setDecisionInput('')
      setReasonInput('')
    }
  }

  return (
    <form
      aria-label="Decide this WashLink review"
      noValidate
      className="space-y-3"
      onSubmit={(submitEvent): void => {
        submitEvent.preventDefault()
        void submitDecision()
      }}
    >
      <fieldset className="space-y-2" aria-describedby={`${fieldId}-decision-error`}>
        <legend className="text-sm font-medium text-[var(--color-ink-900)]">Decision</legend>
        {decisionOptions.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm text-[var(--color-ink-900)]">
            <input
              type="radio"
              name={`${fieldId}-decision`}
              value={option.value}
              checked={decisionInput === option.value}
              onChange={(): void => {
                setDecisionInput(option.value)
              }}
            />
            {option.label}
          </label>
        ))}
        <p id={`${fieldId}-decision-error`} role={fieldErrors.decision === undefined ? undefined : 'alert'} className="text-xs text-[var(--color-danger-500)]">
          {fieldErrors.decision ?? ''}
        </p>
      </fieldset>
      <p className="text-xs text-[var(--color-ink-500)]">{decideNoIssuerCheckText}</p>
      <WorkerProfileTextArea
        fieldName={`${fieldId}-reason`}
        label={decideReasonLabel}
        value={reasonInput}
        maximumLength={platformReviewLimits.reasonMaxLength}
        errorText={fieldErrors.reason}
        rows={4}
        onValueChange={setReasonInput}
      />
      <p className="text-xs text-[var(--color-ink-500)]">{decideReasonGuidance}</p>
      <Button type="submit" isLoading={isSubmitting}>
        {decideButtonLabel}
      </Button>
    </form>
  )
}
