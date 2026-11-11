import type { ReactElement } from 'react'
import { useState } from 'react'
import { UserMinus, UserPlus } from 'lucide-react'
import type { TrainingProgramService } from '../../../../application/services/TrainingProgramService'
import type { TrainingProgram } from '../../../../domain/models/TrainingProgram'
import type { TrainingTrainer } from '../../../../domain/models/TrainingTrainer'
import type { Worker } from '../../../../domain/models/Worker'
import { canChangeTrainingTrainers } from '../../../../domain/utilities/trainingProgramLifecycle'
import { Badge, Button, Select, Skeleton } from '../../../design/ui'
import { useTrainingTrainers } from '../../../hooks/useTrainingTrainers'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { TrainingConfirmModal } from '../../training/TrainingConfirmModals'

interface TrainingTrainersSectionProps {
  readonly trainingProgramService: TrainingProgramService
  readonly program: TrainingProgram
  /** The owner's roster; only rows linked to a worker account can be chosen (D-16). */
  readonly rosterWorkers: readonly Worker[]
}

/** Designated trainers may record attendance and assessments for this program. */
export function TrainingTrainersSection({ trainingProgramService, program, rosterWorkers }: TrainingTrainersSectionProps): ReactElement {
  const { trainers, isLoadingTrainers, trainersErrorMessage, isTrainerActionPending, reloadTrainers, designateTrainer, revokeTrainer } =
    useTrainingTrainers(trainingProgramService, program)
  const [selectedRosterWorkerId, setSelectedRosterWorkerId] = useState<string>('')
  const [trainerToRevoke, setTrainerToRevoke] = useState<TrainingTrainer | null>(null)
  const canChangeTrainers = canChangeTrainingTrainers(program.status)
  const activeTrainerRosterIds = new Set(
    trainers.filter((trainer) => trainer.revokedAt === null).map((trainer) => trainer.rosterWorkerId),
  )
  const designatableWorkers = rosterWorkers.filter(
    (rosterWorker) => rosterWorker.isLinkedToAccount && !activeTrainerRosterIds.has(rosterWorker.workerIdentifier),
  )
  const selectedWorker = designatableWorkers.find((rosterWorker) => rosterWorker.workerIdentifier === selectedRosterWorkerId) ?? null

  return (
    <section aria-label="Trainers" className="space-y-3">
      <h4 className="text-sm font-semibold text-[var(--color-ink-900)]">Trainers</h4>
      <p className="text-xs text-[var(--color-ink-500)]">
        You can always record training yourself. A trainer must be a worker linked to your roster; ending the role or
        unlinking the worker ends their access.
      </p>
      {isLoadingTrainers ? (
        <Skeleton heightClassName="h-12" />
      ) : trainersErrorMessage !== null ? (
        <LoadErrorNotice title="Trainers could not be loaded" errorMessage={trainersErrorMessage} onRetry={(): void => { void reloadTrainers() }} />
      ) : trainers.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-500)]">No trainers designated.</p>
      ) : (
        <ul aria-label="Designated trainers" className="space-y-2">
          {trainers.map((trainer) => (
            <li key={trainer.designationId} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[var(--color-card-border)] p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium break-words text-[var(--color-ink-900)]">{trainer.displayName}</p>
                <p className="text-xs text-[var(--color-ink-500)]">
                  Trainer since {formatShortDateTime(trainer.designatedAt)}
                  {trainer.revokedAt === null ? '' : `, ended ${formatShortDateTime(trainer.revokedAt)}`}
                </p>
              </div>
              {trainer.revokedAt !== null ? (
                <Badge tone="neutral">Ended</Badge>
              ) : canChangeTrainers ? (
                <Button size="sm" variant="ghost" leadingIcon={<UserMinus className="h-4 w-4" />} disabled={isTrainerActionPending}
                  onClick={(): void => { setTrainerToRevoke(trainer) }}>
                  End trainer role
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canChangeTrainers ? (
        designatableWorkers.length === 0 ? (
          <p className="text-xs text-[var(--color-ink-500)]">
            No other roster workers are linked to a WashLink account. Share a roster link code from My team first.
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Select
                id={`training-trainer-${program.id}`}
                label="Add a trainer from your roster"
                value={selectedRosterWorkerId}
                options={[
                  { value: '', label: 'Choose a linked worker' },
                  ...designatableWorkers.map((rosterWorker) => ({ value: rosterWorker.workerIdentifier, label: rosterWorker.workerName })),
                ]}
                onChange={(changeEvent): void => { setSelectedRosterWorkerId(changeEvent.target.value) }}
              />
            </div>
            <Button size="sm" leadingIcon={<UserPlus className="h-4 w-4" />} disabled={selectedWorker === null} isLoading={isTrainerActionPending}
              onClick={(): void => {
                if (selectedWorker !== null) {
                  void designateTrainer(selectedWorker).then((didDesignate) => {
                    if (didDesignate) {
                      setSelectedRosterWorkerId('')
                    }
                  })
                }
              }}>
              Add trainer
            </Button>
          </div>
        )
      ) : null}

      <TrainingConfirmModal
        isOpen={trainerToRevoke !== null}
        title="End this trainer role?"
        subjectText={trainerToRevoke?.displayName ?? ''}
        message="They can no longer record training for this program. Records they made stay. This cannot be undone; you can designate them again later."
        confirmButtonLabel="End trainer role"
        isDestructive
        isSubmitting={isTrainerActionPending}
        onConfirm={(): void => {
          if (trainerToRevoke !== null) {
            void revokeTrainer(trainerToRevoke).then(() => { setTrainerToRevoke(null) })
          }
        }}
        onCancel={(): void => { setTrainerToRevoke(null) }}
      />
    </section>
  )
}
