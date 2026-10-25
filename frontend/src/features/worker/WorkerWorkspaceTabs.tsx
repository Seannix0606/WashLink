import type { ReactElement, ReactNode } from 'react'
import { lazy, Suspense, useState } from 'react'
import type { WorkerMarketplaceDependencies } from '../../presentation/dependencyInjection/createWorkerMarketplaceDependencies'
import { Skeleton, Tabs, type TabItemDefinition } from '../../presentation/design/ui'
import type { WorkerWorkspaceTabKey } from './workerWorkspaceView'

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

const workerWorkspaceTabItems: readonly TabItemDefinition<WorkerWorkspaceTabKey>[] = [
  { value: 'find_work', label: 'Find work' },
  { value: 'applications', label: 'My applications' },
  { value: 'bookings', label: 'Assigned bookings' },
]

interface WorkerWorkspaceTabsProps {
  readonly initialTab: WorkerWorkspaceTabKey
  readonly marketplaceDependencies: WorkerMarketplaceDependencies
  readonly hasWorkerProfile: boolean
  readonly onCreateProfileRequested: () => void
  /** The assigned-bookings view (roster picker, jobs, roster links). */
  readonly bookingsContent: ReactNode
}

export function WorkerWorkspaceTabs({
  initialTab,
  marketplaceDependencies,
  hasWorkerProfile,
  onCreateProfileRequested,
  bookingsContent,
}: WorkerWorkspaceTabsProps): ReactElement {
  const [activeTab, setActiveTab] = useState<WorkerWorkspaceTabKey>(initialTab)
  const panelFallback = <Skeleton heightClassName="h-40" />

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <Tabs
          accessibleLabel="Worker workspace sections"
          tabItems={workerWorkspaceTabItems}
          activeTabValue={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      {activeTab === 'find_work' ? (
        <Suspense fallback={panelFallback}>
          <WorkerMarketplacePanel
            marketplaceService={marketplaceDependencies.marketplaceService}
            jobApplicationService={marketplaceDependencies.jobApplicationService}
            hasWorkerProfile={hasWorkerProfile}
            onCreateProfileRequested={onCreateProfileRequested}
          />
        </Suspense>
      ) : null}

      {activeTab === 'applications' ? (
        <Suspense fallback={panelFallback}>
          <MyApplicationsPanel
            jobApplicationService={marketplaceDependencies.jobApplicationService}
            marketplaceService={marketplaceDependencies.marketplaceService}
            hasWorkerProfile={hasWorkerProfile}
            onCreateProfileRequested={onCreateProfileRequested}
          />
        </Suspense>
      ) : null}

      {activeTab === 'bookings' ? bookingsContent : null}
    </div>
  )
}
