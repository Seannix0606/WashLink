import type { ReactElement, ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { createWorkerProfileDependencies } from '../../presentation/dependencyInjection/createWorkerProfileDependencies'
import { AppShell, Card, Skeleton } from '../../presentation/design/ui'
import { AuthenticatedTopBar } from '../../presentation/components/AuthenticatedTopBar'
import { LoadErrorNotice } from '../../presentation/components/shared/LoadErrorNotice'
import { WorkerJobsLoadingShell } from '../../presentation/components/worker/WorkerJobsLoadingShell'
import { WorkerProfileCompletionBanner } from '../../presentation/components/workerProfile/WorkerProfileCompletionBanner'
import { WorkerProfileEditorModal } from '../../presentation/components/workerProfile/WorkerProfileEditorModal'
import { WorkerProfileOnboardingFlow } from '../../presentation/components/workerProfile/WorkerProfileOnboardingFlow'
import { WorkerProfileSummaryCard } from '../../presentation/components/workerProfile/WorkerProfileSummaryCard'
import { useMyRosterLinks } from '../../presentation/hooks/useMyRosterLinks'
import { useWorkerProfile } from '../../presentation/hooks/useWorkerProfile'
import { WorkerJobsPage } from './WorkerJobsPage'
import { decideWorkerWorkspaceView } from './workerWorkspaceView'

interface WorkerWorkspaceGateProps {
  readonly workerUserIdentifier: string
}

export function WorkerWorkspaceGate({
  workerUserIdentifier,
}: WorkerWorkspaceGateProps): ReactElement {
  const { workerProfileService, rosterLinkService } = useMemo(
    () => createWorkerProfileDependencies(),
    [],
  )
  const workerProfileState = useWorkerProfile(workerProfileService)
  const rosterLinks = useMyRosterLinks(rosterLinkService)
  const [hasSkippedOnboarding, setHasSkippedOnboarding] = useState<boolean>(false)
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState<boolean>(false)

  const {
    workerProfile,
    workerPrivateContact,
    isLoadingWorkerProfile,
    workerProfileErrorMessage,
    isDeletingWorkerProfile,
    reloadWorkerProfile,
    saveWorkerProfile,
    deleteWorkerProfile,
  } = workerProfileState

  const workspaceView = decideWorkerWorkspaceView({
    isLoadingRosterLinks: rosterLinks.isLoadingRosterLinks,
    rosterLinkCount: rosterLinks.rosterLinkEntries.length,
    isLoadingWorkerProfile,
    hasWorkerProfile: workerProfile !== null,
    hasWorkerProfileError: workerProfileErrorMessage !== null,
    hasSkippedOnboarding,
  })

  if (workspaceView === 'loading') {
    return <WorkerJobsLoadingShell />
  }

  if (workspaceView === 'profile_error' || workspaceView === 'onboarding') {
    return (
      <AppShell topBar={<AuthenticatedTopBar />}>
        <div className="mx-auto max-w-xl space-y-4">
          {workspaceView === 'profile_error' ? (
            <LoadErrorNotice
              title="Could not load your worker profile"
              errorMessage={workerProfileErrorMessage ?? ''}
              onRetry={(): void => {
                void reloadWorkerProfile()
              }}
            />
          ) : (
            <Card elevation="raised" className="space-y-4">
              <header>
                <h1 className="text-xl font-bold text-[var(--color-ink-900)]">
                  Set up your worker profile
                </h1>
                <p className="mt-1 text-sm text-[var(--color-ink-500)]">
                  Tell shops what you can do. You can link to a shop roster with a code
                  afterwards.
                </p>
              </header>
              <WorkerProfileOnboardingFlow
                initialWorkerProfile={null}
                initialWorkerPrivateContact={null}
                submitLabel="Create profile"
                onSubmitWorkerProfile={saveWorkerProfile}
                onSkip={(): void => {
                  setHasSkippedOnboarding(true)
                }}
              />
            </Card>
          )}
        </div>
      </AppShell>
    )
  }

  const openProfileEditor = (): void => {
    setIsProfileEditorOpen(true)
  }

  let workerProfileSlot: ReactNode
  if (isLoadingWorkerProfile) {
    workerProfileSlot = <Skeleton className="h-28 w-full" />
  } else if (workerProfileErrorMessage !== null) {
    workerProfileSlot = (
      <LoadErrorNotice
        title="Could not load your worker profile"
        errorMessage={workerProfileErrorMessage}
        onRetry={(): void => {
          void reloadWorkerProfile()
        }}
      />
    )
  } else if (workerProfile === null) {
    workerProfileSlot = (
      <WorkerProfileCompletionBanner onCompleteProfileRequested={openProfileEditor} />
    )
  } else {
    workerProfileSlot = (
      <WorkerProfileSummaryCard
        workerProfile={workerProfile}
        workerPrivateContact={workerPrivateContact}
        onEditRequested={openProfileEditor}
      />
    )
  }

  return (
    <>
      <WorkerJobsPage
        workerUserIdentifier={workerUserIdentifier}
        rosterLinks={rosterLinks}
        rosterLinkService={rosterLinkService}
        workerProfileSlot={workerProfileSlot}
        hasWorkerProfile={workerProfile !== null}
        onCreateProfileRequested={openProfileEditor}
      />
      <WorkerProfileEditorModal
        isOpen={isProfileEditorOpen}
        workerProfile={workerProfile}
        workerPrivateContact={workerPrivateContact}
        isDeletingWorkerProfile={isDeletingWorkerProfile}
        onClose={(): void => {
          setIsProfileEditorOpen(false)
        }}
        onSaveWorkerProfile={saveWorkerProfile}
        onDeleteWorkerProfile={deleteWorkerProfile}
      />
    </>
  )
}
