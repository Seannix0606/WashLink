import type { SavedAddress } from './b2cTypes'
import { bookingLimits } from './validation'

/** Where a customer usually wants their car washed, chosen when they sign up. Saved as their "Home" address. */
export interface HomeLocation {
  readonly address: string
  readonly latitude: number
  readonly longitude: number
}

/** A location still being filled in: the pin may not be placed yet. */
export interface HomeLocationDraft {
  readonly address: string
  readonly latitude: number | null
  readonly longitude: number | null
}

export const emptyHomeLocationDraft: HomeLocationDraft = { address: '', latitude: null, longitude: null }

export const HOME_ADDRESS_LABEL = 'Home'
const maxAddressLength = 300

const isCoordinate = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit

/** Why this location can't be saved yet, or null. Matches the customer_addresses checks. */
export function homeLocationProblem(draft: HomeLocationDraft): string | null {
  if (draft.latitude === null || draft.longitude === null) {
    return 'Pin where you usually want your car washed.'
  }
  const length = draft.address.trim().length
  if (length < bookingLimits.addressMinLength || length > maxAddressLength) {
    return `Enter the full address (at least ${String(bookingLimits.addressMinLength)} characters).`
  }
  return null
}

/** The draft as a finished location, or null when it isn't complete. */
export function completeHomeLocation(draft: HomeLocationDraft): HomeLocation | null {
  if (homeLocationProblem(draft) !== null || draft.latitude === null || draft.longitude === null) {
    return null
  }
  return { address: draft.address.trim(), latitude: draft.latitude, longitude: draft.longitude }
}

/**
 * Sign-up data keys. With email confirmation on there is no session at sign-up, so the location travels with the account
 * and is saved as the Home address on first sign-in. It is the customer's own data and is checked again by the table.
 */
export function homeLocationToSignUpData(home: HomeLocation): Record<string, string | number> {
  return { home_address: home.address, home_latitude: home.latitude, home_longitude: home.longitude }
}

/** Clears the sign-up copy once it has been saved, so deleting Home later doesn't bring it back. */
export const clearedHomeLocationSignUpData = { home_address: null, home_latitude: null, home_longitude: null } as const

/** Reads the location sent at sign-up, or null when there is none or it is not valid. */
export function homeLocationFromSignUpData(metadata: unknown): HomeLocation | null {
  if (typeof metadata !== 'object' || metadata === null) {
    return null
  }
  const values = metadata as Record<string, unknown>
  const address = typeof values.home_address === 'string' ? values.home_address : ''
  if (!isCoordinate(values.home_latitude, 90) || !isCoordinate(values.home_longitude, 180)) {
    return null
  }
  return completeHomeLocation({ address, latitude: values.home_latitude, longitude: values.home_longitude })
}

/** The customer's Home address among their saved ones (the newest, if there are several). */
export function findHomeAddress(addresses: readonly SavedAddress[]): SavedAddress | null {
  return addresses.find((address) => address.label.trim().toLowerCase() === HOME_ADDRESS_LABEL.toLowerCase()) ?? null
}
