import { z } from 'zod'
import { contractTemplateLimits as limits } from '../../domain/models/ContractTemplate'
import {
  containsInvisibleCharacters,
  findPlaceholderProblem,
  impersonatesSafeguard,
  normalizeClauseText,
  usesLockedOnlyPlaceholder,
} from '../../domain/utilities/contractTemplatePlaceholders'

// Mirrors the W8 CHECKs and RPC rules (w8c, w8d, w8f) with the same messages. The database stays the authority.

export const templateNameMessage = 'Template names must be 3 to 120 characters.'
export const editableBodyEmptyMessage = 'Editable clauses cannot be empty.'
export const clauseTooLongMessage = 'A clause can hold up to 4000 characters.'
export const shopTermHeadingMessage = 'Give each shop-specific term a heading of 3 to 160 characters.'
export const shopTermBodyMessage = 'Write each shop-specific term in 10 to 4000 characters.'
export const shopTermsLimitMessage = 'A version can have up to 40 shop-specific terms.'
export const safeguardImpersonationMessage = 'Shop text cannot be labelled as a WashLink safeguard.'
export const shopTermSectionMessage = 'Shop-specific terms are not allowed in this section.'
export const invisibleCharactersMessage = 'Remove invisible characters (such as zero-width spaces) from the text.'
export const lockedOnlyPlaceholderMessage =
  'The relationship type and the party names can appear only in WashLink safeguard clauses.'

const normalizedText = z.string().transform(normalizeClauseText)

/**
 * Owner text (editable bodies, shop terms): no invisible characters, only allowlisted
 * placeholders, none of the locked-only ones, and nothing that poses as a safeguard.
 */
export function findOwnerTextProblem(ownerText: string): string | null {
  if (containsInvisibleCharacters(ownerText)) {
    return invisibleCharactersMessage
  }
  const placeholderProblem = findPlaceholderProblem(ownerText)
  if (placeholderProblem !== null) {
    return placeholderProblem
  }
  if (usesLockedOnlyPlaceholder(ownerText)) {
    return lockedOnlyPlaceholderMessage
  }
  return impersonatesSafeguard(ownerText) ? safeguardImpersonationMessage : null
}

function withOwnerTextRules(textSchema: z.ZodType<string>): z.ZodType<string> {
  return textSchema.superRefine((ownerText, refinementContext) => {
    const ownerTextProblem = findOwnerTextProblem(ownerText)
    if (ownerTextProblem !== null) {
      refinementContext.addIssue({ code: 'custom', message: ownerTextProblem })
    }
  })
}

export const templateNameSchema = normalizedText.pipe(
  z.string().min(limits.nameMinLength, templateNameMessage).max(limits.nameMaxLength, templateNameMessage),
)

export const editableBodySchema = withOwnerTextRules(
  normalizedText.pipe(
    z.string().min(limits.editableBodyMinLength, editableBodyEmptyMessage).max(limits.clauseBodyMaxLength, clauseTooLongMessage),
  ),
)

export const shopTermHeadingSchema = withOwnerTextRules(
  normalizedText.pipe(
    z.string().min(limits.shopTermHeadingMinLength, shopTermHeadingMessage).max(limits.shopTermHeadingMaxLength, shopTermHeadingMessage),
  ),
)

export const shopTermBodySchema = withOwnerTextRules(
  normalizedText.pipe(
    z.string().min(limits.shopTermBodyMinLength, shopTermBodyMessage).max(limits.shopTermBodyMaxLength, shopTermBodyMessage),
  ),
)

export function firstIssueMessage(schema: z.ZodType<string>, candidate: string): string | null {
  const parseResult = schema.safeParse(candidate)
  return parseResult.success ? null : (parseResult.error.issues.at(0)?.message ?? 'Check this text.')
}
