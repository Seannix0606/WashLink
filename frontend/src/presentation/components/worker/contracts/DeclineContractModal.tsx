import type { ReactElement } from 'react'
import { useState } from 'react'
import { firstIssueMessage } from '../../../../application/validation/contractTemplateSchemas'
import { declineNoteSchema } from '../../../../application/validation/workerContractSchemas'
import { workerContractLimits } from '../../../../domain/models/WorkerContract'
import { Button, Modal } from '../../../design/ui'
import { declineAmendmentText, declineOfferText } from '../../../utilities/workerContractCopy'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'

interface DeclineContractModalProps {
  readonly isAmendment: boolean
  readonly shopName: string
  readonly isSubmitting: boolean
  /** Resolves true when the decline was recorded. */
  readonly onConfirm: (note: string) => Promise<boolean>
  readonly onCancel: () => void
}

/** Decline an offer or a proposed change. Always available while it is waiting; the note is optional. */
export function DeclineContractModal({ isAmendment, shopName, isSubmitting, onConfirm, onCancel }: DeclineContractModalProps): ReactElement {
  const [note, setNote] = useState<string>('')
  const [noteError, setNoteError] = useState<string | undefined>(undefined)
  const title = isAmendment ? 'Decline the proposed change' : 'Decline this offer'
  return (
    <Modal isOpen onClose={onCancel} title={title}>
      <form
        aria-label={title}
        className="space-y-3 text-sm"
        onSubmit={(submitEvent): void => {
          submitEvent.preventDefault()
          const noteProblem = firstIssueMessage(declineNoteSchema, note)
          setNoteError(noteProblem ?? undefined)
          if (noteProblem === null) {
            void onConfirm(note)
          }
        }}
      >
        <p className="font-medium text-[var(--color-ink-900)]">{shopName}</p>
        <p className="text-[var(--color-ink-700)]">{isAmendment ? declineAmendmentText : declineOfferText}</p>
        <WorkerProfileTextArea
          fieldName="contract-decline-note"
          label="Note to the shop (optional, up to 500 characters)"
          value={note}
          maximumLength={workerContractLimits.declineNoteMaxLength}
          errorText={noteError}
          rows={3}
          onValueChange={setNote}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" isLoading={isSubmitting}>
            {isAmendment ? 'Decline change' : 'Decline offer'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
