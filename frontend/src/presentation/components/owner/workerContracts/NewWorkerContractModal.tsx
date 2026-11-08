import type { ReactElement } from 'react'
import { useState } from 'react'
import type { NewWorkerContractOptions, NewWorkerContractRequest, WorkerContractService } from '../../../../application/services/WorkerContractService'
import { findClassificationOption } from '../../../../application/services/WorkerContractService'
import {
  chooseTemplateMessage,
  chooseWorkerMessage,
  contractorAcknowledgementMessage,
  validateContractDetails,
  type ContractDetailsErrors,
} from '../../../../application/validation/workerContractSchemas'
import { contractStatementKeys } from '../../../../domain/models/WorkerContract'
import { Button, Input, Modal, Select, Skeleton } from '../../../design/ui'
import { useContractEligibleWorkers } from '../../../hooks/useContractEligibleWorkers'
import { contractorFallbackAcknowledgement, noEligibleWorkersText } from '../../../utilities/workerContractCopy'
import { contractOriginLabel } from '../../../utilities/workerContractDisplay'
import { ClassificationChoice } from '../../contracts/ClassificationChoice'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'

interface NewWorkerContractModalProps {
  readonly workerContractService: WorkerContractService
  readonly isSubmitting: boolean
  readonly onCreate: (request: NewWorkerContractRequest, options: NewWorkerContractOptions) => Promise<boolean>
  readonly onClose: () => void
}

interface FormErrors extends ContractDetailsErrors {
  readonly worker?: string
  readonly template?: string
  readonly contractor?: string
}

function workerOptionValue(workerId: string, shopId: string): string {
  return `${workerId}|${shopId}`
}

/**
 * Start a contract draft: an eligible worker at one of your shops (D-31), the template version
 * to start from, the relationship type (nothing preselected) and the dates. Nothing is sent yet.
 */
export function NewWorkerContractModal({ workerContractService, isSubmitting, onCreate, onClose }: NewWorkerContractModalProps): ReactElement {
  const options = useContractEligibleWorkers(workerContractService)
  const [workerValue, setWorkerValue] = useState<string>('')
  const [templateVersionId, setTemplateVersionId] = useState<string>('')
  const [classificationKey, setClassificationKey] = useState<string | null>(null)
  const [isContractorAcknowledged, setIsContractorAcknowledged] = useState<boolean>(false)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const { eligibleWorkers, templateChoices, classificationOptions, acknowledgementTexts } = options.resource
  const availableWorkers = eligibleWorkers.filter((worker) => !worker.hasOpenContract)
  const openContractCount = eligibleWorkers.length - availableWorkers.length
  const contractorText =
    acknowledgementTexts.find((text) => text.ackKey === contractStatementKeys.contractorOwner)?.statementText ?? contractorFallbackAcknowledgement

  const submit = (): void => {
    const worker = availableWorkers.find((candidate) => workerOptionValue(candidate.workerId, candidate.shopId) === workerValue) ?? null
    const details = {
      classificationKey,
      startDate,
      endDate,
      ownerValues: { role_title: '', schedule_summary: '', pay_details: '' },
    }
    const classification = findClassificationOption(classificationOptions, classificationKey)
    const errors: FormErrors = {
      ...validateContractDetails(details),
      ...(worker === null ? { worker: chooseWorkerMessage } : {}),
      ...(templateVersionId.length === 0 ? { template: chooseTemplateMessage } : {}),
      ...(classification?.needsExtraAcknowledgement === true && !isContractorAcknowledged ? { contractor: contractorAcknowledgementMessage } : {}),
    }
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }
    void onCreate({ worker, templateVersionId, details, isContractorAcknowledged }, options.resource)
  }

  const renderBody = (): ReactElement => {
    if (options.isLoading) {
      return <Skeleton heightClassName="h-40" />
    }
    if (options.errorMessage !== null) {
      return (
        <LoadErrorNotice
          title="The contract options could not be loaded"
          errorMessage={options.errorMessage}
          onRetry={(): void => {
            void options.reload()
          }}
        />
      )
    }
    if (availableWorkers.length === 0) {
      return <p role="status" className="text-sm text-[var(--color-ink-700)]">{noEligibleWorkersText}</p>
    }
    return (
      <form
        aria-label="New contract draft"
        className="space-y-3"
        noValidate
        onSubmit={(submitEvent): void => {
          submitEvent.preventDefault()
          submit()
        }}
      >
        <Select
          id="new-contract-worker"
          label="Worker"
          required
          value={workerValue}
          errorText={formErrors.worker}
          options={[
            { value: '', label: 'Choose a worker' },
            ...availableWorkers.map((worker) => ({
              value: workerOptionValue(worker.workerId, worker.shopId),
              label: `${worker.displayName} · ${worker.shopName} (${contractOriginLabel[worker.origin]})`,
            })),
          ]}
          onChange={(changeEvent): void => {
            setWorkerValue(changeEvent.target.value)
          }}
        />
        {openContractCount > 0 ? (
          <p className="text-xs text-[var(--color-ink-500)]">
            {`${String(openContractCount)} worker-shop pair${openContractCount === 1 ? '' : 's'} already ha${openContractCount === 1 ? 's' : 've'} an open contract and ${openContractCount === 1 ? 'is' : 'are'} not listed.`}
          </p>
        ) : null}
        <Select
          id="new-contract-template"
          label="Start from"
          required
          value={templateVersionId}
          errorText={formErrors.template}
          options={[
            { value: '', label: 'Choose a template version' },
            ...templateChoices.map((choice) => ({ value: choice.versionId, label: choice.isStandard ? `${choice.label} (WashLink standard)` : choice.label })),
          ]}
          onChange={(changeEvent): void => {
            setTemplateVersionId(changeEvent.target.value)
          }}
        />
        <ClassificationChoice
          fieldName="new-contract-classification"
          options={classificationOptions}
          selectedKey={classificationKey}
          errorText={formErrors.classificationKey ?? formErrors.contractor}
          onSelect={(nextKey): void => {
            setClassificationKey(nextKey)
            setIsContractorAcknowledged(false)
          }}
          extraAcknowledgementText={contractorText}
          isExtraAcknowledged={isContractorAcknowledged}
          onExtraAcknowledgedChange={setIsContractorAcknowledged}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            id="new-contract-start-date"
            type="date"
            label="Start date"
            required
            value={startDate}
            errorText={formErrors.startDate}
            onChange={(changeEvent): void => {
              setStartDate(changeEvent.target.value)
            }}
          />
          <Input
            id="new-contract-end-date"
            type="date"
            label="End date (optional)"
            value={endDate}
            errorText={formErrors.endDate}
            helperText="Leave empty when the shop states no end date."
            onChange={(changeEvent): void => {
              setEndDate(changeEvent.target.value)
            }}
          />
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-ink-200)] pt-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Create draft
          </Button>
        </div>
      </form>
    )
  }

  return (
    <Modal isOpen onClose={onClose} title="New contract draft" maxWidthClassName="max-w-xl">
      <div className="max-h-[70vh] overflow-y-auto">{renderBody()}</div>
    </Modal>
  )
}
