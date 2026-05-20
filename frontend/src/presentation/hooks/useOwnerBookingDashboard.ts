import type { BookingService } from '../../application/services/BookingService'
import type { WorkerService } from '../../application/services/WorkerService'
import type { Booking } from '../../domain/models/Booking'
import type { Worker } from '../../domain/models/Worker'
import { useNewBookingNotification } from './useNewBookingNotification'
import { useOwnerBookingActions } from './useOwnerBookingActions'
import { useOwnerBookingsRealtime } from './useOwnerBookingsRealtime'
import { useOwnerWorkersRealtime } from './useOwnerWorkersRealtime'

interface UseOwnerBookingDashboardResult {
  bookings: Booking[]
  workers: Worker[]
  isNotificationVisible: boolean
  closeNotificationBanner: () => void
  acceptOwnerBooking: (bookingIdentifier: string) => Promise<void>
  rejectOwnerBooking: (bookingIdentifier: string) => Promise<void>
  assignWorkerToOwnerBooking: (
    bookingIdentifier: string,
    workerIdentifier: string,
  ) => Promise<void>
  replaceLocalWorkerList: (nextWorkerList: Worker[]) => void
}

export function useOwnerBookingDashboard(
  bookingService: BookingService,
  workerService: WorkerService,
  ownerIdentifier: string,
): UseOwnerBookingDashboardResult {
  const {
    isNotificationVisible,
    triggerNewBookingNotification,
    closeNotificationBanner,
  } = useNewBookingNotification()

  const { bookings, replaceBookingInList } = useOwnerBookingsRealtime(
    bookingService,
    { onNewBookingInserted: triggerNewBookingNotification },
  )

  const { workers, replaceLocalWorkerList } = useOwnerWorkersRealtime(
    workerService,
    ownerIdentifier,
  )

  const {
    acceptOwnerBooking,
    rejectOwnerBooking,
    assignWorkerToOwnerBooking,
  } = useOwnerBookingActions(bookingService, {
    onBookingUpdated: replaceBookingInList,
  })

  return {
    bookings,
    workers,
    isNotificationVisible,
    closeNotificationBanner,
    acceptOwnerBooking,
    rejectOwnerBooking,
    assignWorkerToOwnerBooking,
    replaceLocalWorkerList,
  }
}
