import {
  jobOpeningLimits,
  type JobOpening,
  type JobOpeningStatus,
  type SaveJobOpeningInput,
} from '../../domain/models/JobOpening'
import type { JobOpeningRepository } from '../../domain/repositories/JobOpeningRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'
import {
  jobOpeningSelectColumns,
  mapJobOpeningRow,
  toJobOpeningContentPayload,
  type SupabaseJobOpeningRow,
} from '../supabase/supabaseJobOpeningRow'

/** Archived openings are left out; the owner list shows the most recently changed others. */
export const ownJobOpeningListLimit = jobOpeningLimits.ownListMaximum

/**
 * RLS returns 0 rows (no error) for a row that changed, is gone, or is not the caller's.
 * These messages turn that silent no-op into a visible failure.
 */
export const jobOpeningUpdateNoRowsMessage =
  'This job opening changed or is no longer available. Refresh and try again.'
export const jobOpeningDeleteNoRowsMessage = 'Only draft job openings can be deleted.'

export class SupabaseJobOpeningRepository implements JobOpeningRepository {
  public async listOwnJobOpenings(): Promise<JobOpening[]> {
    const sessionOwnerIdentifier = await readSessionOwnerIdentifier()
    const queryResponse = await getSupabaseClient()
      .from('job_openings')
      .select(jobOpeningSelectColumns)
      .eq('owner_id', sessionOwnerIdentifier)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })
      .limit(ownJobOpeningListLimit)
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load your job openings.')
    }
    const jobOpeningRows = queryResponse.data as unknown as SupabaseJobOpeningRow[]
    return jobOpeningRows.map(mapJobOpeningRow)
  }

  public async createDraft(
    shopId: string,
    saveJobOpeningInput: SaveJobOpeningInput,
  ): Promise<JobOpening> {
    const insertResponse = await getSupabaseClient()
      .from('job_openings')
      .insert({ shop_id: shopId, ...toJobOpeningContentPayload(saveJobOpeningInput) })
      .select(jobOpeningSelectColumns)
      .single()
    if (insertResponse.error) {
      throw toUserFacingError(insertResponse.error, 'Could not save the job opening draft.')
    }
    return mapJobOpeningRow(insertResponse.data as unknown as SupabaseJobOpeningRow)
  }

  public async updateJobOpening(
    jobOpeningId: string,
    saveJobOpeningInput: SaveJobOpeningInput,
    expectedUpdatedAt: string,
  ): Promise<JobOpening> {
    const updateResponse = await getSupabaseClient()
      .from('job_openings')
      .update(toJobOpeningContentPayload(saveJobOpeningInput))
      .eq('id', jobOpeningId)
      .eq('updated_at', expectedUpdatedAt)
      .select(jobOpeningSelectColumns)
    if (updateResponse.error) {
      throw toUserFacingError(updateResponse.error, 'Could not save the job opening.')
    }
    const updatedRows = updateResponse.data as unknown as SupabaseJobOpeningRow[]
    const updatedRow = updatedRows.at(0)
    if (updatedRow === undefined) {
      throw new Error(jobOpeningUpdateNoRowsMessage)
    }
    return mapJobOpeningRow(updatedRow)
  }

  public async deleteDraft(jobOpeningId: string): Promise<void> {
    const deleteResponse = await getSupabaseClient()
      .from('job_openings')
      .delete()
      .eq('id', jobOpeningId)
      .eq('status', 'draft')
      .select('id')
    if (deleteResponse.error) {
      throw toUserFacingError(deleteResponse.error, 'Could not delete the job opening draft.')
    }
    const deletedRows = deleteResponse.data as unknown as { id: string }[]
    if (deletedRows.length === 0) {
      throw new Error(jobOpeningDeleteNoRowsMessage)
    }
  }

  public async transition(
    jobOpeningId: string,
    fromStatus: JobOpeningStatus,
    toStatus: JobOpeningStatus,
  ): Promise<JobOpening> {
    const rpcResponse = await getSupabaseClient()
      .rpc('transition_job_opening', {
        p_job_opening_id: jobOpeningId,
        p_from_status: fromStatus,
        p_to_status: toStatus,
      })
      .single()
    if (rpcResponse.error) {
      throw toUserFacingError(rpcResponse.error, 'Could not change the job opening status.')
    }
    return mapJobOpeningRow(rpcResponse.data as SupabaseJobOpeningRow)
  }

  public async isShopVerifiedForPublishing(shopId: string): Promise<boolean> {
    const rpcResponse = await getSupabaseClient().rpc('is_verified_shop_owner', {
      p_shop_id: shopId,
    })
    if (rpcResponse.error) {
      throw toUserFacingError(rpcResponse.error, 'Could not check the shop verification.')
    }
    return rpcResponse.data === true
  }
}

async function readSessionOwnerIdentifier(): Promise<string> {
  const {
    data: { session },
    error,
  } = await getSupabaseClient().auth.getSession()
  if (error || !session?.user) {
    throw new Error('Sign in again to manage your job openings.')
  }
  return session.user.id
}
