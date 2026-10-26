import type { ReactElement, ReactNode } from 'react'
import { useState } from 'react'
import { FileText } from 'lucide-react'
import type { WorkerContractRecordReader } from '../../../application/services/WorkerContractRecordReads'
import type { ContractVersionDocument } from '../../../domain/models/WorkerContract'
import { EmptyState, Skeleton, Tabs } from '../../design/ui'
import { useWorkerContractDocument } from '../../hooks/useWorkerContractDocument'
import { documentUnavailableText } from '../../utilities/workerContractCopy'
import { describeFlagCount, type ContractViewerRole } from '../../utilities/workerContractDisplay'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'
import { ContractAmendmentChanges } from './ContractAmendmentChanges'
import { ContractDiffWithStandard } from './ContractDiffWithStandard'
import { ContractDocumentView } from './ContractDocumentView'
import { ContractProblemTermFlags } from './ContractProblemTermFlags'

type RecordTab = 'text' | 'flags' | 'compare' | 'changes'

interface ContractVersionRecordViewProps {
  readonly recordReader: WorkerContractRecordReader
  readonly versionId: string
  readonly viewerRole: ContractViewerRole
  readonly isAmendment: boolean
  /** Actions that need the loaded document (for example Accept, which sends its stored hash). */
  readonly renderActions?: (contractDocument: ContractVersionDocument) => ReactNode
}

/** One sealed version for either party: stored text, keyword check, comparison and (amendments) changes. */
export function ContractVersionRecordView({
  recordReader,
  versionId,
  viewerRole,
  isAmendment,
  renderActions,
}: ContractVersionRecordViewProps): ReactElement {
  const record = useWorkerContractDocument(recordReader, versionId)
  const [activeTab, setActiveTab] = useState<RecordTab>(isAmendment ? 'changes' : 'text')
  const { document: contractDocument, flags, clauses, changes, notices } = record.resource
  if (record.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading the contract text">
        <Skeleton heightClassName="h-40" />
      </div>
    )
  }
  if (record.errorMessage !== null) {
    return (
      <LoadErrorNotice
        title="The contract text could not be loaded"
        errorMessage={record.errorMessage}
        onRetry={(): void => {
          void record.reload()
        }}
      />
    )
  }
  if (contractDocument === null) {
    return <EmptyState icon={<FileText className="h-5 w-5" />} title="Text not available" description={documentUnavailableText} />
  }
  const tabItems = [
    ...(isAmendment ? [{ value: 'changes' as const, label: 'What changes' }] : []),
    { value: 'text' as const, label: 'Full text' },
    { value: 'flags' as const, label: 'Keyword check', badgeContent: flags.length },
    { value: 'compare' as const, label: 'Compare with the standard' },
  ]
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Tabs<RecordTab> accessibleLabel="Contract version views" tabItems={tabItems} activeTabValue={activeTab} onTabChange={setActiveTab} />
      </div>
      <p className="text-xs text-[var(--color-ink-500)]">
        <span className="font-semibold text-[var(--color-warning-600)]">{contractDocument.recordLabel}</span>
        {` · ${describeFlagCount(flags.length)}`}
      </p>
      {activeTab === 'changes' ? <ContractAmendmentChanges changes={changes} viewerRole={viewerRole} /> : null}
      {activeTab === 'text' ? <ContractDocumentView contractDocument={contractDocument} /> : null}
      {activeTab === 'flags' ? <ContractProblemTermFlags flags={flags} notices={notices} /> : null}
      {activeTab === 'compare' ? <ContractDiffWithStandard clauses={clauses} /> : null}
      {renderActions === undefined ? null : renderActions(contractDocument)}
    </div>
  )
}
