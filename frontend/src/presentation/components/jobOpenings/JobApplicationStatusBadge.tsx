import type { ReactElement } from 'react'
import type { JobApplicationStatus } from '../../../domain/models/JobApplication'
import { Badge } from '../../design/ui'
import {
  describeJobApplicationStatus,
  type JobApplicationStatusDisplay,
} from '../../utilities/jobApplicationDisplay'

interface JobApplicationStatusBadgeProps {
  readonly status: JobApplicationStatus
  /** Text before the status, e.g. "Your application:". */
  readonly prefix?: string
  /** Overrides the per-status display, e.g. for a closed draft. */
  readonly statusDisplay?: JobApplicationStatusDisplay
}

export function JobApplicationStatusBadge({
  status,
  prefix,
  statusDisplay: statusDisplayOverride,
}: JobApplicationStatusBadgeProps): ReactElement {
  const statusDisplay = statusDisplayOverride ?? describeJobApplicationStatus(status)
  return (
    <Badge tone={statusDisplay.badgeTone}>
      {prefix === undefined ? statusDisplay.displayLabel : `${prefix} ${statusDisplay.displayLabel}`}
    </Badge>
  )
}
