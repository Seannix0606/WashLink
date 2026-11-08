import { describe, expect, it } from 'vitest'
import type {
  SaveWorkerPrivateContactInput,
  SaveWorkerProfileInput,
} from '../../domain/models/WorkerProfile'
import {
  buildWorkerProfile,
  createMockWorkerProfileRepository,
} from '../../test/fixtures'
import { WorkerProfileService } from './WorkerProfileService'

const validProfileInput: SaveWorkerProfileInput = {
  headline: '  Car wash attendant  ',
  experienceSummary: '',
  yearsOfExperience: 3,
  skills: ['Hand wash', 'Interior cleaning'],
  preferredLocations: ['Test City'],
  availabilityStatus: 'part_time',
  availabilityNotes: null,
}

const emptyContactInput: SaveWorkerPrivateContactInput = {
  contactPhone: null,
  contactEmail: null,
  preferredContactMethod: null,
}

describe('WorkerProfileService (J1 worker profile)', () => {
  it('j1_worker_profile_service_validates_and_saves', async () => {
    const workerProfileRepository = createMockWorkerProfileRepository()
    const savedProfile = buildWorkerProfile({ headline: 'Car wash attendant' })
    workerProfileRepository.upsertOwnWorkerProfile.mockResolvedValue(savedProfile)
    workerProfileRepository.upsertOwnWorkerPrivateContact.mockResolvedValue({
      contactPhone: '+63 900 000 0000',
      contactEmail: 'worker@local.test',
      preferredContactMethod: 'email',
    })
    const workerProfileService = new WorkerProfileService(workerProfileRepository)

    // Invalid input never reaches the repository.
    await expect(
      workerProfileService.saveOwnWorkerProfile(
        { ...validProfileInput, yearsOfExperience: 61 },
        emptyContactInput,
      ),
    ).rejects.toThrow('Years of experience must be 60 or less.')
    await expect(
      workerProfileService.saveOwnWorkerProfile(validProfileInput, {
        ...emptyContactInput,
        contactPhone: 'call me',
      }),
    ).rejects.toThrow('Use 7 to 20 digits')
    expect(workerProfileRepository.upsertOwnWorkerProfile).not.toHaveBeenCalled()

    const savedOwnProfile = await workerProfileService.saveOwnWorkerProfile(
      validProfileInput,
      {
        contactPhone: '+63 900 000 0000',
        contactEmail: ' Worker@Local.Test ',
        preferredContactMethod: 'email',
      },
    )

    expect(workerProfileRepository.upsertOwnWorkerProfile).toHaveBeenCalledWith({
      ...validProfileInput,
      headline: 'Car wash attendant',
      experienceSummary: null,
    })
    expect(workerProfileRepository.upsertOwnWorkerPrivateContact).toHaveBeenCalledWith({
      contactPhone: '+63 900 000 0000',
      contactEmail: 'worker@local.test',
      preferredContactMethod: 'email',
    })
    expect(savedOwnProfile.workerProfile).toBe(savedProfile)

    // An all-empty contact removes the stored contact instead of saving nulls.
    const savedWithoutContact = await workerProfileService.saveOwnWorkerProfile(
      validProfileInput,
      emptyContactInput,
    )
    expect(workerProfileRepository.deleteOwnWorkerPrivateContact).toHaveBeenCalledTimes(1)
    expect(savedWithoutContact.workerPrivateContact).toBeNull()
  })
})
