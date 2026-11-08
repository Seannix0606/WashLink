import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildJobOpening, buildShop } from '../../../../test/fixtures'
import { JobOpeningEditorModal } from './JobOpeningEditorModal'

const shopWithAddress = buildShop({ name: 'Test Shop', address: '2 Test Avenue, Quezon City' })

function fieldValue(accessibleName: RegExp): string {
  const formField = screen.getByLabelText(accessibleName)
  return (formField as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
}

describe('Job opening editor (W4)', () => {
  it('w4_job_opening_form_has_no_prefilled_compensation_benefits_or_schedule', async () => {
    const user = userEvent.setup()
    render(
      <JobOpeningEditorModal
        jobOpening={null}
        initialShopId={shopWithAddress.id}
        ownerShopList={[shopWithAddress]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    for (const emptyField of [
      /^Minimum pay/, /^Maximum pay/, /^Currency/, /^Pay period/, /^Pay details/, /^Benefits/,
      /^Schedule details/, /^Other terms/, /^Job type/, /^Who can apply/, /^Number of openings/,
      /^Work location/, /^Application deadline/, /^Required training/, /^Minimum years/,
    ]) {
      expect(fieldValue(emptyField)).toBe('')
    }
    // Unselected choices read "Not specified", never a suggested value.
    const currencySelect: HTMLSelectElement = screen.getByLabelText(/^Currency/)
    expect(currencySelect.selectedOptions.item(0)?.textContent).toBe('Not specified')

    // The shop address is copied only when the owner asks for it.
    await user.click(screen.getByRole('button', { name: 'Use shop address' }))
    expect(fieldValue(/^Work location/)).toBe('2 Test Avenue, Quezon City')
  })

  it('w4_job_opening_preview_matches_entered_values', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(true)
    const onClose = vi.fn()
    render(
      <JobOpeningEditorModal
        jobOpening={buildJobOpening({ title: 'Detailer', benefits: null })}
        initialShopId=""
        ownerShopList={[shopWithAddress]}
        onSave={onSave}
        onClose={onClose}
      />,
    )
    await user.clear(screen.getByLabelText(/^Job title/))
    await user.type(screen.getByLabelText(/^Job title/), 'Senior detailer')
    await user.type(screen.getByLabelText(/^Minimum pay/), '650.5')
    await user.type(screen.getByLabelText(/^Maximum pay/), '700')
    await user.selectOptions(screen.getByLabelText(/^Currency/), 'PHP')
    await user.selectOptions(screen.getByLabelText(/^Pay period/), 'day')
    await user.type(screen.getByLabelText(/^Benefits/), '<b>Free lunch</b>')

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    const preview = screen.getByRole('article', { name: 'Job opening preview' })
    expect(screen.getByText('Preview - workers see this after you publish')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Senior detailer' })).toBeInTheDocument()
    expect(screen.getByText('PHP 650.50 - 700.00 per day')).toBeInTheDocument()
    // Owner text is plain text, never HTML.
    expect(screen.getByText('<b>Free lunch</b>')).toBeInTheDocument()
    expect(preview.querySelector('b')).toBeNull()
    expect(screen.getByText('Test Shop')).toBeInTheDocument()
    expect(screen.getByText('Trainees welcome')).toBeInTheDocument()

    // What is saved is what the preview showed.
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    const [savedShopId, savedInput] = onSave.mock.calls[0] as [string, Record<string, unknown>]
    expect(savedShopId).toBe(shopWithAddress.id)
    expect(savedInput).toMatchObject({
      title: 'Senior detailer',
      compensationMinAmount: 650.5,
      compensationMaxAmount: 700,
      compensationCurrency: 'PHP',
      compensationPeriod: 'day',
      benefits: '<b>Free lunch</b>',
      otherTerms: null,
    })
    expect(onClose).toHaveBeenCalled()
  })
})
