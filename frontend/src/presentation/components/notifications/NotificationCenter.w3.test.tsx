import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { NotificationService } from '../../../application/services/NotificationService'
import {
  buildStoredNotification,
  createMockNotificationRepository,
  testOwnerIdentifier,
  testSecondNotificationIdentifier,
} from '../../../test/fixtures'
import { NotificationBell } from './NotificationBell'
import { NotificationCenter } from './NotificationCenter'

describe('Notification bell and panel (W3 notifications)', () => {
  it('w3_notification_bell_shows_unread_count_and_accessible_label', () => {
    const { rerender } = render(
      <NotificationBell unreadCount={3} isPanelOpen={false} onOpenRequested={(): void => undefined} />,
    )
    const bellButton = screen.getByRole('button', { name: 'Notifications, 3 unread' })
    expect(bellButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('3')

    rerender(
      <NotificationBell unreadCount={150} isPanelOpen onOpenRequested={(): void => undefined} />,
    )
    expect(screen.getByRole('button', { name: 'Notifications, 150 unread' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('99+')

    rerender(
      <NotificationBell unreadCount={0} isPanelOpen={false} onOpenRequested={(): void => undefined} />,
    )
    expect(screen.getByRole('button', { name: 'Notifications, 0 unread' })).toBeInTheDocument()
    expect(screen.queryByTestId('notification-unread-badge')).not.toBeInTheDocument()
  })

  it('w3_notification_panel_marks_all_read', async () => {
    const notificationRepository = createMockNotificationRepository()
    notificationRepository.listMyNotifications.mockResolvedValue([
      buildStoredNotification({ body: '<img src=x onerror=alert(1)> is now Approved.' }),
      buildStoredNotification({
        identifier: testSecondNotificationIdentifier,
        category: 'roster.linked',
        title: 'Roster worker linked',
        body: 'A roster entry is now linked to a worker account.',
      }),
    ])
    notificationRepository.countMyUnread.mockResolvedValue(2)
    notificationRepository.markRead.mockResolvedValue(2)
    const notificationService = new NotificationService(notificationRepository)
    const user = userEvent.setup()

    render(
      <NotificationCenter
        notificationService={notificationService}
        recipientIdentifier={testOwnerIdentifier}
      />,
    )
    const bellButton = await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    await user.click(bellButton)

    const panel = screen.getByRole('dialog', { name: 'Notifications' })
    const notificationList = within(panel).getByRole('list', { name: 'Notifications' })
    expect(within(notificationList).getAllByRole('listitem')).toHaveLength(2)
    // Text from the database is rendered as text, never parsed as HTML.
    expect(
      within(panel).getByText('<img src=x onerror=alert(1)> is now Approved.'),
    ).toBeInTheDocument()
    expect(panel.querySelector('img')).toBeNull()

    await user.click(within(panel).getByRole('button', { name: 'Mark all as read' }))

    expect(notificationRepository.markRead).toHaveBeenCalledWith(null)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Notifications, 0 unread' }),
      ).toBeInTheDocument()
    })
    expect(within(panel).queryByRole('button', { name: /^Mark ".*" as read$/ })).toBeNull()
    expect(within(panel).getByRole('button', { name: 'Mark all as read' })).toBeDisabled()
  })
})
