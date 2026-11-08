import type { ReactElement } from 'react'
import { useState } from 'react'
import { firstIssueMessage } from '../../../application/validation/contractTemplateSchemas'
import { terminationReasonSchema } from '../../../application/validation/workerContractSchemas'
import { workerContractLimits } from '../../../domain/models/WorkerContract'
import { Button, Modal } from '../../design/ui'
import { ownerTerminateText, workerTerminateText } from '../../utilities/workerContractCopy'
import type { ContractViewerRole } from '../../utilities/workerContractDisplay'
import { WorkerProfileTextArea } from '../workerProfile/WorkerProfileTextArea'

interface TerminateContractModalProps {
  readonly isOpen: boolean
  readonly viewerRole: ContractViewerRole
  readonly subjectText: string
  readonly isSubmitting: boolean
  /** Resolves true when the contract was ended (the modal then closes). */
  readonly onConfirm: (reason: string) => Promise<boolean>
  readonly onCancel: () => void
}

function TerminateForm({ viewerRole, subjectText, isSubmitting, onConfirm, onCancel }: Omit<TerminateContractModalProps, 'isOpen'>): ReactElement {
  const [reason, setReason] = useState<string>('')
  const [reasonError, setReasonError] = useState<string | undefined>(undefined)
  const confirmWithReason = (): void => {
    const reasonProblem = firstIssueMessage(terminationReasonSchema, reason)
    if (reasonProblem !== null) {
      setReasonError(reasonProblem)
      return
    }
    setReasonError(undefined)
    void onConfirm(reason.trim())
  }
  return (
    <form
      aria-label="End the contract"
      className="space-y-3 text-sm"
      onSubmit={(submitEvent): void => {
        submitEvent.preventDefault()
        confirmWithReason()
      }}
    >
      <p className="font-medium break-words text-[var(--color-ink-900)]">{subjectText}</p>
      <p className="text-[var(--color-ink-700)]">{viewerRole === 'worker' ? workerTerminateText : ownerTerminateText}</p>
      <WorkerProfileTextArea
        fieldName="contract-termination-reason"
        label="Reason (10 to 500 characters)"
        value={reason}
        maximumLength={workerContractLimits.terminationReasonMaxLength}
        errorText={reasonError}
        rows={3}
        onValueChange={setReason}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" isLoading={isSubmitting}>
          End contract
        </Button>
      </div>
    </form>
  )
}

/** Ending an accepted or active contract: a reason of 10 to 500 characters, nothing else. */
export function TerminateContractModal({ isOpen, onCancel, ...formProps }: TerminateContractModalProps): ReactElement {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="End this contract">
      {isOpen ? <TerminateForm onCancel={onCancel} {...formProps} /> : null}
    </Modal>
  )
}
