import type { ReactElement } from 'react'
import { Eye } from 'lucide-react'
import type { JobOpeningContent } from '../../../../domain/models/JobOpening'
import { JobOpeningDetailsView } from '../../jobOpenings/JobOpeningDetailsView'

interface JobOpeningPreviewProps {
  readonly jobOpeningContent: JobOpeningContent
  readonly shopName: string
  /** Shows the owner banner; workers see JobOpeningDetailsView without it. */
  readonly isOwnerPreview: boolean
}

export function JobOpeningPreview({
  jobOpeningContent,
  shopName,
  isOwnerPreview,
}: JobOpeningPreviewProps): ReactElement {
  return (
    <article aria-label="Job opening preview" className="space-y-4">
      {isOwnerPreview ? (
        <p className="flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand-50)] px-3 py-2 text-xs font-medium text-[var(--color-brand-800)]">
          <Eye className="h-4 w-4" aria-hidden="true" />
          Preview - workers see this after you publish
        </p>
      ) : null}
      <JobOpeningDetailsView jobOpeningContent={jobOpeningContent} shopName={shopName} />
    </article>
  )
}
