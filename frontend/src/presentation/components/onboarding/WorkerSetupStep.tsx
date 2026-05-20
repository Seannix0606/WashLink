import type { ReactElement } from 'react'
import { useState } from 'react'
import { Phone, Plus, Trash2, UserCircle2, Users } from 'lucide-react'
import type { CreateWorkerInput } from '../../../domain/models/Worker'
import {
  Button,
  Card,
  EmptyState,
  Input,
  applicationToast,
} from '../../design/ui'

interface WorkerSetupStepProps {
  readonly isSubmitting: boolean
  readonly onWorkersSubmitted: (workersToCreate: CreateWorkerInput[]) => void
  readonly onSkipWorkersSetup: () => void
}

interface DraftWorker {
  readonly draftIdentifier: string
  readonly workerName: string
  readonly workerPhoneNumber: string
}

function createEmptyDraftWorker(): DraftWorker {
  const draftIdentifier =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `draft-${Math.random().toString(36).slice(2)}`
  return { draftIdentifier, workerName: '', workerPhoneNumber: '' }
}

export function WorkerSetupStep({
  isSubmitting,
  onWorkersSubmitted,
  onSkipWorkersSetup,
}: WorkerSetupStepProps): ReactElement {
  const [draftWorkers, setDraftWorkers] = useState<DraftWorker[]>([])

  const handleAddWorkerRow = (): void => {
    setDraftWorkers((previousDraftWorkers) => [
      ...previousDraftWorkers,
      createEmptyDraftWorker(),
    ])
  }

  const handleRemoveWorkerRow = (draftIdentifierToRemove: string): void => {
    setDraftWorkers((previousDraftWorkers) =>
      previousDraftWorkers.filter(
        (draftWorker) => draftWorker.draftIdentifier !== draftIdentifierToRemove,
      ),
    )
  }

  const handleUpdateDraftWorkerField = (
    draftIdentifier: string,
    fieldKey: 'workerName' | 'workerPhoneNumber',
    nextFieldValue: string,
  ): void => {
    setDraftWorkers((previousDraftWorkers) =>
      previousDraftWorkers.map((draftWorker) =>
        draftWorker.draftIdentifier === draftIdentifier
          ? { ...draftWorker, [fieldKey]: nextFieldValue }
          : draftWorker,
      ),
    )
  }

  const handleSubmit = (): void => {
    const preparedWorkerInputs: CreateWorkerInput[] = []
    for (const draftWorker of draftWorkers) {
      const trimmedWorkerName = draftWorker.workerName.trim()
      const trimmedWorkerPhoneNumber = draftWorker.workerPhoneNumber.trim()
      if (
        trimmedWorkerName.length === 0 ||
        trimmedWorkerPhoneNumber.length === 0
      ) {
        applicationToast.warning(
          'Please fill in both the name and phone number for every worker row, or remove empty rows.',
        )
        return
      }
      preparedWorkerInputs.push({
        name: trimmedWorkerName,
        phoneNumber: trimmedWorkerPhoneNumber,
      })
    }

    onWorkersSubmitted(preparedWorkerInputs)
  }

  return (
    <div className="space-y-5">
      <Card elevation="flat" className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-[var(--color-ink-900)]">
              Add your team
            </h3>
            <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">
              Workers you add here become assignable to bookings. You can always add more later from the dashboard.
            </p>
          </div>
        </div>

        {draftWorkers.length === 0 ? (
          <EmptyState
            icon={<UserCircle2 className="h-6 w-6" />}
            title="No workers yet"
            description="Add the people who will be handling car washes for your shop."
            primaryAction={
              <Button
                type="button"
                variant="secondary"
                leadingIcon={<Plus className="h-4 w-4" />}
                onClick={handleAddWorkerRow}
              >
                Add a worker
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {draftWorkers.map((draftWorker, draftWorkerIndex) => (
              <div
                key={draftWorker.draftIdentifier}
                className="rounded-[var(--radius-surface)] border border-[var(--color-ink-200)] bg-[var(--color-surface-muted)] p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-500)]">
                    Worker {draftWorkerIndex + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleRemoveWorkerRow(draftWorker.draftIdentifier)
                    }
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-[var(--color-danger-500)] hover:bg-[var(--color-danger-50)]"
                    aria-label="Remove worker"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    name={`workerName-${draftWorker.draftIdentifier}`}
                    label="Name"
                    placeholder="Full name"
                    leadingIcon={<UserCircle2 className="h-4 w-4" />}
                    value={draftWorker.workerName}
                    onChange={(inputChangeEvent) =>
                      handleUpdateDraftWorkerField(
                        draftWorker.draftIdentifier,
                        'workerName',
                        inputChangeEvent.target.value,
                      )
                    }
                  />
                  <Input
                    name={`workerPhoneNumber-${draftWorker.draftIdentifier}`}
                    label="Phone number"
                    placeholder="e.g. +63 917 555 0101"
                    leadingIcon={<Phone className="h-4 w-4" />}
                    value={draftWorker.workerPhoneNumber}
                    onChange={(inputChangeEvent) =>
                      handleUpdateDraftWorkerField(
                        draftWorker.draftIdentifier,
                        'workerPhoneNumber',
                        inputChangeEvent.target.value,
                      )
                    }
                  />
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="ghost"
              leadingIcon={<Plus className="h-4 w-4" />}
              onClick={handleAddWorkerRow}
            >
              Add another worker
            </Button>
          </div>
        )}
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={onSkipWorkersSetup}
          disabled={isSubmitting}
        >
          Skip for now
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={handleSubmit}
          isLoading={isSubmitting}
          disabled={draftWorkers.length === 0}
        >
          {draftWorkers.length === 0
            ? 'Add at least one worker'
            : `Save ${draftWorkers.length} worker${draftWorkers.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  )
}
