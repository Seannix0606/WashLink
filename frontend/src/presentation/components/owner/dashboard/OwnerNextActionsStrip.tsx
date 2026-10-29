import type { ReactElement } from 'react'
import { ListChecks } from 'lucide-react'
import type { OwnerDashboardSummary } from '../../../../domain/models/WorkforceDashboardSummary'
import { ownerNextActions, type OwnerNextActionTarget } from '../../../../domain/utilities/workforceNextActions'
import { Card } from '../../../design/ui'
import { ownerNextActionsHeading, ownerNextActionText } from '../../../utilities/workforceDashboardCopy'
import { NextActionList } from '../../shared/NextActionList'

interface OwnerNextActionsStripProps {
  /** Null while loading, after an error or for a non-owner account: the strip is then hidden. */
  readonly summary: OwnerDashboardSummary | null
  readonly onActionSelected: (target: OwnerNextActionTarget) => void
}

/**
 * D-42: the owner's next actions above the dashboard tabs, highest priority first. Hidden when
 * there is nothing to do (and while the summary is not available; the Workforce tab shows the
 * loading and error states).
 */
export function OwnerNextActionsStrip({ summary, onActionSelected }: OwnerNextActionsStripProps): ReactElement | null {
  if (summary === null) {
    return null
  }
  const nextActions = ownerNextActions(summary)
  if (nextActions.length === 0) {
    return null
  }
  return (
    <Card elevation="flat" role="region" aria-labelledby="owner-next-actions-heading" className="space-y-2 p-4">
      <h2 id="owner-next-actions-heading" className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-900)]">
        <ListChecks className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
        {ownerNextActionsHeading}
      </h2>
      <NextActionList
        accessibleLabel={ownerNextActionsHeading}
        items={nextActions.map((nextAction) => ({
          key: nextAction.key,
          count: nextAction.count,
          label: ownerNextActionText[nextAction.key](nextAction.count),
          onSelect: (): void => {
            onActionSelected(nextAction.target)
          },
        }))}
      />
    </Card>
  )
}
