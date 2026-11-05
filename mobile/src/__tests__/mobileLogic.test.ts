import {
  OVERDUE_CANCEL_GRACE_MINUTES,
  WORKER_START_WINDOW_MINUTES,
  bookingStepProblem,
  canCustomerCancel,
  canCustomerCancelOverdue,
  canWorkerAdvanceNow,
  distanceBandLabel,
  emptyBookingDraft,
  workerPausedNotice,
} from '@washlink/shared'
import * as SecureStore from 'expo-secure-store'
import { secureSessionStorage } from '../lib/secureSessionStorage'
import { routeFromNotification } from '../push/pushNotifications'

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>()
  return {
    AFTER_FIRST_UNLOCK: 'after-first-unlock',
    getItemAsync: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => { store.set(key, value); return Promise.resolve() }),
    deleteItemAsync: jest.fn((key: string) => { store.delete(key); return Promise.resolve() }),
  }
})
jest.mock('../lib/api', () => ({ api: {} }))
jest.mock('expo-notifications', () => ({}))
jest.mock('expo-device', () => ({}))
jest.mock('expo-constants', () => ({ expoConfig: {} }))

describe('session storage', () => {
  it('round-trips a session too large for one secure entry', async () => {
    const session = 'x'.repeat(5000)
    await secureSessionStorage.setItem('session', session)
    await expect(secureSessionStorage.getItem('session')).resolves.toBe(session)
    const calls = (SecureStore.setItemAsync as jest.Mock).mock.calls as [string, string][]
    expect(Math.max(...calls.map(([, value]) => value.length))).toBeLessThanOrEqual(2048)
  })

  it('removes every piece on sign-out', async () => {
    await secureSessionStorage.setItem('session', 'y'.repeat(4000))
    await secureSessionStorage.removeItem('session')
    await expect(secureSessionStorage.getItem('session')).resolves.toBeNull()
    await expect(SecureStore.getItemAsync('session.0')).resolves.toBeNull()
  })

  it('replaces a longer session completely', async () => {
    await secureSessionStorage.setItem('session', 'a'.repeat(5000))
    await secureSessionStorage.setItem('session', 'b')
    await expect(secureSessionStorage.getItem('session')).resolves.toBe('b')
    await expect(SecureStore.getItemAsync('session.2')).resolves.toBeNull()
  })
})

describe('notification routing', () => {
  it('opens only known screens', () => {
    expect(routeFromNotification({ route: '/customer/bookings' })).toBe('/customer/bookings')
    expect(routeFromNotification({ route: 'https://evil.example' })).toBeNull()
    expect(routeFromNotification({ route: '/worker/../admin' })).toBeNull()
    expect(routeFromNotification(null)).toBeNull()
  })
})

describe('booking steps', () => {
  it('requires a time, a pin and address, a service and a vehicle', () => {
    expect(bookingStepProblem(0, emptyBookingDraft)).not.toBeNull()
    expect(bookingStepProblem(0, { ...emptyBookingDraft, isImmediate: true })).toBeNull()
    expect(bookingStepProblem(1, { ...emptyBookingDraft, address: '12 Ayala Avenue, Makati' })).not.toBeNull()
    expect(bookingStepProblem(1, { ...emptyBookingDraft, address: '12 Ayala Avenue, Makati', latitude: 14.5, longitude: 121 })).toBeNull()
    expect(bookingStepProblem(2, emptyBookingDraft)).not.toBeNull()
    expect(bookingStepProblem(3, emptyBookingDraft)).not.toBeNull()
    expect(bookingStepProblem(4, emptyBookingDraft)).toBeNull()
  })
})

describe('time rules', () => {
  const scheduledAt = '2026-11-10T10:00:00.000Z'

  it('uses the same defaults as the platform settings', () => {
    expect(WORKER_START_WINDOW_MINUTES).toBe(120)
    expect(OVERDUE_CANCEL_GRACE_MINUTES).toBe(60)
  })

  it('opens the job steps exactly two hours before the scheduled time', () => {
    expect(canWorkerAdvanceNow(scheduledAt, new Date('2026-11-10T07:59:59.999Z'))).toBe(false)
    expect(canWorkerAdvanceNow(scheduledAt, new Date('2026-11-10T08:00:00.000Z'))).toBe(true)
    expect(canWorkerAdvanceNow(scheduledAt, new Date('2026-11-10T09:30:00.000Z'), 'worker_on_the_way')).toBe(true)
    expect(canWorkerAdvanceNow(scheduledAt, new Date('2026-11-10T09:29:59.999Z'), 'worker_on_the_way')).toBe(false)
  })

  it('opens overdue cancel exactly at the scheduled time plus duration plus grace, on a started job only', () => {
    expect(canCustomerCancelOverdue('arrived', scheduledAt, 90, new Date('2026-11-10T12:29:59.999Z'))).toBe(false)
    expect(canCustomerCancelOverdue('arrived', scheduledAt, 90, new Date('2026-11-10T12:30:00.000Z'))).toBe(true)
    expect(canCustomerCancelOverdue('in_progress', scheduledAt, 90, new Date('2026-11-10T12:30:00.000Z'))).toBe(true)
    expect(canCustomerCancelOverdue('accepted', scheduledAt, 90, new Date('2026-11-10T12:30:00.000Z'))).toBe(false)
    expect(canCustomerCancelOverdue('completed', scheduledAt, 90, new Date('2026-11-10T12:30:00.000Z'))).toBe(false)
  })

  it('leaves the plain customer cancel rule unchanged', () => {
    expect(canCustomerCancel('arrived')).toBe(false)
    expect(canCustomerCancel('accepted')).toBe(true)
  })
})

describe('washer display rules', () => {
  it('shows a stored distance as its band', () => {
    expect(distanceBandLabel(2)).toBe('Within 2 km')
  })

  it('shows the paused notice when suspended or when a job is held, and not to a new washer under review', () => {
    expect(workerPausedNotice('suspended', 0)).toContain('paused your account')
    expect(workerPausedNotice('pending', 1)).toContain('paused your account')
    expect(workerPausedNotice('pending', 0)).toBeNull()
    expect(workerPausedNotice('verified', 2)).toBeNull()
  })
})
