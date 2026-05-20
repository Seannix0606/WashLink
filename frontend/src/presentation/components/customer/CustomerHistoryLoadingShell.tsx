import type { ReactElement } from 'react'
import { Card, Skeleton } from '../../design/ui'

const skeletonCardPlaceholderKeys: readonly string[] = [
  'placeholder-1',
  'placeholder-2',
  'placeholder-3',
]

export function CustomerHistoryLoadingShell(): ReactElement {
  return (
    <ul className="space-y-3" aria-label="Loading your bookings">
      {skeletonCardPlaceholderKeys.map((placeholderKey) => (
        <li key={placeholderKey}>
          <Card elevation="raised" className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton heightClassName="h-4" widthClassName="w-40" />
              <Skeleton heightClassName="h-5" widthClassName="w-16" />
            </div>
            <Skeleton heightClassName="h-14" />
            <Skeleton heightClassName="h-3" widthClassName="w-3/4" />
            <Skeleton heightClassName="h-3" widthClassName="w-1/2" />
          </Card>
        </li>
      ))}
    </ul>
  )
}
