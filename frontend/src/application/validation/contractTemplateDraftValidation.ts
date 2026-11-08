import { contractTemplateLimits as limits, type ContractTemplateClause } from '../../domain/models/ContractTemplate'
import { canAddShopTermToSection, type ContractTemplateDraft } from '../../domain/utilities/contractTemplateDraft'
import { normalizeClauseText } from '../../domain/utilities/contractTemplatePlaceholders'
import {
  editableBodySchema,
  firstIssueMessage,
  shopTermBodySchema,
  shopTermHeadingSchema,
  shopTermSectionMessage,
  shopTermsLimitMessage,
} from './contractTemplateSchemas'

export const totalTextLimitMessage = 'A contract template can hold up to 120000 characters.'

export interface ContractTemplateDraftErrors {
  /** Keyed by `editableFieldKey` / `shopTermFieldKey`. */
  readonly fieldErrors: Readonly<Record<string, string>>
  readonly formError: string | null
}

export function editableFieldKey(clauseKey: string): string {
  return `editable:${clauseKey}`
}

export function shopTermFieldKey(draftId: string, fieldName: 'heading' | 'body'): string {
  return `term:${draftId}:${fieldName}`
}

export function hasDraftErrors(draftErrors: ContractTemplateDraftErrors): boolean {
  return draftErrors.formError !== null || Object.keys(draftErrors.fieldErrors).length > 0
}

export function firstDraftErrorMessage(draftErrors: ContractTemplateDraftErrors): string | null {
  return draftErrors.formError ?? Object.values(draftErrors.fieldErrors).at(0) ?? null
}

/** Every rule the client can check before saving; the commit validator re-checks all of them. */
export function validateContractTemplateDraft(
  clauses: readonly ContractTemplateClause[],
  draft: ContractTemplateDraft,
): ContractTemplateDraftErrors {
  const fieldErrors: Record<string, string> = {}
  let totalTextLength = 0
  for (const clause of clauses) {
    if (clause.kind === 'locked_safeguard') {
      totalTextLength += clause.body.length
    }
    if (clause.kind !== 'editable' || clause.clauseKey === null) {
      continue
    }
    const draftBody = draft.editableBodies[clause.clauseKey] ?? clause.body
    totalTextLength += normalizeClauseText(draftBody).length
    const bodyProblem = firstIssueMessage(editableBodySchema, draftBody)
    if (bodyProblem !== null) {
      fieldErrors[editableFieldKey(clause.clauseKey)] = bodyProblem
    }
  }
  let formError: string | null = draft.shopTerms.length > limits.shopTermsMaximum ? shopTermsLimitMessage : null
  for (const shopTerm of draft.shopTerms) {
    totalTextLength += normalizeClauseText(shopTerm.body).length
    if (!canAddShopTermToSection(shopTerm.sectionNumber, clauses)) {
      formError ??= shopTermSectionMessage
    }
    const headingProblem = firstIssueMessage(shopTermHeadingSchema, shopTerm.heading)
    if (headingProblem !== null) {
      fieldErrors[shopTermFieldKey(shopTerm.draftId, 'heading')] = headingProblem
    }
    const bodyProblem = firstIssueMessage(shopTermBodySchema, shopTerm.body)
    if (bodyProblem !== null) {
      fieldErrors[shopTermFieldKey(shopTerm.draftId, 'body')] = bodyProblem
    }
  }
  if (totalTextLength > limits.totalTextMaxLength) {
    formError ??= totalTextLimitMessage
  }
  return { fieldErrors, formError }
}
