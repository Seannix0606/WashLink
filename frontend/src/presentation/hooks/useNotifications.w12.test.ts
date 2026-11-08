import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { inboxPageSize, NotificationService } from '../../application/services/NotificationService'
import type { StoredNotification } from '../../domain/models/AppNotification'
import {
  buildStoredNotification,
  createMockNotificationRepository,
  testOwnerIdentifier,
} from '../../test/fixtures'
import { useNotifications } from './useNotifications'

vi.mock('../design/ui', () => ({ applicationToast: { success: vi.fn(), error: vi.fn() } }))

function buildIdentifier(sequenceNumber: number): string {
  return `00000000-0000-4000-8000-${sequenceNumber.toString(16).padStart(12, '0')}`
}

/** Rows `from`..`from + count - 1`, newest first; two rows share each timestamp so the id tie-break matters. */
function buildPage(fromSequence: number, rowCount: number, category = 'job_application.submitted'): StoredNotification[] {
  return Array.from({ length: rowCount }, (_unused, offset) => {
    const sequenceNumber = fromSequence + offset
    const minute = String(59 - Math.floor(sequenceNumber / 2) % 60).padStart(2, '0')
    return buildStoredNotification({
      identifier: buildIdentifier(1000 - sequenceNumber),
      category,
      createdAt: `2026-10-29T01:${minute}:00.123456+00:00`,
    })
  })
}

describe('useNotifications inbox filters and paging (W12, D-68)', () => {
  it('w12_inbox_unread_only_filter', async () => {
    const notificationRepository = createMockNotificationRepository()
    notificationRepository.listMyNotifications.mockResolvedValue([buildStoredNotification()])
    notificationRepository.countMyUnread.mockResolvedValue(1)
    const notificationService = new NotificationService(notificationRepository)

    const { result } = renderHook(() => useNotifications(notificationService, testOwnerIdentifier))
    await waitFor(() => {
      expect(result.current.isLoadingNotifications).toBe(false)
    })
    expect(notificationRepository.listMyNotifications).toHaveBeenLastCalledWith(inboxPageSize, {
      before: null,
      isUnreadOnly: false,
    })

    notificationRepository.listMyNotifications.mockResolvedValue([])
    act(() => {
      result.current.setUnreadOnly(true)
    })
    // The rows loaded with the other filter are never shown while the unread page loads.
    expect(result.current.isUnreadOnly).toBe(true)
    expect(result.current.isLoadingNotifications).toBe(true)
    expect(result.current.notifications).toEqual([])
    await waitFor(() => {
      expect(result.current.isLoadingNotifications).toBe(false)
    })
    // The database applies the filter (`read_at is null`); the unread count is unchanged by it.
    expect(notificationRepository.listMyNotifications).toHaveBeenLastCalledWith(inboxPageSize, {
      before: null,
      isUnreadOnly: true,
    })
    expect(result.current.notifications).toEqual([])
    expect(result.current.unreadCount).toBe(1)
    expect(result.current.hasOlderNotifications).toBe(false)
  })

  it('w12_inbox_area_filter', async () => {
    const notificationRepository = createMockNotificationRepository()
    notificationRepository.listMyNotifications.mockResolvedValue([
      buildStoredNotification({ identifier: buildIdentifier(1), category: 'job_application.submitted' }),
      buildStoredNotification({ identifier: buildIdentifier(2), category: 'worker_contract' }),
      buildStoredNotification({ identifier: buildIdentifier(3), category: 'future.unknown_category' }),
    ])
    notificationRepository.countMyUnread.mockResolvedValue(3)
    const notificationService = new NotificationService(notificationRepository)

    const { result } = renderHook(() => useNotifications(notificationService, testOwnerIdentifier))
    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(3)
    })
    expect(result.current.notifications.map((notification) => notification.area)).toEqual([
      'applications',
      'contracts',
      'other',
    ])
    const callCountBeforeFilter = notificationRepository.listMyNotifications.mock.calls.length

    act(() => {
      result.current.setAreaFilter('contracts')
    })
    expect(result.current.notifications.map((notification) => notification.identifier)).toEqual([buildIdentifier(2)])
    expect(result.current.loadedNotificationCount).toBe(3)

    // An unknown category is never hidden: it is listed under the generic area.
    act(() => {
      result.current.setAreaFilter('other')
    })
    expect(result.current.notifications.map((notification) => notification.category)).toEqual(['future.unknown_category'])

    act(() => {
      result.current.setAreaFilter('training')
    })
    expect(result.current.notifications).toEqual([])
    expect(result.current.loadedNotificationCount).toBe(3)

    act(() => {
      result.current.setAreaFilter('all')
    })
    expect(result.current.notifications).toHaveLength(3)
    // The area filter is client-side: no extra request.
    expect(notificationRepository.listMyNotifications).toHaveBeenCalledTimes(callCountBeforeFilter)
  })

  it('w12_inbox_load_older_uses_keyset_and_dedupes', async () => {
    const notificationRepository = createMockNotificationRepository()
    const firstPage = buildPage(0, inboxPageSize)
    // The second page repeats the first page's last row (e.g. a concurrent insert shifted it).
    const olderPage = [...buildPage(inboxPageSize - 1, 1), ...buildPage(inboxPageSize, 10)]
    notificationRepository.listMyNotifications.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(olderPage)
    notificationRepository.countMyUnread.mockResolvedValue(60)
    const notificationService = new NotificationService(notificationRepository)

    const { result } = renderHook(() => useNotifications(notificationService, testOwnerIdentifier))
    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(inboxPageSize)
    })
    expect(result.current.hasOlderNotifications).toBe(true)

    await act(async () => {
      await result.current.loadOlderNotifications()
    })
    const lastFirstPageRow = firstPage.at(-1)
    expect(notificationRepository.listMyNotifications).toHaveBeenLastCalledWith(inboxPageSize, {
      before: { createdAt: lastFirstPageRow?.createdAt, identifier: lastFirstPageRow?.identifier },
      isUnreadOnly: false,
    })
    const loadedIdentifiers = result.current.notifications.map((notification) => notification.identifier)
    expect(loadedIdentifiers).toHaveLength(inboxPageSize + 10)
    expect(new Set(loadedIdentifiers).size).toBe(loadedIdentifiers.length)
    expect(result.current.hasOlderNotifications).toBe(false)

    // A poll keeps the older page and adds the new row on top, without duplicates.
    const newestRow = buildStoredNotification({ identifier: buildIdentifier(5000), createdAt: '2026-10-29T02:00:00+00:00' })
    notificationRepository.listMyNotifications.mockResolvedValueOnce([newestRow, ...firstPage.slice(0, inboxPageSize - 1)])
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(inboxPageSize + 11)
    })
    expect(result.current.notifications[0]?.identifier).toBe(buildIdentifier(5000))
    expect(result.current.hasOlderNotifications).toBe(false)

    // A malformed cursor never reaches the repository.
    await expect(
      notificationService.listMyInboxPage({ before: { createdAt: '2026-10-29T01:00:00Z,id.gt.0', identifier: buildIdentifier(1) }, isUnreadOnly: false }),
    ).rejects.toThrow('Older notifications could not be loaded.')
    await expect(
      notificationService.listMyInboxPage({ before: { createdAt: '2026-10-29T01:00:00Z', identifier: 'not-a-uuid' }, isUnreadOnly: false }),
    ).rejects.toThrow('Older notifications could not be loaded.')
  })
})
