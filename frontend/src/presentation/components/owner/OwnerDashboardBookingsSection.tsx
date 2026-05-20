import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  bookingMatchesOwnerDashboardFilterTab,
  type OwnerDashboardBookingFilterTab,
} from '../../../domain/ownerDashboard/OwnerDashboardBookingFilterTab'
import type { Booking } from '../../../domain/models/Booking'
import type { Worker } from '../../../domain/models/Worker'
import { EmptyState } from '../../design/ui'
import { OwnerBookingFilterPillTabs } from './OwnerBookingFilterPillTabs'
import { OwnerBookingRow } from './OwnerBookingRow'

interface OwnerDashboardBookingsSectionProps {
  readonly bookings: readonly Booking[]
  readonly workers: readonly Worker[]
  readonly searchQuery: string
  readonly selectedFilterTab: OwnerDashboardBookingFilterTab
  readonly onFilterTabSelected: (
    nextFilterTab: OwnerDashboardBookingFilterTab,
  ) => void
  readonly onSelectBooking: (bookingIdentifier: string) => void
}

export function OwnerDashboardBookingsSection({
  bookings,
  workers,
  searchQuery,
  selectedFilterTab,
  onFilterTabSelected,
  onSelectBooking,
}: OwnerDashboardBookingsSectionProps): ReactElement {
  const filteredBookings = useMemo(
    () => filterBookingsForOwnerDashboard(bookings, searchQuery, selectedFilterTab),
    [bookings, searchQuery, selectedFilterTab],
  )

  return (
    <section className="space-y-4">
      <OwnerBookingFilterPillTabs
        bookings={bookings}
        selectedFilterTab={selectedFilterTab}
        onFilterTabSelected={(nextFilterTab) =>
          onFilterTabSelected(nextFilterTab as OwnerDashboardBookingFilterTab)
        }
      />

      {filteredBookings.length === 0 ? (
        <EmptyState
          title={
            searchQuery.trim().length > 0
              ? 'No bookings match your search'
              : 'No bookings in this view'
          }
          description={
            searchQuery.trim().length > 0
              ? 'Try a different customer, service, or address.'
              : 'New bookings from customers will appear here instantly.'
          }
        />
      ) : (
        <motion.ul
          className="space-y-2"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.03 } },
          }}
        >
          {filteredBookings.map((booking) => (
            <motion.li
              key={booking.id}
              variants={{
                hidden: { opacity: 0, y: 6 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <OwnerBookingRow
                booking={booking}
                workers={workers}
                onSelectBooking={onSelectBooking}
              />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  )
}

function filterBookingsForOwnerDashboard(
  bookings: readonly Booking[],
  searchQuery: string,
  selectedFilterTab: OwnerDashboardBookingFilterTab,
): readonly Booking[] {
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  return bookings.filter((booking) => {
    const matchesFilterTab = bookingMatchesOwnerDashboardFilterTab(
      booking,
      selectedFilterTab,
    )
    if (!matchesFilterTab) {
      return false
    }
    if (normalizedSearchQuery.length === 0) {
      return true
    }
    const bookingSearchHaystack = [
      booking.customerName,
      booking.serviceType,
      booking.vehicleType,
      booking.address,
    ]
      .join(' ')
      .toLowerCase()
    return bookingSearchHaystack.includes(normalizedSearchQuery)
  })
}
