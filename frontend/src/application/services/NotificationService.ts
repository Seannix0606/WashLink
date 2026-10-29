import { z } from 'zod'
import type {
  AppNotification,
  InboxNotification,
  NotificationPageCursor,
  StoredNotification,
} from '../../domain/models/AppNotification'
import type { NotificationRepository } from '../../domain/repositories/NotificationRepository'
import { notificationAreaForCategory } from '../../domain/utilities/notificationAreas'
import {
  notificationCursorIdentifierPattern,
  notificationCursorTimestampPattern,
} from '../../domain/utilities/notificationCursor'

export const defaultNotificationListLimit = 20
export const maximumNotificationListLimit = 50
/** Matches the database limit of `mark_notifications_read`. */
export const maximumMarkReadIdentifierCount = 200
export const tooManyNotificationsMessage = 'Mark at most 200 notifications at a time.'
/** W12 (D-68): inbox page size, also for every "Load older" page. */
export const inboxPageSize = 50
export const invalidNotificationCursorMessage = 'Older notifications could not be loaded. Reload the inbox and try again.'

const notificationIdentifierSchema = z.uuid()
/** A timestamp exactly as PostgREST returns it; no comma, parenthesis or space can pass. */
const notificationTimestampSchema = z.string().regex(notificationCursorTimestampPattern)
/** Same rules as the repository keyset filter (`isValidNotificationCursor`). */
const notificationCursorSchema = z.object({
  createdAt: notificationTimestampSchema,
  identifier: notificationIdentifierSchema.regex(notificationCursorIdentifierPattern),
})

function toAppNotification(storedNotification: StoredNotification): AppNotification {
  return {
    identifier: storedNotification.identifier,
    category: storedNotification.category,
    title: storedNotification.title,
    body: storedNotification.body,
    createdAt: storedNotification.createdAt,
    isRead: storedNotification.readAt !== null,
  }
}

function toInboxNotification(storedNotification: StoredNotification): InboxNotification {
  return {
    ...toAppNotification(storedNotification),
    area: notificationAreaForCategory(storedNotification.category),
  }
}

/**
 * W12: joins two newest-first pages, keeping the first occurrence of each id. Rows of `laterRows`
 * that are not in `earlierRows` are older than all of them (total keyset order), so no re-sort.
 */
export function mergeNotificationPages<Notification extends { readonly identifier: string }>(
  earlierRows: readonly Notification[],
  laterRows: readonly Notification[],
): Notification[] {
  const seenIdentifiers = new Set(earlierRows.map((notification) => notification.identifier))
  return [
    ...earlierRows,
    ...laterRows.filter((notification) => !seenIdentifiers.has(notification.identifier)),
  ]
}

/** Clamps a requested page size to 1..50 (whole numbers). */
export function normalizeNotificationListLimit(requestedLimit: number): number {
  if (!Number.isFinite(requestedLimit)) {
    return defaultNotificationListLimit
  }
  return Math.min(maximumNotificationListLimit, Math.max(1, Math.trunc(requestedLimit)))
}

/** Removes duplicates and malformed ids; rejects lists above the database limit. */
export function normalizeMarkReadIdentifiers(
  notificationIdentifiers: readonly string[],
): string[] {
  const uniqueIdentifiers = [...new Set(notificationIdentifiers)].filter(
    (notificationIdentifier) =>
      notificationIdentifierSchema.safeParse(notificationIdentifier).success,
  )
  if (uniqueIdentifiers.length > maximumMarkReadIdentifierCount) {
    throw new Error(tooManyNotificationsMessage)
  }
  return uniqueIdentifiers
}

export class NotificationService {
  public constructor(private readonly notificationRepository: NotificationRepository) {}

  public async listMyNotifications(
    requestedLimit: number = defaultNotificationListLimit,
  ): Promise<AppNotification[]> {
    const storedNotifications = await this.notificationRepository.listMyNotifications(
      normalizeNotificationListLimit(requestedLimit),
    )
    return storedNotifications.map(toAppNotification)
  }

  /**
   * W12 inbox page (50 rows, newest first by created_at then id). `before` is the last row shown;
   * a malformed cursor is refused before any request.
   */
  public async listMyInboxPage(request: {
    readonly before: NotificationPageCursor | null
    readonly isUnreadOnly: boolean
  }): Promise<InboxNotification[]> {
    let validatedCursor: NotificationPageCursor | null = null
    if (request.before !== null) {
      const cursorResult = notificationCursorSchema.safeParse(request.before)
      if (!cursorResult.success) {
        throw new Error(invalidNotificationCursorMessage)
      }
      validatedCursor = cursorResult.data
    }
    const storedNotifications = await this.notificationRepository.listMyNotifications(inboxPageSize, {
      before: validatedCursor,
      isUnreadOnly: request.isUnreadOnly,
    })
    return storedNotifications.map(toInboxNotification)
  }

  public async countMyUnread(): Promise<number> {
    return this.notificationRepository.countMyUnread()
  }

  /** Marks the selected notifications read; returns how many changed (0 for none). */
  public async markRead(notificationIdentifiers: readonly string[]): Promise<number> {
    const normalizedIdentifiers = normalizeMarkReadIdentifiers(notificationIdentifiers)
    if (normalizedIdentifiers.length === 0) {
      return 0
    }
    return this.notificationRepository.markRead(normalizedIdentifiers)
  }

  /** Marks every unread notification of the signed-in account read. */
  public async markAllRead(): Promise<number> {
    return this.notificationRepository.markRead(null)
  }
}
