import type { WorkforcePolicyEnforcement } from '../../domain/models/OwnerRelationship'
import type { WorkforcePolicy, WorkforcePolicyKey } from '../../domain/models/WorkforcePolicy'

/** `public.workforce_policies` (w10c); selectable by a super_admin only (RLS). */
export interface SupabaseWorkforcePolicyRow {
  id: string
  policy_key: WorkforcePolicyKey
  integer_value: number
  default_value: number
  enforcement: WorkforcePolicyEnforcement
  description: string
  revision: number
  last_change_reason: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export const workforcePolicySelectColumns =
  'id, policy_key, integer_value, default_value, enforcement, description, revision, last_change_reason, updated_by, created_at, updated_at'

export function mapWorkforcePolicyRow(row: SupabaseWorkforcePolicyRow): WorkforcePolicy {
  return {
    policyId: row.id,
    policyKey: row.policy_key,
    integerValue: row.integer_value,
    defaultValue: row.default_value,
    enforcement: row.enforcement,
    description: row.description,
    revision: row.revision,
    lastChangeReason: row.last_change_reason,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
