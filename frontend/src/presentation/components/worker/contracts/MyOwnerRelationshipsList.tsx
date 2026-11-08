import type { ReactElement } from 'react'
import { Users } from 'lucide-react'
import type { MyOwnerRelationship } from '../../../../domain/models/OwnerRelationship'
import { Badge, EmptyState } from '../../../design/ui'
import {
  describeAcceptedContracts,
  myRelationshipsEmptyText,
  myRelationshipsEmptyTitle,
  myRelationshipsHeading,
} from '../../../utilities/ownerRelationshipCopy'
import {
  describeStatusSince,
  relationshipCountingText,
  relationshipReasonText,
  relationshipStatusLabel,
} from '../../../utilities/ownerRelationshipDisplay'

function MyOwnerRelationshipItem({ relationship }: { readonly relationship: MyOwnerRelationship }): ReactElement {
  const statusDisplay = relationshipStatusLabel(relationship.status, 'worker')
  const sinceText = describeStatusSince(relationship.statusChangedAt)
  const shopsText = relationship.shopNames.length > 0 ? relationship.shopNames.join(', ') : null
  return (
    <li
      aria-label={`Relationship with ${relationship.ownerName}`}
      className="space-y-1 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{relationship.ownerName}</span>
        <Badge tone={statusDisplay.tone}>{statusDisplay.label}</Badge>
      </div>
      {shopsText !== null ? <p className="text-xs break-words text-[var(--color-ink-500)]">{`Shops: ${shopsText}`}</p> : null}
      {relationship.isOwnerRemoved ? null : (
        <p className="text-xs text-[var(--color-ink-500)]">{describeAcceptedContracts(relationship.acceptedContractCount)}</p>
      )}
      <p className="text-xs text-[var(--color-ink-700)]">{relationshipReasonText(relationship.statusReason, 'worker')}</p>
      <p className="text-xs font-medium text-[var(--color-ink-700)]">{relationshipCountingText[relationship.status]}</p>
      {sinceText !== null ? <p className="text-xs text-[var(--color-ink-500)]">{sinceText}</p> : null}
    </li>
  )
}

interface MyOwnerRelationshipsListProps {
  readonly relationships: readonly MyOwnerRelationship[]
}

/** One row per shop owner the worker accepted a contract with (never one per contract or shop). */
export function MyOwnerRelationshipsList({ relationships }: MyOwnerRelationshipsListProps): ReactElement {
  return (
    <section aria-labelledby="my-owner-relationships-heading" className="space-y-2">
      <h3 id="my-owner-relationships-heading" className="text-sm font-semibold text-[var(--color-ink-900)]">
        {myRelationshipsHeading}
      </h3>
      {relationships.length === 0 ? (
        <EmptyState icon={<Users className="h-5 w-5" />} title={myRelationshipsEmptyTitle} description={myRelationshipsEmptyText} />
      ) : (
        <ul aria-label={myRelationshipsHeading} className="space-y-2">
          {relationships.map((relationship) => (
            <MyOwnerRelationshipItem key={relationship.relationshipId} relationship={relationship} />
          ))}
        </ul>
      )}
    </section>
  )
}
