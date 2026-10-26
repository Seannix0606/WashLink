import type { ShopSpecificTermInput } from './ContractTemplate'
import type { ContractOwnerValues } from './WorkerContract'

/** Arguments of the W9 write RPCs (w9f, w9g). None carries a party id, a label, a name or a computed hash. */

export interface CreateWorkerContractDraftInput {
  readonly shopId: string
  readonly workerId: string
  readonly templateVersionId: string
  /** Required; there is no default (D-26). */
  readonly classificationKey: string
  readonly startDate: string
  readonly endDate: string | null
  readonly ownerValues: ContractOwnerValues
}

export interface SaveWorkerContractDraftInput {
  readonly contractId: string
  readonly expectedDraftRevision: number
  readonly classificationKey: string
  readonly startDate: string
  readonly endDate: string | null
  readonly ownerValues: ContractOwnerValues
  /** The FULL set of contract-level edits (editable clause keys only). */
  readonly editableBodies: Readonly<Record<string, string>>
  /** The FULL shop-term list. */
  readonly shopTerms: readonly ShopSpecificTermInput[]
}

export interface SendWorkerContractVersionInput {
  readonly contractId: string
  readonly expectedDraftRevision: number
  readonly contractorAcknowledgementKey: string | null
  /** = preview flag_count the owner saw. */
  readonly acknowledgedFlagCount: number
}

export interface AcceptWorkerContractVersionInput {
  readonly contractId: string
  readonly versionId: string
  /** The hash of the document the worker read (from worker_contract_version_document). */
  readonly contentHash: string
  readonly contractorAcknowledgementKey: string | null
}
