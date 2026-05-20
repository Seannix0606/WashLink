import type { ReactElement } from 'react'
import type { Booking } from '../../../domain/models/Booking'
import type { Worker } from '../../../domain/models/Worker'
import { Drawer } from '../../design/ui'
import { BookingDetailDrawerBody } from './BookingDetailDrawerBody'

interface BookingDetailDrawerProps {
  readonly isOpen: boolean
  readonly booking: Booking | null
  readonly workers: readonly Worker[]
  readonly onClose: () => void
  readonly onAcceptBooking: (bookingIdentifier: string) => Promise<void>
  readonly onRejectBooking: (bookingIdentifier: string) => Promise<void>
  readonly onAssignWorkerToBooking: (
    bookingIdentifier: string,
    workerIdentifier: string,
  ) => Promise<void>
}

export function BookingDetailDrawer({
  isOpen,
  booking,
  workers,
  onClose,
  onAcceptBooking,
  onRejectBooking,
  onAssignWorkerToBooking,
}: BookingDetailDrawerProps): ReactElement {
  return (
    <Drawer
      isOpen={isOpen && booking !== null}
      onClose={onClose}
      title={booking ? `Booking · ${booking.customerName}` : 'Booking details'}
      description={booking ? 'Manage this job for your shop.' : undefined}
    >
      {booking ? (
        <BookingDetailDrawerBody
          booking={booking}
          workers={workers}
          onAcceptBooking={onAcceptBooking}
          onRejectBooking={onRejectBooking}
          onAssignWorkerToBooking={onAssignWorkerToBooking}
          onCloseDrawer={onClose}
        />
      ) : null}
    </Drawer>
  )
}
