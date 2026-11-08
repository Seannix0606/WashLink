import type {
  ContractTemplateClause,
  ContractTemplateDiffRow,
  ContractTemplatePlaceholder,
  ContractTemplatePreviewClause,
  ContractTemplateRecord,
  ContractTemplateStatus,
  ContractTemplateVersionRecord,
  ContractTemplateVersionSummary,
  OwnerContractTemplate,
  SaveContractTemplateVersionInput,
  StandardContractTemplate,
} from '../models/ContractTemplate'

/**
 * Contract template reads (SECURITY INVOKER RPCs and one reference table under RLS).
 * A foreign or unknown id returns no rows, never an error that reveals existence.
 */
export interface ContractTemplateRepository {
  listOwnerTemplates(): Promise<OwnerContractTemplate[]>
  /** The latest platform standard version; null when none is readable. */
  fetchCurrentStandard(): Promise<StandardContractTemplate | null>
  listPlaceholders(): Promise<ContractTemplatePlaceholder[]>
  listVersionClauses(versionId: string): Promise<ContractTemplateClause[]>
  listVersionHistory(templateId: string): Promise<ContractTemplateVersionSummary[]>
  previewVersion(versionId: string): Promise<ContractTemplatePreviewClause[]>
  diffVersion(versionId: string): Promise<ContractTemplateDiffRow[]>
}

/**
 * Every template write is an RPC. Payloads carry only names, editable bodies keyed by
 * clause key and shop-specific terms; locked clauses and hashes come from the server.
 */
export interface ContractTemplateActionRepository {
  /** `fromVersionId` null starts from the latest standard; an own version copies its edits. */
  create(name: string, fromVersionId: string | null): Promise<ContractTemplateRecord>
  saveVersion(saveInput: SaveContractTemplateVersionInput): Promise<ContractTemplateVersionRecord>
  rename(templateId: string, name: string): Promise<ContractTemplateRecord>
  setStatus(templateId: string, fromStatus: ContractTemplateStatus, toStatus: ContractTemplateStatus): Promise<ContractTemplateRecord>
}
