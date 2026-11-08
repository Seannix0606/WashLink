import { useCallback } from 'react'
import type { WorkerContractRecordReader } from '../../application/services/WorkerContractRecordReads'
import type { ContractAcceptanceRecord, ContractVersionSummary } from '../../domain/models/WorkerContract'
import { useLatestResource, type UseLatestResourceResult } from './useLatestResource'

export interface WorkerContractHistory {
  readonly versions: readonly ContractVersionSummary[]
  readonly acceptances: readonly ContractAcceptanceRecord[]
}

const noHistory: WorkerContractHistory = { versions: [], acceptances: [] }

/**
 * Every version of one contract (newest first) and its acceptance records. `contractRevision`
 * is part of the load identity, so the history re-reads whenever the contract changes.
 */
export function useWorkerContractVersionHistory(
  recordReader: WorkerContractRecordReader,
  contractId: string,
  contractRevision: number,
): UseLatestResourceResult<WorkerContractHistory> {
  const loadHistory = useCallback(async (): Promise<WorkerContractHistory> => {
    const [versions, acceptances] = await Promise.all([recordReader.listVersions(contractId), recordReader.listAcceptances(contractId)])
    return { versions, acceptances }
    // contractRevision only re-creates the loader (re-read after a change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordReader, contractId, contractRevision])
  return useLatestResource({ load: loadHistory, initialResource: noHistory, loadFailedMessage: 'Could not load the contract versions.' })
}
