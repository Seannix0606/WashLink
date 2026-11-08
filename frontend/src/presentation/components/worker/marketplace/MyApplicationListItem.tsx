import type { ReactElement } from 'react'
import { FileText, PencilLine, Send, Trash2, Undo2 } from 'lucide-react'
import type { MyJobApplication } from '../../../../domain/models/JobApplication'
import {
  isOpeningEditedAfterApplying,
  workerActionsForApplication,
} from '../../../../domain/utilities/jobApplicationLifecycle'
import { Button } from '../../../design/ui'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import {
  describeApplicationOpeningTitle,
  describeWorkerApplicationStatus,
  describeWorkerWithdrawAction,
  openingEditedAfterApplyingText,
} from '../../../utilities/jobApplicationDisplay'
import { JobApplicationStatusBadge } from '../../jobOpenings/JobApplicationStatusBadge'

interface MyApplicationListItemProps {
  readonly myApplication: MyJobApplication
  readonly isActionPending: boolean
  readonly onSnapshotRequested: (myApplication: MyJobApplication) => void
  readonly onWithdrawRequested: (myApplication: MyJobApplication) => void
  readonly onSubmitDraftRequested: (myApplication: MyJobApplication) => void
  readonly onDeleteDraftRequested: (myApplication: MyJobApplication) => void
}

export function MyApplicationListItem({
  myApplication,
  isActionPending,
  onSnapshotRequested,
  onWithdrawRequested,
  onSubmitDraftRequested,
  onDeleteDraftRequested,
}: MyApplicationListItemProps): ReactElement {
  const { application, currentOpening } = myApplication
  const workerActions = workerActionsForApplication(application)
  const statusDisplay = describeWorkerApplicationStatus(application)
  const openingSnapshot = application.openingSnapshot
  const isEditedAfterApplying =
    openingSnapshot !== null &&
    currentOpening !== null &&
    isOpeningEditedAfterApplying(openingSnapshot.jobOpeningUpdatedAt, currentOpening.updatedAt)

  return (
    <li className="space-y-3 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold break-words text-[var(--color-ink-900)]">
            {describeApplicationOpeningTitle(myApplication)}
          </h3>
          {openingSnapshot?.shopName ? (
            <p className="text-xs break-words text-[var(--color-ink-500)]">{openingSnapshot.shopName}</p>
          ) : null}
          <p className="text-xs text-[var(--color-ink-500)]">
            {application.submittedAt === null
              ? 'Not sent yet'
              : `Applied ${formatShortDateTime(application.submittedAt)}`}
            {application.statusChangedAt !== null && application.statusChangedAt !== application.submittedAt
              ? ` · Updated ${formatShortDateTime(application.statusChangedAt)}`
              : null}
          </p>
        </div>
        <JobApplicationStatusBadge status={application.status} statusDisplay={statusDisplay} />
      </div>

      <p className="text-xs text-[var(--color-ink-700)]">
        {statusDisplay.workerHelperText}
      </p>

      {isEditedAfterApplying ? (
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-warning-600)]">
          <PencilLine className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {openingEditedAfterApplyingText}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {openingSnapshot !== null ? (
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<FileText className="h-4 w-4" />}
            onClick={(): void => {
              onSnapshotRequested(myApplication)
            }}
          >
            What you applied to
          </Button>
        ) : null}
        {workerActions.includes('submit_draft') ? (
          <Button
            size="sm"
            leadingIcon={<Send className="h-4 w-4" />}
            disabled={isActionPending}
            onClick={(): void => {
              onSubmitDraftRequested(myApplication)
            }}
          >
            Review and send
          </Button>
        ) : null}
        {workerActions.includes('delete_draft') ? (
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Trash2 className="h-4 w-4" />}
            disabled={isActionPending}
            isLoading={isActionPending}
            onClick={(): void => {
              onDeleteDraftRequested(myApplication)
            }}
          >
            Delete draft
          </Button>
        ) : null}
        {workerActions.includes('withdraw') ? (
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Undo2 className="h-4 w-4" />}
            disabled={isActionPending}
            isLoading={isActionPending}
            className="text-[var(--color-danger-500)] hover:bg-[var(--color-danger-50)]"
            onClick={(): void => {
              onWithdrawRequested(myApplication)
            }}
          >
            {describeWorkerWithdrawAction(application).buttonLabel}
          </Button>
        ) : null}
      </div>
    </li>
  )
}
