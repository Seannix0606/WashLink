import type { ReactElement, ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

export interface NextActionListItem {
  readonly key: string
  readonly label: string
  readonly count: number
  /** Opens the section where the action can be taken. */
  readonly onSelect: () => void
}

interface NextActionListProps {
  readonly accessibleLabel: string
  readonly items: readonly NextActionListItem[]
  /** Shown when there is nothing to do; nothing is rendered when omitted. */
  readonly emptyContent?: ReactNode
}

/** Next actions in the order given (the order comes from workforceNextActions). Each item is a keyboard-reachable button. */
export function NextActionList({ accessibleLabel, items, emptyContent }: NextActionListProps): ReactElement | null {
  if (items.length === 0) {
    return emptyContent === undefined ? null : <>{emptyContent}</>
  }
  return (
    <ol aria-label={accessibleLabel} className="space-y-2">
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            onClick={item.onSelect}
            className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-[var(--color-card)] px-3 py-2.5 text-left text-sm text-[var(--color-ink-900)] transition-colors hover:border-[var(--color-brand-400)] hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand-600)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-flex min-w-[1.75rem] shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-50)] px-2 py-0.5 text-xs font-semibold text-[var(--color-brand-800)]"
              >
                {item.count}
              </span>
              <span className="break-words">{item.label}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-ink-500)]" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ol>
  )
}
