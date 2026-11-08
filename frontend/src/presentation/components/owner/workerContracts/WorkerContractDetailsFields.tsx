import type { ReactElement } from 'react'
import type { ContractDetailsDraft, ContractDetailsErrors } from '../../../../application/validation/workerContractSchemas'
import {
  workerContractLimits,
  type ContractOwnerValueKey,
  type WorkerClassificationOption,
} from '../../../../domain/models/WorkerContract'
import { Input } from '../../../design/ui'
import { ownerValuesHelpText, payDetailsHelpText } from '../../../utilities/workerContractCopy'
import { ownerValueLabel } from '../../../utilities/workerContractDisplay'
import { ClassificationChoice } from '../../contracts/ClassificationChoice'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'

const ownerValueMaxLengths: Readonly<Record<ContractOwnerValueKey, number>> = {
  role_title: workerContractLimits.roleTitleMaxLength,
  schedule_summary: workerContractLimits.scheduleSummaryMaxLength,
  pay_details: workerContractLimits.payDetailsMaxLength,
}

interface WorkerContractDetailsFieldsProps {
  readonly details: ContractDetailsDraft
  readonly errors: ContractDetailsErrors
  readonly classificationOptions: readonly WorkerClassificationOption[]
  readonly onClassificationChange: (classificationKey: string) => void
  readonly onDateChange: (field: 'startDate' | 'endDate', value: string) => void
  readonly onOwnerValueChange: (valueKey: ContractOwnerValueKey, value: string) => void
}

/** Relationship type, dates and the owner-typed details (role, schedule, pay) of one contract draft. */
export function WorkerContractDetailsFields({
  details,
  errors,
  classificationOptions,
  onClassificationChange,
  onDateChange,
  onOwnerValueChange,
}: WorkerContractDetailsFieldsProps): ReactElement {
  return (
    <section aria-labelledby="contract-details-heading" className="space-y-3">
      <h4 id="contract-details-heading" className="text-sm font-semibold text-[var(--color-ink-900)]">
        Contract details
      </h4>
      <ClassificationChoice
        fieldName="draft-contract-classification"
        options={classificationOptions}
        selectedKey={details.classificationKey}
        errorText={errors.classificationKey}
        onSelect={onClassificationChange}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          id="draft-contract-start-date"
          type="date"
          label="Start date"
          required
          value={details.startDate}
          errorText={errors.startDate}
          onChange={(changeEvent): void => {
            onDateChange('startDate', changeEvent.target.value)
          }}
        />
        <Input
          id="draft-contract-end-date"
          type="date"
          label="End date (optional)"
          value={details.endDate}
          errorText={errors.endDate}
          helperText="Leave empty when the shop states no end date."
          onChange={(changeEvent): void => {
            onDateChange('endDate', changeEvent.target.value)
          }}
        />
      </div>
      <p className="text-xs text-[var(--color-ink-500)]">{ownerValuesHelpText}</p>
      <Input
        id="draft-contract-role-title"
        label={ownerValueLabel.role_title}
        value={details.ownerValues.role_title}
        maxLength={ownerValueMaxLengths.role_title}
        errorText={errors.role_title}
        helperText="3 to 120 characters."
        onChange={(changeEvent): void => {
          onOwnerValueChange('role_title', changeEvent.target.value)
        }}
      />
      <WorkerProfileTextArea
        fieldName="draft-contract-schedule"
        label={ownerValueLabel.schedule_summary}
        value={details.ownerValues.schedule_summary}
        maximumLength={ownerValueMaxLengths.schedule_summary}
        errorText={errors.schedule_summary}
        rows={3}
        onValueChange={(nextValue): void => {
          onOwnerValueChange('schedule_summary', nextValue)
        }}
      />
      <WorkerProfileTextArea
        fieldName="draft-contract-pay-details"
        label={ownerValueLabel.pay_details}
        value={details.ownerValues.pay_details}
        maximumLength={ownerValueMaxLengths.pay_details}
        errorText={errors.pay_details}
        placeholder={payDetailsHelpText}
        rows={3}
        onValueChange={(nextValue): void => {
          onOwnerValueChange('pay_details', nextValue)
        }}
      />
    </section>
  )
}
