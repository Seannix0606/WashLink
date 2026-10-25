import type { ReactElement, ReactNode } from 'react'
import { lazy, Suspense, useState } from 'react'
import type { TrainingDependencies } from '../../presentation/dependencyInjection/createTrainingDependencies'
import type { WorkerMarketplaceDependencies } from '../../presentation/dependencyInjection/createWorkerMarketplaceDependencies'
import { Skeleton, Tabs } from '../../presentation/design/ui'
import { useWorkerCertificationState } from '../../presentation/hooks/useMyCertifications'
import { useTrainerPrograms } from '../../presentation/hooks/useTrainerPrograms'
import { workerWorkspaceTabDefinitions, type WorkerWorkspaceTabKey } from './workerWorkspaceView'

// W5: the marketplace and application panels load only when the worker opens them.
const WorkerMarketplacePanel = lazy(async () => {
  const marketplaceModule = await import(
    '../../presentation/components/worker/marketplace/WorkerMarketplacePanel'
  )
  return { default: marketplaceModule.WorkerMarketplacePanel }
})
const MyApplicationsPanel = lazy(async () => {
  const applicationsModule = await import(
    '../../presentation/components/worker/marketplace/MyApplicationsPanel'
  )
  return { default: applicationsModule.MyApplicationsPanel }
})
// W6: the training panels load only when the worker opens them.
const MyTrainingsPanel = lazy(async () => {
  const trainingModule = await import('../../presentation/components/worker/training/MyTrainingsPanel')
  return { default: trainingModule.MyTrainingsPanel }
})
const TrainerProgramsPanel = lazy(async () => {
  const trainerModule = await import('../../presentation/components/worker/training/TrainerProgramsPanel')
  return { default: trainerModule.TrainerProgramsPanel }
})

// W7: My certifications loads only when the worker opens it.
const MyCertificationsPanel = lazy(async () => {
  const certificationsModule = await import('../../presentation/components/worker/certifications/MyCertificationsPanel')
  return { default: certificationsModule.MyCertificationsPanel }
})

interface WorkerWorkspaceTabsProps {
  readonly initialTab: WorkerWorkspaceTabKey
  readonly marketplaceDependencies: WorkerMarketplaceDependencies
  readonly trainingDependencies: TrainingDependencies
  readonly hasWorkerProfile: boolean
  readonly onCreateProfileRequested: () => void
  /** The assigned-bookings view (roster picker, jobs, roster links). */
  readonly bookingsContent: ReactNode
}

export function WorkerWorkspaceTabs({
  initialTab,
  marketplaceDependencies,
  trainingDependencies,
  hasWorkerProfile,
  onCreateProfileRequested,
  bookingsContent,
}: WorkerWorkspaceTabsProps): ReactElement {
  const [activeTab, setActiveTab] = useState<WorkerWorkspaceTabKey>(initialTab)
  const trainerPrograms = useTrainerPrograms(trainingDependencies.trainingProgramService)
  const workerCertificationState = useWorkerCertificationState(
    marketplaceDependencies.certificationDependencies.certificationService,
  )
  const tabItems = workerWorkspaceTabDefinitions(trainerPrograms.isDesignatedTrainer)
  // A revoked trainer role hides the tab; fall back to My training instead of an empty view.
  const visibleTab = tabItems.some((tabItem) => tabItem.value === activeTab) ? activeTab : 'training'
  const panelFallback = <Skeleton heightClassName="h-40" />

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <Tabs
          accessibleLabel="Worker workspace sections"
          tabItems={tabItems}
          activeTabValue={visibleTab}
          onTabChange={setActiveTab}
        />
      </div>

      {visibleTab === 'find_work' ? (
        <Suspense fallback={panelFallback}>
          <WorkerMarketplacePanel
            marketplaceService={marketplaceDependencies.marketplaceService}
            jobApplicationService={marketplaceDependencies.jobApplicationService}
            hasWorkerProfile={hasWorkerProfile}
            onCreateProfileRequested={onCreateProfileRequested}
            workerCertificationState={workerCertificationState}
          />
        </Suspense>
      ) : null}

      {visibleTab === 'applications' ? (
        <Suspense fallback={panelFallback}>
          <MyApplicationsPanel
            jobApplicationService={marketplaceDependencies.jobApplicationService}
            marketplaceService={marketplaceDependencies.marketplaceService}
            hasWorkerProfile={hasWorkerProfile}
            onCreateProfileRequested={onCreateProfileRequested}
            workerCertificationState={workerCertificationState}
          />
        </Suspense>
      ) : null}

      {visibleTab === 'training' ? (
        <Suspense fallback={panelFallback}>
          <MyTrainingsPanel trainingDependencies={trainingDependencies} />
        </Suspense>
      ) : null}

      {visibleTab === 'certifications' ? (
        <Suspense fallback={panelFallback}>
          <MyCertificationsPanel certificationDependencies={marketplaceDependencies.certificationDependencies} />
        </Suspense>
      ) : null}

      {visibleTab === 'training_i_run' ? (
        <Suspense fallback={panelFallback}>
          <TrainerProgramsPanel
            trainingDependencies={trainingDependencies}
            designatedPrograms={trainerPrograms.designatedPrograms}
            isLoadingDesignatedPrograms={trainerPrograms.isLoadingDesignatedPrograms}
            designatedProgramsErrorMessage={trainerPrograms.designatedProgramsErrorMessage}
            onRetry={(): void => {
              void trainerPrograms.reloadDesignatedPrograms()
            }}
          />
        </Suspense>
      ) : null}

      {visibleTab === 'bookings' ? bookingsContent : null}
    </div>
  )
}
