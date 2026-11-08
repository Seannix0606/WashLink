import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildTrainingProgram } from '../../../test/trainingFixtures'
import { TrainingPayAndFeeView } from './TrainingPayAndFeeView'

describe('Training pay and fee (J7)', () => {
  it('j7_training_display_shows_no_fee_and_pay_as_entered', () => {
    const { unmount } = render(
      <TrainingPayAndFeeView
        payContent={buildTrainingProgram({
          trainingPayAmount: 450.5,
          trainingPayCurrency: 'PHP',
          trainingPayPeriod: 'day',
          trainingPayDetails: 'Paid every Friday',
          reimbursementDetails: 'Jeepney fare both ways',
        })}
      />,
    )
    expect(screen.getByText('Training fee: none. Required initial training is free for you.')).toBeInTheDocument()
    expect(screen.getByText('PHP 450.50 per training day')).toBeInTheDocument()
    expect(screen.getByText('Paid every Friday')).toBeInTheDocument()
    expect(screen.getByText('Jeepney fare both ways')).toBeInTheDocument()
    expect(screen.getByText('As entered by the shop. WashLink does not verify pay.')).toBeInTheDocument()
    unmount()

    // Nothing entered: nothing is invented, and the fee is still "none".
    render(<TrainingPayAndFeeView payContent={buildTrainingProgram()} />)
    expect(screen.getAllByText('Not specified by the shop')).toHaveLength(2)
    expect(screen.getByText('Training fee: none. Required initial training is free for you.')).toBeInTheDocument()
    expect(screen.queryByText(/PHP/)).toBeNull()
  })
})
