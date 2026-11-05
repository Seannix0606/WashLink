import { createHash, timingSafeEqual } from 'node:crypto'

const digest = (value: string): Uint8Array => createHash('sha256').update(value).digest()

/** Compares fixed-length digests in constant time, so neither the content nor the length of the secret leaks. Empty never matches. */
export function secretsMatch(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) {
    return false
  }
  return timingSafeEqual(digest(provided), digest(expected))
}
