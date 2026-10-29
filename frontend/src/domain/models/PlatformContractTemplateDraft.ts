import type { ContractClauseKind } from './ContractTemplate'

/**
 * W14 standard contract template publishing (W8 `publish_platform_contract_template_version`).
 * The standard stays a draft that needs legal review; publishing never changes owner versions or
 * sent contracts (D-28, W14-L11). WashLink safeguard clauses are read-only in the editor; the
 * database re-checks every clause.
 */

/** One clause of the standard in the editor (server order: section, then position). */
export interface StandardClauseDraft {
  readonly clauseKey: string
  readonly sectionNumber: number
  readonly sectionTitle: string
  readonly reviewNotice: string
  readonly kind: Extract<ContractClauseKind, 'locked_safeguard' | 'editable'>
  readonly heading: string
  readonly body: string
  readonly requiresOwnerInput: boolean
  /** The heading and body of the version the draft started from (for the change count). */
  readonly originalHeading: string
  readonly originalBody: string
}

export interface StandardContractDraft {
  readonly baseVersionNumber: number
  readonly clauses: readonly StandardClauseDraft[]
}

/** One element of `p_clauses`; the server numbers positions by order within each section. */
export interface PublishStandardClausePayload {
  readonly section_number: number
  readonly clause_key: string
  readonly kind: 'locked_safeguard' | 'editable'
  readonly heading: string
  readonly body: string
  readonly requires_owner_input: boolean
}

export interface PublishStandardContractInput {
  readonly expectedVersionNumber: number
  readonly clauses: readonly PublishStandardClausePayload[]
}

/** The version row the publish RPC returns. */
export interface PublishedStandardVersion {
  readonly versionId: string
  readonly versionNumber: number
}

export interface StandardDraftChangeCount {
  readonly changedClauseCount: number
}
