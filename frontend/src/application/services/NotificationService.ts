import { z } from 'zod'
import type { AppNotification, StoredNotification } from '../../domain/models/AppNotification'
import type { NotificationRepository } from '../../domain/repositories/NotificationRepository'

export const defaultNotificationListLimit = 20
export const maximumNotificationListLimit = 50
/** Matches the database limit of `mark_notifications_read`. */
export const maximumMarkReadIdentifierCount = 200
export const tooManyNotificationsMessage = 'Mark at most 200 notifications at a time.'

const notificationIdentifierSchema = z.uuid()

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
