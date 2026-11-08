import type { WorkforcePolicy } from '../../domain/models/WorkforcePolicy'
import type { WorkforcePolicyRepository } from '../../domain/repositories/WorkforcePolicyRepository'
import {
  policySameValueMessage,
  workforcePolicyReasonSchema,
  workforcePolicyValueSchema,
  type WorkforcePolicyField,
} from '../validation/workforcePolicySchemas'

export type WorkforcePolicyFieldErrors = Partial<Record<WorkforcePolicyField, string>>

/** A change refused before it reaches the server; carries one message per field. */
export class WorkforcePolicyValidationError extends Error {
  public constructor(public readonly fieldErrors: WorkforcePolicyFieldErrors) {
    super(Object.values(fieldErrors).at(0) ?? 'Check the policy change.')
    this.name = 'WorkforcePolicyValidationError'
  }
}

/**
 * Super_admin policy governance (D-37). The client checks the same limits as the database for
 * quick feedback; the database (super_admin check, expected revision, range, reason) decides.
 */
export class WorkforcePolicyService {
  public constructor(private readonly workforcePolicyRepository: WorkforcePolicyRepository) {}

  public async loadPolicies(): Promise<WorkforcePolicy[]> {
    return this.workforcePolicyRepository.listPolicies()
  }

  /** Empty when the change may be sent. */
  public validateChange(policy: WorkforcePolicy, valueText: string, changeReason: string): WorkforcePolicyFieldErrors {
    const fieldErrors: WorkforcePolicyFieldErrors = {}
    const valueResult = workforcePolicyValueSchema.safeParse(valueText)
    if (!valueResult.success) {
      fieldErrors.value = valueResult.error.issues.at(0)?.message
    } else if (valueResult.data === policy.integerValue) {
      fieldErrors.value = policySameValueMessage
    }
    const reasonResult = workforcePolicyReasonSchema.safeParse(changeReason)
    if (!reasonResult.success) {
      fieldErrors.reason = reasonResult.error.issues.at(0)?.message
    }
    return fieldErrors
  }

  /** Sends the value with the revision the admin saw, so a concurrent change is never overwritten. */
  public async changeValue(policy: WorkforcePolicy, valueText: string, changeReason: string): Promise<WorkforcePolicy> {
    const fieldErrors = this.validateChange(policy, valueText, changeReason)
    if (Object.keys(fieldErrors).length > 0) {
      throw new WorkforcePolicyValidationError(fieldErrors)
    }
    return this.workforcePolicyRepository.changePolicyValue({
      policyKey: policy.policyKey,
      newValue: workforcePolicyValueSchema.parse(valueText),
      expectedRevision: policy.revision,
      changeReason: changeReason.trim(),
    })
  }
}
