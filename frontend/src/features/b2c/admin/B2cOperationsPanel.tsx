import type { ReactElement } from 'react'
import { CalendarClock, CheckCircle2, CircleSlash, Coins, Radio, Search, ShieldAlert, Store, TriangleAlert, Wallet } from 'lucide-react'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { WorkerDocumentOverview } from '@washlink/shared'
import { formatManilaDateTime, formatPesos, serviceBookingStatusLabel, serviceBookingStatuses, type ServiceBookingStatus } from '@washlink/shared'
import { Badge, Button, Card, Input, Section, Select, Skeleton, StatusPill, statusEdgeStyle } from '../../../presentation/design/ui'
import { errorMessage, getB2cApi } from '../b2cApiClient'
import { useMediaQuery, WIDE_SCREEN_QUERY } from '../../../presentation/design/useMediaQuery'
import { AdminCancelBookingControl } from './AdminCancelBookingControl'
import { addonKey } from './addonKey'
import { WasherVerificationCard } from './WasherVerificationCard'

type Row = Record<string, unknown>
const asStatus = (value: unknown): ServiceBookingStatus | null =>
  serviceBookingStatuses.find((status) => status === value) ?? null
const text = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '')
const num = (value: unknown): number => Number(value ?? 0)
const pesos = (cents: unknown): string => formatPesos(num(cents))

const statusFilter = [
  { value: '', label: 'All statuses' },
  ...['searching_for_worker', 'no_worker_available', 'accepted', 'worker_on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled', 'expired']
    .map((value) => ({ value, label: serviceBookingStatusLabel[value as ServiceBookingStatus] })),
]

/** Every action here is checked and audited by the database; this panel only arranges it. */
export function B2cOperationsPanel(): ReactElement {
  const [summary, setSummary] = useState<Row | null>(null)
  const [catalog, setCatalog] = useState<Row | null>(null)
  const [workers, setWorkers] = useState<readonly Row[]>([])
  const [operatorIds, setOperatorIds] = useState<ReadonlySet<string>>(new Set())
  const [bookings, setBookings] = useState<readonly Row[]>([])
  const isWide = useMediaQuery(WIDE_SCREEN_QUERY)
  const [filter, setFilter] = useState('')
  const [openCase, setOpenCase] = useState<{ readonly bookingId: string; readonly data: Row } | null>(null)
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
  const saveRules = (patch: { bookingsOpen?: boolean; commissionBps?: number; travelBufferMinutes?: number }): Promise<void> => getB2cApi().adminUpdateRules({
    bookingsOpen: patch.bookingsOpen ?? isOpen,
    commissionBps: patch.commissionBps ?? num(settings.commission_bps),
    requestTtlSeconds: num(settings.request_ttl_seconds),
    searchWindowMinutes: num(settings.search_window_minutes),
    travelBufferMinutes: patch.travelBufferMinutes ?? num(settings.travel_buffer_minutes),
  })

  const hiddenServices = services.filter((service) => service.is_active !== true)
  const hiddenAddons = addons.filter((addon) => addon.is_active !== true)
  const serviceRow = (service: Row): ReactElement => (
    <PriceRow key={text(service.id)} name={text(service.name)} cents={num(service.base_price_cents)} isDraft={service.price_is_draft === true} isActive={service.is_active === true}
            minutes={num(service.duration_minutes)} minutesRule={serviceMinutes}
            onSave={(cents, isActive, minutes): void => void run(() => getB2cApi().adminSaveService({
              p_id: service.id, p_key: service.key, p_category: service.category, p_name: service.name, p_description: service.description, p_image_url: service.image_url,
              p_requirements: service.requirements, p_base_price_cents: cents, p_duration_minutes: minutes, p_is_active: isActive, p_price_is_draft: false, p_sort_order: service.sort_order,
            }), isActive === (service.is_active === true) ? 'Saved' : isActive ? 'Service shown to customers' : 'Service hidden from customers')} />
  )
  const addonRow = (addon: Row): ReactElement => (
    <PriceRow key={text(addon.id)} name={`Add-on: ${text(addon.name)}`} cents={num(addon.price_cents)} isDraft={addon.price_is_draft === true} isActive={addon.is_active === true}
            minutes={num(addon.duration_minutes)} minutesRule={addonMinutes}
            onSave={(cents, isActive, minutes): void => void run(() => getB2cApi().adminSaveAddon({
              p_id: addon.id, p_key: addon.key, p_name: addon.name, p_description: addon.description, p_price_cents: cents, p_duration_minutes: minutes,
              p_is_active: isActive, p_price_is_draft: false, p_sort_order: addon.sort_order,
            }), isActive === (addon.is_active === true) ? 'Saved' : isActive ? 'Add-on shown to customers' : 'Add-on hidden from customers')} />
  )

  // Wide screens: services, washers and bookings on the left; the overview stays in view on the right.
  const overviewBlock = (
    <>
        <Card className={`flex flex-wrap items-center justify-between gap-3 border-l-4 p-4 ${isOpen ? 'border-l-[var(--color-success-500)]' : 'border-l-[var(--color-ink-400)]'}`}>
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isOpen ? 'bg-[var(--color-success-50)] text-[var(--color-success-600)]' : 'bg-[var(--color-ink-100)] text-[var(--color-ink-700)]'}`}>
              {isOpen ? <Store className="h-5 w-5" /> : <CircleSlash className="h-5 w-5" />}
            </span>
            <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-ink-900)]">{isOpen ? 'Bookings are open' : 'Bookings are closed'}</h2>
            <p className="text-sm text-[var(--color-ink-700)]">
              {num(summary.draft_prices) > 0 ? `${text(summary.draft_prices)} services still have draft prices. Set final prices below before opening.` : 'All active services have final prices.'}
            </p>
            </div>
          </div>
          <Button variant={isOpen ? 'secondary' : 'primary'} onClick={(): void => void run(() => saveRules({ bookingsOpen: !isOpen }), isOpen ? 'Bookings closed' : 'Bookings opened')}>
            {isOpen ? 'Close bookings' : 'Open bookings'}
          </Button>
        </Card>

        {/* Bento: the two money figures lead on the harbor color, then six counts with an icon each. */}
        <dl className={isWide ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-2 gap-3 lg:grid-cols-6'}>
          {[
            { label: 'Expected cash', value: pesos(summary.customer_total_cents), icon: <Wallet className="h-5 w-5" /> },
            { label: 'Expected commission', value: pesos(summary.platform_fee_cents), icon: <Coins className="h-5 w-5" /> },
          ].map((tile) => (
            <div key={tile.label} className={`wl-harbor relative col-span-2 overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-harbor-700)] p-4 shadow-[var(--shadow-card-hover)] ${isWide ? '' : 'sm:col-span-1 lg:col-span-3'}`}>
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-on-harbor-muted)]">
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-[var(--color-accent)]">{tile.icon}</span>
                {tile.label}
              </dt>
              <dd className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums text-[var(--color-accent)]">{tile.value}</dd>
            </div>
          ))}
          {[
            { label: 'Washers to review', value: summary.workers_pending, icon: <ShieldAlert className="h-4 w-4" />, tone: 'warning' },
            { label: 'Washers online', value: summary.workers_online, icon: <Radio className="h-4 w-4" />, tone: 'success' },
            { label: 'Finding a washer', value: summary.bookings_searching, icon: <Search className="h-4 w-4" />, tone: 'warning' },
            { label: 'No washer found', value: summary.bookings_no_worker, icon: <TriangleAlert className="h-4 w-4" />, tone: 'danger' },
            { label: 'Active bookings', value: summary.bookings_active, icon: <CalendarClock className="h-4 w-4" />, tone: 'brand' },
            { label: 'Completed', value: summary.bookings_completed, icon: <CheckCircle2 className="h-4 w-4" />, tone: 'success' },
          ].map((tile) => (
            <Card key={tile.label} className={isWide ? 'p-3' : 'p-3 lg:col-span-2'}>
              <dt className="flex items-center gap-2 text-xs font-medium text-[var(--color-ink-500)]">
                <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tileTone[tile.tone]}`}>{tile.icon}</span>
                {tile.label}
              </dt>
              <dd className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums text-[var(--color-ink-900)]">{text(tile.value)}</dd>
            </Card>
          ))}
        </dl>
        <p className="text-xs text-[var(--color-ink-500)]">Money figures are expected cash totals from completed bookings. WashLink does not yet confirm cash collection.</p>
    </>
  )
  const sections = (
    <>
        <Section title="Services and prices" description="Draft prices can't be booked. Hidden items stay saved but customers don't see them.">
          <CommissionForm bps={num(settings.commission_bps)} onSave={(bps): void => void run(() => saveRules({ commissionBps: bps }), 'Commission saved')} />
          <TravelGapForm minutes={num(settings.travel_buffer_minutes)} onSave={(minutes): void => void run(() => saveRules({ travelBufferMinutes: minutes }), 'Travel gap saved')} />
          {services.filter((service) => service.is_active === true).map(serviceRow)}
          {addons.filter((addon) => addon.is_active === true).map(addonRow)}
          <NewAddonForm nextSortOrder={Math.max(0, ...addons.map((addon) => num(addon.sort_order))) + 10}
            onCreate={(addon): Promise<boolean> => run(() => getB2cApi().adminSaveAddon({
              p_id: null, p_key: addonKey(addon.name), p_name: addon.name, p_description: addon.description, p_price_cents: addon.priceCents,
              p_duration_minutes: addon.minutes, p_is_active: true, p_price_is_draft: false, p_sort_order: addon.sortOrder,
            }), 'Add-on added')} />
          {hiddenServices.length + hiddenAddons.length > 0 ? (
            <details className="rounded-[var(--radius-control)] border border-dashed border-[var(--color-card-border)] bg-[var(--color-card)] p-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink-700)]">
                Hidden ({hiddenServices.length + hiddenAddons.length}): saved, but customers don&apos;t see them
              </summary>
              <div className="mt-3 space-y-3">
                {hiddenServices.map(serviceRow)}
                {hiddenAddons.map(addonRow)}
              </div>
            </details>
          ) : null}
        </Section>

        <Section title="Washers" count={workers.length}>
          {overview !== null ? (
            <div className="space-y-1 text-sm text-[var(--color-ink-700)]">
              <p>Documents to review: <span className="font-semibold tabular-nums">{overview.documentsToReview}</span></p>
              <p>Files waiting for removal: <span className="font-semibold tabular-nums">{overview.filesWaitingForRemoval}</span>{overview.oldestFileWaitingSince !== null ? `, the oldest since ${formatManilaDateTime(overview.oldestFileWaitingSince)}` : ''}</p>
              {overview.filesWaitingForRemoval > 0 ? <p className="text-xs text-[var(--color-ink-500)]">This count includes items the job hasn&apos;t reached yet, so it can be higher than the number of real files. These files stay in storage until the removal job runs. See the operations guide.</p> : null}
            </div>
          ) : null}
          {workers.length === 0 ? <p className="text-sm text-[var(--color-ink-700)]">No washers have signed up yet.</p> : null}
          {workers.map((worker) => <WasherVerificationCard key={text(worker.profile_id)} worker={worker} isPlatformOperator={operatorIds.has(text(worker.profile_id))} runAction={run} onChanged={refresh} />)}
        </Section>

        <Section title="Bookings" count={bookings.length}>
          <Select label="Show" options={statusFilter} value={filter} onChange={(event): void => { setFilter(event.target.value) }} />
          {bookings.length === 0 ? <p className="text-sm text-[var(--color-ink-700)]">No bookings to show.</p> : null}
          {bookings.map((booking) => {
            const status = asStatus(booking.status)
            return (
            <Fragment key={text(booking.booking_id)}>
            <Card className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm" style={status === null ? undefined : statusEdgeStyle(status)}>
              <div className="space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium text-[var(--color-ink-900)]">
                  {text(booking.reference)} · {text(booking.service_name)} · {pesos(booking.customer_total_cents)}
                  {status === null ? <span className="text-[var(--color-ink-500)]">{text(booking.status)}</span> : <StatusPill status={status} />}
                </p>
                <p className="text-[var(--color-ink-700)]">{text(booking.customer_name)} · washer: {text(booking.worker_name) || 'none'} · {text(booking.open_offers)} open requests</p>
              </div>
              <Button size="sm" variant="secondary" aria-expanded={openCase?.bookingId === text(booking.booking_id)} onClick={(): void => {
                const bookingId = text(booking.booking_id)
                if (openCase?.bookingId === bookingId) {
                  setOpenCase(null)
                  return
                }
                getB2cApi().adminBookingCase(bookingId).then((data) => { setOpenCase({ bookingId, data }) }).catch((caught: unknown) => { toast.error(errorMessage(caught)) })
              }}>{openCase?.bookingId === text(booking.booking_id) ? 'Close case' : 'Open case'}</Button>
              {booking.status === 'arrived' || booking.status === 'in_progress' ? <AdminCancelBookingControl bookingId={text(booking.booking_id)} onCancelled={refresh} /> : null}
            </Card>
            {openCase?.bookingId === text(booking.booking_id) ? <BookingCaseHistory data={openCase.data} onClose={(): void => { setOpenCase(null) }} /> : null}
            </Fragment>
            )
          })}
        </Section>
    </>
  )
  const needsAttention = bookings.filter((booking) => booking.status === 'no_worker_available' || booking.status === 'searching_for_worker')

  if (isWide) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_22rem] items-start gap-8">
        <div className="min-w-0 space-y-6">{sections}</div>
        {/* Not sticky: taller than most screens, and the last card must stay reachable. */}
        <div className="space-y-4">
          {overviewBlock}
          <Card className="space-y-3 p-4">
            <h2 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink-900)]">
              <TriangleAlert className="h-4 w-4 text-[var(--color-warning-500)]" aria-hidden="true" /> Needs attention
            </h2>
            {needsAttention.length === 0 ? <p className="text-sm text-[var(--color-ink-700)]">Every booking has a washer or is finished.</p> : (
              <ul className="space-y-2">
                {needsAttention.map((booking) => (
                  <li key={text(booking.booking_id)} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-[var(--color-ink-900)]">{text(booking.reference)} · {text(booking.service_name)}</span>
                    <span className="shrink-0 text-xs font-semibold text-[var(--color-ink-700)]">{statusName(booking.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {overviewBlock}
      {sections}
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

const tileTone: Readonly<Record<string, string>> = {
  brand: 'bg-[var(--color-brand-50)] text-[var(--color-brand-700)]',
  success: 'bg-[var(--color-success-50)] text-[var(--color-success-600)]',
  warning: 'bg-[var(--color-warning-50)] text-[var(--color-warning-600)]',
  danger: 'bg-[var(--color-danger-50)] text-[var(--color-danger-600)]',
}

/** Free time kept before and after every booking, so the washer can travel and pack up. Same limits as the database. */
function TravelGapForm({ minutes, onSave }: { readonly minutes: number; readonly onSave: (minutes: number) => void }): ReactElement {
  const [value, setValue] = useState(String(minutes))
  const parsed = Number(value)
  const isValid = value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0 && parsed <= 240
  return (
    <div>
      <div className="flex items-end gap-2">
        <Input label="Travel gap (minutes)" inputMode="numeric" value={value} onChange={(event): void => { setValue(event.target.value) }} />
        <Button variant="secondary" disabled={!isValid} onClick={(): void => { onSave(parsed) }}>Save</Button>
      </div>
      <p className={isValid ? 'mt-1.5 text-xs text-[var(--color-ink-500)]' : 'mt-1.5 text-xs text-[var(--color-danger-500)]'}>
        {isValid ? 'Kept free before and after every booking. 0 to 240.' : 'Enter whole minutes from 0 to 240.'}
      </p>
    </div>
  )
}

interface MinutesRule { readonly label: string; readonly min: number; readonly max: number }
// The same limits as services.duration_minutes and service_addons.duration_minutes.
const serviceMinutes: MinutesRule = { label: 'Minutes', min: 10, max: 600 }
const addonMinutes: MinutesRule = { label: 'Extra minutes', min: 0, max: 240 }

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

interface PriceRowProps {
  readonly name: string
  readonly cents: number
  readonly isDraft: boolean
  readonly isActive: boolean
  /** How long it takes. Booking times, and the gap to the next booking, follow it. */
  readonly minutes: number
  readonly minutesRule: MinutesRule
  readonly onSave: (cents: number, isActive: boolean, minutes: number) => void
}

function PriceRow({ name, cents, isDraft, isActive, minutes, minutesRule, onSave }: PriceRowProps): ReactElement {
  const [pesosValue, setPesosValue] = useState(String(cents / 100))
  const [minutesValue, setMinutesValue] = useState(String(minutes))
  const parsedMinutes = Number(minutesValue)
  const isMinutesValid = minutesValue.trim() !== '' && Number.isInteger(parsedMinutes) && parsedMinutes >= minutesRule.min && parsedMinutes <= minutesRule.max
  const save = (nextIsActive: boolean): void => { onSave(Math.round(Number(pesosValue) * 100), nextIsActive, parsedMinutes) }
  return (
    <Card className="flex flex-wrap items-end justify-between gap-3 p-3">
      <div className="min-w-48 flex-1 text-sm font-medium text-[var(--color-ink-900)]">{name} {isDraft ? <Badge tone="warning">Draft price</Badge> : null}{!isActive ? <Badge tone="neutral">Hidden</Badge> : null}</div>
      <div className="flex flex-wrap items-end gap-2">
        <Input label="Price (₱)" inputMode="decimal" value={pesosValue} inputContainerClassName="w-28" onChange={(event): void => { setPesosValue(event.target.value) }} />
        <Input label={minutesRule.label} inputMode="numeric" value={minutesValue} inputContainerClassName="w-24"
          errorText={isMinutesValid ? undefined : `${String(minutesRule.min)} to ${String(minutesRule.max)}`}
          onChange={(event): void => { setMinutesValue(event.target.value) }} />
        <Button size="sm" disabled={!isMinutesValid} onClick={(): void => { save(isActive) }}>{isDraft ? 'Set final price' : 'Save'}</Button>
        {/* Hiding keeps the item and its price; customers just stop seeing it, for example when a product runs out. */}
        <Button size="sm" variant="ghost" disabled={!isMinutesValid} aria-label={`${isActive ? 'Hide' : 'Show'} ${name}`} onClick={(): void => { save(!isActive) }}>{isActive ? 'Hide' : 'Show'}</Button>
      </div>
    </Card>
  )
}

const statusName = (value: unknown): string => {
  const status = asStatus(value)
  return status === null ? (text(value) || 'New') : serviceBookingStatusLabel[status]
}

/** A booking's status history, shown right under its row. */
function BookingCaseHistory({ data, onClose }: { readonly data: Row; readonly onClose: () => void }): ReactElement {
  return (
    <Card elevation="flat" className="ml-3 space-y-2 border-l-4 border-l-[var(--color-ink-300)] p-4 text-sm">
      <h3 className="font-semibold text-[var(--color-ink-900)]">Booking history</h3>
      <p className="text-xs text-[var(--color-ink-500)]">Opening a case is recorded in the audit log.</p>
      <ol className="space-y-1">
        {((data.events ?? []) as readonly Row[]).map((event) => (
          <li key={text(event.id)}>
            <span className="tabular-nums text-[var(--color-ink-500)]">{formatManilaDateTime(text(event.created_at))}</span>: {statusName(event.from_status)} to {statusName(event.to_status)} by {text(event.actor_kind).replaceAll('_', ' ')}{event.reason ? `. ${text(event.reason)}` : ''}
          </li>
        ))}
      </ol>
      <p>Dispatch attempts: {((data.dispatch ?? []) as readonly Row[]).length}</p>
      <Button size="sm" variant="ghost" onClick={onClose}>Close case</Button>
    </Card>
  )
}
