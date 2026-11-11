import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { joinClassNames } from '../classNames'

type ButtonVisualVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
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
    'bg-[linear-gradient(180deg,var(--color-primary-soft),var(--color-primary))] text-white shadow-[var(--shadow-button)] hover:bg-[linear-gradient(180deg,var(--color-primary),var(--color-primary-hover))] active:bg-[var(--color-primary-strong)]',
  secondary:
    'bg-[var(--color-card)] text-[var(--color-ink-900)] border border-[var(--color-card-border)] shadow-[0_1px_2px_0_rgb(10_39_49/0.06)] hover:border-[var(--color-brand-600)] hover:bg-[var(--color-section-head)]',
  ghost:
    'bg-transparent text-[var(--color-ink-700)] hover:bg-[var(--color-section-head)] hover:text-[var(--color-ink-900)]',
  danger:
    'bg-[var(--color-danger-solid)] text-white hover:bg-[var(--color-danger-solid-hover)] shadow-[var(--shadow-button)]',
  // The single most important action on a screen (for example "Book a car wash"): sunlit amber with dark text.
  accent:
    'bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-[var(--shadow-button)] hover:bg-[var(--color-accent-hover)]',
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
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold',
    'transition-[background-color,border-color,box-shadow,transform] duration-[var(--duration-quick)] ease-[var(--ease-out-soft)] active:scale-[0.98] motion-reduce:active:scale-100',
    'disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100',
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
