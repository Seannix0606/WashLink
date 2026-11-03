import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JobOpeningModerationService } from '../../application/services/JobOpeningModerationService'
import type { AdminModerationQueueCursor } from '../../domain/models/JobOpeningModeration'
import {
  jobOpeningSupabaseDouble as supabaseDouble,
  recordedArgumentsOf,
  resetJobOpeningSupabaseDouble,
} from '../../test/jobOpeningSupabaseDouble'
import { SupabaseJobOpeningModerationRepository } from './SupabaseJobOpeningModerationRepository'

vi.mock('../supabase/supabaseClient', async () => {
  const { createJobOpeningSupabaseClientDouble } = await import('../../test/jobOpeningSupabaseDouble')
  return { isSupabaseConfigured: true, getSupabaseClient: createJobOpeningSupabaseClientDouble }
})

const caseId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const openedAt = '2026-10-27T02:00:00+00:00'

/** One w13c row: the w14e queue columns plus total_count. */
const pageRow = {
  case_id: caseId,
  status: 'open',
  revision: 1,
  report_count: 2,
  open_report_count: 2,
  categories: ['age_requirement'],
  opening_status: 'published',
  opening_present: true,
  opening_title_snapshot: 'Car wash attendant',
  shop_name_snapshot: 'Test Wash Bay',
  opened_at: openedAt,
  status_changed_at: openedAt,
  total_count: 7,
}

describe('Paged moderation queue repository (W13, D-71)', () => {
  beforeEach(() => {
    resetJobOpeningSupabaseDouble()
  })

  it('w13_repository_calls_page_rpc_only', async () => {
    const service = new JobOpeningModerationService(new SupabaseJobOpeningModerationRepository())

    supabaseDouble.rpcResult = { data: [pageRow], error: null }
    const firstPage = await service.listAdminQueuePage('active', null)
    expect(firstPage.totalCount).toBe(7)
    expect(firstPage.items).toEqual([
      expect.objectContaining({ caseId, status: 'open', categories: ['age_requirement'], isOpeningPresent: true, openedAt }),
    ])
    expect(firstPage.items.at(0)).not.toHaveProperty('total_count')

    // An empty page (the end, or a signed-in user who is not super_admin) has no total.
    supabaseDouble.rpcResult = { data: [], error: null }
    expect(await service.listAdminQueuePage('dismissed', { afterOpenedAt: openedAt, afterCaseId: caseId }, 100)).toEqual({ items: [], totalCount: null })

    expect(recordedArgumentsOf('rpc')).toEqual([
      ['admin_job_opening_moderation_queue_page', { p_status: 'active', p_after_opened_at: null, p_after_id: null, p_limit: 50 }],
      ['admin_job_opening_moderation_queue_page', { p_status: 'dismissed', p_after_opened_at: openedAt, p_after_id: caseId, p_limit: 100 }],
    ])
    // Never the 200-row W14 read, a table read or a write, and never a role or user id.
    expect(recordedArgumentsOf('from')).toEqual([])
    for (const tableWrite of ['insert', 'update', 'delete', 'upsert']) {
      expect(recordedArgumentsOf(tableWrite)).toEqual([])
    }

    // The cursor, page size and status are checked before any request, with the database's messages.
    const halfCursor = { afterOpenedAt: openedAt, afterCaseId: '' } as AdminModerationQueueCursor
    const badCursors: AdminModerationQueueCursor[] = [
      halfCursor,
      { afterOpenedAt: '', afterCaseId: caseId },
      { afterOpenedAt: 'not a time', afterCaseId: caseId },
      { afterOpenedAt: openedAt, afterCaseId: 'not-a-case-id' },
      { afterOpenedAt: null, afterCaseId: caseId } as unknown as AdminModerationQueueCursor,
    ]
    for (const badCursor of badCursors) {
      await expect(service.listAdminQueuePage('active', badCursor)).rejects.toThrow('Give both parts of the page cursor.')
    }
    for (const badPageSize of [0, 101, 2.5, Number.NaN]) {
      await expect(service.listAdminQueuePage('active', null, badPageSize)).rejects.toThrow('Page size must be between 1 and 100.')
    }
    await expect(service.listAdminQueuePage('everything' as 'active', null)).rejects.toThrow('Choose a case status.')
    expect(recordedArgumentsOf('rpc')).toHaveLength(2)
  })

  it('w13_page_rpc_errors_are_mapped', async () => {
    const repository = new SupabaseJobOpeningModerationRepository()
    const databaseMessages = ['Choose a case status.', 'Page size must be between 1 and 100.', 'Give both parts of the page cursor.']
    for (const databaseMessage of databaseMessages) {
      supabaseDouble.rpcResult = { data: null, error: { code: '22023', message: databaseMessage } }
      await expect(repository.listAdminQueuePage('active', null, 50)).rejects.toThrow(databaseMessage)
    }
    // Roles without the grant are refused (42501); raw text is never shown.
    supabaseDouble.rpcResult = { data: null, error: { code: '42501', message: 'permission denied for function admin_job_opening_moderation_queue_page' } }
    const refusal = repository.listAdminQueuePage('active', null, 50)
    await expect(refusal).rejects.toThrow()
    await expect(refusal).rejects.not.toThrow(/permission denied|admin_job_opening/)
  })
})
