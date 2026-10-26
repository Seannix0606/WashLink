import type {
  ContractTemplateRecord,
  ContractTemplateStatus,
  ContractTemplateVersionRecord,
  SaveContractTemplateVersionInput,
} from '../../domain/models/ContractTemplate'
import type { ContractTemplateActionRepository } from '../../domain/repositories/ContractTemplateRepository'
import { hasCompositeKey } from '../supabase/supabaseCertificationRows'
import { getSupabaseClient } from '../supabase/supabaseClient'
import {
  contractTemplateNoRowMessage,
  mapContractTemplateRecordRow,
  mapContractTemplateVersionRecordRow,
  type SupabaseContractTemplateRecordRow,
  type SupabaseContractTemplateVersionRecordRow,
} from '../supabase/supabaseContractTemplateRows'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'

/** One write RPC returning one composite row; an answer without its id is a failure, never success. */
async function callWriteRpc<Row>(rpcName: string, rpcArguments: Record<string, unknown>, fallbackMessage: string): Promise<Row> {
  const rpcResponse = await getSupabaseClient().rpc(rpcName, rpcArguments).single()
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, fallbackMessage)
  }
  if (!hasCompositeKey(rpcResponse.data, 'id')) {
    throw new Error(contractTemplateNoRowMessage)
  }
  return rpcResponse.data as Row
}

/**
 * Template writes, RPC only. No argument carries an owner, a locked clause, a hash, a
 * review status or a classification: the database derives or refuses each of them.
 */
export class SupabaseContractTemplateActionRepository implements ContractTemplateActionRepository {
  public async create(name: string, fromVersionId: string | null): Promise<ContractTemplateRecord> {
    const templateRow = await callWriteRpc<SupabaseContractTemplateRecordRow>(
      'create_owner_contract_template',
      { p_name: name, p_from_version_id: fromVersionId },
      'Could not create the template.',
    )
    return mapContractTemplateRecordRow(templateRow)
  }

  public async saveVersion(saveInput: SaveContractTemplateVersionInput): Promise<ContractTemplateVersionRecord> {
    const versionRow = await callWriteRpc<SupabaseContractTemplateVersionRecordRow>(
      'save_owner_contract_template_version',
      {
        p_template_id: saveInput.templateId,
        p_expected_version_number: saveInput.expectedVersionNumber,
        p_base_platform_version_id: saveInput.basePlatformVersionId,
        p_editable_bodies: { ...saveInput.editableBodies },
        p_shop_terms: saveInput.shopTerms.map((shopTerm) => ({
          section_number: shopTerm.sectionNumber,
          heading: shopTerm.heading,
          body: shopTerm.body,
        })),
      },
      'Could not save the template.',
    )
    return mapContractTemplateVersionRecordRow(versionRow)
  }

  public async rename(templateId: string, name: string): Promise<ContractTemplateRecord> {
    const templateRow = await callWriteRpc<SupabaseContractTemplateRecordRow>(
      'rename_owner_contract_template',
      { p_template_id: templateId, p_name: name },
      'Could not rename the template.',
    )
    return mapContractTemplateRecordRow(templateRow)
  }

  public async setStatus(
    templateId: string,
    fromStatus: ContractTemplateStatus,
    toStatus: ContractTemplateStatus,
  ): Promise<ContractTemplateRecord> {
    const templateRow = await callWriteRpc<SupabaseContractTemplateRecordRow>(
      'set_owner_contract_template_status',
      { p_template_id: templateId, p_from_status: fromStatus, p_to_status: toStatus },
      'Could not change the template status.',
    )
    return mapContractTemplateRecordRow(templateRow)
  }
}
