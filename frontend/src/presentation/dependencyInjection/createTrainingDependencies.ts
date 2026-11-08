import { TrainingEnrollmentService } from '../../application/services/TrainingEnrollmentService'
import { TrainingEvidenceService } from '../../application/services/TrainingEvidenceService'
import { TrainingProgramService } from '../../application/services/TrainingProgramService'
import { SupabaseTrainingEnrollmentRepository } from '../../infrastructure/repositories/SupabaseTrainingEnrollmentRepository'
import { SupabaseTrainingEvidenceRepository } from '../../infrastructure/repositories/SupabaseTrainingEvidenceRepository'
import { SupabaseTrainingProgramRepository } from '../../infrastructure/repositories/SupabaseTrainingProgramRepository'

export interface TrainingDependencies {
  readonly trainingProgramService: TrainingProgramService
  readonly trainingEnrollmentService: TrainingEnrollmentService
  readonly trainingEvidenceService: TrainingEvidenceService
}

export function createTrainingDependencies(): TrainingDependencies {
  const trainingProgramRepository = new SupabaseTrainingProgramRepository()
  return {
    trainingProgramService: new TrainingProgramService(trainingProgramRepository),
    trainingEnrollmentService: new TrainingEnrollmentService(
      new SupabaseTrainingEnrollmentRepository(),
      trainingProgramRepository,
    ),
    trainingEvidenceService: new TrainingEvidenceService(new SupabaseTrainingEvidenceRepository()),
  }
}
