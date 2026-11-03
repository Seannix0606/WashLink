import type { ReactElement } from 'react'
import { useState } from 'react'
import { ChevronRight, Flag } from 'lucide-react'
import type { JobOpeningModerationService } from '../../../../application/services/JobOpeningModerationService'
import { moderationQueueFilters, type ModerationQueueFilter } from '../../../../domain/models/JobOpeningModeration'
import { Badge, Button, Card, EmptyState, Select, Skeleton } from '../../../design/ui'
import { useAdminModerationQueue } from '../../../hooks/useAdminModerationQueue'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import {
  adminQueueEmptyText,
  adminQueueEmptyTitle,
  adminQueueHeading,
  adminQueueIntro,
  adminQueueLoadMoreFailedTitle,
  adminQueueLoadMoreLabel,
  adminQueueShowingText,
  moderationQueueFilterLabel,
  moderationStatusLabel,
  reportCategoryLabel,
} from '../../../utilities/jobOpeningModerationCopy'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { PostingReportCaseDrawer } from './PostingReportCaseDrawer'

const filterOptions = moderationQueueFilters.map((filter) => ({ value: filter, label: moderationQueueFilterLabel[filter] }))

interface PostingReportQueuePanelProps {
  readonly moderationService: JobOpeningModerationService
}

/** Super_admin "Posting reports": cases by status, oldest first, 50 per page with "Load more" (W13, D-71), and the case drawer. */
export function PostingReportQueuePanel({ moderationService }: PostingReportQueuePanelProps): ReactElement {
  const [filter, setFilter] = useState<ModerationQueueFilter>('active')
  const queue = useAdminModerationQueue(moderationService, filter)
  const [openCaseId, setOpenCaseId] = useState<string | null>(null)

  const renderBody = (): ReactElement => {
    if (queue.isLoading) {
      return (
        <div aria-busy="true" aria-label="Loading the posting reports" className="space-y-2">
          <Skeleton heightClassName="h-16" />
          <Skeleton heightClassName="h-16" />
        </div>
      )
    }
    if (queue.errorMessage !== null) {
      return (
        <LoadErrorNotice
          title="The posting reports could not be loaded"
          errorMessage={queue.errorMessage}
          onRetry={(): void => {
            void queue.reload()
          }}
        />
      )
    }
    if (queue.isEmpty) {
      return <EmptyState icon={<Flag className="h-5 w-5" />} title={adminQueueEmptyTitle} description={adminQueueEmptyText} />
    }
    return (
      <div className="space-y-2">
        <ul aria-label="Posting report cases" className="space-y-2">
          {queue.items.map((item) => (
            <li key={item.caseId}>
              <button
                type="button"
                aria-label={`Open the case: ${item.openingTitleSnapshot ?? 'job opening'}, ${item.shopNameSnapshot ?? 'shop'}`}
                onClick={(): void => {
                  setOpenCaseId(item.caseId)
                }}
                className="flex w-full items-start justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-white p-3 text-left transition-colors hover:border-[var(--color-brand-400)]"
              >
                <span className="min-w-0 space-y-0.5">
                  <span className="block text-sm font-semibold break-words text-[var(--color-ink-900)]">{item.openingTitleSnapshot ?? 'Job opening'}</span>
                  <span className="block text-xs break-words text-[var(--color-ink-500)]">{item.shopNameSnapshot ?? 'Shop name not recorded'}</span>
                  <span className="block text-[11px] text-[var(--color-ink-500)]">
                    {`${item.categories.map((category) => reportCategoryLabel[category]).join(', ')} · ${String(item.openReportCount)} open of ${String(item.reportCount)} reports · opened ${formatShortDateTime(item.openedAt)} · ${
                      item.isOpeningPresent ? `opening ${item.openingStatus ?? 'unknown'}` : 'opening removed'
                    }`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Badge tone={item.status === 'open' || item.status === 'changes_submitted' ? 'warning' : 'neutral'}>{moderationStatusLabel[item.status]}</Badge>
                  <ChevronRight className="h-4 w-4 text-[var(--color-ink-500)]" aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
        {queue.totalCount === null ? null : (
          <p aria-live="polite" className="text-xs text-[var(--color-ink-500)]">
            {adminQueueShowingText(queue.items.length, queue.totalCount)}
          </p>
        )}
        {queue.loadMoreErrorMessage === null ? null : (
          <LoadErrorNotice
            title={adminQueueLoadMoreFailedTitle}
            errorMessage={queue.loadMoreErrorMessage}
            onRetry={(): void => {
              void queue.loadMore()
            }}
          />
        )}
        {queue.hasMore && queue.loadMoreErrorMessage === null ? (
          <Button
            size="sm"
            variant="secondary"
            isFullWidth
            isLoading={queue.isLoadingMore}
            onClick={(): void => {
              void queue.loadMore()
            }}
          >
            {adminQueueLoadMoreLabel}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <Card elevation="raised" role="region" aria-labelledby="posting-reports-heading" className="space-y-4">
      <header>
        <h2 id="posting-reports-heading" className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <Flag className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          {adminQueueHeading}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{adminQueueIntro}</p>
      </header>
      <div className="sm:w-64">
        <Select
          id="posting-report-filter"
          name="posting-report-filter"
          label="Show"
          options={filterOptions}
          value={filter}
          onChange={(changeEvent): void => {
            setFilter(moderationQueueFilters.find((candidate) => candidate === changeEvent.target.value) ?? 'active')
          }}
        />
      </div>
      {renderBody()}
      <PostingReportCaseDrawer
        moderationService={moderationService}
        caseId={openCaseId}
        onClose={(): void => {
          setOpenCaseId(null)
        }}
        onDecided={queue.refresh}
      />
    </Card>
  )
}
