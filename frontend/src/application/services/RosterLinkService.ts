import { z } from 'zod'
import type {
  IssuedRosterLinkCode,
  RosterLinkCodePreview,
  RosterLinkEntry,
  RosterLinkResult,
} from '../../domain/models/RosterLink'
import type { RosterLinkRepository } from '../../domain/repositories/RosterLinkRepository'

const rosterLinkCodePattern = /^[0-9A-F]{12}$/

export const invalidRosterLinkCodeFormatMessage =
  'Enter the 12-character code you received from the shop owner.'

const rosterRowIdentifierSchema = z.uuid()

function requireRosterRowIdentifier(workerRowIdentifier: string): string {
  if (!rosterRowIdentifierSchema.safeParse(workerRowIdentifier).success) {
    throw new Error('This roster entry is not valid. Refresh and try again.')
  }
  return workerRowIdentifier
}

/** Removes spaces and dashes and upper-cases, matching what the database accepts. */
export function normalizeRosterLinkCode(enteredLinkCode: string): string {
  return enteredLinkCode.replace(/[\s-]/g, '').toUpperCase()
}

export class RosterLinkService {
  public constructor(private readonly rosterLinkRepository: RosterLinkRepository) {}

  public async listMyRosterLinks(): Promise<RosterLinkEntry[]> {
    return this.rosterLinkRepository.listMyRosterLinks()
  }

  public async issueRosterLinkCode(
    workerRowIdentifier: string,
  ): Promise<IssuedRosterLinkCode> {
    return this.rosterLinkRepository.createRosterLinkCode(
      requireRosterRowIdentifier(workerRowIdentifier),
    )
  }

  public async previewRosterLinkCode(
    enteredLinkCode: string,
  ): Promise<RosterLinkCodePreview> {
    return this.rosterLinkRepository.previewRosterLinkCode(
      this.requireValidCodeFormat(enteredLinkCode),
    )
  }

  public async acceptRosterLinkCode(enteredLinkCode: string): Promise<RosterLinkResult> {
    return this.rosterLinkRepository.acceptRosterLinkCode(
      this.requireValidCodeFormat(enteredLinkCode),
    )
  }

  public async unlinkMyRosterEntry(workerRowIdentifier: string): Promise<void> {
    await this.rosterLinkRepository.unlinkMyRosterEntry(
      requireRosterRowIdentifier(workerRowIdentifier),
    )
  }

  public isRosterLinkCodeFormatValid(enteredLinkCode: string): boolean {
    return rosterLinkCodePattern.test(normalizeRosterLinkCode(enteredLinkCode))
  }

  private requireValidCodeFormat(enteredLinkCode: string): string {
    const normalizedLinkCode = normalizeRosterLinkCode(enteredLinkCode)
    if (!rosterLinkCodePattern.test(normalizedLinkCode)) {
      throw new Error(invalidRosterLinkCodeFormatMessage)
    }
    return normalizedLinkCode
  }
}
