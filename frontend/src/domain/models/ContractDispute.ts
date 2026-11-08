import type { ContractEndedBy, ContractPartyRole, ContractVersionKind, ContractVersionState, WorkerContractStatus } from './WorkerContract'

/**
 * W11 reported contract problems (P69, P70, D-47). Either party reports; the other party answers
 * once; a platform administrator reads the contract only while the problem is open and closes it
 * with a note. A reported problem never changes the contract: WashLink is not a party to it.
 */

export const contractDisputeCategories = [
  'owner_ended_contract',
  'worker_ended_contract',
  'contract_terms',
  'amendment',
  'acceptance_record',
  'other',
] as const

export type ContractDisputeCategory = (typeof contractDisputeCategories)[number]

export type ContractDisputeStatus = 'open' | 'closed' | 'withdrawn'

export const contractDisputeResolutionKinds = ['information_shared', 'referred_outside_washlink', 'no_platform_action'] as const

export type ContractDisputeResolutionKind = (typeof contractDisputeResolutionKinds)[number]

/** Mirrors the W11 CHECKs and RPC rules (w11e, w11f). The database stays the authority. */
export const contractDisputeLimits = {
  statementMinLength: 20,
  statementMaxLength: 1000,
  noteMinLength: 20,
  noteMaxLength: 1000,
  /** Days after a contract ends during which a problem can still be reported. */
  reportWindowDays: 90,
  maximumPerParty: 3,
} as const

/** `my_contract_disputes()` (w11g). Never carries an administrator id or name. */
export interface MyContractDispute {
  readonly disputeId: string
  readonly contractId: string
  readonly shopName: string | null
  readonly counterpartName: string | null
  readonly category: ContractDisputeCategory
  readonly status: ContractDisputeStatus
  readonly isRaisedByMe: boolean
  readonly statement: string
  readonly responseStatement: string | null
  readonly resolutionKind: ContractDisputeResolutionKind | null
  readonly resolutionNote: string | null
  readonly createdAt: string
  readonly respondedAt: string | null
  readonly closedAt: string | null
  readonly hasWashLinkViewed: boolean
  readonly canRespond: boolean
  readonly canWithdraw: boolean
}

/** `admin_contract_dispute_queue(p_status)` (w11g). */
export interface AdminContractDisputeQueueItem {
  readonly disputeId: string
  readonly contractId: string
  readonly category: ContractDisputeCategory
  readonly status: ContractDisputeStatus
  readonly revision: number
  readonly raisedByRole: ContractPartyRole
  readonly hasResponse: boolean
  readonly contractStatus: WorkerContractStatus
  readonly effectiveStatus: WorkerContractStatus
  readonly shopNameSnapshot: string | null
  readonly createdAt: string
}

export interface AdminContractDisputeCaseDispute {
  readonly disputeId: string
  readonly contractId: string
  readonly category: ContractDisputeCategory
  readonly status: ContractDisputeStatus
  readonly revision: number
  readonly raisedByRole: ContractPartyRole
  readonly statement: string
  readonly contractStatusAtRaise: string | null
  readonly responseStatement: string | null
  readonly respondedAt: string | null
  readonly resolutionKind: ContractDisputeResolutionKind | null
  readonly resolutionNote: string | null
  readonly createdAt: string
  readonly closedAt: string | null
  readonly withdrawnAt: string | null
  readonly firstViewedByAdminAt: string | null
}

export interface AdminContractDisputeCaseContract {
  readonly status: WorkerContractStatus
  readonly effectiveStatus: WorkerContractStatus
  readonly classificationKey: string | null
  readonly startDate: string | null
  readonly endDate: string | null
  readonly sentAt: string | null
  readonly acceptedAt: string | null
  readonly activatedAt: string | null
  readonly endedAt: string | null
  readonly endedBy: ContractEndedBy | null
  readonly endReason: string | null
  readonly declineNote: string | null
  readonly shopNameSnapshot: string | null
  readonly ownerNameSnapshot: string | null
  readonly workerNameSnapshot: string | null
  readonly isOwnerRemoved: boolean
  readonly isShopRemoved: boolean
  readonly isWorkerRemoved: boolean
}

export interface AdminContractDisputeCaseVersion {
  readonly versionId: string
  readonly versionNumber: number
  readonly kind: ContractVersionKind
  readonly state: ContractVersionState
  readonly sealedAt: string | null
  readonly contentHash: string | null
  readonly flagCount: number
}

export interface AdminContractDisputeCaseAcceptance {
  readonly partyRole: ContractPartyRole
  readonly versionNumber: number
  readonly acceptedAt: string
  readonly versionContentHash: string
  readonly recordLabel: string
}

/** Live (worker, owner) relationship status only: never a count, remaining, goal or other owner. */
export interface AdminContractDisputeCaseRelationship {
  readonly status: string
  readonly statusReason: string
}

/**
 * `admin_contract_dispute_case(p_dispute_id)` (w11g). Every read is audited by the database.
 * `contract` is null (and the lists empty) once the problem is closed or withdrawn.
 */
export interface AdminContractDisputeCase {
  readonly dispute: AdminContractDisputeCaseDispute
  readonly contract: AdminContractDisputeCaseContract | null
  readonly versions: readonly AdminContractDisputeCaseVersion[]
  readonly acceptances: readonly AdminContractDisputeCaseAcceptance[]
  readonly relationship: AdminContractDisputeCaseRelationship | null
}

/** `admin_contract_dispute_version_document(p_dispute_id, p_version_id)` (w11g). */
export interface AdminContractDisputeVersionDocument {
  readonly renderedText: string
  readonly contentHash: string
  readonly sealedAt: string
  readonly recordLabel: string
}

/** The row the raise / respond / withdraw / close RPCs return. */
export interface ContractDisputeRecord {
  readonly disputeId: string
  readonly status: ContractDisputeStatus
  readonly revision: number
}

export interface RaiseContractDisputeInput {
  readonly contractId: string
  readonly category: ContractDisputeCategory
  readonly statement: string
}

export interface CloseContractDisputeInput {
  readonly disputeId: string
  readonly expectedRevision: number
  readonly resolutionKind: ContractDisputeResolutionKind
  readonly resolutionNote: string
}

/** Database message (55000) when the close was based on an older dispute. */
export const staleContractDisputeMessage = 'This reported problem changed. Refresh and try again.'

/** The facts of a contract a party needs to know which problem categories fit (mirrors raise_contract_dispute). */
export interface DisputableContractFacts {
  readonly sentAt: string | null
  readonly endedAt: string | null
  readonly endedBy: ContractEndedBy | null
  readonly endDate: string | null
  readonly effectiveStatus: WorkerContractStatus
}

const endedStatuses: readonly WorkerContractStatus[] = ['declined', 'withdrawn', 'expired', 'terminated']

/** The categories a party may choose: the "ended" category only for the other party's ending. */
export function contractDisputeCategoriesFor(raiserRole: ContractPartyRole, endedBy: ContractEndedBy | null): readonly ContractDisputeCategory[] {
  return contractDisputeCategories.filter((category) => {
    if (category === 'owner_ended_contract') {
      return raiserRole === 'worker' && endedBy === 'owner'
    }
    if (category === 'worker_ended_contract') {
      return raiserRole === 'owner' && endedBy === 'worker'
    }
    return true
  })
}

const dayMilliseconds = 86_400_000

/** When the contract ended, as raise_contract_dispute derives it (null while it has not ended). */
export function contractEndedInstant(facts: DisputableContractFacts): Date | null {
  if (facts.endedAt !== null && endedStatuses.includes(facts.effectiveStatus)) {
    return new Date(facts.endedAt)
  }
  if (facts.effectiveStatus === 'expired' && facts.endDate !== null) {
    // The day after the end date, at Manila midnight (UTC+8, no daylight saving).
    return new Date(Date.parse(`${facts.endDate}T00:00:00+08:00`) + dayMilliseconds)
  }
  return null
}

/** A hint only (the database re-checks): sent, and not ended more than 90 days ago. */
export function canReportContractProblem(facts: DisputableContractFacts, currentInstant: Date): boolean {
  if (facts.sentAt === null) {
    return false
  }
  const endedInstant = contractEndedInstant(facts)
  return endedInstant === null || currentInstant.getTime() <= endedInstant.getTime() + contractDisputeLimits.reportWindowDays * dayMilliseconds
}
