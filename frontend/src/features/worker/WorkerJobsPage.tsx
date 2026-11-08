import type { ReactElement, ReactNode } from 'react'
import { useMemo } from 'react'
import type { RosterLinkService } from '../../application/services/RosterLinkService'
import { createWorkerJobsDependencies } from '../../presentation/dependencyInjection/createWorkerJobsDependencies'
import { createTrainingDependencies } from '../../presentation/dependencyInjection/createTrainingDependencies'
import { createWorkerMarketplaceDependencies } from '../../presentation/dependencyInjection/createWorkerMarketplaceDependencies'
import { useAuthenticatedUser } from '../../presentation/auth/AuthenticatedUserContext'
import type { UseMyRosterLinksResult } from '../../presentation/hooks/useMyRosterLinks'
import { useWorkerAssignedBookings } from '../../presentation/hooks/useWorkerAssignedBookings'
import { useWorkerAvailabilityForJobsPage } from '../../presentation/hooks/useWorkerAvailabilityForJobsPage'
import { useWorkerJobActions } from '../../presentation/hooks/useWorkerJobActions'
import { AppShell } from '../../presentation/design/ui'
import { AuthenticatedTopBar } from '../../presentation/components/AuthenticatedTopBar'
import { LoadErrorNotice } from '../../presentation/components/shared/LoadErrorNotice'
import { WorkerDailyStatsStrip } from '../../presentation/components/worker/WorkerDailyStatsStrip'
import { WorkerGreetingBanner } from '../../presentation/components/worker/WorkerGreetingBanner'
import { WorkerJobsSection } from '../../presentation/components/worker/WorkerJobsSection'
import { WorkerNoProfileNotice } from '../../presentation/components/worker/WorkerNoProfileNotice'
import { WorkerRosterEntryPicker } from '../../presentation/components/worker/WorkerRosterEntryPicker'
import { WorkerRosterLinksPanel } from '../../presentation/components/worker/WorkerRosterLinksPanel'
import { defaultWorkerWorkspaceTab } from './workerWorkspaceView'
import { WorkerWorkspaceTabs } from './WorkerWorkspaceTabs'

interface WorkerJobsPageProps {
  readonly workerUserIdentifier: string
  readonly rosterLinks: UseMyRosterLinksResult
  readonly rosterLinkService: RosterLinkService
  /** Profile banner or summary card, shown above the workspace tabs. */
  readonly workerProfileSlot: ReactNode
  readonly hasWorkerProfile: boolean
  readonly onCreateProfileRequested: () => void
}

export function WorkerJobsPage({
  workerUserIdentifier,
  rosterLinks,
  rosterLinkService,
  workerProfileSlot,
  hasWorkerProfile,
  onCreateProfileRequested,
}: WorkerJobsPageProps): ReactElement {
  const { authenticatedUser } = useAuthenticatedUser()
  const { bookingService, workerService } = useMemo(
    () => createWorkerJobsDependencies(workerUserIdentifier),
    [workerUserIdentifier],
  )
  const marketplaceDependencies = useMemo(() => createWorkerMarketplaceDependencies(), [])
  const trainingDependencies = useMemo(() => createTrainingDependencies(), [])
  const {
    rosterLinkEntries,
    selectedRosterEntry,
    rosterLinksErrorMessage,
    unlinkingWorkerRowIdentifier,
    selectRosterEntry,
    reloadRosterLinks,
    unlinkRosterEntry,
  } = rosterLinks

  const reloadRosterLinksInBackground = (): void => {
    void reloadRosterLinks()
  }

  const bookingsContent =
    selectedRosterEntry === null ? (
      rosterLinksErrorMessage !== null ? (
        <LoadErrorNotice
          title="Could not load your shop rosters"
          errorMessage={rosterLinksErrorMessage}
          onRetry={reloadRosterLinksInBackground}
        />
      ) : (
        <WorkerNoProfileNotice
          rosterLinkService={rosterLinkService}
          onRosterLinked={reloadRosterLinksInBackground}
        />
      )
    ) : (
      <div className="space-y-6">
        <WorkerRosterEntryPicker
          rosterLinkEntries={rosterLinkEntries}
          selectedWorkerRowIdentifier={selectedRosterEntry.workerRowIdentifier}
          onRosterEntrySelected={selectRosterEntry}
        />
        <WorkerJobsPageContent
          key={selectedRosterEntry.workerRowIdentifier}
          workerDisplayName={
            selectedRosterEntry.rosterDisplayName.length > 0
              ? selectedRosterEntry.rosterDisplayName
              : (authenticatedUser?.fullName ?? null)
          }
          workerIdentifier={selectedRosterEntry.workerRowIdentifier}
          bookingService={bookingService}
          workerService={workerService}
        />
        <WorkerRosterLinksPanel
          rosterLinkEntries={rosterLinkEntries}
          unlinkingWorkerRowIdentifier={unlinkingWorkerRowIdentifier}
          rosterLinkService={rosterLinkService}
          onUnlinkRosterEntry={(workerRowIdentifier): void => {
            void unlinkRosterEntry(workerRowIdentifier)
          }}
          onRosterLinked={reloadRosterLinksInBackground}
        />
      </div>
    )

  return (
    <AppShell topBar={<AuthenticatedTopBar />}>
      <div className="space-y-6">
        {workerProfileSlot}
        <WorkerWorkspaceTabs
          initialTab={defaultWorkerWorkspaceTab(rosterLinkEntries.length > 0)}
          marketplaceDependencies={marketplaceDependencies}
          trainingDependencies={trainingDependencies}
          hasWorkerProfile={hasWorkerProfile}
          onCreateProfileRequested={onCreateProfileRequested}
          bookingsContent={bookingsContent}
        />
      </div>
    </AppShell>
  )
}

type WorkerJobsDependencies = ReturnType<typeof createWorkerJobsDependencies>

interface WorkerJobsPageContentProps {
  readonly workerDisplayName: string | null
  readonly workerIdentifier: string
  readonly bookingService: WorkerJobsDependencies['bookingService']
  readonly workerService: WorkerJobsDependencies['workerService']
}

function WorkerJobsPageContent({
  workerDisplayName,
  workerIdentifier,
  bookingService,
  workerService,
}: WorkerJobsPageContentProps): ReactElement {
  const {
    assignedBookingList,
    isLoadingAssignedBookings,
    assignedBookingsLoadErrorMessage,
    mergeAssignedBookingFromServer,
  } = useWorkerAssignedBookings(bookingService, workerIdentifier)

  const {
    isWorkerAvailableForJobs,
    hasLoadedWorkerAvailabilityProfile,
    isUpdatingWorkerAvailability,
    workerAvailabilityLoadErrorMessage,
    updateWorkerAvailabilityForJobs,
  } = useWorkerAvailabilityForJobsPage(workerService, workerIdentifier)

  const { startWorkerJob, completeWorkerJob } = useWorkerJobActions(
    bookingService,
    {
      workerIdentifier,
      onBookingUpdated: mergeAssignedBookingFromServer,
    },
  )

  const isAvailabilityInteractionDisabled =
    !hasLoadedWorkerAvailabilityProfile || isUpdatingWorkerAvailability

  const activeJobCount = assignedBookingList.filter(
    (booking) =>
      booking.bookingStatus === 'accepted' ||
      booking.bookingStatus === 'in_progress',
  ).length

  return (
    <div className="space-y-6">
      <WorkerGreetingBanner
        workerDisplayName={workerDisplayName}
        isAvailableForJobs={isWorkerAvailableForJobs}
        isAvailabilityInteractionDisabled={isAvailabilityInteractionDisabled}
        availabilityErrorMessage={workerAvailabilityLoadErrorMessage}
        onAvailabilityChange={(nextAvailability) =>
          void updateWorkerAvailabilityForJobs(nextAvailability)
        }
        activeJobCount={activeJobCount}
      />

      <WorkerDailyStatsStrip assignedBookingList={assignedBookingList} />

      <WorkerJobsSection
        assignedBookingList={assignedBookingList}
        workerIdentifier={workerIdentifier}
        isLoadingAssignedBookings={isLoadingAssignedBookings}
        assignedBookingsLoadErrorMessage={assignedBookingsLoadErrorMessage}
        onStartWorkerJob={startWorkerJob}
        onCompleteWorkerJob={completeWorkerJob}
      />
    </div>
  )
}
