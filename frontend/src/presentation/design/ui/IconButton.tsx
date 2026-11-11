import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { joinClassNames } from '../classNames'

type IconButtonSizeVariant = 'sm' | 'md' | 'lg'
type IconButtonToneVariant = 'neutral' | 'brand' | 'danger' | 'harbor'

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
    'text-[var(--color-ink-700)] hover:bg-[var(--color-surface-muted)] border border-[var(--color-card-border)] bg-[var(--color-card)]',
  brand:
    'text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]',
  danger:
    'text-white bg-[var(--color-danger-solid)] hover:bg-[var(--color-danger-solid-hover)]',
  // On the dark harbor band: a frosted button.
  harbor:
    'text-[var(--color-on-harbor)] border border-white/15 bg-white/10 hover:bg-white/20',
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
