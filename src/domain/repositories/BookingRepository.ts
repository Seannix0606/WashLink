import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Booking, BookingStatus, CreateBookingInput } from '../models/Booking'

export interface BookingRepository {
  fetchBookings(): Promise<Booking[]>
  fetchBookingsByWorker(workerIdentifier: string): Promise<Booking[]>
  fetchBookingsByCustomer(customerIdentifier: string): Promise<Booking[]>
  createBooking(
    createBookingInput: CreateBookingInput,
    customerIdentifier: string,
  ): Promise<Booking>
  updateBookingStatus(
    bookingIdentifier: string,
    bookingStatus: BookingStatus,
  ): Promise<Booking>
  updateBookingStatusForAssignedWorker(
    bookingIdentifier: string,
    assignedWorkerIdentifier: string,
    bookingStatus: BookingStatus,
  ): Promise<Booking>
  subscribeToBookingRealtimeEvents(handlers: {
    onBookingInserted: (booking: Booking) => void
    onBookingUpdated: (booking: Booking) => void
  }): RealtimeChannel
  unsubscribeFromBookingChannel(channel: RealtimeChannel): Promise<void>
}
