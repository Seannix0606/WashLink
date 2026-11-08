import type { ReactElement } from 'react'
import { useState } from 'react'
import { CalendarPlus, Trash2, XCircle } from 'lucide-react'
import type { TrainingProgramService } from '../../../../application/services/TrainingProgramService'
import type { FormFieldErrors } from '../../../../application/validation/formFieldSchemas'
import {
  emptyTrainingSessionDraft,
  parseTrainingSessionDraft,
  type TrainingSessionDraft,
} from '../../../../application/validation/trainingSessionDraft'
import type { TrainingProgram } from '../../../../domain/models/TrainingProgram'
import { trainingSessionKinds, trainingSessionLimits, type TrainingSession } from '../../../../domain/models/TrainingSession'
import { toManilaCalendarDate } from '../../../../domain/utilities/jobOpeningLifecycle'
import {
  canChangeTrainingSessions,
  canDeleteTrainingSession,
} from '../../../../domain/utilities/trainingProgramLifecycle'
import { Button, Input, Select, Skeleton } from '../../../design/ui'
import { useTrainingSessions } from '../../../hooks/useTrainingSessions'
import { formatCalendarDate } from '../../../utilities/jobOpeningDisplay'
import { trainingSessionKindLabels } from '../../../utilities/trainingDisplay'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { ReasonConfirmModal, TrainingConfirmModal } from '../../training/TrainingConfirmModals'
import { TrainingSessionList } from '../../training/TrainingSessionList'

interface TrainingSessionsEditorProps {
  readonly trainingProgramService: TrainingProgramService
  readonly program: TrainingProgram
  readonly onScheduleChanged: () => void
}

interface PendingSessionAction {
  readonly kind: 'cancel' | 'delete'
  readonly session: TrainingSession
}

/** Training days. Sessions are never edited: draft sessions are deleted, later ones cancelled. */
export function TrainingSessionsEditor({ trainingProgramService, program, onScheduleChanged }: TrainingSessionsEditorProps): ReactElement {
  const sessionsState = useTrainingSessions(trainingProgramService, program, onScheduleChanged)
  const { sessions, isLoadingSessions, sessionsErrorMessage, pendingSessionId, isAddingSession } = sessionsState
  const [sessionDraft, setSessionDraft] = useState<TrainingSessionDraft>(emptyTrainingSessionDraft)
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({})
  const [pendingAction, setPendingAction] = useState<PendingSessionAction | null>(null)
  const canChangeSessions = canChangeTrainingSessions(program.status)
  const scheduledSessions = sessions.filter((session) => session.status === 'scheduled')
  const cancelledSessions = sessions.filter((session) => session.status === 'cancelled')

  const updateSessionDraft = (fieldName: keyof TrainingSessionDraft, fieldValue: string): void => {
    setSessionDraft((currentDraft) => ({ ...currentDraft, [fieldName]: fieldValue }))
  }

  const submitNewSession = async (): Promise<void> => {
    const parsedDraft = parseTrainingSessionDraft(sessionDraft, toManilaCalendarDate(new Date()))
    if (!parsedDraft.isValid) {
      setFieldErrors(parsedDraft.fieldErrors)
      return
    }
    setFieldErrors({})
    if (await sessionsState.addSession(parsedDraft.input)) {
      setSessionDraft(emptyTrainingSessionDraft)
    }
  }

  const sessionById = new Map(sessions.map((session) => [session.id, session]))

  return (
    <section aria-label="Training days" className="space-y-3">
      <h4 className="text-sm font-semibold text-[var(--color-ink-900)]">Training days</h4>
      <p className="text-xs text-[var(--color-ink-500)]">
        Opening needs at least {String(program.minTrainingDays)} distinct upcoming supervised training days. Training days
        and the competency assessment are supervised learning, not customer work.
      </p>
      {isLoadingSessions ? (
        <Skeleton heightClassName="h-16" />
      ) : sessionsErrorMessage !== null ? (
        <LoadErrorNotice
          title="Training days could not be loaded"
          errorMessage={sessionsErrorMessage}
          onRetry={(): void => {
            void sessionsState.reloadSessions()
          }}
        />
      ) : (
        <>
          <TrainingSessionList
            sessions={scheduledSessions}
            accessibleLabel="Scheduled training days"
            emptyText="No training days scheduled yet."
            renderActions={(listedSession): ReactElement | null => {
              const session = sessionById.get(listedSession.id)
              if (session === undefined || !canChangeSessions) {
                return null
              }
              const isDraftDelete = canDeleteTrainingSession(program.status)
              return (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pendingSessionId === session.id}
                  leadingIcon={isDraftDelete ? <Trash2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  onClick={(): void => {
                    setPendingAction({ kind: isDraftDelete ? 'delete' : 'cancel', session })
                  }}
                >
                  {isDraftDelete ? 'Delete' : 'Cancel day'}
                </Button>
              )
            }}
          />
          {cancelledSessions.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-[var(--color-ink-700)]">Cancelled days ({cancelledSessions.length})</summary>
              <div className="mt-2">
                <TrainingSessionList sessions={cancelledSessions} accessibleLabel="Cancelled training days" emptyText="" />
              </div>
            </details>
          ) : null}
        </>
      )}

      {canChangeSessions ? (
        <form
          noValidate
          aria-label="Add a training day"
          className="grid gap-3 rounded-[var(--radius-control)] border border-dashed border-[var(--color-ink-200)] p-3 sm:grid-cols-2"
          onSubmit={(submitEvent): void => {
            submitEvent.preventDefault()
            void submitNewSession()
          }}
        >
          <Input id="training-session-date" type="date" label="Date" required value={sessionDraft.sessionDate} errorText={fieldErrors.sessionDate}
            onChange={(changeEvent): void => { updateSessionDraft('sessionDate', changeEvent.target.value) }} />
          <Select id="training-session-kind" label="Session type" required value={sessionDraft.sessionKind} errorText={fieldErrors.sessionKind}
            options={[{ value: '', label: 'Choose' }, ...trainingSessionKinds.map((kind) => ({ value: kind, label: trainingSessionKindLabels[kind] }))]}
            onChange={(changeEvent): void => { updateSessionDraft('sessionKind', changeEvent.target.value) }} />
          <Input id="training-session-start" type="time" label="Start time (optional)" value={sessionDraft.startTime} errorText={fieldErrors.startTime}
            onChange={(changeEvent): void => { updateSessionDraft('startTime', changeEvent.target.value) }} />
          <Input id="training-session-end" type="time" label="End time (optional)" value={sessionDraft.endTime} errorText={fieldErrors.endTime}
            onChange={(changeEvent): void => { updateSessionDraft('endTime', changeEvent.target.value) }} />
          <div className="sm:col-span-2">
            <Input id="training-session-location" label="Location (optional)" value={sessionDraft.location} maxLength={trainingSessionLimits.locationMaxLength}
              errorText={fieldErrors.location} onChange={(changeEvent): void => { updateSessionDraft('location', changeEvent.target.value) }} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" isLoading={isAddingSession} leadingIcon={<CalendarPlus className="h-4 w-4" />}>
              Add training day
            </Button>
          </div>
        </form>
      ) : null}

      <TrainingConfirmModal
        isOpen={pendingAction?.kind === 'delete'}
        title="Delete this training day?"
        subjectText={pendingAction === null ? '' : formatCalendarDate(pendingAction.session.sessionDate)}
        message="The day is removed from this draft program."
        confirmButtonLabel="Delete day"
        isDestructive
        isSubmitting={pendingAction !== null && pendingSessionId === pendingAction.session.id}
        onConfirm={(): void => {
          if (pendingAction !== null) {
            void sessionsState.deleteSessionDraft(pendingAction.session).then(() => { setPendingAction(null) })
          }
        }}
        onCancel={(): void => { setPendingAction(null) }}
      />
      <ReasonConfirmModal
        isOpen={pendingAction?.kind === 'cancel'}
        title="Cancel this training day?"
        subjectText={pendingAction === null ? '' : formatCalendarDate(pendingAction.session.sessionDate)}
        message="Invited and enrolled workers are told the schedule changed. A day with recorded attendance cannot be cancelled."
        confirmButtonLabel="Cancel day"
        isDestructive
        isReasonRequired
        reasonLabel="Reason (10 to 300 characters)"
        isSubmitting={pendingAction !== null && pendingSessionId === pendingAction.session.id}
        onConfirm={(reason): void => {
          if (pendingAction !== null) {
            void sessionsState.cancelSession(pendingAction.session, reason).then((didCancel) => {
              if (didCancel) {
                setPendingAction(null)
              }
            })
          }
        }}
        onCancel={(): void => { setPendingAction(null) }}
      />
    </section>
  )
}
