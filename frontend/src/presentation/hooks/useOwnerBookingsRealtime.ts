import { useCallback, useEffect, useState } from 'react'
import type { BookingService } from '../../application/services/BookingService'
import type { Booking } from '../../domain/models/Booking'

interface UseOwnerBookingsRealtimeOptions {
  readonly onNewBookingInserted?: (insertedBooking: Booking) => void
}

interface UseOwnerBookingsRealtimeResult {
  readonly bookings: Booking[]
  readonly replaceBookingInList: (updatedBooking: Booking) => void
}

export function useOwnerBookingsRealtime(
  bookingService: BookingService,
  options?: UseOwnerBookingsRealtimeOptions,
): UseOwnerBookingsRealtimeResult {
  const [bookings, setBookings] = useState<Booking[]>([])
  const onNewBookingInsertedCallback = options?.onNewBookingInserted

  const replaceBookingInList = useCallback(
    (updatedBooking: Booking): void => {
      setBookings((previousBookingList) =>
        mergeBookingListWithUpdatedBooking(previousBookingList, updatedBooking),
      )
    },
    [],
  )

  useEffect(() => {
    let isComponentMounted = true

    const loadBookings = async (): Promise<void> => {
      try {
        const fetchedBookings = await bookingService.getBookings()
        if (isComponentMounted) {
          setBookings(fetchedBookings)
        }
      } catch (loadBookingsError) {
        console.error('Unable to load bookings.', loadBookingsError)
      }
    }

    const realtimeChannel = bookingService.subscribeToBookingRealtimeEvents({
      onBookingInserted: (insertedBooking) => {
        setBookings((previousBookingList) =>
          prependInsertedBookingIfMissing(previousBookingList, insertedBooking),
        )
        onNewBookingInsertedCallback?.(insertedBooking)
      },
      onBookingUpdated: (updatedBooking) => {
        setBookings((previousBookingList) =>
          mergeBookingListWithUpdatedBooking(
            previousBookingList,
            updatedBooking,
          ),
        )
      },
    })

    void loadBookings()

    return (): void => {
      isComponentMounted = false
      void bookingService.removeRealtimeSubscription(realtimeChannel)
    }
  }, [bookingService, onNewBookingInsertedCallback])

  return { bookings, replaceBookingInList }
}

function mergeBookingListWithUpdatedBooking(
  previousBookingList: Booking[],
  updatedBooking: Booking,
): Booking[] {
  const updatedBookingIndex = previousBookingList.findIndex(
    (existingBooking) => existingBooking.id === updatedBooking.id,
  )
  if (updatedBookingIndex === -1) {
    return [...previousBookingList, updatedBooking]
  }
  const nextBookingList = [...previousBookingList]
  nextBookingList[updatedBookingIndex] = updatedBooking
  return nextBookingList
}

function prependInsertedBookingIfMissing(
  previousBookingList: Booking[],
  insertedBooking: Booking,
): Booking[] {
  const hasExistingBookingWithSameIdentifier = previousBookingList.some(
    (existingBooking) => existingBooking.id === insertedBooking.id,
  )
  if (hasExistingBookingWithSameIdentifier) {
    return mergeBookingListWithUpdatedBooking(
      previousBookingList,
      insertedBooking,
    )
  }
  return [insertedBooking, ...previousBookingList]
}
