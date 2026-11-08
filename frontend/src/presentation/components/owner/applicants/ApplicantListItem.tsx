import type { ReactElement } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ApplicantProfile } from '../../../../domain/models/ApplicantProfile'
import type { JobApplication } from '../../../../domain/models/JobApplication'
import { Button } from '../../../design/ui'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import { JobApplicationStatusBadge } from '../../jobOpenings/JobApplicationStatusBadge'

interface ApplicantListItemProps {
  readonly application: JobApplication
  /** Null once the application left the sharing statuses (rejected, withdrawn, closed). */
  readonly applicantProfile: ApplicantProfile | null
  readonly onOpenRequested: (application: JobApplication) => void
}

export function ApplicantListItem({
  application,
  applicantProfile,
  onOpenRequested,
}: ApplicantListItemProps): ReactElement {
  const applicantName = applicantProfile?.displayName ?? 'Applicant'

  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{applicantName}</p>
        {applicantProfile?.headline ? (
          <p className="text-xs break-words text-[var(--color-ink-700)]">{applicantProfile.headline}</p>
        ) : null}
        <p className="text-xs text-[var(--color-ink-500)]">
          {application.submittedAt === null ? null : `Applied ${formatShortDateTime(application.submittedAt)}`}
          {applicantProfile === null ? ' · Profile no longer shared' : null}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <JobApplicationStatusBadge status={application.status} />
        <Button
          size="sm"
          variant="secondary"
          trailingIcon={<ChevronRight className="h-4 w-4" />}
          aria-label={`Open application from ${applicantName}`}
          onClick={(): void => {
            onOpenRequested(application)
          }}
        >
          Open
        </Button>
      </div>
    </li>
  )
}
