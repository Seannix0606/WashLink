import type { ReactElement } from 'react'
import { useId, useState } from 'react'
import { disputeResolutionKindSchema, disputeResolutionNoteSchema } from '../../../application/validation/oversightSchemas'
import { contractDisputeLimits, contractDisputeResolutionKinds, type ContractDisputeResolutionKind } from '../../../domain/models/ContractDispute'
import { Button, Select } from '../../design/ui'
import {
  closeDisputeButtonLabel,
  closeDisputeKindLabel,
  closeDisputeNoteGuidance,
  closeDisputeNoteLabel,
  contractDisputeResolutionLabel,
  washLinkCannotChangeContractText,
} from '../../utilities/contractDisputeCopy'
import { WorkerProfileTextArea } from '../workerProfile/WorkerProfileTextArea'

interface CloseContractDisputeFormProps {
  readonly isSubmitting: boolean
  /** Resolves true when the report was closed. */
  readonly onClose: (resolutionKind: ContractDisputeResolutionKind, resolutionNote: string) => Promise<boolean>
}

interface FieldErrors {
  readonly kind?: string
  readonly note?: string
}

const kindOptions = [
  { value: '', label: 'Choose one' },
  ...contractDisputeResolutionKinds.map((kind) => ({ value: kind, label: contractDisputeResolutionLabel[kind] })),
]

/** D-47: close with a kind and a note of 20 to 1000 characters to both parties. The contract is never changed. */
export function CloseContractDisputeForm({ isSubmitting, onClose }: CloseContractDisputeFormProps): ReactElement {
  const fieldId = useId()
  const [kindInput, setKindInput] = useState<string>('')
  const [noteInput, setNoteInput] = useState<string>('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const submitClose = async (): Promise<void> => {
    const kindResult = disputeResolutionKindSchema.safeParse(kindInput)
    const noteResult = disputeResolutionNoteSchema.safeParse(noteInput)
    setFieldErrors({
      kind: kindResult.success ? undefined : kindResult.error.issues.at(0)?.message,
      note: noteResult.success ? undefined : noteResult.error.issues.at(0)?.message,
    })
    if (!kindResult.success || !noteResult.success) {
      return
    }
    await onClose(kindResult.data, noteResult.data)
  }

  return (
    <form
      aria-label="Close this reported problem"
      noValidate
      className="space-y-3"
      onSubmit={(submitEvent): void => {
        submitEvent.preventDefault()
        void submitClose()
      }}
    >
      <p className="text-xs text-[var(--color-ink-700)]">{washLinkCannotChangeContractText}</p>
      <Select
        id={`${fieldId}-kind`}
        name="resolution-kind"
        label={closeDisputeKindLabel}
        required
        options={kindOptions}
        value={kindInput}
        errorText={fieldErrors.kind}
        onChange={(changeEvent): void => {
          setKindInput(changeEvent.target.value)
        }}
      />
      <WorkerProfileTextArea
        fieldName={`${fieldId}-note`}
        label={closeDisputeNoteLabel}
        value={noteInput}
        maximumLength={contractDisputeLimits.noteMaxLength}
        errorText={fieldErrors.note}
        rows={4}
        onValueChange={setNoteInput}
      />
      <p className="text-xs text-[var(--color-ink-500)]">{closeDisputeNoteGuidance}</p>
      <Button type="submit" isLoading={isSubmitting}>
        {closeDisputeButtonLabel}
      </Button>
    </form>
  )
}
