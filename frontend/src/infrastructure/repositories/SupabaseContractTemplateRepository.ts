import type {
  ContractTemplateClause,
  ContractTemplateDiffRow,
  ContractTemplatePlaceholder,
  ContractTemplatePreviewClause,
  ContractTemplateVersionSummary,
  OwnerContractTemplate,
  StandardContractTemplate,
} from '../../domain/models/ContractTemplate'
import type { ContractTemplateRepository } from '../../domain/repositories/ContractTemplateRepository'
import {
  contractTemplatePlaceholderSelectColumns,
  mapContractTemplateClauseRow,
  mapContractTemplateDiffRow,
  mapContractTemplatePlaceholderRow,
  mapContractTemplatePreviewRow,
  mapContractTemplateVersionRow,
  mapOwnerContractTemplateRow,
  mapStandardContractTemplateRow,
  type SupabaseContractTemplateClauseRow,
  type SupabaseContractTemplateDiffRow,
  type SupabaseContractTemplatePlaceholderRow,
  type SupabaseContractTemplatePreviewRow,
  type SupabaseContractTemplateVersionRow,
  type SupabaseOwnerContractTemplateRow,
  type SupabaseStandardContractTemplateRow,
} from '../supabase/supabaseContractTemplateRows'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'

async function callListRpc<Row>(
  rpcName: string,
  rpcArguments: Record<string, unknown> | undefined,
  fallbackMessage: string,
): Promise<Row[]> {
  const rpcResponse = await getSupabaseClient().rpc(rpcName, rpcArguments)
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, fallbackMessage)
  }
  return (rpcResponse.data ?? []) as Row[]
}

/** Template reads only (SECURITY INVOKER: RLS decides). The template tables are never written here. */
export class SupabaseContractTemplateRepository implements ContractTemplateRepository {
  public async listOwnerTemplates(): Promise<OwnerContractTemplate[]> {
    const templateRows = await callListRpc<SupabaseOwnerContractTemplateRow>(
      'owner_contract_templates',
      undefined,
      'Could not load your contract templates.',
    )
    return templateRows.map(mapOwnerContractTemplateRow)
  }

  public async fetchCurrentStandard(): Promise<StandardContractTemplate | null> {
    const standardRows = await callListRpc<SupabaseStandardContractTemplateRow>(
      'platform_contract_template_current',
      undefined,
      'Could not load the standard template.',
    )
    const standardRow = standardRows.at(0)
    return standardRow === undefined ? null : mapStandardContractTemplateRow(standardRow)
  }

  public async listPlaceholders(): Promise<ContractTemplatePlaceholder[]> {
    const queryResponse = await getSupabaseClient()
      .from('contract_template_placeholders')
      .select(contractTemplatePlaceholderSelectColumns)
      .order('placeholder_key')
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load the placeholders.')
    }
    return (queryResponse.data as unknown as SupabaseContractTemplatePlaceholderRow[]).map(mapContractTemplatePlaceholderRow)
  }

  public async listVersionClauses(versionId: string): Promise<ContractTemplateClause[]> {
    const clauseRows = await callListRpc<SupabaseContractTemplateClauseRow>(
      'contract_template_version_clauses',
      { p_version_id: versionId },
      'Could not load the template.',
    )
    return clauseRows.map(mapContractTemplateClauseRow)
  }

  public async listVersionHistory(templateId: string): Promise<ContractTemplateVersionSummary[]> {
    const versionRows = await callListRpc<SupabaseContractTemplateVersionRow>(
      'contract_template_version_history',
      { p_template_id: templateId },
      'Could not load the version history.',
    )
    return versionRows.map(mapContractTemplateVersionRow)
  }

  public async previewVersion(versionId: string): Promise<ContractTemplatePreviewClause[]> {
    const previewRows = await callListRpc<SupabaseContractTemplatePreviewRow>(
      'preview_contract_template_version',
      { p_version_id: versionId },
      'Could not load the preview.',
    )
    return previewRows.map(mapContractTemplatePreviewRow)
  }

  public async diffVersion(versionId: string): Promise<ContractTemplateDiffRow[]> {
    const diffRows = await callListRpc<SupabaseContractTemplateDiffRow>(
      'contract_template_version_diff',
      { p_version_id: versionId },
      'Could not load the comparison with the standard.',
    )
    return diffRows.map(mapContractTemplateDiffRow)
  }
}
