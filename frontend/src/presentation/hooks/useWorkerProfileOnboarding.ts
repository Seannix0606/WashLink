import { useCallback, useState } from 'react'
import {
  createWorkerProfileDraft,
  parseWorkerProfileDraft,
  validateWorkerProfileStep,
  workerProfileStepKeys,
  type WorkerProfileDraft,
  type WorkerProfileStepKey,
} from '../../application/validation/workerProfileDraft'
import type { WorkerProfileFieldErrors } from '../../application/validation/workerProfileSchemas'
import type {
  SaveWorkerPrivateContactInput,
  SaveWorkerProfileInput,
  WorkerPrivateContact,
  WorkerProfile,
} from '../../domain/models/WorkerProfile'

interface UseWorkerProfileOnboardingOptions {
  readonly initialWorkerProfile: WorkerProfile | null
  readonly initialWorkerPrivateContact: WorkerPrivateContact | null
  readonly onSubmitWorkerProfile: (
    workerProfileInput: SaveWorkerProfileInput,
    workerPrivateContactInput: SaveWorkerPrivateContactInput,
  ) => Promise<boolean>
}

export interface UseWorkerProfileOnboardingResult {
  readonly draft: WorkerProfileDraft
  readonly currentStepKey: WorkerProfileStepKey
  readonly currentStepIndex: number
  readonly stepCount: number
  readonly isFirstStep: boolean
  readonly isLastStep: boolean
  readonly fieldErrors: WorkerProfileFieldErrors
  readonly isSubmittingWorkerProfile: boolean
  readonly updateDraft: (draftChanges: Partial<WorkerProfileDraft>) => void
  readonly goToNextStep: () => void
  readonly goToPreviousStep: () => void
  readonly submitWorkerProfile: () => Promise<boolean>
}

export function useWorkerProfileOnboarding({
  initialWorkerProfile,
  initialWorkerPrivateContact,
  onSubmitWorkerProfile,
}: UseWorkerProfileOnboardingOptions): UseWorkerProfileOnboardingResult {
  const [draft, setDraft] = useState<WorkerProfileDraft>(() =>
    createWorkerProfileDraft(initialWorkerProfile, initialWorkerPrivateContact),
  )
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0)
  const [fieldErrors, setFieldErrors] = useState<WorkerProfileFieldErrors>({})
  const [isSubmittingWorkerProfile, setIsSubmittingWorkerProfile] =
    useState<boolean>(false)

  const stepCount = workerProfileStepKeys.length
  const currentStepKey = workerProfileStepKeys.at(currentStepIndex) ?? 'about'

  const updateDraft = useCallback((draftChanges: Partial<WorkerProfileDraft>): void => {
    setDraft((previousDraft) => ({ ...previousDraft, ...draftChanges }))
    // yearsOfExperienceText is validated under the field name yearsOfExperience.
    const changedFieldNames = new Set(
      Object.keys(draftChanges).map((fieldName) => fieldName.replace(/Text$/, '')),
    )
    setFieldErrors((previousErrors) =>
      Object.fromEntries(
        Object.entries(previousErrors).filter(
          ([fieldName]) => !changedFieldNames.has(fieldName),
        ),
      ),
    )
  }, [])

  const goToNextStep = useCallback((): void => {
    const stepErrors = validateWorkerProfileStep(currentStepKey, draft)
    setFieldErrors(stepErrors)
    if (Object.keys(stepErrors).length === 0) {
      setCurrentStepIndex((previousIndex) => Math.min(previousIndex + 1, stepCount - 1))
    }
  }, [currentStepKey, draft, stepCount])

  const goToPreviousStep = useCallback((): void => {
    setFieldErrors({})
    setCurrentStepIndex((previousIndex) => Math.max(previousIndex - 1, 0))
  }, [])

  const submitWorkerProfile = useCallback(async (): Promise<boolean> => {
    const firstInvalidStepIndex = workerProfileStepKeys.findIndex(
      (stepKey) => Object.keys(validateWorkerProfileStep(stepKey, draft)).length > 0,
    )
    const parsedDraft = parseWorkerProfileDraft(draft)
    if (firstInvalidStepIndex >= 0 || parsedDraft === null) {
      const invalidStepIndex = Math.max(firstInvalidStepIndex, 0)
      const invalidStepKey = workerProfileStepKeys.at(invalidStepIndex) ?? 'about'
      setCurrentStepIndex(invalidStepIndex)
      setFieldErrors(validateWorkerProfileStep(invalidStepKey, draft))
      return false
    }
    setIsSubmittingWorkerProfile(true)
    try {
      return await onSubmitWorkerProfile(
        parsedDraft.workerProfileInput,
        parsedDraft.workerPrivateContactInput,
      )
    } finally {
      setIsSubmittingWorkerProfile(false)
    }
  }, [draft, onSubmitWorkerProfile])

  return {
    draft,
    currentStepKey,
    currentStepIndex,
    stepCount,
    isFirstStep: currentStepIndex === 0,
    isLastStep: currentStepIndex === stepCount - 1,
    fieldErrors,
    isSubmittingWorkerProfile,
    updateDraft,
    goToNextStep,
    goToPreviousStep,
    submitWorkerProfile,
  }
}
