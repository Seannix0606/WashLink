import type { ContractTemplateClause, ContractTemplateVersionSummary, StandardContractTemplate } from '../../domain/models/ContractTemplate'
import type { PublishedStandardVersion, PublishStandardContractInput } from '../../domain/models/PlatformContractTemplateDraft'
import type { PlatformContractTemplateRepository } from '../../domain/repositories/PlatformContractTemplateRepository'
import {
  mapContractTemplateClauseRow,
  mapContractTemplateVersionRow,
  mapStandardContractTemplateRow,
  type SupabaseContractTemplateClauseRow,
  type SupabaseContractTemplateVersionRow,
  type SupabaseStandardContractTemplateRow,
} from '../supabase/supabaseContractTemplateRows'
import { callRpcRows, callRpcSingle } from './supabaseRpcCalls'

interface SupabasePublishedVersionRow {
  id: string
  version_number: number
}

/**
 * W14 standard template publishing: W8 reads and the W8 `publish_platform_contract_template_version`
 * RPC only. Owner versions and sent contracts are never touched (the database keeps them).
 */
export class SupabasePlatformContractTemplateRepository implements PlatformContractTemplateRepository {
  public async fetchCurrentStandard(): Promise<StandardContractTemplate | null> {
    const standardRows = await callRpcRows<SupabaseStandardContractTemplateRow>(
      'platform_contract_template_current',
      undefined,
      'Could not load the standard template.',
    )
    const standardRow = standardRows.at(0)
    return standardRow === undefined ? null : mapStandardContractTemplateRow(standardRow)
  }

  public async listVersionHistory(templateId: string): Promise<ContractTemplateVersionSummary[]> {
    const versionRows = await callRpcRows<SupabaseContractTemplateVersionRow>(
      'contract_template_version_history',
      { p_template_id: templateId },
      'Could not load the version history.',
    )
    return versionRows.map(mapContractTemplateVersionRow)
  }

  public async listVersionClauses(versionId: string): Promise<ContractTemplateClause[]> {
    const clauseRows = await callRpcRows<SupabaseContractTemplateClauseRow>(
      'contract_template_version_clauses',
      { p_version_id: versionId },
      'Could not load the standard template.',
    )
    return clauseRows.map(mapContractTemplateClauseRow)
  }

  public async publish(input: PublishStandardContractInput): Promise<PublishedStandardVersion> {
    const versionRow = await callRpcSingle<SupabasePublishedVersionRow>(
      'publish_platform_contract_template_version',
      { p_expected_version_number: input.expectedVersionNumber, p_clauses: input.clauses },
      'Could not publish the standard template.',
    )
    return { versionId: versionRow.id, versionNumber: versionRow.version_number }
  }
}
