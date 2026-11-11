import type { ReactElement, SelectHTMLAttributes } from 'react'
import { forwardRef } from 'react'
import { joinClassNames } from '../classNames'

export interface SelectOption {
  readonly value: string
  readonly label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly label?: string
  readonly helperText?: string
  readonly errorText?: string
  readonly options: readonly SelectOption[]
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, helperText, errorText, options, className, id, required, ...selectHtmlAttributes },
  forwardedRef,
): ReactElement {
  const hasErrorText = typeof errorText === 'string' && errorText.length > 0
  const controlId = id ?? selectHtmlAttributes.name
  const hasDescriptionText = hasErrorText || (typeof helperText === 'string' && helperText.length > 0)
  const descriptionId =
    hasDescriptionText && controlId !== undefined ? `${controlId}-description` : undefined

  return (
    <label className="block space-y-1.5" htmlFor={controlId}>
      {label ? (
        <span className="text-sm font-medium text-[var(--color-ink-900)]">
          {label}
          {required ? (
            <span className="ml-0.5 text-[var(--color-danger-500)]">*</span>
          ) : null}
        </span>
      ) : null}

      <select
        id={controlId}
        ref={forwardedRef}
        required={required}
        aria-invalid={hasErrorText || undefined}
        aria-describedby={descriptionId}
        className={joinClassNames(
          'h-11 w-full rounded-[var(--radius-control)] border bg-[var(--color-card)] px-3 text-sm text-[var(--color-ink-900)] outline-none',
          'transition-[border-color,box-shadow] focus:border-[var(--color-brand-600)] focus:shadow-[0_0_0_1px_var(--color-brand-600)]',
          hasErrorText
            ? 'border-[var(--color-danger-500)]'
            : 'border-[var(--color-card-border)]',
          className,
        )}
        {...selectHtmlAttributes}
      >
        {options.map((selectOption) => (
          <option key={selectOption.value} value={selectOption.value}>
            {selectOption.label}
          </option>
        ))}
      </select>

      {hasErrorText ? (
        <p id={descriptionId} className="text-xs text-[var(--color-danger-500)]">
          {errorText}
        </p>
      ) : helperText ? (
        <p id={descriptionId} className="text-xs text-[var(--color-ink-500)]">
          {helperText}
        </p>
      ) : null}
    </label>
  )
})
