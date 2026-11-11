import type { ReactElement } from 'react'
import type { WorkerClassificationOption } from '../../../domain/models/WorkerContract'
import { classificationHelpText } from '../../utilities/workerContractCopy'

interface ClassificationChoiceProps {
  readonly fieldName: string
  /** Server order (sort_order); independent contractor is last. */
  readonly options: readonly WorkerClassificationOption[]
  /** null until chosen: no option is ever preselected (D-26). */
  readonly selectedKey: string | null
  readonly errorText?: string
  readonly isDisabled?: boolean
  readonly onSelect: (classificationKey: string) => void
  /** The extra acknowledgement for an option that needs one (for example independent contractor). */
  readonly extraAcknowledgementText?: string
  readonly isExtraAcknowledged?: boolean
  readonly onExtraAcknowledgedChange?: (isAcknowledged: boolean) => void
}

/** Relationship-type radios in server order, none preselected, with an extra checkbox where required. */
export function ClassificationChoice({
  fieldName,
  options,
  selectedKey,
  errorText,
  isDisabled = false,
  onSelect,
  extraAcknowledgementText,
  isExtraAcknowledged = false,
  onExtraAcknowledgedChange,
}: ClassificationChoiceProps): ReactElement {
  const orderedOptions = [...options].sort((left, right) => left.sortOrder - right.sortOrder)
  const selectedOption = orderedOptions.find((option) => option.classificationKey === selectedKey)
  const errorId = `${fieldName}-error`
  const hasError = errorText !== undefined && errorText.length > 0
  return (
    <fieldset
      aria-describedby={hasError ? errorId : `${fieldName}-help`}
      aria-invalid={hasError || undefined}
      className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-card-border)] p-3"
    >
      <legend className="px-1 text-sm font-medium text-[var(--color-ink-900)]">
        Relationship type
        <span className="ml-0.5 text-[var(--color-danger-500)]">*</span>
      </legend>
      <p id={`${fieldName}-help`} className="text-xs text-[var(--color-ink-500)]">{classificationHelpText}</p>
      <div className="space-y-1.5">
        {orderedOptions.map((option) => (
          <label key={option.classificationKey} className="flex items-start gap-2 text-sm text-[var(--color-ink-900)]">
            <input
              type="radio"
              name={fieldName}
              value={option.classificationKey}
              className="mt-1"
              checked={option.classificationKey === selectedKey}
              disabled={isDisabled}
              onChange={(): void => {
                onSelect(option.classificationKey)
              }}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {selectedOption?.needsExtraAcknowledgement === true && extraAcknowledgementText !== undefined ? (
        <label className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] p-2 text-sm text-[var(--color-ink-900)]">
          <input
            type="checkbox"
            className="mt-1"
            checked={isExtraAcknowledged}
            disabled={isDisabled}
            onChange={(changeEvent): void => {
              onExtraAcknowledgedChange?.(changeEvent.target.checked)
            }}
          />
          <span>{extraAcknowledgementText}</span>
        </label>
      ) : null}
      {hasError ? (
        <p id={errorId} className="text-xs text-[var(--color-danger-500)]">
          {errorText}
        </p>
      ) : null}
    </fieldset>
  )
}
