import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NotificationService } from '../../../application/services/NotificationService'
import type { InboxNotification } from '../../../domain/models/AppNotification'
import {
  buildStoredNotification,
  createMockNotificationRepository,
  testNotificationIdentifier,
  testOwnerIdentifier,
  testSecondNotificationIdentifier,
} from '../../../test/fixtures'
import { NotificationCenter } from './NotificationCenter'
import { NotificationListItem } from './NotificationListItem'

function buildInboxNotification(overrides: Partial<InboxNotification> = {}): InboxNotification {
  return {
    identifier: testNotificationIdentifier,
    category: 'certification.expiring',
    title: 'Certificate expiring',
    body: 'A shop-issued certificate expires soon.',
    createdAt: '2026-10-29T00:00:00+00:00',
    isRead: false,
    area: 'certifications',
    ...overrides,
  }
}

describe('Notification list item and inbox filters (W12, D-68)', () => {
  it('w12_list_item_area_chip_plain_text', () => {
    const { rerender } = render(
      <ul>
        <NotificationListItem notification={buildInboxNotification()} onMarkReadRequested={vi.fn()} />
      </ul>,
    )
    const areaChip = screen.getByTestId('notification-area-chip')
    expect(areaChip).toHaveTextContent('Area: Shop-issued certificates')
    // A label only: no link or button into a dashboard tab (D-68), and no markup from the database.
    expect(areaChip.querySelector('a, button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()

    rerender(
      <ul>
        <NotificationListItem
          notification={buildInboxNotification({
            category: '<img src=x onerror=alert(1)>',
            title: '<b>Hello</b>',
            area: 'other',
          })}
          onMarkReadRequested={vi.fn()}
        />
      </ul>,
    )
    expect(screen.getByTestId('notification-area-chip')).toHaveTextContent('Area: Other updates')
    expect(screen.getByText('<b>Hello</b>')).toBeInTheDocument()
    expect(document.querySelector('img, b')).toBeNull()
  })

  it('w12_inbox_panel_filters_and_load_older_controls', async () => {
    const notificationRepository = createMockNotificationRepository()
    notificationRepository.listMyNotifications.mockResolvedValue([
      buildStoredNotification({ category: 'training.invited', title: 'Training invitation' }),
      buildStoredNotification({ identifier: testSecondNotificationIdentifier, category: 'brand_new.category', title: 'Something new' }),
    ])
    notificationRepository.countMyUnread.mockResolvedValue(2)
    const user = userEvent.setup()

    render(<NotificationCenter notificationService={new NotificationService(notificationRepository)} recipientIdentifier={testOwnerIdentifier} />)
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    const panel = screen.getByRole('dialog', { name: 'Notifications' })
    const notificationList = await within(panel).findByRole('list', { name: 'Notifications' })
    expect(within(notificationList).getAllByRole('listitem')).toHaveLength(2)
    expect(within(panel).getByText('Notifications appear here in the app only.')).toBeInTheDocument()
    // Fewer than 50 rows: nothing older to load.
    expect(within(panel).queryByRole('button', { name: 'Load older' })).toBeNull()
    expect(within(panel).getByText('No older notifications.')).toBeInTheDocument()

    await user.selectOptions(within(panel).getByLabelText(/^Area/), 'training')
    expect(within(panel).getAllByRole('listitem')).toHaveLength(1)
    expect(within(panel).getByText('Training invitation')).toBeInTheDocument()

    await user.selectOptions(within(panel).getByLabelText(/^Area/), 'washlink_reviews')
    expect(within(panel).getByText('Nothing in this area')).toBeInTheDocument()

    await user.selectOptions(within(panel).getByLabelText(/^Area/), 'other')
    expect(within(panel).getByText('Something new')).toBeInTheDocument()

    notificationRepository.listMyNotifications.mockResolvedValue([])
    const readFilter = within(panel).getByRole('group', { name: 'Show notifications' })
    await user.click(within(readFilter).getByRole('button', { name: 'Unread' }))
    expect(within(readFilter).getByRole('button', { name: 'Unread' })).toHaveAttribute('aria-pressed', 'true')
    await user.selectOptions(within(panel).getByLabelText(/^Area/), 'all')
    expect(await within(panel).findByText('No unread notifications')).toBeInTheDocument()
    // The panel never claims a message went out by another channel.
    expect(panel.textContent).not.toMatch(/\b(email|e-mail|sms|text message|push notification)s? (was|were|is|are) sent/i)
  })
})
