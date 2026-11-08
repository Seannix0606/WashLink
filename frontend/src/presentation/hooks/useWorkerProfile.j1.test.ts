import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkerProfileService } from '../../application/services/WorkerProfileService'
import {
  buildWorkerProfile,
  createMockWorkerProfileRepository,
} from '../../test/fixtures'
import { useWorkerProfile } from './useWorkerProfile'

describe('useWorkerProfile (J1 worker profile)', () => {
  it('j1_use_worker_profile_loading_empty_error_states', async () => {
    // Empty: loads, then reports no profile.
    const emptyRepository = createMockWorkerProfileRepository()
    emptyRepository.fetchOwnWorkerProfile.mockResolvedValue({
      workerProfile: null,
      workerPrivateContact: null,
    })
    const emptyService = new WorkerProfileService(emptyRepository)
    const emptyHook = renderHook(() => useWorkerProfile(emptyService))
    expect(emptyHook.result.current.isLoadingWorkerProfile).toBe(true)
    expect(emptyHook.result.current.isWorkerProfileEmpty).toBe(false)
    await waitFor(() => {
      expect(emptyHook.result.current.isLoadingWorkerProfile).toBe(false)
    })
    expect(emptyHook.result.current.isWorkerProfileEmpty).toBe(true)
    expect(emptyHook.result.current.workerProfileErrorMessage).toBeNull()

    // Error: shows the mapped message, not empty; retry recovers.
    const failingRepository = createMockWorkerProfileRepository()
    failingRepository.fetchOwnWorkerProfile.mockRejectedValueOnce(
      new Error('Could not load your worker profile.'),
    )
    const storedProfile = buildWorkerProfile({ headline: 'Detailer' })
    failingRepository.fetchOwnWorkerProfile.mockResolvedValueOnce({
      workerProfile: storedProfile,
      workerPrivateContact: null,
    })
    const failingService = new WorkerProfileService(failingRepository)
    const failingHook = renderHook(() => useWorkerProfile(failingService))
    await waitFor(() => {
      expect(failingHook.result.current.workerProfileErrorMessage).toBe(
        'Could not load your worker profile.',
      )
    })
    expect(failingHook.result.current.isWorkerProfileEmpty).toBe(false)

    await act(async () => {
      await failingHook.result.current.reloadWorkerProfile()
    })
    expect(failingHook.result.current.workerProfileErrorMessage).toBeNull()
    expect(failingHook.result.current.workerProfile).toEqual(storedProfile)
  })
})
