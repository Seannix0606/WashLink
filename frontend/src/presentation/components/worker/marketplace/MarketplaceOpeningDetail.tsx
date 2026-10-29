import type { ReactElement } from 'react'
import { AlertTriangle, Flag, Info, Send } from 'lucide-react'
import type { MarketplaceService } from '../../../../application/services/MarketplaceService'
import type { JobOpening } from '../../../../domain/models/JobOpening'
import type { MarketplaceJobOpening } from '../../../../domain/models/MarketplaceJobOpening'
import { Button, Modal, Skeleton } from '../../../design/ui'
import { useMarketplaceOpeningDetail } from '../../../hooks/useMarketplaceOpeningDetail'
import { jobOpeningDetailsDisclaimer } from '../../../utilities/jobOpeningDisplay'
import { reportButtonLabel } from '../../../utilities/jobOpeningModerationCopy'
import {
  loadingWorkerCertificationState,
  type WorkerVerifiedCertificationState,
} from '../../../../domain/models/VerifiedCertification'
import {
  describeWorkerCertificationWarning,
  isApplyBlockedByCertification,
} from '../../../utilities/workforceNoticeCopy'
import { JobApplicationStatusBadge } from '../../jobOpenings/JobApplicationStatusBadge'
import { JobOpeningDetailsView } from '../../jobOpenings/JobOpeningDetailsView'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'

interface MarketplaceOpeningDetailProps {
  readonly marketplaceService: MarketplaceService
  /** The search row the worker opened; null closes the dialog. */
  readonly selectedJobOpening: MarketplaceJobOpening | null
  readonly onApplyRequested: (selectedJobOpening: MarketplaceJobOpening, jobOpening: JobOpening) => void
  readonly onClose: () => void
  /** The worker's real certification state (D-20); only read for certification-required openings. */
  readonly workerCertificationState?: WorkerVerifiedCertificationState
  /** W14: shown only when given (worker accounts) and the opening was readable (D-50). */
  readonly onReportRequested?: (selectedJobOpening: MarketplaceJobOpening, jobOpening: JobOpening) => void
}

/** The full current opening, shown exactly as the shop entered it. */
export function MarketplaceOpeningDetail({
  marketplaceService,
  selectedJobOpening,
  onApplyRequested,
  onClose,
  workerCertificationState = loadingWorkerCertificationState,
  onReportRequested,
}: MarketplaceOpeningDetailProps): ReactElement {
  const { jobOpening, isLoadingJobOpening, jobOpeningErrorMessage, reloadJobOpening } =
    useMarketplaceOpeningDetail(marketplaceService, selectedJobOpening?.jobOpeningId ?? null)
  const myApplicationStatus = selectedJobOpening?.myApplicationStatus ?? null
  const applicantRequirement = jobOpening?.applicantRequirement ?? null
  const certificationWarning =
    applicantRequirement === 'certification_required' ? describeWorkerCertificationWarning(workerCertificationState) : null
  const isBlockedByCertification = isApplyBlockedByCertification(applicantRequirement, workerCertificationState)
  const canApply = jobOpening !== null && jobOpening.status === 'published' && myApplicationStatus === null
  const canReport = onReportRequested !== undefined && jobOpening !== null && jobOpening.status !== 'draft'

  return (
    <Modal
      isOpen={selectedJobOpening !== null}
      onClose={onClose}
      title="Job opening details"
      maxWidthClassName="max-w-2xl"
      footer={
        selectedJobOpening !== null && jobOpening !== null ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            {myApplicationStatus !== null ? (
              <JobApplicationStatusBadge status={myApplicationStatus} prefix="Your application:" />
            ) : null}
            {canReport ? (
              <Button
                variant="ghost"
                leadingIcon={<Flag className="h-4 w-4" />}
                onClick={(): void => {
                  onReportRequested(selectedJobOpening, jobOpening)
                }}
              >
                {reportButtonLabel}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {canApply ? (
              <Button
                leadingIcon={<Send className="h-4 w-4" />}
                disabled={isBlockedByCertification}
                onClick={(): void => {
                  onApplyRequested(selectedJobOpening, jobOpening)
                }}
              >
                Apply
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      <div className="max-h-[65dvh] space-y-4 overflow-y-auto pr-1">
        {isLoadingJobOpening ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading job opening">
            <Skeleton heightClassName="h-6" />
            <Skeleton heightClassName="h-24" />
          </div>
        ) : jobOpeningErrorMessage !== null || jobOpening === null ? (
          <LoadErrorNotice
            title="Job opening could not be loaded"
            errorMessage={jobOpeningErrorMessage ?? 'Could not load the job opening.'}
            onRetry={(): void => {
              reloadJobOpening()
            }}
          />
        ) : (
          <>
            <p
              role="note"
              className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-ink-700)]"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {jobOpeningDetailsDisclaimer}
            </p>
            {certificationWarning !== null ? (
              <p
                role="note"
                className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] px-3 py-2 text-sm text-[var(--color-warning-600)]"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {certificationWarning}
              </p>
            ) : null}
            <JobOpeningDetailsView
              jobOpeningContent={jobOpening}
              shopName={selectedJobOpening?.shopName ?? ''}
            />
          </>
        )}
      </div>
    </Modal>
  )
}
