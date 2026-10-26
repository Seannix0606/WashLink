import type { ShopSpecificTermInput } from '../../domain/models/ContractTemplate'
import type {
  ContractDraftVersion,
  ContractEligibleWorker,
  ContractEndedBy,
  ContractOwnerValueKey,
  ContractOwnerValues,
  ContractVersionKind,
  ContractVersionState,
  MyWorkerContract,
  OwnerContractAction,
  OwnerWorkerContract,
  RetainedApplicationRecord,
  WorkerContractAction,
  WorkerContractOrigin,
  WorkerContractRecord,
  WorkerContractStatus,
} from '../../domain/models/WorkerContract'
import { ownerValueKeys } from '../../domain/models/WorkerContract'
import { mapOpeningSnapshot, type SupabaseJobApplicationSnapshotJson } from './supabaseJobApplicationRow'

/** Columns shared by owner_worker_contracts() and my_worker_contracts() (w9h). */
interface SupabaseContractSummaryRow {
  contract_id: string
  status: WorkerContractStatus
  effective_status: WorkerContractStatus
  revision: number
  origin: WorkerContractOrigin
  shop_id: string | null
  shop_name: string | null
  current_version_id: string | null
  current_version_number: number | null
  pending_version_id: string | null
  pending_version_number: number | null
  pending_version_kind: ContractVersionKind | null
  start_date: string | null
  end_date: string | null
  sent_at: string | null
  accepted_at: string | null
  activated_at: string | null
  ended_at: string | null
  ended_by: ContractEndedBy | null
  end_reason: string | null
  decline_note: string | null
  owner_removed: boolean
  shop_removed: boolean
  created_at: string
  updated_at: string
}

export interface SupabaseOwnerWorkerContractRow extends SupabaseContractSummaryRow {
  worker_id: string | null
  worker_name: string | null
  draft_version_id: string | null
  draft_version_number: number | null
  draft_revision: number | null
  worker_removed: boolean
  allowed_actions: OwnerContractAction[] | null
}

export interface SupabaseMyWorkerContractRow extends SupabaseContractSummaryRow {
  owner_name: string | null
  allowed_actions: WorkerContractAction[] | null
}

function mapSummary(row: SupabaseContractSummaryRow): Omit<OwnerWorkerContract, 'workerId' | 'workerName' | 'draftVersionId' | 'draftVersionNumber' | 'draftRevision' | 'isWorkerRemoved' | 'allowedActions'> {
  return {
    contractId: row.contract_id,
    status: row.status,
    effectiveStatus: row.effective_status,
    revision: row.revision,
    origin: row.origin,
    shopId: row.shop_id,
    shopName: row.shop_name,
    currentVersionId: row.current_version_id,
    currentVersionNumber: row.current_version_number,
    pendingVersionId: row.pending_version_id,
    pendingVersionNumber: row.pending_version_number,
    pendingVersionKind: row.pending_version_kind,
    startDate: row.start_date,
    endDate: row.end_date,
    sentAt: row.sent_at,
    acceptedAt: row.accepted_at,
    activatedAt: row.activated_at,
    endedAt: row.ended_at,
    endedBy: row.ended_by,
    endReason: row.end_reason,
    declineNote: row.decline_note,
    isOwnerRemoved: row.owner_removed,
    isShopRemoved: row.shop_removed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapOwnerWorkerContractRow(row: SupabaseOwnerWorkerContractRow): OwnerWorkerContract {
  return {
    ...mapSummary(row),
    workerId: row.worker_id,
    workerName: row.worker_name,
    draftVersionId: row.draft_version_id,
    draftVersionNumber: row.draft_version_number,
    draftRevision: row.draft_revision,
    isWorkerRemoved: row.worker_removed,
    allowedActions: row.allowed_actions ?? [],
  }
}

export function mapMyWorkerContractRow(row: SupabaseMyWorkerContractRow): MyWorkerContract {
  return { ...mapSummary(row), ownerName: row.owner_name, allowedActions: row.allowed_actions ?? [] }
}

export interface SupabaseContractEligibleWorkerRow {
  worker_id: string
  display_name: string
  shop_id: string
  shop_name: string
  origin: WorkerContractOrigin
  has_open_contract: boolean
}

export function mapContractEligibleWorkerRow(row: SupabaseContractEligibleWorkerRow): ContractEligibleWorker {
  return {
    workerId: row.worker_id,
    displayName: row.display_name,
    shopId: row.shop_id,
    shopName: row.shop_name,
    origin: row.origin,
    hasOpenContract: row.has_open_contract,
  }
}

export const classificationOptionSelectColumns = 'classification_key, label, sort_order, needs_extra_acknowledgement'
export const acknowledgementTextSelectColumns = 'ack_key, statement_text'
/** Explicit columns of the owner's open draft version (never the sealed text, hash or txids). */
export const draftVersionSelectColumns = [
  'id', 'contract_id', 'version_number', 'kind', 'state', 'draft_revision', 'classification_key', 'start_date', 'end_date',
  'owner_values', 'editable_bodies', 'shop_terms', 'template_version_id', 'base_platform_version_id',
].join(', ')

export interface SupabaseDraftVersionRow {
  id: string
  contract_id: string
  version_number: number
  kind: ContractVersionKind
  state: ContractVersionState
  draft_revision: number
  classification_key: string
  start_date: string
  end_date: string | null
  owner_values: Record<string, unknown> | null
  editable_bodies: Record<string, unknown> | null
  shop_terms: { section_number: number; heading: string; body: string }[] | null
  template_version_id: string | null
  base_platform_version_id: string
}

function stringEntries(jsonObject: Record<string, unknown> | null): [string, string][] {
  return Object.entries(jsonObject ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
}

function mapOwnerValues(jsonObject: Record<string, unknown> | null): ContractOwnerValues {
  const ownerValues: Partial<Record<ContractOwnerValueKey, string>> = {}
  for (const [valueKey, value] of stringEntries(jsonObject)) {
    if ((ownerValueKeys as readonly string[]).includes(valueKey)) {
      ownerValues[valueKey as ContractOwnerValueKey] = value
    }
  }
  return ownerValues
}

export function mapDraftVersionRow(row: SupabaseDraftVersionRow): ContractDraftVersion {
  const shopTerms: ShopSpecificTermInput[] = (row.shop_terms ?? []).map((shopTerm) => ({
    sectionNumber: shopTerm.section_number,
    heading: shopTerm.heading,
    body: shopTerm.body,
  }))
  return {
    versionId: row.id,
    contractId: row.contract_id,
    versionNumber: row.version_number,
    kind: row.kind,
    draftRevision: row.draft_revision,
    classificationKey: row.classification_key,
    startDate: row.start_date,
    endDate: row.end_date,
    ownerValues: mapOwnerValues(row.owner_values),
    editableBodies: Object.fromEntries(stringEntries(row.editable_bodies)),
    shopTerms,
    templateVersionId: row.template_version_id,
    basePlatformVersionId: row.base_platform_version_id,
  }
}

export interface SupabaseRetainedApplicationRow {
  record_id: string
  application_id: string
  opening_snapshot: SupabaseJobApplicationSnapshotJson | null
  status: string
  submitted_at: string | null
  decided_at: string | null
  removed_at: string
  removal_reason: string
}

export function mapRetainedApplicationRow(row: SupabaseRetainedApplicationRow): RetainedApplicationRecord {
  return {
    recordId: row.record_id,
    applicationId: row.application_id,
    openingSnapshot: mapOpeningSnapshot(row.opening_snapshot),
    status: row.status,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    removedAt: row.removed_at,
    removalReason: row.removal_reason,
  }
}

/** worker_contracts row returned by the contract RPCs (w9f, w9g). */
export interface SupabaseWorkerContractRecordRow {
  id: string
  status: WorkerContractStatus
  revision: number
}

export function mapWorkerContractRecordRow(row: SupabaseWorkerContractRecordRow): WorkerContractRecord {
  return { contractId: row.id, status: row.status, revision: row.revision }
}

export const workerContractNoRowMessage = 'This contract changed or is no longer available. Reload it and try again.'
