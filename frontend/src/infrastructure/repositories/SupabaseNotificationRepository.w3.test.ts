import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testNotificationIdentifier } from '../../test/fixtures'
import { SupabaseNotificationRepository } from './SupabaseNotificationRepository'

type RecordedCall = readonly [methodName: string, methodArguments: unknown[]]

const supabaseClientDouble = vi.hoisted(() => {
  const recordedCalls: RecordedCall[] = []
  const queryResult: { data: unknown; count: number | null; error: unknown } = {
    data: [],
    count: null,
    error: null,
  }
  const rpcResult: { data: unknown; error: unknown } = { data: 0, error: null }

  function createQueryBuilder(): Record<string, (...methodArguments: unknown[]) => unknown> {
    const queryBuilder: Record<string, (...methodArguments: unknown[]) => unknown> = {}
    for (const methodName of ['select', 'order', 'eq', 'insert', 'update', 'delete']) {
      queryBuilder[methodName] = (...methodArguments: unknown[]): unknown => {
        recordedCalls.push([methodName, methodArguments])
        return queryBuilder
      }
    }
    for (const terminalMethodName of ['limit', 'is']) {
      queryBuilder[terminalMethodName] = (...methodArguments: unknown[]): unknown => {
        recordedCalls.push([terminalMethodName, methodArguments])
        return Promise.resolve(queryResult)
      }
    }
    return queryBuilder
  }

  const fromTable = (...methodArguments: unknown[]): unknown => {
    recordedCalls.push(['from', methodArguments])
    return createQueryBuilder()
  }
  const callRpc = (...methodArguments: unknown[]): Promise<typeof rpcResult> => {
    recordedCalls.push(['rpc', methodArguments])
    return Promise.resolve(rpcResult)
  }
  return { recordedCalls, queryResult, rpcResult, fromTable, callRpc }
})

vi.mock('../supabase/supabaseClient', () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: (): unknown => ({
    from: supabaseClientDouble.fromTable,
    rpc: supabaseClientDouble.callRpc,
  }),
}))

function recordedArgumentsOf(methodName: string): unknown[][] {
  return supabaseClientDouble.recordedCalls
    .filter(([recordedMethodName]) => recordedMethodName === methodName)
    .map(([, methodArguments]) => methodArguments)
}

describe('SupabaseNotificationRepository (W3 notifications)', () => {
  beforeEach(() => {
    supabaseClientDouble.recordedCalls.length = 0
    supabaseClientDouble.queryResult.data = []
    supabaseClientDouble.queryResult.count = null
    supabaseClientDouble.queryResult.error = null
    supabaseClientDouble.rpcResult.data = 0
    supabaseClientDouble.rpcResult.error = null
  })

  it('w3_supabase_notification_repository_selects_explicit_columns', async () => {
    supabaseClientDouble.queryResult.data = [
      {
        id: testNotificationIdentifier,
        category: 'roster.linked',
        title: 'Roster worker linked',
        body: 'A roster entry is now linked to a worker account.',
        created_at: '2026-10-24T01:00:00+00:00',
        read_at: null,
      },
    ]
    const repository = new SupabaseNotificationRepository()

    const storedNotifications = await repository.listMyNotifications(20)

    expect(recordedArgumentsOf('from')).toEqual([['notifications']])
    const [selectColumns] = recordedArgumentsOf('select')[0] as [string]
    expect(selectColumns).toBe('id, category, title, body, created_at, read_at')
    expect(selectColumns).not.toContain('*')
    expect(selectColumns).not.toContain('recipient_id')
    expect(recordedArgumentsOf('order')).toEqual([['created_at', { ascending: false }]])
    expect(recordedArgumentsOf('limit')).toEqual([[20]])
    expect(storedNotifications).toEqual([
      {
        identifier: testNotificationIdentifier,
        category: 'roster.linked',
        title: 'Roster worker linked',
        body: 'A roster entry is now linked to a worker account.',
        createdAt: '2026-10-24T01:00:00+00:00',
        readAt: null,
      },
    ])

    supabaseClientDouble.recordedCalls.length = 0
    supabaseClientDouble.queryResult.count = 3
    await expect(repository.countMyUnread()).resolves.toBe(3)
    expect(recordedArgumentsOf('select')).toEqual([['id', { count: 'exact', head: true }]])
    expect(recordedArgumentsOf('is')).toEqual([['read_at', null]])
  })

  it('w3_supabase_notification_repository_mark_read_uses_rpc', async () => {
    supabaseClientDouble.rpcResult.data = 1
    const repository = new SupabaseNotificationRepository()

    await expect(repository.markRead([testNotificationIdentifier])).resolves.toBe(1)
    supabaseClientDouble.rpcResult.data = 4
    await expect(repository.markRead(null)).resolves.toBe(4)

    expect(recordedArgumentsOf('rpc')).toEqual([
      ['mark_notifications_read', { p_notification_ids: [testNotificationIdentifier] }],
      ['mark_notifications_read', {}],
    ])
    expect(recordedArgumentsOf('from')).toEqual([])

    supabaseClientDouble.rpcResult.error = {
      code: '22023',
      message: 'Mark at most 200 notifications at a time.',
    }
    await expect(repository.markRead([testNotificationIdentifier])).rejects.toThrow(
      'Mark at most 200 notifications at a time.',
    )
    supabaseClientDouble.rpcResult.error = {
      code: '42501',
      message: 'permission denied for function mark_notifications_read',
    }
    await expect(repository.markRead(null)).rejects.toThrow(
      'Your account is not allowed to do this.',
    )
  })

  it('j17_notification_repository_never_sends_recipient_id', async () => {
    supabaseClientDouble.queryResult.count = 0
    const repository = new SupabaseNotificationRepository()

    await repository.listMyNotifications(20)
    await repository.countMyUnread()
    await repository.markRead([testNotificationIdentifier])
    await repository.markRead(null)

    const serializedCalls = JSON.stringify(supabaseClientDouble.recordedCalls)
    expect(serializedCalls).not.toContain('recipient')
    expect(recordedArgumentsOf('eq')).toEqual([])
    expect(recordedArgumentsOf('insert')).toEqual([])
    expect(recordedArgumentsOf('update')).toEqual([])
    expect(recordedArgumentsOf('delete')).toEqual([])
  })
})
