import type { ReactElement } from 'react'
import { BadgeCheck, Info } from 'lucide-react'
import { Badge } from '../../design/ui'
import { shopIssuedBadgeLabel, shopIssuedDisclaimer } from '../../utilities/certificationCopy'

/** "Shop-issued: not a government-recognized credential." Shown wherever certificates appear. */
export function ShopIssuedNotice(): ReactElement {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-ink-700)]"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {shopIssuedDisclaimer}
    </p>
  )
}

export function ShopIssuedBadge(): ReactElement {
  return (
    <Badge tone="brand">
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
      {shopIssuedBadgeLabel}
    </Badge>
  )
}
