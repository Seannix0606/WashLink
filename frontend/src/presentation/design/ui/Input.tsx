import type { InputHTMLAttributes, ReactElement, ReactNode } from 'react'
import { forwardRef } from 'react'
import { joinClassNames } from '../classNames'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label?: string
  readonly helperText?: string
  readonly errorText?: string
  readonly leadingIcon?: ReactNode
  readonly trailingAccessory?: ReactNode
  readonly inputContainerClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    helperText,
    errorText,
    leadingIcon,
    trailingAccessory,
    inputContainerClassName,
    className,
    id,
    required,
    ...inputHtmlAttributes
  },
  forwardedRef,
): ReactElement {
  const hasErrorText = typeof errorText === 'string' && errorText.length > 0
  const controlId = id ?? inputHtmlAttributes.name
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

      <div
        className={joinClassNames(
          'flex items-center gap-2 rounded-[var(--radius-control)] border bg-[var(--color-card)] px-3',
          'transition-[border-color,box-shadow] focus-within:border-[var(--color-brand-600)] focus-within:shadow-[0_0_0_1px_var(--color-brand-600)]',
          hasErrorText
            ? 'border-[var(--color-danger-500)]'
            : 'border-[var(--color-card-border)]',
          inputContainerClassName,
        )}
      >
        {leadingIcon ? (
          <span className="text-[var(--color-ink-500)]">{leadingIcon}</span>
        ) : null}
        <input
          id={controlId}
          ref={forwardedRef}
          required={required}
          aria-invalid={hasErrorText || undefined}
          aria-describedby={descriptionId}
          className={joinClassNames(
            'h-11 w-full bg-transparent text-sm text-[var(--color-ink-900)] outline-none placeholder:text-[var(--color-ink-400)]',
            className,
          )}
          {...inputHtmlAttributes}
        />
        {trailingAccessory ? (
          <span className="flex items-center text-[var(--color-ink-500)]">
            {trailingAccessory}
          </span>
        ) : null}
      </div>

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
