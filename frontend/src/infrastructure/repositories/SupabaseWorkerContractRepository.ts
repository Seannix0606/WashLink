import type {
  ContractAcceptanceRecord,
  ContractAcknowledgementText,
  ContractClauseComparison,
  ContractDraftPreview,
  ContractDraftVersion,
  ContractEligibleWorker,
  ContractFlagNotices,
  ContractProblemTermFlag,
  ContractVersionChange,
  ContractVersionDocument,
  ContractVersionSummary,
  MyWorkerContract,
  OwnerWorkerContract,
  RetainedApplicationRecord,
  WorkerClassificationOption,
} from '../../domain/models/WorkerContract'
import type { WorkerContractRepository } from '../../domain/repositories/WorkerContractRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import {
  mapContractAcceptanceRow,
  mapContractChangeRow,
  mapContractClauseRow,
  mapContractDocumentRow,
  mapContractFlagRow,
  mapContractVersionSummaryRow,
  mapDraftPreviewRow,
  type SupabaseContractAcceptanceRow,
  type SupabaseContractChangeRow,
  type SupabaseContractClauseRow,
  type SupabaseContractDocumentRow,
  type SupabaseContractFlagRow,
  type SupabaseContractVersionSummaryRow,
  type SupabaseDraftPreviewRow,
} from '../supabase/supabaseContractVersionRows'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'
import {
  acknowledgementTextSelectColumns,
  classificationOptionSelectColumns,
  draftVersionSelectColumns,
  mapContractEligibleWorkerRow,
  mapDraftVersionRow,
  mapMyWorkerContractRow,
  mapOwnerWorkerContractRow,
  mapRetainedApplicationRow,
  type SupabaseContractEligibleWorkerRow,
  type SupabaseDraftVersionRow,
  type SupabaseMyWorkerContractRow,
  type SupabaseOwnerWorkerContractRow,
  type SupabaseRetainedApplicationRow,
} from '../supabase/supabaseWorkerContractRows'

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

interface ClassificationOptionRow {
  classification_key: string
  label: string
  sort_order: number
  needs_extra_acknowledgement: boolean
}

interface AcknowledgementTextRow {
  ack_key: string
  statement_text: string
}

/**
 * Contract reads only. The W9 tables are never written here: reads use the invoker RPCs, the
 * two select-only reference tables and the owner's own draft version row (RLS decides).
 */
export class SupabaseWorkerContractRepository implements WorkerContractRepository {
  public async listOwnerContracts(): Promise<OwnerWorkerContract[]> {
    const rows = await callListRpc<SupabaseOwnerWorkerContractRow>('owner_worker_contracts', undefined, 'Could not load your worker contracts.')
    return rows.map(mapOwnerWorkerContractRow)
  }

  public async listMyContracts(): Promise<MyWorkerContract[]> {
    const rows = await callListRpc<SupabaseMyWorkerContractRow>('my_worker_contracts', undefined, 'Could not load your contracts.')
    return rows.map(mapMyWorkerContractRow)
  }

  public async listEligibleWorkers(): Promise<ContractEligibleWorker[]> {
    const rows = await callListRpc<SupabaseContractEligibleWorkerRow>(
      'owner_contract_eligible_workers',
      undefined,
      'Could not load the workers you can draft a contract for.',
    )
    return rows.map(mapContractEligibleWorkerRow)
  }

  public async listClassificationOptions(): Promise<WorkerClassificationOption[]> {
    const queryResponse = await getSupabaseClient()
      .from('worker_classification_options')
      .select(classificationOptionSelectColumns)
      .order('sort_order')
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load the relationship types.')
    }
    return (queryResponse.data as unknown as ClassificationOptionRow[]).map((row) => ({
      classificationKey: row.classification_key,
      label: row.label,
      sortOrder: row.sort_order,
      needsExtraAcknowledgement: row.needs_extra_acknowledgement,
    }))
  }

  public async listAcknowledgementTexts(): Promise<ContractAcknowledgementText[]> {
    const queryResponse = await getSupabaseClient()
      .from('contract_acknowledgement_texts')
      .select(acknowledgementTextSelectColumns)
      .order('ack_key')
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load the contract statements.')
    }
    return (queryResponse.data as unknown as AcknowledgementTextRow[]).map((row) => ({
      ackKey: row.ack_key,
      statementText: row.statement_text,
    }))
  }

  public async fetchFlagNotices(): Promise<ContractFlagNotices | null> {
    const rows = await callListRpc<{ disclaimer: string; no_match_text: string }>(
      'worker_contract_flag_notices',
      undefined,
      'Could not load the keyword check notice.',
    )
    const noticeRow = rows.at(0)
    return noticeRow === undefined ? null : { disclaimer: noticeRow.disclaimer, noMatchText: noticeRow.no_match_text }
  }

  public async fetchDraftVersion(versionId: string): Promise<ContractDraftVersion | null> {
    const queryResponse = await getSupabaseClient()
      .from('contract_versions')
      .select(draftVersionSelectColumns)
      .eq('id', versionId)
      .eq('state', 'draft')
      .limit(1)
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load the contract draft.')
    }
    const draftRow = (queryResponse.data as unknown as SupabaseDraftVersionRow[]).at(0)
    return draftRow === undefined ? null : mapDraftVersionRow(draftRow)
  }

  public async previewDraft(contractId: string): Promise<ContractDraftPreview | null> {
    const rows = await callListRpc<SupabaseDraftPreviewRow>(
      'preview_worker_contract_draft',
      { p_contract_id: contractId },
      'Could not load the draft preview.',
    )
    const previewRow = rows.at(0)
    return previewRow === undefined ? null : mapDraftPreviewRow(previewRow)
  }

  public async listVersions(contractId: string): Promise<ContractVersionSummary[]> {
    const rows = await callListRpc<SupabaseContractVersionSummaryRow>(
      'worker_contract_versions',
      { p_contract_id: contractId },
      'Could not load the contract versions.',
    )
    return rows.map(mapContractVersionSummaryRow)
  }

  public async fetchVersionDocument(versionId: string): Promise<ContractVersionDocument | null> {
    const rows = await callListRpc<SupabaseContractDocumentRow>(
      'worker_contract_version_document',
      { p_version_id: versionId },
      'Could not load the contract text.',
    )
    const documentRow = rows.at(0)
    return documentRow === undefined ? null : mapContractDocumentRow(documentRow)
  }

  public async listVersionClauses(versionId: string): Promise<ContractClauseComparison[]> {
    const rows = await callListRpc<SupabaseContractClauseRow>(
      'worker_contract_version_clauses',
      { p_version_id: versionId },
      'Could not load the comparison with the standard.',
    )
    return rows.map(mapContractClauseRow)
  }

  public async listVersionFlags(versionId: string): Promise<ContractProblemTermFlag[]> {
    const rows = await callListRpc<SupabaseContractFlagRow>(
      'worker_contract_version_flags',
      { p_version_id: versionId },
      'Could not load the keyword check.',
    )
    return rows.map(mapContractFlagRow)
  }

  public async listVersionChanges(versionId: string): Promise<ContractVersionChange[]> {
    const rows = await callListRpc<SupabaseContractChangeRow>(
      'worker_contract_version_changes',
      { p_version_id: versionId },
      'Could not load the list of changes.',
    )
    return rows.map(mapContractChangeRow)
  }

  public async listAcceptances(contractId: string): Promise<ContractAcceptanceRecord[]> {
    const rows = await callListRpc<SupabaseContractAcceptanceRow>(
      'worker_contract_acceptances',
      { p_contract_id: contractId },
      'Could not load the acceptance records.',
    )
    return rows.map(mapContractAcceptanceRow)
  }

  public async listRetainedApplicationRecords(): Promise<RetainedApplicationRecord[]> {
    const rows = await callListRpc<SupabaseRetainedApplicationRow>(
      'my_retained_application_records',
      undefined,
      'Could not load your kept application records.',
    )
    return rows.map(mapRetainedApplicationRow)
  }
}
