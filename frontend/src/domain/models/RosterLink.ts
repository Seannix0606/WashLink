/**
 * A shop roster row the signed-in worker account is linked to.
 * A roster link only lets that shop assign bookings; it is not a contract,
 * employment record or worker-owner relationship.
 */
export interface RosterLinkEntry {
  readonly workerRowIdentifier: string
  readonly rosterDisplayName: string
  readonly isAvailable: boolean
  readonly ownerShopNames: readonly string[]
}

export type RosterLinkPreviewResult =
  | 'valid'
  | 'invalid_or_expired'
  | 'rate_limited'
  | 'already_linked_to_owner'

export interface RosterLinkCodePreview {
  readonly result: RosterLinkPreviewResult
  /** Only present when result is 'valid'. */
  readonly rosterDisplayName: string | null
  readonly ownerShopNames: readonly string[]
}

export type RosterLinkResult =
  | 'linked'
  | 'invalid_or_expired'
  | 'rate_limited'
  | 'already_linked_to_owner'

export interface IssuedRosterLinkCode {
  readonly linkCode: string
  readonly expiresAt: string
}
