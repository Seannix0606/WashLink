import type { ReactElement } from 'react'
import { useState } from 'react'
import { Plus, UserCircle2, Users } from 'lucide-react'
import type { WorkerService } from '../../../application/services/WorkerService'
import type { Worker } from '../../../domain/models/Worker'
import { Button, Card, EmptyState } from '../../design/ui'
import { useOwnerWorkerManagement } from '../../hooks/useOwnerWorkerManagement'
import { AddWorkerInlineForm } from './AddWorkerInlineForm'
import { OwnerWorkerListItem } from './OwnerWorkerListItem'

interface OwnerWorkersPanelProps {
  readonly ownerIdentifier: string
  readonly workerService: WorkerService
  readonly workers: readonly Worker[]
  readonly onWorkersChanged: (nextWorkers: Worker[]) => void
}

export function OwnerWorkersPanel({
  ownerIdentifier,
  workerService,
  workers,
  onWorkersChanged,
}: OwnerWorkersPanelProps): ReactElement {
  const [isAddingWorker, setIsAddingWorker] = useState<boolean>(false)

  const {
    isSubmittingWorkerCreation,
    deletingWorkerIdentifier,
    createWorkerForOwner,
    removeWorker,
  } = useOwnerWorkerManagement({
    ownerIdentifier,
    workerService,
    workers,
    onWorkersChanged,
  })

  return (
    <Card elevation="raised" className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
            <Users className="h-4 w-4 text-[var(--color-brand-700)]" />
            My team
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">
            Workers assignable to your bookings.
          </p>
        </div>
        {!isAddingWorker ? (
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<Plus className="h-4 w-4" />}
            onClick={() => setIsAddingWorker(true)}
          >
            Add worker
          </Button>
        ) : null}
      </header>

      {isAddingWorker ? (
        <AddWorkerInlineForm
          isSubmitting={isSubmittingWorkerCreation}
          onCancelAddingWorker={() => setIsAddingWorker(false)}
          onSubmitWorker={async (createWorkerInput) => {
            const createdWorker = await createWorkerForOwner(createWorkerInput)
            if (createdWorker !== null) {
              setIsAddingWorker(false)
            }
          }}
        />
      ) : null}

      {workers.length === 0 ? (
        <EmptyState
          icon={<UserCircle2 className="h-5 w-5" />}
          title="No workers yet"
          description="Add your team so bookings can be assigned."
        />
      ) : (
        <ul className="space-y-2">
          {workers.map((worker) => (
            <OwnerWorkerListItem
              key={worker.workerIdentifier}
              worker={worker}
              isDeleting={
                deletingWorkerIdentifier === worker.workerIdentifier
              }
              onRemoveWorker={(targetWorker) => void removeWorker(targetWorker)}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}
