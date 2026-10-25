import type { JobApplication, JobApplicationStatus } from '../../domain/models/JobApplication'
import { getSupabaseClient } from './supabaseClient'
import { toUserFacingError } from './supabaseErrorMessages'
import { mapJobApplicationRow, type SupabaseJobApplicationRow } from './supabaseJobApplicationRow'

/** An RPC that answers without a row is treated as a failure, never as success. */
export const jobApplicationNoRowMessage =
  'This application changed or is no longer available. Refresh and try again.'

/**
 * The only status-change path for workers and owners: transition_job_application checks
 * the actor, the expected current status (stale -> 55000) and the opening.
 */
export async function callTransitionJobApplication(
  applicationId: string,
  fromStatus: JobApplicationStatus,
  toStatus: JobApplicationStatus,
  noticeVersion: string | null,
): Promise<JobApplication> {
  const rpcResponse = await getSupabaseClient()
    .rpc('transition_job_application', {
      p_application_id: applicationId,
      p_from_status: fromStatus,
      p_to_status: toStatus,
      p_notice_version: noticeVersion,
    })
    .single()
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, 'Could not change the application status.')
  }
  if (rpcResponse.data === null) {
    throw new Error(jobApplicationNoRowMessage)
  }
  return mapJobApplicationRow(rpcResponse.data as SupabaseJobApplicationRow)
}
