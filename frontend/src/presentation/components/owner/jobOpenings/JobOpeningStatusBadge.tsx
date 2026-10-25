import type { ReactElement } from 'react'
import type { JobOpeningStatus } from '../../../../domain/models/JobOpening'
import { Badge } from '../../../design/ui'
import { describeJobOpeningStatus } from '../../../utilities/jobOpeningDisplay'

interface JobOpeningStatusBadgeProps {
  readonly status: JobOpeningStatus
}

export function JobOpeningStatusBadge({ status }: JobOpeningStatusBadgeProps): ReactElement {
  const statusDisplay = describeJobOpeningStatus(status)
  return <Badge tone={statusDisplay.badgeTone}>{statusDisplay.displayLabel}</Badge>
}
