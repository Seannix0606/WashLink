import type { ReactElement, ReactNode } from 'react'
import { useId } from 'react'
import { GraduationCap } from 'lucide-react'
import {
  trainingAndWorkNoticeText,
  trainingAndWorkNoticeTitle,
} from '../../../utilities/workforceNoticeCopy'

interface TrainingAndWorkNoticeProps {
  /** Optional content under the notice, such as the acknowledgement checkbox. */
  readonly children?: ReactNode
}

/** The free-training and paid-work notice, shown before results and in the apply dialog (C7). */
export function TrainingAndWorkNotice({ children }: TrainingAndWorkNoticeProps): ReactElement {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-brand-100)] bg-[var(--color-brand-50)] px-4 py-3"
    >
      <h3
        id={headingId}
        className="flex items-center gap-2 text-sm font-semibold text-[var(--color-brand-800)]"
      >
        <GraduationCap className="h-4 w-4 shrink-0" aria-hidden="true" />
        {trainingAndWorkNoticeTitle}
      </h3>
      <p className="text-sm text-[var(--color-ink-700)]">{trainingAndWorkNoticeText}</p>
      {children}
    </section>
  )
}
