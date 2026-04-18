import type { ReactElement } from 'react'
import { AppShell, Skeleton } from '../../design/ui'
import { AuthenticatedTopBar } from '../AuthenticatedTopBar'

export function WorkerJobsLoadingShell(): ReactElement {
  return (
    <AppShell topBar={<AuthenticatedTopBar />}>
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </AppShell>
  )
}
