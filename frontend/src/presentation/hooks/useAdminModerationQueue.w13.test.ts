import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AdminModerationQueuePage, ModerationQueueFilter } from '../../domain/models/JobOpeningModeration'
import { buildQueueItem, createModerationTestHarness } from '../../test/moderationFixtures'
import { useAdminModerationQueue } from './useAdminModerationQueue'

// Synthetic W13 queue rows; ids are well-formed so the cursor check accepts them.
const caseA = buildQueueItem({ caseId: 'c0000000-0000-4000-8000-00000000000a', openedAt: '2026-10-20T01:00:00Z', openingTitleSnapshot: 'Opening A' })
const caseB = buildQueueItem({ caseId: 'c0000000-0000-4000-8000-00000000000b', openedAt: '2026-10-21T01:00:00Z', openingTitleSnapshot: 'Opening B' })
const caseC = buildQueueItem({ caseId: 'c0000000-0000-4000-8000-00000000000c', openedAt: '2026-10-22T01:00:00Z', openingTitleSnapshot: 'Opening C' })

function deferredPage(): { readonly promise: Promise<AdminModerationQueuePage>; readonly resolve: (page: AdminModerationQueuePage) => void } {
  let resolvePage: (page: AdminModerationQueuePage) => void = () => undefined
  const promise = new Promise<AdminModerationQueuePage>((resolve) => {
    resolvePage = resolve
  })
  return { promise, resolve: resolvePage }
}

describe('useAdminModerationQueue paging (W13, D-71)', () => {
  it('w13_queue_hook_loads_more_with_keyset_cursor_and_dedupes', async () => {
    const harness = createModerationTestHarness()
    const pageMock = harness.moderationRepository.listAdminQueuePage
    pageMock.mockResolvedValue({ items: [caseA, caseB], totalCount: 4 })

    const { result } = renderHook(() => useAdminModerationQueue(harness.jobOpeningModerationService, 'active', 2))
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(pageMock).toHaveBeenNthCalledWith(1, 'active', null, 2)
    expect(result.current.items.map((item) => item.caseId)).toEqual([caseA.caseId, caseB.caseId])
    expect(result.current.totalCount).toBe(4)
    expect(result.current.hasMore).toBe(true)

    // The first page refreshes on focus (W14 queue pattern) while no further page is shown.
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await Promise.resolve()
    })
    expect(pageMock).toHaveBeenCalledTimes(2)
    expect(pageMock).toHaveBeenNthCalledWith(2, 'active', null, 2)
    expect(result.current.items).toHaveLength(2)
    pageMock.mockReset()
    pageMock
      // Case B moved while paging: the next page repeats it; it is shown once.
      .mockResolvedValueOnce({ items: [caseB, caseC], totalCount: 4 })
      // An empty page is the end; the last known total stays.
      .mockResolvedValueOnce({ items: [], totalCount: null })

    await act(async () => {
      await result.current.loadMore()
    })
    expect(pageMock).toHaveBeenNthCalledWith(1, 'active', { afterOpenedAt: caseB.openedAt, afterCaseId: caseB.caseId }, 2)
    expect(result.current.items.map((item) => item.caseId)).toEqual([caseA.caseId, caseB.caseId, caseC.caseId])
    expect(result.current.totalCount).toBe(4)
    expect(result.current.hasMore).toBe(true)

    // Once more than one page is shown, focus no longer re-reads (the list would collapse).
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(pageMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.loadMore()
    })
    expect(pageMock).toHaveBeenNthCalledWith(2, 'active', { afterOpenedAt: caseC.openedAt, afterCaseId: caseC.caseId }, 2)
    expect(result.current.items).toHaveLength(3)
    expect(result.current.totalCount).toBe(4)
    expect(result.current.hasMore).toBe(false)

    // No further request after the end.
    await act(async () => {
      await result.current.loadMore()
    })
    expect(pageMock).toHaveBeenCalledTimes(2)
    expect(harness.moderationRepository.listAdminQueue).not.toHaveBeenCalled()
  })

  it('w13_queue_hook_resets_on_filter_change', async () => {
    const harness = createModerationTestHarness()
    const pageMock = harness.moderationRepository.listAdminQueuePage
    pageMock.mockResolvedValueOnce({ items: [caseA, caseB], totalCount: 3 })
    const { result, rerender } = renderHook(
      ({ filter }: { readonly filter: ModerationQueueFilter }) => useAdminModerationQueue(harness.jobOpeningModerationService, filter, 2),
      { initialProps: { filter: 'active' as ModerationQueueFilter } },
    )
    await waitFor(() => {
      expect(result.current.items).toHaveLength(2)
    })

    // A "Load more" still in flight when the filter changes is dropped.
    const slowNextPage = deferredPage()
    pageMock.mockReturnValueOnce(slowNextPage.promise)
    let pendingLoadMore: Promise<void> = Promise.resolve()
    act(() => {
      pendingLoadMore = result.current.loadMore()
    })
    expect(result.current.isLoadingMore).toBe(true)

    pageMock.mockResolvedValueOnce({ items: [caseC], totalCount: 1 })
    rerender({ filter: 'dismissed' })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.items).toEqual([])
    expect(result.current.totalCount).toBeNull()
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(pageMock).toHaveBeenLastCalledWith('dismissed', null, 2)
    expect(result.current.items.map((item) => item.caseId)).toEqual([caseC.caseId])
    expect(result.current.totalCount).toBe(1)
    expect(result.current.hasMore).toBe(false)

    await act(async () => {
      slowNextPage.resolve({ items: [caseB, caseC], totalCount: 3 })
      await pendingLoadMore
    })
    expect(result.current.items.map((item) => item.caseId)).toEqual([caseC.caseId])
    expect(result.current.totalCount).toBe(1)
    expect(result.current.isLoadingMore).toBe(false)
  })
})
