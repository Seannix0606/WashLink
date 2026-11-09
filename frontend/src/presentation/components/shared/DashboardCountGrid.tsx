import type { ReactElement } from 'react'

export interface DashboardCountItem {
  readonly key: string
  readonly label: string
  /** A number or a short text (for example a date), shown exactly as the database returned it. */
  readonly value: number | string
  readonly helperText?: string
}

export interface DashboardCountGroup {
  readonly key: string
  readonly heading: string
  readonly items: readonly DashboardCountItem[]
}

interface DashboardCountGridProps {
  readonly groups: readonly DashboardCountGroup[]
}

/** Read-only counts from a W11 summary, grouped; each group is a description list. */
export function DashboardCountGrid({ groups }: DashboardCountGridProps): ReactElement {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`count-group-${group.key}`} className="space-y-2">
          <h4 id={`count-group-${group.key}`} className="text-xs font-semibold tracking-wide text-[var(--color-ink-500)] uppercase">
            {group.heading}
          </h4>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {group.items.map((item) => (
              <div key={item.key} className="rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-[var(--color-card)] p-3">
                <dt className="text-xs text-[var(--color-ink-500)]">{item.label}</dt>
                <dd className="text-lg font-semibold break-words text-[var(--color-ink-900)]">{item.value}</dd>
                {item.helperText !== undefined ? <dd className="mt-1 text-[11px] text-[var(--color-ink-500)]">{item.helperText}</dd> : null}
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
