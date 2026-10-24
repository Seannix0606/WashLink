import { describe, expect, it } from 'vitest'
import {
  buildStoredNotification,
  createMockNotificationRepository,
  testNotificationIdentifier,
  testSecondNotificationIdentifier,
} from '../../test/fixtures'
import { NotificationService, tooManyNotificationsMessage } from './NotificationService'

function buildSyntheticUuid(sequenceNumber: number): string {
  return `00000000-0000-4000-8000-${sequenceNumber.toString(16).padStart(12, '0')}`
}

describe('NotificationService (W3 notifications)', () => {
  it('w3_notification_service_dedupes_and_limits_mark_read_ids', async () => {
    const notificationRepository = createMockNotificationRepository()
    notificationRepository.markRead.mockResolvedValue(2)
    const notificationService = new NotificationService(notificationRepository)

    await expect(
      notificationService.markRead([
        testNotificationIdentifier,
        testSecondNotificationIdentifier,
        testNotificationIdentifier,
        'not-a-uuid',
      ]),
    ).resolves.toBe(2)
    expect(notificationRepository.markRead).toHaveBeenCalledWith([
      testNotificationIdentifier,
      testSecondNotificationIdentifier,
    ])

    // Nothing valid to mark: no request at all.
    notificationRepository.markRead.mockClear()
    await expect(notificationService.markRead(['not-a-uuid'])).resolves.toBe(0)
    expect(notificationRepository.markRead).not.toHaveBeenCalled()

    // 200 unique ids (duplicates removed first) are allowed; 201 are rejected before any request.
    const twoHundredIdentifiers = Array.from({ length: 200 }, (_unused, index) =>
      buildSyntheticUuid(index),
    )
    await notificationService.markRead([...twoHundredIdentifiers, ...twoHundredIdentifiers])
    expect(notificationRepository.markRead).toHaveBeenCalledWith(twoHundredIdentifiers)
    notificationRepository.markRead.mockClear()
    await expect(
      notificationService.markRead([...twoHundredIdentifiers, buildSyntheticUuid(500)]),
    ).rejects.toThrow(tooManyNotificationsMessage)
    expect(notificationRepository.markRead).not.toHaveBeenCalled()

    await notificationService.markAllRead()
    expect(notificationRepository.markRead).toHaveBeenCalledWith(null)
  })

  it('w3_notification_service_maps_rows_to_app_notifications', async () => {
    const notificationRepository = createMockNotificationRepository()
    notificationRepository.listMyNotifications.mockResolvedValue([
      buildStoredNotification(),
      buildStoredNotification({
        identifier: testSecondNotificationIdentifier,
        category: 'future.unknown_category',
        title: '<b>Plain</b> title',
        readAt: '2026-10-24T02:00:00+00:00',
      }),
    ])
    const notificationService = new NotificationService(notificationRepository)

    const appNotifications = await notificationService.listMyNotifications()

    expect(notificationRepository.listMyNotifications).toHaveBeenCalledWith(20)
    expect(appNotifications).toEqual([
      {
        identifier: testNotificationIdentifier,
        category: 'shop_verification.status_changed',
        title: 'Shop verification updated',
        body: 'Test Shop is now Approved.',
        createdAt: '2026-10-24T00:00:00+00:00',
        isRead: false,
      },
      {
        identifier: testSecondNotificationIdentifier,
        category: 'future.unknown_category',
        title: '<b>Plain</b> title',
        body: 'Test Shop is now Approved.',
        createdAt: '2026-10-24T00:00:00+00:00',
        isRead: true,
      },
    ])

    // Page size is clamped to 1..50.
    await notificationService.listMyNotifications(500)
    await notificationService.listMyNotifications(0)
    expect(notificationRepository.listMyNotifications).toHaveBeenNthCalledWith(2, 50)
    expect(notificationRepository.listMyNotifications).toHaveBeenNthCalledWith(3, 1)
  })
})
