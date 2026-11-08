import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobOpeningService } from '../../application/services/JobOpeningService'
import {
  buildJobOpening,
  createMockJobOpeningRepository,
  testShopIdentifier,
} from '../../test/fixtures'
import { useOwnerJobOpenings } from './useOwnerJobOpenings'

const toastDouble = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('../design/ui', () => ({ applicationToast: toastDouble }))

const ownerShopIds = [testShopIdentifier]

describe('useOwnerJobOpenings (W4 job openings)', () => {
  afterEach(() => {
    toastDouble.success.mockClear()
    toastDouble.error.mockClear()
  })

  it('w4_use_owner_job_openings_loading_empty_error_states', async () => {
    const jobOpeningRepository = createMockJobOpeningRepository()
    jobOpeningRepository.listOwnJobOpenings.mockResolvedValue([])
    jobOpeningRepository.isShopVerifiedForPublishing.mockResolvedValue(false)
    const jobOpeningService = new JobOpeningService(jobOpeningRepository)

    const { result } = renderHook(() => useOwnerJobOpenings(jobOpeningService, ownerShopIds))
    expect(result.current.isLoadingJobOpenings).toBe(true)
    expect(result.current.isJobOpeningListEmpty).toBe(false)
    await waitFor(() => {
      expect(result.current.isLoadingJobOpenings).toBe(false)
    })
    expect(result.current.isJobOpeningListEmpty).toBe(true)
    expect(result.current.jobOpeningsErrorMessage).toBeNull()
    expect(result.current.shopPublishEligibility).toEqual({ [testShopIdentifier]: false })
    expect(jobOpeningRepository.isShopVerifiedForPublishing).toHaveBeenCalledWith(testShopIdentifier)

    // Error: the mapped message is shown and the view is not "empty".
    jobOpeningRepository.listOwnJobOpenings.mockRejectedValue(new Error('Could not load your job openings.'))
    await act(async () => {
      await result.current.reloadJobOpenings()
    })
    expect(result.current.jobOpeningsErrorMessage).toBe('Could not load your job openings.')
    expect(result.current.isJobOpeningListEmpty).toBe(false)
    expect(result.current.isLoadingJobOpenings).toBe(false)

    // Retry recovers with data.
    jobOpeningRepository.listOwnJobOpenings.mockResolvedValue([buildJobOpening()])
    jobOpeningRepository.isShopVerifiedForPublishing.mockResolvedValue(true)
    await act(async () => {
      await result.current.reloadJobOpenings()
    })
    expect(result.current.jobOpeningsErrorMessage).toBeNull()
    expect(result.current.jobOpenings).toHaveLength(1)
    expect(result.current.shopPublishEligibility[testShopIdentifier]).toBe(true)
  })

  it('w4_use_owner_job_openings_transition_refreshes_and_reports_errors', async () => {
    const draftJobOpening = buildJobOpening()
    const jobOpeningRepository = createMockJobOpeningRepository()
    jobOpeningRepository.listOwnJobOpenings.mockResolvedValue([draftJobOpening])
    jobOpeningRepository.isShopVerifiedForPublishing.mockResolvedValue(true)
    const jobOpeningService = new JobOpeningService(jobOpeningRepository)
    const { result } = renderHook(() => useOwnerJobOpenings(jobOpeningService, ownerShopIds))
    await waitFor(() => {
      expect(result.current.jobOpenings).toHaveLength(1)
    })
    expect(jobOpeningRepository.listOwnJobOpenings).toHaveBeenCalledTimes(1)

    // Success: RPC with the status the owner saw, success toast, list re-read from the server.
    const publishedJobOpening = buildJobOpening({ status: 'published' })
    jobOpeningRepository.transition.mockResolvedValue(publishedJobOpening)
    jobOpeningRepository.listOwnJobOpenings.mockResolvedValue([publishedJobOpening])
    let didTransition = false
    await act(async () => {
      didTransition = await result.current.transitionJobOpening(draftJobOpening, 'published')
    })
    expect(didTransition).toBe(true)
    expect(jobOpeningRepository.transition).toHaveBeenCalledWith(draftJobOpening.id, 'draft', 'published')
    expect(toastDouble.success).toHaveBeenCalledWith('Job opening published.')
    expect(jobOpeningRepository.listOwnJobOpenings).toHaveBeenCalledTimes(2)
    expect(result.current.jobOpenings[0]?.status).toBe('published')
    expect(result.current.pendingJobOpeningId).toBeNull()

    // Stale request: the database message is shown and the list is refreshed anyway.
    jobOpeningRepository.transition.mockRejectedValue(new Error('This job opening changed. Refresh and try again.'))
    const closedJobOpening = buildJobOpening({ status: 'closed' })
    jobOpeningRepository.listOwnJobOpenings.mockResolvedValue([closedJobOpening])
    await act(async () => {
      didTransition = await result.current.transitionJobOpening(publishedJobOpening, 'paused')
    })
    expect(didTransition).toBe(false)
    expect(toastDouble.error).toHaveBeenCalledWith('This job opening changed. Refresh and try again.')
    expect(jobOpeningRepository.listOwnJobOpenings).toHaveBeenCalledTimes(3)
    expect(result.current.jobOpenings[0]?.status).toBe('closed')

    // Delete with 0 rows affected is a failure, not a silent success.
    jobOpeningRepository.deleteDraft.mockRejectedValue(new Error('Only draft job openings can be deleted.'))
    let didDelete = true
    await act(async () => {
      didDelete = await result.current.deleteJobOpeningDraft(draftJobOpening)
    })
    expect(didDelete).toBe(false)
    expect(toastDouble.error).toHaveBeenLastCalledWith('Only draft job openings can be deleted.')
    expect(jobOpeningRepository.listOwnJobOpenings).toHaveBeenCalledTimes(4)
  })
})
