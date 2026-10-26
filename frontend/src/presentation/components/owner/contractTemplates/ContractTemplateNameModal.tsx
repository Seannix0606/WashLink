import type { ReactElement } from 'react'
import { useState } from 'react'
import { firstIssueMessage, templateNameSchema } from '../../../../application/validation/contractTemplateSchemas'
import { contractTemplateLimits } from '../../../../domain/models/ContractTemplate'
import { Button, Input, Modal } from '../../../design/ui'

export interface ContractTemplateNameRequest {
  readonly title: string
  readonly description: string
  readonly initialName: string
  readonly confirmButtonLabel: string
}

interface ContractTemplateNameModalProps {
  readonly request: ContractTemplateNameRequest | null
  readonly isSubmitting: boolean
  /** Resolves true when the action succeeded and the dialog may close. */
  readonly onConfirm: (name: string) => Promise<boolean>
  readonly onClose: () => void
}

type NameFormProps = Omit<ContractTemplateNameModalProps, 'request'> & { readonly request: ContractTemplateNameRequest }

function NameForm({ request, isSubmitting, onConfirm, onClose }: NameFormProps): ReactElement {
  const [name, setName] = useState<string>(request.initialName)
  const [nameError, setNameError] = useState<string | undefined>(undefined)
  const confirmName = async (): Promise<void> => {
    const nameProblem = firstIssueMessage(templateNameSchema, name)
    if (nameProblem !== null) {
      setNameError(nameProblem)
      return
    }
    setNameError(undefined)
    if (await onConfirm(templateNameSchema.parse(name))) {
      onClose()
    }
  }
  return (
    <form
      noValidate
      className="space-y-3 text-sm"
      onSubmit={(submitEvent): void => {
        submitEvent.preventDefault()
        void confirmName()
      }}
    >
      <p className="text-[var(--color-ink-700)]">{request.description}</p>
      <Input
        id="contract-template-name"
        name="contract-template-name"
        label="Template name"
        required
        value={name}
        maxLength={contractTemplateLimits.nameMaxLength}
        helperText="3 to 120 characters. Only you see this name."
        errorText={nameError}
        onChange={(changeEvent): void => {
          setName(changeEvent.target.value)
        }}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {request.confirmButtonLabel}
        </Button>
      </div>
    </form>
  )
}

/** Name a new template (from the standard or from a saved version) or rename one. */
export function ContractTemplateNameModal({ request, isSubmitting, onConfirm, onClose }: ContractTemplateNameModalProps): ReactElement {
  return (
    <Modal isOpen={request !== null} onClose={onClose} title={request?.title ?? ''}>
      {request === null ? null : (
        <NameForm key={request.title + request.initialName} request={request} isSubmitting={isSubmitting} onConfirm={onConfirm} onClose={onClose} />
      )}
    </Modal>
  )
}
