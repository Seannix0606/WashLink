import type {
  AcceptWorkerContractVersionInput,
  ContractOwnerValues,
  ContractVersionRecord,
  CreateWorkerContractDraftInput,
  SaveWorkerContractDraftInput,
  SendWorkerContractVersionInput,
  WorkerContractRecord,
} from '../../domain/models/WorkerContract'
import { contractStatementKeys } from '../../domain/models/WorkerContract'
import type { WorkerContractActionRepository } from '../../domain/repositories/WorkerContractRepository'
import { hasCompositeKey } from '../supabase/supabaseCertificationRows'
import { getSupabaseClient } from '../supabase/supabaseClient'
import {
  mapContractVersionRecordRow,
  type SupabaseContractVersionRecordRow,
} from '../supabase/supabaseContractVersionRows'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'
import {
  mapWorkerContractRecordRow,
  workerContractNoRowMessage,
  type SupabaseWorkerContractRecordRow,
} from '../supabase/supabaseWorkerContractRows'

/** One write RPC returning one composite row; an answer without its id is a failure, never success. */
async function callWriteRpc<Row>(rpcName: string, rpcArguments: Record<string, unknown>, fallbackMessage: string): Promise<Row> {
  const rpcResponse = await getSupabaseClient().rpc(rpcName, rpcArguments).single()
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, fallbackMessage)
  }
  if (!hasCompositeKey(rpcResponse.data, 'id')) {
    throw new Error(workerContractNoRowMessage)
  }
  return rpcResponse.data as Row
}

async function callContractRpc(rpcName: string, rpcArguments: Record<string, unknown>, fallbackMessage: string): Promise<WorkerContractRecord> {
  return mapWorkerContractRecordRow(await callWriteRpc<SupabaseWorkerContractRecordRow>(rpcName, rpcArguments, fallbackMessage))
}

async function callVersionRpc(rpcName: string, rpcArguments: Record<string, unknown>, fallbackMessage: string): Promise<ContractVersionRecord> {
  return mapContractVersionRecordRow(await callWriteRpc<SupabaseContractVersionRecordRow>(rpcName, rpcArguments, fallbackMessage))
}

/** Only keys with text are sent; an empty detail stays unset (WashLink never fills one in). */
function toOwnerValuesPayload(ownerValues: ContractOwnerValues): Record<string, string> {
  return Object.fromEntries(Object.entries(ownerValues).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0))
}

/**
 * Contract writes, RPC only (w9f, w9g). No argument carries an owner or party id the server
 * does not check, an acceptance row, a computed hash, a label, a name or a default relationship type.
 */
export class SupabaseWorkerContractActionRepository implements WorkerContractActionRepository {
  public async createDraft(createInput: CreateWorkerContractDraftInput): Promise<WorkerContractRecord> {
    return callContractRpc(
      'create_worker_contract_draft',
      {
        p_shop_id: createInput.shopId,
        p_worker_id: createInput.workerId,
        p_template_version_id: createInput.templateVersionId,
        p_classification_key: createInput.classificationKey,
        p_start_date: createInput.startDate,
        p_end_date: createInput.endDate,
        p_owner_values: toOwnerValuesPayload(createInput.ownerValues),
      },
      'Could not create the contract draft.',
    )
  }

  public async saveDraft(saveInput: SaveWorkerContractDraftInput): Promise<ContractVersionRecord> {
    return callVersionRpc(
      'save_worker_contract_draft',
      {
        p_contract_id: saveInput.contractId,
        p_expected_draft_revision: saveInput.expectedDraftRevision,
        p_classification_key: saveInput.classificationKey,
        p_start_date: saveInput.startDate,
        p_end_date: saveInput.endDate,
        p_owner_values: toOwnerValuesPayload(saveInput.ownerValues),
        p_editable_bodies: { ...saveInput.editableBodies },
        p_shop_terms: saveInput.shopTerms.map((shopTerm) => ({
          section_number: shopTerm.sectionNumber,
          heading: shopTerm.heading,
          body: shopTerm.body,
        })),
      },
      'Could not save the contract draft.',
    )
  }

  public async sendVersion(sendInput: SendWorkerContractVersionInput): Promise<ContractVersionRecord> {
    return callVersionRpc(
      'send_worker_contract_version',
      {
        p_contract_id: sendInput.contractId,
        p_expected_draft_revision: sendInput.expectedDraftRevision,
        p_acknowledgement_key: contractStatementKeys.ownerSend,
        p_contractor_acknowledgement_key: sendInput.contractorAcknowledgementKey,
        p_acknowledged_flag_count: sendInput.acknowledgedFlagCount,
      },
      'Could not send the contract.',
    )
  }

  public async withdrawVersion(contractId: string, versionId: string): Promise<WorkerContractRecord> {
    return callContractRpc(
      'withdraw_worker_contract_version',
      { p_contract_id: contractId, p_version_id: versionId },
      'Could not withdraw the contract version.',
    )
  }

  public async discardDraft(contractId: string, versionId: string): Promise<boolean> {
    const rpcResponse = await getSupabaseClient().rpc('discard_worker_contract_draft', { p_contract_id: contractId, p_version_id: versionId })
    if (rpcResponse.error) {
      throw toUserFacingError(rpcResponse.error, 'Could not discard the draft.')
    }
    if (rpcResponse.data !== true) {
      throw new Error(workerContractNoRowMessage)
    }
    return true
  }

  public async createAmendment(contractId: string, expectedRevision: number): Promise<ContractVersionRecord> {
    return callVersionRpc(
      'create_worker_contract_amendment',
      { p_contract_id: contractId, p_expected_revision: expectedRevision, p_template_version_id: null },
      'Could not start a change to the contract.',
    )
  }

  public async activate(contractId: string, expectedRevision: number): Promise<WorkerContractRecord> {
    return callContractRpc(
      'activate_worker_contract',
      { p_contract_id: contractId, p_expected_revision: expectedRevision },
      'Could not record the contract start.',
    )
  }

  public async acceptVersion(acceptInput: AcceptWorkerContractVersionInput): Promise<WorkerContractRecord> {
    return callContractRpc(
      'accept_worker_contract_version',
      {
        p_contract_id: acceptInput.contractId,
        p_version_id: acceptInput.versionId,
        p_content_hash: acceptInput.contentHash,
        p_acknowledgement_key: contractStatementKeys.workerAccept,
        p_contractor_acknowledgement_key: acceptInput.contractorAcknowledgementKey,
      },
      'Could not record your acceptance.',
    )
  }

  public async declineVersion(contractId: string, versionId: string, note: string | null): Promise<WorkerContractRecord> {
    return callContractRpc(
      'decline_worker_contract_version',
      { p_contract_id: contractId, p_version_id: versionId, p_note: note },
      'Could not record your decline.',
    )
  }

  public async terminate(contractId: string, expectedRevision: number, reason: string): Promise<WorkerContractRecord> {
    return callContractRpc(
      'terminate_worker_contract',
      { p_contract_id: contractId, p_expected_revision: expectedRevision, p_reason: reason },
      'Could not end the contract.',
    )
  }
}
