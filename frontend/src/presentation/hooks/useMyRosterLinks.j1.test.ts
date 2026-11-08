import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RosterLinkService } from '../../application/services/RosterLinkService'
import {
  buildRosterLinkEntry,
  createMockRosterLinkRepository,
  testSecondWorkerRowIdentifier,
  testWorkerRowIdentifier,
} from '../../test/fixtures'
import { useMyRosterLinks } from './useMyRosterLinks'

vi.mock('../design/ui', () => ({
  applicationToast: { success: vi.fn(), error: vi.fn() },
}))

describe('useMyRosterLinks (J1 roster links, F6)', () => {
  it('j1_use_my_roster_links_handles_multiple_entries', async () => {
    const rosterLinkRepository = createMockRosterLinkRepository()
    const firstEntry = buildRosterLinkEntry({ ownerShopNames: ['Shop One'] })
    const secondEntry = buildRosterLinkEntry({
      workerRowIdentifier: testSecondWorkerRowIdentifier,
      rosterDisplayName: 'Test Worker B',
      ownerShopNames: ['Shop Two', 'Shop Three'],
    })
    rosterLinkRepository.listMyRosterLinks.mockResolvedValue([firstEntry, secondEntry])
    rosterLinkRepository.unlinkMyRosterEntry.mockResolvedValue()
    const rosterLinkService = new RosterLinkService(rosterLinkRepository)

    const { result } = renderHook(() => useMyRosterLinks(rosterLinkService))
    expect(result.current.isLoadingRosterLinks).toBe(true)
    await waitFor(() => {
      expect(result.current.isLoadingRosterLinks).toBe(false)
    })

    // More than one roster is no longer an error (the old .single() lookup failed here).
    expect(result.current.rosterLinksErrorMessage).toBeNull()
    expect(result.current.rosterLinkEntries).toHaveLength(2)
    expect(result.current.selectedRosterEntry).toEqual(firstEntry)

    act(() => {
      result.current.selectRosterEntry(testSecondWorkerRowIdentifier)
    })
    expect(result.current.selectedRosterEntry).toEqual(secondEntry)

    await act(async () => {
      await result.current.unlinkRosterEntry(testSecondWorkerRowIdentifier)
    })
    expect(rosterLinkRepository.unlinkMyRosterEntry).toHaveBeenCalledWith(
      testSecondWorkerRowIdentifier,
    )
    expect(result.current.rosterLinkEntries).toEqual([firstEntry])
    expect(result.current.selectedRosterEntry?.workerRowIdentifier).toBe(
      testWorkerRowIdentifier,
    )
  })
})
