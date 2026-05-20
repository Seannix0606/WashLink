import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Booking, BookingStatus } from '../../../domain/models/Booking'
import type { Shop } from '../../../domain/models/Shop'
import { EmptyState, Tabs, type TabItemDefinition } from '../../design/ui'
import { CustomerBookingCard } from './CustomerBookingCard'

type CustomerBookingsTabKey = 'active' | 'past'

interface CustomerBookingsSectionProps {
  readonly customerBookings: readonly Booking[]
  readonly shopLookupByIdentifier: Readonly<Record<string, Shop>>
  readonly cancellingBookingIdentifier: string | null
  readonly submittingRatingForBookingIdentifier: string | null
  readonly onRebookFromBooking: (booking: Booking) => void
  readonly onRequestCancelBooking: (booking: Booking) => void
  readonly onRequestRateBooking: (booking: Booking) => void
}

const activeBookingStatusSet: ReadonlySet<BookingStatus> = new Set<BookingStatus>(
  ['pending', 'accepted', 'in_progress'],
)

export function CustomerBookingsSection({
  customerBookings,
  shopLookupByIdentifier,
  cancellingBookingIdentifier,
  submittingRatingForBookingIdentifier,
  onRebookFromBooking,
  onRequestCancelBooking,
  onRequestRateBooking,
}: CustomerBookingsSectionProps): ReactElement {
  const [selectedTab, setSelectedTab] = useState<CustomerBookingsTabKey>('active')

  const activeCustomerBookings = useMemo(
    () =>
      customerBookings.filter((customerBooking) =>
        activeBookingStatusSet.has(customerBooking.bookingStatus),
      ),
    [customerBookings],
  )
  const pastCustomerBookings = useMemo(
    () =>
      customerBookings.filter(
        (customerBooking) => !activeBookingStatusSet.has(customerBooking.bookingStatus),
      ),
    [customerBookings],
  )

  const tabItems: TabItemDefinition<CustomerBookingsTabKey>[] = [
    {
      value: 'active',
      label: 'Active',
      badgeContent: activeCustomerBookings.length,
    },
    {
      value: 'past',
      label: 'Past',
      badgeContent: pastCustomerBookings.length,
    },
  ]

  const visibleCustomerBookings =
    selectedTab === 'active' ? activeCustomerBookings : pastCustomerBookings

  return (
    <section className="space-y-4">
      <Tabs
        accessibleLabel="My bookings filter"
        tabItems={tabItems}
        activeTabValue={selectedTab}
        onTabChange={setSelectedTab}
      />

      {visibleCustomerBookings.length === 0 ? (
        <EmptyState
          icon={<Clock3 className="h-5 w-5" />}
          title={
            selectedTab === 'active'
              ? 'No active bookings'
              : 'No past bookings yet'
          }
          description={
            selectedTab === 'active'
              ? 'Your in-flight bookings will show up here once you request a wash.'
              : 'Completed and declined bookings will be kept here for reference.'
          }
        />
      ) : (
        <motion.ul
          className="space-y-3"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.04 } },
          }}
        >
          {visibleCustomerBookings.map((customerBooking) => (
            <motion.li
              key={customerBooking.id}
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <CustomerBookingCard
                booking={customerBooking}
                shopLookupByIdentifier={shopLookupByIdentifier}
                isCancellingBooking={
                  cancellingBookingIdentifier === customerBooking.id
                }
                isSubmittingRatingForThisBooking={
                  submittingRatingForBookingIdentifier === customerBooking.id
                }
                onRebookFromBooking={onRebookFromBooking}
                onRequestCancelBooking={onRequestCancelBooking}
                onRequestRateBooking={onRequestRateBooking}
              />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  )
}
