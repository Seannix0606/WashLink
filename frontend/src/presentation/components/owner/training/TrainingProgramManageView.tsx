import type { ReactElement } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { TrainingProgram } from '../../../../domain/models/TrainingProgram'
import type { TrainingSession } from '../../../../domain/models/TrainingSession'
import type { Worker } from '../../../../domain/models/Worker'
import type { TrainingDependencies } from '../../../dependencyInjection/createTrainingDependencies'
import { Badge, Button } from '../../../design/ui'
import { describeTrainingProgramStatus } from '../../../utilities/trainingDisplay'
import { TrainingVersusPaidWorkNote } from '../../training/TrainingNotices'
import { TrainingRosterPanel } from '../../training/TrainingRosterPanel'
import { TrainingSessionsEditor } from './TrainingSessionsEditor'
import { TrainingTrainersSection } from './TrainingTrainersSection'

interface TrainingProgramManageViewProps {
  readonly trainingDependencies: TrainingDependencies
  readonly program: TrainingProgram
  readonly shopName: string
  readonly sessions: readonly TrainingSession[]
  readonly rosterWorkers: readonly Worker[]
  readonly onScheduleChanged: () => void
  readonly onBack: () => void
}

/** One program: training days, trainers and trainees (attendance and assessment). */
export function TrainingProgramManageView({
  trainingDependencies,
  program,
  shopName,
  sessions,
  rosterWorkers,
  onScheduleChanged,
  onBack,
}: TrainingProgramManageViewProps): ReactElement {
  const statusDisplay = describeTrainingProgramStatus(program.status)
  return (
    <section aria-label={`Manage ${program.title}`} className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold break-words text-[var(--color-ink-900)]">{program.title}</h3>
          <p className="text-xs break-words text-[var(--color-ink-500)]">{shopName}</p>
          <Badge tone={statusDisplay.badgeTone}>{statusDisplay.displayLabel}</Badge>
        </div>
        <Button size="sm" variant="ghost" leadingIcon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>
          Back to training programs
        </Button>
      </div>
      <TrainingVersusPaidWorkNote />
      <TrainingSessionsEditor
        trainingProgramService={trainingDependencies.trainingProgramService}
        program={program}
        onScheduleChanged={onScheduleChanged}
      />
      <TrainingTrainersSection
        trainingProgramService={trainingDependencies.trainingProgramService}
        program={program}
        rosterWorkers={rosterWorkers}
      />
      {program.status === 'draft' ? (
        <p className="text-sm text-[var(--color-ink-500)]">Trainees can be invited once the program is open.</p>
      ) : (
        <TrainingRosterPanel
          trainingEnrollmentService={trainingDependencies.trainingEnrollmentService}
          trainingEvidenceService={trainingDependencies.trainingEvidenceService}
          program={program}
          sessions={sessions}
          isOwnerView
        />
      )}
    </section>
  )
}
