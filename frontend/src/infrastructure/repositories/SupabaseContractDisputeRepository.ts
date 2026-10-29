import type {
  AdminContractDisputeCase,
  AdminContractDisputeQueueItem,
  AdminContractDisputeVersionDocument,
  CloseContractDisputeInput,
  ContractDisputeRecord,
  ContractDisputeStatus,
  MyContractDispute,
  RaiseContractDisputeInput,
} from '../../domain/models/ContractDispute'
import type { ContractDisputeRepository } from '../../domain/repositories/ContractDisputeRepository'
import {
  mapAdminContractDisputeCase,
  mapAdminContractDisputeQueueRow,
  mapAdminDisputeVersionDocumentRow,
  mapContractDisputeRecordRow,
  mapMyContractDisputeRow,
  type SupabaseAdminContractDisputeQueueRow,
  type SupabaseAdminDisputeVersionDocumentRow,
  type SupabaseContractDisputeRecordRow,
  type SupabaseMyContractDisputeRow,
} from '../supabase/supabaseContractDisputeRows'
import { callRpcRows, callRpcSingle } from './supabaseRpcCalls'

/**
 * W11 reported contract problem RPCs only (w11f, w11g). None of them writes a contract, a version
 * or an acceptance; the database proves that with a static scan (J16).
 */
export class SupabaseContractDisputeRepository implements ContractDisputeRepository {
  public async listMyDisputes(): Promise<MyContractDispute[]> {
    const disputeRows = await callRpcRows<SupabaseMyContractDisputeRow>('my_contract_disputes', undefined, 'Could not load your reported problems.')
    return disputeRows.map(mapMyContractDisputeRow)
  }

  public async raise(input: RaiseContractDisputeInput): Promise<ContractDisputeRecord> {
    const recordRow = await callRpcSingle<SupabaseContractDisputeRecordRow>(
      'raise_contract_dispute',
      { p_contract_id: input.contractId, p_category: input.category, p_statement: input.statement },
      'Could not report the problem.',
    )
    return mapContractDisputeRecordRow(recordRow)
  }

  public async respond(disputeId: string, statement: string): Promise<ContractDisputeRecord> {
    const recordRow = await callRpcSingle<SupabaseContractDisputeRecordRow>(
      'respond_to_contract_dispute',
      { p_dispute_id: disputeId, p_statement: statement },
      'Could not add your side.',
    )
    return mapContractDisputeRecordRow(recordRow)
  }

  public async withdraw(disputeId: string): Promise<ContractDisputeRecord> {
    const recordRow = await callRpcSingle<SupabaseContractDisputeRecordRow>(
      'withdraw_contract_dispute',
      { p_dispute_id: disputeId },
      'Could not withdraw the reported problem.',
    )
    return mapContractDisputeRecordRow(recordRow)
  }

  public async listAdminQueue(status: ContractDisputeStatus): Promise<AdminContractDisputeQueueItem[]> {
    const queueRows = await callRpcRows<SupabaseAdminContractDisputeQueueRow>(
      'admin_contract_dispute_queue',
      { p_status: status },
      'Could not load the reported problems.',
    )
    return queueRows.map(mapAdminContractDisputeQueueRow)
  }

  public async fetchAdminCase(disputeId: string): Promise<AdminContractDisputeCase> {
    const caseJson = await callRpcSingle<unknown>('admin_contract_dispute_case', { p_dispute_id: disputeId }, 'Could not load this reported problem.')
    return mapAdminContractDisputeCase(caseJson)
  }

  public async fetchAdminVersionDocument(disputeId: string, versionId: string): Promise<AdminContractDisputeVersionDocument | null> {
    const documentRows = await callRpcRows<SupabaseAdminDisputeVersionDocumentRow>(
      'admin_contract_dispute_version_document',
      { p_dispute_id: disputeId, p_version_id: versionId },
      'Could not load the contract text.',
    )
    const documentRow = documentRows.at(0)
    return documentRow === undefined ? null : mapAdminDisputeVersionDocumentRow(documentRow)
  }

  public async close(input: CloseContractDisputeInput): Promise<ContractDisputeRecord> {
    const recordRow = await callRpcSingle<SupabaseContractDisputeRecordRow>(
      'close_contract_dispute',
      {
        p_dispute_id: input.disputeId,
        p_expected_revision: input.expectedRevision,
        p_resolution_kind: input.resolutionKind,
        p_resolution_note: input.resolutionNote,
      },
      'Could not close the reported problem.',
    )
    return mapContractDisputeRecordRow(recordRow)
  }
}
