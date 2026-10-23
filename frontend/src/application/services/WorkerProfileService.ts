import type { z } from 'zod'
import type {
  OwnWorkerProfile,
  SaveWorkerPrivateContactInput,
  SaveWorkerProfileInput,
} from '../../domain/models/WorkerProfile'
import type { WorkerProfileRepository } from '../../domain/repositories/WorkerProfileRepository'
import {
  isWorkerPrivateContactEmpty,
  saveWorkerPrivateContactInputSchema,
  saveWorkerProfileInputSchema,
} from '../validation/workerProfileSchemas'

export class WorkerProfileValidationError extends Error {
  public constructor(validationError: z.ZodError) {
    super(validationError.issues.at(0)?.message ?? 'Check your worker profile details.')
    this.name = 'WorkerProfileValidationError'
  }
}

function parseOrThrow<Output>(
  schema: z.ZodType<Output>,
  candidateInput: unknown,
): Output {
  const parseResult = schema.safeParse(candidateInput)
  if (!parseResult.success) {
    throw new WorkerProfileValidationError(parseResult.error)
  }
  return parseResult.data
}

export class WorkerProfileService {
  public constructor(
    private readonly workerProfileRepository: WorkerProfileRepository,
  ) {}

  public async loadOwnWorkerProfile(): Promise<OwnWorkerProfile> {
    return this.workerProfileRepository.fetchOwnWorkerProfile()
  }

  /**
   * Validates both parts first, then saves the profile and its private contact.
   * An all-empty contact removes the stored contact row instead of saving nulls.
   */
  public async saveOwnWorkerProfile(
    saveWorkerProfileInput: SaveWorkerProfileInput,
    saveWorkerPrivateContactInput: SaveWorkerPrivateContactInput,
  ): Promise<OwnWorkerProfile> {
    const validatedProfileInput = parseOrThrow(
      saveWorkerProfileInputSchema,
      saveWorkerProfileInput,
    )
    const validatedContactInput = parseOrThrow(
      saveWorkerPrivateContactInputSchema,
      saveWorkerPrivateContactInput,
    )

    const savedWorkerProfile =
      await this.workerProfileRepository.upsertOwnWorkerProfile(validatedProfileInput)

    if (isWorkerPrivateContactEmpty(validatedContactInput)) {
      await this.workerProfileRepository.deleteOwnWorkerPrivateContact()
      return { workerProfile: savedWorkerProfile, workerPrivateContact: null }
    }

    const savedWorkerPrivateContact =
      await this.workerProfileRepository.upsertOwnWorkerPrivateContact(
        validatedContactInput,
      )
    return {
      workerProfile: savedWorkerProfile,
      workerPrivateContact: savedWorkerPrivateContact,
    }
  }

  public async deleteOwnWorkerProfile(): Promise<void> {
    await this.workerProfileRepository.deleteOwnWorkerProfile()
  }
}
