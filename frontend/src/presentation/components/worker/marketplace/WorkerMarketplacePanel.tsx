import type { ReactElement } from 'react'
import { useState } from 'react'
import { Search } from 'lucide-react'
import type { JobApplicationService } from '../../../../application/services/JobApplicationService'
import type { MarketplaceService } from '../../../../application/services/MarketplaceService'
import type { JobOpening } from '../../../../domain/models/JobOpening'
import type { MarketplaceJobOpening } from '../../../../domain/models/MarketplaceJobOpening'
import type { WorkerVerifiedCertificationState } from '../../../../domain/models/VerifiedCertification'
import { Button, Card, EmptyState, Skeleton } from '../../../design/ui'
import { useApplyToJobOpening } from '../../../hooks/useApplyToJobOpening'
import { useMarketplaceSearch } from '../../../hooks/useMarketplaceSearch'
import { toApplyOpeningRequirements } from '../../../utilities/applyOpeningRequirements'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { ApplyToOpeningModal, type ApplyTarget } from './ApplyToOpeningModal'
import { MarketplaceFilterBar } from './MarketplaceFilterBar'
import { MarketplaceOpeningCard } from './MarketplaceOpeningCard'
import { MarketplaceOpeningDetail } from './MarketplaceOpeningDetail'
import { TrainingAndWorkNotice } from './TrainingAndWorkNotice'

interface WorkerMarketplacePanelProps {
  readonly marketplaceService: MarketplaceService
  readonly jobApplicationService: JobApplicationService
  readonly hasWorkerProfile: boolean
  readonly onCreateProfileRequested: () => void
  /** The worker's real certification state (D-20) for certification-required openings. */
  readonly workerCertificationState?: WorkerVerifiedCertificationState
}

/** Apply always starts from the loaded opening, so its requirements are in the dialog. */
function toApplyTarget(selectedJobOpening: MarketplaceJobOpening, jobOpening: JobOpening): ApplyTarget {
  return {
    jobOpeningId: selectedJobOpening.jobOpeningId,
    title: selectedJobOpening.title,
    shopName: selectedJobOpening.shopName,
    applicantRequirement: jobOpening.applicantRequirement,
    openingRequirements: { kind: 'loaded', requirements: toApplyOpeningRequirements(jobOpening) },
    initialCoverNote: '',
  }
}

/** "Find work": the training notice first, then filters and results. */
export function WorkerMarketplacePanel({
  marketplaceService,
  jobApplicationService,
  hasWorkerProfile,
  onCreateProfileRequested,
  workerCertificationState,
}: WorkerMarketplacePanelProps): ReactElement {
  const {
    jobOpenings,
    isLoadingJobOpenings,
    isLoadingMoreJobOpenings,
    searchErrorMessage,
    isSearchResultEmpty,
    hasMoreJobOpenings,
    searchJobOpenings,
    loadMoreJobOpenings,
    reloadJobOpenings,
    markApplicationStatus,
  } = useMarketplaceSearch(marketplaceService)
  const { isSubmittingApplication, applyErrorMessage, clearApplyError, submitApplication } =
    useApplyToJobOpening(jobApplicationService)
  const [detailJobOpening, setDetailJobOpening] = useState<MarketplaceJobOpening | null>(null)
  const [applyTarget, setApplyTarget] = useState<ApplyTarget | null>(null)

  const sendApplication = async (coverNoteInput: string, hasAcknowledgedNotice: boolean): Promise<void> => {
    if (applyTarget === null) {
      return
    }
    const submittedApplication = await submitApplication({
      jobOpeningId: applyTarget.jobOpeningId,
      existingDraft: null,
      coverNoteInput,
      hasAcknowledgedNotice,
    })
    if (submittedApplication !== null) {
      markApplicationStatus(applyTarget.jobOpeningId, submittedApplication.status)
      setApplyTarget(null)
      setDetailJobOpening(null)
    }
  }

  return (
    <Card elevation="raised" className="space-y-4">
      <header>
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <Search className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          Find work
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">
          Open job openings from verified car wash shops.
        </p>
      </header>

      <TrainingAndWorkNotice />

      <MarketplaceFilterBar
        isSearching={isLoadingJobOpenings}
        onSearch={(marketplaceSearchFilters): void => {
          void searchJobOpenings(marketplaceSearchFilters)
        }}
      />

      {isLoadingJobOpenings ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading job openings">
          <Skeleton heightClassName="h-24" />
          <Skeleton heightClassName="h-24" />
        </div>
      ) : searchErrorMessage !== null ? (
        <LoadErrorNotice
          title="Job openings could not be loaded"
          errorMessage={searchErrorMessage}
          onRetry={(): void => {
            void reloadJobOpenings()
          }}
        />
      ) : isSearchResultEmpty ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="No job openings found"
          description="Try fewer filters, or check back later for new openings."
        />
      ) : (
        <div className="space-y-3">
          <ul aria-label="Job openings" className="space-y-3">
            {jobOpenings.map((jobOpening) => (
              <MarketplaceOpeningCard
                key={jobOpening.jobOpeningId}
                jobOpening={jobOpening}
                onViewDetailsRequested={setDetailJobOpening}
              />
            ))}
          </ul>
          {hasMoreJobOpenings ? (
            <Button
              variant="secondary"
              size="sm"
              isFullWidth
              isLoading={isLoadingMoreJobOpenings}
              onClick={(): void => {
                void loadMoreJobOpenings()
              }}
            >
              Show more openings
            </Button>
          ) : null}
        </div>
      )}

      <MarketplaceOpeningDetail
        marketplaceService={marketplaceService}
        selectedJobOpening={applyTarget === null ? detailJobOpening : null}
        onApplyRequested={(selectedJobOpening, jobOpening): void => {
          clearApplyError()
          setApplyTarget(toApplyTarget(selectedJobOpening, jobOpening))
        }}
        onClose={(): void => {
          setDetailJobOpening(null)
        }}
        workerCertificationState={workerCertificationState}
      />

      <ApplyToOpeningModal
        key={applyTarget?.jobOpeningId ?? 'none'}
        applyTarget={applyTarget}
        hasWorkerProfile={hasWorkerProfile}
        isSubmitting={isSubmittingApplication}
        errorMessage={applyErrorMessage}
        onSubmit={(coverNoteInput, hasAcknowledgedNotice): void => {
          void sendApplication(coverNoteInput, hasAcknowledgedNotice)
        }}
        onCreateProfileRequested={(): void => {
          setApplyTarget(null)
          onCreateProfileRequested()
        }}
        onClose={(): void => {
          setApplyTarget(null)
        }}
        workerCertificationState={workerCertificationState}
      />
    </Card>
  )
}
