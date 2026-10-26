import type { ContractClauseKind, ShopSpecificTermInput } from './ContractTemplate'
import type { JobApplicationOpeningSnapshot } from './JobApplication'

export type {
  AcceptWorkerContractVersionInput,
  CreateWorkerContractDraftInput,
  SaveWorkerContractDraftInput,
  SendWorkerContractVersionInput,
} from './WorkerContractInputs'

/**
 * W9 worker contracts. Every write is an RPC; sealed versions, their text, hash, clauses,
 * flags and acceptance records never change. The client never sends a hash it computed,
 * an acceptance, a party name, a label or a default relationship type (D-26).
 */

export type WorkerContractStatus =
  | 'draft'
  | 'sent_for_review'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'active'
  | 'expired'
  | 'terminated'

export type WorkerContractOrigin = 'accepted_application' | 'completed_training'

export type ContractVersionKind = 'initial' | 'amendment'

export type ContractVersionState = 'draft' | 'sent_for_review' | 'accepted' | 'declined' | 'withdrawn' | 'superseded'

export type ContractEndedBy = 'worker' | 'owner' | 'system' | 'trusted_session'

export type ContractPartyRole = 'owner' | 'worker'

/** allowed_actions of owner_worker_contracts() (w9h): hints only, every RPC re-checks. */
export type OwnerContractAction =
  | 'save_draft'
  | 'send'
  | 'discard'
  | 'withdraw'
  | 'withdraw_amendment'
  | 'activate'
  | 'amend'
  | 'terminate'

/** allowed_actions of my_worker_contracts() (w9h). */
export type WorkerContractAction = 'accept' | 'accept_amendment' | 'decline' | 'decline_amendment' | 'terminate'

export type ContractClauseChangeKind = 'unchanged' | 'edited' | 'added_by_shop'

export type ContractEditedIn = 'template' | 'contract'

export type ContractAmendmentClauseChange = 'unchanged' | 'changed' | 'added'

export type ContractVersionChangeKind =
  | 'clause_changed'
  | 'clause_added'
  | 'clause_removed'
  | 'classification_changed'
  | 'dates_changed'
  | 'contract_detail_changed'

export type ContractOwnerValueKey = 'role_title' | 'schedule_summary' | 'pay_details'

/** Owner-typed contract details, shown verbatim; WashLink never fills in pay. */
export type ContractOwnerValues = Readonly<Partial<Record<ContractOwnerValueKey, string>>>

interface WorkerContractSummaryBase {
  readonly contractId: string
  readonly status: WorkerContractStatus
  /** accepted / active with an end date before Manila today read as expired (until W12 expires them). */
  readonly effectiveStatus: WorkerContractStatus
  readonly revision: number
  readonly origin: WorkerContractOrigin
  readonly shopId: string | null
  readonly shopName: string | null
  readonly currentVersionId: string | null
  readonly currentVersionNumber: number | null
  readonly pendingVersionId: string | null
  readonly pendingVersionNumber: number | null
  readonly pendingVersionKind: ContractVersionKind | null
  readonly startDate: string | null
  readonly endDate: string | null
  readonly sentAt: string | null
  readonly acceptedAt: string | null
  readonly activatedAt: string | null
  readonly endedAt: string | null
  readonly endedBy: ContractEndedBy | null
  readonly endReason: string | null
  readonly declineNote: string | null
  readonly isOwnerRemoved: boolean
  readonly isShopRemoved: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

/** Row of owner_worker_contracts() (w9h). */
export interface OwnerWorkerContract extends WorkerContractSummaryBase {
  readonly workerId: string | null
  readonly workerName: string | null
  readonly draftVersionId: string | null
  readonly draftVersionNumber: number | null
  readonly draftRevision: number | null
  readonly isWorkerRemoved: boolean
  readonly allowedActions: readonly OwnerContractAction[]
}

/** Row of my_worker_contracts() (w9h): sent contracts only. */
export interface MyWorkerContract extends WorkerContractSummaryBase {
  readonly ownerName: string | null
  readonly allowedActions: readonly WorkerContractAction[]
}

/** Row of owner_contract_eligible_workers() (w9h): names only, never contacts. */
export interface ContractEligibleWorker {
  readonly workerId: string
  readonly displayName: string
  readonly shopId: string
  readonly shopName: string
  readonly origin: WorkerContractOrigin
  readonly hasOpenContract: boolean
}

/** worker_classification_options (w8b): ordered by sortOrder, none preselected. */
export interface WorkerClassificationOption {
  readonly classificationKey: string
  readonly label: string
  readonly sortOrder: number
  readonly needsExtraAcknowledgement: boolean
}

/** contract_acknowledgement_texts (w9b). */
export interface ContractAcknowledgementText {
  readonly ackKey: string
  readonly statementText: string
}

/** worker_contract_flag_notices() (w9h). */
export interface ContractFlagNotices {
  readonly disclaimer: string
  readonly noMatchText: string
}

/** The open draft version (contract_versions row, owner RLS): the editor's inputs. */
export interface ContractDraftVersion {
  readonly versionId: string
  readonly contractId: string
  readonly versionNumber: number
  readonly kind: ContractVersionKind
  readonly draftRevision: number
  readonly classificationKey: string
  readonly startDate: string
  readonly endDate: string | null
  readonly ownerValues: ContractOwnerValues
  /** Contract-level edits only (clause key to body); the template text applies to the rest. */
  readonly editableBodies: Readonly<Record<string, string>>
  readonly shopTerms: readonly ShopSpecificTermInput[]
  readonly templateVersionId: string | null
  readonly basePlatformVersionId: string
}

/** A keyword flag (live in the preview, stored at seal). It informs; it never validates. */
export interface ContractProblemTermFlag {
  readonly sectionNumber: number | null
  readonly position: number | null
  readonly valueKey: string | null
  readonly ruleKey: string
  readonly category: string
  readonly label: string
  readonly guidance: string
  readonly excerpt: string
}

/** One clause with its standard counterpart (sealed clauses and the draft preview). */
export interface ContractClauseComparison {
  readonly sectionNumber: number
  readonly sectionTitle: string
  readonly reviewNotice: string
  readonly position: number
  readonly clauseKey: string | null
  readonly kind: ContractClauseKind
  readonly heading: string
  readonly body: string
  readonly standardHeading: string | null
  readonly standardBody: string | null
  readonly change: ContractClauseChangeKind
  readonly editedIn: ContractEditedIn | null
}

export interface ContractPreviewClause extends ContractClauseComparison {
  readonly needsInput: boolean
  readonly amendmentChange: ContractAmendmentClauseChange | null
}

/** preview_worker_contract_draft() (w9h, owner only). */
export interface ContractDraftPreview {
  readonly versionId: string
  readonly versionNumber: number
  readonly kind: ContractVersionKind
  readonly draftRevision: number
  /** The count the owner acknowledges at send. */
  readonly flagCount: number
  readonly unfilled: readonly string[]
  readonly clauses: readonly ContractPreviewClause[]
  readonly flags: readonly ContractProblemTermFlag[]
}

/** Row of worker_contract_versions() (w9h), newest first. */
export interface ContractVersionSummary {
  readonly versionId: string
  readonly versionNumber: number
  readonly kind: ContractVersionKind
  readonly state: ContractVersionState
  readonly classificationKey: string
  readonly classificationLabel: string
  readonly startDate: string
  readonly endDate: string | null
  readonly contentHash: string | null
  readonly flagCount: number | null
  readonly sealedAt: string | null
  readonly sentAt: string | null
  readonly respondedAt: string | null
  readonly declineNote: string | null
  readonly templateName: string | null
  readonly templateVersionNumber: number | null
  readonly basePlatformVersionNumber: number
  readonly draftRevision: number
  readonly isCurrent: boolean
  readonly isPending: boolean
  readonly createdAt: string
}

/** worker_contract_version_document() (w9h): the sealed text exactly as stored. */
export interface ContractVersionDocument {
  readonly contractId: string
  readonly versionId: string
  readonly versionNumber: number
  readonly kind: ContractVersionKind
  readonly state: ContractVersionState
  readonly renderedText: string
  readonly contentHash: string
  readonly sealedAt: string
  readonly recordLabel: string
}

/** Row of worker_contract_version_changes() (w9h) vs the version an amendment amends. */
export interface ContractVersionChange {
  readonly changeKind: ContractVersionChangeKind
  readonly sectionNumber: number | null
  readonly itemKey: string | null
  readonly heading: string | null
  readonly previousText: string | null
  readonly newText: string | null
}

/** Row of worker_contract_acceptances() (w9h): a recorded acceptance, not an e-signature. */
export interface ContractAcceptanceRecord {
  readonly versionId: string
  readonly versionNumber: number
  readonly versionContentHash: string
  readonly partyRole: ContractPartyRole
  readonly partyName: string | null
  readonly statementKey: string
  readonly statementText: string
  readonly contractorAckKey: string | null
  readonly contractorAckText: string | null
  readonly acceptedAt: string
  readonly recordLabel: string
}

/** Row of my_retained_application_records() (w9i): kept after a shop or owner left WashLink. */
export interface RetainedApplicationRecord {
  readonly recordId: string
  readonly applicationId: string
  readonly openingSnapshot: JobApplicationOpeningSnapshot | null
  readonly status: string
  readonly submittedAt: string | null
  readonly decidedAt: string | null
  readonly removedAt: string
  readonly removalReason: string
}

/** worker_contracts row returned by the contract RPCs. */
export interface WorkerContractRecord {
  readonly contractId: string
  readonly status: WorkerContractStatus
  readonly revision: number
}

/** contract_versions row returned by the version RPCs. */
export interface ContractVersionRecord {
  readonly versionId: string
  readonly contractId: string
  readonly versionNumber: number
  readonly kind: ContractVersionKind
  readonly state: ContractVersionState
  readonly draftRevision: number
  readonly contentHash: string | null
  readonly flagCount: number | null
}

/** Mirrors the W9 CHECKs and RPC limits; the database stays the authority. */
export const workerContractLimits = {
  roleTitleMinLength: 3,
  roleTitleMaxLength: 120,
  scheduleSummaryMinLength: 3,
  scheduleSummaryMaxLength: 500,
  payDetailsMinLength: 3,
  payDetailsMaxLength: 1000,
  declineNoteMaxLength: 500,
  terminationReasonMinLength: 10,
  terminationReasonMaxLength: 500,
} as const

export const ownerValueKeys: readonly ContractOwnerValueKey[] = ['role_title', 'schedule_summary', 'pay_details']

/** Statement keys (contract_acknowledgement_texts); their texts are always read from the server. */
export const contractStatementKeys = {
  ownerSend: 'w9_owner_send_v1',
  workerAccept: 'w9_worker_accept_v1',
  contractorOwner: 'w9_contractor_owner_v1',
  contractorWorker: 'w9_contractor_worker_v1',
} as const

export const staleContractMessage = 'This contract changed. Reload it and try again.'

export const staleContractAcceptMessage = 'This contract changed. Read the new version before you accept.'

export const changedFlagCountMessage = 'The keyword check changed. Review the flags again.'

export const contractNotFoundMessage = 'Contract not found.'
