import type { ReactElement } from 'react'
import { useState } from 'react'
import { ArrowLeft, Info, Users } from 'lucide-react'
import type { ApplicantPipelineService } from '../../../../application/services/ApplicantPipelineService'
import { jobApplicationStatuses, type JobApplicationStatus } from '../../../../domain/models/JobApplication'
import type { JobOpening } from '../../../../domain/models/JobOpening'
import type { OwnerJobApplicationTransition } from '../../../../domain/utilities/jobApplicationLifecycle'
import { Button, EmptyState, Skeleton, Tabs, type TabItemDefinition } from '../../../design/ui'
import { useApplicantPipeline } from '../../../hooks/useApplicantPipeline'
import { describeJobApplicationStatus } from '../../../utilities/jobApplicationDisplay'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { ApplicantListItem } from './ApplicantListItem'
import { ApplicantProfileDrawer } from './ApplicantProfileDrawer'
import { ApplicantTransitionConfirmModal } from './ApplicantTransitionConfirmModal'

type ApplicantStatusFilter = 'all' | JobApplicationStatus

/** Owners never see drafts, so drafts get no tab. */
const pipelineStatuses = jobApplicationStatuses.filter((status) => status !== 'draft')

interface ApplicantPipelinePanelProps {
  readonly applicantPipelineService: ApplicantPipelineService
  readonly jobOpening: JobOpening
  readonly shopName: string
  readonly isShopVerified: boolean
  readonly onBack: () => void
}

interface PendingTransition {
  readonly applicationId: string
  readonly toStatus: OwnerJobApplicationTransition
}

/** Applicants of one opening, by status, with confirmed decisions. */
export function ApplicantPipelinePanel({
  applicantPipelineService,
  jobOpening,
  shopName,
  isShopVerified,
  onBack,
}: ApplicantPipelinePanelProps): ReactElement {
  const {
    pipeline,
    isLoadingPipeline,
    pipelineErrorMessage,
    isPipelineEmpty,
    pendingApplicationId,
    reloadPipeline,
    transitionApplication,
  } = useApplicantPipeline(applicantPipelineService, jobOpening.id, jobOpening.status)
  const [statusFilter, setStatusFilter] = useState<ApplicantStatusFilter>('all')
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(null)
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null)

  const { applications, applicantProfileByApplicationId } = pipeline
  const openApplication = applications.find((application) => application.id === openApplicationId) ?? null
  const pendingApplication =
    applications.find((application) => application.id === pendingTransition?.applicationId) ?? null
  const visibleApplications =
    statusFilter === 'all' ? applications : applications.filter((application) => application.status === statusFilter)
  const statusTabs: TabItemDefinition<ApplicantStatusFilter>[] = [
    { value: 'all', label: 'All', badgeContent: applications.length },
    ...pipelineStatuses.map((status) => ({
      value: status,
      label: describeJobApplicationStatus(status).displayLabel,
      badgeContent: applications.filter((application) => application.status === status).length,
    })),
  ]
  const isOpeningDecidable = jobOpening.status === 'published' || jobOpening.status === 'paused'
  const applicantNameOf = (applicationId: string): string =>
    applicantProfileByApplicationId.get(applicationId)?.displayName ?? 'Applicant'

  const confirmTransition = async (): Promise<void> => {
    if (pendingTransition === null || pendingApplication === null) {
      setPendingTransition(null)
      return
    }
    await transitionApplication(pendingApplication, pendingTransition.toStatus)
    setPendingTransition(null)
  }

  return (
    <section aria-label={`Applicants for ${jobOpening.title}`} className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold break-words text-[var(--color-ink-900)]">
            <Users className="h-4 w-4 shrink-0 text-[var(--color-brand-700)]" aria-hidden="true" />
            Applicants: {jobOpening.title}
          </h3>
          <p className="text-xs break-words text-[var(--color-ink-500)]">{shopName}</p>
        </div>
        <Button size="sm" variant="ghost" leadingIcon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>
          Back to job openings
        </Button>
      </div>

      {!isOpeningDecidable ? (
        <p role="status" className="flex items-start gap-2 text-xs text-[var(--color-ink-500)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          This job opening is closed. Decisions can no longer be recorded; open applications were closed.
        </p>
      ) : null}

      {isLoadingPipeline ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading applicants">
          <Skeleton heightClassName="h-16" />
          <Skeleton heightClassName="h-16" />
        </div>
      ) : pipelineErrorMessage !== null ? (
        <LoadErrorNotice
          title="Applicants could not be loaded"
          errorMessage={pipelineErrorMessage}
          onRetry={(): void => {
            void reloadPipeline()
          }}
        />
      ) : isPipelineEmpty ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No applications yet"
          description="Applications appear here once workers apply to this opening."
        />
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <Tabs
              accessibleLabel="Filter applicants by status"
              tabItems={statusTabs}
              activeTabValue={statusFilter}
              onTabChange={setStatusFilter}
            />
          </div>
          {visibleApplications.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-ink-500)]">
              No applications with this status.
            </p>
          ) : (
            <ul aria-label="Applicants" className="space-y-3">
              {visibleApplications.map((application) => (
                <ApplicantListItem
                  key={application.id}
                  application={application}
                  applicantProfile={applicantProfileByApplicationId.get(application.id) ?? null}
                  onOpenRequested={(selectedApplication): void => {
                    setOpenApplicationId(selectedApplication.id)
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <ApplicantProfileDrawer
        applicantPipelineService={applicantPipelineService}
        application={pendingTransition === null ? openApplication : null}
        applicantProfile={
          openApplication === null ? null : (applicantProfileByApplicationId.get(openApplication.id) ?? null)
        }
        openingStatus={jobOpening.status}
        isShopVerified={isShopVerified}
        isActionPending={openApplication !== null && pendingApplicationId === openApplication.id}
        onTransitionRequested={(application, toStatus): void => {
          setPendingTransition({ applicationId: application.id, toStatus })
        }}
        onClose={(): void => {
          setOpenApplicationId(null)
        }}
      />

      <ApplicantTransitionConfirmModal
        toStatus={pendingTransition?.toStatus ?? null}
        applicantName={pendingTransition === null ? '' : applicantNameOf(pendingTransition.applicationId)}
        isSubmitting={pendingTransition !== null && pendingApplicationId === pendingTransition.applicationId}
        onConfirm={(): void => {
          void confirmTransition()
        }}
        onCancel={(): void => {
          setPendingTransition(null)
        }}
      />
    </section>
  )
}
