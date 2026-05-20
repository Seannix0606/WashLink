import type { ReactElement } from 'react'
import { Droplets } from 'lucide-react'
import { joinClassNames } from '../classNames'

interface BrandMarkProps {
  readonly size?: 'sm' | 'md' | 'lg'
  readonly showWordmark?: boolean
  readonly className?: string
}

const markSizeClassNameBySizeKey: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-12 w-12',
}

const wordmarkClassNameBySizeKey: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
}

export function BrandMark({
  size = 'md',
  showWordmark = true,
  className,
}: BrandMarkProps): ReactElement {
  return (
    <div className={joinClassNames('flex items-center gap-2', className)}>
      <span
        className={joinClassNames(
          'inline-flex items-center justify-center rounded-[var(--radius-control)] bg-gradient-to-br from-[var(--color-brand-600)] to-[var(--color-brand-800)] text-white shadow-[var(--shadow-card)]',
          markSizeClassNameBySizeKey[size],
        )}
        aria-hidden="true"
      >
        <Droplets className="h-1/2 w-1/2" />
      </span>
      {showWordmark ? (
        <span
          className={joinClassNames(
            'font-extrabold tracking-tight text-[var(--color-ink-900)]',
            wordmarkClassNameBySizeKey[size],
          )}
        >
          Wash<span className="text-[var(--color-brand-700)]">Link</span>
        </span>
      ) : null}
    </div>
  )
}
