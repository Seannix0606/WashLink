import type { ReactElement } from 'react'
import type { JobOpeningModerationService } from '../../../../application/services/JobOpeningModerationService'
import type { AdminModerationCase } from '../../../../domain/models/JobOpeningModeration'
import { Badge, Drawer, Skeleton } from '../../../design/ui'
import { useAdminModerationCase } from '../../../hooks/useAdminModerationCase'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import {
  adminCaseAuditedText,
  adminCaseReporterProtectionText,
  adminOpeningGoneText,
  moderationStatusLabel,
  ownerHistoryActionLabel,
  reportCategoryLabel,
  reportOutcomeLabel,
  reportStatusLabel,
} from '../../../utilities/jobOpeningModerationCopy'
import { JobOpeningDetailsView } from '../../jobOpenings/JobOpeningDetailsView'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { DecideOpeningChangesForm } from './DecideOpeningChangesForm'
import { ModerateOpeningForm } from './ModerateOpeningForm'

const sectionHeadingClassName = 'text-xs font-semibold tracking-wide text-[var(--color-ink-500)] uppercase'

function CaseFacts({ moderationCase }: { readonly moderationCase: AdminModerationCase }): ReactElement {
  const { moderationCase: summary, opening, shop, applicationCounts } = moderationCase
  const countText = Object.entries(applicationCounts)
    .map(([status, count]) => `${status.replace(/_/g, ' ')} ${String(count)}`)
    .join(' · ')
  return (
    <section aria-label="Case" className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{summary.openingTitleSnapshot ?? 'Job opening'}</span>
        <Badge tone="warning">{moderationStatusLabel[summary.status]}</Badge>
      </div>
      <p className="break-words">
        {shop === null
          ? `${summary.shopNameSnapshot ?? 'Shop'} (shop removed)`
          : `${shop.name} · verification ${shop.verificationStatus}${shop.hasRecordedVerification ? '' : ' (no recorded review)'}${shop.isActive ? '' : ' · inactive'}`}
      </p>
      <p>{`Opened ${formatShortDateTime(summary.openedAt)} · last change ${formatShortDateTime(summary.statusChangedAt)}`}</p>
      {opening !== null ? <p>{`Opening status: ${opening.status}`}</p> : <p role="status">{adminOpeningGoneText}</p>}
      <p>{countText.length === 0 ? 'No applications.' : `Applications: ${countText}`}</p>
      {summary.reasonKind !== null ? <p>{`Reason: ${reportCategoryLabel[summary.reasonKind]}`}</p> : null}
      {summary.ownerMessage !== null ? <p className="whitespace-pre-line break-words">{`Message to the owner: ${summary.ownerMessage}`}</p> : null}
      {summary.adminNote !== null ? <p className="whitespace-pre-line break-words">{`Internal note: ${summary.adminNote}`}</p> : null}
    </section>
  )
}

interface CaseBodyProps {
  readonly moderationService: JobOpeningModerationService
  readonly caseId: string
  readonly onDecided: () => Promise<void>
}

function CaseBody({ moderationService, caseId, onDecided }: CaseBodyProps): ReactElement {
  const caseState = useAdminModerationCase(moderationService, caseId, onDecided)
  if (caseState.isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading this case" className="space-y-2">
        <Skeleton heightClassName="h-24" />
        <Skeleton heightClassName="h-24" />
      </div>
    )
  }
  if (caseState.errorMessage !== null || caseState.moderationCase === null) {
    return (
      <LoadErrorNotice
        title="This case could not be loaded"
        errorMessage={caseState.errorMessage ?? 'Could not load this case.'}
        onRetry={(): void => {
          void caseState.reload()
        }}
      />
    )
  }
  const moderationCase = caseState.moderationCase
  const { reports, actions, opening } = moderationCase
  const isChangesSubmitted = moderationCase.moderationCase.status === 'changes_submitted'
  return (
    <div className="space-y-5 text-xs text-[var(--color-ink-700)]">
      <p className="text-[11px] text-[var(--color-ink-500)]">{adminCaseAuditedText}</p>
      <CaseFacts moderationCase={moderationCase} />
      <section aria-label="Reports" className="space-y-2">
        <h3 className={sectionHeadingClassName}>Reports</h3>
        <p className="text-[11px] text-[var(--color-ink-500)]">{adminCaseReporterProtectionText}</p>
        <ul aria-label="Reports" className="space-y-2">
          {reports.map((report) => (
            <li key={`${report.reporterLabel}-${report.createdAt}`} className="space-y-0.5 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-2">
              <p className="font-medium text-[var(--color-ink-900)]">{`${report.reporterLabel} · ${reportCategoryLabel[report.category]}`}</p>
              <p>{`${formatShortDateTime(report.createdAt)} · ${reportStatusLabel[report.status]}${report.outcome === null ? '' : ` · ${reportOutcomeLabel[report.outcome]}`}`}</p>
              <p className="whitespace-pre-line break-words">{report.statement}</p>
            </li>
          ))}
        </ul>
      </section>
      {actions.length > 0 ? (
        <section aria-label="Decisions" className="space-y-1">
          <h3 className={sectionHeadingClassName}>Decisions</h3>
          <ol className="space-y-1">
            {actions.map((action) => (
              <li key={`${action.action}-${action.createdAt}`} className="break-words">
                {`${formatShortDateTime(action.createdAt)} · ${ownerHistoryActionLabel[action.action]}${action.reasonKind === null ? '' : ` · ${reportCategoryLabel[action.reasonKind]}`}`}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {opening !== null && opening.content !== null ? (
        <details className="space-y-2">
          <summary className="cursor-pointer text-sm font-medium text-[var(--color-ink-900)]">The opening as it is now</summary>
          <JobOpeningDetailsView jobOpeningContent={opening.content} shopName={opening.content.shopName ?? 'The shop'} />
        </details>
      ) : null}
      {caseState.availableActions.length > 0 ? (
        isChangesSubmitted ? (
          <DecideOpeningChangesForm
            ownerChangeNote={moderationCase.moderationCase.ownerChangeNote}
            availableActions={caseState.availableActions}
            isSubmitting={caseState.isDeciding}
            onDecide={caseState.decide}
          />
        ) : (
          <ModerateOpeningForm availableActions={caseState.availableActions} isSubmitting={caseState.isDeciding} onDecide={caseState.decide} />
        )
      ) : null}
    </div>
  )
}

interface PostingReportCaseDrawerProps {
  readonly moderationService: JobOpeningModerationService
  /** The case to show; it is read (and audited) only while the drawer is open. */
  readonly caseId: string | null
  readonly onClose: () => void
  readonly onDecided: () => Promise<void>
}

/** Super_admin: one posting report case, its reports (as "Reporter n"), decisions and the decision form. */
export function PostingReportCaseDrawer({ moderationService, caseId, onClose, onDecided }: PostingReportCaseDrawerProps): ReactElement {
  return (
    <Drawer isOpen={caseId !== null} onClose={onClose} title="Posting report" description="A platform action on a listing, not a legal finding">
      {caseId !== null ? <CaseBody key={caseId} moderationService={moderationService} caseId={caseId} onDecided={onDecided} /> : null}
    </Drawer>
  )
}
