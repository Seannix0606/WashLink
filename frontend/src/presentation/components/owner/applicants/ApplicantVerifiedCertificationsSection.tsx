import type { ReactElement } from 'react'
import { BadgeCheck } from 'lucide-react'
import type { ApplicantPipelineService } from '../../../../application/services/ApplicantPipelineService'
import { Skeleton } from '../../../design/ui'
import { useApplicantVerifiedCertifications } from '../../../hooks/useApplicantVerifiedCertifications'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import { certificationWorkflowStatus } from '../../../../domain/models/VerifiedCertification'
import { describeNoVerifiedCertifications } from '../../../utilities/jobApplicationDisplay'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'

interface ApplicantVerifiedCertificationsSectionProps {
  readonly applicantPipelineService: ApplicantPipelineService
  readonly applicationId: string
}

/** Only workflow-issued, shop-issued certifications; never anything the worker typed. */
export function ApplicantVerifiedCertificationsSection({
  applicantPipelineService,
  applicationId,
}: ApplicantVerifiedCertificationsSectionProps): ReactElement {
  const { certifications, isLoadingCertifications, certificationsErrorMessage, reloadCertifications } =
    useApplicantVerifiedCertifications(applicantPipelineService, applicationId)
  const noCertificationsCopy = describeNoVerifiedCertifications(certificationWorkflowStatus.isAvailable)

  return (
    <section aria-label="Verified certifications" className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink-900)]">
        <BadgeCheck className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
        Verified certifications
      </h4>
      {isLoadingCertifications ? (
        <div aria-busy="true" aria-label="Loading verified certifications">
          <Skeleton heightClassName="h-6" />
        </div>
      ) : certificationsErrorMessage !== null ? (
        <LoadErrorNotice
          title="Verified certifications could not be loaded"
          errorMessage={certificationsErrorMessage}
          onRetry={(): void => {
            reloadCertifications()
          }}
        />
      ) : certifications.length === 0 ? (
        <div className="space-y-1 text-sm">
          <p className="font-medium text-[var(--color-ink-700)]">{noCertificationsCopy.title}</p>
          <p className="text-xs text-[var(--color-ink-500)]">{noCertificationsCopy.detail}</p>
        </div>
      ) : (
        <ul className="space-y-1 text-sm text-[var(--color-ink-700)]">
          {certifications.map((certification) => (
            <li key={certification.certificationId} className="break-words">
              {certification.certificationTitle} (shop-issued by {certification.issuingShopName}),
              issued {formatShortDateTime(certification.issuedAt)}
              {certification.expiresAt === null
                ? null
                : `, expires ${formatShortDateTime(certification.expiresAt)}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
