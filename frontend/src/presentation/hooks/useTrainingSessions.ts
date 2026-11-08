import { useCallback, useState } from 'react'
import type { TrainingProgramService } from '../../application/services/TrainingProgramService'
import type { TrainingProgram } from '../../domain/models/TrainingProgram'
import type { AddTrainingSessionInput, TrainingSession } from '../../domain/models/TrainingSession'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { useLatestResource } from './useLatestResource'

const noSessions: readonly TrainingSession[] = []

export interface UseTrainingSessionsResult {
  readonly sessions: readonly TrainingSession[]
  readonly isLoadingSessions: boolean
  readonly sessionsErrorMessage: string | null
  readonly pendingSessionId: string | null
  readonly isAddingSession: boolean
  readonly reloadSessions: () => Promise<void>
  readonly addSession: (addInput: AddTrainingSessionInput) => Promise<boolean>
  readonly cancelSession: (session: TrainingSession, reason: string) => Promise<boolean>
  readonly deleteSessionDraft: (session: TrainingSession) => Promise<boolean>
}

/** One program's sessions. `onScheduleChanged` lets the program list re-read its stamps. */
export function useTrainingSessions(
  trainingProgramService: TrainingProgramService,
  program: TrainingProgram,
  onScheduleChanged: () => void,
): UseTrainingSessionsResult {
  const programId = program.id
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null)
  const [isAddingSession, setIsAddingSession] = useState<boolean>(false)
  const loadSessions = useCallback(
    async (): Promise<readonly TrainingSession[]> => trainingProgramService.listSessions([programId]),
    [programId, trainingProgramService],
  )
  const { resource, isLoading, errorMessage, reload, refresh } = useLatestResource({
    load: loadSessions,
    initialResource: noSessions,
    loadFailedMessage: 'Could not load the training sessions.',
  })

  const afterChange = useCallback(async (): Promise<void> => {
    await refresh()
    onScheduleChanged()
  }, [onScheduleChanged, refresh])

  const addSession = useCallback(
    async (addInput: AddTrainingSessionInput): Promise<boolean> => {
      setIsAddingSession(true)
      const addedSession = await runServiceActionWithToast(
        () => trainingProgramService.addSession(program, addInput, new Date()),
        { successMessage: 'Session added.', fallbackErrorMessage: 'Could not add the session.' },
      )
      await afterChange()
      setIsAddingSession(false)
      return addedSession !== null
    },
    [afterChange, program, trainingProgramService],
  )

  const cancelSession = useCallback(
    async (session: TrainingSession, reason: string): Promise<boolean> => {
      setPendingSessionId(session.id)
      const cancelledSession = await runServiceActionWithToast(
        () => trainingProgramService.cancelSession(program, session, reason),
        { successMessage: 'Session cancelled.', fallbackErrorMessage: 'Could not cancel the session.' },
      )
      await afterChange()
      setPendingSessionId(null)
      return cancelledSession !== null
    },
    [afterChange, program, trainingProgramService],
  )

  const deleteSessionDraft = useCallback(
    async (session: TrainingSession): Promise<boolean> => {
      setPendingSessionId(session.id)
      const didDelete = await runServiceActionWithToast(
        async () => {
          await trainingProgramService.deleteSessionDraft(program, session)
          return true
        },
        { successMessage: 'Session deleted.', fallbackErrorMessage: 'Could not delete the session.' },
      )
      await afterChange()
      setPendingSessionId(null)
      return didDelete !== null
    },
    [afterChange, program, trainingProgramService],
  )

  return {
    sessions: resource,
    isLoadingSessions: isLoading,
    sessionsErrorMessage: errorMessage,
    pendingSessionId,
    isAddingSession,
    reloadSessions: reload,
    addSession,
    cancelSession,
    deleteSessionDraft,
  }
}
