import type { NotificationPageRequest, StoredNotification } from '../models/AppNotification'

/**
 * The signed-in account's own notifications. The recipient is always derived server-side
 * (row-level security on auth.uid()); no method accepts a recipient identifier.
 */
export interface NotificationRepository {
  /**
   * Newest first, at most `limit` rows. With a W12 page request the order is (created_at, id)
   * descending, `before` reads the rows after that keyset position and `isUnreadOnly` keeps
   * unread rows only.
   */
  listMyNotifications(limit: number, pageRequest?: NotificationPageRequest): Promise<StoredNotification[]>
  countMyUnread(): Promise<number>
  /** Marks the given ids (or every unread one when null) as read; returns rows changed. */
  markRead(notificationIdentifiers: readonly string[] | null): Promise<number>
}
