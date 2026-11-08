import type { ReactElement } from 'react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { Briefcase, Info, Plus, Store } from 'lucide-react'
import type { ApplicantPipelineService } from '../../../../application/services/ApplicantPipelineService'
import type { JobOpeningModerationService } from '../../../../application/services/JobOpeningModerationService'
import type { JobOpeningService } from '../../../../application/services/JobOpeningService'
import {
  jobOpeningLimits,
  jobOpeningStatuses,
  type JobOpening,
  type JobOpeningStatus,
} from '../../../../domain/models/JobOpening'
import type { OwnerJobOpeningModeration } from '../../../../domain/models/JobOpeningModeration'
import type { Shop } from '../../../../domain/models/Shop'
import type { TrainingDependencies } from '../../../dependencyInjection/createTrainingDependencies'
import { Button, Card, EmptyState, Modal, Skeleton, Tabs, type TabItemDefinition } from '../../../design/ui'
import { useJobOpeningApplicationCounts } from '../../../hooks/useJobOpeningApplicationCounts'
import { useOwnerJobOpeningModeration } from '../../../hooks/useOwnerJobOpeningModeration'
import { useOwnerJobOpenings } from '../../../hooks/useOwnerJobOpenings'
import {
  targetStatusByTransitionAction,
  type JobOpeningConfirmableAction,
} from '../../../utilities/jobOpeningActionDisplay'
import {
  describeJobOpeningStatus,
  formatOwnListTruncationNotice,
} from '../../../utilities/jobOpeningDisplay'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { JobOpeningEditorModal } from './JobOpeningEditorModal'
import { JobOpeningListItem } from './JobOpeningListItem'
import { JobOpeningPreview } from './JobOpeningPreview'
import { JobOpeningTransitionConfirmModal } from './JobOpeningTransitionConfirmModal'
import { SubmitOpeningChangesModal } from './SubmitOpeningChangesModal'

// W5: the applicant pipeline loads only when the owner opens it.
const ApplicantPipelinePanel = lazy(async () => {
  const applicantsModule = await import('../applicants/ApplicantPipelinePanel')
  return { default: applicantsModule.ApplicantPipelinePanel }
})

type JobOpeningStatusFilter = 'all' | JobOpeningStatus

/** Archived openings are not loaded, so they get no filter tab. */
const listedJobOpeningStatuses = jobOpeningStatuses.filter((status) => status !== 'archived')

type JobOpeningEditorTarget = { readonly mode: 'create' } | { readonly mode: 'edit'; readonly jobOpening: JobOpening }

interface PendingConfirmation {
  readonly jobOpening: JobOpening
  readonly action: Exclude<JobOpeningConfirmableAction, 'save_published'>
}

interface OwnerJobOpeningsPanelProps {
  readonly jobOpeningService: JobOpeningService
  readonly applicantPipelineService: ApplicantPipelineService
  readonly ownerShopList: readonly Shop[]
  /** W6: lets the applicant drawer invite accepted applicants to training. */
  readonly trainingDependencies?: TrainingDependencies
  /** W14: WashLink notices on held openings (optional for W4-W11 callers). */
  readonly jobOpeningModerationService?: JobOpeningModerationService
}

export function OwnerJobOpeningsPanel({
  jobOpeningService,
  applicantPipelineService,
  ownerShopList,
  trainingDependencies,
  jobOpeningModerationService,
}: OwnerJobOpeningsPanelProps): ReactElement {
  const ownerShopIds = useMemo(() => ownerShopList.map((ownerShop) => ownerShop.id), [ownerShopList])
  const {
    jobOpenings,
    shopPublishEligibility,
    loadedAt,
    isLoadingJobOpenings,
    jobOpeningsErrorMessage,
    isJobOpeningListEmpty,
    isJobOpeningListTruncated,
    pendingJobOpeningId,
    reloadJobOpenings,
    transitionJobOpening,
    deleteJobOpeningDraft,
    saveJobOpening,
  } = useOwnerJobOpenings(jobOpeningService, ownerShopIds)

  const [statusFilter, setStatusFilter] = useState<JobOpeningStatusFilter>('all')
  const [editorTarget, setEditorTarget] = useState<JobOpeningEditorTarget | null>(null)
  const [previewedJobOpening, setPreviewedJobOpening] = useState<JobOpening | null>(null)
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null)
  const [pipelineJobOpeningId, setPipelineJobOpeningId] = useState<string | null>(null)
  const openingModeration = useOwnerJobOpeningModeration(jobOpeningModerationService)
  const [changesTarget, setChangesTarget] = useState<OwnerJobOpeningModeration | null>(null)
  const jobOpeningIds = useMemo(() => jobOpenings.map((jobOpening) => jobOpening.id), [jobOpenings])
  const { applicationCountByOpening, hasLoadedApplicationCounts, refreshApplicationCounts } =
    useJobOpeningApplicationCounts(applicantPipelineService, jobOpeningIds)
  const pipelineJobOpening =
    jobOpenings.find((jobOpening) => jobOpening.id === pipelineJobOpeningId) ?? null

  const shopNameById = useMemo(
    () => new Map(ownerShopList.map((ownerShop) => [ownerShop.id, ownerShop.name])),
    [ownerShopList],
  )
  const hasUnverifiedShop =
    !isLoadingJobOpenings &&
    jobOpeningsErrorMessage === null &&
    ownerShopIds.some((shopId) => shopPublishEligibility[shopId] !== true)
  const visibleJobOpenings =
    statusFilter === 'all'
      ? jobOpenings
      : jobOpenings.filter((jobOpening) => jobOpening.status === statusFilter)
  const statusFilterTabs: TabItemDefinition<JobOpeningStatusFilter>[] = [
    { value: 'all', label: 'All', badgeContent: jobOpenings.length },
    ...listedJobOpeningStatuses.map((status) => ({
      value: status,
      label: describeJobOpeningStatus(status).displayLabel,
    })),
  ]
  const hasNoShops = ownerShopList.length === 0
  const shopNameOf = (shopId: string): string => shopNameById.get(shopId) ?? 'Unknown shop'

  const confirmPendingAction = async (): Promise<void> => {
    if (pendingConfirmation === null) {
      return
    }
    const { jobOpening, action } = pendingConfirmation
    if (action === 'delete') {
      await deleteJobOpeningDraft(jobOpening)
    } else {
      await transitionJobOpening(jobOpening, targetStatusByTransitionAction[action])
    }
    setPendingConfirmation(null)
  }

  return (
    <Card elevation="raised" className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
            <Briefcase className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
            Job openings
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">
            Post openings for your shops. Drafts are visible only to you.
          </p>
        </div>
        {!hasNoShops ? (
          <Button
            size="sm"
            leadingIcon={<Plus className="h-4 w-4" />}
            onClick={(): void => {
              setEditorTarget({ mode: 'create' })
            }}
          >
            New job opening
          </Button>
        ) : null}
      </header>

      {hasUnverifiedShop && !hasNoShops ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] px-3 py-2 text-sm text-[var(--color-warning-600)]"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          You can save drafts now. Publishing needs an approved shop verification.
        </p>
      ) : null}

      {pipelineJobOpening !== null ? (
        <Suspense fallback={<Skeleton heightClassName="h-40" />}>
          <ApplicantPipelinePanel
            applicantPipelineService={applicantPipelineService}
            jobOpening={pipelineJobOpening}
            shopName={shopNameOf(pipelineJobOpening.shopId)}
            isShopVerified={shopPublishEligibility[pipelineJobOpening.shopId] === true}
            trainingDependencies={trainingDependencies}
            onBack={(): void => {
              setPipelineJobOpeningId(null)
              refreshApplicationCounts()
            }}
          />
        </Suspense>
      ) : hasNoShops ? (
        <EmptyState
          icon={<Store className="h-5 w-5" />}
          title="Add a shop first"
          description="Job openings belong to a shop. Add your shop in My shops, then come back here."
        />
      ) : isLoadingJobOpenings ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading job openings">
          <Skeleton heightClassName="h-20" />
          <Skeleton heightClassName="h-20" />
        </div>
      ) : jobOpeningsErrorMessage !== null ? (
        <LoadErrorNotice
          title="Job openings could not be loaded"
          errorMessage={jobOpeningsErrorMessage}
          onRetry={(): void => {
            void reloadJobOpenings()
          }}
        />
      ) : isJobOpeningListEmpty ? (
        <EmptyState
          icon={<Briefcase className="h-5 w-5" />}
          title="No job openings yet"
          description="Create a draft. Only you can see it until you publish."
        />
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <Tabs
              accessibleLabel="Filter job openings by status"
              tabItems={statusFilterTabs}
              activeTabValue={statusFilter}
              onTabChange={setStatusFilter}
            />
          </div>
          {isJobOpeningListTruncated ? (
            <p role="status" className="text-xs text-[var(--color-ink-500)]">
              {formatOwnListTruncationNotice(jobOpeningLimits.ownListMaximum)}
            </p>
          ) : null}
          {visibleJobOpenings.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-ink-500)]">
              No job openings with this status.
            </p>
          ) : (
            <ul aria-label="Job openings" className="space-y-3">
              {visibleJobOpenings.map((jobOpening) => (
                <JobOpeningListItem
                  key={jobOpening.id}
                  jobOpening={jobOpening}
                  shopName={shopNameOf(jobOpening.shopId)}
                  isShopVerifiedForPublishing={shopPublishEligibility[jobOpening.shopId] === true}
                  evaluatedAt={loadedAt}
                  isActionPending={pendingJobOpeningId === jobOpening.id}
                  onEditRequested={(selectedJobOpening): void => {
                    setEditorTarget({ mode: 'edit', jobOpening: selectedJobOpening })
                  }}
                  onPreviewRequested={setPreviewedJobOpening}
                  applicationCount={
                    hasLoadedApplicationCounts ? (applicationCountByOpening[jobOpening.id] ?? 0) : undefined
                  }
                  onApplicantsRequested={(selectedJobOpening): void => {
                    setPipelineJobOpeningId(selectedJobOpening.id)
                  }}
                  moderation={openingModeration.moderationByOpeningId.get(jobOpening.id)}
                  isModerationSubmitting={openingModeration.isSubmitting}
                  onAskWashLinkRequested={setChangesTarget}
                  onActionRequested={(selectedJobOpening, action): void => {
                    if (action !== 'save_published') {
                      setPendingConfirmation({ jobOpening: selectedJobOpening, action })
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {editorTarget !== null ? (
        <JobOpeningEditorModal
          key={editorTarget.mode === 'edit' ? editorTarget.jobOpening.id : 'new'}
          jobOpening={editorTarget.mode === 'edit' ? editorTarget.jobOpening : null}
          initialShopId={ownerShopList.length === 1 ? (ownerShopList[0]?.id ?? '') : ''}
          ownerShopList={ownerShopList}
          onSave={async (shopId, saveJobOpeningInput): Promise<boolean> => {
            const isSaved = await saveJobOpening(editorTarget.mode === 'edit' ? editorTarget.jobOpening : null, shopId, saveJobOpeningInput)
            // W14: an edit can make a held opening ready for "Ask WashLink to check it".
            await openingModeration.refresh()
            return isSaved
          }}
          onClose={(): void => {
            setEditorTarget(null)
          }}
        />
      ) : null}

      <Modal
        isOpen={previewedJobOpening !== null}
        onClose={(): void => {
          setPreviewedJobOpening(null)
        }}
        title="Job opening preview"
        maxWidthClassName="max-w-2xl"
      >
        {previewedJobOpening !== null ? (
          <div className="max-h-[70dvh] overflow-y-auto pr-1">
            <JobOpeningPreview
              jobOpeningContent={previewedJobOpening}
              shopName={shopNameOf(previewedJobOpening.shopId)}
              isOwnerPreview={previewedJobOpening.status !== 'published'}
            />
          </div>
        ) : null}
      </Modal>

      <SubmitOpeningChangesModal
        moderation={changesTarget}
        isSubmitting={openingModeration.isSubmitting}
        onSubmit={openingModeration.submitChanges}
        onClose={(): void => {
          setChangesTarget(null)
        }}
      />

      <JobOpeningTransitionConfirmModal
        action={pendingConfirmation?.action ?? null}
        jobOpeningTitle={pendingConfirmation?.jobOpening.title ?? ''}
        isSubmitting={pendingConfirmation !== null && pendingJobOpeningId === pendingConfirmation.jobOpening.id}
        onConfirm={(): void => {
          void confirmPendingAction()
        }}
        onCancel={(): void => {
          setPendingConfirmation(null)
        }}
      />
    </Card>
  )
}
