import type { ReactElement } from 'react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { CarFront } from 'lucide-react'
import { isActiveServiceBooking, type CustomerBooking } from '@washlink/shared'
import { AuthenticatedTopBar } from '../../../presentation/components/AuthenticatedTopBar'
import { Button, EmptyState, Skeleton, Tabs } from '../../../presentation/design/ui'
import { getSupabaseClient } from '../../../infrastructure/supabase/supabaseClient'
import { errorMessage, getB2cApi } from '../b2cApiClient'
import { DeleteAccountSection } from '../DeleteAccountSection'
import { BookingCard } from './BookingCard'
import { SavedDetailsPanel } from './SavedDetailsPanel'

const BookingWizard = lazy(async () => ({ default: (await import('./wizard/BookingWizard')).BookingWizard }))

type CustomerTab = 'home' | 'bookings' | 'saved' | 'account'
const tabItems = [
  { value: 'home' as const, label: 'Home' },
  { value: 'bookings' as const, label: 'Bookings' },
  { value: 'saved' as const, label: 'Addresses and vehicles' },
  { value: 'account' as const, label: 'Account' },
]

interface CustomerHomePageProps {
  readonly customerId: string
}

export function CustomerHomePage({ customerId }: CustomerHomePageProps): ReactElement {
  const [tab, setTab] = useState<CustomerTab>('home')
  const [isBooking, setIsBooking] = useState(false)
  const [bookings, setBookings] = useState<readonly CustomerBooking[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

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
      <Suspense fallback={<Skeleton heightClassName="h-40" />}>
        <BookingWizard
          customerId={customerId}
          onClose={(): void => {
            setIsBooking(false)
            void refresh()
          }}
        />
      </Suspense>
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
      <ul className="space-y-3">
        {items.map((booking) => (
          <li key={booking.id}>
            <BookingCard booking={booking} onChanged={refresh} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--color-surface-muted)]">
      <AuthenticatedTopBar />
      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-12 pt-2 sm:px-6">
        <Tabs accessibleLabel="Your WashLink" tabItems={tabItems} activeTabValue={tab} onTabChange={setTab} />
        {loadError !== null ? (
          <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--color-danger-50)] p-3 text-sm text-[var(--color-danger-600)]">
            {loadError}
          </p>
        ) : null}
        {tab === 'home' ? (
          <>
            <section className="rounded-[var(--radius-surface)] bg-[var(--color-primary-strong)] p-6 text-white">
              <h1 className="text-2xl font-bold">Book a car wash</h1>
              <p className="mt-1 text-sm text-[var(--color-on-primary-soft)]">A washer comes to your home, office, condo or parking spot.</p>
              <Button
                className="mt-4"
                variant="secondary"
                leadingIcon={<CarFront className="h-5 w-5" aria-hidden="true" />}
                onClick={(): void => {
                  setIsBooking(true)
                }}
              >
                Book a car wash
              </Button>
            </section>
            <section aria-labelledby="active-title" className="space-y-3">
              <h2 id="active-title" className="text-lg font-semibold text-[var(--color-ink-900)]">Current bookings</h2>
              {list(active, 'No current bookings')}
            </section>
          </>
        ) : null}
        {tab === 'bookings' ? list(bookings ?? [], 'No bookings yet') : null}
        {tab === 'saved' ? <SavedDetailsPanel customerId={customerId} /> : null}
        {tab === 'account' ? <DeleteAccountSection /> : null}
      </main>
    </div>
  )
}
