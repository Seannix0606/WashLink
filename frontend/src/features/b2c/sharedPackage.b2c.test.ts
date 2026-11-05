import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  B2cRequestError,
  bookingLimits,
  brandColors,
  canCustomerCancel,
  createB2cApi,
  createBookingSubmissionKey,
  directionsUrl,
  formatPesos,
  isActiveServiceBooking,
  nextWorkerStatus,
  serviceBookingStatuses,
  serviceBookingStatusLabel,
  terminalServiceBookingStatuses,
  upcomingManilaDates,
  validateCoordinates,
  validateServiceAddress,
  vehicleCategories,
  vehicleCategoryLabel,
  type B2cSupabaseClient,
} from '@washlink/shared'

describe('shared booking rules', () => {
  it('walks a worker through every job status in order and stops at completed', () => {
    const walked: string[] = []
    let status = nextWorkerStatus('accepted')
    while (status) {
      walked.push(status)
      status = nextWorkerStatus(status)
    }
    expect(walked).toEqual(['worker_on_the_way', 'arrived', 'in_progress', 'completed'])
  })

  it('gives no worker action for a booking the worker does not hold', () => {
    expect(nextWorkerStatus('searching_for_worker')).toBeFalsy()
    expect(nextWorkerStatus('cancelled')).toBeFalsy()
    expect(nextWorkerStatus('completed')).toBeFalsy()
  })

  it('stops customers cancelling once the wash has started', () => {
    expect(canCustomerCancel('searching_for_worker')).toBe(true)
    expect(canCustomerCancel('accepted')).toBe(true)
    expect(canCustomerCancel('in_progress')).toBe(false)
    expect(canCustomerCancel('completed')).toBe(false)
  })

  it('labels every status and vehicle category', () => {
    for (const status of serviceBookingStatuses) {
      expect(serviceBookingStatusLabel[status].length).toBeGreaterThan(0)
    }
    for (const category of vehicleCategories) {
      expect(vehicleCategoryLabel[category].length).toBeGreaterThan(0)
    }
  })

  it('never treats a finished booking as active', () => {
    for (const status of terminalServiceBookingStatuses) {
      expect(isActiveServiceBooking(status)).toBe(false)
    }
  })

  it('formats centavos as pesos', () => {
    expect(formatPesos(45000)).toBe('₱450')
    expect(formatPesos(45050)).toContain('450.50')
  })

  it('rejects unusable addresses and coordinates', () => {
    expect(validateServiceAddress('')).not.toBeNull()
    expect(validateServiceAddress('12 Ayala Avenue, Makati City')).toBeNull()
    expect(validateServiceAddress('x'.repeat(bookingLimits.addressMaxLength + 1))).not.toBeNull()
    expect(validateCoordinates(91, 0)).not.toBeNull()
    expect(validateCoordinates(14.55, 121.02)).toBeNull()
  })

  it('makes a stable submission key from the same seed', () => {
    expect(createBookingSubmissionKey('abc')).toBe(createBookingSubmissionKey('abc'))
  })

  it('lists upcoming Manila dates in order, without duplicates', () => {
    const dates = upcomingManilaDates(14)
    expect(dates).toHaveLength(14)
    expect(new Set(dates).size).toBe(14)
    expect([...dates].sort()).toEqual(dates)
  })

  it('builds a directions link from coordinates only', () => {
    expect(directionsUrl(14.5, 121)).toBe('https://www.google.com/maps/dir/?api=1&destination=14.5,121')
  })

  it('uses the brand teal shared with the web theme', () => {
    expect(readFileSync('src/index.css', 'utf8').toLowerCase()).toContain(`--color-brand-700: ${brandColors.brand700.toLowerCase()}`)
  })
})

describe('shared client errors', () => {
  function clientReturning(message: string): B2cSupabaseClient {
    return {
      rpc: () => Promise.resolve({ data: null, error: { message, code: 'XX000' } }),
      from: () => { throw new Error('not used') },
    } as unknown as B2cSupabaseClient
  }

  it('never shows raw database errors to people', async () => {
    const api = createB2cApi(clientReturning('duplicate key value violates unique constraint "service_bookings_pkey"'))
    const caught = await api.cancelBooking('id').catch((error: unknown) => error)
    expect(caught).toBeInstanceOf(B2cRequestError)
    expect((caught as Error).message).not.toContain('service_bookings_pkey')
  })
})
