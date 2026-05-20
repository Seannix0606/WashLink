import type { ReactElement } from 'react'
import { Phone, Trash2 } from 'lucide-react'
import type { Worker } from '../../../domain/models/Worker'
import { Avatar, Badge, Button } from '../../design/ui'

interface OwnerWorkerListItemProps {
  readonly worker: Worker
  readonly isDeleting: boolean
  readonly onRemoveWorker: (worker: Worker) => void
}

export function OwnerWorkerListItem({
  worker,
  isDeleting,
  onRemoveWorker,
}: OwnerWorkerListItemProps): ReactElement {
  return (
    <li className="flex items-center gap-3 rounded-[var(--radius-surface)] border border-[var(--color-ink-200)] bg-white p-3">
      <Avatar fullName={worker.workerName} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-[var(--color-ink-900)]">
            {worker.workerName}
          </p>
          <Badge tone={worker.isAvailable ? 'success' : 'neutral'}>
            {worker.isAvailable ? 'Available' : 'Off-duty'}
          </Badge>
        </div>
        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-[var(--color-ink-500)]">
          <Phone className="h-3 w-3" />
          {worker.workerPhoneNumber}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        leadingIcon={<Trash2 className="h-4 w-4" />}
        isLoading={isDeleting}
        onClick={() => onRemoveWorker(worker)}
        className="text-[var(--color-danger-500)] hover:bg-[var(--color-danger-50)]"
      >
        Remove
      </Button>
    </li>
  )
}
