import type { ReactElement } from 'react'
import { Info, Search, Users } from 'lucide-react'
import type { OwnerRelationshipService } from '../../../../application/services/OwnerRelationshipService'
import type { OwnerRelationshipProgress } from '../../../../domain/models/OwnerRelationship'
import { progressBarValue } from '../../../../domain/utilities/ownerRelationshipProgress'
import { Button, Card, EmptyState, Skeleton } from '../../../design/ui'
import { useMyOwnerRelationshipProgress } from '../../../hooks/useMyOwnerRelationshipProgress'
import {
  describeCountedAsOf,
  describeOwnerGoalSource,
  describeOwnerProgressCount,
  describeOwnerProgressRemaining,
  findWorkButtonLabel,
  findWorkHintText,
  ownerProgressCountingText,
  ownerProgressNotice,
  ownerProgressTitle,
  ownerProgressUnavailableText,
  ownerProgressUnavailableTitle,
} from '../../../utilities/ownerRelationshipCopy'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { MyOwnerRelationshipsList } from './MyOwnerRelationshipsList'

function OwnerProgressSummary({ progress }: { readonly progress: OwnerRelationshipProgress }): ReactElement {
  const countText = describeOwnerProgressCount(progress.qualifyingOwnerCount, progress.minimumDistinctOwners)
  const barPercent = progress.minimumDistinctOwners > 0 ? (progressBarValue(progress) / progress.minimumDistinctOwners) * 100 : 0
  return (
    <div className="space-y-2">
      <p className="text-2xl font-bold text-[var(--color-ink-900)]">{countText}</p>
      <div
        role="progressbar"
        aria-label={ownerProgressTitle}
        aria-valuemin={0}
        aria-valuemax={progress.minimumDistinctOwners}
        aria-valuenow={progressBarValue(progress)}
        aria-valuetext={countText}
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-ink-100)]"
      >
        <div className="h-full rounded-full bg-[var(--color-primary-soft)]" style={{ width: `${String(barPercent)}%` }} />
      </div>
      <p className="text-sm text-[var(--color-ink-700)]">{describeOwnerProgressRemaining(progress.remainingOwnerCount)}</p>
      <p className="text-xs text-[var(--color-ink-500)]">
        {`${describeOwnerGoalSource(progress.minimumDistinctOwners, progress.defaultMinimum)} ${describeCountedAsOf(progress.countedAsOf)}`}
      </p>
    </div>
  )
}

interface OwnerRelationshipProgressCardProps {
  readonly ownerRelationshipService: OwnerRelationshipService
  /** Changes when the contract list changes, so the progress is re-read after an action. */
  readonly refreshSignal?: unknown
  /** Switches the worker workspace to Find work; the button is hidden when not given. */
  readonly onFindWorkRequested?: () => void
}

/**
 * Worker progress toward the informational distinct-owner goal (D-3, spec H) and the
 * relationship list. Shown for information only: no action anywhere depends on it.
 */
export function OwnerRelationshipProgressCard({
  ownerRelationshipService,
  refreshSignal,
  onFindWorkRequested,
}: OwnerRelationshipProgressCardProps): ReactElement {
  const overview = useMyOwnerRelationshipProgress(ownerRelationshipService, refreshSignal)

  const renderBody = (): ReactElement => {
    if (overview.isLoading) {
      return (
        <div className="space-y-2" aria-busy="true" aria-label="Loading your progress">
          <Skeleton heightClassName="h-16" />
          <Skeleton heightClassName="h-12" />
        </div>
      )
    }
    if (overview.errorMessage !== null) {
      return (
        <LoadErrorNotice
          title="Your progress could not be loaded"
          errorMessage={overview.errorMessage}
          onRetry={(): void => {
            void overview.reload()
          }}
        />
      )
    }
    return (
      <div className="space-y-4">
        {overview.progress === null ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title={ownerProgressUnavailableTitle} description={ownerProgressUnavailableText} />
        ) : (
          <OwnerProgressSummary progress={overview.progress} />
        )}
        <MyOwnerRelationshipsList relationships={overview.relationships} />
      </div>
    )
  }

  return (
    <Card elevation="flat" role="region" className="space-y-3" aria-labelledby="owner-relationship-progress-heading">
      <h3 id="owner-relationship-progress-heading" className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-900)]">
        <Users className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
        {ownerProgressTitle}
      </h3>
      <p className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand-50)] p-2 text-xs text-[var(--color-ink-700)]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-brand-700)]" aria-hidden="true" />
        <span>{ownerProgressNotice}</span>
      </p>
      <p className="text-xs text-[var(--color-ink-500)]">{ownerProgressCountingText}</p>
      {renderBody()}
      {onFindWorkRequested !== undefined ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--color-ink-500)]">{findWorkHintText}</p>
          <Button size="sm" variant="secondary" leadingIcon={<Search className="h-4 w-4" aria-hidden="true" />} onClick={onFindWorkRequested}>
            {findWorkButtonLabel}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
