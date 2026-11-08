import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RosterLinkService } from '../../application/services/RosterLinkService'
import { createMockRosterLinkRepository } from '../../test/fixtures'
import { useAcceptRosterLinkCode } from './useAcceptRosterLinkCode'

vi.mock('../design/ui', () => ({
  applicationToast: { success: vi.fn(), error: vi.fn() },
}))

describe('useAcceptRosterLinkCode (J1 roster links, C8 consent)', () => {
  it('j1_accept_roster_link_code_states', async () => {
    const rosterLinkRepository = createMockRosterLinkRepository()
    rosterLinkRepository.previewRosterLinkCode
      .mockResolvedValueOnce({
        result: 'invalid_or_expired',
        rosterDisplayName: null,
        ownerShopNames: [],
      })
      .mockResolvedValueOnce({
        result: 'valid',
        rosterDisplayName: 'Test Worker',
        ownerShopNames: ['Test Shop'],
      })
    rosterLinkRepository.acceptRosterLinkCode.mockResolvedValue('linked')
    const rosterLinkService = new RosterLinkService(rosterLinkRepository)
    const onRosterLinked = vi.fn()

    const { result } = renderHook(() =>
      useAcceptRosterLinkCode({ rosterLinkService, onRosterLinked }),
    )
    expect(result.current.phase).toBe('entering')

    // A malformed code is rejected locally, before any RPC.
    act(() => {
      result.current.setEnteredLinkCode('abc')
    })
    await act(async () => {
      await result.current.checkLinkCode()
    })
    expect(result.current.phase).toBe('entering')
    expect(result.current.isFeedbackError).toBe(true)
    expect(rosterLinkRepository.previewRosterLinkCode).not.toHaveBeenCalled()

    // Server says invalid: back to entering with a readable message.
    act(() => {
      result.current.setEnteredLinkCode('4f2a-9c7b-1d3e')
    })
    await act(async () => {
      await result.current.checkLinkCode()
    })
    expect(rosterLinkRepository.previewRosterLinkCode).toHaveBeenLastCalledWith('4F2A9C7B1D3E')
    expect(result.current.phase).toBe('entering')
    expect(result.current.feedbackMessage).toMatch(/not valid or has expired/)

    // Valid preview waits for explicit consent; nothing is linked yet.
    await act(async () => {
      await result.current.checkLinkCode()
    })
    expect(result.current.phase).toBe('confirming')
    expect(result.current.validPreview?.ownerShopNames).toEqual(['Test Shop'])
    expect(rosterLinkRepository.acceptRosterLinkCode).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.confirmRosterLink()
    })
    expect(rosterLinkRepository.acceptRosterLinkCode).toHaveBeenCalledWith('4F2A9C7B1D3E')
    expect(result.current.phase).toBe('linked')
    expect(onRosterLinked).toHaveBeenCalledTimes(1)
  })
})
