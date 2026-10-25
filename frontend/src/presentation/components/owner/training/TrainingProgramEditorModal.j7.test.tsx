import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildShop } from '../../../../test/fixtures'
import { TrainingProgramEditorModal } from './TrainingProgramEditorModal'

describe('Training program editor (J7)', () => {
  it('j7_program_editor_has_no_fee_input', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(true)
    render(
      <TrainingProgramEditorModal program={null} initialShopId={buildShop().id} ownerShopList={[buildShop()]} onSave={onSave} onClose={vi.fn()} />,
    )
    const form = screen.getByRole('form', { name: 'New training program' })
    const fieldLabels = within(form)
      .getAllByRole('textbox')
      .concat(within(form).getAllByRole('combobox'))
      .map((field) => field.closest('label, div')?.textContent ?? '')
    expect(fieldLabels.some((fieldLabel) => /fee/i.test(fieldLabel))).toBe(false)
    expect(within(form).queryByLabelText(/fee/i)).toBeNull()
    // Pay and the training days are never pre-filled.
    expect(within(form).getByLabelText('Training pay amount')).toHaveValue('')
    expect(within(form).getByLabelText('Currency')).toHaveValue('')
    expect(within(form).getByLabelText('Pay period')).toHaveValue('')
    expect(within(form).getByLabelText(/Required training days/)).toHaveValue('')
    expect(within(form).getByText(/Training fee: none\./)).toBeInTheDocument()

    // Fewer than 3 distinct days is refused before any request.
    await user.type(within(form).getByLabelText(/Program title/), 'Hand wash basics')
    await user.type(within(form).getByLabelText(/Required training days/), '2')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('Required initial training needs at least 3 distinct days.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })
})
