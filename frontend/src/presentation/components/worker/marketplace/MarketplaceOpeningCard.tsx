import type { ReactElement } from 'react'
import { Briefcase, CalendarDays, MapPin, Send } from 'lucide-react'
import type { MarketplaceJobOpening } from '../../../../domain/models/MarketplaceJobOpening'
import { Button } from '../../../design/ui'
import {
  applicantRequirementLabels,
  formatCalendarDate,
  formatCompensationAmountLine,
  jobTypeLabels,
  notSpecifiedByShopText,
} from '../../../utilities/jobOpeningDisplay'
import { JobApplicationStatusBadge } from '../../jobOpenings/JobApplicationStatusBadge'

interface MarketplaceOpeningCardProps {
  readonly jobOpening: MarketplaceJobOpening
  readonly onViewDetailsRequested: (jobOpening: MarketplaceJobOpening) => void
}

/**
 * One search result. With an application on record it shows its status instead of "Apply".
 * "Apply" opens the full details first, so the worker sees qualifications and required
 * training before the apply dialog.
 */
export function MarketplaceOpeningCard({
  jobOpening,
  onViewDetailsRequested,
}: MarketplaceOpeningCardProps): ReactElement {
  const payLine = formatCompensationAmountLine({ ...jobOpening, compensationDetails: null })
  const factClassName = 'flex items-center gap-1.5 text-xs text-[var(--color-ink-700)]'

  return (
    <li className="space-y-3 rounded-[var(--radius-control)] border border-[var(--color-card-border)] bg-[var(--color-card)] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold break-words text-[var(--color-ink-900)]">
            {jobOpening.title}
          </h3>
          <p className="text-xs break-words text-[var(--color-ink-500)]">{jobOpening.shopName}</p>
        </div>
        {jobOpening.myApplicationStatus !== null ? (
          <JobApplicationStatusBadge status={jobOpening.myApplicationStatus} prefix="Your application:" />
        ) : null}
      </div>

      <div className="space-y-1">
        <p className={factClassName}>
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="break-words">
            {jobOpening.workLocation ?? `Work location: ${notSpecifiedByShopText}`}
          </span>
        </p>
        <p className={factClassName}>
          <Briefcase className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {jobOpening.jobType === null ? `Job type: ${notSpecifiedByShopText}` : jobTypeLabels[jobOpening.jobType]}
            {jobOpening.applicantRequirement === null
              ? null
              : ` · ${applicantRequirementLabels[jobOpening.applicantRequirement]}`}
          </span>
        </p>
        <p className={factClassName}>
          <span className="font-medium">Pay:</span>
          <span className="break-words">{payLine ?? 'No amount stated. See details.'}</span>
        </p>
        {jobOpening.applicationDeadline !== null ? (
          <p className={factClassName}>
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Apply by {formatCalendarDate(jobOpening.applicationDeadline)} (Philippine time)
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          aria-label={`View details: ${jobOpening.title}`}
          onClick={(): void => {
            onViewDetailsRequested(jobOpening)
          }}
        >
          View details
        </Button>
        {jobOpening.myApplicationStatus === null ? (
          <Button
            size="sm"
            leadingIcon={<Send className="h-4 w-4" />}
            aria-label={`Apply: ${jobOpening.title}`}
            onClick={(): void => {
              onViewDetailsRequested(jobOpening)
            }}
          >
            Apply
          </Button>
        ) : null}
      </div>
    </li>
  )
}
