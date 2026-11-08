import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { testJobOpeningIdentifier } from '../../../../test/fixtures'
import { ApplyToOpeningModal, type ApplyTarget } from './ApplyToOpeningModal'

const applyTarget: ApplyTarget = {
  jobOpeningId: testJobOpeningIdentifier,
  title: 'Car wash attendant',
  shopName: 'Test Shop',
  applicantRequirement: 'trainees_welcome',
  openingRequirements: {
    kind: 'loaded',
    requirements: { minimumQualifications: [], preferredQualifications: [], requiredTraining: null },
  },
  initialCoverNote: '',
}

function renderApplyDialog(hasWorkerProfile = true): HTMLElement {
  render(
    <ApplyToOpeningModal
      applyTarget={applyTarget}
      hasWorkerProfile={hasWorkerProfile}
      isSubmitting={false}
      errorMessage={null}
      onSubmit={vi.fn()}
      onCreateProfileRequested={vi.fn()}
      onClose={vi.fn()}
    />,
  )
  return screen.getByRole('dialog', { name: 'Apply to this job opening' })
}

describe('Apply dialog copy (W5)', () => {
  it('w5_apply_dialog_states_training_is_not_paid_work', () => {
    const dialog = renderApplyDialog()
    const notice = within(dialog).getByRole('region', { name: 'Training and paid work are different' })
    expect(notice).toHaveTextContent(
      'WashLink rule: required initial training for a shop certification lasts at least 3 days and is free for you.',
    )
    expect(notice).toHaveTextContent('A shop may not charge you a training fee or deduct one from your pay.')
    expect(notice).toHaveTextContent('Training and assessment are supervised learning, not productive work for customers.')
    // D-7: training is free to the worker, but a shop may still pay for or reimburse it.
    expect(notice).toHaveTextContent('A shop may still choose to offer pay or reimbursement for training')
    expect(notice).toHaveTextContent('Applying does not enroll you in training, and an accepted application is not a contract.')
    expect(within(dialog).getByText('Optional. Do not include ID numbers, health details or contact details.')).toBeInTheDocument()
  })

  it('w5_apply_dialog_says_contacts_not_shared', () => {
    const dialog = renderApplyDialog()
    expect(within(dialog).getByText(/Your phone and email are not shared with the shop\./)).toBeInTheDocument()
    // The dialog asks for no contact details of its own.
    expect(within(dialog).queryByLabelText(/phone/i)).toBeNull()
    expect(within(dialog).queryByLabelText(/email/i)).toBeNull()
    expect(within(dialog).getAllByRole('textbox')).toHaveLength(1)
  })
})
