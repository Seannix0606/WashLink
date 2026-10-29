import type { ReactElement } from 'react'
import { useState } from 'react'
import { ArrowLeft, ChevronRight, Flag, Handshake } from 'lucide-react'
import type { ContractDisputeService } from '../../../../application/services/ContractDisputeService'
import { canReportContractProblem } from '../../../../domain/models/ContractDispute'
import type { MyWorkerContract } from '../../../../domain/models/WorkerContract'
import { contractListSignal } from '../../../../domain/utilities/ownerRelationshipProgress'
import type { WorkerContractDependencies } from '../../../dependencyInjection/createWorkerContractDependencies'
import { Button, Card, EmptyState, Skeleton } from '../../../design/ui'
import { useContractDisputes } from '../../../hooks/useContractDisputes'
import { useMyWorkerContracts } from '../../../hooks/useMyWorkerContracts'
import { useWorkerContractActions } from '../../../hooks/useWorkerContractActions'
import {
  contractNotFoundText,
  myContractsEmptyDescription,
  myContractsEmptyTitle,
  myContractsIntroText,
} from '../../../utilities/workerContractCopy'
import { reportProblemButtonLabel } from '../../../utilities/contractDisputeCopy'
import { describeContractDates } from '../../../utilities/workerContractDisplay'
import { ContractDisputeList } from '../../contracts/ContractDisputeList'
import { ContractStatusBadge } from '../../contracts/ContractStatusBadge'
import { DraftLegalReviewBanner } from '../../contracts/DraftLegalReviewBanner'
import { ReportContractProblemModal, type ReportContractProblemTarget } from '../../contracts/ReportContractProblemModal'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { OwnerRelationshipProgressCard } from './OwnerRelationshipProgressCard'
import { RetainedApplicationRecords } from './RetainedApplicationRecords'
import { WorkerContractReview } from './WorkerContractReview'

interface MyContractListItemProps {
  readonly contract: MyWorkerContract
  readonly onOpen: () => void
  /** W11: shown only when a report is possible (the database re-checks). */
  readonly onReportProblem?: () => void
}

function MyContractListItem({ contract, onOpen, onReportProblem }: MyContractListItemProps): ReactElement {
  const shopName = contract.shopName ?? 'The shop'
  const waitingText =
    contract.pendingVersionId === null ? null : contract.pendingVersionKind === 'amendment' ? 'A proposed change is waiting for your answer.' : 'An offer is waiting for your answer.'
  return (
    <li aria-label={`Contract with ${shopName}`} className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{shopName}</span>
          <ContractStatusBadge status={contract.effectiveStatus} viewerRole="worker" />
        </div>
        <p className="text-xs text-[var(--color-ink-500)]">{describeContractDates(contract.startDate, contract.endDate)}</p>
        {waitingText !== null ? <p className="text-xs font-medium text-[var(--color-warning-600)]">{waitingText}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {onReportProblem !== undefined ? (
          <Button size="sm" variant="ghost" leadingIcon={<Flag className="h-4 w-4" aria-hidden="true" />} aria-label={`${reportProblemButtonLabel} with the contract with ${shopName}`} onClick={onReportProblem}>
            {reportProblemButtonLabel}
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" trailingIcon={<ChevronRight className="h-4 w-4" aria-hidden="true" />} aria-label={`Open the contract with ${shopName}`} onClick={onOpen}>
          Open
        </Button>
      </div>
    </li>
  )
}

interface MyContractsPanelProps {
  readonly workerContractDependencies: WorkerContractDependencies
  /** W11: reported contract problems; without it nothing can be reported (older callers). */
  readonly contractDisputeService?: ContractDisputeService
  /** W10: switches the workspace to Find work (the progress card's button is hidden without it). */
  readonly onFindWorkRequested?: () => void
}

/** Worker "Contracts" tab: offers, proposed changes, accepted and active contracts, and kept application records. */
export function MyContractsPanel({ workerContractDependencies, contractDisputeService, onFindWorkRequested }: MyContractsPanelProps): ReactElement {
  const { workerContractResponseService, ownerRelationshipService } = workerContractDependencies
  const contracts = useMyWorkerContracts(workerContractResponseService)
  const actions = useWorkerContractActions(contracts.refresh)
  const [openContractId, setOpenContractId] = useState<string | null>(null)
  const disputes = useContractDisputes(contractDisputeService)
  const [reportTarget, setReportTarget] = useState<ReportContractProblemTarget | null>(null)
  const renderInstant = new Date()
  const openContract = openContractId === null ? undefined : contracts.findContract(openContractId)
  const backToList = (): void => {
    setOpenContractId(null)
  }

  const renderList = (): ReactElement =>
    contracts.isLoading ? (
      <div className="space-y-3" aria-busy="true" aria-label="Loading your contracts">
        <Skeleton heightClassName="h-20" />
      </div>
    ) : contracts.errorMessage !== null ? (
      <LoadErrorNotice
        title="Your contracts could not be loaded"
        errorMessage={contracts.errorMessage}
        onRetry={(): void => {
          void contracts.reload()
        }}
      />
    ) : contracts.isEmpty ? (
      <EmptyState icon={<Handshake className="h-5 w-5" />} title={myContractsEmptyTitle} description={myContractsEmptyDescription} />
    ) : (
      <ul aria-label="My contracts" className="space-y-3">
        {contracts.contracts.map((contract) => (
          <MyContractListItem
            key={contract.contractId}
            contract={contract}
            onOpen={(): void => {
              setOpenContractId(contract.contractId)
            }}
            onReportProblem={
              disputes.isAvailable && canReportContractProblem(contract, renderInstant)
                ? (): void => {
                    setReportTarget({
                      contractId: contract.contractId,
                      subjectText: `Contract with ${contract.shopName ?? 'the shop'}`,
                      raiserRole: 'worker',
                      endedBy: contract.endedBy,
                    })
                  }
                : undefined
            }
          />
        ))}
      </ul>
    )

  return (
    <Card elevation="raised" className="space-y-4">
      <header>
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <Handshake className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          My contracts
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{myContractsIntroText}</p>
      </header>
      <DraftLegalReviewBanner isAcceptanceNoteShown />
      {openContractId === null ? (
        <>
          {ownerRelationshipService !== undefined ? (
            <OwnerRelationshipProgressCard
              ownerRelationshipService={ownerRelationshipService}
              refreshSignal={contractListSignal(contracts.contracts)}
              onFindWorkRequested={onFindWorkRequested}
            />
          ) : null}
          {renderList()}
          {disputes.isAvailable ? <ContractDisputeList disputes={disputes} /> : null}
          <RetainedApplicationRecords workerContractResponseService={workerContractResponseService} />
        </>
      ) : openContract === undefined ? (
        contracts.isLoading ? (
          <Skeleton heightClassName="h-40" />
        ) : (
          <div className="space-y-3">
            <Button size="sm" variant="ghost" leadingIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />} onClick={backToList}>
              Back to my contracts
            </Button>
            <p role="status" className="text-sm text-[var(--color-ink-700)]">{contractNotFoundText}</p>
          </div>
        )
      ) : (
        <WorkerContractReview
          key={openContract.contractId}
          workerContractResponseService={workerContractResponseService}
          contract={openContract}
          actions={actions}
          onBack={backToList}
        />
      )}
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
