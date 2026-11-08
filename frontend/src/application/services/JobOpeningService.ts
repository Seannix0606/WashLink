import type { z } from 'zod'
import type { JobOpening, JobOpeningStatus, SaveJobOpeningInput } from '../../domain/models/JobOpening'
import type { JobOpeningRepository } from '../../domain/repositories/JobOpeningRepository'
import {
  isJobOpeningContentEditable,
  isJobOpeningDeletable,
  isJobOpeningTransitionAllowed,
} from '../../domain/utilities/jobOpeningLifecycle'
import { saveJobOpeningInputSchema } from '../validation/jobOpeningSchemas'

export class JobOpeningValidationError extends Error {
  public constructor(validationError: z.ZodError) {
    super(validationError.issues.at(0)?.message ?? 'Check the job opening details.')
    this.name = 'JobOpeningValidationError'
  }
}

export type ShopPublishEligibility = Readonly<Partial<Record<string, boolean>>>

/**
 * Owner job-opening rules on the client. Every check here is repeated by the
 * database (guard trigger, RLS, transition_job_opening), which stays the authority.
 */
export class JobOpeningService {
  public constructor(private readonly jobOpeningRepository: JobOpeningRepository) {}

  public async listOwnJobOpenings(): Promise<JobOpening[]> {
    return this.jobOpeningRepository.listOwnJobOpenings()
  }

  /** Whether each shop may publish or resume openings now (P15). */
  public async loadShopPublishEligibility(
    shopIds: readonly string[],
  ): Promise<ShopPublishEligibility> {
    const eligibilityEntries = await Promise.all(
      shopIds.map(
        async (shopId): Promise<[string, boolean]> => [
          shopId,
          await this.jobOpeningRepository.isShopVerifiedForPublishing(shopId),
        ],
      ),
    )
    return Object.fromEntries(eligibilityEntries)
  }

  public async createDraft(
    shopId: string,
    saveJobOpeningInput: SaveJobOpeningInput,
  ): Promise<JobOpening> {
    return this.jobOpeningRepository.createDraft(shopId, this.validate(saveJobOpeningInput))
  }

  /** Saves against the version the owner edited; a newer row makes the save fail. */
  public async updateJobOpening(
    jobOpening: JobOpening,
    saveJobOpeningInput: SaveJobOpeningInput,
  ): Promise<JobOpening> {
    if (!isJobOpeningContentEditable(jobOpening.status)) {
      throw new Error('Closed or archived job openings cannot be edited.')
    }
    return this.jobOpeningRepository.updateJobOpening(
      jobOpening.id,
      this.validate(saveJobOpeningInput),
      jobOpening.updatedAt,
    )
  }

  public async deleteDraft(jobOpening: JobOpening): Promise<void> {
    if (!isJobOpeningDeletable(jobOpening.status)) {
      throw new Error('Only draft job openings can be deleted.')
    }
    await this.jobOpeningRepository.deleteDraft(jobOpening.id)
  }

  /** Sends the status the owner saw; the database rejects it if the row moved on. */
  public async transition(
    jobOpening: JobOpening,
    toStatus: JobOpeningStatus,
  ): Promise<JobOpening> {
    if (!isJobOpeningTransitionAllowed(jobOpening.status, toStatus)) {
      throw new Error('This job opening status change is not allowed.')
    }
    return this.jobOpeningRepository.transition(jobOpening.id, jobOpening.status, toStatus)
  }

  private validate(saveJobOpeningInput: SaveJobOpeningInput): SaveJobOpeningInput {
    const parseResult = saveJobOpeningInputSchema.safeParse(saveJobOpeningInput)
    if (!parseResult.success) {
      throw new JobOpeningValidationError(parseResult.error)
    }
    return parseResult.data
  }
}
