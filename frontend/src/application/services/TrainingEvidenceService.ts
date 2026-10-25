import type {
  CorrectTrainingAssessmentInput,
  CorrectTrainingAttendanceInput,
  RecordTrainingAssessmentInput,
  RecordTrainingAttendanceInput,
  TrainingAttendanceEvidence,
  TrainingEvidenceEntry,
} from '../../domain/models/TrainingEvidence'
import type { TrainingEvidenceRepository } from '../../domain/repositories/TrainingEvidenceRepository'
import {
  correctAssessmentInputSchema,
  correctAttendanceInputSchema,
  recordAssessmentInputSchema,
  recordAttendanceInputSchema,
} from '../validation/trainingEvidenceSchemas'
import { parseOrThrow } from './TrainingProgramService'

/**
 * Attendance and assessment sign-off by the owner or a designated trainer. Records are
 * never edited or deleted; corrections are new records with a reason (C-W3-1).
 */
export class TrainingEvidenceService {
  public constructor(private readonly trainingEvidenceRepository: TrainingEvidenceRepository) {}

  public async listEvidence(enrollmentId: string): Promise<TrainingEvidenceEntry[]> {
    return this.trainingEvidenceRepository.listEvidence(enrollmentId)
  }

  public async recordAttendance(recordInput: RecordTrainingAttendanceInput): Promise<void> {
    await this.trainingEvidenceRepository.recordAttendance(parseOrThrow(recordAttendanceInputSchema, recordInput))
  }

  public async correctAttendance(
    currentRecord: TrainingAttendanceEvidence,
    correctInput: CorrectTrainingAttendanceInput,
  ): Promise<void> {
    if (!currentRecord.isCurrent) {
      throw new Error('This record was already corrected.')
    }
    const validInput = parseOrThrow(correctAttendanceInputSchema, correctInput)
    if (
      validInput.attendanceStatus === currentRecord.attendanceStatus &&
      validInput.progressNote === currentRecord.progressNote
    ) {
      throw new Error('A correction must change the attendance or the note.')
    }
    await this.trainingEvidenceRepository.correctAttendance(validInput)
  }

  public async recordAssessment(recordInput: RecordTrainingAssessmentInput): Promise<void> {
    await this.trainingEvidenceRepository.recordAssessment(parseOrThrow(recordAssessmentInputSchema, recordInput))
  }

  public async correctAssessment(correctInput: CorrectTrainingAssessmentInput): Promise<void> {
    await this.trainingEvidenceRepository.correctAssessment(parseOrThrow(correctAssessmentInputSchema, correctInput))
  }
}
