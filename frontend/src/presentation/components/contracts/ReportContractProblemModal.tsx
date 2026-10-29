import type { ReactElement } from 'react'
import { useId, useState } from 'react'
import { Scale } from 'lucide-react'
import type { ReportContractProblemRequest } from '../../../application/services/ContractDisputeService'
import { disputeCategorySchema, disputeStatementSchema } from '../../../application/validation/oversightSchemas'
import { contractDisputeCategoriesFor, contractDisputeLimits } from '../../../domain/models/ContractDispute'
import type { ContractEndedBy, ContractPartyRole } from '../../../domain/models/WorkerContract'
import { Button, Modal, Select } from '../../design/ui'
import {
  contractDisputeCategoryLabel,
  problemCategoryLabel,
  problemCategoryPlaceholder,
  problemStatementGuidance,
  problemStatementLabel,
  reportProblemIntro,
  reportProblemTitle,
  reportProblemWindowText,
  sendProblemButtonLabel,
  washLinkCannotChangeContractText,
} from '../../utilities/contractDisputeCopy'
import { WorkerProfileTextArea } from '../workerProfile/WorkerProfileTextArea'

export interface ReportContractProblemTarget {
  readonly contractId: string
  /** The other party or shop, for the dialog subject line (a name snapshot both parties already see). */
  readonly subjectText: string
  readonly raiserRole: ContractPartyRole
  readonly endedBy: ContractEndedBy | null
}

interface ReportContractProblemModalProps {
  readonly target: ReportContractProblemTarget | null
  readonly isSubmitting: boolean
  /** Resolves true when the report was recorded; the dialog then closes. */
  readonly onSubmit: (request: ReportContractProblemRequest) => Promise<boolean>
  readonly onClose: () => void
}

interface FieldErrors {
  readonly category?: string
  readonly statement?: string
}

function ReportForm({ target, isSubmitting, onSubmit, onClose }: ReportContractProblemModalProps & { readonly target: ReportContractProblemTarget }): ReactElement {
  const fieldId = useId()
  const [categoryInput, setCategoryInput] = useState<string>('')
  const [statementInput, setStatementInput] = useState<string>('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const categoryOptions = [
    { value: '', label: problemCategoryPlaceholder },
    ...contractDisputeCategoriesFor(target.raiserRole, target.endedBy).map((category) => ({
      value: category,
      label: contractDisputeCategoryLabel[category],
    })),
  ]

  const submitReport = async (): Promise<void> => {
    const categoryResult = disputeCategorySchema.safeParse(categoryInput)
    const statementResult = disputeStatementSchema.safeParse(statementInput)
    const nextErrors: FieldErrors = {
      category: categoryResult.success ? undefined : categoryResult.error.issues.at(0)?.message,
      statement: statementResult.success ? undefined : statementResult.error.issues.at(0)?.message,
    }
    setFieldErrors(nextErrors)
    if (!categoryResult.success || !statementResult.success) {
      return
    }
    const isReported = await onSubmit({
      contractId: target.contractId,
      raiserRole: target.raiserRole,
      endedBy: target.endedBy,
      category: categoryResult.data,
      statement: statementResult.data,
    })
    if (isReported) {
      onClose()
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium break-words text-[var(--color-ink-900)]">{target.subjectText}</p>
      <p role="note" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] px-3 py-2 text-xs text-[var(--color-ink-900)]">
        <Scale className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning-600)]" aria-hidden="true" />
        <span>{washLinkCannotChangeContractText}</span>
      </p>
      <p className="text-[var(--color-ink-700)]">{reportProblemIntro}</p>
      <p className="text-xs text-[var(--color-ink-500)]">{reportProblemWindowText}</p>
      <Select
        id={`${fieldId}-category`}
        name="problem-category"
        label={problemCategoryLabel}
        required
        options={categoryOptions}
        value={categoryInput}
        errorText={fieldErrors.category}
        onChange={(changeEvent): void => {
          setCategoryInput(changeEvent.target.value)
        }}
      />
      <WorkerProfileTextArea
        fieldName={`${fieldId}-statement`}
        label={problemStatementLabel}
        value={statementInput}
        maximumLength={contractDisputeLimits.statementMaxLength}
        errorText={fieldErrors.statement}
        rows={5}
        onValueChange={setStatementInput}
      />
      <p className="text-xs text-[var(--color-ink-500)]">{problemStatementGuidance}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          isLoading={isSubmitting}
          onClick={(): void => {
            void submitReport()
          }}
        >
          {sendProblemButtonLabel}
        </Button>
      </div>
    </div>
  )
}

/** D-47: a party reports a contract problem to WashLink. Categories follow how the contract ended. */
export function ReportContractProblemModal(modalProps: ReportContractProblemModalProps): ReactElement {
  const { target, onClose } = modalProps
  return (
    <Modal isOpen={target !== null} onClose={onClose} title={reportProblemTitle} maxWidthClassName="max-w-lg">
      {target !== null ? <ReportForm {...modalProps} target={target} /> : null}
    </Modal>
  )
}
