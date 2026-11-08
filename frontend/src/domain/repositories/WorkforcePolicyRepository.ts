import type { WorkforcePolicy, WorkforcePolicyChangeRequest } from '../models/WorkforcePolicy'

export interface WorkforcePolicyRepository {
  listPolicies(): Promise<WorkforcePolicy[]>
  /** The only write: the audited `set_workforce_policy_value` RPC (super_admin only, checked by the database). */
  changePolicyValue(changeRequest: WorkforcePolicyChangeRequest): Promise<WorkforcePolicy>
}
