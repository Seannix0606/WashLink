import type { ReactElement } from 'react'
import type { WorkforceActivityEvent } from '../../../domain/models/WorkforceActivity'
import { formatShortDateTime } from '../../utilities/datetimeFormatting'
import { activityActorText, describeActivityAction, describeActivityDetails } from '../../utilities/workforceActivityCopy'

interface WorkforceActivityListProps {
  readonly events: readonly WorkforceActivityEvent[]
}

/** Redacted activity entries: what happened, who (as a label), when and allow-listed details. Never ids. */
export function WorkforceActivityList({ events }: WorkforceActivityListProps): ReactElement {
  return (
    <ol aria-label="Activity" className="space-y-2">
      {events.map((activityEvent) => {
        const detailLines = describeActivityDetails(activityEvent.details)
        return (
          <li key={activityEvent.eventId} className="space-y-0.5 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-[var(--color-card)] p-3 text-xs text-[var(--color-ink-700)]">
            <p className="text-sm font-medium break-words text-[var(--color-ink-900)]">{describeActivityAction(activityEvent.action)}</p>
            <p>{`${activityActorText[activityEvent.actorLabel]} · ${formatShortDateTime(activityEvent.createdAt)}`}</p>
            {detailLines.length > 0 ? <p className="break-words text-[var(--color-ink-500)]">{detailLines.join(' · ')}</p> : null}
          </li>
        )
      })}
    </ol>
  )
}
