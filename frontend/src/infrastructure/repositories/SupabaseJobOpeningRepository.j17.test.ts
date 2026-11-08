import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildJobOpening, testShopIdentifier } from '../../test/fixtures'
import {
  jobOpeningSupabaseDouble as supabaseDouble,
  recordedArgumentsOf,
  resetJobOpeningSupabaseDouble,
} from '../../test/jobOpeningSupabaseDouble'
import { SupabaseJobOpeningRepository } from './SupabaseJobOpeningRepository'

vi.mock('../supabase/supabaseClient', async () => {
  const { createJobOpeningSupabaseClientDouble } = await import('../../test/jobOpeningSupabaseDouble')
  return {
    isSupabaseConfigured: true,
    getSupabaseClient: createJobOpeningSupabaseClientDouble,
  }
})

const serverControlledColumns = [
  'id',
  'owner_id',
  'status',
  'first_published_at',
  'status_changed_at',
  'created_at',
  'updated_at',
]

describe('SupabaseJobOpeningRepository (J17 authorization)', () => {
  beforeEach(() => {
    resetJobOpeningSupabaseDouble()
  })

  it('j17_job_opening_repository_never_sends_owner_id_status_or_stamps_on_save', async () => {
    const repository = new SupabaseJobOpeningRepository()
    // The input object carries stamps and a status; none of them may reach the payload.
    const storedJobOpening = buildJobOpening({
      status: 'published',
      firstPublishedAt: '2026-10-24T01:00:00+00:00',
      statusChangedAt: '2026-10-24T01:00:00+00:00',
    })
    supabaseDouble.singleResult = { data: null, error: { code: '23514', message: 'check' } }
    await expect(repository.createDraft(testShopIdentifier, storedJobOpening)).rejects.toThrow(
      'Some details are outside the allowed limits. Check them and try again.',
    )
    supabaseDouble.queryResult = { data: [], error: null }
    await expect(
      repository.updateJobOpening(storedJobOpening.id, storedJobOpening, storedJobOpening.updatedAt),
    ).rejects.toThrow()

    const [[insertPayload]] = recordedArgumentsOf('insert') as [[Record<string, unknown>]]
    const [[updatePayload]] = recordedArgumentsOf('update') as [[Record<string, unknown>]]
    expect(insertPayload.shop_id).toBe(testShopIdentifier)
    expect(Object.keys(updatePayload)).not.toContain('shop_id')
    for (const savePayload of [insertPayload, updatePayload]) {
      for (const columnName of serverControlledColumns) {
        expect(Object.keys(savePayload)).not.toContain(columnName)
      }
      // Lists are sent as arrays so "clear" is [] and never null.
      expect(savePayload.duties).toEqual([])
      expect(savePayload.required_skills).toEqual([])
    }
    expect(Object.keys(updatePayload)).toHaveLength(25)
    expect(JSON.stringify(supabaseDouble.recordedCalls)).not.toContain('owner_id')
  })
})
