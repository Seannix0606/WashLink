import type { z } from 'zod'
import {
  certificationIssuerAttestationVersion,
  type CertifiableEnrollment,
  type CertificationHistoryEntry,
  type CertificationReassessmentRecord,
  type CertificationStatusChange,
  type IssuedCertificationRecord,
  type MyCertification,
  type OwnerCertification,
  type RecordCertificationReassessmentInput,
  type ShopCertificationPolicy,
} from '../../domain/models/Certification'
import type { TrainingEvidenceEntry } from '../../domain/models/TrainingEvidence'
import type { WorkerVerifiedCertificationState } from '../../domain/models/VerifiedCertification'
import type {
  CertificationActionRepository,
  CertificationRepository,
} from '../../domain/repositories/CertificationRepository'
import type { TrainingEvidenceRepository } from '../../domain/repositories/TrainingEvidenceRepository'
import type { TrainingProgramRepository } from '../../domain/repositories/TrainingProgramRepository'
import {
  canRenewCertification,
  certificationStatusChangeTarget,
  holdsCurrentCertification,
  ownerCertificationActions,
} from '../../domain/utilities/certificationLifecycle'
import {
  attestationRequiredMessage,
  certificationReasonSchema,
  issueCertificationInputSchema,
  recordReassessmentInputSchema,
  validityMonthsSchema,
} from '../validation/certificationSchemas'

export class CertificationValidationError extends Error {
  public constructor(validationError: z.ZodError) {
    super(validationError.issues.at(0)?.message ?? 'Check the certification details.')
    this.name = 'CertificationValidationError'
  }
}

export function parseCertificationInput<Output>(schema: z.ZodType<Output>, candidate: unknown): Output {
  const parseResult = schema.safeParse(candidate)
  if (!parseResult.success) {
    throw new CertificationValidationError(parseResult.error)
  }
  return parseResult.data
}

export const statusChangeNotAllowedMessage = 'This certification status change is not allowed.'

/**
 * Shop-issued certificates: reads, issue, renewal by re-assessment (D-22), suspend /
 * revoke / reinstate (D-21) and the per-shop validity (D-5). Client checks only mirror
 * the database, which re-checks every rule under locks.
 */
export class CertificationService {
  public constructor(
    private readonly certificationRepository: CertificationRepository,
    private readonly certificationActionRepository: CertificationActionRepository,
    private readonly trainingEvidenceRepository: TrainingEvidenceRepository,
    private readonly trainingProgramRepository: TrainingProgramRepository,
  ) {}

  public async listMyCertifications(): Promise<MyCertification[]> {
    return this.certificationRepository.listMyCertifications()
  }

  /** D-20 state for the apply flow, from the server effective status. */
  public async loadWorkerCertificationState(): Promise<WorkerVerifiedCertificationState> {
    const myCertifications = await this.certificationRepository.listMyCertifications()
    return { kind: 'loaded', hasCurrentCertification: holdsCurrentCertification(myCertifications) }
  }

  public async listOwnerCertifications(shopId: string): Promise<OwnerCertification[]> {
    return this.certificationRepository.listOwnerCertifications(shopId)
  }

  public async listHistory(certificationId: string): Promise<CertificationHistoryEntry[]> {
    return this.certificationRepository.listHistory(certificationId)
  }

  public async listCertifiableEnrollments(programId: string): Promise<CertifiableEnrollment[]> {
    return this.certificationRepository.listCertifiableEnrollments(programId)
  }

  /** The W6 evidence of one enrollment, for the issue summary. */
  public async listEnrollmentEvidence(enrollmentId: string): Promise<TrainingEvidenceEntry[]> {
    return this.trainingEvidenceRepository.listEvidence(enrollmentId)
  }

  /** The original program checklist a re-assessment is recorded against. */
  public async loadReassessmentChecklist(programId: string): Promise<readonly string[]> {
    const program = (await this.trainingProgramRepository.listProgramsByIds([programId])).at(0)
    if (program === undefined) {
      throw new Error('Training program not found.')
    }
    return program.assessmentChecklist
  }

  public async fetchShopPolicy(shopId: string): Promise<ShopCertificationPolicy> {
    return this.certificationRepository.fetchShopPolicy(shopId)
  }

  public async setShopValidity(shopId: string, validityMonths: number): Promise<ShopCertificationPolicy> {
    const validMonths = parseCertificationInput(validityMonthsSchema, validityMonths)
    return this.certificationActionRepository.setShopValidity(shopId, validMonths)
  }

  /** Sends the assessment id the owner reviewed; a changed record fails with 55000. */
  public async issue(enrollment: CertifiableEnrollment, hasConfirmedAttestation: boolean): Promise<IssuedCertificationRecord> {
    const validInput = parseCertificationInput(issueCertificationInputSchema, {
      enrollmentId: enrollment.enrollmentId,
      expectedAssessmentId: enrollment.currentAssessmentId,
      hasConfirmedAttestation,
    })
    return this.certificationActionRepository.issue(
      validInput.enrollmentId,
      validInput.expectedAssessmentId,
      certificationIssuerAttestationVersion,
    )
  }

  public async recordReassessment(reassessmentInput: RecordCertificationReassessmentInput): Promise<CertificationReassessmentRecord> {
    const validInput = parseCertificationInput(recordReassessmentInputSchema, reassessmentInput)
    return this.certificationActionRepository.recordReassessment(validInput)
  }

  /** Renewal issues a NEW certificate; the old one becomes superseded (D-22). */
  public async renew(
    certification: OwnerCertification,
    hasConfirmedAttestation: boolean,
    currentInstant: Date,
  ): Promise<IssuedCertificationRecord> {
    if (!hasConfirmedAttestation) {
      throw new Error(attestationRequiredMessage)
    }
    if (!canRenewCertification(certification, currentInstant) || certification.latestReassessmentId === null) {
      throw new Error('Record a passed re-assessment first.')
    }
    return this.certificationActionRepository.renew(
      certification.certificationId,
      certification.latestReassessmentId,
      certificationIssuerAttestationVersion,
    )
  }

  /** Suspend, revoke or reinstate with a reason; the loaded status is the expected one (stale -> 55000). */
  public async changeStatus(
    certification: OwnerCertification,
    statusChange: CertificationStatusChange,
    reason: string,
    currentInstant: Date,
  ): Promise<IssuedCertificationRecord> {
    if (!ownerCertificationActions(certification, currentInstant).includes(statusChange)) {
      throw new Error(statusChangeNotAllowedMessage)
    }
    const validReason = parseCertificationInput(certificationReasonSchema, reason)
    return this.certificationActionRepository.transition({
      certificationId: certification.certificationId,
      fromStatus: certification.status,
      toStatus: certificationStatusChangeTarget[statusChange],
      reason: validReason,
    })
  }
}
