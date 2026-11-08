import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildShop } from '../../../../test/fixtures'
import { TrainingProgramEditorModal } from './TrainingProgramEditorModal'

const warningText = /Training must be free for workers\. Check that these terms do not ask workers to pay, deposit, or repay anything\./

describe('Training terms fee-like wording warning (W6 review polish)', () => {
  it('w6_polish_fee_like_terms_show_a_non_blocking_warning', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(true)
    render(
      <TrainingProgramEditorModal program={null} initialShopId={buildShop().id} ownerShopList={[buildShop()]} onSave={onSave} onClose={vi.fn()} />,
    )
    const form = screen.getByRole('form', { name: 'New training program' })
    expect(within(form).queryByText(warningText)).toBeNull()

    await user.type(within(form).getByLabelText(/Program title/), 'Hand wash basics')
    await user.type(within(form).getByLabelText(/Required training days/), '3')
    await user.type(within(form).getByLabelText('Training terms (needed to open)'), 'A DEPOSIT is returned after day 3.')
    await user.type(within(form).getByLabelText(/Reimbursement details/), 'May kaltas kung umalis.')
    const warning = within(form).getByRole('status')
    expect(warning).toHaveTextContent(warningText)
    expect(warning).toHaveTextContent('Words to check: deposit, kaltas.')
    expect(warning.textContent.toLowerCase()).not.toMatch(/legal|compliant|valid/)

    // The warning never blocks saving the draft.
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})
