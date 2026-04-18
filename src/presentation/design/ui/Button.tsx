import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { joinClassNames } from '../classNames'

type ButtonVisualVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSizeVariant = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVisualVariant
  readonly size?: ButtonSizeVariant
  readonly isLoading?: boolean
  readonly leadingIcon?: ReactNode
  readonly trailingIcon?: ReactNode
  readonly isFullWidth?: boolean
  readonly children?: ReactNode
}

const variantClassNameByVariantKey: Record<ButtonVisualVariant, string> = {
  primary:
    'bg-[var(--color-brand-700)] text-white hover:bg-[var(--color-brand-800)] active:bg-[var(--color-brand-900)] shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)]',
  secondary:
    'bg-white text-[var(--color-ink-900)] border border-[var(--color-ink-200)] hover:bg-[var(--color-surface-muted)]',
  ghost:
    'bg-transparent text-[var(--color-ink-700)] hover:bg-[var(--color-surface-muted)]',
  danger:
    'bg-[var(--color-danger-500)] text-white hover:bg-[var(--color-danger-600)] shadow-[var(--shadow-card)]',
}

const sizeClassNameBySizeKey: Record<ButtonSizeVariant, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leadingIcon,
  trailingIcon,
  isFullWidth = false,
  className,
  disabled,
  children,
  type = 'button',
  ...buttonHtmlAttributes
}: ButtonProps): ReactElement {
  const computedClassName = joinClassNames(
    'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold transition-colors transition-shadow',
    'disabled:cursor-not-allowed disabled:opacity-60',
    variantClassNameByVariantKey[variant],
    sizeClassNameBySizeKey[size],
    isFullWidth ? 'w-full' : '',
    className,
  )

  return (
    <button
      type={type}
      className={computedClassName}
      disabled={disabled ?? isLoading}
      {...buttonHtmlAttributes}
    >
      {isLoading ? <ButtonLoadingIndicator /> : leadingIcon}
      {children ? <span>{children}</span> : null}
      {!isLoading && trailingIcon ? trailingIcon : null}
    </button>
  )
}

function ButtonLoadingIndicator(): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  )
}
