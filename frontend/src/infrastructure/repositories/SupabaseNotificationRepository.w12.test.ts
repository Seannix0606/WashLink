import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testNotificationIdentifier } from '../../test/fixtures'
import {
  SupabaseNotificationRepository,
  buildNotificationKeysetFilter,
  invalidNotificationKeysetCursorMessage,
} from './SupabaseNotificationRepository'
import { SupabaseScheduledJobRepository } from './SupabaseScheduledJobRepository'

type RecordedCall = readonly [methodName: string, methodArguments: unknown[]]

const supabaseClientDouble = vi.hoisted(() => {
  const recordedCalls: RecordedCall[] = []
  const queryResult: { data: unknown; count: number | null; error: unknown } = { data: [], count: 0, error: null }
  const rpcResult: { data: unknown; error: unknown } = { data: [], error: null }

  // Every builder method is chainable and awaitable, like the PostgREST builder.
  function createQueryBuilder(): Record<string, unknown> {
    const queryBuilder: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void): void => {
        resolve(queryResult)
      },
    }
    for (const methodName of ['select', 'order', 'eq', 'is', 'or', 'lt', 'limit', 'insert', 'update', 'delete', 'upsert']) {
      queryBuilder[methodName] = (...methodArguments: unknown[]): unknown => {
        recordedCalls.push([methodName, methodArguments])
        return queryBuilder
      }
    }
    return queryBuilder
  }

  return {
    recordedCalls,
    queryResult,
    rpcResult,
    fromTable: (...methodArguments: unknown[]): unknown => {
      recordedCalls.push(['from', methodArguments])
      return createQueryBuilder()
    },
    callRpc: (...methodArguments: unknown[]): Promise<unknown> => {
      recordedCalls.push(['rpc', methodArguments])
      return Promise.resolve(rpcResult)
    },
  }
})

vi.mock('../supabase/supabaseClient', () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: (): unknown => ({ from: supabaseClientDouble.fromTable, rpc: supabaseClientDouble.callRpc }),
}))

function recordedArgumentsOf(methodName: string): unknown[][] {
  return supabaseClientDouble.recordedCalls
    .filter(([recordedMethodName]) => recordedMethodName === methodName)
    .map(([, methodArguments]) => methodArguments)
}

const repositorySources = import.meta.glob<string>('./Supabase*Repository.ts', { query: '?raw', import: 'default', eager: true })

describe('Notification and scheduled-job repositories (W12)', () => {
  beforeEach(() => {
    supabaseClientDouble.recordedCalls.length = 0
    supabaseClientDouble.queryResult.data = []
    supabaseClientDouble.queryResult.error = null
    supabaseClientDouble.rpcResult.data = []
    supabaseClientDouble.rpcResult.error = null
  })

  it('w12_repository_selects_no_subject_or_key_columns', async () => {
    const repository = new SupabaseNotificationRepository()
    const cursor = { createdAt: '2026-10-29T01:02:03.123456+00:00', identifier: testNotificationIdentifier }

    await repository.listMyNotifications(50, { before: null, isUnreadOnly: false })
    await repository.listMyNotifications(50, { before: cursor, isUnreadOnly: true })

    for (const [selectColumns] of recordedArgumentsOf('select') as [string][]) {
      expect(selectColumns).toBe('id, category, title, body, created_at, read_at')
      for (const forbiddenColumn of ['subject_type', 'subject_id', 'idempotency_key', 'recipient_id', '*']) {
        expect(selectColumns).not.toContain(forbiddenColumn)
      }
    }
    // Newest first by (created_at, id); the unread filter and the documented keyset filter.
    expect(recordedArgumentsOf('order')).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
    expect(recordedArgumentsOf('is')).toEqual([['read_at', null]])
    expect(recordedArgumentsOf('or')).toEqual([
      [
        'created_at.lt.2026-10-29T01:02:03.123456+00:00,and(created_at.eq.2026-10-29T01:02:03.123456+00:00,id.lt.88888888-8888-4888-8888-888888888888)',
      ],
    ])
    expect(recordedArgumentsOf('limit')).toEqual([[50], [50]])
  })

  it('w12_keyset_filter_validates_its_own_cursor', async () => {
    const validCreatedAt = '2026-10-29T01:02:03.123456+00:00'
    expect(buildNotificationKeysetFilter({ createdAt: '2026-10-29T01:02:03Z', identifier: testNotificationIdentifier })).toBe(
      `created_at.lt.2026-10-29T01:02:03Z,and(created_at.eq.2026-10-29T01:02:03Z,id.lt.${testNotificationIdentifier})`,
    )
    const invalidCursors = [
      { createdAt: '2026-10-29 01:02:03+00:00', identifier: testNotificationIdentifier },
      { createdAt: `${validCreatedAt},id.gt.0`, identifier: testNotificationIdentifier },
      { createdAt: '2026-10-29', identifier: testNotificationIdentifier },
      { createdAt: '2026-10-29T01:02:03.1234567+00:00', identifier: testNotificationIdentifier },
      { createdAt: '', identifier: testNotificationIdentifier },
      { createdAt: validCreatedAt, identifier: 'not-a-uuid' },
      { createdAt: validCreatedAt, identifier: `${testNotificationIdentifier})` },
      { createdAt: validCreatedAt, identifier: '88888888-8888-9888-8888-888888888888' },
      { createdAt: validCreatedAt, identifier: '' },
    ]
    for (const invalidCursor of invalidCursors) {
      expect(() => buildNotificationKeysetFilter(invalidCursor), JSON.stringify(invalidCursor)).toThrow(
        invalidNotificationKeysetCursorMessage,
      )
    }

    // The repository refuses an invalid cursor before building or sending any query filter.
    await expect(
      new SupabaseNotificationRepository().listMyNotifications(50, {
        before: { createdAt: `${validCreatedAt})`, identifier: testNotificationIdentifier },
        isUnreadOnly: false,
      }),
    ).rejects.toThrow(invalidNotificationKeysetCursorMessage)
    expect(recordedArgumentsOf('or')).toEqual([])
    expect(recordedArgumentsOf('limit')).toEqual([])
  })

  it('j17_w12_repositories_use_rpcs_or_recipient_reads_only', async () => {
    const notificationRepository = new SupabaseNotificationRepository()
    await notificationRepository.listMyNotifications(50, { before: null, isUnreadOnly: true })
    await notificationRepository.countMyUnread()
    await notificationRepository.markRead(null)

    supabaseClientDouble.rpcResult.data = [
      {
        job_key: 'worker_contract_expiry',
        enabled: true,
        batch_size: 25,
        last_started_at: null,
        last_finished_at: null,
        last_outcome: null,
        last_processed_count: null,
        last_changed_count: null,
        last_skipped_locked_count: null,
        last_pass_completed_at: null,
        run_count: '0',
        pending_count: 4,
        last_skipped_failed_count: 1,
        last_failed_sqlstates: ['40001'],
      },
      {
        job_key: 'owner_relationship_refresh',
        enabled: true,
        batch_size: 50,
        last_started_at: null,
        last_finished_at: null,
        last_outcome: null,
        last_processed_count: null,
        last_changed_count: null,
        last_skipped_locked_count: null,
        last_pass_completed_at: null,
        run_count: 0,
        pending_count: null,
      },
    ]
    const scheduledJobs = await new SupabaseScheduledJobRepository().listScheduledJobs()
    expect(scheduledJobs).toEqual([
      expect.objectContaining({
        jobKey: 'worker_contract_expiry',
        isEnabled: true,
        batchSize: 25,
        runCount: 0,
        pendingCount: 4,
        lastOutcome: null,
        lastSkippedFailedCount: 1,
        lastFailedSqlstates: ['40001'],
      }),
      // A row without the fix cycle 1 columns maps them to null, never to an invented zero.
      expect.objectContaining({ jobKey: 'owner_relationship_refresh', lastSkippedFailedCount: null, lastFailedSqlstates: null }),
    ])

    // Reads of the caller's own notifications (RLS) and two RPCs; no writes, no recipient filter.
    expect(recordedArgumentsOf('from')).toEqual([['notifications'], ['notifications']])
    expect(recordedArgumentsOf('rpc')).toEqual([['mark_notifications_read', {}], ['admin_workforce_scheduled_jobs']])
    for (const writeMethod of ['insert', 'update', 'delete', 'upsert', 'eq']) {
      expect(recordedArgumentsOf(writeMethod)).toEqual([])
    }
    expect(JSON.stringify(supabaseClientDouble.recordedCalls)).not.toContain('recipient')

    // No repository names the registry, the job state, the internal runner or the batch functions.
    expect(Object.keys(repositorySources).length).toBeGreaterThan(10)
    for (const [sourcePath, sourceText] of Object.entries(repositorySources)) {
      for (const internalName of [
        'notification_categories',
        "'workforce_scheduled_jobs'",
        'run_workforce_scheduled_job',
        'expire_worker_contracts',
        'refresh_worker_owner_relationship',
        'worker_owner_pair_try_lock',
        'workforce_scheduled_job_pending',
        'enqueue_notification',
        'enqueue_certification_expiry_notices',
        ['service', 'role'].join('_'),
      ]) {
        expect(sourceText.includes(internalName), `${sourcePath} names ${internalName}`).toBe(false)
      }
    }
  })
})
