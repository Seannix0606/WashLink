import type { ReactElement } from 'react'
import { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import type { TrainingEvidenceService } from '../../../application/services/TrainingEvidenceService'
import type { TrainingRosterEntry } from '../../../domain/models/TrainingEnrollment'
import type {
  TrainingAssessmentEvidence,
  TrainingAttendanceEvidence,
} from '../../../domain/models/TrainingEvidence'
import type { TrainingSession } from '../../../domain/models/TrainingSession'
import {
  canCorrectTrainingAssessment,
  canRecordTrainingAssessment,
  canRecordTrainingAttendance,
} from '../../../domain/utilities/trainingEnrollmentLifecycle'
import { Button, Skeleton } from '../../design/ui'
import { useTrainingEvidence } from '../../hooks/useTrainingEvidence'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'
import { AssessmentSignOffModal, type AssessmentDecision } from './AssessmentSignOffModal'
import { AttendanceCorrectionModal } from './AttendanceCorrectionModal'
import { AttendanceSheet } from './AttendanceSheet'
import { TrainingEvidenceHistory } from './TrainingEvidenceHistory'
import { TrainingProgressSummary } from './TrainingProgressSummary'

interface TrainingEnrollmentRecordsPanelProps {
  readonly trainingEvidenceService: TrainingEvidenceService
  readonly rosterEntry: TrainingRosterEntry
  readonly sessions: readonly TrainingSession[]
  readonly assessmentChecklist: readonly string[]
  /** Re-reads the roster so the server progress stays the source of truth. */
  readonly onEvidenceChanged: () => void
}

/** Attendance, assessment sign-off and history for one trainee (owner or designated trainer). */
export function TrainingEnrollmentRecordsPanel({
  trainingEvidenceService,
  rosterEntry,
  sessions,
  assessmentChecklist,
  onEvidenceChanged,
}: TrainingEnrollmentRecordsPanelProps): ReactElement {
  const {
    evidence,
    isLoadingEvidence,
    evidenceErrorMessage,
    isRecording,
    reloadEvidence,
    recordAttendance,
    correctAttendance,
    recordAssessment,
    correctAssessment,
  } = useTrainingEvidence(trainingEvidenceService, rosterEntry.enrollmentId, onEvidenceChanged)
  const [correctionTarget, setCorrectionTarget] = useState<TrainingAttendanceEvidence | null>(null)
  const [assessmentMode, setAssessmentMode] = useState<'record' | 'correct' | null>(null)
  const [evaluatedAt] = useState<Date>(() => new Date())

  const { enrollmentStatus, progressStatus } = rosterEntry
  const currentAttendance = evidence.filter(
    (evidenceEntry): evidenceEntry is TrainingAttendanceEvidence =>
      evidenceEntry.evidenceKind === 'attendance' && evidenceEntry.isCurrent,
  )
  const currentAssessment =
    evidence.find(
      (evidenceEntry): evidenceEntry is TrainingAssessmentEvidence =>
        evidenceEntry.evidenceKind === 'assessment' && evidenceEntry.isCurrent,
    ) ?? null
  const canRecordAttendance = canRecordTrainingAttendance(enrollmentStatus, progressStatus)
  const canCorrectAttendance = enrollmentStatus === 'accepted' && progressStatus !== 'shop_removed'
  const isAssessmentOffered = canRecordTrainingAssessment(enrollmentStatus, progressStatus)
  const isAssessmentCorrectionOffered =
    currentAssessment !== null &&
    canCorrectTrainingAssessment(enrollmentStatus, progressStatus, rosterEntry.currentAssessmentId)

  const submitAssessment = async (decision: AssessmentDecision): Promise<boolean> => {
    if (assessmentMode === 'correct' && currentAssessment !== null) {
      return correctAssessment({
        assessmentId: currentAssessment.evidenceId,
        itemsMet: decision.itemsMet,
        result: decision.result,
        assessorComment: decision.assessorComment,
        failureReason: decision.failureReason,
        correctionReason: decision.correctionReason ?? '',
      })
    }
    return recordAssessment({
      enrollmentId: rosterEntry.enrollmentId,
      itemsMet: decision.itemsMet,
      result: decision.result,
      assessorComment: decision.assessorComment,
      failureReason: decision.failureReason,
    })
  }

  return (
    <div className="space-y-4">
      <TrainingProgressSummary
        progressStatus={progressStatus}
        attendedTrainingDays={rosterEntry.attendedTrainingDays}
        requiredTrainingDays={rosterEntry.requiredTrainingDays}
        currentAssessmentResult={rosterEntry.currentAssessmentResult}
      />
      {isLoadingEvidence ? (
        <div aria-busy="true" aria-label="Loading training records" className="space-y-2">
          <Skeleton heightClassName="h-16" />
        </div>
      ) : evidenceErrorMessage !== null ? (
        <LoadErrorNotice
          title="Training records could not be loaded"
          errorMessage={evidenceErrorMessage}
          onRetry={(): void => {
            void reloadEvidence()
          }}
        />
      ) : (
        <>
          {enrollmentStatus === 'accepted' ? (
            <AttendanceSheet
              sessions={sessions}
              acceptedAt={rosterEntry.acceptedAt}
              currentAttendance={currentAttendance}
              canRecord={canRecordAttendance}
              canCorrect={canCorrectAttendance}
              isRecording={isRecording}
              evaluatedAt={evaluatedAt}
              onRecord={(sessionId, attendanceStatus, progressNote): void => {
                void recordAttendance({ enrollmentId: rosterEntry.enrollmentId, sessionId, attendanceStatus, progressNote })
              }}
              onCorrectRequested={setCorrectionTarget}
            />
          ) : null}
          {isAssessmentOffered || isAssessmentCorrectionOffered ? (
            <Button
              size="sm"
              variant={isAssessmentOffered ? 'primary' : 'secondary'}
              leadingIcon={<ClipboardCheck className="h-4 w-4" />}
              disabled={isRecording}
              onClick={(): void => {
                setAssessmentMode(isAssessmentOffered ? 'record' : 'correct')
              }}
            >
              {isAssessmentOffered ? 'Record assessment' : 'Correct assessment'}
            </Button>
          ) : null}
          <TrainingEvidenceHistory evidence={evidence} />
        </>
      )}

      <AttendanceCorrectionModal
        currentRecord={correctionTarget}
        isSubmitting={isRecording}
        onSubmit={correctAttendance}
        onClose={(): void => {
          setCorrectionTarget(null)
        }}
      />
      <AssessmentSignOffModal
        isOpen={assessmentMode !== null}
        traineeName={rosterEntry.displayName}
        checklist={assessmentChecklist}
        isCorrection={assessmentMode === 'correct'}
        isSubmitting={isRecording}
        onSubmit={submitAssessment}
        onClose={(): void => {
          setAssessmentMode(null)
        }}
      />
    </div>
  )
}
