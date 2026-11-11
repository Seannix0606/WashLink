import type { ReactElement } from 'react'
import { joinClassNames } from '../../design/classNames'

interface WorkerProfileTextAreaProps {
  readonly fieldName: string
  readonly label: string
  readonly value: string
  readonly maximumLength: number
  readonly placeholder?: string
  readonly errorText?: string
  readonly rows?: number
  readonly onValueChange: (nextValue: string) => void
}

export function WorkerProfileTextArea({
  fieldName,
  label,
  value,
  maximumLength,
  placeholder,
  errorText,
  rows = 4,
  onValueChange,
}: WorkerProfileTextAreaProps): ReactElement {
  const hasErrorText = typeof errorText === 'string' && errorText.length > 0
  const describedById = `${fieldName}-description`

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={fieldName}
        className="block text-sm font-medium text-[var(--color-ink-900)]"
      >
        {label}
      </label>
      <textarea
        id={fieldName}
        name={fieldName}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-invalid={hasErrorText}
        aria-describedby={describedById}
        onChange={(changeEvent): void => {
          onValueChange(changeEvent.target.value)
        }}
        className={joinClassNames(
          'w-full rounded-[var(--radius-control)] border bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-ink-900)] outline-none placeholder:text-[var(--color-ink-400)] focus:border-[var(--color-brand-600)]',
          hasErrorText
            ? 'border-[var(--color-danger-500)]'
            : 'border-[var(--color-card-border)]',
        )}
      />
      <div id={describedById} className="flex justify-between gap-3 text-xs">
        <span className="text-[var(--color-danger-500)]">
          {hasErrorText ? errorText : ''}
        </span>
        <span className="text-[var(--color-ink-500)]">
          {String(value.length)}/{String(maximumLength)}
        </span>
      </div>
    </div>
  )
}
