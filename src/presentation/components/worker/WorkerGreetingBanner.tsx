import type { ReactElement } from 'react'
import { Briefcase } from 'lucide-react'
import { Avatar } from '../../design/ui'
import { WorkerAvailabilityPill } from './WorkerAvailabilityPill'

interface WorkerGreetingBannerProps {
  readonly workerDisplayName: string | null
  readonly isAvailableForJobs: boolean
  readonly isAvailabilityInteractionDisabled: boolean
  readonly onAvailabilityChange: (nextAvailability: boolean) => void
  readonly activeJobCount: number
}

export function WorkerGreetingBanner({
  workerDisplayName,
  isAvailableForJobs,
  isAvailabilityInteractionDisabled,
  onAvailabilityChange,
  activeJobCount,
}: WorkerGreetingBannerProps): ReactElement {
  const greetingHeadline =
    workerDisplayName && workerDisplayName.trim().length > 0
      ? `Hi, ${workerDisplayName}`
      : 'Hi there'

  const activeJobsSubline =
    activeJobCount === 0
      ? 'No active jobs right now.'
      : activeJobCount === 1
        ? 'You have 1 active job today.'
        : `You have ${activeJobCount} active jobs today.`

  return (
    <div className="rounded-[var(--radius-surface)] bg-[linear-gradient(135deg,var(--color-brand-700),var(--color-brand-900))] p-5 text-white shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex items-start gap-3">
        <Avatar fullName={workerDisplayName ?? 'Worker'} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-bold sm:text-xl">
              {greetingHeadline}
            </h1>
            <WorkerAvailabilityPill
              isAvailableForJobs={isAvailableForJobs}
              isInteractionDisabled={isAvailabilityInteractionDisabled}
              onAvailabilityChange={onAvailabilityChange}
            />
          </div>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-white/85">
            <Briefcase className="h-4 w-4" />
            {activeJobsSubline}
          </p>
        </div>
      </div>
    </div>
  )
}
