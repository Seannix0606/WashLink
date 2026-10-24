import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotificationService } from '../../application/services/NotificationService'
import {
  buildStoredNotification,
  createMockNotificationRepository,
  testNotificationIdentifier,
  testOwnerIdentifier,
  testSecondNotificationIdentifier,
} from '../../test/fixtures'
import { notificationPollIntervalMilliseconds, useNotifications } from './useNotifications'

const toastDouble = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('../design/ui', () => ({ applicationToast: toastDouble }))

function setDocumentVisibility(visibilityState: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: (): DocumentVisibilityState => visibilityState,
  })
}

describe('useNotifications (W3 notifications)', () => {
  afterEach(() => {
    vi.useRealTimers()
    setDocumentVisibility('visible')
    toastDouble.error.mockClear()
  })

  it('w3_use_notifications_loading_empty_error_states', async () => {
    const notificationRepository = createMockNotificationRepository()
    notificationRepository.listMyNotifications.mockResolvedValue([])
    notificationRepository.countMyUnread.mockResolvedValue(0)
    const notificationService = new NotificationService(notificationRepository)

    const { result, rerender } = renderHook(
      ({ recipientIdentifier }: { recipientIdentifier: string | null }) =>
        useNotifications(notificationService, recipientIdentifier),
      { initialProps: { recipientIdentifier: testOwnerIdentifier as string | null } },
    )
    expect(result.current.isLoadingNotifications).toBe(true)
    await waitFor(() => {
      expect(result.current.isLoadingNotifications).toBe(false)
    })
    expect(result.current.notifications).toEqual([])
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.notificationsErrorMessage).toBeNull()

    notificationRepository.listMyNotifications.mockRejectedValue(
      new Error('Could not load your notifications.'),
    )
    await act(async () => {
      await result.current.reloadNotifications()
    })
    expect(result.current.isLoadingNotifications).toBe(false)
    expect(result.current.notificationsErrorMessage).toBe('Could not load your notifications.')

    notificationRepository.listMyNotifications.mockResolvedValue([buildStoredNotification()])
    notificationRepository.countMyUnread.mockResolvedValue(1)
    await act(async () => {
      await result.current.reloadNotifications()
    })
    expect(result.current.notificationsErrorMessage).toBeNull()
    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.unreadCount).toBe(1)

    // Signed out: nothing from the previous account is exposed.
    rerender({ recipientIdentifier: null })
    expect(result.current.notifications).toEqual([])
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.isLoadingNotifications).toBe(false)
  })

  it('w3_use_notifications_mark_read_updates_unread_count', async () => {
    const notificationRepository = createMockNotificationRepository()
    notificationRepository.listMyNotifications.mockResolvedValue([
      buildStoredNotification(),
      buildStoredNotification({ identifier: testSecondNotificationIdentifier }),
    ])
    notificationRepository.countMyUnread.mockResolvedValue(2)
    notificationRepository.markRead.mockResolvedValue(1)
    const notificationService = new NotificationService(notificationRepository)

    const { result } = renderHook(() =>
      useNotifications(notificationService, testOwnerIdentifier),
    )
    await waitFor(() => {
      expect(result.current.unreadCount).toBe(2)
    })

    await act(async () => {
      await result.current.markRead(testNotificationIdentifier)
    })
    expect(notificationRepository.markRead).toHaveBeenCalledWith([testNotificationIdentifier])
    expect(result.current.unreadCount).toBe(1)
    expect(result.current.notifications[0]?.isRead).toBe(true)

    // A failed request rolls the optimistic change back and shows an error toast.
    notificationRepository.markRead.mockRejectedValue(
      new Error('Could not mark notifications as read.'),
    )
    await act(async () => {
      await result.current.markRead(testSecondNotificationIdentifier)
    })
    expect(result.current.unreadCount).toBe(1)
    expect(result.current.notifications[1]?.isRead).toBe(false)
    expect(toastDouble.error).toHaveBeenCalledWith('Could not mark notifications as read.')
  })

  it('w3_use_notifications_polls_and_refreshes_on_focus', async () => {
    vi.useFakeTimers()
    const notificationRepository = createMockNotificationRepository()
    notificationRepository.listMyNotifications.mockResolvedValue([])
    notificationRepository.countMyUnread.mockResolvedValue(0)
    const notificationService = new NotificationService(notificationRepository)

    const { unmount } = renderHook(() =>
      useNotifications(notificationService, testOwnerIdentifier),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(notificationRepository.listMyNotifications).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(notificationPollIntervalMilliseconds)
    })
    expect(notificationRepository.listMyNotifications).toHaveBeenCalledTimes(2)

    // Hidden tab: the poll tick is skipped.
    setDocumentVisibility('hidden')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(notificationPollIntervalMilliseconds)
    })
    expect(notificationRepository.listMyNotifications).toHaveBeenCalledTimes(2)

    setDocumentVisibility('visible')
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(notificationRepository.listMyNotifications).toHaveBeenCalledTimes(3)
    expect(notificationRepository.countMyUnread).toHaveBeenCalledTimes(3)

    // Unmount (and sign-out, which unmounts the bell) stops polling and focus refreshes.
    unmount()
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(notificationPollIntervalMilliseconds * 3)
    expect(notificationRepository.listMyNotifications).toHaveBeenCalledTimes(3)
  })
})
