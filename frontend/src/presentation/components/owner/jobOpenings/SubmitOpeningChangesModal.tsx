import type { ReactElement } from 'react'
import { useId, useState } from 'react'
import { changeNoteSchema, firstModerationIssue } from '../../../../application/validation/moderationSchemas'
import { jobOpeningModerationLimits, type OwnerJobOpeningModeration } from '../../../../domain/models/JobOpeningModeration'
import { Button, Modal } from '../../../design/ui'
import { askWashLinkButtonLabel, askWashLinkIntro, askWashLinkTitle, changeNoteLabel } from '../../../utilities/jobOpeningModerationCopy'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'

interface SubmitOpeningChangesModalProps {
  /** The held case to submit; null closes the dialog. */
  readonly moderation: OwnerJobOpeningModeration | null
  readonly isSubmitting: boolean
  /** Resolves true when WashLink recorded the request. */
  readonly onSubmit: (moderation: OwnerJobOpeningModeration, note: string) => Promise<boolean>
  readonly onClose: () => void
}

/** D-52: after editing a held opening, the owner asks WashLink to check it, with an optional note. */
export function SubmitOpeningChangesModal({ moderation, isSubmitting, onSubmit, onClose }: SubmitOpeningChangesModalProps): ReactElement {
  const fieldId = useId()
  const [noteInput, setNoteInput] = useState<string>('')
  const [noteError, setNoteError] = useState<string | undefined>(undefined)

  const submitChanges = async (): Promise<void> => {
    if (moderation === null) {
      return
    }
    const noteProblem = firstModerationIssue(changeNoteSchema, noteInput)
    setNoteError(noteProblem)
    if (noteProblem !== undefined) {
      return
    }
    const isSubmitted = await onSubmit(moderation, noteInput)
    if (isSubmitted) {
      setNoteInput('')
      onClose()
    }
  }

  return (
    <Modal isOpen={moderation !== null} onClose={onClose} title={askWashLinkTitle}>
      <form
        aria-label={askWashLinkTitle}
        noValidate
        className="space-y-3"
        onSubmit={(submitEvent): void => {
          submitEvent.preventDefault()
          void submitChanges()
        }}
      >
        <p className="text-sm text-[var(--color-ink-700)]">{askWashLinkIntro}</p>
        <WorkerProfileTextArea
          fieldName={`${fieldId}-note`}
          label={changeNoteLabel}
          value={noteInput}
          maximumLength={jobOpeningModerationLimits.changeNoteMaxLength}
          errorText={noteError}
          rows={3}
          onValueChange={setNoteInput}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {askWashLinkButtonLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
