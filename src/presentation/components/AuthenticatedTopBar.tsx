import type { ReactElement, ReactNode } from 'react'
import { BrandMark } from '../design/ui'
import { UserAccountMenu } from './UserAccountMenu'
import { joinClassNames } from '../design/classNames'

interface AuthenticatedTopBarProps {
  readonly centerSlot?: ReactNode
  readonly trailingSlot?: ReactNode
  readonly className?: string
}

export function AuthenticatedTopBar({
  centerSlot,
  trailingSlot,
  className,
}: AuthenticatedTopBarProps): ReactElement {
  return (
    <div
      className={joinClassNames(
        'mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8',
        className,
      )}
    >
      <BrandMark size="sm" />
      {centerSlot ? (
        <div className="mx-2 hidden flex-1 md:block">{centerSlot}</div>
      ) : (
        <div className="flex-1" />
      )}
      <div className="flex items-center gap-2">
        {trailingSlot}
        <UserAccountMenu />
      </div>
    </div>
  )
}
