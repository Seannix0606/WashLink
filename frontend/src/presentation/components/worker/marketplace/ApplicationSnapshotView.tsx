import type { ReactElement } from 'react'
import { History, PencilLine } from 'lucide-react'
import type {
  CurrentJobOpeningVersion,
  JobApplicationOpeningSnapshot,
} from '../../../../domain/models/JobApplication'
import { isOpeningEditedAfterApplying } from '../../../../domain/utilities/jobApplicationLifecycle'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import { openingEditedAfterApplyingText } from '../../../utilities/jobApplicationDisplay'
import { JobOpeningDetailsView } from '../../jobOpenings/JobOpeningDetailsView'

interface ApplicationSnapshotViewProps {
  readonly openingSnapshot: JobApplicationOpeningSnapshot
  readonly snapshotTakenAt: string | null
  /** The opening as it is now, if still readable; used only to flag later edits. */
  readonly currentOpening: CurrentJobOpeningVersion | null
}

/** The opening exactly as it was when the worker applied (frozen record). */
export function ApplicationSnapshotView({
  openingSnapshot,
  snapshotTakenAt,
  currentOpening,
}: ApplicationSnapshotViewProps): ReactElement {
  const isEditedAfterApplying =
    currentOpening !== null &&
    isOpeningEditedAfterApplying(openingSnapshot.jobOpeningUpdatedAt, currentOpening.updatedAt)

  return (
    <article aria-label="What you applied to" className="space-y-4">
      <p className="flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs font-medium text-[var(--color-ink-700)]">
        <History className="h-4 w-4 shrink-0" aria-hidden="true" />
        {snapshotTakenAt === null
          ? 'As you applied'
          : `As you applied on ${formatShortDateTime(snapshotTakenAt)}`}
      </p>
      {isEditedAfterApplying ? (
        <p
          role="note"
          className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] px-3 py-2 text-xs text-[var(--color-warning-600)]"
        >
          <PencilLine className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {openingEditedAfterApplyingText} This is the version you applied to; the current
            opening may differ.
          </span>
        </p>
      ) : null}
      <JobOpeningDetailsView
        jobOpeningContent={openingSnapshot}
        shopName={openingSnapshot.shopName ?? 'The shop'}
      />
    </article>
  )
}
