import type { ReactElement } from 'react'
import type { WorkerContractStatus } from '../../../domain/models/WorkerContract'
import { Badge } from '../../design/ui'
import { contractStatusDisplay, type ContractViewerRole } from '../../utilities/workerContractDisplay'

interface ContractStatusBadgeProps {
  /** The effective status (accepted / active past the end date read as expired). */
  readonly status: WorkerContractStatus
  readonly viewerRole: ContractViewerRole
}

export function ContractStatusBadge({ status, viewerRole }: ContractStatusBadgeProps): ReactElement {
  const statusDisplay = contractStatusDisplay(status, viewerRole)
  return <Badge tone={statusDisplay.tone}>{statusDisplay.label}</Badge>
}
