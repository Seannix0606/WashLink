import type { ReactElement } from 'react'
import { useState } from 'react'
import { ChevronRight, MessageSquareWarning } from 'lucide-react'
import type { ContractDisputeService } from '../../../application/services/ContractDisputeService'
import type { ContractDisputeStatus } from '../../../domain/models/ContractDispute'
import { Badge, Card, EmptyState, Select, Skeleton } from '../../design/ui'
import { useAdminContractDisputeQueue } from '../../hooks/useAdminContractDisputeQueue'
import { formatCertificationDate } from '../../utilities/certificationDisplay'
import {
  adminDisputeEmptyText,
  adminDisputeEmptyTitle,
  adminDisputeQueueHeading,
  adminDisputeQueueIntro,
  contractDisputeCategoryLabel,
  contractDisputeStatusLabel,
} from '../../utilities/contractDisputeCopy'
import { partyRoleLabel } from '../../utilities/workerContractDisplay'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'
import { ContractDisputeCaseDrawer } from './ContractDisputeCaseDrawer'

const disputeStatuses: readonly ContractDisputeStatus[] = ['open', 'closed', 'withdrawn']

const statusOptions = disputeStatuses.map((status) => ({ value: status, label: contractDisputeStatusLabel[status] }))

interface ContractDisputeQueuePanelProps {
  readonly contractDisputeService: ContractDisputeService
}

/** Super_admin "Contract disputes": reported problems by status, oldest first, and the case drawer. */
export function ContractDisputeQueuePanel({ contractDisputeService }: ContractDisputeQueuePanelProps): ReactElement {
  const [status, setStatus] = useState<ContractDisputeStatus>('open')
  const queue = useAdminContractDisputeQueue(contractDisputeService, status)
  const [openDisputeId, setOpenDisputeId] = useState<string | null>(null)

  const renderBody = (): ReactElement => {
    if (queue.isLoading) {
      return (
        <div aria-busy="true" aria-label="Loading the reported problems" className="space-y-2">
          <Skeleton heightClassName="h-16" />
          <Skeleton heightClassName="h-16" />
        </div>
      )
    }
    if (queue.errorMessage !== null) {
      return (
        <LoadErrorNotice
          title="The reported problems could not be loaded"
          errorMessage={queue.errorMessage}
          onRetry={(): void => {
            void queue.reload()
          }}
        />
      )
    }
    if (queue.isEmpty) {
      return <EmptyState icon={<MessageSquareWarning className="h-5 w-5" />} title={adminDisputeEmptyTitle} description={adminDisputeEmptyText} />
    }
    return (
      <ul aria-label="Reported contract problems" className="space-y-2">
        {queue.items.map((item) => (
          <li key={item.disputeId}>
            <button
              type="button"
              aria-label={`Open the reported problem: ${contractDisputeCategoryLabel[item.category]}, ${item.shopNameSnapshot ?? 'shop'}`}
              onClick={(): void => {
                setOpenDisputeId(item.disputeId)
              }}
              className="flex w-full items-start justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-white p-3 text-left transition-colors hover:border-[var(--color-brand-400)]"
            >
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-semibold text-[var(--color-ink-900)]">{contractDisputeCategoryLabel[item.category]}</span>
                <span className="block text-xs break-words text-[var(--color-ink-500)]">{item.shopNameSnapshot ?? 'Shop name not recorded'}</span>
                <span className="block text-[11px] text-[var(--color-ink-500)]">
                  {`Reported ${formatCertificationDate(item.createdAt)} by the ${partyRoleLabel[item.raisedByRole].toLowerCase()} · contract ${item.effectiveStatus} · ${
                    item.hasResponse ? 'other party answered' : 'no answer yet'
                  }`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Badge tone={item.status === 'open' ? 'warning' : 'neutral'}>{contractDisputeStatusLabel[item.status]}</Badge>
                <ChevronRight className="h-4 w-4 text-[var(--color-ink-500)]" aria-hidden="true" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Card elevation="raised" role="region" aria-labelledby="contract-disputes-admin-heading" className="space-y-4">
      <header>
        <h2 id="contract-disputes-admin-heading" className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <MessageSquareWarning className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          {adminDisputeQueueHeading}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{adminDisputeQueueIntro}</p>
      </header>
      <div className="sm:w-64">
        <Select
          id="contract-dispute-status"
          name="contract-dispute-status"
          label="Show"
          options={statusOptions}
          value={status}
          onChange={(changeEvent): void => {
            setStatus(disputeStatuses.find((candidate) => candidate === changeEvent.target.value) ?? 'open')
          }}
        />
      </div>
      {renderBody()}
      <ContractDisputeCaseDrawer
        contractDisputeService={contractDisputeService}
        disputeId={openDisputeId}
        onClose={(): void => {
          setOpenDisputeId(null)
        }}
        onClosed={queue.refresh}
      />
    </Card>
  )
}
