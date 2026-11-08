import type { ReactElement } from 'react'
import { ArrowRight, UserRoundPlus } from 'lucide-react'
import { Button } from '../../design/ui'

interface WorkerProfileCompletionBannerProps {
  readonly onCompleteProfileRequested: () => void
}

/** Non-blocking prompt for linked workers who have no worker profile yet. */
export function WorkerProfileCompletionBanner({
  onCompleteProfileRequested,
}: WorkerProfileCompletionBannerProps): ReactElement {
  return (
    <section
      aria-labelledby="worker-profile-banner-title"
      className="flex flex-col gap-3 rounded-[var(--radius-surface)] border border-[var(--color-brand-200)] bg-[var(--color-brand-50)] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--color-brand-700)]">
          <UserRoundPlus className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2
            id="worker-profile-banner-title"
            className="text-sm font-semibold text-[var(--color-ink-900)]"
          >
            Complete your worker profile
          </h2>
          <p className="mt-0.5 text-sm text-[var(--color-ink-700)]">
            Add your skills and availability. Your current jobs keep working while you do.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        trailingIcon={<ArrowRight className="h-4 w-4" />}
        onClick={onCompleteProfileRequested}
        className="shrink-0"
      >
        Complete profile
      </Button>
    </section>
  )
}
