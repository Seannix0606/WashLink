import type { ReactElement } from 'react'
import { StickyNote } from 'lucide-react'

type BookingNotesBlockTone = 'neutral' | 'highlight'

interface BookingNotesBlockProps {
  readonly customerNotes: string | null
  readonly tone?: BookingNotesBlockTone
  readonly titleText?: string
}

const containerClassNameByTone: Record<BookingNotesBlockTone, string> = {
  neutral:
    'rounded-[var(--radius-surface)] border border-[var(--color-ink-200)] bg-[var(--color-surface-muted)] px-3 py-2.5',
  highlight:
    'rounded-[var(--radius-surface)] border border-[var(--color-brand-200)] bg-[var(--color-brand-50)] px-3 py-2.5',
}

const iconBubbleClassNameByTone: Record<BookingNotesBlockTone, string> = {
  neutral: 'bg-[var(--color-ink-500)] text-white',
  highlight: 'bg-[var(--color-brand-700)] text-white',
}

export function BookingNotesBlock({
  customerNotes,
  tone = 'neutral',
  titleText = 'Customer notes',
}: BookingNotesBlockProps): ReactElement | null {
  if (customerNotes === null || customerNotes.trim().length === 0) {
    return null
  }
  return (
    <div className={containerClassNameByTone[tone]}>
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${iconBubbleClassNameByTone[tone]}`}
        >
          <StickyNote className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-500)]">
            {titleText}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-[var(--color-ink-900)]">
            {customerNotes}
          </p>
        </div>
      </div>
    </div>
  )
}
