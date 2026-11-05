import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  B2cRequestError,
  OVERDUE_CANCEL_GRACE_MINUTES,
  WORKER_START_WINDOW_MINUTES,
  bookingLimits,
  brandColors,
  canCustomerCancel,
  canCustomerCancelOverdue,
  canWorkerAdvanceNow,
  createB2cApi,
  createBookingSubmissionKey,
  directionsUrl,
  distanceBandLabel,
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
  workerPausedNotice,
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

describe('shared time rules', () => {
  const scheduledAt = '2026-11-10T10:00:00.000Z'
  const at = (iso: string): Date => new Date(iso)

  it('keeps the same defaults as the platform settings', () => {
    expect(WORKER_START_WINDOW_MINUTES).toBe(120)
    expect(OVERDUE_CANCEL_GRACE_MINUTES).toBe(60)
  })

  it('opens the job steps exactly two hours before the scheduled time', () => {
    expect(canWorkerAdvanceNow(scheduledAt, at('2026-11-10T07:59:59.999Z'))).toBe(false)
    expect(canWorkerAdvanceNow(scheduledAt, at('2026-11-10T08:00:00.000Z'))).toBe(true)
    expect(canWorkerAdvanceNow(scheduledAt, at('2026-11-12T10:00:00.000Z'))).toBe(true)
    expect(canWorkerAdvanceNow(scheduledAt, at('2026-11-10T09:29:59.999Z'), 'worker_on_the_way')).toBe(false)
    expect(canWorkerAdvanceNow(scheduledAt, at('2026-11-10T09:30:00.000Z'), 'worker_on_the_way')).toBe(true)
  })

  it('lets a job with a scheduled time of about now advance at once', () => {
    expect(canWorkerAdvanceNow(scheduledAt, at(scheduledAt))).toBe(true)
  })

  it('opens overdue cancel exactly at the scheduled time plus duration plus grace', () => {
    expect(canCustomerCancelOverdue('arrived', scheduledAt, 90, at('2026-11-10T12:29:59.999Z'))).toBe(false)
    expect(canCustomerCancelOverdue('arrived', scheduledAt, 90, at('2026-11-10T12:30:00.000Z'))).toBe(true)
    expect(canCustomerCancelOverdue('in_progress', scheduledAt, 90, at('2026-11-10T12:29:59.999Z'))).toBe(false)
    expect(canCustomerCancelOverdue('in_progress', scheduledAt, 90, at('2026-11-10T12:30:00.000Z'))).toBe(true)
  })

  it('offers overdue cancel only on a started job', () => {
    const muchLater = at('2026-12-01T00:00:00.000Z')
    for (const status of serviceBookingStatuses) {
      expect(canCustomerCancelOverdue(status, scheduledAt, 90, muchLater)).toBe(status === 'arrived' || status === 'in_progress')
    }
  })

  it('leaves the plain customer cancel rule unchanged', () => {
    expect(canCustomerCancel('arrived')).toBe(false)
    expect(canCustomerCancel('in_progress')).toBe(false)
  })
})

describe('shared washer display rules', () => {
  it('shows a stored distance as its band', () => {
    expect(distanceBandLabel(2)).toBe('Within 2 km')
    expect(distanceBandLabel(200)).toBe('Within 200 km')
  })

  it('tells a washer they are paused when suspended or when a job is held, and not a new washer under review', () => {
    expect(workerPausedNotice('suspended', 0)).toContain('paused your account')
    expect(workerPausedNotice('rejected', 1)).toContain('paused your account')
    expect(workerPausedNotice('pending', 1)).toContain('paused your account')
    expect(workerPausedNotice('pending', 0)).toBeNull()
    expect(workerPausedNotice('rejected', 0)).toBeNull()
    expect(workerPausedNotice('verified', 3)).toBeNull()
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

  it.each([
    ['23514', "This booking can't start yet. You can begin up to 2 hours before its scheduled time."],
    ['23514', 'WashLink has paused your account. Contact WashLink about this booking.'],
    ['42501', 'Enter your password again to delete this account.'],
    ['42501', "This account can't be deleted here. Only WashLink can close it."],
    ['55000', 'Finish or decline your open requests before changing your base location.'],
  ])('passes the written refusal with code %s through unchanged: %s', async (code, message) => {
    const api = createB2cApi({
      rpc: () => Promise.resolve({ data: null, error: { message, code } }),
      from: () => { throw new Error('not used') },
    } as unknown as B2cSupabaseClient)
    await expect(api.deleteMyAccount()).rejects.toThrow(message)
  })
})
