import type { ReactElement } from 'react'
import { useState } from 'react'
import { ChevronRight, Scale } from 'lucide-react'
import type { CertificationPlatformReviewService } from '../../../application/services/CertificationPlatformReviewService'
import { platformReviewStatuses, type PlatformReviewStatus } from '../../../domain/models/CertificationPlatformReview'
import { Badge, Card, EmptyState, Select, Skeleton } from '../../design/ui'
import { useAdminCertificationReviewQueue } from '../../hooks/useAdminCertificationReviewQueue'
import { formatCertificationDate } from '../../utilities/certificationDisplay'
import {
  adminPlatformReviewEmptyText,
  adminPlatformReviewEmptyTitle,
  adminPlatformReviewQueueHeading,
  adminPlatformReviewQueueIntro,
  platformReviewBasisText,
  platformReviewStatusFilterLabels,
} from '../../utilities/platformReviewCopy'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'
import { CertificationReviewCaseDrawer } from './CertificationReviewCaseDrawer'

const statusOptions = platformReviewStatuses.map((status) => ({ value: status, label: platformReviewStatusFilterLabels[status] }))

interface CertificationReviewQueuePanelProps {
  readonly platformReviewService: CertificationPlatformReviewService
}

/** Super_admin "Certification reviews": the WashLink review queue by status, oldest first, and the case drawer. */
export function CertificationReviewQueuePanel({ platformReviewService }: CertificationReviewQueuePanelProps): ReactElement {
  const [status, setStatus] = useState<PlatformReviewStatus>('open')
  const queue = useAdminCertificationReviewQueue(platformReviewService, status)
  const [openReviewId, setOpenReviewId] = useState<string | null>(null)

  const renderBody = (): ReactElement => {
    if (queue.isLoading) {
      return (
        <div aria-busy="true" aria-label="Loading the WashLink review queue" className="space-y-2">
          <Skeleton heightClassName="h-16" />
          <Skeleton heightClassName="h-16" />
        </div>
      )
    }
    if (queue.errorMessage !== null) {
      return (
        <LoadErrorNotice
          title="The WashLink review queue could not be loaded"
          errorMessage={queue.errorMessage}
          onRetry={(): void => {
            void queue.reload()
          }}
        />
      )
    }
    if (queue.isEmpty) {
      return <EmptyState icon={<Scale className="h-5 w-5" />} title={adminPlatformReviewEmptyTitle} description={adminPlatformReviewEmptyText} />
    }
    return (
      <ul aria-label="WashLink review queue" className="space-y-2">
        {queue.items.map((item) => (
          <li key={item.reviewId}>
            <button
              type="button"
              aria-label={`Open the review of ${item.certificationTitle} from ${item.shopNameSnapshot}`}
              onClick={(): void => {
                setOpenReviewId(item.reviewId)
              }}
              className="flex w-full items-start justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-[var(--color-card)] p-3 text-left transition-colors hover:border-[var(--color-brand-400)]"
            >
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-semibold break-words text-[var(--color-ink-900)]">{item.certificationTitle}</span>
                <span className="block text-xs break-words text-[var(--color-ink-500)]">{item.shopNameSnapshot}</span>
                <span className="block text-xs text-[var(--color-ink-700)]">{platformReviewBasisText[item.basis]}</span>
                <span className="block text-[11px] text-[var(--color-ink-500)]">
                  {`Asked ${formatCertificationDate(item.openedAt)} · certificate ${item.certificationStatus} · shop ${
                    item.isIssuingShopPresent ? (item.isIssuingShopCurrentlyVerified ? 'verified' : 'not verified now') : 'removed'
                  }`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Badge tone={item.status === 'open' ? 'warning' : 'neutral'}>{platformReviewStatusFilterLabels[item.status]}</Badge>
                <ChevronRight className="h-4 w-4 text-[var(--color-ink-500)]" aria-hidden="true" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Card elevation="raised" role="region" aria-labelledby="certification-reviews-heading" className="space-y-4">
      <header>
        <h2 id="certification-reviews-heading" className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <Scale className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          {adminPlatformReviewQueueHeading}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{adminPlatformReviewQueueIntro}</p>
      </header>
      <div className="sm:w-64">
        <Select
          id="platform-review-status"
          name="platform-review-status"
          label="Show"
          options={statusOptions}
          value={status}
          onChange={(changeEvent): void => {
            setStatus(platformReviewStatuses.find((candidate) => candidate === changeEvent.target.value) ?? 'open')
          }}
        />
      </div>
      {renderBody()}
      <CertificationReviewCaseDrawer
        platformReviewService={platformReviewService}
        reviewId={openReviewId}
        onClose={(): void => {
          setOpenReviewId(null)
        }}
        onDecided={queue.refresh}
      />
    </Card>
  )
}
