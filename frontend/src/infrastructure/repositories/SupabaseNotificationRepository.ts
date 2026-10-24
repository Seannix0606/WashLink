import type { StoredNotification } from '../../domain/models/AppNotification'
import type { NotificationRepository } from '../../domain/repositories/NotificationRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'

/** Explicit columns only: never `*`, never `recipient_id` (RLS scopes rows to auth.uid()). */
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

export class SupabaseNotificationRepository implements NotificationRepository {
  public async listMyNotifications(limit: number): Promise<StoredNotification[]> {
    const queryResponse = await getSupabaseClient()
      .from('notifications')
      .select(notificationSelectColumns)
      .order('created_at', { ascending: false })
      .limit(limit)
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
