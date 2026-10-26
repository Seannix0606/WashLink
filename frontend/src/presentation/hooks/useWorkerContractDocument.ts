import { useCallback } from 'react'
import type { WorkerContractRecordReader } from '../../application/services/WorkerContractRecordReads'
import type {
  ContractClauseComparison,
  ContractFlagNotices,
  ContractProblemTermFlag,
  ContractVersionChange,
  ContractVersionDocument,
} from '../../domain/models/WorkerContract'
import { useLatestResource, type UseLatestResourceResult } from './useLatestResource'

export interface WorkerContractDocumentBundle {
  /** null when the version is not sealed or not readable. */
  readonly document: ContractVersionDocument | null
  readonly flags: readonly ContractProblemTermFlag[]
  readonly clauses: readonly ContractClauseComparison[]
  /** Amendments only: what changes compared with the version in force. */
  readonly changes: readonly ContractVersionChange[]
  readonly notices: ContractFlagNotices | null
}

const noBundle: WorkerContractDocumentBundle = { document: null, flags: [], clauses: [], changes: [], notices: null }

/** One sealed version: its stored text and hash, keyword flags, comparison with the standard and changes. */
export function useWorkerContractDocument(
  recordReader: WorkerContractRecordReader,
  versionId: string,
): UseLatestResourceResult<WorkerContractDocumentBundle> {
  const loadDocument = useCallback(async (): Promise<WorkerContractDocumentBundle> => {
    const [document, flags, clauses, changes, notices] = await Promise.all([
      recordReader.fetchVersionDocument(versionId),
      recordReader.listVersionFlags(versionId),
      recordReader.listVersionClauses(versionId),
      recordReader.listVersionChanges(versionId),
      recordReader.fetchFlagNotices().catch((): null => null),
    ])
    return { document, flags, clauses, changes, notices }
  }, [recordReader, versionId])
  return useLatestResource({ load: loadDocument, initialResource: noBundle, loadFailedMessage: 'Could not load the contract text.' })
}
