import { z } from 'zod'
import { platformReviewLimits } from '../../domain/models/CertificationPlatformReview'
import { contractDisputeCategories, contractDisputeLimits, contractDisputeResolutionKinds } from '../../domain/models/ContractDispute'

// Mirrors the W11 CHECKs and RPC rules (w11b, w11c, w11e, w11f) with the database's own messages.
// The database stays the authority and re-checks every value.

export const platformReviewStatementMessage = 'Write a statement of 20 to 1000 characters.'
export const platformReviewReasonMessage = 'Give a reason of 20 to 500 characters.'
export const platformReviewDecisionMessage = 'Choose reinstate or uphold.'
export const disputeStatementMessage = 'Write a statement of 20 to 1000 characters.'
export const disputeCategoryMessage = 'Choose a problem category.'
export const disputeResolutionKindMessage = 'Choose how the problem was closed.'
export const disputeResolutionNoteMessage = 'Write a note of 20 to 1000 characters.'

export const platformReviewStatementSchema = z
  .string()
  .trim()
  .min(platformReviewLimits.statementMinLength, platformReviewStatementMessage)
  .max(platformReviewLimits.statementMaxLength, platformReviewStatementMessage)

export const platformReviewReasonSchema = z
  .string()
  .trim()
  .min(platformReviewLimits.reasonMinLength, platformReviewReasonMessage)
  .max(platformReviewLimits.reasonMaxLength, platformReviewReasonMessage)

export const platformReviewDecisionSchema = z.enum(['reinstate', 'uphold'], { error: platformReviewDecisionMessage })

export const disputeStatementSchema = z
  .string()
  .trim()
  .min(contractDisputeLimits.statementMinLength, disputeStatementMessage)
  .max(contractDisputeLimits.statementMaxLength, disputeStatementMessage)

export const disputeCategorySchema = z.enum(contractDisputeCategories, { error: disputeCategoryMessage })

export const disputeResolutionKindSchema = z.enum(contractDisputeResolutionKinds, { error: disputeResolutionKindMessage })

export const disputeResolutionNoteSchema = z
  .string()
  .trim()
  .min(contractDisputeLimits.noteMinLength, disputeResolutionNoteMessage)
  .max(contractDisputeLimits.noteMaxLength, disputeResolutionNoteMessage)

export class OversightValidationError extends Error {
  public constructor(validationError: z.ZodError) {
    super(validationError.issues.at(0)?.message ?? 'Check the details and try again.')
    this.name = 'OversightValidationError'
  }
}

export function parseOversightInput<Output>(schema: z.ZodType<Output>, candidate: unknown): Output {
  const parseResult = schema.safeParse(candidate)
  if (!parseResult.success) {
    throw new OversightValidationError(parseResult.error)
  }
  return parseResult.data
}
