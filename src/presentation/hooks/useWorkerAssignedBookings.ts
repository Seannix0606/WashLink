import { useCallback, useEffect, useState } from 'react'
import type { BookingService } from '../../application/services/BookingService'
import type { Booking } from '../../domain/models/Booking'
import { shouldIncludeBookingOnWorkerJobList } from '../workerJobs/workerJobListInclusionPolicy'

interface UseWorkerAssignedBookingsResult {
  assignedBookingList: Booking[]
  hasWorkerConfigurationError: boolean
  mergeAssignedBookingFromServer: (booking: Booking) => void
}

export function useWorkerAssignedBookings(
  bookingService: BookingService,
  workerIdentifier: string,
): UseWorkerAssignedBookingsResult {
  const [assignedBookingList, setAssignedBookingList] = useState<Booking[]>([])

  const hasWorkerConfigurationError = workerIdentifier.length === 0

  const mergeBookingListWithUpdatedBooking = useCallback(
    (previousBookingList: Booking[], updatedBooking: Booking): Booking[] => {
      const updatedBookingIndex = previousBookingList.findIndex(
        (existingBooking) => existingBooking.id === updatedBooking.id,
      )
      if (updatedBookingIndex === -1) {
        return [...previousBookingList, updatedBooking]
      }
      const nextBookingList = [...previousBookingList]
      nextBookingList[updatedBookingIndex] = updatedBooking
      return nextBookingList
    },
    [],
  )

  const applyRealtimeBookingToWorkerList = useCallback(
    (incomingBooking: Booking): void => {
      setAssignedBookingList((previousBookingList) => {
        const shouldKeepOnList = shouldIncludeBookingOnWorkerJobList(
          incomingBooking,
          workerIdentifier,
        )
        if (shouldKeepOnList) {
          return mergeBookingListWithUpdatedBooking(
            previousBookingList,
            incomingBooking,
          )
        }
        const hasMatchingBookingOnList = previousBookingList.some(
          (existingBooking) => existingBooking.id === incomingBooking.id,
        )
        if (hasMatchingBookingOnList) {
          return previousBookingList.filter(
            (existingBooking) => existingBooking.id !== incomingBooking.id,
          )
        }
        return previousBookingList
      })
    },
    [mergeBookingListWithUpdatedBooking, workerIdentifier],
  )

  useEffect(() => {
    if (hasWorkerConfigurationError) {
      return
    }

    let isComponentMounted = true

    const loadAssignedBookingsForWorker = async (): Promise<void> => {
      try {
        const bookingList = await bookingService.fetchBookingsByWorker(workerIdentifier)
        if (isComponentMounted) {
          setAssignedBookingList(bookingList)
        }
      } catch (error) {
        console.error('Unable to load assigned bookings for worker.', error)
      }
    }

    const realtimeChannel = bookingService.subscribeToBookingRealtimeEvents({
      onBookingInserted: (insertedBooking) => {
        applyRealtimeBookingToWorkerList(insertedBooking)
      },
      onBookingUpdated: (updatedBooking) => {
        applyRealtimeBookingToWorkerList(updatedBooking)
      },
    })

    void loadAssignedBookingsForWorker()

    return (): void => {
      isComponentMounted = false
      void bookingService.removeRealtimeSubscription(realtimeChannel)
    }
  }, [
    applyRealtimeBookingToWorkerList,
    bookingService,
    hasWorkerConfigurationError,
    workerIdentifier,
  ])

  const mergeAssignedBookingFromServer = useCallback(
    (booking: Booking): void => {
      applyRealtimeBookingToWorkerList(booking)
    },
    [applyRealtimeBookingToWorkerList],
  )

  return {
    assignedBookingList,
    hasWorkerConfigurationError,
    mergeAssignedBookingFromServer,
  }
}
