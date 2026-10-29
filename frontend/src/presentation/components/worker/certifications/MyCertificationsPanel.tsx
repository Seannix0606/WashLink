import type { ReactElement } from 'react'
import { useState } from 'react'
import { Award } from 'lucide-react'
import type { CertificationPlatformReviewService } from '../../../../application/services/CertificationPlatformReviewService'
import type { MyCertification } from '../../../../domain/models/Certification'
import type { MyCertificationPlatformReview } from '../../../../domain/models/CertificationPlatformReview'
import type { CertificationDependencies } from '../../../dependencyInjection/createCertificationDependencies'
import { Card, EmptyState, Skeleton } from '../../../design/ui'
import { useCertificationActions } from '../../../hooks/useCertificationActions'
import { useCertificationPlatformReviews } from '../../../hooks/useCertificationPlatformReviews'
import { useMyCertifications } from '../../../hooks/useMyCertifications'
import { myCertificationsEmptyDescription, myCertificationsEmptyTitle } from '../../../utilities/certificationCopy'
import { withdrawPlatformReviewButtonLabel, withdrawPlatformReviewMessage, withdrawPlatformReviewTitle } from '../../../utilities/platformReviewCopy'
import { CertificationCard } from '../../certifications/CertificationCard'
import { ShopIssuedNotice } from '../../certifications/ShopIssuedNotice'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { TrainingConfirmModal } from '../../training/TrainingConfirmModals'
import { AskWashLinkReviewModal } from './AskWashLinkReviewModal'
import { PlatformReviewStatusNotice } from './PlatformReviewStatusNotice'
import { RequestCertificationReviewModal } from './RequestCertificationReviewModal'

interface MyCertificationsPanelProps {
  readonly certificationDependencies: CertificationDependencies
  /** W11 WashLink review; without it no WashLink review is offered (older callers). */
  readonly platformReviewService?: CertificationPlatformReviewService
  /** Injected in tests; defaults to the time of each render. */
  readonly currentInstant?: Date
}

/** "My certifications": status, expiry, issuing shop and, when suspended or revoked, the reason. */
export function MyCertificationsPanel({ certificationDependencies, platformReviewService, currentInstant }: MyCertificationsPanelProps): ReactElement {
  const { certificationService, certificationReviewService } = certificationDependencies
  const myCertifications = useMyCertifications(certificationService)
  const actions = useCertificationActions(certificationService, certificationReviewService, myCertifications.refreshCertifications)
  const platformReviews = useCertificationPlatformReviews(platformReviewService, myCertifications.refreshCertifications)
  const [reviewTarget, setReviewTarget] = useState<MyCertification | null>(null)
  const [withdrawTarget, setWithdrawTarget] = useState<MyCertification | null>(null)
  const [platformReviewTarget, setPlatformReviewTarget] = useState<MyCertification | null>(null)
  const [platformWithdrawTarget, setPlatformWithdrawTarget] = useState<MyCertificationPlatformReview | null>(null)
  const renderInstant = currentInstant ?? new Date()

  const renderPlatformReviewSlot = (certification: MyCertification): ReactElement | null => {
    const platformReview = platformReviews.findReview(certification.certificationId)
    if (platformReview === undefined) {
      return null
    }
    return (
      <PlatformReviewStatusNotice
        platformReview={platformReview}
        isActionPending={platformReviews.pendingActionKey !== null}
        onAskRequested={(): void => {
          setPlatformReviewTarget(certification)
        }}
        onWithdrawRequested={(): void => {
          setPlatformWithdrawTarget(platformReview)
        }}
      />
    )
  }

  return (
    <Card elevation="raised" className="space-y-4">
      <header>
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <Award className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          My certifications
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">
          Certificates shops issued to you on WashLink after training and a passed assessment.
        </p>
      </header>
      <ShopIssuedNotice />

      {myCertifications.isLoadingCertifications ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading your certifications">
          <Skeleton heightClassName="h-28" />
          <Skeleton heightClassName="h-28" />
        </div>
      ) : myCertifications.certificationsErrorMessage !== null ? (
        <LoadErrorNotice
          title="Your certifications could not be loaded"
          errorMessage={myCertifications.certificationsErrorMessage}
          onRetry={(): void => {
            void myCertifications.reloadCertifications()
          }}
        />
      ) : myCertifications.isCertificationListEmpty ? (
        <EmptyState icon={<Award className="h-5 w-5" />} title={myCertificationsEmptyTitle} description={myCertificationsEmptyDescription} />
      ) : (
        <ul aria-label="My certifications" className="space-y-3">
          {myCertifications.certifications.map((certification) => (
            <CertificationCard
              key={certification.certificationId}
              certificationService={certificationService}
              certification={certification}
              currentInstant={renderInstant}
              isActionPending={actions.pendingSubjectId === certification.certificationId}
              onReviewRequested={setReviewTarget}
              onWithdrawReviewRequested={setWithdrawTarget}
              platformReviewSlot={renderPlatformReviewSlot(certification)}
              isShopReviewOnHold={(platformReviews.findReview(certification.certificationId)?.openReviewId ?? null) !== null}
            />
          ))}
        </ul>
      )}

      <AskWashLinkReviewModal
        certification={platformReviewTarget}
        platformReview={platformReviewTarget === null ? undefined : platformReviews.findReview(platformReviewTarget.certificationId)}
        isSubmitting={platformReviews.pendingActionKey !== null}
        onSubmit={platformReviews.openReview}
        onClose={(): void => {
          setPlatformReviewTarget(null)
        }}
      />

      <TrainingConfirmModal
        isOpen={platformWithdrawTarget !== null}
        title={withdrawPlatformReviewTitle}
        subjectText={
          platformWithdrawTarget === null
            ? ''
            : (myCertifications.certifications.find((certification) => certification.certificationId === platformWithdrawTarget.certificationId)
                ?.certificationTitle ?? '')
        }
        message={withdrawPlatformReviewMessage}
        confirmButtonLabel={withdrawPlatformReviewButtonLabel}
        isDestructive
        isSubmitting={platformReviews.pendingActionKey !== null}
        onConfirm={(): void => {
          if (platformWithdrawTarget !== null) {
            void platformReviews.withdrawReview(platformWithdrawTarget).then(() => {
              setPlatformWithdrawTarget(null)
            })
          }
        }}
        onCancel={(): void => {
          setPlatformWithdrawTarget(null)
        }}
      />

      <RequestCertificationReviewModal
        certification={reviewTarget}
        isSubmitting={reviewTarget !== null && actions.pendingSubjectId === reviewTarget.certificationId}
        onSubmit={async (certification, statement): Promise<boolean> =>
          (await actions.requestReview(certification, statement)) === 'done'
        }
        onClose={(): void => {
          setReviewTarget(null)
        }}
      />

      <TrainingConfirmModal
        isOpen={withdrawTarget !== null}
        title="Withdraw this review request?"
        subjectText={withdrawTarget?.certificationTitle ?? ''}
        message="The shop will no longer decide on it. A withdrawn request still counts toward the 3 reviews per certificate."
        confirmButtonLabel="Withdraw request"
        isDestructive
        isSubmitting={withdrawTarget !== null && actions.pendingSubjectId === withdrawTarget.certificationId}
        onConfirm={(): void => {
          if (withdrawTarget !== null) {
            void actions.withdrawReview(withdrawTarget).then(() => {
              setWithdrawTarget(null)
            })
          }
        }}
        onCancel={(): void => {
          setWithdrawTarget(null)
        }}
      />
    </Card>
  )
}
