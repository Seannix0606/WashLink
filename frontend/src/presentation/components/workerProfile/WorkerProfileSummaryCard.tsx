import type { ReactElement } from 'react'
import { MapPin, Pencil, UserRound } from 'lucide-react'
import type {
  WorkerPrivateContact,
  WorkerProfile,
} from '../../../domain/models/WorkerProfile'
import {
  calculateWorkerProfileCompletion,
  workerProfileSectionLabels,
} from '../../../domain/utilities/workerProfileCompletion'
import { Badge, Button, Card } from '../../design/ui'
import { workerAvailabilityStatusLabels } from '../../utilities/workerProfileDisplay'

interface WorkerProfileSummaryCardProps {
  readonly workerProfile: WorkerProfile
  readonly workerPrivateContact: WorkerPrivateContact | null
  readonly onEditRequested: () => void
}

export function WorkerProfileSummaryCard({
  workerProfile,
  workerPrivateContact,
  onEditRequested,
}: WorkerProfileSummaryCardProps): ReactElement {
  const { completionPercent, missingSections } = calculateWorkerProfileCompletion(
    workerProfile,
    workerPrivateContact,
  )

  return (
    <Card elevation="raised" className="space-y-4" aria-labelledby="worker-profile-summary">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
            <UserRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2
              id="worker-profile-summary"
              className="text-base font-semibold text-[var(--color-ink-900)]"
            >
              My worker profile
            </h2>
            <p className="mt-0.5 break-words text-sm text-[var(--color-ink-700)]">
              {workerProfile.headline ?? 'No headline added yet.'}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Pencil className="h-4 w-4" />}
          onClick={onEditRequested}
        >
          Edit
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={completionPercent === 100 ? 'success' : 'warning'}>
          {String(completionPercent)}% complete
        </Badge>
        <Badge tone="brand">
          {workerAvailabilityStatusLabels[workerProfile.availabilityStatus]}
        </Badge>
        {workerProfile.yearsOfExperience !== null ? (
          <Badge tone="neutral">
            {String(workerProfile.yearsOfExperience)} years of experience
          </Badge>
        ) : null}
      </div>

      {missingSections.length > 0 ? (
        <p className="text-xs text-[var(--color-ink-500)]">
          Still missing:{' '}
          {missingSections.map((section) => workerProfileSectionLabels[section]).join(', ')}
        </p>
      ) : null}

      {workerProfile.skills.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Skills">
          {workerProfile.skills.map((skill) => (
            <li
              key={skill}
              className="rounded-full bg-[var(--color-ink-100)] px-2.5 py-0.5 text-xs text-[var(--color-ink-700)]"
            >
              {skill}
            </li>
          ))}
        </ul>
      ) : null}

      {workerProfile.preferredLocations.length > 0 ? (
        <p className="inline-flex items-start gap-1 text-xs text-[var(--color-ink-500)]">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {workerProfile.preferredLocations.join(', ')}
        </p>
      ) : null}
    </Card>
  )
}
