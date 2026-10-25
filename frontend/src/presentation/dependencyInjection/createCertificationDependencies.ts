import { CertificationReviewService } from '../../application/services/CertificationReviewService'
import { CertificationService } from '../../application/services/CertificationService'
import { SupabaseCertificationActionRepository } from '../../infrastructure/repositories/SupabaseCertificationActionRepository'
import { SupabaseCertificationRepository } from '../../infrastructure/repositories/SupabaseCertificationRepository'
import { SupabaseTrainingEvidenceRepository } from '../../infrastructure/repositories/SupabaseTrainingEvidenceRepository'
import { SupabaseTrainingProgramRepository } from '../../infrastructure/repositories/SupabaseTrainingProgramRepository'

export interface CertificationDependencies {
  readonly certificationService: CertificationService
  readonly certificationReviewService: CertificationReviewService
}

export function createCertificationDependencies(): CertificationDependencies {
  const certificationActionRepository = new SupabaseCertificationActionRepository()
  return {
    certificationService: new CertificationService(
      new SupabaseCertificationRepository(),
      certificationActionRepository,
      new SupabaseTrainingEvidenceRepository(),
      new SupabaseTrainingProgramRepository(),
    ),
    certificationReviewService: new CertificationReviewService(certificationActionRepository),
  }
}
