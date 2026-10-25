import type { ApplicantProfile } from '../../domain/models/ApplicantProfile'
import type { JobApplication, JobApplicationStatus } from '../../domain/models/JobApplication'
import type { VerifiedCertification } from '../../domain/models/VerifiedCertification'
import type {
  ApplicantPipelineRepository,
  JobOpeningApplicationCount,
} from '../../domain/repositories/ApplicantPipelineRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'
import {
  jobApplicationSelectColumns,
  mapApplicantProfileRow,
  mapJobApplicationRow,
  mapVerifiedCertificationRow,
  type SupabaseApplicantProfileRow,
  type SupabaseJobApplicationRow,
  type SupabaseVerifiedCertificationRow,
} from '../supabase/supabaseJobApplicationRow'
import { callTransitionJobApplication } from '../supabase/supabaseJobApplicationTransition'

/** An opening holds at most 500 non-withdrawn applications; withdrawn rows add a little more. */
export const pipelineApplicationListLimit = 1000

/**
 * Owner side of job applications. RLS shows an owner only non-draft rows of their own
 * openings; applicant data comes from applicant_profiles_for_job_opening only. As defence in
 * depth the queries also require submitted_at, so a draft never reaches an owner view.
 */
export class SupabaseApplicantPipelineRepository implements ApplicantPipelineRepository {
  public async listApplicationsForOpening(jobOpeningId: string): Promise<JobApplication[]> {
    const queryResponse = await getSupabaseClient()
      .from('job_applications')
      .select(jobApplicationSelectColumns)
      .eq('job_opening_id', jobOpeningId)
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false })
      .limit(pipelineApplicationListLimit)
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load the applications.')
    }
    const applicationRows = queryResponse.data as unknown as SupabaseJobApplicationRow[]
    return applicationRows
      .map(mapJobApplicationRow)
      .filter((application) => application.status !== 'draft' && application.submittedAt !== null)
  }

  public async listApplicantProfiles(jobOpeningId: string): Promise<ApplicantProfile[]> {
    const rpcResponse = await getSupabaseClient().rpc('applicant_profiles_for_job_opening', {
      p_job_opening_id: jobOpeningId,
    })
    if (rpcResponse.error) {
      throw toUserFacingError(rpcResponse.error, 'Could not load the applicant profiles.')
    }
    const profileRows = (rpcResponse.data ?? []) as SupabaseApplicantProfileRow[]
    return profileRows.map(mapApplicantProfileRow)
  }

  public async listVerifiedCertifications(applicationId: string): Promise<VerifiedCertification[]> {
    const rpcResponse = await getSupabaseClient().rpc('applicant_verified_certifications', {
      p_application_id: applicationId,
    })
    if (rpcResponse.error) {
      throw toUserFacingError(rpcResponse.error, 'Could not load verified certifications.')
    }
    const certificationRows = (rpcResponse.data ?? []) as SupabaseVerifiedCertificationRow[]
    return certificationRows.map(mapVerifiedCertificationRow)
  }

  public async countApplicationsByOpening(
    jobOpeningIds: readonly string[],
  ): Promise<JobOpeningApplicationCount[]> {
    if (jobOpeningIds.length === 0) {
      return []
    }
    const queryResponse = await getSupabaseClient()
      .from('job_applications')
      .select('job_opening_id')
      .in('job_opening_id', [...jobOpeningIds])
      .not('submitted_at', 'is', null)
      .limit(pipelineApplicationListLimit * 10)
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not count the applications.')
    }
    const countRows = queryResponse.data as unknown as { job_opening_id: string }[]
    const countByOpening = new Map<string, number>()
    for (const countRow of countRows) {
      countByOpening.set(countRow.job_opening_id, (countByOpening.get(countRow.job_opening_id) ?? 0) + 1)
    }
    return [...countByOpening].map(([jobOpeningId, applicationCount]) => ({
      jobOpeningId,
      applicationCount,
    }))
  }

  public async transition(
    applicationId: string,
    fromStatus: JobApplicationStatus,
    toStatus: JobApplicationStatus,
  ): Promise<JobApplication> {
    return callTransitionJobApplication(applicationId, fromStatus, toStatus, null)
  }
}
