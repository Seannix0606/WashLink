import type { ReactElement } from 'react'
import {
  jobOpeningCompensationCurrencies,
  jobOpeningCompensationPeriods,
  jobOpeningLimits as limits,
} from '../../../../domain/models/JobOpening'
import { Input, Select } from '../../../design/ui'
import {
  compensationPeriodLabels,
  jobOpeningDetailsDisclaimer,
} from '../../../utilities/jobOpeningDisplay'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'
import { notSelectedOption, type JobOpeningSectionProps } from './jobOpeningSectionProps'

/** Nothing here is pre-filled or suggested; empty fields show "Not specified by the shop". */
export function JobOpeningPayAndTermsSection({
  draft,
  fieldErrors,
  onFieldChange,
}: JobOpeningSectionProps): ReactElement {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 text-sm font-semibold text-[var(--color-ink-900)]">Pay and terms</legend>
      <p className="text-xs text-[var(--color-ink-500)]">
        All optional. Workers see exactly what you enter. {jobOpeningDetailsDisclaimer}
      </p>

      <WorkerProfileTextArea
        fieldName="job-opening-schedule-details"
        label="Schedule details"
        value={draft.scheduleDetails}
        maximumLength={limits.scheduleDetailsMaxLength}
        errorText={fieldErrors.scheduleDetails}
        rows={3}
        onValueChange={(nextValue): void => {
          onFieldChange('scheduleDetails', nextValue)
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="job-opening-pay-minimum"
          label="Minimum pay"
          inputMode="decimal"
          value={draft.compensationMinAmountText}
          errorText={fieldErrors.compensationMinAmount}
          onChange={(changeEvent): void => {
            onFieldChange('compensationMinAmountText', changeEvent.target.value)
          }}
        />
        <Input
          id="job-opening-pay-maximum"
          label="Maximum pay"
          inputMode="decimal"
          value={draft.compensationMaxAmountText}
          errorText={fieldErrors.compensationMaxAmount}
          onChange={(changeEvent): void => {
            onFieldChange('compensationMaxAmountText', changeEvent.target.value)
          }}
        />
        <Select
          id="job-opening-pay-currency"
          label="Currency"
          value={draft.compensationCurrency}
          errorText={fieldErrors.compensationCurrency}
          options={[
            notSelectedOption,
            ...jobOpeningCompensationCurrencies.map((currency) => ({ value: currency, label: currency })),
          ]}
          onChange={(changeEvent): void => {
            const selectedCurrency = jobOpeningCompensationCurrencies.find(
              (currency) => currency === changeEvent.target.value,
            )
            onFieldChange('compensationCurrency', selectedCurrency ?? '')
          }}
        />
        <Select
          id="job-opening-pay-period"
          label="Pay period"
          value={draft.compensationPeriod}
          errorText={fieldErrors.compensationPeriod}
          options={[
            notSelectedOption,
            ...jobOpeningCompensationPeriods.map((period) => ({
              value: period,
              label: compensationPeriodLabels[period],
            })),
          ]}
          onChange={(changeEvent): void => {
            const selectedPeriod = jobOpeningCompensationPeriods.find(
              (period) => period === changeEvent.target.value,
            )
            onFieldChange('compensationPeriod', selectedPeriod ?? '')
          }}
        />
      </div>
      <p className="text-xs text-[var(--color-ink-500)]">
        An amount needs a currency and a pay period. Enter one amount, or both for a range.
      </p>

      <WorkerProfileTextArea
        fieldName="job-opening-pay-details"
        label="Pay details in your words"
        value={draft.compensationDetails}
        maximumLength={limits.compensationDetailsMaxLength}
        errorText={fieldErrors.compensationDetails}
        rows={2}
        onValueChange={(nextValue): void => {
          onFieldChange('compensationDetails', nextValue)
        }}
      />

      <WorkerProfileTextArea
        fieldName="job-opening-benefits"
        label="Benefits"
        value={draft.benefits}
        maximumLength={limits.benefitsMaxLength}
        errorText={fieldErrors.benefits}
        rows={3}
        onValueChange={(nextValue): void => {
          onFieldChange('benefits', nextValue)
        }}
      />

      <WorkerProfileTextArea
        fieldName="job-opening-other-terms"
        label="Other terms"
        value={draft.otherTerms}
        maximumLength={limits.otherTermsMaxLength}
        errorText={fieldErrors.otherTerms}
        rows={3}
        onValueChange={(nextValue): void => {
          onFieldChange('otherTerms', nextValue)
        }}
      />
    </fieldset>
  )
}
