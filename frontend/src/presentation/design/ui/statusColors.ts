import type { CSSProperties } from 'react'
import { serviceBookingStatusGroup, type ServiceBookingStatus, type ServiceBookingStatusGroup } from '@washlink/shared'

/** The CSS variables for a status group's colors (defined in index.css for light and dark). */
export function statusGroupColors(group: ServiceBookingStatusGroup): { readonly background: string; readonly text: string; readonly line: string } {
  return { background: `var(--status-${group}-bg)`, text: `var(--status-${group}-fg)`, line: `var(--status-${group}-line)` }
}

/** A colored left edge for a card, in the status color. Pair it with a StatusPill so the meaning is also in words. */
export function statusEdgeStyle(status: ServiceBookingStatus): CSSProperties {
  return { borderLeftWidth: 4, borderLeftStyle: 'solid', borderLeftColor: statusGroupColors(serviceBookingStatusGroup[status]).line }
}
