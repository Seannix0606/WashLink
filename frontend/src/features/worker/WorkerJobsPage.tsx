import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { createWorkerJobsDependencies } from '../../presentation/dependencyInjection/createWorkerJobsDependencies'
import { useAuthenticatedUser } from '../../presentation/auth/AuthenticatedUserContext'
import { useWorkerAssignedBookings } from '../../presentation/hooks/useWorkerAssignedBookings'
import { useWorkerAvailabilityForJobsPage } from '../../presentation/hooks/useWorkerAvailabilityForJobsPage'
import { useWorkerJobActions } from '../../presentation/hooks/useWorkerJobActions'
import { useWorkerProfileResolution } from '../../presentation/hooks/useWorkerProfileResolution'
import { AppShell } from '../../presentation/design/ui'
import { AuthenticatedTopBar } from '../../presentation/components/AuthenticatedTopBar'
import { WorkerDailyStatsStrip } from '../../presentation/components/worker/WorkerDailyStatsStrip'
import { WorkerGreetingBanner } from '../../presentation/components/worker/WorkerGreetingBanner'
import { WorkerJobsLoadingShell } from '../../presentation/components/worker/WorkerJobsLoadingShell'
import { WorkerJobsSection } from '../../presentation/components/worker/WorkerJobsSection'
import { WorkerNoProfileNotice } from '../../presentation/components/worker/WorkerNoProfileNotice'

interface WorkerJobsPageProps {
  readonly workerUserIdentifier: string
}

export function WorkerJobsPage({
  workerUserIdentifier,
}: WorkerJobsPageProps): ReactElement {
  const { authenticatedUser } = useAuthenticatedUser()
  const { bookingService, workerService } = useMemo(
    () => createWorkerJobsDependencies(workerUserIdentifier),
    [workerUserIdentifier],
  )

  const {
    workerIdentifier,
    isResolvingWorkerProfile,
    workerResolutionErrorMessage,
    hasResolvedWorkerProfile,
  } = useWorkerProfileResolution(workerService, workerUserIdentifier)

  if (isResolvingWorkerProfile) {
    return <WorkerJobsLoadingShell />
  }

  if (!hasResolvedWorkerProfile) {
    return (
      <AppShell topBar={<AuthenticatedTopBar />}>
        <WorkerNoProfileNotice
          workerResolutionErrorMessage={workerResolutionErrorMessage}
        />
      </AppShell>
    )
  }

  return (
    <WorkerJobsPageContent
      ownerDisplayName={authenticatedUser?.fullName ?? null}
      workerIdentifier={workerIdentifier}
      bookingService={bookingService}
      workerService={workerService}
    />
  )
}

interface WorkerJobsPageContentProps {
  readonly ownerDisplayName: string | null
  readonly workerIdentifier: string
  readonly bookingService: ReturnType<
    typeof createWorkerJobsDependencies
  >['bookingService']
  readonly workerService: ReturnType<
    typeof createWorkerJobsDependencies
  >['workerService']
}

function WorkerJobsPageContent({
  ownerDisplayName,
  workerIdentifier,
  bookingService,
  workerService,
}: WorkerJobsPageContentProps): ReactElement {
  const { assignedBookingList, mergeAssignedBookingFromServer } =
    useWorkerAssignedBookings(bookingService, workerIdentifier)

  const {
    isWorkerAvailableForJobs,
    hasLoadedWorkerAvailabilityProfile,
    isUpdatingWorkerAvailability,
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
    <AppShell topBar={<AuthenticatedTopBar />}>
      <div className="space-y-6">
        <WorkerGreetingBanner
          workerDisplayName={ownerDisplayName}
          isAvailableForJobs={isWorkerAvailableForJobs}
          isAvailabilityInteractionDisabled={
            isAvailabilityInteractionDisabled
          }
          onAvailabilityChange={(nextAvailability) =>
            void updateWorkerAvailabilityForJobs(nextAvailability)
          }
          activeJobCount={activeJobCount}
        />

        <WorkerDailyStatsStrip assignedBookingList={assignedBookingList} />

        <WorkerJobsSection
          assignedBookingList={assignedBookingList}
          workerIdentifier={workerIdentifier}
          onStartWorkerJob={startWorkerJob}
          onCompleteWorkerJob={completeWorkerJob}
        />
      </div>
    </AppShell>
  )
}
