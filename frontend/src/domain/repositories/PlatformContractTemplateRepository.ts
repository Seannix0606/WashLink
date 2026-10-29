import type { ContractTemplateClause, ContractTemplateVersionSummary, StandardContractTemplate } from '../models/ContractTemplate'
import type { PublishedStandardVersion, PublishStandardContractInput } from '../models/PlatformContractTemplateDraft'

/**
 * W14 standard template publishing: the W8 reads (`platform_contract_template_current`,
 * `contract_template_version_history`, `contract_template_version_clauses`) and the W8 publish RPC.
 */
export interface PlatformContractTemplateRepository {
  fetchCurrentStandard(): Promise<StandardContractTemplate | null>
  listVersionHistory(templateId: string): Promise<ContractTemplateVersionSummary[]>
  listVersionClauses(versionId: string): Promise<ContractTemplateClause[]>
  publish(input: PublishStandardContractInput): Promise<PublishedStandardVersion>
}
