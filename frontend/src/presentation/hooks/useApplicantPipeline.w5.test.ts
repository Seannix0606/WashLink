import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApplicantPipelineService } from '../../application/services/ApplicantPipelineService'
import { testJobOpeningIdentifier } from '../../test/fixtures'
import {
  buildApplicantProfile,
  buildJobApplication,
  createMockApplicantPipelineRepository,
} from '../../test/jobApplicationFixtures'
import { useApplicantPipeline } from './useApplicantPipeline'

const toastDouble = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('../design/ui', () => ({ applicationToast: toastDouble }))

describe('useApplicantPipeline (W5)', () => {
  afterEach(() => {
    toastDouble.success.mockClear()
    toastDouble.error.mockClear()
  })

  it('w5_stale_transition_error_refreshes_pipeline', async () => {
    const applicantPipelineRepository = createMockApplicantPipelineRepository()
    const seenApplication = buildJobApplication({ status: 'submitted' })
    applicantPipelineRepository.listApplicationsForOpening.mockResolvedValueOnce([seenApplication])
    applicantPipelineRepository.listApplicantProfiles.mockResolvedValue([buildApplicantProfile()])
    const applicantPipelineService = new ApplicantPipelineService(applicantPipelineRepository)

    const { result } = renderHook(() =>
      useApplicantPipeline(applicantPipelineService, testJobOpeningIdentifier, 'published'),
    )
    await waitFor(() => {
      expect(result.current.isLoadingPipeline).toBe(false)
    })
    expect(result.current.pipeline.applications).toEqual([seenApplication])

    // Meanwhile the worker withdrew; the owner's transition is refused as stale (55000).
    applicantPipelineRepository.transition.mockRejectedValue(
      new Error('This application changed. Refresh and try again.'),
    )
    const currentApplication = buildJobApplication({ status: 'withdrawn', withdrawnAt: '2026-10-26T00:00:00+00:00' })
    applicantPipelineRepository.listApplicationsForOpening.mockResolvedValue([currentApplication])
    let didTransition = true
    await act(async () => {
      didTransition = await result.current.transitionApplication(seenApplication, 'under_review')
    })

    expect(didTransition).toBe(false)
    expect(applicantPipelineRepository.transition).toHaveBeenCalledWith(
      seenApplication.id,
      'submitted',
      'under_review',
    )
    expect(toastDouble.error).toHaveBeenCalledWith('This application changed. Refresh and try again.')
    expect(toastDouble.success).not.toHaveBeenCalled()
    // The pipeline was re-read and now shows the current row.
    expect(applicantPipelineRepository.listApplicationsForOpening).toHaveBeenCalledTimes(2)
    expect(result.current.pipeline.applications).toEqual([currentApplication])
    expect(result.current.pendingApplicationId).toBeNull()
  })
})
