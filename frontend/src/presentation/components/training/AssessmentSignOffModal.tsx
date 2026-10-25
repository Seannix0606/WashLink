import type { ReactElement } from 'react'
import { useId, useState } from 'react'
import type { TrainingAssessmentResult } from '../../../domain/models/TrainingEnrollment'
import { trainingEvidenceLimits as limits } from '../../../domain/models/TrainingEvidence'
import { Button, Modal } from '../../design/ui'
import { assessmentDecisionNotice } from '../../utilities/trainingNoticeCopy'
import { WorkerProfileTextArea } from '../workerProfile/WorkerProfileTextArea'

export interface AssessmentDecision {
  readonly itemsMet: readonly boolean[]
  readonly result: TrainingAssessmentResult
  readonly assessorComment: string
  /** Required (10 to 300 characters) for Not passed; null for Passed. */
  readonly failureReason: string | null
  /** Set only for a correction (re-assessment). */
  readonly correctionReason: string | null
}

interface AssessmentSignOffModalProps {
  readonly isOpen: boolean
  readonly traineeName: string
  readonly checklist: readonly string[]
  /** A correction of the current assessment needs a reason. */
  readonly isCorrection: boolean
  readonly isSubmitting: boolean
  readonly onSubmit: (decision: AssessmentDecision) => Promise<boolean>
  readonly onClose: () => void
  /** Overrides the dialog title (for example a W7 renewal re-assessment). */
  readonly dialogTitle?: string
}

const failureReasonError = 'Give a reason for the fail of 10 to 300 characters.'

type AssessmentFormProps = Omit<AssessmentSignOffModalProps, 'isOpen' | 'dialogTitle'>

function AssessmentForm({ traineeName, checklist, isCorrection, isSubmitting, onSubmit, onClose }: AssessmentFormProps): ReactElement {
  const formId = useId()
  // Every item starts unmarked; nothing is pre-selected.
  const [itemsMet, setItemsMet] = useState<readonly boolean[]>(() => checklist.map(() => false))
  const [result, setResult] = useState<TrainingAssessmentResult | null>(null)
  const [assessorComment, setAssessorComment] = useState<string>('')
  const [failureReason, setFailureReason] = useState<string>('')
  const [correctionReason, setCorrectionReason] = useState<string>('')
  const [formError, setFormError] = useState<string | null>(null)
  const isEveryItemMet = itemsMet.every((isItemMet) => isItemMet)
  const effectiveResult = result === 'passed' && !isEveryItemMet ? null : result

  const submitDecision = async (): Promise<void> => {
    if (effectiveResult === null) {
      setFormError('Choose Passed or Not passed. Passed needs every checklist item met.')
      return
    }
    const trimmedFailureReason = failureReason.trim()
    const isFailed = effectiveResult === 'failed'
    if (
      isFailed &&
      (trimmedFailureReason.length < limits.failureReasonMinLength ||
        trimmedFailureReason.length > limits.failureReasonMaxLength)
    ) {
      setFormError(failureReasonError)
      return
    }
    const trimmedReason = correctionReason.trim()
    if (isCorrection && (trimmedReason.length < limits.correctionReasonMinLength || trimmedReason.length > limits.correctionReasonMaxLength)) {
      setFormError('Give a correction reason of 10 to 300 characters.')
      return
    }
    setFormError(null)
    const didSubmit = await onSubmit({
      itemsMet,
      result: effectiveResult,
      assessorComment,
      failureReason: isFailed ? trimmedFailureReason : null,
      correctionReason: isCorrection ? trimmedReason : null,
    })
    if (didSubmit) {
      onClose()
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-ink-700)]">Trainee: {traineeName}</p>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-[var(--color-ink-900)]">Checklist (mark each item met)</legend>
        {checklist.map((checklistItem, itemIndex) => (
          <label key={`${String(itemIndex)}-${checklistItem}`} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={itemsMet[itemIndex] ?? false}
              onChange={(changeEvent): void => {
                const isChecked = changeEvent.target.checked
                setItemsMet((currentItems) => currentItems.map((isItemMet, index) => (index === itemIndex ? isChecked : isItemMet)))
              }}
            />
            <span className="break-words">{checklistItem}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-[var(--color-ink-900)]">Result</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${formId}-result`}
              disabled={!isEveryItemMet}
              aria-describedby={`${formId}-pass-rule`}
              checked={effectiveResult === 'passed'}
              onChange={(): void => {
                setResult('passed')
              }}
            />
            Passed
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${formId}-result`}
              checked={effectiveResult === 'failed'}
              onChange={(): void => {
                setResult('failed')
              }}
            />
            Not passed
          </label>
        </div>
        <p id={`${formId}-pass-rule`} className="text-xs text-[var(--color-ink-500)]">
          Passed is available only when every checklist item is met.
        </p>
      </fieldset>
      {effectiveResult === 'failed' ? (
        <WorkerProfileTextArea
          fieldName={`${formId}-failure-reason`}
          label="Reason for not passing (required, 10 to 300 characters)"
          value={failureReason}
          maximumLength={limits.failureReasonMaxLength}
          errorText={formError === failureReasonError ? formError : undefined}
          rows={2}
          onValueChange={setFailureReason}
        />
      ) : null}
      <WorkerProfileTextArea
        fieldName={`${formId}-comment`}
        label="Comment (optional)"
        value={assessorComment}
        maximumLength={limits.assessorCommentMaxLength}
        rows={2}
        onValueChange={setAssessorComment}
      />
      {isCorrection ? (
        <WorkerProfileTextArea
          fieldName={`${formId}-reason`}
          label="Reason for the correction (required, 10 to 300 characters)"
          value={correctionReason}
          maximumLength={limits.correctionReasonMaxLength}
          rows={2}
          onValueChange={setCorrectionReason}
        />
      ) : null}
      <p role="note" className="text-xs text-[var(--color-ink-700)]">
        {assessmentDecisionNotice}
      </p>
      {formError === null ? null : (
        <p role="alert" className="text-sm text-[var(--color-danger-600)]">
          {formError}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          isLoading={isSubmitting}
          onClick={(): void => {
            void submitDecision()
          }}
        >
          {isCorrection ? 'Record corrected assessment' : 'Record assessment'}
        </Button>
      </div>
    </div>
  )
}

/** The owner's or trainer's recorded assessment decision ("signed off" = recorded by them). */
export function AssessmentSignOffModal({ isOpen, dialogTitle, ...formProps }: AssessmentSignOffModalProps): ReactElement {
  return (
    <Modal
      isOpen={isOpen}
      onClose={formProps.onClose}
      title={dialogTitle ?? (formProps.isCorrection ? 'Correct the assessment' : 'Record the assessment')}
      maxWidthClassName="max-w-lg"
    >
      {isOpen ? <AssessmentForm {...formProps} /> : null}
    </Modal>
  )
}
