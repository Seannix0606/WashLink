import type { ReactElement, ReactNode } from 'react'
import { MapPin } from 'lucide-react'
import type { TrainingSessionKind } from '../../../domain/models/TrainingSession'
import { Badge } from '../../design/ui'
import { formatCalendarDate } from '../../utilities/jobOpeningDisplay'
import { formatSessionTimeRange, trainingSessionKindLabels } from '../../utilities/trainingDisplay'

export interface TrainingSessionListItem {
  readonly id: string
  readonly sessionDate: string
  readonly startTime: string | null
  readonly endTime: string | null
  readonly location: string | null
  readonly sessionKind: TrainingSessionKind
  readonly cancelReason?: string | null
}

interface TrainingSessionListProps {
  readonly sessions: readonly TrainingSessionListItem[]
  readonly accessibleLabel: string
  readonly emptyText: string
  /** Optional per-session actions (owner editor). */
  readonly renderActions?: (session: TrainingSessionListItem) => ReactNode
}

/** Training days with their kind; both kinds are supervised learning, never customer work. */
export function TrainingSessionList({
  sessions,
  accessibleLabel,
  emptyText,
  renderActions,
}: TrainingSessionListProps): ReactElement {
  if (sessions.length === 0) {
    return <p className="text-sm text-[var(--color-ink-500)]">{emptyText}</p>
  }
  return (
    <ul aria-label={accessibleLabel} className="space-y-2">
      {sessions.map((session) => {
        const timeRange = formatSessionTimeRange(session.startTime, session.endTime)
        const isCancelled = session.cancelReason !== undefined && session.cancelReason !== null
        return (
          <li
            key={session.id}
            className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-[var(--color-ink-900)]">
                {formatCalendarDate(session.sessionDate)}
                {timeRange === null ? null : <span className="text-[var(--color-ink-500)]"> {timeRange}</span>}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={session.sessionKind === 'supervised_training' ? 'brand' : 'info'}>
                  {trainingSessionKindLabels[session.sessionKind]}
                </Badge>
                {isCancelled ? <Badge tone="neutral">Cancelled</Badge> : null}
              </div>
              {session.location === null ? null : (
                <p className="flex items-center gap-1 text-xs break-words text-[var(--color-ink-500)]">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {session.location}
                </p>
              )}
              {isCancelled ? (
                <p className="text-xs break-words text-[var(--color-ink-500)]">Reason: {session.cancelReason}</p>
              ) : null}
            </div>
            {renderActions === undefined ? null : <div className="flex shrink-0 gap-2">{renderActions(session)}</div>}
          </li>
        )
      })}
    </ul>
  )
}
