import {
  jobApplicationLimits,
  type CurrentJobOpeningVersion,
  type JobApplication,
  type JobApplicationStatus,
} from '../../domain/models/JobApplication'
import type {
  JobOpeningApplicantRequirement,
  JobOpeningStatus,
} from '../../domain/models/JobOpening'
import type {
  CreateJobApplicationInput,
  JobApplicationRepository,
} from '../../domain/repositories/JobApplicationRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'
import {
  jobApplicationSelectColumns,
  mapJobApplicationRow,
  type SupabaseJobApplicationRow,
} from '../supabase/supabaseJobApplicationRow'
import {
  callTransitionJobApplication,
  jobApplicationNoRowMessage,
} from '../supabase/supabaseJobApplicationTransition'

export const myJobApplicationListLimit = jobApplicationLimits.ownListMaximum

interface SupabaseCurrentOpeningVersionRow {
  id: string
  status: JobOpeningStatus
  title: string
  applicant_requirement: JobOpeningApplicantRequirement | null
  updated_at: string
}

/**
 * Worker side of job applications. Reads go through RLS (own rows only); every write is
 * an RPC (create / update draft / delete draft / transition). The payloads carry only ids,
 * the cover note, the expected status or version and the notice version.
 */
export class SupabaseJobApplicationRepository implements JobApplicationRepository {
  public async listMyApplications(): Promise<JobApplication[]> {
    const sessionWorkerIdentifier = await readSessionWorkerIdentifier()
    const queryResponse = await getSupabaseClient()
      .from('job_applications')
      .select(jobApplicationSelectColumns)
      .eq('worker_id', sessionWorkerIdentifier)
      .order('status_changed_at', { ascending: false })
      .limit(myJobApplicationListLimit)
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load your applications.')
    }
    const applicationRows = queryResponse.data as unknown as SupabaseJobApplicationRow[]
    return applicationRows.map(mapJobApplicationRow)
  }

  public async listCurrentOpeningVersions(
    jobOpeningIds: readonly string[],
  ): Promise<CurrentJobOpeningVersion[]> {
    if (jobOpeningIds.length === 0) {
      return []
    }
    const queryResponse = await getSupabaseClient()
      .from('job_openings')
      .select('id, status, title, applicant_requirement, updated_at')
      .in('id', [...jobOpeningIds])
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load the current job openings.')
    }
    const openingRows = queryResponse.data as unknown as SupabaseCurrentOpeningVersionRow[]
    return openingRows.map((openingRow) => ({
      jobOpeningId: openingRow.id,
      status: openingRow.status,
      title: openingRow.title,
      applicantRequirement: openingRow.applicant_requirement,
      updatedAt: openingRow.updated_at,
    }))
  }

  public async createApplication(
    createJobApplicationInput: CreateJobApplicationInput,
  ): Promise<JobApplication> {
    const rpcResponse = await getSupabaseClient()
      .rpc('create_job_application', {
        p_job_opening_id: createJobApplicationInput.jobOpeningId,
        p_cover_note: createJobApplicationInput.coverNote,
        p_submit: createJobApplicationInput.submit,
        p_notice_version: createJobApplicationInput.noticeVersion,
      })
      .single()
    if (rpcResponse.error) {
      throw toUserFacingError(rpcResponse.error, 'Could not send your application.')
    }
    if (rpcResponse.data === null) {
      throw new Error(jobApplicationNoRowMessage)
    }
    return mapJobApplicationRow(rpcResponse.data as SupabaseJobApplicationRow)
  }

  public async updateDraft(
    applicationId: string,
    coverNote: string | null,
    expectedUpdatedAt: string,
  ): Promise<JobApplication> {
    const rpcResponse = await getSupabaseClient()
      .rpc('update_job_application_draft', {
        p_application_id: applicationId,
        p_cover_note: coverNote,
        p_expected_updated_at: expectedUpdatedAt,
      })
      .single()
    if (rpcResponse.error) {
      throw toUserFacingError(rpcResponse.error, 'Could not save the application draft.')
    }
    if (rpcResponse.data === null) {
      throw new Error(jobApplicationNoRowMessage)
    }
    return mapJobApplicationRow(rpcResponse.data as SupabaseJobApplicationRow)
  }

  public async deleteDraft(applicationId: string): Promise<void> {
    const rpcResponse = await getSupabaseClient().rpc('delete_job_application_draft', {
      p_application_id: applicationId,
    })
    if (rpcResponse.error) {
      throw toUserFacingError(rpcResponse.error, 'Could not delete the application draft.')
    }
  }

  public async transition(
    applicationId: string,
    fromStatus: JobApplicationStatus,
    toStatus: JobApplicationStatus,
    noticeVersion: string | null,
  ): Promise<JobApplication> {
    return callTransitionJobApplication(applicationId, fromStatus, toStatus, noticeVersion)
  }
}

async function readSessionWorkerIdentifier(): Promise<string> {
  const {
    data: { session },
    error,
  } = await getSupabaseClient().auth.getSession()
  if (error || !session?.user) {
    throw new Error('Sign in again to see your applications.')
  }
  return session.user.id
}
