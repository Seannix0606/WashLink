import type { ReactElement } from 'react'
import { AlertTriangle } from 'lucide-react'
import { feeLikeWordingWarning, findFeeLikeWords } from '../../../../application/validation/trainingTermsFeeWording'
import {
  trainingPayCurrencies,
  trainingPayPeriods,
  trainingProgramLimits as limits,
} from '../../../../domain/models/TrainingProgram'
import { Input, Select } from '../../../design/ui'
import { trainingFeeLine, trainingPayDisclaimer, trainingPayPeriodLabels } from '../../../utilities/trainingDisplay'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'
import type { TrainingProgramSectionProps } from './TrainingProgramBasicsSection'

const notSelectedOption = { value: '', label: 'Not specified' } as const

/**
 * Terms and optional training pay / reimbursement. Nothing is pre-filled or suggested,
 * and there is no fee input: required initial training is always free for the worker.
 */
export function TrainingProgramPayAndTermsSection({
  draft,
  fieldErrors,
  onFieldChange,
}: TrainingProgramSectionProps): ReactElement {
  // A prompt to re-read the free text only; saving is never blocked by it.
  const feeLikeWords = findFeeLikeWords([draft.terms, draft.trainingPayDetails, draft.reimbursementDetails])
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 text-sm font-semibold text-[var(--color-ink-900)]">Terms and optional training pay</legend>
      <p className="rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-ink-700)]">
        {trainingFeeLine} Workers can never be charged for this training.
      </p>
      <WorkerProfileTextArea
        fieldName="training-program-terms"
        label="Training terms (needed to open)"
        value={draft.terms}
        maximumLength={limits.termsMaxLength}
        errorText={fieldErrors.terms}
        rows={4}
        onValueChange={(nextValue): void => {
          onFieldChange('terms', nextValue)
        }}
      />
      <p className="text-xs text-[var(--color-ink-500)]">
        Training pay is optional. Workers see exactly what you enter. {trainingPayDisclaimer}
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          id="training-program-pay-amount"
          label="Training pay amount"
          inputMode="decimal"
          value={draft.trainingPayAmountText}
          errorText={fieldErrors.trainingPayAmount}
          onChange={(changeEvent): void => {
            onFieldChange('trainingPayAmountText', changeEvent.target.value)
          }}
        />
        <Select
          id="training-program-pay-currency"
          label="Currency"
          value={draft.trainingPayCurrency}
          errorText={fieldErrors.trainingPayCurrency}
          options={[notSelectedOption, ...trainingPayCurrencies.map((currency) => ({ value: currency, label: currency }))]}
          onChange={(changeEvent): void => {
            const selectedCurrency = trainingPayCurrencies.find((currency) => currency === changeEvent.target.value)
            onFieldChange('trainingPayCurrency', selectedCurrency ?? '')
          }}
        />
        <Select
          id="training-program-pay-period"
          label="Pay period"
          value={draft.trainingPayPeriod}
          errorText={fieldErrors.trainingPayPeriod}
          options={[
            notSelectedOption,
            ...trainingPayPeriods.map((period) => ({ value: period, label: trainingPayPeriodLabels[period] })),
          ]}
          onChange={(changeEvent): void => {
            const selectedPeriod = trainingPayPeriods.find((period) => period === changeEvent.target.value)
            onFieldChange('trainingPayPeriod', selectedPeriod ?? '')
          }}
        />
      </div>
      <p className="text-xs text-[var(--color-ink-500)]">An amount needs a currency and a period; leave all three empty for none.</p>
      <WorkerProfileTextArea
        fieldName="training-program-pay-details"
        label="Training pay details in your words"
        value={draft.trainingPayDetails}
        maximumLength={limits.payDetailsMaxLength}
        errorText={fieldErrors.trainingPayDetails}
        rows={2}
        onValueChange={(nextValue): void => {
          onFieldChange('trainingPayDetails', nextValue)
        }}
      />
      <WorkerProfileTextArea
        fieldName="training-program-reimbursement"
        label="Reimbursement details (for example travel or meals)"
        value={draft.reimbursementDetails}
        maximumLength={limits.reimbursementDetailsMaxLength}
        errorText={fieldErrors.reimbursementDetails}
        rows={2}
        onValueChange={(nextValue): void => {
          onFieldChange('reimbursementDetails', nextValue)
        }}
      />
      <div aria-live="polite">
        {feeLikeWords.length === 0 ? null : (
          <p
            role="status"
            className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] px-3 py-2 text-xs text-[var(--color-warning-600)]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {feeLikeWordingWarning} Words to check: {feeLikeWords.join(', ')}.
            </span>
          </p>
        )}
      </div>
    </fieldset>
  )
}
