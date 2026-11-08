import type { ReactElement } from 'react'
import { useId, useState } from 'react'
import type { ModerationDecisionRequest } from '../../../../application/services/JobOpeningModerationService'
import {
  adminNoteSchema,
  firstModerationIssue,
  moderationActionSchema,
  moderationReasonSchema,
  ownerMessageSchema,
} from '../../../../application/validation/moderationSchemas'
import {
  jobOpeningModerationLimits,
  jobOpeningReportCategories,
  moderationActionNeedsReason,
  type ModerationActionKind,
} from '../../../../domain/models/JobOpeningModeration'
import { Button, Select } from '../../../design/ui'
import {
  adminNoteFieldLabel,
  moderateFormTitle,
  moderateSubmitLabel,
  moderationActionFieldLabel,
  moderationActionHelpText,
  moderationActionLabel,
  moderationReasonFieldLabel,
  ownerMessageFieldLabel,
  reportCategoryLabel,
} from '../../../utilities/jobOpeningModerationCopy'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'

interface ModerateOpeningFormProps {
  readonly title?: string
  readonly availableActions: readonly ModerationActionKind[]
  readonly isSubmitting: boolean
  /** Resolves true when the decision was recorded. */
  readonly onDecide: (request: ModerationDecisionRequest) => Promise<boolean>
}

interface FieldErrors {
  readonly action?: string
  readonly reason?: string
  readonly ownerMessage?: string
  readonly adminNote?: string
}

const reasonOptions = [
  { value: '', label: 'Choose one' },
  ...jobOpeningReportCategories.map((category) => ({ value: category, label: reportCategoryLabel[category] })),
]

function validateDecision(action: string, reasonKind: string, ownerMessage: string, adminNote: string): FieldErrors {
  const actionProblem = firstModerationIssue(moderationActionSchema, action)
  if (actionProblem !== undefined) {
    return { action: actionProblem }
  }
  const actionKind = action as ModerationActionKind
  const isReasonNeeded = moderationActionNeedsReason(actionKind)
  const hasOwnerMessage = ownerMessage.trim().length > 0
  const hasAdminNote = adminNote.trim().length > 0
  return {
    reason: isReasonNeeded ? firstModerationIssue(moderationReasonSchema, reasonKind) : undefined,
    ownerMessage: isReasonNeeded || (actionKind === 'lift' && hasOwnerMessage) ? firstModerationIssue(ownerMessageSchema, ownerMessage) : undefined,
    adminNote: actionKind === 'dismiss' || hasAdminNote ? firstModerationIssue(adminNoteSchema, adminNote) : undefined,
  }
}

/**
 * A WashLink moderation decision (D-51): dismiss, pause, close, keep the pause or lift it. Pause,
 * close and keep need a reason and a message to the owner; dismiss needs an internal note.
 */
export function ModerateOpeningForm({ title = moderateFormTitle, availableActions, isSubmitting, onDecide }: ModerateOpeningFormProps): ReactElement {
  const fieldId = useId()
  const [actionInput, setActionInput] = useState<string>('')
  const [reasonInput, setReasonInput] = useState<string>('')
  const [ownerMessageInput, setOwnerMessageInput] = useState<string>('')
  const [adminNoteInput, setAdminNoteInput] = useState<string>('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const selectedAction = availableActions.find((candidate) => candidate === actionInput) ?? null
  const isReasonShown = selectedAction !== null && moderationActionNeedsReason(selectedAction)
  const isOwnerMessageShown = isReasonShown || selectedAction === 'lift'

  const actionOptions = [
    { value: '', label: 'Choose one' },
    ...availableActions.map((action) => ({ value: action, label: moderationActionLabel[action] })),
  ]

  const submitDecision = async (): Promise<void> => {
    const chosenAction = selectedAction ?? ''
    const nextErrors = validateDecision(chosenAction, reasonInput, ownerMessageInput, adminNoteInput)
    setFieldErrors(nextErrors)
    if (Object.values(nextErrors).some((fieldError) => fieldError !== undefined)) {
      return
    }
    const isRecorded = await onDecide({
      action: chosenAction,
      reasonKind: isReasonShown ? reasonInput : '',
      ownerMessage: isOwnerMessageShown ? ownerMessageInput : '',
      adminNote: adminNoteInput,
    })
    if (isRecorded) {
      setActionInput('')
      setReasonInput('')
      setOwnerMessageInput('')
      setAdminNoteInput('')
    }
  }

  return (
    <form
      aria-label={title}
      noValidate
      className="space-y-3"
      onSubmit={(submitEvent): void => {
        submitEvent.preventDefault()
        void submitDecision()
      }}
    >
      <h3 className="text-sm font-semibold text-[var(--color-ink-900)]">{title}</h3>
      <p className="text-xs text-[var(--color-ink-700)]">{moderationActionHelpText}</p>
      <Select
        id={`${fieldId}-action`}
        name="moderation-action"
        label={moderationActionFieldLabel}
        required
        options={actionOptions}
        value={actionInput}
        errorText={fieldErrors.action}
        onChange={(changeEvent): void => {
          setActionInput(changeEvent.target.value)
        }}
      />
      {isReasonShown ? (
        <Select
          id={`${fieldId}-reason`}
          name="moderation-reason"
          label={moderationReasonFieldLabel}
          required
          options={reasonOptions}
          value={reasonInput}
          errorText={fieldErrors.reason}
          onChange={(changeEvent): void => {
            setReasonInput(changeEvent.target.value)
          }}
        />
      ) : null}
      {isOwnerMessageShown ? (
        <WorkerProfileTextArea
          fieldName={`${fieldId}-owner-message`}
          label={ownerMessageFieldLabel}
          value={ownerMessageInput}
          maximumLength={jobOpeningModerationLimits.ownerMessageMaxLength}
          errorText={fieldErrors.ownerMessage}
          rows={3}
          onValueChange={setOwnerMessageInput}
        />
      ) : null}
      <WorkerProfileTextArea
        fieldName={`${fieldId}-admin-note`}
        label={adminNoteFieldLabel}
        value={adminNoteInput}
        maximumLength={jobOpeningModerationLimits.adminNoteMaxLength}
        errorText={fieldErrors.adminNote}
        rows={3}
        onValueChange={setAdminNoteInput}
      />
      <Button type="submit" isLoading={isSubmitting}>
        {moderateSubmitLabel}
      </Button>
    </form>
  )
}
