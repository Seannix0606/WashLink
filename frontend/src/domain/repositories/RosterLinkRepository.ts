import type {
  IssuedRosterLinkCode,
  RosterLinkCodePreview,
  RosterLinkEntry,
  RosterLinkResult,
} from '../models/RosterLink'

/** Consent-based roster linking. Every call is an RPC that derives the caller server-side. */
export interface RosterLinkRepository {
  listMyRosterLinks(): Promise<RosterLinkEntry[]>
  createRosterLinkCode(workerRowIdentifier: string): Promise<IssuedRosterLinkCode>
  previewRosterLinkCode(normalizedLinkCode: string): Promise<RosterLinkCodePreview>
  acceptRosterLinkCode(normalizedLinkCode: string): Promise<RosterLinkResult>
  unlinkMyRosterEntry(workerRowIdentifier: string): Promise<void>
}
