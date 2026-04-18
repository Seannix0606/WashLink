import { useEffect, useState } from 'react'
import type { BookingService } from '../../application/services/BookingService'
import type { Booking } from '../../domain/models/Booking'

interface UseCustomerBookingsRealtimeResult {
  readonly customerBookings: readonly Booking[]
  readonly isLoadingCustomerBookings: boolean
  readonly customerBookingsLoadErrorMessage: string | null
}

export function useCustomerBookingsRealtime(
  bookingService: BookingService,
  customerIdentifier: string,
): UseCustomerBookingsRealtimeResult {
  const [customerBookings, setCustomerBookings] = useState<Booking[]>([])
  const [isLoadingCustomerBookings, setIsLoadingCustomerBookings] =
    useState<boolean>(true)
  const [customerBookingsLoadErrorMessage, setCustomerBookingsLoadErrorMessage] =
    useState<string | null>(null)

  useEffect(() => {
    let isComponentMounted = true

    const loadCustomerBookings = async (): Promise<void> => {
      setIsLoadingCustomerBookings(true)
      setCustomerBookingsLoadErrorMessage(null)
      try {
        const fetchedCustomerBookings =
          await bookingService.fetchBookingsByCustomer(customerIdentifier)
        if (isComponentMounted) {
          setCustomerBookings(fetchedCustomerBookings)
        }
      } catch (fetchCustomerBookingsError) {
        if (isComponentMounted) {
          const fallbackErrorMessage = 'Unable to load your bookings right now.'
          const resolvedErrorMessage =
            fetchCustomerBookingsError instanceof Error
              ? fetchCustomerBookingsError.message
              : fallbackErrorMessage
          setCustomerBookingsLoadErrorMessage(resolvedErrorMessage)
        }
      } finally {
        if (isComponentMounted) {
          setIsLoadingCustomerBookings(false)
        }
      }
    }

    const realtimeChannel = bookingService.subscribeToBookingRealtimeEvents({
      onBookingInserted: (insertedBooking) => {
        if (!isComponentMounted) {
          return
        }
        setCustomerBookings((previousCustomerBookingList) =>
          prependInsertedBookingIfOwnedByCustomer(
            previousCustomerBookingList,
            insertedBooking,
            customerIdentifier,
          ),
        )
      },
      onBookingUpdated: (updatedBooking) => {
        if (!isComponentMounted) {
          return
        }
        setCustomerBookings((previousCustomerBookingList) =>
          mergeUpdatedBookingIfOwnedByCustomer(
            previousCustomerBookingList,
            updatedBooking,
            customerIdentifier,
          ),
        )
      },
    })

    void loadCustomerBookings()

    return (): void => {
      isComponentMounted = false
      void bookingService.removeRealtimeSubscription(realtimeChannel)
    }
  }, [bookingService, customerIdentifier])

  return {
    customerBookings,
    isLoadingCustomerBookings,
    customerBookingsLoadErrorMessage,
  }
}

function doesBookingBelongToCustomer(
  booking: Booking,
  customerIdentifier: string,
): boolean {
  if (booking.customerIdentifier === null) {
    return false
  }
  return booking.customerIdentifier === customerIdentifier
}

function prependInsertedBookingIfOwnedByCustomer(
  previousCustomerBookingList: Booking[],
  insertedBooking: Booking,
  customerIdentifier: string,
): Booking[] {
  if (!doesBookingBelongToCustomer(insertedBooking, customerIdentifier)) {
    return previousCustomerBookingList
  }
  const hasExistingBookingWithSameIdentifier =
    previousCustomerBookingList.some(
      (existingBooking) => existingBooking.id === insertedBooking.id,
    )
  if (hasExistingBookingWithSameIdentifier) {
    return mergeUpdatedBookingIfOwnedByCustomer(
      previousCustomerBookingList,
      insertedBooking,
      customerIdentifier,
    )
  }
  return [insertedBooking, ...previousCustomerBookingList]
}

function mergeUpdatedBookingIfOwnedByCustomer(
  previousCustomerBookingList: Booking[],
  updatedBooking: Booking,
  customerIdentifier: string,
): Booking[] {
  if (!doesBookingBelongToCustomer(updatedBooking, customerIdentifier)) {
    return previousCustomerBookingList
  }
  const updatedBookingIndex = previousCustomerBookingList.findIndex(
    (existingBooking) => existingBooking.id === updatedBooking.id,
  )
  if (updatedBookingIndex === -1) {
    return [updatedBooking, ...previousCustomerBookingList]
  }
  const nextCustomerBookingList = [...previousCustomerBookingList]
  nextCustomerBookingList[updatedBookingIndex] = updatedBooking
  return nextCustomerBookingList
}
