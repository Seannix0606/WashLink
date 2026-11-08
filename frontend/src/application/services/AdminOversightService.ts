import {
  adminAuditLogPageSize,
  type AdminAccessFlag,
  type AdminAuditLogFilters,
  type AdminAuditLogPage,
  type AdminModerationSummary,
  type RelationshipLookupKind,
  type RelationshipLookupResult,
  type ShopRereviewRecord,
  type UnreviewedApprovedShop,
} from '../../domain/models/AdminOversight'
import type { AdminOversightRepository } from '../../domain/repositories/AdminOversightRepository'
import {
  actionPrefixSchema,
  lookupNoteSchema,
  lookupPersonSchema,
  lookupPurposeSchema,
  optionalIdSchema,
  parseModerationInput,
  rangeOrderMessage,
  rereviewDecisionSchema,
  rereviewNotesSchema,
  subjectTypeSchema,
  ModerationValidationError,
} from '../validation/moderationSchemas'

/** The audit log filters as typed in the form (empty text = not filtered; dates from datetime-local inputs). */
export interface AdminAuditLogFilterInput {
  readonly actionPrefix: string
  readonly subjectType: string
  readonly subjectId: string
  readonly profileId: string
  readonly actorId: string
  readonly from: string
  readonly to: string
}

export const emptyAdminAuditLogFilterInput: AdminAuditLogFilterInput = {
  actionPrefix: '',
  subjectType: '',
  subjectId: '',
  profileId: '',
  actorId: '',
  from: '',
  to: '',
}

export const invalidDateMessage = 'Enter a valid date and time or leave it empty.'

function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value
}

function toInstant(localValue: string): string | null {
  const trimmedValue = localValue.trim()
  if (trimmedValue.length === 0) {
    return null
  }
  const parsedTime = Date.parse(trimmedValue)
  if (Number.isNaN(parsedTime)) {
    throw new ModerationValidationError(invalidDateMessage)
  }
  return new Date(parsedTime).toISOString()
}

/**
 * W14 super_admin oversight (D-54..D-56). Every read of personal data (lookups, log searches) is
 * recorded by the database; the UI never treats a hidden control as authorization.
 */
export class AdminOversightService {
  public constructor(private readonly adminOversightRepository: AdminOversightRepository) {}

  public async loadModerationSummary(): Promise<AdminModerationSummary | null> {
    return this.adminOversightRepository.fetchModerationSummary()
  }

  public async listUnreviewedApprovedShops(): Promise<UnreviewedApprovedShop[]> {
    return this.adminOversightRepository.listUnreviewedApprovedShops()
  }

  /** Confirm stamps the review without changing the status; request changes / reject need notes. */
  public async rereviewShop(shopId: string, decision: string, notes: string): Promise<ShopRereviewRecord> {
    const validDecision = parseModerationInput(rereviewDecisionSchema, decision)
    const validNotes = validDecision === 'confirm_approval' ? null : parseModerationInput(rereviewNotesSchema, notes)
    return this.adminOversightRepository.rereviewShop(shopId, validDecision, validNotes)
  }

  public async lookupRelationships(kind: RelationshipLookupKind, profileId: string, purpose: string, note: string): Promise<RelationshipLookupResult> {
    return this.adminOversightRepository.lookupRelationships({
      kind,
      profileId: parseModerationInput(lookupPersonSchema, profileId),
      purpose: parseModerationInput(lookupPurposeSchema, purpose),
      note: parseModerationInput(lookupNoteSchema, note),
    })
  }

  /** Validates the typed filters into the RPC filters (the database checks them again). */
  public toAuditLogFilters(filterInput: AdminAuditLogFilterInput): AdminAuditLogFilters {
    const from = toInstant(filterInput.from)
    const to = toInstant(filterInput.to)
    if (from !== null && to !== null && Date.parse(from) > Date.parse(to)) {
      throw new ModerationValidationError(rangeOrderMessage)
    }
    return {
      actionPrefix: emptyToNull(parseModerationInput(actionPrefixSchema, filterInput.actionPrefix)),
      subjectType: emptyToNull(parseModerationInput(subjectTypeSchema, filterInput.subjectType)),
      subjectId: emptyToNull(parseModerationInput(optionalIdSchema, filterInput.subjectId)),
      profileId: emptyToNull(parseModerationInput(optionalIdSchema, filterInput.profileId)),
      actorId: emptyToNull(parseModerationInput(optionalIdSchema, filterInput.actorId)),
      from,
      to,
    }
  }

  /** One audited search; `beforeEventId` pages to older events. */
  public async searchAuditLog(filters: AdminAuditLogFilters, beforeEventId: number | null): Promise<AdminAuditLogPage> {
    const events = await this.adminOversightRepository.searchAuditLog(filters, beforeEventId, adminAuditLogPageSize)
    return { events, hasMore: events.length === adminAuditLogPageSize }
  }

  public async listAccessFlags(): Promise<AdminAccessFlag[]> {
    return this.adminOversightRepository.listAccessFlags()
  }
}
