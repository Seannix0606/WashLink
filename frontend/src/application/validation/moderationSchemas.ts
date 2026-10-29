import { z } from 'zod'
import { adminOversightLimits, relationshipLookupPurposes, shopRereviewDecisions } from '../../domain/models/AdminOversight'
import { jobOpeningModerationLimits, jobOpeningReportCategories, moderationActionKinds } from '../../domain/models/JobOpeningModeration'

// Mirrors the W14 CHECKs and RPC rules (w14b, w14d, w14f, w14g, w14h) with the database's own
// messages. The database stays the authority and re-checks every value.

export const reportCategoryMessage = 'Choose a report reason.'
export const reportStatementMessage = 'Write 20 to 1000 characters.'
export const moderationActionMessage = 'Choose a moderation action.'
export const moderationReasonMessage = 'Choose a reason for this action.'
export const ownerMessageMessage = 'Write a message to the owner of 20 to 500 characters.'
export const adminNoteMessage = 'Write an internal note of 20 to 1000 characters.'
export const changeNoteMessage = 'Write at most 500 characters.'
export const rereviewDecisionMessage = 'Choose confirm approval, request changes or reject.'
export const rereviewNotesMessage = 'Write notes of 20 to 1000 characters.'
export const lookupPurposeMessage = 'Choose a purpose for this lookup.'
export const lookupPersonMessage = 'Choose a person to look up.'
export const lookupNoteMessage = 'Write a note of 20 to 300 characters.'
export const actionFilterMessage = 'Use only lowercase letters, dots and underscores in the action filter.'
export const subjectTypeFilterMessage = 'Use only lowercase letters and underscores in the subject type filter.'
export const rangeOrderMessage = 'The start of the range must be before the end.'
export const idFilterMessage = 'Enter a full id (36 characters) or leave it empty.'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const reportCategorySchema = z.enum(jobOpeningReportCategories, { error: reportCategoryMessage })

export const reportStatementSchema = z
  .string()
  .trim()
  .min(jobOpeningModerationLimits.statementMinLength, reportStatementMessage)
  .max(jobOpeningModerationLimits.statementMaxLength, reportStatementMessage)

export const moderationActionSchema = z.enum(moderationActionKinds, { error: moderationActionMessage })

export const moderationReasonSchema = z.enum(jobOpeningReportCategories, { error: moderationReasonMessage })

export const ownerMessageSchema = z
  .string()
  .trim()
  .min(jobOpeningModerationLimits.ownerMessageMinLength, ownerMessageMessage)
  .max(jobOpeningModerationLimits.ownerMessageMaxLength, ownerMessageMessage)

export const adminNoteSchema = z
  .string()
  .trim()
  .min(jobOpeningModerationLimits.adminNoteMinLength, adminNoteMessage)
  .max(jobOpeningModerationLimits.adminNoteMaxLength, adminNoteMessage)

export const changeNoteSchema = z.string().trim().max(jobOpeningModerationLimits.changeNoteMaxLength, changeNoteMessage)

export const rereviewDecisionSchema = z.enum(shopRereviewDecisions, { error: rereviewDecisionMessage })

export const rereviewNotesSchema = z
  .string()
  .trim()
  .min(adminOversightLimits.rereviewNotesMinLength, rereviewNotesMessage)
  .max(adminOversightLimits.rereviewNotesMaxLength, rereviewNotesMessage)

export const lookupPurposeSchema = z.enum(relationshipLookupPurposes, { error: lookupPurposeMessage })

export const lookupPersonSchema = z.string().trim().regex(uuidPattern, lookupPersonMessage)

export const lookupNoteSchema = z
  .string()
  .trim()
  .min(adminOversightLimits.lookupNoteMinLength, lookupNoteMessage)
  .max(adminOversightLimits.lookupNoteMaxLength, lookupNoteMessage)

/** Empty means "not filtered". */
export const actionPrefixSchema = z
  .string()
  .trim()
  .regex(/^([a-z_.]{1,64})?$/, actionFilterMessage)

/** Up to 40 characters, as `admin_workforce_audit_log` checks (w14h). */
export const subjectTypeSchema = z
  .string()
  .trim()
  .regex(/^([a-z_]{1,40})?$/, subjectTypeFilterMessage)

export const optionalIdSchema = z
  .string()
  .trim()
  .refine((candidate) => candidate.length === 0 || uuidPattern.test(candidate), idFilterMessage)

export class ModerationValidationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'ModerationValidationError'
  }
}

export function parseModerationInput<Output>(schema: z.ZodType<Output>, candidate: unknown): Output {
  const parseResult = schema.safeParse(candidate)
  if (!parseResult.success) {
    throw new ModerationValidationError(parseResult.error.issues.at(0)?.message ?? 'Check the details and try again.')
  }
  return parseResult.data
}

/** The first problem with a value, or undefined (for field error text in forms). */
export function firstModerationIssue(schema: z.ZodType, candidate: unknown): string | undefined {
  const parseResult = schema.safeParse(candidate)
  return parseResult.success ? undefined : parseResult.error.issues.at(0)?.message
}
