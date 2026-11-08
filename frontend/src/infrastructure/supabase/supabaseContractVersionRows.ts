import type { ContractClauseKind } from '../../domain/models/ContractTemplate'
import type {
  ContractAcceptanceRecord,
  ContractAmendmentClauseChange,
  ContractClauseChangeKind,
  ContractClauseComparison,
  ContractDraftPreview,
  ContractEditedIn,
  ContractPartyRole,
  ContractPreviewClause,
  ContractProblemTermFlag,
  ContractVersionChange,
  ContractVersionChangeKind,
  ContractVersionDocument,
  ContractVersionKind,
  ContractVersionRecord,
  ContractVersionState,
  ContractVersionSummary,
} from '../../domain/models/WorkerContract'

// W9 contract version rows (w9h reads, w9f / w9g version RPCs) and their mappers.

/** Clause rows of worker_contract_version_clauses() and of the preview jsonb. */
export interface SupabaseContractClauseRow {
  section_number: number
  section_title: string
  review_notice: string
  position: number
  clause_key: string | null
  kind: ContractClauseKind
  heading: string
  body: string
  standard_heading: string | null
  standard_body: string | null
  change: ContractClauseChangeKind
  edited_in: ContractEditedIn | null
}

export function mapContractClauseRow(row: SupabaseContractClauseRow): ContractClauseComparison {
  return {
    sectionNumber: row.section_number,
    sectionTitle: row.section_title,
    reviewNotice: row.review_notice,
    position: row.position,
    clauseKey: row.clause_key,
    kind: row.kind,
    heading: row.heading,
    body: row.body,
    standardHeading: row.standard_heading,
    standardBody: row.standard_body,
    change: row.change,
    editedIn: row.edited_in,
  }
}

export interface SupabaseContractFlagRow {
  section_number: number | null
  position: number | null
  value_key: string | null
  rule_key: string
  category: string
  label: string
  guidance: string
  excerpt: string
}

export function mapContractFlagRow(row: SupabaseContractFlagRow): ContractProblemTermFlag {
  return {
    sectionNumber: row.section_number,
    position: row.position,
    valueKey: row.value_key,
    ruleKey: row.rule_key,
    category: row.category,
    label: row.label,
    guidance: row.guidance,
    excerpt: row.excerpt,
  }
}

interface SupabasePreviewClauseJson extends SupabaseContractClauseRow {
  needs_input: boolean | null
  amendment_change: ContractAmendmentClauseChange | null
}

export interface SupabaseDraftPreviewRow {
  version_id: string
  version_number: number
  kind: ContractVersionKind
  draft_revision: number
  flag_count: number
  unfilled: string[] | null
  clauses: SupabasePreviewClauseJson[] | null
  flags: SupabaseContractFlagRow[] | null
}

export function mapDraftPreviewRow(row: SupabaseDraftPreviewRow): ContractDraftPreview {
  const clauses: ContractPreviewClause[] = (row.clauses ?? []).map((clauseJson) => ({
    ...mapContractClauseRow(clauseJson),
    needsInput: clauseJson.needs_input === true,
    amendmentChange: clauseJson.amendment_change,
  }))
  return {
    versionId: row.version_id,
    versionNumber: row.version_number,
    kind: row.kind,
    draftRevision: row.draft_revision,
    flagCount: row.flag_count,
    unfilled: row.unfilled ?? [],
    clauses,
    flags: (row.flags ?? []).map(mapContractFlagRow),
  }
}

export interface SupabaseContractVersionSummaryRow {
  version_id: string
  version_number: number
  kind: ContractVersionKind
  state: ContractVersionState
  classification_key: string
  classification_label: string
  start_date: string
  end_date: string | null
  content_hash: string | null
  flag_count: number | null
  sealed_at: string | null
  sent_at: string | null
  responded_at: string | null
  decline_note: string | null
  template_name: string | null
  template_version_number: number | null
  base_platform_version_number: number
  draft_revision: number
  is_current: boolean
  is_pending: boolean
  created_at: string
}

export function mapContractVersionSummaryRow(row: SupabaseContractVersionSummaryRow): ContractVersionSummary {
  return {
    versionId: row.version_id,
    versionNumber: row.version_number,
    kind: row.kind,
    state: row.state,
    classificationKey: row.classification_key,
    classificationLabel: row.classification_label,
    startDate: row.start_date,
    endDate: row.end_date,
    contentHash: row.content_hash,
    flagCount: row.flag_count,
    sealedAt: row.sealed_at,
    sentAt: row.sent_at,
    respondedAt: row.responded_at,
    declineNote: row.decline_note,
    templateName: row.template_name,
    templateVersionNumber: row.template_version_number,
    basePlatformVersionNumber: row.base_platform_version_number,
    draftRevision: row.draft_revision,
    isCurrent: row.is_current,
    isPending: row.is_pending,
    createdAt: row.created_at,
  }
}

export interface SupabaseContractDocumentRow {
  contract_id: string
  version_id: string
  version_number: number
  kind: ContractVersionKind
  state: ContractVersionState
  rendered_text: string
  content_hash: string
  sealed_at: string
  record_label: string
}

export function mapContractDocumentRow(row: SupabaseContractDocumentRow): ContractVersionDocument {
  return {
    contractId: row.contract_id,
    versionId: row.version_id,
    versionNumber: row.version_number,
    kind: row.kind,
    state: row.state,
    renderedText: row.rendered_text,
    contentHash: row.content_hash,
    sealedAt: row.sealed_at,
    recordLabel: row.record_label,
  }
}

export interface SupabaseContractChangeRow {
  change_kind: ContractVersionChangeKind
  section_number: number | null
  item_key: string | null
  heading: string | null
  previous_text: string | null
  new_text: string | null
}

export function mapContractChangeRow(row: SupabaseContractChangeRow): ContractVersionChange {
  return {
    changeKind: row.change_kind,
    sectionNumber: row.section_number,
    itemKey: row.item_key,
    heading: row.heading,
    previousText: row.previous_text,
    newText: row.new_text,
  }
}

export interface SupabaseContractAcceptanceRow {
  version_id: string
  version_number: number
  version_content_hash: string
  party_role: ContractPartyRole
  party_name: string | null
  statement_key: string
  statement_text: string
  contractor_ack_key: string | null
  contractor_ack_text: string | null
  accepted_at: string
  record_label: string
}

export function mapContractAcceptanceRow(row: SupabaseContractAcceptanceRow): ContractAcceptanceRecord {
  return {
    versionId: row.version_id,
    versionNumber: row.version_number,
    versionContentHash: row.version_content_hash,
    partyRole: row.party_role,
    partyName: row.party_name,
    statementKey: row.statement_key,
    statementText: row.statement_text,
    contractorAckKey: row.contractor_ack_key,
    contractorAckText: row.contractor_ack_text,
    acceptedAt: row.accepted_at,
    recordLabel: row.record_label,
  }
}

/** contract_versions row returned by the version RPCs (w9f, w9g). */
export interface SupabaseContractVersionRecordRow {
  id: string
  contract_id: string
  version_number: number
  kind: ContractVersionKind
  state: ContractVersionState
  draft_revision: number
  content_hash: string | null
  flag_count: number | null
}

export function mapContractVersionRecordRow(row: SupabaseContractVersionRecordRow): ContractVersionRecord {
  return {
    versionId: row.id,
    contractId: row.contract_id,
    versionNumber: row.version_number,
    kind: row.kind,
    state: row.state,
    draftRevision: row.draft_revision,
    contentHash: row.content_hash,
    flagCount: row.flag_count,
  }
}
