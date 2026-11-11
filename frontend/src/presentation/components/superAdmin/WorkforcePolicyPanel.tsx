import type { ReactElement } from 'react'
import { useState } from 'react'
import { Pencil, SlidersHorizontal } from 'lucide-react'
import type { WorkforcePolicyService } from '../../../application/services/WorkforcePolicyService'
import type { WorkforcePolicy } from '../../../domain/models/WorkforcePolicy'
import { Badge, Button, Card, EmptyState, Skeleton } from '../../design/ui'
import { useWorkforcePolicies } from '../../hooks/useWorkforcePolicies'
import { useWorkforcePolicyChange } from '../../hooks/useWorkforcePolicyChange'
import {
  informationalOnlyLabel,
  workforcePoliciesEmptyText,
  workforcePoliciesEmptyTitle,
  workforcePoliciesHeading,
  workforcePolicyKeyLabel,
  workforcePolicyNotice,
} from '../../utilities/ownerRelationshipCopy'
import { formatRelationshipDate } from '../../utilities/ownerRelationshipDisplay'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'
import { ChangeWorkforcePolicyModal } from './ChangeWorkforcePolicyModal'

function WorkforcePolicyItem({ policy, onChange }: { readonly policy: WorkforcePolicy; readonly onChange: () => void }): ReactElement {
  const policyLabel = workforcePolicyKeyLabel[policy.policyKey] ?? policy.policyKey
  return (
    <li aria-label={policyLabel} className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-card-border)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-[var(--color-ink-900)]">{policyLabel}</span>
        <Badge tone="info">{informationalOnlyLabel}</Badge>
      </div>
      <p className="text-xs break-words text-[var(--color-ink-500)]">{policy.description}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-[var(--color-ink-500)]">Current value</dt>
          <dd className="text-base font-bold text-[var(--color-ink-900)]">{policy.integerValue}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-ink-500)]">WashLink default</dt>
          <dd className="text-base font-semibold text-[var(--color-ink-700)]">{policy.defaultValue}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-ink-500)]">Revision</dt>
          <dd className="font-medium text-[var(--color-ink-700)]">{policy.revision}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-ink-500)]">Last change</dt>
          <dd className="font-medium text-[var(--color-ink-700)]">
            {policy.revision > 1 ? formatRelationshipDate(policy.updatedAt) : 'Not changed since setup'}
          </dd>
        </div>
      </dl>
      {policy.lastChangeReason !== null ? (
        <p className="text-xs break-words text-[var(--color-ink-700)]">{`Reason for the last change: ${policy.lastChangeReason}`}</p>
      ) : null}
      <Button size="sm" variant="secondary" leadingIcon={<Pencil className="h-4 w-4" aria-hidden="true" />} onClick={onChange}>
        Change value
      </Button>
    </li>
  )
}

interface WorkforcePolicyPanelProps {
  readonly workforcePolicyService: WorkforcePolicyService
}

/** Super_admin: the informational workforce policies (D-37). The database decides who may change them. */
export function WorkforcePolicyPanel({ workforcePolicyService }: WorkforcePolicyPanelProps): ReactElement {
  const policies = useWorkforcePolicies(workforcePolicyService)
  const policyChange = useWorkforcePolicyChange(workforcePolicyService, policies.refresh)
  const [changingPolicyId, setChangingPolicyId] = useState<string | null>(null)
  const changingPolicy = changingPolicyId === null ? null : (policies.findPolicy(changingPolicyId) ?? null)
  const closeModal = (): void => {
    setChangingPolicyId(null)
    policyChange.clearFieldErrors()
  }

  const renderBody = (): ReactElement =>
    policies.isLoading ? (
      <div aria-busy="true" aria-label="Loading the workforce policies">
        <Skeleton heightClassName="h-28" />
      </div>
    ) : policies.errorMessage !== null ? (
      <LoadErrorNotice
        title="The workforce policies could not be loaded"
        errorMessage={policies.errorMessage}
        onRetry={(): void => {
          void policies.reload()
        }}
      />
    ) : policies.isEmpty ? (
      <EmptyState icon={<SlidersHorizontal className="h-5 w-5" />} title={workforcePoliciesEmptyTitle} description={workforcePoliciesEmptyText} />
    ) : (
      <ul aria-label={workforcePoliciesHeading} className="space-y-3">
        {policies.policies.map((policy) => (
          <WorkforcePolicyItem
            key={policy.policyId}
            policy={policy}
            onChange={(): void => {
              policyChange.clearFieldErrors()
              setChangingPolicyId(policy.policyId)
            }}
          />
        ))}
      </ul>
    )

  return (
    <Card elevation="raised" role="region" aria-labelledby="workforce-policies-heading" className="space-y-3">
      <header>
        <h2 id="workforce-policies-heading" className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <SlidersHorizontal className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          {workforcePoliciesHeading}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{workforcePolicyNotice}</p>
      </header>
      {renderBody()}
      <ChangeWorkforcePolicyModal
        policy={changingPolicy}
        isSubmitting={policyChange.isSubmitting}
        fieldErrors={policyChange.fieldErrors}
        onSubmit={async (policy, valueText, changeReason): Promise<boolean> => {
          const isChanged = await policyChange.submitChange(policy, valueText, changeReason)
          if (isChanged) {
            setChangingPolicyId(null)
          }
          return isChanged
        }}
        onCancel={closeModal}
      />
    </Card>
  )
}
