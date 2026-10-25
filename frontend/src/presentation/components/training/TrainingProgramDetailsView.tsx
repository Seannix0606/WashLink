import type { ReactElement } from 'react'
import type { TrainingProgramContent } from '../../../domain/models/TrainingProgram'
import { trainingProgramLimits } from '../../../domain/models/TrainingProgram'
import { notSpecifiedByShopText } from '../../utilities/jobOpeningDisplay'
import { TrainingVersusPaidWorkNote } from './TrainingNotices'
import { TrainingPayAndFeeView } from './TrainingPayAndFeeView'

interface TrainingProgramDetailsViewProps {
  readonly content: TrainingProgramContent
  readonly shopName: string
}

function DetailBlock({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div>
      <dt className="text-xs font-medium text-[var(--color-ink-500)]">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-line text-[var(--color-ink-900)]">{value}</dd>
    </div>
  )
}

function listOrNotSpecified(values: readonly string[]): string {
  return values.length === 0 ? notSpecifiedByShopText : values.map((value) => `- ${value}`).join('\n')
}

/** Program details as workers see them; every value exactly as stored or entered. */
export function TrainingProgramDetailsView({ content, shopName }: TrainingProgramDetailsViewProps): ReactElement {
  const hasValidDayCount = content.minTrainingDays >= trainingProgramLimits.minTrainingDaysMinimum
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold break-words text-[var(--color-ink-900)]">
          {content.title.length > 0 ? content.title : 'Untitled program'}
        </h3>
        <p className="text-xs break-words text-[var(--color-ink-500)]">{shopName}</p>
      </div>
      <dl className="space-y-3">
        <DetailBlock label="Objectives" value={content.objectives ?? notSpecifiedByShopText} />
        <DetailBlock label="Skills you will learn" value={listOrNotSpecified(content.skillsToLearn)} />
        <DetailBlock
          label="Required training days"
          value={hasValidDayCount ? `At least ${String(content.minTrainingDays)} distinct days` : 'Not set yet'}
        />
        <DetailBlock label="Assessment checklist" value={listOrNotSpecified(content.assessmentChecklist)} />
        <DetailBlock label="Training terms" value={content.terms ?? notSpecifiedByShopText} />
      </dl>
      <TrainingPayAndFeeView payContent={content} />
      <TrainingVersusPaidWorkNote />
    </div>
  )
}
