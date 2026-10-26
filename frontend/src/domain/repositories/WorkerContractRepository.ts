import type {
  AcceptWorkerContractVersionInput,
  ContractAcceptanceRecord,
  ContractAcknowledgementText,
  ContractDraftPreview,
  ContractDraftVersion,
  ContractEligibleWorker,
  ContractFlagNotices,
  ContractClauseComparison,
  ContractProblemTermFlag,
  ContractVersionChange,
  ContractVersionDocument,
  ContractVersionRecord,
  ContractVersionSummary,
  CreateWorkerContractDraftInput,
  MyWorkerContract,
  OwnerWorkerContract,
  RetainedApplicationRecord,
  SaveWorkerContractDraftInput,
  SendWorkerContractVersionInput,
  WorkerClassificationOption,
  WorkerContractRecord,
} from '../models/WorkerContract'

/**
 * Worker contract reads (SECURITY INVOKER RPCs, plus select-only reference tables and the
 * owner's own draft row under RLS). A foreign or unknown id returns no rows.
 */
export interface WorkerContractRepository {
  listOwnerContracts(): Promise<OwnerWorkerContract[]>
  listMyContracts(): Promise<MyWorkerContract[]>
  listEligibleWorkers(): Promise<ContractEligibleWorker[]>
  listClassificationOptions(): Promise<WorkerClassificationOption[]>
  listAcknowledgementTexts(): Promise<ContractAcknowledgementText[]>
  fetchFlagNotices(): Promise<ContractFlagNotices | null>
  /** The open draft version row; null when it is not readable or no longer a draft. */
  fetchDraftVersion(versionId: string): Promise<ContractDraftVersion | null>
  previewDraft(contractId: string): Promise<ContractDraftPreview | null>
  listVersions(contractId: string): Promise<ContractVersionSummary[]>
  fetchVersionDocument(versionId: string): Promise<ContractVersionDocument | null>
  listVersionClauses(versionId: string): Promise<ContractClauseComparison[]>
  listVersionFlags(versionId: string): Promise<ContractProblemTermFlag[]>
  listVersionChanges(versionId: string): Promise<ContractVersionChange[]>
  listAcceptances(contractId: string): Promise<ContractAcceptanceRecord[]>
  listRetainedApplicationRecords(): Promise<RetainedApplicationRecord[]>
}

/**
 * Every contract write is an RPC. No argument carries a party id the caller could forge,
 * a hash the client computed, an acceptance row, a label or a name.
 */
export interface WorkerContractActionRepository {
  createDraft(createInput: CreateWorkerContractDraftInput): Promise<WorkerContractRecord>
  saveDraft(saveInput: SaveWorkerContractDraftInput): Promise<ContractVersionRecord>
  sendVersion(sendInput: SendWorkerContractVersionInput): Promise<ContractVersionRecord>
  withdrawVersion(contractId: string, versionId: string): Promise<WorkerContractRecord>
  discardDraft(contractId: string, versionId: string): Promise<boolean>
  createAmendment(contractId: string, expectedRevision: number): Promise<ContractVersionRecord>
  activate(contractId: string, expectedRevision: number): Promise<WorkerContractRecord>
  acceptVersion(acceptInput: AcceptWorkerContractVersionInput): Promise<WorkerContractRecord>
  declineVersion(contractId: string, versionId: string, note: string | null): Promise<WorkerContractRecord>
  terminate(contractId: string, expectedRevision: number, reason: string): Promise<WorkerContractRecord>
}
