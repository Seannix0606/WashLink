import type { NotificationPageCursor } from '../models/AppNotification'

/**
 * W12 "Load older" cursor rules, shared by NotificationService (zod) and the repository keyset filter
 * so both refuse the same input. Neither pattern lets a comma, parenthesis, dot-operator or space
 * through, so a valid cursor cannot change the PostgREST `or` filter.
 */

/** A timestamp exactly as PostgREST returns it. */
export const notificationCursorTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/

/** A uuid, the same pattern zod's `z.uuid()` applies (RFC 9562 versions 1-8, nil and max). */
export const notificationCursorIdentifierPattern =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/

export function isValidNotificationCursor(cursor: NotificationPageCursor): boolean {
  return (
    typeof cursor.createdAt === 'string' &&
    typeof cursor.identifier === 'string' &&
    notificationCursorTimestampPattern.test(cursor.createdAt) &&
    notificationCursorIdentifierPattern.test(cursor.identifier)
  )
}
