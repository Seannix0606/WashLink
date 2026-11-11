import type { ReactElement } from 'react'
import { useState } from 'react'
import { MessageSquareWarning } from 'lucide-react'
import type { MyContractDispute } from '../../../domain/models/ContractDispute'
import { Badge, Button, Skeleton } from '../../design/ui'
import type { UseContractDisputesResult } from '../../hooks/useContractDisputes'
import { formatCertificationDate } from '../../utilities/certificationDisplay'
import {
  contractDisputeCategoryLabel,
  contractDisputeResolutionLabel,
  contractDisputeStatusLabel,
  disputeListEmptyText,
  disputeListHeading,
  respondProblemButtonLabel,
  washLinkCannotChangeContractText,
  washLinkViewedText,
  withdrawProblemButtonLabel,
  withdrawProblemMessage,
  withdrawProblemTitle,
} from '../../utilities/contractDisputeCopy'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'
import { TrainingConfirmModal } from '../training/TrainingConfirmModals'
import { RespondToContractProblemModal } from './RespondToContractProblemModal'

function DisputeItem({
  dispute,
  isActionPending,
  onRespond,
  onWithdraw,
}: {
  readonly dispute: MyContractDispute
  readonly isActionPending: boolean
  readonly onRespond: () => void
  readonly onWithdraw: () => void
}): ReactElement {
  const partyText = [dispute.shopName, dispute.counterpartName].filter((namePart): namePart is string => namePart !== null).join(' · ')
  return (
    <li aria-label={`Reported problem: ${contractDisputeCategoryLabel[dispute.category]}`} className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-card-border)] p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-[var(--color-ink-900)]">{contractDisputeCategoryLabel[dispute.category]}</span>
        <Badge tone={dispute.status === 'open' ? 'warning' : 'neutral'}>{contractDisputeStatusLabel[dispute.status]}</Badge>
        <span className="text-[var(--color-ink-500)]">{dispute.isRaisedByMe ? 'Reported by you' : 'Reported by the other party'}</span>
      </div>
      {partyText.length > 0 ? <p className="break-words text-[var(--color-ink-500)]">{partyText}</p> : null}
      <p className="text-[var(--color-ink-500)]">{`Reported on ${formatCertificationDate(dispute.createdAt)}`}</p>
      <p className="whitespace-pre-line break-words text-[var(--color-ink-900)]">{dispute.statement}</p>
      {dispute.responseStatement !== null ? (
        <p className="whitespace-pre-line break-words text-[var(--color-ink-700)]">
          {`${dispute.isRaisedByMe ? 'Other party' : 'Your side'}: ${dispute.responseStatement}`}
        </p>
      ) : null}
      {dispute.hasWashLinkViewed && dispute.status === 'open' ? <p className="text-[var(--color-ink-500)]">{washLinkViewedText}</p> : null}
      {dispute.status === 'closed' && dispute.resolutionKind !== null ? (
        <div role="note" className="space-y-0.5 rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] px-3 py-2">
          <p className="font-medium text-[var(--color-ink-900)]">
            {`WashLink closed this report: ${contractDisputeResolutionLabel[dispute.resolutionKind]}`}
            {dispute.closedAt === null ? '' : ` (${formatCertificationDate(dispute.closedAt)})`}
          </p>
          {dispute.resolutionNote !== null ? <p className="whitespace-pre-line break-words">{dispute.resolutionNote}</p> : null}
        </div>
      ) : null}
      {dispute.canRespond || dispute.canWithdraw ? (
        <div className="flex flex-wrap gap-2">
          {dispute.canRespond ? (
            <Button size="sm" variant="secondary" disabled={isActionPending} onClick={onRespond}>
              {respondProblemButtonLabel}
            </Button>
          ) : null}
          {dispute.canWithdraw ? (
            <Button size="sm" variant="ghost" disabled={isActionPending} onClick={onWithdraw}>
              {withdrawProblemButtonLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

interface ContractDisputeListProps {
  readonly disputes: UseContractDisputesResult
}

/** A party's reported contract problems with the answer and WashLink's note. Respond / withdraw only where the database allows. */
export function ContractDisputeList({ disputes }: ContractDisputeListProps): ReactElement {
  const [respondTarget, setRespondTarget] = useState<MyContractDispute | null>(null)
  const [withdrawTarget, setWithdrawTarget] = useState<MyContractDispute | null>(null)
  const isActionPending = disputes.pendingActionKey !== null

  const renderBody = (): ReactElement => {
    if (disputes.isLoading) {
      return (
        <div aria-busy="true" aria-label="Loading your reported problems">
          <Skeleton heightClassName="h-16" />
        </div>
      )
    }
    if (disputes.errorMessage !== null) {
      return (
        <LoadErrorNotice
          title="Your reported problems could not be loaded"
          errorMessage={disputes.errorMessage}
          onRetry={(): void => {
            void disputes.reload()
          }}
        />
      )
    }
    if (disputes.isEmpty) {
      return <p className="text-xs text-[var(--color-ink-500)]">{disputeListEmptyText}</p>
    }
    return (
      <ul aria-label={disputeListHeading} className="space-y-2">
        {disputes.disputes.map((dispute) => (
          <DisputeItem
            key={dispute.disputeId}
            dispute={dispute}
            isActionPending={isActionPending}
            onRespond={(): void => {
              setRespondTarget(dispute)
            }}
            onWithdraw={(): void => {
              setWithdrawTarget(dispute)
            }}
          />
        ))}
      </ul>
    )
  }

  return (
    <section aria-labelledby="contract-disputes-heading" className="space-y-2">
      <h3 id="contract-disputes-heading" className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-900)]">
        <MessageSquareWarning className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
        {disputeListHeading}
      </h3>
      <p className="text-xs text-[var(--color-ink-500)]">{washLinkCannotChangeContractText}</p>
      {renderBody()}
      <RespondToContractProblemModal
        dispute={respondTarget}
        isSubmitting={isActionPending}
        onSubmit={disputes.respond}
        onClose={(): void => {
          setRespondTarget(null)
        }}
      />
      <TrainingConfirmModal
        isOpen={withdrawTarget !== null}
        title={withdrawProblemTitle}
        subjectText={withdrawTarget === null ? '' : contractDisputeCategoryLabel[withdrawTarget.category]}
        message={withdrawProblemMessage}
        confirmButtonLabel={withdrawProblemButtonLabel}
        isDestructive
        isSubmitting={isActionPending}
        onConfirm={(): void => {
          if (withdrawTarget !== null) {
            void disputes.withdraw(withdrawTarget).then(() => {
              setWithdrawTarget(null)
            })
          }
        }}
        onCancel={(): void => {
          setWithdrawTarget(null)
        }}
      />
    </section>
  )
}
