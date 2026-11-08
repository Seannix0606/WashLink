import type { ReactElement } from 'react'
import { Archive, DoorClosed, DoorOpen, Eye, PencilLine, Settings2, Trash2 } from 'lucide-react'
import type { TrainingProgram, TrainingProgramStatus } from '../../../../domain/models/TrainingProgram'
import type { TrainingSession } from '../../../../domain/models/TrainingSession'
import { toManilaCalendarDate } from '../../../../domain/utilities/jobOpeningLifecycle'
import {
  allowedTrainingProgramTransitions,
  countUpcomingSupervisedDays,
  evaluateTrainingProgramOpenReadiness,
  isTrainingProgramDeletable,
  isTrainingProgramEditable,
} from '../../../../domain/utilities/trainingProgramLifecycle'
import { Badge, Button, Card } from '../../../design/ui'
import { describeOpenReadiness, describeTrainingProgramStatus } from '../../../utilities/trainingDisplay'

export type TrainingProgramListAction = 'edit' | 'preview' | 'manage' | 'delete' | TrainingProgramStatus

interface TrainingProgramListItemProps {
  readonly program: TrainingProgram
  readonly shopName: string
  readonly sessions: readonly TrainingSession[]
  readonly isShopVerified: boolean
  readonly evaluatedAt: Date
  readonly isActionPending: boolean
  readonly onActionRequested: (program: TrainingProgram, action: TrainingProgramListAction) => void
}

const transitionButtonCopy: Readonly<Partial<Record<TrainingProgramStatus, { readonly label: string; readonly icon: ReactElement }>>> = {
  open: { label: 'Open program', icon: <DoorOpen className="h-4 w-4" /> },
  closed: { label: 'Close to new invitations', icon: <DoorClosed className="h-4 w-4" /> },
  archived: { label: 'Archive', icon: <Archive className="h-4 w-4" /> },
}

/** One program with only the actions its status allows (mirrors transition_training_program). */
export function TrainingProgramListItem({
  program,
  shopName,
  sessions,
  isShopVerified,
  evaluatedAt,
  isActionPending,
  onActionRequested,
}: TrainingProgramListItemProps): ReactElement {
  const statusDisplay = describeTrainingProgramStatus(program.status)
  const programSessions = sessions.filter((session) => session.programId === program.id)
  const manilaToday = toManilaCalendarDate(evaluatedAt)
  const upcomingDays = countUpcomingSupervisedDays(programSessions, manilaToday)
  const openBlocker =
    program.status === 'draft'
      ? describeOpenReadiness(evaluateTrainingProgramOpenReadiness(program, programSessions, isShopVerified, manilaToday))
      : null
  const transitions = allowedTrainingProgramTransitions(program.status)

  return (
    <li>
      <Card elevation="flat" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{program.title}</h3>
            <p className="text-xs break-words text-[var(--color-ink-500)]">{shopName}</p>
          </div>
          <Badge tone={statusDisplay.badgeTone}>{statusDisplay.displayLabel}</Badge>
        </div>
        <p className="text-xs text-[var(--color-ink-500)]">
          {statusDisplay.helperText} {String(upcomingDays)} upcoming supervised training days of the {String(program.minTrainingDays)} required.
        </p>
        {openBlocker === null ? null : (
          <p id={`open-blocker-${program.id}`} className="text-xs text-[var(--color-warning-600)]">
            Open is unavailable: {openBlocker}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {isTrainingProgramEditable(program.status) ? (
            <Button size="sm" variant="secondary" leadingIcon={<PencilLine className="h-4 w-4" />} disabled={isActionPending}
              onClick={(): void => { onActionRequested(program, 'edit') }}>
              Edit
            </Button>
          ) : (
            <Button size="sm" variant="secondary" leadingIcon={<Eye className="h-4 w-4" />}
              onClick={(): void => { onActionRequested(program, 'preview') }}>
              View details
            </Button>
          )}
          <Button size="sm" variant="secondary" leadingIcon={<Settings2 className="h-4 w-4" />}
            onClick={(): void => { onActionRequested(program, 'manage') }}>
            Days, trainers and trainees
          </Button>
          {transitions.map((toStatus) => {
            const buttonCopy = transitionButtonCopy[toStatus]
            return buttonCopy === undefined ? null : (
              <Button key={toStatus} size="sm" variant={toStatus === 'open' ? 'primary' : 'ghost'} leadingIcon={buttonCopy.icon}
                disabled={isActionPending || (toStatus === 'open' && openBlocker !== null)}
                aria-describedby={toStatus === 'open' && openBlocker !== null ? `open-blocker-${program.id}` : undefined}
                onClick={(): void => { onActionRequested(program, toStatus) }}>
                {buttonCopy.label}
              </Button>
            )
          })}
          {isTrainingProgramDeletable(program.status) ? (
            <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="h-4 w-4" />} disabled={isActionPending}
              onClick={(): void => { onActionRequested(program, 'delete') }}>
              Delete draft
            </Button>
          ) : null}
        </div>
      </Card>
    </li>
  )
}
