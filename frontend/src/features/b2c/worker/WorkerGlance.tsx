import type { ReactElement } from 'react'
import { BellRing, CalendarClock, CheckCircle2, Star, Wallet } from 'lucide-react'
import { formatManilaTime, formatPesos, manilaDayKey, type AssignedBooking, type WorkerSummary as WorkerTotals } from '@washlink/shared'
import { Card, StatCard, StatusPill } from '../../../presentation/design/ui'

interface WorkerGlanceProps {
  readonly todayKey: string
  readonly activeJobs: readonly AssignedBooking[]
  readonly requestCount: number
  readonly totals: WorkerTotals | null
}

/** The wide-screen glance panel: today's jobs, waiting requests and totals. Everything here also lives in the tabs. */
export function WorkerGlance({ todayKey, activeJobs, requestCount, totals }: WorkerGlanceProps): ReactElement {
  const today = activeJobs.filter((job) => manilaDayKey(job.scheduledAt) === todayKey)
  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="wl-harbor px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-on-harbor-muted)]">
            <CalendarClock className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" /> Today
          </p>
        </div>
        <div className="p-4">
          {today.length === 0 ? <p className="text-sm text-[var(--color-ink-700)]">Nothing scheduled today.</p> : (
            <ul className="space-y-3">
              {today.map((job) => (
                <li key={job.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-[family-name:var(--font-display)] text-base font-bold tabular-nums text-[var(--color-ink-900)]">{formatManilaTime(job.scheduledAt)}</p>
                    <p className="truncate text-sm text-[var(--color-ink-700)]">{job.serviceName}</p>
                  </div>
                  <StatusPill status={job.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      <StatCard icon={<BellRing className="h-5 w-5" aria-hidden="true" />} accentTone={requestCount > 0 ? 'warning' : 'neutral'} label="Requests waiting" value={requestCount} />
      <StatCard icon={<Wallet className="h-5 w-5" aria-hidden="true" />} accentTone="brand" label="Earnings" value={formatPesos(totals?.earningsCents ?? 0)} />
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />} accentTone="success" label="Completed" value={totals?.completedCount ?? 0} />
        <StatCard icon={<Star className="h-5 w-5" aria-hidden="true" />} accentTone="warning" label="Rating" value={totals?.averageRating ?? '—'} />
      </div>
    </>
  )
}
