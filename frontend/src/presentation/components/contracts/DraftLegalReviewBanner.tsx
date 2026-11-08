import type { ReactElement } from 'react'
import { Scale } from 'lucide-react'
import {
  acceptanceRecordText,
  draftLegalReviewNotice,
  draftTemplateLabel,
  noComplianceClaimText,
} from '../../utilities/contractTemplateCopy'

interface DraftLegalReviewBannerProps {
  /** Also explain that a later acceptance is a recorded acceptance, not an e-signature. */
  readonly isAcceptanceNoteShown?: boolean
}

/** Top banner on every contract template view: the template is a draft that needs legal review. */
export function DraftLegalReviewBanner({ isAcceptanceNoteShown = false }: DraftLegalReviewBannerProps): ReactElement {
  return (
    <div
      role="note"
      aria-label={draftTemplateLabel}
      className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--color-warning-500)] bg-[var(--color-warning-50)] px-3 py-3 text-sm text-[var(--color-ink-900)]"
    >
      <Scale className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning-600)]" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">{draftTemplateLabel}</p>
        <p>{draftLegalReviewNotice}</p>
        <p className="text-xs text-[var(--color-ink-700)]">{noComplianceClaimText}</p>
        {isAcceptanceNoteShown ? <p className="text-xs text-[var(--color-ink-700)]">{acceptanceRecordText}</p> : null}
      </div>
    </div>
  )
}

interface SectionReviewNoticeProps {
  /** The section's review_notice exactly as stored. */
  readonly reviewNotice: string
}

/** The per-section draft notice under every section heading. */
export function SectionReviewNotice({ reviewNotice }: SectionReviewNoticeProps): ReactElement {
  return <p className="text-xs font-medium text-[var(--color-warning-600)]">{reviewNotice}</p>
}
