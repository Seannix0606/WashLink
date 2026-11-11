import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  formatManilaDayKey,
  formatManilaMonth,
  formatManilaTime,
  manilaMonthGrid,
  manilaMonthOf,
  shiftManilaMonth,
  upcomingManilaDates,
  type ManilaMonth,
  type TimeSlot,
} from '@washlink/shared'
import { EmptyState, Skeleton } from '../../../../presentation/design/ui'
import { joinClassNames } from '../../../../presentation/design/classNames'
import { errorMessage, getB2cApi } from '../../b2cApiClient'
import type { StepProps } from './BookingWizard'

/** How far ahead the calendar looks. The database refuses dates past its booking horizon (30 days by default). */
export const BOOKING_CALENDAR_DAYS = 28
const weekdayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const choiceClass = (isSelected: boolean, isDisabled = false): string =>
  joinClassNames(
    'min-h-11 rounded-[var(--radius-control)] border px-3 text-sm font-medium transition-colors',
    isSelected ? 'border-[var(--color-brand-700)] bg-[var(--color-brand-50)] text-[var(--color-brand-900)]' : 'border-[var(--color-card-border)] bg-[var(--color-card)] text-[var(--color-ink-900)]',
    isDisabled ? 'cursor-not-allowed text-[var(--color-ink-400)] line-through' : 'cursor-pointer',
  )

const sameMonth = (left: ManilaMonth, right: ManilaMonth): boolean => left.year === right.year && left.month === right.month
const openCount = (slots: readonly TimeSlot[] | undefined): number => slots?.filter((slot) => slot.isAvailable).length ?? 0

/**
 * Every booking is for a chosen day and time (there is no "as soon as possible"). A month calendar of the next four weeks: days with at least one free time are marked open and can be picked, then
 * the free times of that day are listed. Times come from the washer's working hours, existing jobs and travel buffers.
 */
export function StepWhen({ draft, update, services }: StepProps): ReactElement {
  const dates = useMemo(() => upcomingManilaDates(BOOKING_CALENDAR_DAYS), [])
  const [slotsByDay, setSlotsByDay] = useState<ReadonlyMap<string, readonly TimeSlot[]> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chosenDay, setChosenDay] = useState<string | null>(null)
  // The month the customer moved to with the arrows; until then, the month of the selected day.
  const [pickedMonth, setPickedMonth] = useState<ManilaMonth | null>(null)
  // The service may not be chosen yet: use it if known, else the first car service. The review step re-checks.
  const probeService = draft.serviceId ?? services.find((service) => service.supportedVehicles.includes(draft.vehicleCategory))?.id ?? null

  useEffect(() => {
    if (probeService === null) {
      return
    }
    let isCurrent = true
    const api = getB2cApi()
    Promise.all(dates.map(async (date) => {
      const slots = await api.availableSlots({ date, serviceId: probeService, category: draft.vehicleCategory, addonIds: draft.addonIds, latitude: draft.latitude, longitude: draft.longitude })
      return [date, slots] as const
    }))
      .then((entries) => {
        if (!isCurrent) return
        setSlotsByDay(new Map(entries))
        setError(null)
      })
      .catch((caught: unknown) => { if (isCurrent) setError(errorMessage(caught)) })
    return (): void => { isCurrent = false }
  }, [dates, probeService, draft.vehicleCategory, draft.addonIds, draft.latitude, draft.longitude])

  // Every booking has a set time: the washer works fixed hours. A draft saved before "As soon as possible" was
  // removed is switched back to choosing a time.
  const isImmediateDraft = draft.isImmediate
  useEffect(() => {
    if (isImmediateDraft) update({ isImmediate: false, scheduledAt: null })
  }, [isImmediateDraft, update])

  const openDays = useMemo(() => dates.filter((date) => openCount(slotsByDay?.get(date)) > 0), [dates, slotsByDay])
  // Until the customer picks a day, show the day of an already chosen time, else the first open day.
  const draftDay = draft.scheduledAt === null ? null : dates.find((date) => slotsByDay?.get(date)?.some((slot) => slot.startsAt === draft.scheduledAt)) ?? null
  const selectedDay = chosenDay ?? draftDay ?? openDays.at(0) ?? null

  const firstMonth = manilaMonthOf(dates[0])
  const shownMonth = pickedMonth ?? (selectedDay === null ? firstMonth : manilaMonthOf(selectedDay))
  const lastMonth = manilaMonthOf(dates[dates.length - 1])
  const daySlots = selectedDay === null ? undefined : slotsByDay?.get(selectedDay)

  return (
    <section aria-labelledby="when-title" className="space-y-4">
      <h2 id="when-title" className="text-lg font-semibold text-[var(--color-ink-900)]">When should we come?</h2>
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-[var(--color-ink-700)]">Choose a day</p>
          <p className="flex items-center gap-1.5 text-xs text-[var(--color-ink-500)]">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--color-primary-soft)]" />
            Open for booking
          </p>
        </div>
        <div className="rounded-[var(--radius-surface)] border border-[var(--color-card-border)] bg-[var(--color-card)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Previous month" disabled={sameMonth(shownMonth, firstMonth)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-700)] hover:bg-[var(--color-surface-muted)] disabled:invisible"
              onClick={(): void => { setPickedMonth(shiftManilaMonth(shownMonth, -1)) }}>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <p aria-live="polite" className="text-sm font-semibold text-[var(--color-ink-900)]">{formatManilaMonth(shownMonth)}</p>
            <button type="button" aria-label="Next month" disabled={sameMonth(shownMonth, lastMonth)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-700)] hover:bg-[var(--color-surface-muted)] disabled:invisible"
              onClick={(): void => { setPickedMonth(shiftManilaMonth(shownMonth, 1)) }}>
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center" role="group" aria-label={`Days in ${formatManilaMonth(shownMonth)}`}>
            {weekdayHeaders.map((name) => <span key={name} aria-hidden="true" className="pb-1 text-xs font-medium text-[var(--color-ink-500)]">{name}</span>)}
            {manilaMonthGrid(shownMonth).flat().map((day) => {
              const isInRange = day.isInMonth && dates.includes(day.dayKey)
              if (!isInRange) {
                return <span key={day.dayKey} aria-hidden="true" className="flex h-11 items-center justify-center text-sm text-[var(--color-ink-300)]">{day.isInMonth ? day.dayOfMonth : ''}</span>
              }
              const free = openCount(slotsByDay?.get(day.dayKey))
              const isOpen = free > 0
              const isSelected = day.dayKey === selectedDay
              const label = `${formatManilaDayKey(day.dayKey)}, ${slotsByDay === null ? 'checking' : isOpen ? `${String(free)} open ${free === 1 ? 'time' : 'times'}` : 'closed'}`
              return (
                <button key={day.dayKey} type="button" disabled={!isOpen} aria-pressed={isSelected} aria-label={label}
                  className={joinClassNames(
                    'relative flex h-11 flex-col items-center justify-center rounded-[var(--radius-control)] text-sm transition-colors',
                    isSelected ? 'bg-[var(--color-primary)] font-semibold text-white'
                      : isOpen ? 'cursor-pointer border border-[var(--color-brand-300)] bg-[var(--color-brand-50)] font-semibold text-[var(--color-brand-900)] hover:border-[var(--color-brand-700)]'
                        : 'cursor-not-allowed text-[var(--color-ink-400)]',
                  )}
                  onClick={(): void => { setChosenDay(day.dayKey) }}>
                  {day.dayOfMonth}
                  {isOpen && !isSelected ? <span aria-hidden="true" className="absolute bottom-1 h-1 w-1 rounded-full bg-[var(--color-primary-soft)]" /> : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {error !== null ? <p role="alert" className="text-sm text-[var(--color-danger-600)]">{error}</p> : null}
      {slotsByDay === null && error === null ? <Skeleton heightClassName="h-24" /> : null}
      {slotsByDay !== null && openDays.length === 0 ? (
        <EmptyState title="No open days in the next four weeks" description="Book for as soon as possible, or check back soon." />
      ) : null}
      {selectedDay !== null && daySlots !== undefined && openCount(daySlots) > 0 ? (
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-medium text-[var(--color-ink-700)]">Choose a time on {formatManilaDayKey(selectedDay)}</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {daySlots.map((slot) => (
              <button key={slot.startsAt} type="button" disabled={!slot.isAvailable} aria-pressed={draft.scheduledAt === slot.startsAt}
                aria-label={`${formatManilaTime(slot.startsAt)}${slot.isAvailable ? '' : ', unavailable'}`}
                className={choiceClass(draft.scheduledAt === slot.startsAt, !slot.isAvailable)}
                onClick={(): void => { update({ isImmediate: false, scheduledAt: slot.startsAt }) }}>
                {formatManilaTime(slot.startsAt)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
    </section>
  )
}
