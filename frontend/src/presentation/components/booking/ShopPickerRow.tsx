import type { ReactElement } from 'react'
import { joinClassNames } from '../../design/classNames'

interface ShopPickerRowProps {
  readonly isSelected: boolean
  readonly title: string
  readonly subtitle: string
  readonly leadingIcon: ReactElement
  readonly trailingMeta: ReactElement | null
  readonly onClick: () => void
}

export function ShopPickerRow({
  isSelected,
  title,
  subtitle,
  leadingIcon,
  trailingMeta,
  onClick,
}: ShopPickerRowProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={joinClassNames(
        'flex w-full items-start gap-3 rounded-[var(--radius-surface)] border px-4 py-3 text-left transition-all',
        isSelected
          ? 'border-[var(--color-brand-600)] bg-[var(--color-brand-50)] shadow-[var(--shadow-card)]'
          : 'border-[var(--color-ink-200)] bg-white hover:border-[var(--color-brand-300)]',
      )}
    >
      <span
        className={joinClassNames(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          isSelected
            ? 'bg-[var(--color-brand-700)] text-white'
            : 'bg-[var(--color-ink-100)] text-[var(--color-ink-700)]',
        )}
      >
        {leadingIcon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--color-ink-900)]">
          {title}
        </p>
        <p className="truncate text-xs text-[var(--color-ink-500)]">
          {subtitle}
        </p>
      </div>
      {trailingMeta ? <div className="shrink-0">{trailingMeta}</div> : null}
    </button>
  )
}
