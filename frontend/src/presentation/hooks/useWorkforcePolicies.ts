import { useCallback } from 'react'
import type { WorkforcePolicyService } from '../../application/services/WorkforcePolicyService'
import type { WorkforcePolicy } from '../../domain/models/WorkforcePolicy'
import { useLatestResource } from './useLatestResource'

const noPolicies: readonly WorkforcePolicy[] = []

export interface UseWorkforcePoliciesResult {
  readonly policies: readonly WorkforcePolicy[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isEmpty: boolean
  readonly findPolicy: (policyId: string) => WorkforcePolicy | undefined
  readonly reload: () => Promise<void>
  readonly refresh: () => Promise<void>
}

export function useWorkforcePolicies(workforcePolicyService: WorkforcePolicyService): UseWorkforcePoliciesResult {
  const loadPolicies = useCallback(
    async (): Promise<readonly WorkforcePolicy[]> => workforcePolicyService.loadPolicies(),
    [workforcePolicyService],
  )
  const policiesResource = useLatestResource({
    load: loadPolicies,
    initialResource: noPolicies,
    loadFailedMessage: 'Could not load the workforce policies.',
  })
  const policies = policiesResource.resource
  const findPolicy = useCallback(
    (policyId: string): WorkforcePolicy | undefined => policies.find((policy) => policy.policyId === policyId),
    [policies],
  )
  return {
    policies,
    isLoading: policiesResource.isLoading,
    errorMessage: policiesResource.errorMessage,
    isEmpty: !policiesResource.isLoading && policiesResource.errorMessage === null && policies.length === 0,
    findPolicy,
    reload: policiesResource.reload,
    refresh: policiesResource.refresh,
  }
}
