import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testJobOpeningIdentifier } from '../../test/fixtures'
import { testJobApplicationIdentifier } from '../../test/jobApplicationFixtures'
import {
  jobOpeningSupabaseDouble as supabaseDouble,
  recordedArgumentsOf,
  resetJobOpeningSupabaseDouble,
} from '../../test/jobOpeningSupabaseDouble'
import { jobApplicationSelectColumns } from '../supabase/supabaseJobApplicationRow'
import { SupabaseJobApplicationRepository } from './SupabaseJobApplicationRepository'

vi.mock('../supabase/supabaseClient', async () => {
  const { createJobOpeningSupabaseClientDouble } = await import('../../test/jobOpeningSupabaseDouble')
  return {
    isSupabaseConfigured: true,
    getSupabaseClient: createJobOpeningSupabaseClientDouble,
  }
})

const forbiddenArgumentFragments = ['owner', 'worker', 'shop', 'snapshot', 'stamp', 'decided', 'submitted_at']

describe('SupabaseJobApplicationRepository (J17 authorization)', () => {
  beforeEach(() => {
    resetJobOpeningSupabaseDouble()
  })

  it('j17_job_application_repository_never_sends_status_owner_or_snapshot', async () => {
    const repository = new SupabaseJobApplicationRepository()
    supabaseDouble.rpcResult = { data: null, error: { code: '42501', message: 'Job application not found.' } }

    await expect(
      repository.createApplication({
        jobOpeningId: testJobOpeningIdentifier,
        coverNote: 'Hello',
        submit: true,
        noticeVersion: 'w5_v1',
      }),
    ).rejects.toThrow('Job application not found.')
    await expect(
      repository.updateDraft(testJobApplicationIdentifier, 'Hello', '2026-10-25T01:00:00+00:00'),
    ).rejects.toThrow()
    await expect(
      repository.transition(testJobApplicationIdentifier, 'draft', 'submitted', 'w5_v1'),
    ).rejects.toThrow()

    const rpcCalls = recordedArgumentsOf('rpc') as [string, Record<string, unknown>][]
    const argumentKeysByRpc = rpcCalls.map(([rpcName, rpcArguments]) => [rpcName, Object.keys(rpcArguments).sort()])
    expect(argumentKeysByRpc).toEqual([
      ['create_job_application', ['p_cover_note', 'p_job_opening_id', 'p_notice_version', 'p_submit']],
      ['update_job_application_draft', ['p_application_id', 'p_cover_note', 'p_expected_updated_at']],
      [
        'transition_job_application',
        ['p_application_id', 'p_from_status', 'p_notice_version', 'p_to_status'],
      ],
    ])
    // No argument names a status column, the owner, the worker, the shop, a stamp or the snapshot:
    // the database sets all of them. Status moves only as an expected from/to pair.
    for (const [, rpcArguments] of rpcCalls) {
      for (const argumentName of Object.keys(rpcArguments)) {
        expect(argumentName === 'p_status').toBe(false)
        for (const forbiddenFragment of forbiddenArgumentFragments) {
          expect(argumentName).not.toContain(forbiddenFragment)
        }
      }
    }
    expect(JSON.stringify(rpcCalls)).not.toContain('owner_id')
    // Reads never ask for owner or worker ids either (RLS scopes the rows).
    expect(jobApplicationSelectColumns.split(', ')).not.toContain('owner_id')
    expect(jobApplicationSelectColumns.split(', ')).not.toContain('worker_id')
    expect(jobApplicationSelectColumns).not.toContain('*')
  })
})
