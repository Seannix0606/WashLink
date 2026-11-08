import type {
  NotificationPageCursor,
  NotificationPageRequest,
  StoredNotification,
} from '../../domain/models/AppNotification'
import type { NotificationRepository } from '../../domain/repositories/NotificationRepository'
import { isValidNotificationCursor } from '../../domain/utilities/notificationCursor'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'

/**
 * Explicit columns only: never `*`, never `recipient_id` (RLS scopes rows to auth.uid()), and
 * never `subject_type`, `subject_id` or `idempotency_key` (W12).
 */
export const notificationSelectColumns = 'id, category, title, body, created_at, read_at'

interface SupabaseNotificationRow {
  id: string
  category: string
  title: string
  body: string
  created_at: string
  read_at: string | null
}

function toStoredNotification(notificationRow: SupabaseNotificationRow): StoredNotification {
  return {
    identifier: notificationRow.id,
    category: notificationRow.category,
    title: notificationRow.title,
    body: notificationRow.body,
    createdAt: notificationRow.created_at,
    readAt: notificationRow.read_at,
  }
}

export const invalidNotificationKeysetCursorMessage = 'Older notifications could not be loaded. Reload the inbox and try again.'

/**
 * W12 keyset filter for "Load older": rows strictly after `before` in (created_at desc, id desc).
 * NotificationService validates the cursor first; this re-checks it with the same rules (strict
 * ISO timestamp and uuid, N8) and throws before any request, so no caller can put PostgREST
 * separators into the filter.
 */
export function buildNotificationKeysetFilter(before: NotificationPageCursor): string {
  if (!isValidNotificationCursor(before)) {
    throw new Error(invalidNotificationKeysetCursorMessage)
  }
  return `created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.identifier})`
}

export class SupabaseNotificationRepository implements NotificationRepository {
  public async listMyNotifications(
    limit: number,
    pageRequest?: NotificationPageRequest,
  ): Promise<StoredNotification[]> {
    let notificationQuery = getSupabaseClient()
      .from('notifications')
      .select(notificationSelectColumns)
      .order('created_at', { ascending: false })
    if (pageRequest !== undefined) {
      // W12 paging: the id tie-break makes the order total, matching the keyset filter.
      notificationQuery = notificationQuery.order('id', { ascending: false })
      if (pageRequest.isUnreadOnly) {
        notificationQuery = notificationQuery.is('read_at', null)
      }
      if (pageRequest.before !== null) {
        notificationQuery = notificationQuery.or(buildNotificationKeysetFilter(pageRequest.before))
      }
    }
    const queryResponse = await notificationQuery.limit(limit)
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load your notifications.')
    }
    const notificationRows = queryResponse.data as SupabaseNotificationRow[]
    return notificationRows.map(toStoredNotification)
  }

  public async countMyUnread(): Promise<number> {
    const countResponse = await getSupabaseClient()
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
    if (countResponse.error) {
      throw toUserFacingError(countResponse.error, 'Could not load your unread notifications.')
    }
    return countResponse.count ?? 0
  }

  public async markRead(notificationIdentifiers: readonly string[] | null): Promise<number> {
    const rpcArguments =
      notificationIdentifiers === null
        ? {}
        : { p_notification_ids: [...notificationIdentifiers] }
    const rpcResponse = await getSupabaseClient().rpc('mark_notifications_read', rpcArguments)
    if (rpcResponse.error) {
      throw toUserFacingError(rpcResponse.error, 'Could not mark notifications as read.')
    }
    const changedRowCount: unknown = rpcResponse.data
    return typeof changedRowCount === 'number' ? changedRowCount : 0
  }
}
