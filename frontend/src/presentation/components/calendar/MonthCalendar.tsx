import type { KeyboardEvent, ReactElement, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  formatManilaDayKey,
  formatManilaMonth,
  manilaMonthGrid,
  manilaMonthOf,
  serviceBookingStatusGroup,
  serviceBookingStatusGroupLabel,
  serviceBookingStatusGroups,
  serviceBookingStatusLabel,
  type ManilaMonth,
  type ServiceBookingStatus,
} from '@washlink/shared'
import { joinClassNames } from '../../design/classNames'
import { statusGroupColors } from '../../design/ui'

export interface CalendarEntry {
  readonly id: string
  /** Manila day, YYYY-MM-DD. */
  readonly dayKey: string
  /** "9:00 AM", or "ASAP" for as-soon-as-possible bookings. */
  readonly timeLabel: string
  readonly title: string
  readonly status: ServiceBookingStatus
  /** An open offer rather than a booking: drawn with a dashed outline. */
  readonly isRequest?: boolean
}

interface MonthCalendarProps {
  readonly entries: readonly CalendarEntry[]
  /** Today in Manila, YYYY-MM-DD. */
  readonly todayKey: string
  readonly selectedDayKey: string
  readonly onSelectDay: (dayKey: string) => void
  /** The accessible name of the grid, e.g. "Your bookings by day". */
  readonly label: string
  /** Whether to show a "Request" item in the legend. */
  readonly hasRequests?: boolean
  /** The selected day's bookings, shown under the grid. */
  readonly children?: ReactNode
}

const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const weekdayFullNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
/** A day square fits two two-line pills, or one pill and a "+N more" line. */
const MAX_PILLS = 2

function addDays(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function countLabel(count: number): string {
  return count === 0 ? 'no bookings' : count === 1 ? '1 booking' : `${String(count)} bookings`
}

/**
 * A Monday-first month of bookings. Each day shows its bookings in their status colors (pills with time on wider
 * screens, dots on phones); choosing a day shows that day's bookings underneath. Keyboard: arrow keys move by day and
 * week, Page Up / Page Down by month, Home / End to the start or end of the week, Enter or Space selects.
 */
export function MonthCalendar({ entries, todayKey, selectedDayKey, onSelectDay, label, hasRequests = false, children }: MonthCalendarProps): ReactElement {
  const [month, setMonth] = useState<ManilaMonth>(() => manilaMonthOf(selectedDayKey))
  const [focusedDayKey, setFocusedDayKey] = useState(selectedDayKey)
  const gridRef = useRef<HTMLDivElement>(null)
  const shouldMoveFocus = useRef(false)

  const entriesByDay = new Map<string, CalendarEntry[]>()
  for (const entry of entries) {
    entriesByDay.set(entry.dayKey, [...(entriesByDay.get(entry.dayKey) ?? []), entry])
  }
  const weeks = manilaMonthGrid(month)

  useEffect(() => {
    if (!shouldMoveFocus.current) {
      return
    }
    shouldMoveFocus.current = false
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusedDayKey}"]`)?.focus()
  }, [focusedDayKey, month])

  const moveFocus = (dayKey: string): void => {
    shouldMoveFocus.current = true
    setFocusedDayKey(dayKey)
    const target = manilaMonthOf(dayKey)
    if (target.year !== month.year || target.month !== month.month) {
      setMonth(target)
    }
  }

  const goToMonth = (next: ManilaMonth): void => {
    setMonth(next)
    setFocusedDayKey(`${String(next.year)}-${String(next.month).padStart(2, '0')}-01`)
  }

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const weekdayIndex = (new Date(`${focusedDayKey}T00:00:00Z`).getUTCDay() + 6) % 7
    const steps: Readonly<Record<string, number>> = {
      ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7, Home: -weekdayIndex, End: 6 - weekdayIndex,
    }
    if (event.key in steps) {
      event.preventDefault()
      moveFocus(addDays(focusedDayKey, steps[event.key] ?? 0))
    } else if (event.key === 'PageDown' || event.key === 'PageUp') {
      event.preventDefault()
      moveFocus(addDays(focusedDayKey, event.key === 'PageDown' ? 28 : -28))
    }
  }

  const isFocusedDayInView = weeks.flat().some((day) => day.dayKey === focusedDayKey)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Previous month" onClick={(): void => { goToMonth({ year: month.month === 1 ? month.year - 1 : month.year, month: month.month === 1 ? 12 : month.month - 1 }) }}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-card-border)] bg-[var(--color-card)] text-[var(--color-ink-700)] hover:text-[var(--color-ink-900)]">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2">
          <h3 aria-live="polite" className="text-base font-semibold text-[var(--color-ink-900)]">{formatManilaMonth(month)}</h3>
          <button type="button" onClick={(): void => { setMonth(manilaMonthOf(todayKey)); setFocusedDayKey(todayKey); onSelectDay(todayKey) }}
            className="rounded-full border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-1 text-xs font-semibold text-[var(--color-ink-700)] hover:text-[var(--color-ink-900)]">
            Today
          </button>
        </div>
        <button type="button" aria-label="Next month" onClick={(): void => { goToMonth({ year: month.month === 12 ? month.year + 1 : month.year, month: month.month === 12 ? 1 : month.month + 1 }) }}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-card-border)] bg-[var(--color-card)] text-[var(--color-ink-700)] hover:text-[var(--color-ink-900)]">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div ref={gridRef} role="grid" aria-label={`${label}, ${formatManilaMonth(month)}`} onKeyDown={onGridKeyDown} className="space-y-1">
        <div role="row" className="grid grid-cols-7 gap-1">
          {weekdayNames.map((name, index) => (
            <span key={name} role="columnheader" aria-label={weekdayFullNames[index]} className="py-1 text-center text-xs font-semibold text-[var(--color-ink-500)]">{name}</span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]?.dayKey} role="row" className="grid grid-cols-7 gap-1">
            {week.map((day) => {
              const dayEntries = entriesByDay.get(day.dayKey) ?? []
              const isSelected = day.dayKey === selectedDayKey
              const isToday = day.dayKey === todayKey
              const isTabStop = isFocusedDayInView ? day.dayKey === focusedDayKey : day.dayOfMonth === 1 && day.isInMonth
              return (
                <div key={day.dayKey} role="gridcell" aria-selected={isSelected}>
                  <button type="button" data-day={day.dayKey} tabIndex={isTabStop ? 0 : -1}
                    aria-label={`${formatManilaDayKey(day.dayKey)}${isToday ? ', today' : ''}, ${countLabel(dayEntries.length)}`}
                    onClick={(): void => { setFocusedDayKey(day.dayKey); onSelectDay(day.dayKey) }}
                    onFocus={(): void => { setFocusedDayKey(day.dayKey) }}
                    className={joinClassNames(
                      'flex h-16 w-full flex-col items-stretch gap-1 overflow-hidden rounded-[var(--radius-control)] border p-1 text-left transition-colors sm:h-24 sm:p-1.5',
                      day.isInMonth ? 'bg-[var(--color-card)]' : 'bg-[var(--color-surface-muted)] opacity-60',
                      isSelected ? 'border-[var(--color-brand-600)] ring-2 ring-[var(--color-brand-600)]' : 'border-[var(--color-card-border)] hover:border-[var(--color-ink-300)]',
                    )}>
                    <span className={joinClassNames(
                      'inline-flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-semibold tabular-nums',
                      isToday ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-ink-900)]',
                    )}>
                      {day.dayOfMonth}
                    </span>
                    {/* Wider screens: up to two pills with time and service, then "+N more". */}
                    <span aria-hidden="true" className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                      {dayEntries.slice(0, dayEntries.length > MAX_PILLS ? 1 : MAX_PILLS).map((entry) => <EntryPill key={entry.id} entry={entry} />)}
                      {dayEntries.length > MAX_PILLS ? <span className="px-1 text-[11px] font-medium text-[var(--color-ink-500)]">+{dayEntries.length - 1} more</span> : null}
                    </span>
                    {/* Phones: one dot per booking in its status color. */}
                    <span aria-hidden="true" className="flex flex-wrap gap-0.5 px-0.5 sm:hidden">
                      {dayEntries.slice(0, 6).map((entry) => (
                        <span key={entry.id} className={joinClassNames('h-2 w-2 rounded-full', entry.isRequest === true ? 'border border-dashed' : '')}
                          style={entry.isRequest === true
                            ? { borderColor: statusGroupColors(serviceBookingStatusGroup[entry.status]).line }
                            : { backgroundColor: statusGroupColors(serviceBookingStatusGroup[entry.status]).line }} />
                      ))}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <CalendarLegend hasRequests={hasRequests} />

      <section aria-label={`Bookings on ${formatManilaDayKey(selectedDayKey)}`} className="space-y-3 rounded-[var(--radius-surface)] border border-[var(--color-card-border)] bg-[var(--color-card)] p-3 sm:p-4">
        <h3 className="text-sm font-semibold text-[var(--color-ink-900)]">
          {formatManilaDayKey(selectedDayKey)}{selectedDayKey === todayKey ? ' · Today' : ''}
        </h3>
        {children}
      </section>
    </div>
  )
}

function EntryPill({ entry }: { readonly entry: CalendarEntry }): ReactElement {
  const colors = statusGroupColors(serviceBookingStatusGroup[entry.status])
  return (
    <span title={`${entry.timeLabel} · ${entry.title} · ${entry.isRequest === true ? 'Request' : serviceBookingStatusLabel[entry.status]}`}
      className={joinClassNames('block min-w-0 rounded-md px-1.5 py-0.5 text-[11px] leading-tight', entry.isRequest === true ? 'border border-dashed' : 'border-l-[3px]')}
      style={entry.isRequest === true
        ? { borderColor: colors.line, color: colors.text }
        : { backgroundColor: colors.background, color: colors.text, borderLeftColor: colors.line }}>
      {/* Two short lines, so the service name isn't cut off in a narrow day square. */}
      <span className="block truncate font-semibold tabular-nums">{entry.timeLabel}</span>
      <span className="block truncate font-medium">{entry.title}</span>
    </span>
  )
}

function CalendarLegend({ hasRequests }: { readonly hasRequests: boolean }): ReactElement {
  return (
    <ul aria-label="Status colors" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-ink-700)]">
      {serviceBookingStatusGroups.map((group) => (
        <li key={group} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusGroupColors(group).line }} />
          {serviceBookingStatusGroupLabel[group]}
        </li>
      ))}
      {hasRequests ? (
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border border-dashed border-[var(--status-waiting-line)]" />
          Request
        </li>
      ) : null}
    </ul>
  )
}
