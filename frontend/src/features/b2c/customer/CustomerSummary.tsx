import type { ReactElement } from 'react'
import { CalendarCheck, CarFront, CheckCircle2, MapPin, Wallet } from 'lucide-react'
import { formatManilaDateTime, formatPesos, isActiveServiceBooking, type CustomerBooking } from '@washlink/shared'
import { Button, Card, StatCard, StatusPill } from '../../../presentation/design/ui'

interface CustomerSummaryProps {
  readonly bookings: readonly CustomerBooking[] | null
  readonly onBook: () => void
}

/** The wide-screen glance panel: the next wash, then a few totals. Everything here also lives in the tabs. */
export function CustomerSummary({ bookings, onBook }: CustomerSummaryProps): ReactElement {
  const active = (bookings ?? []).filter((booking) => isActiveServiceBooking(booking.status))
    .sort((first, second) => Date.parse(first.scheduledAt) - Date.parse(second.scheduledAt))
  const next = active.at(0)
  const completed = (bookings ?? []).filter((booking) => booking.status === 'completed')
  const spentCents = completed.reduce((total, booking) => total + booking.customerTotalCents, 0)

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="wl-harbor px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-on-harbor-muted)]">
            <CalendarCheck className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" /> Next wash
          </p>
        </div>
        {next === undefined ? (
          <div className="space-y-3 p-4">
            <p className="text-sm text-[var(--color-ink-700)]">No wash booked yet.</p>
            <Button variant="accent" size="sm" leadingIcon={<CarFront className="h-4 w-4" aria-hidden="true" />} onClick={onBook}>Book a car wash</Button>
          </div>
        ) : (
          <div className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-ink-900)]">{next.serviceName}</p>
              <StatusPill status={next.status} />
            </div>
            <p className="text-sm font-medium text-[var(--color-ink-900)]">{formatManilaDateTime(next.scheduledAt)}</p>
            <p className="flex items-start gap-1.5 text-sm text-[var(--color-ink-700)]">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-500)]" aria-hidden="true" />{next.address}
            </p>
            <p className="text-sm text-[var(--color-ink-700)]">{next.vehicleMake} {next.vehicleModel} · {formatPesos(next.customerTotalCents)}, pay in cash</p>
          </div>
        )}
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<CalendarCheck className="h-5 w-5" aria-hidden="true" />} accentTone="brand" label="Upcoming" value={active.length} />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />} accentTone="success" label="Completed" value={completed.length} />
      </div>
      <StatCard icon={<Wallet className="h-5 w-5" aria-hidden="true" />} accentTone="warning" label="Spent on washes" value={formatPesos(spentCents)} helperText="Completed washes, paid in cash." />
    </>
  )
}
