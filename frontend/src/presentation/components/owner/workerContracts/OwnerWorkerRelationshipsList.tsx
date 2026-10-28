import type { ReactElement } from 'react'
import { Users } from 'lucide-react'
import type { OwnerRelationshipService } from '../../../../application/services/OwnerRelationshipService'
import type { OwnerSideWorkerRelationship } from '../../../../domain/models/OwnerRelationship'
import { Badge, EmptyState, Skeleton } from '../../../design/ui'
import { useOwnerWorkerRelationships } from '../../../hooks/useOwnerWorkerRelationships'
import {
  describeContractsWithYou,
  ownerRelationshipsEmptyText,
  ownerRelationshipsEmptyTitle,
  ownerRelationshipsHeading,
  ownerRelationshipsIntroText,
} from '../../../utilities/ownerRelationshipCopy'
import { describeStatusSince, relationshipReasonText, relationshipStatusLabel } from '../../../utilities/ownerRelationshipDisplay'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'

function OwnerWorkerRelationshipItem({ relationship }: { readonly relationship: OwnerSideWorkerRelationship }): ReactElement {
  const statusDisplay = relationshipStatusLabel(relationship.status, 'owner')
  const sinceText = describeStatusSince(relationship.statusChangedAt)
  return (
    <li
      aria-label={`Relationship with ${relationship.workerName}`}
      className="space-y-1 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{relationship.workerName}</span>
        <Badge tone={statusDisplay.tone}>{statusDisplay.label}</Badge>
      </div>
      <p className="text-xs text-[var(--color-ink-500)]">{describeContractsWithYou(relationship.contractsWithYouCount)}</p>
      <p className="text-xs text-[var(--color-ink-700)]">{relationshipReasonText(relationship.statusReason, 'owner')}</p>
      {sinceText !== null ? <p className="text-xs text-[var(--color-ink-500)]">{sinceText}</p> : null}
    </li>
  )
}

interface OwnerWorkerRelationshipsListProps {
  readonly ownerRelationshipService: OwnerRelationshipService
}

/**
 * The owner's own relationship rows (D-38): worker name, status, contracts with this owner.
 * Never the worker's progress, count, remaining or any other owner.
 */
export function OwnerWorkerRelationshipsList({ ownerRelationshipService }: OwnerWorkerRelationshipsListProps): ReactElement {
  const relationships = useOwnerWorkerRelationships(ownerRelationshipService)
  return (
    <section aria-labelledby="owner-worker-relationships-heading" className="space-y-2">
      <header>
        <h3 id="owner-worker-relationships-heading" className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-900)]">
          <Users className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          {ownerRelationshipsHeading}
        </h3>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{ownerRelationshipsIntroText}</p>
      </header>
      {relationships.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading your worker relationships">
          <Skeleton heightClassName="h-16" />
        </div>
      ) : relationships.errorMessage !== null ? (
        <LoadErrorNotice
          title="Your worker relationships could not be loaded"
          errorMessage={relationships.errorMessage}
          onRetry={(): void => {
            void relationships.reload()
          }}
        />
      ) : relationships.isEmpty ? (
        <EmptyState icon={<Users className="h-5 w-5" />} title={ownerRelationshipsEmptyTitle} description={ownerRelationshipsEmptyText} />
      ) : (
        <ul aria-label={ownerRelationshipsHeading} className="space-y-2">
          {relationships.relationships.map((relationship) => (
            <OwnerWorkerRelationshipItem key={relationship.relationshipId} relationship={relationship} />
          ))}
        </ul>
      )}
    </section>
  )
}
