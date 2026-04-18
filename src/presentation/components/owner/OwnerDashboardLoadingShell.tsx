import type { ReactElement } from 'react'
import { AppShell, Skeleton } from '../../design/ui'
import { AuthenticatedTopBar } from '../AuthenticatedTopBar'

export function OwnerDashboardLoadingShell(): ReactElement {
  return (
    <AppShell topBar={<AuthenticatedTopBar />}>
      <div className="space-y-4">
        <Skeleton className="h-10 w-60" />
        <Skeleton className="h-6 w-80" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </AppShell>
  )
}
