import type {
  ContractClauseChange,
  ContractClauseKind,
  ContractTemplateClause,
  ContractTemplateDiffRow,
  ContractTemplatePlaceholder,
  ContractTemplatePreviewClause,
  ContractTemplateRecord,
  ContractTemplateSavedByRole,
  ContractTemplateStatus,
  ContractTemplateVersionRecord,
  ContractTemplateVersionSummary,
  OwnerContractTemplate,
  StandardContractTemplate,
} from '../../domain/models/ContractTemplate'

/** Row of owner_contract_templates() (w8g). */
export interface SupabaseOwnerContractTemplateRow {
  template_id: string
  name: string
  status: ContractTemplateStatus
  current_version_number: number
  current_version_id: string
  last_saved_at: string
  base_platform_version_id: string
  base_platform_version_number: number
  latest_platform_version_id: string | null
  latest_platform_version_number: number | null
  newer_standard_available: boolean
  derived_from_version_id: string | null
  created_at: string
}

export function mapOwnerContractTemplateRow(templateRow: SupabaseOwnerContractTemplateRow): OwnerContractTemplate {
  return {
    templateId: templateRow.template_id,
    name: templateRow.name,
    status: templateRow.status,
    currentVersionNumber: templateRow.current_version_number,
    currentVersionId: templateRow.current_version_id,
    lastSavedAt: templateRow.last_saved_at,
    basePlatformVersionId: templateRow.base_platform_version_id,
    basePlatformVersionNumber: templateRow.base_platform_version_number,
    latestPlatformVersionId: templateRow.latest_platform_version_id,
    latestPlatformVersionNumber: templateRow.latest_platform_version_number,
    newerStandardAvailable: templateRow.newer_standard_available,
    derivedFromVersionId: templateRow.derived_from_version_id,
    createdAt: templateRow.created_at,
  }
}

/** Row of platform_contract_template_current() (w8g). */
export interface SupabaseStandardContractTemplateRow {
  template_id: string
  name: string
  version_id: string
  version_number: number
  content_hash: string
  created_at: string
}

export function mapStandardContractTemplateRow(standardRow: SupabaseStandardContractTemplateRow): StandardContractTemplate {
  return {
    templateId: standardRow.template_id,
    name: standardRow.name,
    versionId: standardRow.version_id,
    versionNumber: standardRow.version_number,
    contentHash: standardRow.content_hash,
    createdAt: standardRow.created_at,
  }
}

/** Row of contract_template_version_history() (w8g). */
export interface SupabaseContractTemplateVersionRow {
  version_id: string
  version_number: number
  created_at: string
  content_hash: string
  base_platform_version_id: string | null
  base_platform_version_number: number | null
  edited_count: number
  added_count: number
  saved_by_role: ContractTemplateSavedByRole
  is_current: boolean
}

export function mapContractTemplateVersionRow(versionRow: SupabaseContractTemplateVersionRow): ContractTemplateVersionSummary {
  return {
    versionId: versionRow.version_id,
    versionNumber: versionRow.version_number,
    createdAt: versionRow.created_at,
    contentHash: versionRow.content_hash,
    basePlatformVersionId: versionRow.base_platform_version_id,
    basePlatformVersionNumber: versionRow.base_platform_version_number,
    editedCount: versionRow.edited_count,
    addedCount: versionRow.added_count,
    savedByRole: versionRow.saved_by_role,
    isCurrent: versionRow.is_current,
  }
}

/** Row of contract_template_version_clauses() (w8g). */
export interface SupabaseContractTemplateClauseRow {
  clause_id: string
  section_number: number
  section_title: string
  review_notice: string
  owner_terms_allowed: boolean
  position: number
  clause_key: string | null
  kind: ContractClauseKind
  heading: string
  body: string
  requires_owner_input: boolean
  source_clause_id: string | null
  clause_hash: string
}

export function mapContractTemplateClauseRow(clauseRow: SupabaseContractTemplateClauseRow): ContractTemplateClause {
  return {
    clauseId: clauseRow.clause_id,
    sectionNumber: clauseRow.section_number,
    sectionTitle: clauseRow.section_title,
    reviewNotice: clauseRow.review_notice,
    ownerTermsAllowed: clauseRow.owner_terms_allowed,
    position: clauseRow.position,
    clauseKey: clauseRow.clause_key,
    kind: clauseRow.kind,
    heading: clauseRow.heading,
    body: clauseRow.body,
    requiresOwnerInput: clauseRow.requires_owner_input,
    sourceClauseId: clauseRow.source_clause_id,
  }
}

/** Row of preview_contract_template_version() (w8g). */
export interface SupabaseContractTemplatePreviewRow {
  clause_id: string
  section_number: number
  section_title: string
  review_notice: string
  position: number
  clause_key: string | null
  kind: ContractClauseKind
  heading: string
  rendered_heading: string
  body: string
  rendered_body: string
  requires_owner_input: boolean
}

export function mapContractTemplatePreviewRow(previewRow: SupabaseContractTemplatePreviewRow): ContractTemplatePreviewClause {
  return {
    clauseId: previewRow.clause_id,
    sectionNumber: previewRow.section_number,
    sectionTitle: previewRow.section_title,
    reviewNotice: previewRow.review_notice,
    position: previewRow.position,
    clauseKey: previewRow.clause_key,
    kind: previewRow.kind,
    renderedHeading: previewRow.rendered_heading,
    renderedBody: previewRow.rendered_body,
    requiresOwnerInput: previewRow.requires_owner_input,
  }
}

/** Row of contract_template_version_diff() (w8g). */
export interface SupabaseContractTemplateDiffRow {
  section_number: number
  section_title: string
  position: number
  clause_key: string | null
  kind: ContractClauseKind
  change: ContractClauseChange
  standard_heading: string | null
  standard_body: string | null
  version_heading: string
  version_body: string
}

export function mapContractTemplateDiffRow(diffRow: SupabaseContractTemplateDiffRow): ContractTemplateDiffRow {
  return {
    sectionNumber: diffRow.section_number,
    sectionTitle: diffRow.section_title,
    position: diffRow.position,
    clauseKey: diffRow.clause_key,
    kind: diffRow.kind,
    change: diffRow.change,
    standardHeading: diffRow.standard_heading,
    standardBody: diffRow.standard_body,
    versionHeading: diffRow.version_heading,
    versionBody: diffRow.version_body,
  }
}

/** contract_template_placeholders (w8b). */
export interface SupabaseContractTemplatePlaceholderRow {
  placeholder_key: string
  preview_label: string
}

export const contractTemplatePlaceholderSelectColumns = 'placeholder_key, preview_label'

export function mapContractTemplatePlaceholderRow(placeholderRow: SupabaseContractTemplatePlaceholderRow): ContractTemplatePlaceholder {
  return { placeholderKey: placeholderRow.placeholder_key, previewLabel: placeholderRow.preview_label }
}

/** contract_templates row returned by the template RPCs (w8f). */
export interface SupabaseContractTemplateRecordRow {
  id: string
  name: string
  status: ContractTemplateStatus
  current_version_number: number
}

export function mapContractTemplateRecordRow(recordRow: SupabaseContractTemplateRecordRow): ContractTemplateRecord {
  return {
    templateId: recordRow.id,
    name: recordRow.name,
    status: recordRow.status,
    currentVersionNumber: recordRow.current_version_number,
  }
}

/** contract_template_versions row returned by the save RPC (w8f). */
export interface SupabaseContractTemplateVersionRecordRow {
  id: string
  version_number: number
  edited_count: number
  added_count: number
}

export function mapContractTemplateVersionRecordRow(recordRow: SupabaseContractTemplateVersionRecordRow): ContractTemplateVersionRecord {
  return {
    versionId: recordRow.id,
    versionNumber: recordRow.version_number,
    editedCount: recordRow.edited_count,
    addedCount: recordRow.added_count,
  }
}

export const contractTemplateNoRowMessage = 'This template changed or is no longer available. Reload it and try again.'
