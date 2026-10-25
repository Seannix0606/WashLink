import { describe, expect, it } from 'vitest'
import { JobOpeningService } from '../../application/services/JobOpeningService'
import { buildJobOpening, createMockJobOpeningRepository } from '../../test/fixtures'
import { jobOpeningStatuses, type JobOpeningStatus } from '../models/JobOpening'
import {
  allowedJobOpeningTransitions,
  isJobOpeningContentEditable,
  isJobOpeningDeletable,
  isJobOpeningTransitionAllowed,
} from './jobOpeningLifecycle'

const allowedPairs: readonly (readonly [JobOpeningStatus, JobOpeningStatus])[] = [
  ['draft', 'published'],
  ['published', 'paused'],
  ['paused', 'published'],
  ['published', 'closed'],
  ['paused', 'closed'],
  ['closed', 'archived'],
]

describe('Job opening lifecycle (J2)', () => {
  it('j2_job_opening_lifecycle_offers_only_allowed_transitions', async () => {
    // Every one of the 25 status pairs: only the six matrix pairs are offered.
    for (const fromStatus of jobOpeningStatuses) {
      for (const toStatus of jobOpeningStatuses) {
        const isInMatrix = allowedPairs.some(
          ([allowedFrom, allowedTo]) => allowedFrom === fromStatus && allowedTo === toStatus,
        )
        expect(isJobOpeningTransitionAllowed(fromStatus, toStatus)).toBe(isInMatrix)
      }
    }
    expect(allowedJobOpeningTransitions('closed')).toEqual(['archived'])
    expect(allowedJobOpeningTransitions('archived')).toEqual([])
    expect(jobOpeningStatuses.filter(isJobOpeningContentEditable)).toEqual(['draft', 'published', 'paused'])
    expect(jobOpeningStatuses.filter(isJobOpeningDeletable)).toEqual(['draft'])

    // The service refuses a disallowed change (e.g. reopening) before any request.
    const jobOpeningRepository = createMockJobOpeningRepository()
    const jobOpeningService = new JobOpeningService(jobOpeningRepository)
    await expect(
      jobOpeningService.transition(buildJobOpening({ status: 'closed' }), 'published'),
    ).rejects.toThrow('This job opening status change is not allowed.')
    await expect(jobOpeningService.deleteDraft(buildJobOpening({ status: 'published' }))).rejects.toThrow(
      'Only draft job openings can be deleted.',
    )
    await expect(
      jobOpeningService.updateJobOpening(buildJobOpening({ status: 'archived' }), buildJobOpening()),
    ).rejects.toThrow('Closed or archived job openings cannot be edited.')
    expect(jobOpeningRepository.transition).not.toHaveBeenCalled()
    expect(jobOpeningRepository.deleteDraft).not.toHaveBeenCalled()
    expect(jobOpeningRepository.updateJobOpening).not.toHaveBeenCalled()

    // An allowed change sends the status the owner saw, so a stale row is rejected by the RPC.
    const pausedJobOpening = buildJobOpening({ status: 'paused' })
    jobOpeningRepository.transition.mockResolvedValue(buildJobOpening({ status: 'closed' }))
    await jobOpeningService.transition(pausedJobOpening, 'closed')
    expect(jobOpeningRepository.transition).toHaveBeenCalledWith(pausedJobOpening.id, 'paused', 'closed')
  })
})
