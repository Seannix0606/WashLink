import type {
  CorrectTrainingAssessmentInput,
  CorrectTrainingAttendanceInput,
  RecordTrainingAssessmentInput,
  RecordTrainingAttendanceInput,
  TrainingEvidenceEntry,
} from '../models/TrainingEvidence'

/**
 * Attendance and assessment evidence. Append-only: there is no edit or delete; a
 * correction is a new record with a reason that supersedes the old one.
 */
export interface TrainingEvidenceRepository {
  /** Every record of the enrollment, superseded ones included. */
  listEvidence(enrollmentId: string): Promise<TrainingEvidenceEntry[]>
  recordAttendance(recordInput: RecordTrainingAttendanceInput): Promise<void>
  correctAttendance(correctInput: CorrectTrainingAttendanceInput): Promise<void>
  recordAssessment(recordInput: RecordTrainingAssessmentInput): Promise<void>
  correctAssessment(correctInput: CorrectTrainingAssessmentInput): Promise<void>
}
