import type { ReactElement, ReactNode } from 'react'
import { useId } from 'react'
import { GraduationCap, Info } from 'lucide-react'
import {
  shopTrainingVersusPaidWorkText,
  trainingNoticeText,
  trainingNoticeTitle,
  trainingVersusPaidWorkText,
} from '../../utilities/trainingNoticeCopy'

interface FreeTrainingNoticeProps {
  /** Optional content under the notice, such as the acknowledgement checkbox. */
  readonly children?: ReactNode
}

/** The free-training notice (w6_v1). Always the first thing in an invitation. */
export function FreeTrainingNotice({ children }: FreeTrainingNoticeProps): ReactElement {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-brand-100)] bg-[var(--color-brand-50)] px-4 py-3"
    >
      <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-[var(--color-brand-800)]">
        <GraduationCap className="h-4 w-4 shrink-0" aria-hidden="true" />
        {trainingNoticeTitle}
      </h3>
      <p className="text-sm text-[var(--color-ink-700)]">{trainingNoticeText}</p>
      {children}
    </section>
  )
}

/** Who reads the note: the trainee (D-81 text) or the shop side, owners and designated trainers (W15-L2). */
export type TrainingNoteAudience = 'trainee' | 'shop'

interface TrainingVersusPaidWorkNoteProps {
  readonly audience?: TrainingNoteAudience
}

/** The training-vs-paid-work distinction, shown on every training view. */
export function TrainingVersusPaidWorkNote({ audience = 'trainee' }: TrainingVersusPaidWorkNoteProps): ReactElement {
  return (
    <p role="note" className="flex items-start gap-2 text-xs text-[var(--color-ink-500)]">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {audience === 'shop' ? shopTrainingVersusPaidWorkText : trainingVersusPaidWorkText}
    </p>
  )
}
