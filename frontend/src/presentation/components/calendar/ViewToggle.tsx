import type { KeyboardEvent, ReactElement } from 'react'
import { useState } from 'react'
import { CalendarDays, List } from 'lucide-react'
import { readStoredValue, writeStoredValue } from '../../../infrastructure/storage/safeStorage'
import { joinClassNames } from '../../design/classNames'

export type BookingsView = 'list' | 'calendar'

/** List or Calendar for one page, remembered on this device. List is the default. */
// eslint-disable-next-line react-refresh/only-export-components
export function useStoredBookingsView(storageKey: string): readonly [BookingsView, (next: BookingsView) => void] {
  const [view, setView] = useState<BookingsView>(() => (readStoredValue(storageKey) === 'calendar' ? 'calendar' : 'list'))
  const update = (next: BookingsView): void => {
    writeStoredValue(storageKey, next)
    setView(next)
  }
  return [view, update] as const
}

const options = [
  { value: 'list', label: 'List', icon: <List className="h-4 w-4" aria-hidden="true" /> },
  { value: 'calendar', label: 'Calendar', icon: <CalendarDays className="h-4 w-4" aria-hidden="true" /> },
] as const

/** A two-option switch (radio group): arrow keys flip it, Tab reaches the chosen option. */
export function ViewToggle({ view, onChange }: { readonly view: BookingsView; readonly onChange: (next: BookingsView) => void }): ReactElement {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return
    }
    event.preventDefault()
    const next = view === 'list' ? 'calendar' : 'list'
    onChange(next)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-view="${next}"]`)?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Show bookings as" onKeyDown={onKeyDown}
      className="inline-flex rounded-full border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-0.5">
      {options.map((option) => {
        const isSelected = option.value === view
        return (
          <button key={option.value} type="button" role="radio" aria-checked={isSelected} tabIndex={isSelected ? 0 : -1} data-view={option.value}
            onClick={(): void => { onChange(option.value) }}
            className={joinClassNames(
              'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors',
              isSelected ? 'bg-[var(--color-card)] text-[var(--color-ink-900)] shadow-[var(--shadow-card)]' : 'text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)]',
            )}>
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
