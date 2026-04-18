import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Booking, CreateBookingInput } from '../../domain/models/Booking'
import type { BookingRepository } from '../../domain/repositories/BookingRepository'
import type { WorkerRepository } from '../../domain/repositories/WorkerRepository'

export class BookingService {
  public constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly workerRepository: WorkerRepository,
  ) {}

  public async getBookings(): Promise<Booking[]> {
    return this.bookingRepository.fetchBookings()
  }

  public async createBooking(
    createBookingInput: CreateBookingInput,
    customerIdentifier: string,
  ): Promise<Booking> {
    return this.bookingRepository.createBooking(createBookingInput, customerIdentifier)
  }

  public async acceptBooking(bookingIdentifier: string): Promise<Booking> {
    return this.bookingRepository.updateBookingStatus(bookingIdentifier, 'accepted')
  }

  public async rejectBooking(bookingIdentifier: string): Promise<Booking> {
    return this.bookingRepository.updateBookingStatus(bookingIdentifier, 'rejected')
  }

  public async assignWorkerToBooking(
    bookingIdentifier: string,
    workerIdentifier: string,
  ): Promise<Booking> {
    return this.workerRepository.assignWorkerToBooking(
      bookingIdentifier,
      workerIdentifier,
    )
  }

  public async fetchBookingsByWorker(workerIdentifier: string): Promise<Booking[]> {
    return this.bookingRepository.fetchBookingsByWorker(workerIdentifier)
  }

  public async fetchBookingsByCustomer(
    customerIdentifier: string,
  ): Promise<Booking[]> {
    return this.bookingRepository.fetchBookingsByCustomer(customerIdentifier)
  }

  public async markWorkerJobAsInProgress(
    bookingIdentifier: string,
    workerIdentifier: string,
  ): Promise<Booking> {
    return this.bookingRepository.updateBookingStatusForAssignedWorker(
      bookingIdentifier,
      workerIdentifier,
      'in_progress',
    )
  }

  public async markWorkerJobAsCompleted(
    bookingIdentifier: string,
    workerIdentifier: string,
  ): Promise<Booking> {
    return this.bookingRepository.updateBookingStatusForAssignedWorker(
      bookingIdentifier,
      workerIdentifier,
      'completed',
    )
  }

  public subscribeToBookingRealtimeEvents(handlers: {
    onBookingInserted: (booking: Booking) => void
    onBookingUpdated: (booking: Booking) => void
  }): RealtimeChannel {
    return this.bookingRepository.subscribeToBookingRealtimeEvents(handlers)
  }

  public async removeRealtimeSubscription(
    realtimeChannel: RealtimeChannel,
  ): Promise<void> {
    await this.bookingRepository.unsubscribeFromBookingChannel(realtimeChannel)
  }
}
