import type { WorkforcePolicy, WorkforcePolicyChangeRequest } from '../../domain/models/WorkforcePolicy'
import type { WorkforcePolicyRepository } from '../../domain/repositories/WorkforcePolicyRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'
import { mapWorkforcePolicyRow, workforcePolicySelectColumns, type SupabaseWorkforcePolicyRow } from '../supabase/supabaseWorkforcePolicyRows'

/**
 * Reads `workforce_policies` (RLS: super_admin only; other roles get no rows); the only write is the
 * audited `set_workforce_policy_value` RPC. Who may change a policy is decided by the database.
 */
export class SupabaseWorkforcePolicyRepository implements WorkforcePolicyRepository {
  public async listPolicies(): Promise<WorkforcePolicy[]> {
    const queryResponse = await getSupabaseClient()
      .from('workforce_policies')
      .select(workforcePolicySelectColumns)
      .order('policy_key', { ascending: true })
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load the workforce policies.')
    }
    return (queryResponse.data as unknown as SupabaseWorkforcePolicyRow[]).map(mapWorkforcePolicyRow)
  }

  public async changePolicyValue(changeRequest: WorkforcePolicyChangeRequest): Promise<WorkforcePolicy> {
    const rpcResponse = await getSupabaseClient().rpc('set_workforce_policy_value', {
      p_policy_key: changeRequest.policyKey,
      p_new_value: changeRequest.newValue,
      p_expected_revision: changeRequest.expectedRevision,
      p_change_reason: changeRequest.changeReason,
    })
    if (rpcResponse.error) {
      throw toUserFacingError(rpcResponse.error, 'Could not change the policy.')
    }
    const responseData = rpcResponse.data as SupabaseWorkforcePolicyRow | SupabaseWorkforcePolicyRow[] | null
    const policyRow = Array.isArray(responseData) ? responseData.at(0) : responseData
    if (policyRow === undefined || policyRow === null) {
      throw new Error('Could not change the policy.')
    }
    return mapWorkforcePolicyRow(policyRow)
  }
}
