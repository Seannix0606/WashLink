import type {
  AdminContractDisputeCase,
  AdminContractDisputeCaseContract,
  AdminContractDisputeQueueItem,
  AdminContractDisputeVersionDocument,
  ContractDisputeCategory,
  ContractDisputeRecord,
  ContractDisputeResolutionKind,
  ContractDisputeStatus,
  MyContractDispute,
} from '../../domain/models/ContractDispute'
import type {
  ContractEndedBy,
  ContractPartyRole,
  ContractVersionKind,
  ContractVersionState,
  WorkerContractStatus,
} from '../../domain/models/WorkerContract'
import { jsonReaders } from './supabaseCertificationPlatformReviewRows'

const { textOrNull, textOrEmpty, numberOrZero, objectOrEmpty, objectList } = jsonReaders

/** `my_contract_disputes()` (w11g). */
export interface SupabaseMyContractDisputeRow {
  dispute_id: string
  contract_id: string
  shop_name: string | null
  counterpart_name: string | null
  category: ContractDisputeCategory
  status: ContractDisputeStatus
  raised_by_me: boolean
  statement: string
  response_statement: string | null
  resolution_kind: ContractDisputeResolutionKind | null
  resolution_note: string | null
  created_at: string
  responded_at: string | null
  closed_at: string | null
  washlink_has_viewed: boolean
  can_respond: boolean
  can_withdraw: boolean
}

/** `admin_contract_dispute_queue(p_status)` (w11g). */
export interface SupabaseAdminContractDisputeQueueRow {
  dispute_id: string
  contract_id: string
  category: ContractDisputeCategory
  status: ContractDisputeStatus
  revision: number
  raised_by_role: ContractPartyRole
  has_response: boolean
  contract_status: WorkerContractStatus
  effective_status: WorkerContractStatus
  shop_name_snapshot: string | null
  created_at: string
}

/** `admin_contract_dispute_version_document(p_dispute_id, p_version_id)` (w11g). */
export interface SupabaseAdminDisputeVersionDocumentRow {
  rendered_text: string
  content_hash: string
  sealed_at: string
  record_label: string
}

/** The `worker_contract_disputes` row returned by raise / respond / withdraw / close (w11f). */
export interface SupabaseContractDisputeRecordRow {
  id: string
  status: ContractDisputeStatus
  revision: number
}

export function mapMyContractDisputeRow(row: SupabaseMyContractDisputeRow): MyContractDispute {
  return {
    disputeId: row.dispute_id,
    contractId: row.contract_id,
    shopName: row.shop_name,
    counterpartName: row.counterpart_name,
    category: row.category,
    status: row.status,
    isRaisedByMe: row.raised_by_me,
    statement: row.statement,
    responseStatement: row.response_statement,
    resolutionKind: row.resolution_kind,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    closedAt: row.closed_at,
    hasWashLinkViewed: row.washlink_has_viewed,
    canRespond: row.can_respond,
    canWithdraw: row.can_withdraw,
  }
}

export function mapAdminContractDisputeQueueRow(row: SupabaseAdminContractDisputeQueueRow): AdminContractDisputeQueueItem {
  return {
    disputeId: row.dispute_id,
    contractId: row.contract_id,
    category: row.category,
    status: row.status,
    revision: row.revision,
    raisedByRole: row.raised_by_role,
    hasResponse: row.has_response,
    contractStatus: row.contract_status,
    effectiveStatus: row.effective_status,
    shopNameSnapshot: row.shop_name_snapshot,
    createdAt: row.created_at,
  }
}

export function mapAdminDisputeVersionDocumentRow(row: SupabaseAdminDisputeVersionDocumentRow): AdminContractDisputeVersionDocument {
  return { renderedText: row.rendered_text, contentHash: row.content_hash, sealedAt: row.sealed_at, recordLabel: row.record_label }
}

export function mapContractDisputeRecordRow(row: SupabaseContractDisputeRecordRow): ContractDisputeRecord {
  return { disputeId: row.id, status: row.status, revision: row.revision }
}

function mapCaseContract(contractJson: unknown): AdminContractDisputeCaseContract | null {
  if (typeof contractJson !== 'object' || contractJson === null) {
    return null
  }
  const contract = objectOrEmpty(contractJson)
  return {
    status: textOrEmpty(contract.status) as WorkerContractStatus,
    effectiveStatus: textOrEmpty(contract.effective_status) as WorkerContractStatus,
    classificationKey: textOrNull(contract.classification_key),
    startDate: textOrNull(contract.start_date),
    endDate: textOrNull(contract.end_date),
    sentAt: textOrNull(contract.sent_at),
    acceptedAt: textOrNull(contract.accepted_at),
    activatedAt: textOrNull(contract.activated_at),
    endedAt: textOrNull(contract.ended_at),
    endedBy: textOrNull(contract.ended_by) as ContractEndedBy | null,
    endReason: textOrNull(contract.end_reason),
    declineNote: textOrNull(contract.decline_note),
    shopNameSnapshot: textOrNull(contract.shop_name_snapshot),
    ownerNameSnapshot: textOrNull(contract.owner_name_snapshot),
    workerNameSnapshot: textOrNull(contract.worker_name_snapshot),
    isOwnerRemoved: contract.owner_removed === true,
    isShopRemoved: contract.shop_removed === true,
    isWorkerRemoved: contract.worker_removed === true,
  }
}

/** The jsonb of `admin_contract_dispute_case(p_dispute_id)` (w11g). The contract block exists only while open. */
export function mapAdminContractDisputeCase(caseJson: unknown): AdminContractDisputeCase {
  const caseObject = objectOrEmpty(caseJson)
  const dispute = objectOrEmpty(caseObject.dispute)
  const relationship = caseObject.relationship
  const relationshipObject = typeof relationship === 'object' && relationship !== null ? objectOrEmpty(relationship) : null
  return {
    dispute: {
      disputeId: textOrEmpty(dispute.id),
      contractId: textOrEmpty(dispute.contract_id),
      category: textOrEmpty(dispute.category) as ContractDisputeCategory,
      status: textOrEmpty(dispute.status) as ContractDisputeStatus,
      revision: numberOrZero(dispute.revision),
      raisedByRole: textOrEmpty(dispute.raised_by_role) as ContractPartyRole,
      statement: textOrEmpty(dispute.statement),
      contractStatusAtRaise: textOrNull(dispute.contract_status_at_raise),
      responseStatement: textOrNull(dispute.response_statement),
      respondedAt: textOrNull(dispute.responded_at),
      resolutionKind: textOrNull(dispute.resolution_kind) as ContractDisputeResolutionKind | null,
      resolutionNote: textOrNull(dispute.resolution_note),
      createdAt: textOrEmpty(dispute.created_at),
      closedAt: textOrNull(dispute.closed_at),
      withdrawnAt: textOrNull(dispute.withdrawn_at),
      firstViewedByAdminAt: textOrNull(dispute.first_viewed_by_admin_at),
    },
    contract: mapCaseContract(caseObject.contract),
    versions: objectList(caseObject.versions).map((version) => ({
      versionId: textOrEmpty(version.id),
      versionNumber: numberOrZero(version.version_number),
      kind: textOrEmpty(version.kind) as ContractVersionKind,
      state: textOrEmpty(version.state) as ContractVersionState,
      sealedAt: textOrNull(version.sealed_at),
      contentHash: textOrNull(version.content_hash),
      flagCount: numberOrZero(version.flag_count),
    })),
    acceptances: objectList(caseObject.acceptances).map((acceptance) => ({
      partyRole: textOrEmpty(acceptance.party_role) as ContractPartyRole,
      versionNumber: numberOrZero(acceptance.version_number),
      acceptedAt: textOrEmpty(acceptance.accepted_at),
      versionContentHash: textOrEmpty(acceptance.version_content_hash),
      recordLabel: textOrEmpty(acceptance.record_label),
    })),
    relationship:
      relationshipObject === null
        ? null
        : { status: textOrEmpty(relationshipObject.status), statusReason: textOrEmpty(relationshipObject.status_reason) },
  }
}
