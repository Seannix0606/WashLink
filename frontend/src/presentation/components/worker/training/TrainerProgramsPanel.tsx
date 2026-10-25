import type { ReactElement } from 'react'
import { useCallback, useState } from 'react'
import { ArrowLeft, ClipboardList } from 'lucide-react'
import type { TrainingProgram } from '../../../../domain/models/TrainingProgram'
import type { TrainingSession } from '../../../../domain/models/TrainingSession'
import type { DesignatedTrainingProgram } from '../../../../domain/models/TrainingTrainer'
import type { TrainingDependencies } from '../../../dependencyInjection/createTrainingDependencies'
import { Button, Card, EmptyState, Skeleton } from '../../../design/ui'
import { useLatestResource } from '../../../hooks/useLatestResource'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { TrainingVersusPaidWorkNote } from '../../training/TrainingNotices'
import { TrainingRosterPanel } from '../../training/TrainingRosterPanel'

interface TrainerProgramsPanelProps {
  readonly trainingDependencies: TrainingDependencies
  readonly designatedPrograms: readonly DesignatedTrainingProgram[]
  readonly isLoadingDesignatedPrograms: boolean
  readonly designatedProgramsErrorMessage: string | null
  readonly onRetry: () => void
}

const noSessions: readonly TrainingSession[] = []

function TrainerProgramView({ trainingDependencies, program, onBack }: {
  readonly trainingDependencies: TrainingDependencies
  readonly program: TrainingProgram
  readonly onBack: () => void
}): ReactElement {
  const { trainingProgramService } = trainingDependencies
  const loadSessions = useCallback(async (): Promise<readonly TrainingSession[]> => trainingProgramService.listSessions([program.id]), [program.id, trainingProgramService])
  const { resource: sessions, isLoading, errorMessage, reload } = useLatestResource({
    load: loadSessions,
    initialResource: noSessions,
    loadFailedMessage: 'Could not load the training days.',
  })
  return (
    <section aria-label={`Training I run: ${program.title}`} className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="text-base font-semibold break-words text-[var(--color-ink-900)]">{program.title}</h3>
        <Button size="sm" variant="ghost" leadingIcon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>
          Back to my programs
        </Button>
      </div>
      {isLoading ? (
        <Skeleton heightClassName="h-24" />
      ) : errorMessage !== null ? (
        <LoadErrorNotice title="Training days could not be loaded" errorMessage={errorMessage} onRetry={(): void => { void reload() }} />
      ) : (
        <TrainingRosterPanel
          trainingEnrollmentService={trainingDependencies.trainingEnrollmentService}
          trainingEvidenceService={trainingDependencies.trainingEvidenceService}
          program={program}
          sessions={sessions}
          isOwnerView={false}
        />
      )}
    </section>
  )
}

/** Programs the worker is a designated trainer for; only those are listed (D-16). */
export function TrainerProgramsPanel({
  trainingDependencies,
  designatedPrograms,
  isLoadingDesignatedPrograms,
  designatedProgramsErrorMessage,
  onRetry,
}: TrainerProgramsPanelProps): ReactElement {
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null)
  const selectedProgram = designatedPrograms.find(({ program }) => program.id === selectedProgramId)?.program ?? null

  return (
    <Card elevation="raised" className="space-y-4">
      <header>
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <ClipboardList className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          Training I run
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">
          The shop owner made you a trainer for these programs. You can record attendance and assessments.
        </p>
      </header>
      <TrainingVersusPaidWorkNote />
      {selectedProgram !== null ? (
        <TrainerProgramView key={selectedProgram.id} trainingDependencies={trainingDependencies} program={selectedProgram}
          onBack={(): void => { setSelectedProgramId(null) }} />
      ) : isLoadingDesignatedPrograms ? (
        <Skeleton heightClassName="h-20" />
      ) : designatedProgramsErrorMessage !== null ? (
        <LoadErrorNotice title="Programs could not be loaded" errorMessage={designatedProgramsErrorMessage} onRetry={onRetry} />
      ) : designatedPrograms.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No programs to run" description="You are not a trainer for any program right now." />
      ) : (
        <ul aria-label="Programs I train for" className="space-y-2">
          {designatedPrograms.map(({ designationId, program }) => (
            <li key={designationId} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3">
              <span className="text-sm font-medium break-words text-[var(--color-ink-900)]">{program.title}</span>
              <Button size="sm" variant="secondary" onClick={(): void => { setSelectedProgramId(program.id) }}>
                Open trainees
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
