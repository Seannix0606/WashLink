import type { WorkerProfileDraft } from '../../../application/validation/workerProfileDraft'
import type { WorkerProfileFieldErrors } from '../../../application/validation/workerProfileSchemas'

export interface WorkerProfileStepProps {
  readonly draft: WorkerProfileDraft
  readonly fieldErrors: WorkerProfileFieldErrors
  readonly onDraftChange: (draftChanges: Partial<WorkerProfileDraft>) => void
}
