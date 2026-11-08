import type { ReactElement } from 'react'
import type { TrainingProgramContent } from '../../../domain/models/TrainingProgram'
import {
  formatReimbursementAsEntered,
  formatTrainingPayAsEntered,
  trainingFeeLine,
  trainingPayDisclaimer,
} from '../../utilities/trainingDisplay'

type TrainingPayAndFeeContent = Pick<
  TrainingProgramContent,
  'trainingPayAmount' | 'trainingPayCurrency' | 'trainingPayPeriod' | 'trainingPayDetails' | 'reimbursementDetails'
>

interface TrainingPayAndFeeViewProps {
  readonly payContent: TrainingPayAndFeeContent
}

/** "No fee" always; optional pay and reimbursement exactly as entered, never defaulted. */
export function TrainingPayAndFeeView({ payContent }: TrainingPayAndFeeViewProps): ReactElement {
  return (
    <dl className="space-y-2 text-sm">
      <div>
        <dt className="text-xs font-medium text-[var(--color-ink-500)]">Training fee</dt>
        <dd className="font-medium text-[var(--color-ink-900)]">{trainingFeeLine}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-[var(--color-ink-500)]">Training pay</dt>
        {formatTrainingPayAsEntered(payContent).map((payLine) => (
          <dd key={payLine} className="break-words whitespace-pre-line text-[var(--color-ink-900)]">
            {payLine}
          </dd>
        ))}
      </div>
      <div>
        <dt className="text-xs font-medium text-[var(--color-ink-500)]">Reimbursement</dt>
        <dd className="break-words whitespace-pre-line text-[var(--color-ink-900)]">
          {formatReimbursementAsEntered(payContent.reimbursementDetails)}
        </dd>
      </div>
      <p className="text-xs text-[var(--color-ink-500)]">{trainingPayDisclaimer}</p>
    </dl>
  )
}
