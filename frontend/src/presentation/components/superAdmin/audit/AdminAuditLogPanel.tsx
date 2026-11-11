import type { ReactElement } from 'react'
import { ScrollText } from 'lucide-react'
import type { AdminOversightService } from '../../../../application/services/AdminOversightService'
import type { AdminAuditLogEvent } from '../../../../domain/models/AdminOversight'
import { Button, Card, EmptyState, Skeleton } from '../../../design/ui'
import { useAdminAuditLog } from '../../../hooks/useAdminAuditLog'
import {
  auditLoadOlderLabel,
  auditLogEmptyText,
  auditLogEmptyTitle,
  auditLogHeading,
  auditLogIntro,
  auditLogNotStartedText,
} from '../../../utilities/adminOversightCopy'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { AdminAccessFlagsList } from './AdminAccessFlagsList'
import { AdminAuditFilters } from './AdminAuditFilters'

function AuditEventItem({ auditEvent }: { readonly auditEvent: AdminAuditLogEvent }): ReactElement {
  return (
    <li className="space-y-0.5 rounded-[var(--radius-control)] border border-[var(--color-card-border)] bg-[var(--color-card)] p-3 text-xs text-[var(--color-ink-700)]">
      <p className="font-medium break-words text-[var(--color-ink-900)]">{`${auditEvent.action} · ${formatShortDateTime(auditEvent.createdAt)}`}</p>
      <p className="break-all">{`By ${auditEvent.actorRole ?? auditEvent.actorKind ?? 'system'}${auditEvent.actorId === null ? '' : ` (${auditEvent.actorId})`}`}</p>
      <p className="break-all">
        {`Subject ${auditEvent.subjectType}${auditEvent.subjectId === null ? '' : ` ${auditEvent.subjectId}`}${
          auditEvent.subjectProfileId === null ? '' : ` · about account ${auditEvent.subjectProfileId}`
        }`}
      </p>
      {auditEvent.accessPurpose !== null ? (
        <p className="whitespace-pre-line break-words">{`Purpose: ${auditEvent.accessPurpose}${auditEvent.accessNote === null ? '' : ` · note: ${auditEvent.accessNote}`}`}</p>
      ) : null}
      <pre className="overflow-x-auto rounded bg-[var(--color-surface-muted)] p-2 text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(auditEvent.payload)}</pre>
    </li>
  )
}

interface AdminAuditLogPanelProps {
  readonly adminOversightService: AdminOversightService
}

/** Super_admin "Audit log": audited searches with paging, and the N6 long-open dispute flags. */
export function AdminAuditLogPanel({ adminOversightService }: AdminAuditLogPanelProps): ReactElement {
  const auditLog = useAdminAuditLog(adminOversightService)
  const { state } = auditLog

  const renderResults = (): ReactElement => {
    switch (state.kind) {
      case 'idle':
        return <p className="text-xs text-[var(--color-ink-500)]">{auditLogNotStartedText}</p>
      case 'loading':
        return (
          <div aria-busy="true" aria-label="Searching the audit log" className="space-y-2">
            <Skeleton heightClassName="h-16" />
            <Skeleton heightClassName="h-16" />
          </div>
        )
      case 'error':
        return (
          <LoadErrorNotice
            title="The audit log could not be searched"
            errorMessage={state.errorMessage}
            onRetry={(): void => {
              void auditLog.retry()
            }}
          />
        )
      case 'loaded':
        if (state.events.length === 0) {
          return <EmptyState icon={<ScrollText className="h-5 w-5" />} title={auditLogEmptyTitle} description={auditLogEmptyText} />
        }
        return (
          <div className="space-y-2">
            <ul aria-label="Audit events" className="space-y-2">
              {state.events.map((auditEvent) => (
                <AuditEventItem key={auditEvent.eventId} auditEvent={auditEvent} />
              ))}
            </ul>
            {state.hasMore ? (
              <Button
                size="sm"
                variant="secondary"
                isFullWidth
                isLoading={auditLog.isLoadingOlder}
                onClick={(): void => {
                  void auditLog.loadOlder()
                }}
              >
                {auditLoadOlderLabel}
              </Button>
            ) : null}
          </div>
        )
    }
  }

  return (
    <Card elevation="raised" role="region" aria-labelledby="audit-log-heading" className="space-y-4">
      <header>
        <h2 id="audit-log-heading" className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <ScrollText className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          {auditLogHeading}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{auditLogIntro}</p>
      </header>
      <AdminAccessFlagsList adminOversightService={adminOversightService} />
      <AdminAuditFilters
        isSearching={state.kind === 'loading'}
        filterErrorMessage={auditLog.filterErrorMessage}
        onSearch={(filterInput): void => {
          void auditLog.search(filterInput)
        }}
      />
      {renderResults()}
    </Card>
  )
}
