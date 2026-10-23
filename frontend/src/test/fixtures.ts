import { vi, type Mock } from 'vitest'
import type { Booking } from '../domain/models/Booking'
import type { RosterLinkEntry } from '../domain/models/RosterLink'
import type { WorkerProfile } from '../domain/models/WorkerProfile'
import type { Shop } from '../domain/models/Shop'
import type { AuthRepository } from '../domain/repositories/AuthRepository'
import type { BookingRepository } from '../domain/repositories/BookingRepository'
import type { RosterLinkRepository } from '../domain/repositories/RosterLinkRepository'
import type { ShopVerificationRepository } from '../domain/repositories/ShopVerificationRepository'
import type { WorkerProfileRepository } from '../domain/repositories/WorkerProfileRepository'
import type { WorkerRepository } from '../domain/repositories/WorkerRepository'

// Synthetic test data only. Identifiers are fixed, valid UUIDs; no real person or shop.
export const testCustomerIdentifier = '11111111-1111-4111-8111-111111111111'
export const testOwnerIdentifier = '22222222-2222-4222-8222-222222222222'
export const testShopIdentifier = '33333333-3333-4333-8333-333333333333'
export const testBookingIdentifier = '44444444-4444-4444-8444-444444444444'
export const testWorkerUserIdentifier = '55555555-5555-4555-8555-555555555555'
export const testWorkerRowIdentifier = '66666666-6666-4666-8666-666666666666'
export const testSecondWorkerRowIdentifier = '77777777-7777-4777-8777-777777777777'

type MockedRepository<RepositoryContract> = {
  [MethodName in keyof RepositoryContract]: RepositoryContract[MethodName] extends (
    ...methodArguments: never[]
  ) => unknown
    ? Mock<RepositoryContract[MethodName]>
    : never
}

export function buildBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: testBookingIdentifier,
    customerName: 'Test Customer',
    vehicleType: 'Sedan',
    serviceType: 'Basic Wash',
    address: '1 Test Street',
    time: '2099-01-01T10:00:00+00:00',
    bookingStatus: 'pending',
    createdAt: '2026-10-24T00:00:00+00:00',
    customerIdentifier: testCustomerIdentifier,
    shopIdentifier: testShopIdentifier,
    latitude: null,
    longitude: null,
    customerNotes: null,
    quotedPrice: null,
    customerRatingStars: null,
    customerRatingComment: null,
    customerRatedAt: null,
    ...overrides,
  }
}

export function buildShop(overrides: Partial<Shop> = {}): Shop {
  return {
    id: testShopIdentifier,
    ownerIdentifier: testOwnerIdentifier,
    name: 'Test Shop',
    address: '2 Test Avenue',
    phoneNumber: null,
    latitude: null,
    longitude: null,
    isActive: true,
    createdAt: '2026-10-24T00:00:00+00:00',
    verificationStatus: 'pending',
    verificationNotes: null,
    verificationSubmittedAt: null,
    verificationReviewedAt: null,
    verificationReviewedBy: null,
    servicePricing: [],
    ...overrides,
  }
}

export function createMockBookingRepository(): MockedRepository<BookingRepository> {
  return {
    fetchBookings: vi.fn(),
    fetchBookingsByWorker: vi.fn(),
    fetchBookingsByCustomer: vi.fn(),
    createBooking: vi.fn(),
    updateBookingStatus: vi.fn(),
    updateBookingStatusForAssignedWorker: vi.fn(),
    cancelPendingBookingForCustomer: vi.fn(),
    submitBookingRatingForCustomer: vi.fn(),
    subscribeToBookingRealtimeEvents: vi.fn(),
    unsubscribeFromBookingChannel: vi.fn(),
  }
}

export function createMockWorkerRepository(): MockedRepository<WorkerRepository> {
  return {
    fetchWorkersByOwner: vi.fn(),
    fetchWorkerByIdentifier: vi.fn(),
    createWorkerForOwner: vi.fn(),
    deleteWorker: vi.fn(),
    updateWorkerAvailability: vi.fn(),
    assignWorkerToBooking: vi.fn(),
    subscribeToWorkerRowUpdatesForOwner: vi.fn(),
    unsubscribeFromWorkerRealtimeChannel: vi.fn(),
  }
}

export function createMockShopVerificationRepository(): MockedRepository<ShopVerificationRepository> {
  return {
    listDocumentsForShop: vi.fn(),
    uploadDocument: vi.fn(),
    deleteDocument: vi.fn(),
    createSignedUrlForDocument: vi.fn(),
    submitShopForVerification: vi.fn(),
    approveShop: vi.fn(),
    rejectShop: vi.fn(),
    requestShopChanges: vi.fn(),
  }
}

export function buildWorkerProfile(overrides: Partial<WorkerProfile> = {}): WorkerProfile {
  return {
    profileIdentifier: testWorkerUserIdentifier,
    headline: 'Test headline',
    experienceSummary: null,
    yearsOfExperience: null,
    skills: [],
    preferredLocations: [],
    availabilityStatus: 'flexible',
    availabilityNotes: null,
    createdAt: '2026-10-24T00:00:00+00:00',
    updatedAt: '2026-10-24T00:00:00+00:00',
    ...overrides,
  }
}

export function buildRosterLinkEntry(
  overrides: Partial<RosterLinkEntry> = {},
): RosterLinkEntry {
  return {
    workerRowIdentifier: testWorkerRowIdentifier,
    rosterDisplayName: 'Test Worker',
    isAvailable: true,
    ownerShopNames: ['Test Shop'],
    ...overrides,
  }
}

export function createMockAuthRepository(): MockedRepository<AuthRepository> {
  return {
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    getCurrentSessionUserWithProfile: vi.fn(),
    changePassword: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    completePasswordRecovery: vi.fn(),
    subscribeToAuthChanges: vi.fn(),
  }
}

export function createMockWorkerProfileRepository(): MockedRepository<WorkerProfileRepository> {
  return {
    fetchOwnWorkerProfile: vi.fn(),
    upsertOwnWorkerProfile: vi.fn(),
    upsertOwnWorkerPrivateContact: vi.fn(),
    deleteOwnWorkerPrivateContact: vi.fn(),
    deleteOwnWorkerProfile: vi.fn(),
  }
}

export function createMockRosterLinkRepository(): MockedRepository<RosterLinkRepository> {
  return {
    listMyRosterLinks: vi.fn(),
    createRosterLinkCode: vi.fn(),
    previewRosterLinkCode: vi.fn(),
    acceptRosterLinkCode: vi.fn(),
    unlinkMyRosterEntry: vi.fn(),
  }
}
