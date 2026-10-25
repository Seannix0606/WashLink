import type { ReactElement } from 'react'
import { useState } from 'react'
import { ClipboardList } from 'lucide-react'
import type { JobApplicationService } from '../../../../application/services/JobApplicationService'
import type { MarketplaceService } from '../../../../application/services/MarketplaceService'
import type { MyJobApplication } from '../../../../domain/models/JobApplication'
import type { WorkerVerifiedCertificationState } from '../../../../domain/models/VerifiedCertification'
import { isWorkerDeletableDraft } from '../../../../domain/utilities/jobApplicationLifecycle'
import { Card, EmptyState, Modal, Skeleton } from '../../../design/ui'
import { useApplyToJobOpening } from '../../../hooks/useApplyToJobOpening'
import { useMarketplaceOpeningDetail } from '../../../hooks/useMarketplaceOpeningDetail'
import { useMyJobApplications } from '../../../hooks/useMyJobApplications'
import {
  toApplyOpeningRequirements,
  type ApplyOpeningRequirementsState,
} from '../../../utilities/applyOpeningRequirements'
import { describeApplicationOpeningTitle } from '../../../utilities/jobApplicationDisplay'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { ApplicationSnapshotView } from './ApplicationSnapshotView'
import { ApplyToOpeningModal } from './ApplyToOpeningModal'
import { MyApplicationListItem } from './MyApplicationListItem'
import { WithdrawApplicationConfirmModal } from './WithdrawApplicationConfirmModal'

interface MyApplicationsPanelProps {
  readonly jobApplicationService: JobApplicationService
  /** Loads the current opening of a draft, so its requirements show before it is sent. */
  readonly marketplaceService: MarketplaceService
  readonly hasWorkerProfile: boolean
  readonly onCreateProfileRequested: () => void
  /** The worker's real certification state (D-20) for certification-required openings. */
  readonly workerCertificationState?: WorkerVerifiedCertificationState
}

/** "My applications": status tracking, the frozen snapshot, withdraw and drafts. */
export function MyApplicationsPanel({
  jobApplicationService,
  marketplaceService,
  hasWorkerProfile,
  onCreateProfileRequested,
  workerCertificationState,
}: MyApplicationsPanelProps): ReactElement {
  const {
    myApplications,
    isLoadingApplications,
    applicationsErrorMessage,
    isApplicationListEmpty,
    pendingApplicationId,
    reloadApplications,
    refreshApplications,
    withdrawApplication,
    deleteApplicationDraft,
  } = useMyJobApplications(jobApplicationService)
  const { isSubmittingApplication, applyErrorMessage, clearApplyError, submitApplication } =
    useApplyToJobOpening(jobApplicationService)
  const [snapshotApplication, setSnapshotApplication] = useState<MyJobApplication | null>(null)
  const [confirmApplication, setConfirmApplication] = useState<MyJobApplication | null>(null)
  const [draftToSubmit, setDraftToSubmit] = useState<MyJobApplication | null>(null)
  const { jobOpening: draftOpening, jobOpeningErrorMessage: draftOpeningErrorMessage, reloadJobOpening } =
    useMarketplaceOpeningDetail(marketplaceService, draftToSubmit?.application.jobOpeningId ?? null)
  const draftRequirementsState: ApplyOpeningRequirementsState =
    draftOpening !== null
      ? { kind: 'loaded', requirements: toApplyOpeningRequirements(draftOpening) }
      : draftOpeningErrorMessage !== null
        ? { kind: 'unavailable', message: draftOpeningErrorMessage }
        : { kind: 'loading' }

  const confirmPendingAction = async (): Promise<void> => {
    if (confirmApplication === null) {
      return
    }
    const { application } = confirmApplication
    if (isWorkerDeletableDraft(application)) {
      await deleteApplicationDraft(application)
    } else {
      await withdrawApplication(application)
    }
    setConfirmApplication(null)
  }

  const sendDraft = async (coverNoteInput: string, hasAcknowledgedNotice: boolean): Promise<void> => {
    if (draftToSubmit === null) {
      return
    }
    const submittedApplication = await submitApplication({
      jobOpeningId: draftToSubmit.application.jobOpeningId,
      existingDraft: draftToSubmit.application,
      coverNoteInput,
      hasAcknowledgedNotice,
    })
    // Refresh either way, so a stale draft shows its current state.
    await refreshApplications()
    if (submittedApplication !== null) {
      setDraftToSubmit(null)
    }
  }

  return (
    <Card elevation="raised" className="space-y-4">
      <header>
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <ClipboardList className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          My applications
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">
          Track the status of your applications. An accepted application is not a contract.
        </p>
      </header>

      {isLoadingApplications ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading your applications">
          <Skeleton heightClassName="h-20" />
          <Skeleton heightClassName="h-20" />
        </div>
      ) : applicationsErrorMessage !== null ? (
        <LoadErrorNotice
          title="Your applications could not be loaded"
          errorMessage={applicationsErrorMessage}
          onRetry={(): void => {
            void reloadApplications()
          }}
        />
      ) : isApplicationListEmpty ? (
        <EmptyState
          icon={<ClipboardList className="h-5 w-5" />}
          title="No applications yet"
          description="Applications you send from Find work appear here."
        />
      ) : (
        <ul aria-label="My applications" className="space-y-3">
          {myApplications.map((myApplication) => (
            <MyApplicationListItem
              key={myApplication.application.id}
              myApplication={myApplication}
              isActionPending={pendingApplicationId === myApplication.application.id}
              onSnapshotRequested={setSnapshotApplication}
              onWithdrawRequested={setConfirmApplication}
              onDeleteDraftRequested={setConfirmApplication}
              onSubmitDraftRequested={(selectedDraft): void => {
                clearApplyError()
                setDraftToSubmit(selectedDraft)
              }}
            />
          ))}
        </ul>
      )}

      <Modal
        isOpen={snapshotApplication !== null}
        onClose={(): void => {
          setSnapshotApplication(null)
        }}
        title="What you applied to"
        maxWidthClassName="max-w-2xl"
      >
        {snapshotApplication?.application.openingSnapshot ? (
          <div className="max-h-[70dvh] overflow-y-auto pr-1">
            <ApplicationSnapshotView
              openingSnapshot={snapshotApplication.application.openingSnapshot}
              snapshotTakenAt={snapshotApplication.application.openingSnapshotTakenAt}
              currentOpening={snapshotApplication.currentOpening}
            />
          </div>
        ) : null}
      </Modal>

      <WithdrawApplicationConfirmModal
        application={confirmApplication?.application ?? null}
        openingTitle={confirmApplication === null ? '' : describeApplicationOpeningTitle(confirmApplication)}
        isSubmitting={
          confirmApplication !== null && pendingApplicationId === confirmApplication.application.id
        }
        onConfirm={(): void => {
          void confirmPendingAction()
        }}
        onCancel={(): void => {
          setConfirmApplication(null)
        }}
      />

      <ApplyToOpeningModal
        key={draftToSubmit?.application.id ?? 'none'}
        applyTarget={
          draftToSubmit === null
            ? null
            : {
                jobOpeningId: draftToSubmit.application.jobOpeningId,
                title: describeApplicationOpeningTitle(draftToSubmit),
                shopName: '',
                applicantRequirement:
                  draftOpening?.applicantRequirement ?? draftToSubmit.currentOpening?.applicantRequirement ?? null,
                openingRequirements: draftRequirementsState,
                initialCoverNote: draftToSubmit.application.coverNote ?? '',
              }
        }
        hasWorkerProfile={hasWorkerProfile}
        isSubmitting={isSubmittingApplication}
        errorMessage={applyErrorMessage}
        onSubmit={(coverNoteInput, hasAcknowledgedNotice): void => {
          void sendDraft(coverNoteInput, hasAcknowledgedNotice)
        }}
        onCreateProfileRequested={(): void => {
          setDraftToSubmit(null)
          onCreateProfileRequested()
        }}
        onClose={(): void => {
          setDraftToSubmit(null)
        }}
        onReloadOpeningRequirements={reloadJobOpening}
        workerCertificationState={workerCertificationState}
      />
    </Card>
  )
}
