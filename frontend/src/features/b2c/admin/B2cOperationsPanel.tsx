import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { WorkerDocumentOverview } from '@washlink/shared'
import { formatManilaDateTime, formatPesos } from '@washlink/shared'
import { Badge, Button, Card, Input, Select, Skeleton } from '../../../presentation/design/ui'
import { errorMessage, getB2cApi } from '../b2cApiClient'
import { AdminCancelBookingControl } from './AdminCancelBookingControl'
import { addonKey } from './addonKey'
import { WasherVerificationCard } from './WasherVerificationCard'

type Row = Record<string, unknown>
const text = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '')
const num = (value: unknown): number => Number(value ?? 0)
const pesos = (cents: unknown): string => formatPesos(num(cents))

const statusFilter = [
  { value: '', label: 'All statuses' },
  ...['searching_for_worker', 'no_worker_available', 'accepted', 'worker_on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled', 'expired']
    .map((value) => ({ value, label: value.replaceAll('_', ' ') })),
]

/** Every action here is checked and audited by the database; this panel only arranges it. */
export function B2cOperationsPanel(): ReactElement {
  const [summary, setSummary] = useState<Row | null>(null)
  const [catalog, setCatalog] = useState<Row | null>(null)
  const [workers, setWorkers] = useState<readonly Row[]>([])
  const [operatorIds, setOperatorIds] = useState<ReadonlySet<string>>(new Set())
  const [bookings, setBookings] = useState<readonly Row[]>([])
  const [filter, setFilter] = useState('')
  const [caseData, setCaseData] = useState<Row | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [overview, setOverview] = useState<WorkerDocumentOverview | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const api = getB2cApi()
      const [nextSummary, nextCatalog, nextWorkers, nextBookings, nextOverview, nextOperatorIds] = await Promise.all([
        api.adminSummary(), api.adminCatalog(), api.adminWorkers(), api.adminBookings(filter === '' ? null : filter), api.adminWorkerDocumentOverview(),
        // Marking operators is informational, so a database without operator mode yet still shows the panel.
        api.adminPlatformOperatorIds().catch((): readonly string[] => []),
      ])
      setOperatorIds(new Set(nextOperatorIds))
      setSummary(nextSummary)
      setCatalog(nextCatalog)
      setWorkers(nextWorkers)
      setBookings(nextBookings)
      setOverview(nextOverview)
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }, [filter])

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return (): void => { window.clearTimeout(timer) }
  }, [refresh])

  /** Resolves true when the action succeeded, so a form can keep what was typed after a refusal. */
  const run = async (action: () => Promise<void>, success: string): Promise<boolean> => {
    try {
      await action()
      toast.success(success)
      await refresh()
      return true
    } catch (caught) {
      toast.error(errorMessage(caught))
      return false
    }
  }

  if (error !== null && summary === null) {
    return <p role="alert" className="text-sm text-[var(--color-danger-600)]">{error}</p>
  }
  if (summary === null || catalog === null) {
    return <Skeleton heightClassName="h-40" />
  }

  const settings = (catalog.settings ?? {}) as Row
  const services = (catalog.services ?? []) as readonly Row[]
  const addons = (catalog.addons ?? []) as readonly Row[]
  const isOpen = settings.bookings_open === true
  const saveRules = (patch: { bookingsOpen?: boolean; commissionBps?: number }): Promise<void> => getB2cApi().adminUpdateRules({
    bookingsOpen: patch.bookingsOpen ?? isOpen,
    commissionBps: patch.commissionBps ?? num(settings.commission_bps),
    requestTtlSeconds: num(settings.request_ttl_seconds),
    searchWindowMinutes: num(settings.search_window_minutes),
    travelBufferMinutes: num(settings.travel_buffer_minutes),
  })

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="font-semibold text-[var(--color-ink-900)]">{isOpen ? 'Bookings are open' : 'Bookings are closed'}</h2>
          <p className="text-sm text-[var(--color-ink-700)]">
            {num(summary.draft_prices) > 0 ? `${text(summary.draft_prices)} services still have draft prices. Set final prices below before opening.` : 'All active services have final prices.'}
          </p>
        </div>
        <Button variant={isOpen ? 'secondary' : 'primary'} onClick={(): void => void run(() => saveRules({ bookingsOpen: !isOpen }), isOpen ? 'Bookings closed' : 'Bookings opened')}>
          {isOpen ? 'Close bookings' : 'Open bookings'}
        </Button>
      </Card>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Washers to review', summary.workers_pending], ['Washers online', summary.workers_online], ['Finding a washer', summary.bookings_searching], ['No washer found', summary.bookings_no_worker],
          ['Active bookings', summary.bookings_active], ['Completed', summary.bookings_completed], ['Expected cash', pesos(summary.customer_total_cents)], ['Expected commission', pesos(summary.platform_fee_cents)]].map(([label, value]) => (
          <Card key={text(label)} className="p-3"><dt className="text-xs text-[var(--color-ink-500)]">{text(label)}</dt><dd className="text-lg font-semibold tabular-nums">{text(value)}</dd></Card>
        ))}
      </dl>
      <p className="text-xs text-[var(--color-ink-500)]">Money figures are expected cash totals from completed bookings. WashLink does not yet confirm cash collection.</p>

      <section aria-labelledby="prices-title" className="space-y-3">
        <h2 id="prices-title" className="text-lg font-semibold text-[var(--color-ink-900)]">Services and prices</h2>
        <CommissionForm bps={num(settings.commission_bps)} onSave={(bps): void => void run(() => saveRules({ commissionBps: bps }), 'Commission saved')} />
        {services.map((service) => (
          <PriceRow key={text(service.id)} name={text(service.name)} cents={num(service.base_price_cents)} isDraft={service.price_is_draft === true} isActive={service.is_active === true}
            onSave={(cents, isActive): void => void run(() => getB2cApi().adminSaveService({
              p_id: service.id, p_key: service.key, p_category: service.category, p_name: service.name, p_description: service.description, p_image_url: service.image_url,
              p_requirements: service.requirements, p_base_price_cents: cents, p_duration_minutes: service.duration_minutes, p_is_active: isActive, p_price_is_draft: false, p_sort_order: service.sort_order,
            }), isActive === (service.is_active === true) ? 'Price saved' : isActive ? 'Service shown to customers' : 'Service hidden from customers')} />
        ))}
        {addons.map((addon) => (
          <PriceRow key={text(addon.id)} name={`Add-on: ${text(addon.name)}`} cents={num(addon.price_cents)} isDraft={addon.price_is_draft === true} isActive={addon.is_active === true}
            onSave={(cents, isActive): void => void run(() => getB2cApi().adminSaveAddon({
              p_id: addon.id, p_key: addon.key, p_name: addon.name, p_description: addon.description, p_price_cents: cents, p_duration_minutes: addon.duration_minutes,
              p_is_active: isActive, p_price_is_draft: false, p_sort_order: addon.sort_order,
            }), isActive === (addon.is_active === true) ? 'Price saved' : isActive ? 'Add-on shown to customers' : 'Add-on hidden from customers')} />
        ))}
        <NewAddonForm nextSortOrder={Math.max(0, ...addons.map((addon) => num(addon.sort_order))) + 10}
          onCreate={(addon): Promise<boolean> => run(() => getB2cApi().adminSaveAddon({
            p_id: null, p_key: addonKey(addon.name), p_name: addon.name, p_description: addon.description, p_price_cents: addon.priceCents,
            p_duration_minutes: addon.minutes, p_is_active: true, p_price_is_draft: false, p_sort_order: addon.sortOrder,
          }), 'Add-on added')} />
      </section>

      <section aria-labelledby="workers-title" className="space-y-3">
        <h2 id="workers-title" className="text-lg font-semibold text-[var(--color-ink-900)]">Washers</h2>
        {overview !== null ? (
          <div className="space-y-1 text-sm text-[var(--color-ink-700)]">
            <p>Documents to review: <span className="font-semibold tabular-nums">{overview.documentsToReview}</span></p>
            <p>Files waiting for removal: <span className="font-semibold tabular-nums">{overview.filesWaitingForRemoval}</span>{overview.oldestFileWaitingSince !== null ? `, the oldest since ${formatManilaDateTime(overview.oldestFileWaitingSince)}` : ''}</p>
            {overview.filesWaitingForRemoval > 0 ? <p className="text-xs text-[var(--color-ink-500)]">This count includes items the job hasn&apos;t reached yet, so it can be higher than the number of real files. These files stay in storage until the removal job runs. See the operations guide.</p> : null}
          </div>
        ) : null}
        {workers.length === 0 ? <p className="text-sm text-[var(--color-ink-700)]">No washers have signed up yet.</p> : null}
        {workers.map((worker) => <WasherVerificationCard key={text(worker.profile_id)} worker={worker} isPlatformOperator={operatorIds.has(text(worker.profile_id))} runAction={run} onChanged={refresh} />)}
      </section>

      <section aria-labelledby="bookings-title" className="space-y-3">
        <h2 id="bookings-title" className="text-lg font-semibold text-[var(--color-ink-900)]">Bookings</h2>
        <Select label="Show" options={statusFilter} value={filter} onChange={(event): void => { setFilter(event.target.value) }} />
        {bookings.length === 0 ? <p className="text-sm text-[var(--color-ink-700)]">No bookings to show.</p> : null}
        {bookings.map((booking) => (
          <Card key={text(booking.booking_id)} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
            <div>
              <p className="font-medium text-[var(--color-ink-900)]">{text(booking.reference)} · {text(booking.service_name)} · {pesos(booking.customer_total_cents)}</p>
              <p className="text-[var(--color-ink-700)]">{text(booking.status).replaceAll('_', ' ')} · {text(booking.customer_name)} · washer: {text(booking.worker_name) || 'none'} · {text(booking.open_offers)} open requests</p>
            </div>
            <Button size="sm" variant="secondary" onClick={(): void => { getB2cApi().adminBookingCase(text(booking.booking_id)).then(setCaseData).catch((caught: unknown) => { toast.error(errorMessage(caught)) }) }}>Open case</Button>
            {booking.status === 'arrived' || booking.status === 'in_progress' ? <AdminCancelBookingControl bookingId={text(booking.booking_id)} onCancelled={refresh} /> : null}
          </Card>
        ))}
        {caseData !== null ? (
          <Card className="space-y-2 p-4 text-sm">
            <h3 className="font-semibold text-[var(--color-ink-900)]">Booking history</h3>
            <p className="text-xs text-[var(--color-ink-500)]">Opening a case is recorded in the audit log.</p>
            <ol className="space-y-1">
              {((caseData.events ?? []) as readonly Row[]).map((event) => (
                <li key={text(event.id)}>{new Date(text(event.created_at)).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}: {text(event.from_status) || 'new'} to {text(event.to_status)} by {text(event.actor_kind)}{event.reason ? `. ${text(event.reason)}` : ''}</li>
              ))}
            </ol>
            <p>Dispatch attempts: {((caseData.dispatch ?? []) as readonly Row[]).length}</p>
            <Button size="sm" variant="ghost" onClick={(): void => { setCaseData(null) }}>Close case</Button>
          </Card>
        ) : null}
      </section>
    </div>
  )
}

function CommissionForm({ bps, onSave }: { readonly bps: number; readonly onSave: (bps: number) => void }): ReactElement {
  const [percent, setPercent] = useState(String(bps / 100))
  return (
    <div className="flex items-end gap-2">
      <Input label="Platform commission (%)" inputMode="decimal" value={percent} onChange={(event): void => { setPercent(event.target.value) }} />
      <Button variant="secondary" onClick={(): void => { onSave(Math.round(Number(percent) * 100)) }}>Save</Button>
    </div>
  )
}

interface NewAddon { readonly name: string; readonly description: string; readonly priceCents: number; readonly minutes: number; readonly sortOrder: number }

function NewAddonForm({ nextSortOrder, onCreate }: { readonly nextSortOrder: number; readonly onCreate: (addon: NewAddon) => Promise<boolean> }): ReactElement {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [pesosValue, setPesosValue] = useState('')
  const [minutesValue, setMinutesValue] = useState('0')
  const price = Number(pesosValue)
  const minutes = Number(minutesValue)
  const isValid = name.trim().length >= 2 && pesosValue.trim() !== '' && Number.isFinite(price) && price >= 0
    && Number.isInteger(minutes) && minutes >= 0 && minutes <= 240
  return (
    <Card className="space-y-3 p-3">
      <h3 className="text-sm font-semibold text-[var(--color-ink-900)]">Add an add-on</h3>
      <p className="text-xs text-[var(--color-ink-500)]">For example a car freshener. Customers can pick it with any service. Hide it when you run out.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Name" value={name} maxLength={80} onChange={(event): void => { setName(event.target.value) }} />
        <Input label="Add-on price (₱)" inputMode="decimal" value={pesosValue} onChange={(event): void => { setPesosValue(event.target.value) }} />
        <Input label="Short description (optional)" value={description} maxLength={300} onChange={(event): void => { setDescription(event.target.value) }} />
        <Input label="Extra minutes" helperText="How much longer the wash takes. 0 if none." inputMode="numeric" value={minutesValue} onChange={(event): void => { setMinutesValue(event.target.value) }} />
      </div>
      <Button size="sm" disabled={!isValid} onClick={(): void => {
        void onCreate({ name: name.trim(), description: description.trim(), priceCents: Math.round(price * 100), minutes, sortOrder: nextSortOrder }).then((isSaved) => {
          if (isSaved) {
            setName(''); setDescription(''); setPesosValue(''); setMinutesValue('0')
          }
        })
      }}>Add add-on</Button>
    </Card>
  )
}

function PriceRow({ name, cents, isDraft, isActive, onSave }: { readonly name: string; readonly cents: number; readonly isDraft: boolean; readonly isActive: boolean; readonly onSave: (cents: number, isActive: boolean) => void }): ReactElement {
  const [pesosValue, setPesosValue] = useState(String(cents / 100))
  return (
    <Card className="flex flex-wrap items-end justify-between gap-3 p-3">
      <div className="min-w-48 flex-1 text-sm font-medium text-[var(--color-ink-900)]">{name} {isDraft ? <Badge tone="warning">Draft price</Badge> : null}{!isActive ? <Badge tone="neutral">Hidden</Badge> : null}</div>
      <div className="flex items-end gap-2">
        <Input label="Price (₱)" inputMode="decimal" value={pesosValue} onChange={(event): void => { setPesosValue(event.target.value) }} />
        <Button size="sm" onClick={(): void => { onSave(Math.round(Number(pesosValue) * 100), isActive) }}>{isDraft ? 'Set final price' : 'Save'}</Button>
        {/* Hiding keeps the item and its price; customers just stop seeing it, for example when a product runs out. */}
        <Button size="sm" variant="ghost" aria-label={`${isActive ? 'Hide' : 'Show'} ${name}`} onClick={(): void => { onSave(Math.round(Number(pesosValue) * 100), !isActive) }}>{isActive ? 'Hide' : 'Show'}</Button>
      </div>
    </Card>
  )
}
