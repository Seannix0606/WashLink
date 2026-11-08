import type { ReactElement } from 'react'
import { History } from 'lucide-react'
import type { WorkforceActivityService } from '../../../application/services/WorkforceActivityService'
import type { ApplicationUserRole } from '../../../domain/models/AuthenticatedUser'
import { Button, Drawer, EmptyState, Skeleton } from '../../design/ui'
import { useMyWorkforceActivity } from '../../hooks/useMyWorkforceActivity'
import {
  activityDrawerDescription,
  activityDrawerTitle,
  activityEmptyText,
  activityEmptyTitle,
  activityIntroText,
  activityLoadOlderLabel,
} from '../../utilities/workforceActivityCopy'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'
import { WorkforceActivityList } from './WorkforceActivityList'

interface ActivityBodyProps {
  readonly workforceActivityService: WorkforceActivityService
  readonly viewerRole: ApplicationUserRole | null
}

function ActivityBody({ workforceActivityService, viewerRole }: ActivityBodyProps): ReactElement {
  const activity = useMyWorkforceActivity(workforceActivityService, viewerRole)

  const renderEvents = (): ReactElement => {
    if (activity.isLoading) {
      return (
        <div aria-busy="true" aria-label="Loading your activity" className="space-y-2">
          <Skeleton heightClassName="h-14" />
          <Skeleton heightClassName="h-14" />
        </div>
      )
    }
    if (activity.errorMessage !== null && activity.events.length === 0) {
      return (
        <LoadErrorNotice
          title="Your activity could not be loaded"
          errorMessage={activity.errorMessage}
          onRetry={(): void => {
            void activity.reload()
          }}
        />
      )
    }
    if (activity.isEmpty) {
      return <EmptyState icon={<History className="h-5 w-5" />} title={activityEmptyTitle} description={activityEmptyText} />
    }
    return (
      <div className="space-y-3">
        <WorkforceActivityList events={activity.events} />
        {activity.errorMessage !== null ? (
          <p role="alert" className="text-xs text-[var(--color-danger-600)]">
            {activity.errorMessage}
          </p>
        ) : null}
        {activity.hasMore ? (
          <Button
            size="sm"
            variant="secondary"
            isFullWidth
            isLoading={activity.isLoadingOlder}
            onClick={(): void => {
              void activity.loadOlder()
            }}
          >
            {activityLoadOlderLabel}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-ink-500)]">{activityIntroText}</p>
      {renderEvents()}
    </div>
  )
}

interface WorkforceActivityDrawerProps {
  readonly isOpen: boolean
  readonly workforceActivityService: WorkforceActivityService
  /** Display filter only (an owner never sees posting report rows); the database decides what is returned. */
  readonly viewerRole?: ApplicationUserRole | null
  readonly onClose: () => void
}

/** "Your activity" (D-54), every role: read only while the drawer is open. */
export function WorkforceActivityDrawer({
  isOpen,
  workforceActivityService,
  viewerRole = null,
  onClose,
}: WorkforceActivityDrawerProps): ReactElement {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={activityDrawerTitle} description={activityDrawerDescription}>
      {isOpen ? <ActivityBody workforceActivityService={workforceActivityService} viewerRole={viewerRole} /> : null}
    </Drawer>
  )
}
