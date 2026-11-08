import { describe, expect, it } from 'vitest'
import type { CreateBookingInput } from '../../domain/models/Booking'
import {
  buildBooking,
  createMockBookingRepository,
  createMockWorkerRepository,
  testBookingIdentifier,
  testCustomerIdentifier,
  testShopIdentifier,
} from '../../test/fixtures'
import { BookingService } from './BookingService'

function buildCreateBookingInput(
  overrides: Partial<CreateBookingInput> = {},
): CreateBookingInput {
  return {
    customerName: '  Test Customer  ',
    vehicleType: 'Sedan',
    serviceType: 'Basic Wash',
    address: '1 Test Street',
    time: '2099-01-01T10:00:00+00:00',
    shopIdentifier: testShopIdentifier,
    latitude: 14.5,
    longitude: 121.0,
    customerNotes: null,
    ...overrides,
  }
}

describe('BookingService (J18 booking creation)', () => {
  it('j18_booking_service_creates_validated_booking', async () => {
    const bookingRepository = createMockBookingRepository()
    const createdBooking = buildBooking()
    bookingRepository.createBooking.mockResolvedValue(createdBooking)
    const bookingService = new BookingService(
      bookingRepository,
      createMockWorkerRepository(),
    )

    const result = await bookingService.createBooking(
      buildCreateBookingInput(),
      testCustomerIdentifier,
    )

    expect(result).toBe(createdBooking)
    expect(bookingRepository.createBooking).toHaveBeenCalledTimes(1)
    expect(bookingRepository.createBooking).toHaveBeenCalledWith(
      buildCreateBookingInput({ customerName: 'Test Customer' }),
      testCustomerIdentifier,
    )
  })

  it('j18_booking_service_rejects_past_time_without_calling_repository', async () => {
    const bookingRepository = createMockBookingRepository()
    const bookingService = new BookingService(
      bookingRepository,
      createMockWorkerRepository(),
    )

    await expect(
      bookingService.createBooking(
        buildCreateBookingInput({ time: '2000-01-01T10:00:00+00:00' }),
        testCustomerIdentifier,
      ),
    ).rejects.toThrow('Choose a booking time in the future.')
    expect(bookingRepository.createBooking).not.toHaveBeenCalled()
  })

  it('j18_booking_service_cancel_passes_customer_identifier', async () => {
    const bookingRepository = createMockBookingRepository()
    const cancelledBooking = buildBooking({ bookingStatus: 'cancelled' })
    bookingRepository.cancelPendingBookingForCustomer.mockResolvedValue(
      cancelledBooking,
    )
    const bookingService = new BookingService(
      bookingRepository,
      createMockWorkerRepository(),
    )

    const result = await bookingService.cancelPendingBookingForCustomer(
      testBookingIdentifier,
      testCustomerIdentifier,
    )

    expect(result.bookingStatus).toBe('cancelled')
    expect(
      bookingRepository.cancelPendingBookingForCustomer,
    ).toHaveBeenCalledWith(testBookingIdentifier, testCustomerIdentifier)
  })
})
