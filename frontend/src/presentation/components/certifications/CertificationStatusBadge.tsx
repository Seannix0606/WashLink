import type { ReactElement } from 'react'
import type { CertificationEffectiveStatus } from '../../../domain/models/Certification'
import { Badge } from '../../design/ui'
import { describeCertificationStatus } from '../../utilities/certificationDisplay'

interface CertificationStatusBadgeProps {
  readonly effectiveStatus: CertificationEffectiveStatus
  readonly expiresAt: string
  readonly currentInstant: Date
}

/** Status from the server effective status; "Expires soon" within 30 days of the server expiry. */
export function CertificationStatusBadge({ effectiveStatus, expiresAt, currentInstant }: CertificationStatusBadgeProps): ReactElement {
  const statusDisplay = describeCertificationStatus({ effectiveStatus, expiresAt }, currentInstant)
  return <Badge tone={statusDisplay.badgeTone}>{statusDisplay.displayLabel}</Badge>
}
