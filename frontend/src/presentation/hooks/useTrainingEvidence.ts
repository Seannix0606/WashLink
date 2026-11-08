import { useCallback, useState } from 'react'
import type { TrainingEvidenceService } from '../../application/services/TrainingEvidenceService'
import type {
  CorrectTrainingAssessmentInput,
  CorrectTrainingAttendanceInput,
  RecordTrainingAssessmentInput,
  RecordTrainingAttendanceInput,
  TrainingAttendanceEvidence,
  TrainingEvidenceEntry,
} from '../../domain/models/TrainingEvidence'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { useLatestResource } from './useLatestResource'

const noEvidence: readonly TrainingEvidenceEntry[] = []

export interface UseTrainingEvidenceResult {
  readonly evidence: readonly TrainingEvidenceEntry[]
  readonly isLoadingEvidence: boolean
  readonly evidenceErrorMessage: string | null
  readonly isRecording: boolean
  readonly reloadEvidence: () => Promise<void>
  readonly recordAttendance: (recordInput: RecordTrainingAttendanceInput) => Promise<boolean>
  readonly correctAttendance: (
    currentRecord: TrainingAttendanceEvidence,
    correctInput: CorrectTrainingAttendanceInput,
  ) => Promise<boolean>
  readonly recordAssessment: (recordInput: RecordTrainingAssessmentInput) => Promise<boolean>
  readonly correctAssessment: (correctInput: CorrectTrainingAssessmentInput) => Promise<boolean>
}

/**
 * Evidence of one enrollment. After every write the records and the server progress
 * (`onEvidenceChanged`) are re-read; nothing is updated locally.
 */
export function useTrainingEvidence(
  trainingEvidenceService: TrainingEvidenceService,
  enrollmentId: string,
  onEvidenceChanged: () => void,
): UseTrainingEvidenceResult {
  const [isRecording, setIsRecording] = useState<boolean>(false)
  const loadEvidence = useCallback(
    async (): Promise<readonly TrainingEvidenceEntry[]> => trainingEvidenceService.listEvidence(enrollmentId),
    [enrollmentId, trainingEvidenceService],
  )
  const { resource, isLoading, errorMessage, reload, refresh } = useLatestResource({
    load: loadEvidence,
    initialResource: noEvidence,
    loadFailedMessage: 'Could not load the training records.',
  })

  const runRecording = useCallback(
    async (performRecording: () => Promise<void>, successMessage: string, fallbackErrorMessage: string): Promise<boolean> => {
      setIsRecording(true)
      const didRecord = await runServiceActionWithToast(
        async () => {
          await performRecording()
          return true
        },
        { successMessage, fallbackErrorMessage },
      )
      await refresh()
      onEvidenceChanged()
      setIsRecording(false)
      return didRecord !== null
    },
    [onEvidenceChanged, refresh],
  )

  const recordAttendance = useCallback(
    async (recordInput: RecordTrainingAttendanceInput): Promise<boolean> =>
      runRecording(
        () => trainingEvidenceService.recordAttendance(recordInput),
        'Attendance recorded.',
        'Could not record attendance.',
      ),
    [runRecording, trainingEvidenceService],
  )

  const correctAttendance = useCallback(
    async (currentRecord: TrainingAttendanceEvidence, correctInput: CorrectTrainingAttendanceInput): Promise<boolean> =>
      runRecording(
        () => trainingEvidenceService.correctAttendance(currentRecord, correctInput),
        'Correction recorded.',
        'Could not record the correction.',
      ),
    [runRecording, trainingEvidenceService],
  )

  const recordAssessment = useCallback(
    async (recordInput: RecordTrainingAssessmentInput): Promise<boolean> =>
      runRecording(
        () => trainingEvidenceService.recordAssessment(recordInput),
        'Assessment recorded.',
        'Could not record the assessment.',
      ),
    [runRecording, trainingEvidenceService],
  )

  const correctAssessment = useCallback(
    async (correctInput: CorrectTrainingAssessmentInput): Promise<boolean> =>
      runRecording(
        () => trainingEvidenceService.correctAssessment(correctInput),
        'Assessment correction recorded.',
        'Could not record the assessment correction.',
      ),
    [runRecording, trainingEvidenceService],
  )

  return {
    evidence: resource,
    isLoadingEvidence: isLoading,
    evidenceErrorMessage: errorMessage,
    isRecording,
    reloadEvidence: reload,
    recordAttendance,
    correctAttendance,
    recordAssessment,
    correctAssessment,
  }
}
