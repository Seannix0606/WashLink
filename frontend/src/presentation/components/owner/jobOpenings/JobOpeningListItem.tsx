import type { ReactElement } from 'react'
import { Eye, EyeOff, PencilLine, Trash2, Users } from 'lucide-react'
import type { JobOpening } from '../../../../domain/models/JobOpening'
import { heldModerationStatuses, heldOpeningResumeRefusedMessage, type OwnerJobOpeningModeration } from '../../../../domain/models/JobOpeningModeration'
import {
  isJobOpeningContentEditable,
  isJobOpeningDeletable,
} from '../../../../domain/utilities/jobOpeningLifecycle'
import { Button } from '../../../design/ui'
import {
  jobOpeningActionCopy,
  listJobOpeningTransitionOptions,
  type JobOpeningConfirmableAction,
} from '../../../utilities/jobOpeningActionDisplay'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import { formatApplicantCountLabel } from '../../../utilities/jobApplicationDisplay'
import { describeJobOpeningStatus, formatCompensationAsEntered } from '../../../utilities/jobOpeningDisplay'
import { JobOpeningStatusBadge } from './JobOpeningStatusBadge'
import { OpeningModerationNotice } from './OpeningModerationNotice'

interface JobOpeningListItemProps {
  readonly jobOpening: JobOpening
  readonly shopName: string
  readonly isShopVerifiedForPublishing: boolean
  /** When the list was loaded; deadline checks use it. */
  readonly evaluatedAt: Date
  readonly isActionPending: boolean
  readonly onEditRequested: (jobOpening: JobOpening) => void
  readonly onPreviewRequested: (jobOpening: JobOpening) => void
  readonly onActionRequested: (jobOpening: JobOpening, action: JobOpeningConfirmableAction) => void
  /** W5: number of applications (undefined while unknown). Drafts never have applicants. */
  readonly applicationCount?: number
  readonly onApplicantsRequested?: (jobOpening: JobOpening) => void
  /** W14: WashLink's decided case for this opening (reason and message only; never reports). */
  readonly moderation?: OwnerJobOpeningModeration
  readonly isModerationSubmitting?: boolean
  readonly onAskWashLinkRequested?: (moderation: OwnerJobOpeningModeration) => void
}

export function JobOpeningListItem({
  jobOpening,
  shopName,
  isShopVerifiedForPublishing,
  evaluatedAt,
  isActionPending,
  onEditRequested,
  onPreviewRequested,
  onActionRequested,
  applicationCount,
  onApplicantsRequested,
  moderation,
  isModerationSubmitting = false,
  onAskWashLinkRequested,
}: JobOpeningListItemProps): ReactElement {
  const isHeldByWashLink = moderation !== undefined && heldModerationStatuses.includes(moderation.status)
  // P75: while WashLink holds the opening, resuming is refused by the database; say why up front.
  const transitionOptions = listJobOpeningTransitionOptions(jobOpening, isShopVerifiedForPublishing, evaluatedAt).map(
    (transitionOption) =>
      isHeldByWashLink && transitionOption.action === 'resume'
        ? { ...transitionOption, disabledReason: heldOpeningResumeRefusedMessage }
        : transitionOption,
  )
  const isHiddenFromWorkers = jobOpening.status === 'published' && !isShopVerifiedForPublishing
  const [compensationSummary] = formatCompensationAsEntered(jobOpening)
  const reasonIdPrefix = `job-opening-${jobOpening.id}`

  return (
    <li className="space-y-3 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold break-words text-[var(--color-ink-900)]">
            {jobOpening.title}
          </h3>
          <p className="text-xs text-[var(--color-ink-500)]">
            <span className="break-words">{shopName}</span>
            {' · '}Updated {formatShortDateTime(jobOpening.updatedAt)}
          </p>
          <p className="text-xs break-words text-[var(--color-ink-700)]">Pay: {compensationSummary}</p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <JobOpeningStatusBadge status={jobOpening.status} />
          <p className="text-xs text-[var(--color-ink-500)]">
            {describeJobOpeningStatus(jobOpening.status).helperText}
          </p>
        </div>
      </div>

      {isHiddenFromWorkers ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] px-3 py-2 text-xs text-[var(--color-warning-600)]"
        >
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Hidden from workers: this shop does not currently have an approved verification. It
          stays published and shows again after the shop is verified.
        </p>
      ) : null}

      {moderation !== undefined ? (
        <OpeningModerationNotice
          moderation={moderation}
          isSubmitting={isModerationSubmitting}
          onAskWashLinkRequested={(heldModeration): void => {
            onAskWashLinkRequested?.(heldModeration)
          }}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Eye className="h-4 w-4" />}
          onClick={(): void => {
            onPreviewRequested(jobOpening)
          }}
        >
          Preview
        </Button>
        {onApplicantsRequested !== undefined && jobOpening.status !== 'draft' ? (
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<Users className="h-4 w-4" />}
            onClick={(): void => {
              onApplicantsRequested(jobOpening)
            }}
          >
            {formatApplicantCountLabel(applicationCount)}
          </Button>
        ) : null}
        {isJobOpeningContentEditable(jobOpening.status) ? (
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<PencilLine className="h-4 w-4" />}
            disabled={isActionPending}
            onClick={(): void => {
              onEditRequested(jobOpening)
            }}
          >
            Edit
          </Button>
        ) : null}
        {transitionOptions.map((transitionOption) => (
          <Button
            key={transitionOption.action}
            size="sm"
            variant={transitionOption.action === 'close' ? 'ghost' : 'primary'}
            disabled={isActionPending || transitionOption.disabledReason !== null}
            isLoading={isActionPending}
            aria-describedby={
              transitionOption.disabledReason === null
                ? undefined
                : `${reasonIdPrefix}-${transitionOption.action}-reason`
            }
            onClick={(): void => {
              onActionRequested(jobOpening, transitionOption.action)
            }}
          >
            {jobOpeningActionCopy[transitionOption.action].buttonLabel}
          </Button>
        ))}
        {isJobOpeningDeletable(jobOpening.status) ? (
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Trash2 className="h-4 w-4" />}
            disabled={isActionPending}
            className="text-[var(--color-danger-500)] hover:bg-[var(--color-danger-50)]"
            onClick={(): void => {
              onActionRequested(jobOpening, 'delete')
            }}
          >
            {jobOpeningActionCopy.delete.buttonLabel}
          </Button>
        ) : null}
      </div>

      {transitionOptions.map((transitionOption) =>
        transitionOption.disabledReason === null ? null : (
          <p
            key={transitionOption.action}
            id={`${reasonIdPrefix}-${transitionOption.action}-reason`}
            className="text-xs text-[var(--color-ink-500)]"
          >
            {jobOpeningActionCopy[transitionOption.action].buttonLabel} is unavailable:{' '}
            {transitionOption.disabledReason}
          </p>
        ),
      )}
    </li>
  )
}
