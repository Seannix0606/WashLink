import type { ContractTemplateClause } from '../models/ContractTemplate'
import type {
  PublishStandardContractInput,
  StandardClauseDraft,
  StandardContractDraft,
  StandardDraftChangeCount,
} from '../models/PlatformContractTemplateDraft'

/**
 * Pure W14 helpers for the standard template editor: version clauses -> editable draft -> publish
 * payload, and a client-side change count. Locked safeguard clauses are copied unchanged; only the
 * heading and body of editable clauses can change. The database re-validates everything.
 */

/** Clauses of the current standard version as an editor draft (shop-specific terms never occur in it). */
export function createStandardDraft(baseVersionNumber: number, clauses: readonly ContractTemplateClause[]): StandardContractDraft {
  const draftClauses: StandardClauseDraft[] = []
  for (const clause of clauses) {
    if (clause.clauseKey === null || clause.kind === 'shop_specific') {
      continue
    }
    draftClauses.push({
      clauseKey: clause.clauseKey,
      sectionNumber: clause.sectionNumber,
      sectionTitle: clause.sectionTitle,
      reviewNotice: clause.reviewNotice,
      kind: clause.kind,
      heading: clause.heading,
      body: clause.body,
      requiresOwnerInput: clause.requiresOwnerInput,
      originalHeading: clause.heading,
      originalBody: clause.body,
    })
  }
  return { baseVersionNumber, clauses: draftClauses }
}

/** A new draft with one editable clause changed; locked clauses are never changed. */
export function updateStandardClause(
  draft: StandardContractDraft,
  clauseKey: string,
  change: { readonly heading?: string; readonly body?: string },
): StandardContractDraft {
  return {
    ...draft,
    clauses: draft.clauses.map((clause) =>
      clause.clauseKey !== clauseKey || clause.kind !== 'editable'
        ? clause
        : { ...clause, heading: change.heading ?? clause.heading, body: change.body ?? clause.body },
    ),
  }
}

function isClauseChanged(clause: StandardClauseDraft): boolean {
  return clause.heading !== clause.originalHeading || clause.body !== clause.originalBody
}

/** How many editable clauses differ from the version the draft started from. */
export function countStandardDraftChanges(draft: StandardContractDraft): StandardDraftChangeCount {
  return { changedClauseCount: draft.clauses.filter((clause) => clause.kind === 'editable' && isClauseChanged(clause)).length }
}

/** The keys of editable clauses whose heading or body is empty after trimming. */
export function findEmptyEditableClauses(draft: StandardContractDraft): readonly string[] {
  return draft.clauses
    .filter((clause) => clause.kind === 'editable' && (clause.heading.trim().length === 0 || clause.body.trim().length === 0))
    .map((clause) => clause.clauseKey)
}

/**
 * The `publish_platform_contract_template_version` arguments: every clause in server order, with
 * the expected version number the draft started from (55000 when a newer version exists).
 */
export function buildStandardPublishInput(draft: StandardContractDraft): PublishStandardContractInput {
  return {
    expectedVersionNumber: draft.baseVersionNumber,
    clauses: draft.clauses.map((clause) => ({
      section_number: clause.sectionNumber,
      clause_key: clause.clauseKey,
      kind: clause.kind,
      // Unchanged and locked clauses are sent exactly as read; only edited text is trimmed.
      heading: clause.kind === 'editable' && isClauseChanged(clause) ? clause.heading.trim() : clause.originalHeading,
      body: clause.kind === 'editable' && isClauseChanged(clause) ? clause.body.trim() : clause.originalBody,
      requires_owner_input: clause.requiresOwnerInput,
    })),
  }
}
