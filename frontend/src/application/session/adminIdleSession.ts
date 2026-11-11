import { readStoredValue, writeStoredValue } from '../../infrastructure/storage/safeStorage'

/**
 * Admin accounts are signed out after this long without use. Customers and washers stay signed in until they sign
 * out (a signed-out washer would stop receiving booking requests).
 */
export const ADMIN_IDLE_LIMIT_MS = 30 * 60 * 1000
/** A warning with "Stay signed in" appears this long before the sign-out. */
export const ADMIN_IDLE_WARNING_MS = 60 * 1000
/** Shared by every open tab, so using WashLink in one tab keeps the others signed in too. */
export const ADMIN_LAST_ACTIVE_KEY = 'washlink.admin.lastActive'

// Used when the browser blocks storage: the limit then only applies while the page stays open.
let lastActiveInMemory: number | null = null

export function readLastActive(): number | null {
  const stored = Number(readStoredValue(ADMIN_LAST_ACTIVE_KEY))
  return Number.isFinite(stored) && stored > 0 ? stored : lastActiveInMemory
}

export function markActive(now: number = Date.now()): void {
  lastActiveInMemory = now
  writeStoredValue(ADMIN_LAST_ACTIVE_KEY, String(now))
}

/** How long until the sign-out; zero or less means the limit has passed. */
export function msUntilIdleSignOut(lastActive: number, now: number = Date.now()): number {
  return lastActive + ADMIN_IDLE_LIMIT_MS - now
}
