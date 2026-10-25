import type { ReactElement } from 'react'
import { useState } from 'react'
import { Award } from 'lucide-react'
import type { CertificationStatusChange, OwnerCertification } from '../../../../domain/models/Certification'
import {
  matchesOwnerCertificationFilter,
  ownerCertificationActionsForShop,
  type OwnerCertificationAction,
  type OwnerCertificationFilter,
} from '../../../../domain/utilities/certificationLifecycle'
import type { CertificationDependencies } from '../../../dependencyInjection/createCertificationDependencies'
import { EmptyState, Select, Skeleton } from '../../../design/ui'
import { useCertificationActions } from '../../../hooks/useCertificationActions'
import { useOwnerCertifications } from '../../../hooks/useOwnerCertifications'
import { ownerCertificationsEmptyDescription } from '../../../utilities/certificationCopy'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { CertificationReviewDecisionModal, CertificationStatusChangeModal } from './CertificationStatusChangeModal'
import { OwnerCertificationListItem } from './OwnerCertificationListItem'
import { RecordReassessmentModal } from './RecordReassessmentModal'
import { RenewCertificationModal } from './RenewCertificationModal'

const filterOptions: readonly { readonly value: OwnerCertificationFilter; readonly label: string }[] = [
  { value: 'all', label: 'All certificates' },
  { value: 'open_review', label: 'Open review requests' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'revoked', label: 'Revoked' },
  { value: 'superseded', label: 'Renewed' },
]

type ActionTarget =
  | { readonly kind: 'status'; readonly certification: OwnerCertification; readonly statusChange: CertificationStatusChange }
  | { readonly kind: 'reassess' | 'renew' | 'review'; readonly certification: OwnerCertification }

interface OwnerShopCertificationsProps {
  readonly certificationDependencies: CertificationDependencies
  readonly shopId: string
  readonly isShopVerified: boolean
  readonly currentInstant: Date
}

function toActionTarget(certification: OwnerCertification, action: OwnerCertificationAction): ActionTarget {
  if (action === 'suspend' || action === 'revoke' || action === 'reinstate') {
    return { kind: 'status', certification, statusChange: action }
  }
  if (action === 'record_reassessment') {
    return { kind: 'reassess', certification }
  }
  return { kind: action === 'renew' ? 'renew' : 'review', certification }
}

/** Certificates issued from one shop: open reviews first, status filter, lifecycle actions. */
export function OwnerShopCertifications({
  certificationDependencies,
  shopId,
  isShopVerified,
  currentInstant,
}: OwnerShopCertificationsProps): ReactElement {
  const { certificationService, certificationReviewService } = certificationDependencies
  const certifications = useOwnerCertifications(certificationService, shopId)
  const actions = useCertificationActions(certificationService, certificationReviewService, certifications.refresh)
  const [filter, setFilter] = useState<OwnerCertificationFilter>('all')
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null)
  const visibleCertifications = certifications.items.filter((certification) => matchesOwnerCertificationFilter(certification, filter))
  const isTargetPending = actionTarget !== null && actions.pendingSubjectId === actionTarget.certification.certificationId
  const closeAction = (): void => {
    setActionTarget(null)
  }

  return (
    <section aria-label="Issued certifications" className="space-y-3">
      <div className="sm:w-64">
        <Select
          id={`certification-filter-${shopId}`}
          name="certification-filter"
          label="Show"
          options={filterOptions}
          value={filter}
          onChange={(changeEvent): void => {
            const nextFilter = filterOptions.find((option) => option.value === changeEvent.target.value)
            setFilter(nextFilter?.value ?? 'all')
          }}
        />
      </div>
      {certifications.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading certifications">
          <Skeleton heightClassName="h-20" />
          <Skeleton heightClassName="h-20" />
        </div>
      ) : certifications.errorMessage !== null ? (
        <LoadErrorNotice
          title="Certifications could not be loaded"
          errorMessage={certifications.errorMessage}
          onRetry={(): void => {
            void certifications.reload()
          }}
        />
      ) : certifications.isEmpty ? (
        <EmptyState icon={<Award className="h-5 w-5" />} title="No certificates issued yet" description={ownerCertificationsEmptyDescription} />
      ) : visibleCertifications.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-500)]">No certificates match this filter.</p>
      ) : (
        <ul aria-label="Certificate list" className="space-y-2">
          {visibleCertifications.map((certification) => (
            <OwnerCertificationListItem
              key={certification.certificationId}
              certificationService={certificationService}
              certification={certification}
              availableActions={ownerCertificationActionsForShop(certification, isShopVerified, currentInstant)}
              currentInstant={currentInstant}
              isActionPending={actions.pendingSubjectId === certification.certificationId}
              onActionRequested={(targetCertification, action): void => {
                setActionTarget(toActionTarget(targetCertification, action))
              }}
            />
          ))}
        </ul>
      )}

      <CertificationStatusChangeModal
        target={actionTarget?.kind === 'status' ? actionTarget : null}
        isSubmitting={isTargetPending}
        onConfirm={async (certification, statusChange, reason): Promise<boolean> =>
          (await actions.changeStatus(certification, statusChange, reason)) === 'done'
        }
        onClose={closeAction}
      />
      <CertificationReviewDecisionModal
        certification={actionTarget?.kind === 'review' ? actionTarget.certification : null}
        canReinstate={isShopVerified}
        isSubmitting={isTargetPending}
        onConfirm={async (certification, decision, reason): Promise<boolean> =>
          (await actions.decideReview(certification, decision, reason)) === 'done'
        }
        onClose={closeAction}
      />
      {actionTarget?.kind === 'reassess' ? (
        <RecordReassessmentModal
          certificationService={certificationService}
          certification={actionTarget.certification}
          isSubmitting={isTargetPending}
          onSubmit={async (reassessmentInput): Promise<boolean> => (await actions.recordReassessment(reassessmentInput)) === 'done'}
          onClose={closeAction}
        />
      ) : null}
      <RenewCertificationModal
        certification={actionTarget?.kind === 'renew' ? actionTarget.certification : null}
        isSubmitting={isTargetPending}
        onConfirm={async (certification, hasConfirmedAttestation): Promise<boolean> => {
          const outcome = await actions.renew(certification, hasConfirmedAttestation)
          if (outcome === 'stale') {
            setActionTarget(null)
          }
          return outcome === 'done'
        }}
        onClose={closeAction}
      />
    </section>
  )
}
