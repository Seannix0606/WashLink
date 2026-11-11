import type { ReactElement } from 'react'
import { useState } from 'react'
import { ArrowLeft, ChevronRight, FilePlus2, Flag, Handshake } from 'lucide-react'
import type { ContractDisputeService } from '../../../../application/services/ContractDisputeService'
import type { OwnerRelationshipService } from '../../../../application/services/OwnerRelationshipService'
import type { NewWorkerContractRequest, NewWorkerContractOptions, WorkerContractService } from '../../../../application/services/WorkerContractService'
import { canReportContractProblem } from '../../../../domain/models/ContractDispute'
import type { OwnerWorkerContract } from '../../../../domain/models/WorkerContract'
import { Button, Card, EmptyState, Skeleton } from '../../../design/ui'
import { useContractDisputes } from '../../../hooks/useContractDisputes'
import { useOwnerWorkerContracts } from '../../../hooks/useOwnerWorkerContracts'
import { useWorkerContractActions } from '../../../hooks/useWorkerContractActions'
import {
  contractNotFoundText,
  ownerContractsEmptyDescription,
  ownerContractsEmptyTitle,
  ownerContractsIntroText,
} from '../../../utilities/workerContractCopy'
import { reportProblemButtonLabel } from '../../../utilities/contractDisputeCopy'
import { contractOriginLabel, describeContractDates } from '../../../utilities/workerContractDisplay'
import { ContractDisputeList } from '../../contracts/ContractDisputeList'
import { ContractStatusBadge } from '../../contracts/ContractStatusBadge'
import { DraftLegalReviewBanner } from '../../contracts/DraftLegalReviewBanner'
import { ReportContractProblemModal, type ReportContractProblemTarget } from '../../contracts/ReportContractProblemModal'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { NewWorkerContractModal } from './NewWorkerContractModal'
import { OwnerWorkerContractDetail } from './OwnerWorkerContractDetail'
import { OwnerWorkerRelationshipsList } from './OwnerWorkerRelationshipsList'
import { WorkerContractDraftEditor } from './WorkerContractDraftEditor'

type PanelView = { readonly kind: 'list' } | { readonly kind: 'detail' | 'editor'; readonly contractId: string }

const listView: PanelView = { kind: 'list' }

interface ContractListItemProps {
  readonly contract: OwnerWorkerContract
  readonly onOpen: (contract: OwnerWorkerContract) => void
  /** W11: shown only when a report is possible (the database re-checks). */
  readonly onReportProblem?: () => void
}

function ContractListItem({ contract, onOpen, onReportProblem }: ContractListItemProps): ReactElement {
  const workerName = contract.workerName ?? 'Worker'
  const versionText =
    contract.pendingVersionNumber !== null
      ? `Version ${String(contract.pendingVersionNumber)} sent`
      : contract.currentVersionNumber !== null
        ? `Version ${String(contract.currentVersionNumber)} in force`
        : contract.draftVersionNumber !== null
          ? `Version ${String(contract.draftVersionNumber)} draft`
          : ''
  return (
    <li aria-label={`Contract with ${workerName}`} className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-[var(--color-card-border)] p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{workerName}</span>
          <ContractStatusBadge status={contract.effectiveStatus} viewerRole="owner" />
        </div>
        <p className="text-xs break-words text-[var(--color-ink-500)]">
          {`${contract.shopName ?? 'Shop'} · ${contractOriginLabel[contract.origin]} · ${describeContractDates(contract.startDate, contract.endDate)}`}
        </p>
        {versionText.length > 0 ? <p className="text-xs text-[var(--color-ink-500)]">{versionText}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {onReportProblem !== undefined ? (
          <Button size="sm" variant="ghost" leadingIcon={<Flag className="h-4 w-4" aria-hidden="true" />} aria-label={`${reportProblemButtonLabel} with the contract with ${workerName}`} onClick={onReportProblem}>
            {reportProblemButtonLabel}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          trailingIcon={<ChevronRight className="h-4 w-4" aria-hidden="true" />}
          aria-label={`Open the contract with ${workerName}`}
          onClick={(): void => {
            onOpen(contract)
          }}
        >
          Open
        </Button>
      </div>
    </li>
  )
}

interface OwnerWorkerContractsPanelProps {
  readonly workerContractService: WorkerContractService
  /** W10: the owner's own relationship rows are listed under the contracts when given. */
  readonly ownerRelationshipService?: OwnerRelationshipService
  /** W11: reported contract problems; without it nothing can be reported (older callers). */
  readonly contractDisputeService?: ContractDisputeService
}

/** Owner "Worker contracts" tab: drafts, sent offers, accepted and active relationships. */
export function OwnerWorkerContractsPanel({
  workerContractService,
  ownerRelationshipService,
  contractDisputeService,
}: OwnerWorkerContractsPanelProps): ReactElement {
  const contracts = useOwnerWorkerContracts(workerContractService)
  const actions = useWorkerContractActions(contracts.refresh)
  const [view, setView] = useState<PanelView>(listView)
  const [isNewContractOpen, setIsNewContractOpen] = useState<boolean>(false)
  const disputes = useContractDisputes(contractDisputeService)
  const [reportTarget, setReportTarget] = useState<ReportContractProblemTarget | null>(null)
  const renderInstant = new Date()
  const backToList = (): void => {
    setView(listView)
  }

  const createDraft = async (request: NewWorkerContractRequest, options: NewWorkerContractOptions): Promise<boolean> => {
    const createdRecord = await actions.runAction(
      'create',
      async () => workerContractService.createDraft(request, options),
      'Contract draft created. Nothing is sent until you send it.',
      'Could not create the contract draft.',
    )
    if (createdRecord !== null) {
      setIsNewContractOpen(false)
      setView({ kind: 'editor', contractId: createdRecord.contractId })
    }
    return createdRecord !== null
  }

  const renderContractView = (contractId: string, kind: 'detail' | 'editor'): ReactElement => {
    const contract = contracts.findContract(contractId)
    if (contract === undefined) {
      return contracts.isLoading ? (
        <Skeleton heightClassName="h-40" />
      ) : (
        <div className="space-y-3">
          <Button size="sm" variant="ghost" leadingIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />} onClick={backToList}>
            Back to contracts
          </Button>
          <p role="status" className="text-sm text-[var(--color-ink-700)]">{contractNotFoundText}</p>
        </div>
      )
    }
    if (kind === 'editor' && contract.draftVersionId !== null) {
      return (
        <WorkerContractDraftEditor
          key={`${contract.contractId}-${contract.draftVersionId}`}
          workerContractService={workerContractService}
          contract={contract}
          actions={actions}
          onBack={(): void => {
            setView({ kind: 'detail', contractId })
          }}
          onDiscarded={backToList}
          onContractChanged={contracts.refresh}
        />
      )
    }
    return (
      <OwnerWorkerContractDetail
        key={contract.contractId}
        workerContractService={workerContractService}
        contract={contract}
        actions={actions}
        onBack={backToList}
        onEditDraft={(): void => {
          setView({ kind: 'editor', contractId })
        }}
      />
    )
  }

  const renderList = (): ReactElement => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          leadingIcon={<FilePlus2 className="h-4 w-4" aria-hidden="true" />}
          disabled={actions.pendingActionKey !== null}
          onClick={(): void => {
            setIsNewContractOpen(true)
          }}
        >
          New contract draft
        </Button>
      </div>
      {contracts.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading your worker contracts">
          <Skeleton heightClassName="h-20" />
          <Skeleton heightClassName="h-20" />
        </div>
      ) : contracts.errorMessage !== null ? (
        <LoadErrorNotice
          title="Your worker contracts could not be loaded"
          errorMessage={contracts.errorMessage}
          onRetry={(): void => {
            void contracts.reload()
          }}
        />
      ) : contracts.isEmpty ? (
        <EmptyState icon={<Handshake className="h-5 w-5" />} title={ownerContractsEmptyTitle} description={ownerContractsEmptyDescription} />
      ) : (
        <ul aria-label="Worker contracts" className="space-y-3">
          {contracts.contracts.map((contract) => (
            <ContractListItem
              key={contract.contractId}
              contract={contract}
              onOpen={(openedContract): void => {
                setView({ kind: 'detail', contractId: openedContract.contractId })
              }}
              onReportProblem={
                disputes.isAvailable && canReportContractProblem(contract, renderInstant)
                  ? (): void => {
                      setReportTarget({
                        contractId: contract.contractId,
                        subjectText: `Contract with ${contract.workerName ?? 'the worker'}`,
                        raiserRole: 'owner',
                        endedBy: contract.endedBy,
                      })
                    }
                  : undefined
              }
            />
          ))}
        </ul>
      )}
      {disputes.isAvailable ? <ContractDisputeList disputes={disputes} /> : null}
      {ownerRelationshipService !== undefined ? <OwnerWorkerRelationshipsList ownerRelationshipService={ownerRelationshipService} /> : null}
    </div>
  )

  return (
    <Card elevation="raised" className="space-y-4">
      <header>
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <Handshake className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          Worker contracts
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{ownerContractsIntroText}</p>
      </header>
      <DraftLegalReviewBanner isAcceptanceNoteShown />
      {view.kind === 'list' ? renderList() : renderContractView(view.contractId, view.kind)}
      {isNewContractOpen ? (
        <NewWorkerContractModal
          workerContractService={workerContractService}
          isSubmitting={actions.pendingActionKey === 'create'}
          onCreate={createDraft}
          onClose={(): void => {
            setIsNewContractOpen(false)
          }}
        />
      ) : null}
      <ReportContractProblemModal
        target={reportTarget}
        isSubmitting={disputes.pendingActionKey !== null}
        onSubmit={disputes.reportProblem}
        onClose={(): void => {
          setReportTarget(null)
        }}
      />
    </Card>
  )
}
