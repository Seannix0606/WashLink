import type { WorkforcePolicyEnforcement } from './OwnerRelationship'

/** W10 workforce policies (D-37). One row per key; changed only by a super_admin through an audited RPC. */
export type WorkforcePolicyKey = 'minimum_distinct_owners'

export interface WorkforcePolicy {
  readonly policyId: string
  readonly policyKey: WorkforcePolicyKey
  readonly integerValue: number
  /** Immutable seeded default (3 for minimum_distinct_owners). */
  readonly defaultValue: number
  readonly enforcement: WorkforcePolicyEnforcement
  readonly description: string
  readonly revision: number
  readonly lastChangeReason: string | null
  readonly updatedBy: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface WorkforcePolicyChangeRequest {
  readonly policyKey: WorkforcePolicyKey
  readonly newValue: number
  readonly expectedRevision: number
  readonly changeReason: string
}

/** Same limits as the database CHECKs and `set_workforce_policy_value`. */
export const workforcePolicyLimits = {
  minimumValue: 1,
  maximumValue: 10,
  reasonMinLength: 10,
  reasonMaxLength: 300,
} as const
