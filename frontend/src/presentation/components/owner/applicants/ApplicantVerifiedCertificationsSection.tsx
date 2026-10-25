import type { ReactElement } from 'react'
import { BadgeCheck } from 'lucide-react'
import type { ApplicantPipelineService } from '../../../../application/services/ApplicantPipelineService'
import { Skeleton } from '../../../design/ui'
import { useApplicantVerifiedCertifications } from '../../../hooks/useApplicantVerifiedCertifications'
import { applicantIssuingShopNoLongerVerifiedText, shopIssuedDisclaimer } from '../../../utilities/certificationCopy'
import { formatCertificationDate } from '../../../utilities/certificationDisplay'
import { describeNoVerifiedCertifications } from '../../../utilities/jobApplicationDisplay'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'

interface ApplicantVerifiedCertificationsSectionProps {
  readonly applicantPipelineService: ApplicantPipelineService
  readonly applicationId: string
}

/** The applicant's CURRENT shop-issued certifications from any shop; never anything the worker typed. */
export function ApplicantVerifiedCertificationsSection({
  applicantPipelineService,
  applicationId,
}: ApplicantVerifiedCertificationsSectionProps): ReactElement {
  const { certifications, isLoadingCertifications, certificationsErrorMessage, reloadCertifications } =
    useApplicantVerifiedCertifications(applicantPipelineService, applicationId)
  const noCertificationsCopy = describeNoVerifiedCertifications()

  return (
    <section aria-label="Shop-issued certifications" className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink-900)]">
        <BadgeCheck className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
        Shop-issued certifications
      </h4>
      {isLoadingCertifications ? (
        <div aria-busy="true" aria-label="Loading shop-issued certifications">
          <Skeleton heightClassName="h-6" />
        </div>
      ) : certificationsErrorMessage !== null ? (
        <LoadErrorNotice
          title="Shop-issued certifications could not be loaded"
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
        <div className="space-y-1">
          <ul aria-label="Current shop-issued certifications" className="space-y-1 text-sm text-[var(--color-ink-700)]">
            {certifications.map((certification) => (
              <li key={certification.certificationId} className="break-words">
                {certification.certificationTitle} (shop-issued by {certification.issuingShopName}), issued{' '}
                {formatCertificationDate(certification.issuedAt)}
                {certification.expiresAt === null ? null : `, expires ${formatCertificationDate(certification.expiresAt)}`}
                {certification.isIssuingShopCurrentlyVerified === false ? (
                  <span className="block text-xs text-[var(--color-ink-500)]">{applicantIssuingShopNoLongerVerifiedText}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-[var(--color-ink-500)]">{shopIssuedDisclaimer}</p>
        </div>
      )}
    </section>
  )
}
