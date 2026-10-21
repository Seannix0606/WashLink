import type { ReactElement } from 'react'
import { ArrowRight, CalendarClock, CarFront, MapPin, Sparkles } from 'lucide-react'
import type { Booking, BookingStatus } from '../../../domain/models/Booking'
import type { Shop } from '../../../domain/models/Shop'
import { Badge, Button, Card, EmptyState } from '../../design/ui'
import { describeBookingStatus } from '../../utilities/bookingStatusDisplay'
import { formatScheduledDateTime } from '../../utilities/datetimeFormatting'
import { formatShopPrice } from '../../utilities/formatShopPrice'

interface CustomerHomeTabProps {
  readonly customerFullName: string
  readonly customerBookings: readonly Booking[]
  readonly isLoadingBookings: boolean
  readonly bookingsLoadErrorMessage: string | null
  readonly availableShops: readonly Shop[]
  readonly isLoadingShops: boolean
  readonly onStartBooking: () => void
  readonly onViewBookings: () => void
}

const activeBookingStatuses: ReadonlySet<BookingStatus> = new Set([
  'pending',
  'accepted',
  'in_progress',
])

export function CustomerHomeTab({
  customerFullName,
  customerBookings,
  isLoadingBookings,
  bookingsLoadErrorMessage,
  availableShops,
  isLoadingShops,
  onStartBooking,
  onViewBookings,
}: CustomerHomeTabProps): ReactElement {
  const customerFirstName = customerFullName.trim().split(/\s+/)[0] ?? 'there'
  const activeBookings = customerBookings.filter((booking) =>
    activeBookingStatuses.has(booking.bookingStatus),
  )
  const featuredBooking = activeBookings.at(0)

  return (
    <div className="space-y-5">
      <Card
        elevation="flat"
        className="relative overflow-hidden border-0 bg-gradient-to-br from-[var(--color-brand-700)] to-[var(--color-brand-900)] p-6 text-white sm:p-8"
      >
        <div className="relative z-10 max-w-xl space-y-4">
          <div>
            <p className="text-sm font-medium text-white/75">
              WashLink · Car wash, made simple
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              Hi {customerFirstName}, ready for a clean ride?
            </h1>
            <p className="mt-2 text-sm text-white/80">
              Choose a nearby car wash, see its rates, and book a time that
              works for you.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            trailingIcon={<ArrowRight className="h-4 w-4" />}
            onClick={onStartBooking}
          >
            Book a car wash
          </Button>
        </div>
        <div
          aria-hidden="true"
          className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl"
        />
        <CarFront
          aria-hidden="true"
          className="absolute bottom-5 right-7 hidden h-24 w-24 text-white/15 sm:block"
        />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card elevation="raised" className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
            <MapPin className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-ink-900)]">
              Nearby car washes
            </h2>
            <p className="mt-1 text-sm text-[var(--color-ink-500)]">
              {isLoadingShops
                ? 'Finding available shops…'
                : `${String(availableShops.length)} approved ${
                    availableShops.length === 1 ? 'shop' : 'shops'
                  } with published rates`}
            </p>
          </div>
        </Card>

        <Card elevation="raised" className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-ink-900)]">
              Your active bookings
            </h2>
            <p className="mt-1 text-sm text-[var(--color-ink-500)]">
              {isLoadingBookings
                ? 'Loading your bookings…'
                : `${String(activeBookings.length)} ${
                    activeBookings.length === 1 ? 'booking' : 'bookings'
                  } in progress`}
            </p>
          </div>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[var(--color-ink-900)]">
            {featuredBooking ? 'Your latest active booking' : 'Get started'}
          </h2>
          {!isLoadingBookings && featuredBooking !== undefined ? (
            <Button type="button" variant="ghost" size="sm" onClick={onViewBookings}>
              All bookings
            </Button>
          ) : null}
        </div>

        {isLoadingBookings ? (
          <Card elevation="flat">
            <p className="text-sm text-[var(--color-ink-500)]">
              Loading your booking status…
            </p>
          </Card>
        ) : bookingsLoadErrorMessage ? (
          <Card
            elevation="flat"
            className="border-[var(--color-danger-500)] bg-[var(--color-danger-50)]"
          >
            <p className="text-sm font-semibold text-[var(--color-danger-600)]">
              Couldn&apos;t load your bookings
            </p>
            <p className="mt-1 text-sm text-[var(--color-ink-700)]">
              {bookingsLoadErrorMessage}
            </p>
          </Card>
        ) : featuredBooking !== undefined ? (
          <Card elevation="raised" className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[var(--color-ink-900)]">
                  {featuredBooking.serviceType} · {featuredBooking.vehicleType}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--color-ink-500)]">
                  <CalendarClock className="h-4 w-4" />
                  {formatScheduledDateTime(featuredBooking.time)}
                </p>
              </div>
              <Badge
                tone={
                  describeBookingStatus(featuredBooking.bookingStatus).badgeTone
                }
              >
                {
                  describeBookingStatus(featuredBooking.bookingStatus)
                    .displayLabel
                }
              </Badge>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--color-ink-200)] pt-3">
              <span className="text-sm text-[var(--color-ink-500)]">
                Quoted price
              </span>
              <span className="text-sm font-semibold text-[var(--color-ink-900)]">
                {formatShopPrice(featuredBooking.quotedPrice)}
              </span>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onViewBookings}
            >
              View booking status
            </Button>
          </Card>
        ) : (
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title="Your next clean ride starts here"
            description="Browse available shops, compare their prices, and book a car wash."
            primaryAction={
              <Button
                type="button"
                trailingIcon={<ArrowRight className="h-4 w-4" />}
                onClick={onStartBooking}
              >
                Find a car wash
              </Button>
            }
          />
        )}
      </section>
    </div>
  )
}
