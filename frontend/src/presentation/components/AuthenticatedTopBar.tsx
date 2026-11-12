import type { ReactElement, ReactNode } from 'react'
import { useMemo } from 'react'
import { BrandMark } from '../design/ui'
import { useAuthenticatedUser } from '../auth/AuthenticatedUserContext'
import { createNotificationDependencies } from '../dependencyInjection/createNotificationDependencies'
import { NotificationCenter } from './notifications/NotificationCenter'
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
  const { authenticatedUser } = useAuthenticatedUser()
  const { notificationService } = useMemo(() => createNotificationDependencies(), [])
  const recipientIdentifier = authenticatedUser?.userIdentifier ?? null

  return (
    <div
      className={joinClassNames(
        'mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8 lg:group-data-[sidebar=true]/shell:max-w-[90rem]',
        className,
      )}
    >
      <BrandMark size="sm" tone="inverse" className="lg:group-data-[sidebar=true]/shell:hidden" />
      {centerSlot ? (
        <div className="mx-2 hidden flex-1 md:block">{centerSlot}</div>
      ) : (
        <div className="flex-1" />
      )}
      <div className="flex items-center gap-2">
        {trailingSlot}
        {/* Keyed by account: signing out or switching accounts unmounts it (polling stops). */}
        <NotificationCenter
          key={recipientIdentifier ?? 'signed-out'}
          notificationService={notificationService}
          recipientIdentifier={recipientIdentifier}
        />
        <UserAccountMenu />
      </div>
    </div>
  )
}
