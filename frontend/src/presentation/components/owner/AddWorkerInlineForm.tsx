import type { ReactElement } from 'react'
import { useState } from 'react'
import { Phone, UserCircle2 } from 'lucide-react'
import type { CreateWorkerInput } from '../../../domain/models/Worker'
import { Button, Input, applicationToast } from '../../design/ui'

interface AddWorkerInlineFormProps {
  readonly isSubmitting: boolean
  readonly onCancelAddingWorker: () => void
  readonly onSubmitWorker: (createWorkerInput: CreateWorkerInput) => void
}

export function AddWorkerInlineForm({
  isSubmitting,
  onCancelAddingWorker,
  onSubmitWorker,
}: AddWorkerInlineFormProps): ReactElement {
  const [workerNameDraft, setWorkerNameDraft] = useState<string>('')
  const [workerPhoneDraft, setWorkerPhoneDraft] = useState<string>('')

  const handleSave = (): void => {
    const trimmedWorkerName = workerNameDraft.trim()
    const trimmedWorkerPhoneNumber = workerPhoneDraft.trim()
    if (
      trimmedWorkerName.length === 0 ||
      trimmedWorkerPhoneNumber.length === 0
    ) {
      applicationToast.warning('Enter both name and phone number.')
      return
    }
    onSubmitWorker({
      name: trimmedWorkerName,
      phoneNumber: trimmedWorkerPhoneNumber,
    })
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-surface)] border border-[var(--color-ink-200)] bg-[var(--color-surface-muted)] p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          name="newWorkerName"
          label="Name"
          placeholder="Full name"
          leadingIcon={<UserCircle2 className="h-4 w-4" />}
          value={workerNameDraft}
          onChange={(inputChangeEvent) =>
            setWorkerNameDraft(inputChangeEvent.target.value)
          }
        />
        <Input
          name="newWorkerPhone"
          label="Phone number"
          placeholder="e.g. +63 917 555 0101"
          leadingIcon={<Phone className="h-4 w-4" />}
          value={workerPhoneDraft}
          onChange={(inputChangeEvent) =>
            setWorkerPhoneDraft(inputChangeEvent.target.value)
          }
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancelAddingWorker}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button size="sm" isLoading={isSubmitting} onClick={handleSave}>
          Save worker
        </Button>
      </div>
    </div>
  )
}
