import type { ReactElement } from 'react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { CalendarCheck, CarFront, House, MapPin, MessageCircle, Sparkles, UserRound } from 'lucide-react'
import { formatManilaTime, isActiveServiceBooking, manilaDayKey, serviceBookingStatusGroup, type CustomerBooking, type ServiceBookingStatusGroup } from '@washlink/shared'
import { AuthenticatedTopBar } from '../../../presentation/components/AuthenticatedTopBar'
import { MonthCalendar } from '../../../presentation/components/calendar/MonthCalendar'
import { ViewToggle, useStoredBookingsView } from '../../../presentation/components/calendar/ViewToggle'
import { AppShell, Button, EmptyState, Section, Skeleton, Tabs } from '../../../presentation/design/ui'
import { getSupabaseClient } from '../../../infrastructure/supabase/supabaseClient'
import { errorMessage, getB2cApi } from '../b2cApiClient'
import { DeleteAccountSection } from '../DeleteAccountSection'
import { greeting } from '../greeting'
import { useCurrentTime } from '../useCurrentTime'
import { BookingCard } from './BookingCard'
import { CustomerSummary } from './CustomerSummary'
import { MessagesPanel } from '../messages/MessagesPanel'
import { useBookingChats } from '../messages/useBookingChats'
import { SavedDetailsPanel } from './SavedDetailsPanel'

const BookingWizard = lazy(async () => ({ default: (await import('./wizard/BookingWizard')).BookingWizard }))

type CustomerTab = 'home' | 'bookings' | 'messages' | 'saved' | 'account'
const tabItems = [
  { value: 'home' as const, label: 'Home', icon: <House className="h-4 w-4" /> },
  { value: 'bookings' as const, label: 'Bookings', icon: <CalendarCheck className="h-4 w-4" /> },
  { value: 'messages' as const, label: 'Messages', icon: <MessageCircle className="h-4 w-4" /> },
  { value: 'saved' as const, label: 'Addresses and vehicles', icon: <MapPin className="h-4 w-4" /> },
  { value: 'account' as const, label: 'Account', icon: <UserRound className="h-4 w-4" /> },
]

interface CustomerHomePageProps {
  readonly customerId: string
  /** The customer's full name, for the greeting on the page band. */
  readonly customerName?: string
}

interface BookingGroup {
  readonly title: string
  readonly description: string
  readonly items: readonly CustomerBooking[]
}

const byTimeAscending = (first: CustomerBooking, second: CustomerBooking): number => Date.parse(first.scheduledAt) - Date.parse(second.scheduledAt)

/** Bookings split by what they need from the customer, so each kind reads as its own block. Empty groups are left out. */
function bookingGroups(bookings: readonly CustomerBooking[]): readonly BookingGroup[] {
  const inGroup = (groups: readonly ServiceBookingStatusGroup[]): CustomerBooking[] =>
    bookings.filter((booking) => groups.includes(serviceBookingStatusGroup[booking.status]))
  return [
    { title: 'Needs action', description: 'No washer accepted these in time.', items: inGroup(['action']).sort(byTimeAscending) },
    { title: 'In progress', description: 'Your washer is on the way or washing.', items: inGroup(['moving', 'washing']).sort(byTimeAscending) },
    { title: 'Upcoming', description: 'Booked and waiting for the day.', items: inGroup(['waiting', 'confirmed']).sort(byTimeAscending) },
    { title: 'Past', description: 'Completed, cancelled and expired.', items: inGroup(['done', 'stopped']).sort((first, second) => byTimeAscending(second, first)) },
  ].filter((group) => group.items.length > 0)
}

export function CustomerHomePage({ customerId, customerName }: CustomerHomePageProps): ReactElement {
  const [tab, setTab] = useState<CustomerTab>('home')
  const chats = useBookingChats(customerId)
  const [chatBookingId, setChatBookingId] = useState<string | null>(null)
  const openChat = (bookingId: string): void => {
    setChatBookingId(bookingId)
    setTab('messages')
  }
  const [isBooking, setIsBooking] = useState(false)
  const [bookings, setBookings] = useState<readonly CustomerBooking[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useStoredBookingsView('washlink.view.customerBookings')
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)
  const todayKey = manilaDayKey(useCurrentTime(60000).toISOString())

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setBookings(await getB2cApi().myBookings())
      setLoadError(null)
    } catch (error) {
      setLoadError(errorMessage(error))
    }
  }, [])

  // Realtime keeps the status live; the slower poll covers a dropped connection.
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0)
    const poll = window.setInterval(() => void refresh(), 30000)
    const client = getSupabaseClient()
    const channel = client
      .channel(`customer-bookings-${customerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_bookings', filter: `customer_id=eq.${customerId}` },
        () => void refresh())
      .subscribe()
    return (): void => {
      window.clearTimeout(initial)
      window.clearInterval(poll)
      void client.removeChannel(channel)
    }
  }, [customerId, refresh])

  if (isBooking) {
    return (
      <AppShell topBar={<AuthenticatedTopBar />}>
      <Suspense fallback={<Skeleton heightClassName="h-40" />}>
        <BookingWizard
          customerId={customerId}
          onClose={(): void => {
            setIsBooking(false)
            void refresh()
          }}
        />
      </Suspense>
      </AppShell>
    )
  }

  const active = (bookings ?? []).filter((booking) => isActiveServiceBooking(booking.status) || booking.status === 'no_worker_available')
  const list = (items: readonly CustomerBooking[], emptyTitle: string): ReactElement => {
    if (bookings === null && loadError === null) {
      return <Skeleton heightClassName="h-32" />
    }
    if (items.length === 0) {
      return <EmptyState title={emptyTitle} description="Book a wash and it will appear here." />
    }
    return (
      <ul className="grid items-start gap-3 xl:grid-cols-2">
        {items.map((booking) => (
          <li key={booking.id}>
            <BookingCard booking={booking} onChanged={refresh} onMessage={openChat} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <AppShell topBar={<AuthenticatedTopBar />} mainClassName="space-y-5"
      title={greeting(customerName)} subtitle="Book a wash and follow it from your phone, step by step."
      navigation={<Tabs variant="navigation" accessibleLabel="Your WashLink" activeTabValue={tab} onTabChange={setTab}
        tabItems={tabItems.map((item) => (item.value === 'messages' && chats.unreadTotal > 0 ? { ...item, badgeContent: chats.unreadTotal } : item))} />}
      summary={tab === 'messages' ? undefined : <CustomerSummary bookings={bookings} onBook={(): void => { setIsBooking(true) }} />}>
        {loadError !== null ? (
          <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--color-danger-50)] p-3 text-sm text-[var(--color-danger-600)]">
            {loadError}
          </p>
        ) : null}
        {tab === 'home' ? (
          <>
            <section className="relative overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-primary-strong)] bg-[linear-gradient(135deg,var(--color-primary-strong),var(--color-primary)_55%,var(--color-primary-soft))] p-6 text-white shadow-[var(--shadow-card-hover)] sm:p-8">
              {/* Decorative light pools: amber shine top right, a soft teal glow bottom left. */}
              <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[var(--color-accent)] opacity-25 blur-3xl" />
              <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-[var(--color-brand-300)] opacity-20 blur-3xl" />
              <div className="relative">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-[var(--color-on-primary-soft)]">
                <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" /> We come to you
              </p>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">Book a car wash</h2>
              <p className="mt-1 max-w-md text-sm text-[var(--color-on-primary-soft)]">A washer comes to your home, office, condo or parking spot.</p>
              <Button
                className="mt-5"
                variant="accent"
                size="lg"
                leadingIcon={<CarFront className="h-5 w-5" aria-hidden="true" />}
                onClick={(): void => {
                  setIsBooking(true)
                }}
              >
                Book a car wash
              </Button>
              </div>
            </section>
            <Section title="Current bookings" count={bookings === null ? undefined : active.length}>
              {list(active, 'No current bookings')}
            </Section>
          </>
        ) : null}
        {tab === 'bookings' ? (
          <div className="space-y-4">
            <div className="flex justify-end"><ViewToggle view={view} onChange={setView} /></div>
            {bookings === null || bookings.length === 0 ? list(bookings ?? [], 'No bookings yet') : view === 'calendar' ? (
              <MonthCalendar label="Your bookings by day" todayKey={todayKey} selectedDayKey={selectedDayKey ?? todayKey} onSelectDay={setSelectedDayKey}
                entries={bookings.map((booking) => ({
                  id: booking.id, dayKey: manilaDayKey(booking.scheduledAt), status: booking.status, title: booking.serviceName,
                  timeLabel: booking.isImmediate ? 'ASAP' : formatManilaTime(booking.scheduledAt),
                }))}>
                {list(bookings.filter((booking) => manilaDayKey(booking.scheduledAt) === (selectedDayKey ?? todayKey)).sort(byTimeAscending), 'No bookings on this day')}
              </MonthCalendar>
            ) : (
              <div className="space-y-5">
                {bookingGroups(bookings).map((group) => (
                  <Section key={group.title} title={group.title} count={group.items.length} description={group.description}>
                    {list(group.items, '')}
                  </Section>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {tab === 'messages' ? (
          <MessagesPanel chats={chats} profileId={customerId} selectedBookingId={chatBookingId} onSelect={setChatBookingId}
            onViewBooking={(): void => { setTab('bookings') }} />
        ) : null}
        {tab === 'saved' ? <SavedDetailsPanel customerId={customerId} /> : null}
        {tab === 'account' ? <DeleteAccountSection /> : null}
    </AppShell>
  )
}
