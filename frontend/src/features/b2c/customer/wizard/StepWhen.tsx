import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { formatManilaTime, upcomingManilaDates, type TimeSlot } from '@washlink/shared'
import { EmptyState, Skeleton } from '../../../../presentation/design/ui'
import { joinClassNames } from '../../../../presentation/design/classNames'
import { errorMessage, getB2cApi } from '../../b2cApiClient'
import type { StepProps } from './BookingWizard'

const choiceClass = (isSelected: boolean, isDisabled = false): string =>
  joinClassNames(
    'min-h-11 rounded-[var(--radius-control)] border px-3 text-sm font-medium transition-colors',
    isSelected ? 'border-[var(--color-brand-700)] bg-[var(--color-brand-50)] text-[var(--color-brand-900)]' : 'border-[var(--color-card-border)] bg-[var(--color-card)] text-[var(--color-ink-900)]',
    isDisabled ? 'cursor-not-allowed text-[var(--color-ink-400)] line-through' : 'cursor-pointer',
  )

function dateLabel(date: string): string {
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric' })
}

/** Times come from worker hours, existing jobs and travel buffers; an unavailable slot is shown but cannot be chosen. */
export function StepWhen({ draft, update, services }: StepProps): ReactElement {
  const dates = upcomingManilaDates(14)
  const [date, setDate] = useState(dates[0])
  const [slots, setSlots] = useState<readonly TimeSlot[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The service may not be chosen yet: use it if known, else the first car service. The review step re-checks.
  const probeService = draft.serviceId ?? services.find((service) => service.supportedVehicles.includes(draft.vehicleCategory))?.id ?? null

  useEffect(() => {
    if (probeService === null) {
      return
    }
    let isCurrent = true
    getB2cApi()
      .availableSlots({ date, serviceId: probeService, category: draft.vehicleCategory, addonIds: draft.addonIds, latitude: draft.latitude, longitude: draft.longitude })
      .then((next) => { if (isCurrent) { setSlots(next); setError(null) } })
      .catch((caught: unknown) => { if (isCurrent) { setError(errorMessage(caught)) } })
    return (): void => { isCurrent = false }
  }, [date, probeService, draft.vehicleCategory, draft.addonIds, draft.latitude, draft.longitude])

  return (
    <section aria-labelledby="when-title" className="space-y-4">
      <h2 id="when-title" className="text-lg font-semibold text-[var(--color-ink-900)]">When should we come?</h2>
      <button type="button" aria-pressed={draft.isImmediate} className={joinClassNames(choiceClass(draft.isImmediate), 'w-full text-left')}
        onClick={(): void => { update({ isImmediate: true, scheduledAt: null }) }}>
        As soon as possible
      </button>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-[var(--color-ink-700)]">Or choose a date</legend>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dates.map((value) => (
            <button key={value} type="button" aria-pressed={value === date} className={joinClassNames(choiceClass(value === date), 'shrink-0')}
              onClick={(): void => { setSlots(null); setDate(value) }}>
              {dateLabel(value)}
            </button>
          ))}
        </div>
      </fieldset>
      {error !== null ? <p role="alert" className="text-sm text-[var(--color-danger-600)]">{error}</p> : null}
      {slots === null && error === null ? <Skeleton heightClassName="h-24" /> : null}
      {slots?.length === 0 ? <EmptyState title="No washers on this day" description="Try another date, or book for as soon as possible." /> : null}
      {slots !== null && slots.length > 0 && slots.every((slot) => !slot.isAvailable) ? (
        <p className="text-sm text-[var(--color-ink-700)]">Every time on this day has passed or is taken. Try another date.</p>
      ) : null}
      {slots !== null && slots.length > 0 ? (
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-medium text-[var(--color-ink-700)]">Choose a time</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((slot) => (
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
