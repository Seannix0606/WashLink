import type { NotificationArea } from '../utilities/notificationAreas'

/**
 * An in-app notification for the signed-in account (W3).
 * Named AppNotification so it never collides with the DOM `Notification` global.
 * Title and body are plain text written by the database; they are rendered as text, never as HTML.
 */
export interface AppNotification {
  readonly identifier: string
  /** Dotted category, e.g. `roster.linked`. Unknown categories are shown generically. */
  readonly category: string
  readonly title: string
  readonly body: string
  readonly createdAt: string
  readonly isRead: boolean
}

/** W12 (D-68): an inbox notification with its client-side area (unknown categories are `other`). */
export interface InboxNotification extends AppNotification {
  readonly area: NotificationArea
}

/** A notification exactly as stored (read state is a nullable timestamp). */
export interface StoredNotification {
  readonly identifier: string
  readonly category: string
  readonly title: string
  readonly body: string
  readonly createdAt: string
  readonly readAt: string | null
}

/** W12 keyset position: the last row already shown, as stored (`created_at` text and `id`). */
export interface NotificationPageCursor {
  readonly createdAt: string
  readonly identifier: string
}

/** W12 inbox page: newest first by (created_at, id); `before` null is the first page. */
export interface NotificationPageRequest {
  readonly before: NotificationPageCursor | null
  readonly isUnreadOnly: boolean
}
