import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testJobOpeningIdentifier } from '../../test/fixtures'
import { testJobApplicationIdentifier } from '../../test/jobApplicationFixtures'
import {
  jobOpeningSupabaseDouble as supabaseDouble,
  recordedArgumentsOf,
  resetJobOpeningSupabaseDouble,
} from '../../test/jobOpeningSupabaseDouble'
import { jobApplicationNoRowMessage } from '../supabase/supabaseJobApplicationTransition'
import { SupabaseApplicantPipelineRepository } from './SupabaseApplicantPipelineRepository'
import { SupabaseJobApplicationRepository } from './SupabaseJobApplicationRepository'

vi.mock('../supabase/supabaseClient', async () => {
  const { createJobOpeningSupabaseClientDouble } = await import('../../test/jobOpeningSupabaseDouble')
  return {
    isSupabaseConfigured: true,
    getSupabaseClient: createJobOpeningSupabaseClientDouble,
  }
})

const storedApplicationRow = {
  id: testJobApplicationIdentifier,
  job_opening_id: testJobOpeningIdentifier,
  shop_id: 'shop',
  status: 'submitted',
  cover_note: null,
  notice_version: 'w5_v1',
  notice_acknowledged_at: '2026-10-25T01:00:00+00:00',
  submitted_at: '2026-10-25T01:00:00+00:00',
  decided_at: null,
  withdrawn_at: null,
  closed_at: null,
  status_changed_at: '2026-10-25T01:00:00+00:00',
  opening_snapshot: null,
  opening_snapshot_taken_at: '2026-10-25T01:00:00+00:00',
  created_at: '2026-10-25T01:00:00+00:00',
  updated_at: '2026-10-25T01:00:00.654321+00:00',
}

describe('Supabase job application repositories (W5)', () => {
  beforeEach(() => {
    resetJobOpeningSupabaseDouble()
  })

  it('w5_job_application_repository_writes_only_through_rpcs', async () => {
    const workerRepository = new SupabaseJobApplicationRepository()
    const ownerRepository = new SupabaseApplicantPipelineRepository()
    supabaseDouble.rpcResult = { data: storedApplicationRow, error: null }

    await workerRepository.createApplication({
      jobOpeningId: testJobOpeningIdentifier,
      coverNote: 'Hello',
      submit: true,
      noticeVersion: 'w5_v1',
    })
    await workerRepository.updateDraft(testJobApplicationIdentifier, null, storedApplicationRow.updated_at)
    await workerRepository.transition(testJobApplicationIdentifier, 'submitted', 'withdrawn', null)
    supabaseDouble.rpcResult = { data: null, error: null }
    await workerRepository.deleteDraft(testJobApplicationIdentifier)
    supabaseDouble.rpcResult = { data: storedApplicationRow, error: null }
    await ownerRepository.transition(testJobApplicationIdentifier, 'submitted', 'under_review')

    // No table write is ever issued; every write is one of the W5 RPCs.
    for (const tableWriteMethod of ['insert', 'update', 'delete']) {
      expect(recordedArgumentsOf(tableWriteMethod)).toEqual([])
    }
    expect(recordedArgumentsOf('rpc').map(([rpcName]) => rpcName)).toEqual([
      'create_job_application',
      'update_job_application_draft',
      'transition_job_application',
      'delete_job_application_draft',
      'transition_job_application',
    ])
    // The draft update sends the version exactly as read (optimistic concurrency).
    const [, draftArguments] = recordedArgumentsOf('rpc')[1] as [string, Record<string, unknown>]
    expect(draftArguments.p_expected_updated_at).toBe('2026-10-25T01:00:00.654321+00:00')

    // An RPC answering without a row is a failure, never a silent success.
    supabaseDouble.rpcResult = { data: null, error: null }
    await expect(
      workerRepository.transition(testJobApplicationIdentifier, 'submitted', 'withdrawn', null),
    ).rejects.toThrow(jobApplicationNoRowMessage)
    // Database refusals reach the user with their exact W5 text.
    supabaseDouble.rpcResult = {
      data: null,
      error: { code: '55000', message: 'This application changed. Refresh and try again.' },
    }
    await expect(
      ownerRepository.transition(testJobApplicationIdentifier, 'submitted', 'under_review'),
    ).rejects.toThrow('This application changed. Refresh and try again.')
    supabaseDouble.rpcResult = {
      data: null,
      error: { code: '23505', message: 'You have already applied to this job opening.' },
    }
    await expect(
      workerRepository.createApplication({
        jobOpeningId: testJobOpeningIdentifier,
        coverNote: null,
        submit: true,
        noticeVersion: 'w5_v1',
      }),
    ).rejects.toThrow('You have already applied to this job opening.')
  })

  it('w5_owner_pipeline_queries_require_submitted_at', async () => {
    const ownerRepository = new SupabaseApplicantPipelineRepository()
    // Even if a draft row slipped through, the owner list drops it (the database also refuses it).
    supabaseDouble.queryResult = {
      data: [
        storedApplicationRow,
        { ...storedApplicationRow, id: 'draft-row', status: 'draft', submitted_at: null, notice_version: null },
      ],
      error: null,
    }
    const listedApplications = await ownerRepository.listApplicationsForOpening(testJobOpeningIdentifier)
    expect(listedApplications.map((application) => application.id)).toEqual([testJobApplicationIdentifier])

    supabaseDouble.queryResult = { data: [], error: null }
    await ownerRepository.countApplicationsByOpening([testJobOpeningIdentifier])
    // Both owner queries filter on submitted_at being set.
    expect(recordedArgumentsOf('not')).toEqual([
      ['submitted_at', 'is', null],
      ['submitted_at', 'is', null],
    ])
  })
})
