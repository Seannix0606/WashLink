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

/** A notification exactly as stored (read state is a nullable timestamp). */
export interface StoredNotification {
  readonly identifier: string
  readonly category: string
  readonly title: string
  readonly body: string
  readonly createdAt: string
  readonly readAt: string | null
}
