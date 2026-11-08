import { useCallback } from 'react'
import type { CertificationService } from '../../application/services/CertificationService'
import type { TrainingAssessmentEvidence, TrainingEvidenceEntry } from '../../domain/models/TrainingEvidence'
import { useLatestResource } from './useLatestResource'

const noEvidence: readonly TrainingEvidenceEntry[] = []
const noChecklist: readonly string[] = []

export interface UseIssueEvidenceResult {
  /** The current assessment the owner is about to certify, as recorded (W6 evidence). */
  readonly currentAssessment: TrainingAssessmentEvidence | null
  readonly isLoadingEvidence: boolean
  readonly evidenceErrorMessage: string | null
  readonly reloadEvidence: () => Promise<void>
}

/** The W6 evidence behind an issue decision (checklist, result, assessor). */
export function useIssueEvidence(
  certificationService: CertificationService,
  enrollmentId: string,
  currentAssessmentId: string,
): UseIssueEvidenceResult {
  const loadEvidence = useCallback(
    async (): Promise<readonly TrainingEvidenceEntry[]> => certificationService.listEnrollmentEvidence(enrollmentId),
    [certificationService, enrollmentId],
  )
  const { resource, isLoading, errorMessage, reload } = useLatestResource({
    load: loadEvidence,
    initialResource: noEvidence,
    loadFailedMessage: 'Could not load the training records.',
  })
  const currentAssessment =
    resource.find(
      (evidenceEntry): evidenceEntry is TrainingAssessmentEvidence =>
        evidenceEntry.evidenceKind === 'assessment' && evidenceEntry.evidenceId === currentAssessmentId,
    ) ?? null
  return { currentAssessment, isLoadingEvidence: isLoading, evidenceErrorMessage: errorMessage, reloadEvidence: reload }
}

export interface UseReassessmentChecklistResult {
  readonly checklist: readonly string[]
  readonly isLoadingChecklist: boolean
  readonly checklistErrorMessage: string | null
  readonly reloadChecklist: () => Promise<void>
}

/** The original program checklist a re-assessment is recorded against (D-22). */
export function useReassessmentChecklist(
  certificationService: CertificationService,
  programId: string,
): UseReassessmentChecklistResult {
  const loadChecklist = useCallback(
    async (): Promise<readonly string[]> => certificationService.loadReassessmentChecklist(programId),
    [certificationService, programId],
  )
  const { resource, isLoading, errorMessage, reload } = useLatestResource({
    load: loadChecklist,
    initialResource: noChecklist,
    loadFailedMessage: 'Could not load the assessment checklist.',
  })
  return { checklist: resource, isLoadingChecklist: isLoading, checklistErrorMessage: errorMessage, reloadChecklist: reload }
}
