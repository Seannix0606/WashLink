import type { ReactElement } from 'react'
import { ShieldAlert } from 'lucide-react'
import { heldModerationStatuses, type OwnerJobOpeningModeration } from '../../../../domain/models/JobOpeningModeration'
import { Button } from '../../../design/ui'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import {
  askWashLinkButtonLabel,
  closedNotLegalFindingText,
  notLegalFindingText,
  ownerChangesSubmittedText,
  ownerEditFirstText,
  ownerHistoryActionLabel,
  ownerHistoryHeading,
  ownerHoldText,
  ownerLiftedText,
  ownerMessageLabel,
  ownerNoticeTitleByStatus,
  ownerReasonLabel,
  reportCategoryLabel,
} from '../../../utilities/jobOpeningModerationCopy'

interface OpeningModerationNoticeProps {
  readonly moderation: OwnerJobOpeningModeration
  readonly isSubmitting: boolean
  readonly onAskWashLinkRequested: (moderation: OwnerJobOpeningModeration) => void
}

function guidanceText(moderation: OwnerJobOpeningModeration): string | null {
  switch (moderation.status) {
    case 'paused_by_washlink':
      return moderation.canSubmitChanges ? ownerHoldText : `${ownerHoldText} ${ownerEditFirstText}`
    case 'changes_submitted':
      return ownerChangesSubmittedText
    case 'lifted':
      return ownerLiftedText
    default:
      return null
  }
}

/**
 * The owner's WashLink notice on one opening (D-52, D-53): the reason kind, WashLink's message and
 * the history. Never a report, a statement, a count or who reported.
 */
export function OpeningModerationNotice({ moderation, isSubmitting, onAskWashLinkRequested }: OpeningModerationNoticeProps): ReactElement {
  const isHeld = heldModerationStatuses.includes(moderation.status)
  const title = ownerNoticeTitleByStatus[moderation.status] ?? 'WashLink notice'
  const guidance = guidanceText(moderation)
  return (
    <section
      aria-label="WashLink notice"
      className={`space-y-2 rounded-[var(--radius-control)] px-3 py-3 text-xs text-[var(--color-ink-700)] ${
        isHeld || moderation.status === 'closed_by_washlink' ? 'bg-[var(--color-warning-50)]' : 'bg-[var(--color-surface-muted)]'
      }`}
    >
      <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-900)]">
        <ShieldAlert className="h-4 w-4 shrink-0 text-[var(--color-warning-600)]" aria-hidden="true" />
        {title}
      </h4>
      {moderation.status === 'paused_by_washlink' || moderation.status === 'changes_submitted' ? <p>{notLegalFindingText}</p> : null}
      {moderation.status === 'closed_by_washlink' ? <p>{closedNotLegalFindingText}</p> : null}
      {moderation.reasonKind !== null ? <p>{`${ownerReasonLabel}: ${reportCategoryLabel[moderation.reasonKind]}`}</p> : null}
      {moderation.ownerMessage !== null ? (
        <p className="whitespace-pre-line break-words">
          <span className="font-medium text-[var(--color-ink-900)]">{`${ownerMessageLabel}: `}</span>
          {moderation.ownerMessage}
        </p>
      ) : null}
      {guidance !== null ? <p>{guidance}</p> : null}
      {moderation.status === 'paused_by_washlink' && moderation.canSubmitChanges ? (
        <Button
          size="sm"
          isLoading={isSubmitting}
          onClick={(): void => {
            onAskWashLinkRequested(moderation)
          }}
        >
          {askWashLinkButtonLabel}
        </Button>
      ) : null}
      {moderation.history.length > 0 ? (
        <div className="space-y-1">
          <h5 className="font-semibold text-[var(--color-ink-900)]">{ownerHistoryHeading}</h5>
          <ol aria-label={ownerHistoryHeading} className="space-y-1">
            {moderation.history.map((historyItem) => (
              <li key={`${historyItem.action}-${historyItem.createdAt}`} className="break-words">
                {`${formatShortDateTime(historyItem.createdAt)} · ${ownerHistoryActionLabel[historyItem.action]}`}
                {historyItem.reasonKind !== null ? ` · ${reportCategoryLabel[historyItem.reasonKind]}` : ''}
                {historyItem.ownerMessage !== null ? <span className="block whitespace-pre-line">{historyItem.ownerMessage}</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  )
}
