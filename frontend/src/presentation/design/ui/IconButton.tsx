import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { joinClassNames } from '../classNames'

type IconButtonSizeVariant = 'sm' | 'md' | 'lg'
type IconButtonToneVariant = 'neutral' | 'brand' | 'danger'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly icon: ReactNode
  readonly accessibleLabel: string
  readonly size?: IconButtonSizeVariant
  readonly tone?: IconButtonToneVariant
}

const sizeClassNameBySizeKey: Record<IconButtonSizeVariant, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
}

const toneClassNameByToneKey: Record<IconButtonToneVariant, string> = {
  neutral:
    'text-[var(--color-ink-700)] hover:bg-[var(--color-surface-muted)] border border-[var(--color-ink-200)] bg-white',
  brand:
    'text-white bg-[var(--color-brand-700)] hover:bg-[var(--color-brand-800)]',
  danger:
    'text-white bg-[var(--color-danger-500)] hover:bg-[var(--color-danger-600)]',
}

export function IconButton({
  icon,
  accessibleLabel,
  size = 'md',
  tone = 'neutral',
  className,
  type = 'button',
  ...buttonHtmlAttributes
}: IconButtonProps): ReactElement {
  return (
    <button
      type={type}
      aria-label={accessibleLabel}
      className={joinClassNames(
        'inline-flex items-center justify-center rounded-[var(--radius-control)] transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        sizeClassNameBySizeKey[size],
        toneClassNameByToneKey[tone],
        className,
      )}
      {...buttonHtmlAttributes}
    >
      {icon}
    </button>
  )
}
