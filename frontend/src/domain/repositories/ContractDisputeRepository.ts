import type {
  AdminContractDisputeCase,
  AdminContractDisputeQueueItem,
  AdminContractDisputeVersionDocument,
  CloseContractDisputeInput,
  ContractDisputeRecord,
  ContractDisputeStatus,
  MyContractDispute,
  RaiseContractDisputeInput,
} from '../models/ContractDispute'

/** W11 reported contract problems: RPCs only. None of them can change a contract. */
export interface ContractDisputeRepository {
  listMyDisputes(): Promise<MyContractDispute[]>
  raise(input: RaiseContractDisputeInput): Promise<ContractDisputeRecord>
  respond(disputeId: string, statement: string): Promise<ContractDisputeRecord>
  withdraw(disputeId: string): Promise<ContractDisputeRecord>
  listAdminQueue(status: ContractDisputeStatus): Promise<AdminContractDisputeQueueItem[]>
  /** Audited by the database on every call; never polled. */
  fetchAdminCase(disputeId: string): Promise<AdminContractDisputeCase>
  /** Null unless the problem is open and the version is a sealed version of that contract. Audited. */
  fetchAdminVersionDocument(disputeId: string, versionId: string): Promise<AdminContractDisputeVersionDocument | null>
  close(input: CloseContractDisputeInput): Promise<ContractDisputeRecord>
}
