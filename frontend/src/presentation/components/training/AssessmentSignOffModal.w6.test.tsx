import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AssessmentSignOffModal } from './AssessmentSignOffModal'

describe('Assessment sign-off (W6)', () => {
  it('w6_assessment_copy_never_says_signature_or_certificate', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(
      <AssessmentSignOffModal
        isOpen
        traineeName="Test Trainee"
        checklist={['Pre-rinses the whole car', 'Uses two buckets']}
        isCorrection={false}
        isSubmitting={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Record the assessment' })
    // The only mention is the disclaimer that it is neither.
    expect(screen.getByRole('note')).toHaveTextContent('This records your assessment decision. It is not a certificate or a signature.')
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('heading')]) {
      expect(control.textContent.toLowerCase()).not.toMatch(/signature|certificat|sign here|e-sign/)
    }
    const dialogTextWithoutNotice = dialog.textContent.replace(screen.getByRole('note').textContent, '')
    expect(dialogTextWithoutNotice.toLowerCase()).not.toMatch(/signature|certificat/)

    // Passed is available only when every checklist item is met.
    const passedOption = screen.getByRole('radio', { name: 'Passed' })
    expect(passedOption).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Pre-rinses the whole car' }))
    expect(passedOption).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Uses two buckets' }))
    expect(passedOption).toBeEnabled()
    await user.click(passedOption)
    await user.click(screen.getByRole('button', { name: 'Record assessment' }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ itemsMet: [true, true], result: 'passed', assessorComment: '', failureReason: null, correctionReason: null })
    })
  })

  it('w6_polish_failed_assessment_requires_a_reason_of_10_to_300_characters', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(
      <AssessmentSignOffModal
        isOpen
        traineeName="Test Trainee"
        checklist={['Pre-rinses the whole car', 'Uses two buckets']}
        isCorrection={false}
        isSubmitting={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('checkbox', { name: 'Pre-rinses the whole car' }))
    await user.click(screen.getByRole('radio', { name: 'Not passed' }))
    const reasonField = screen.getByLabelText('Reason for not passing (required, 10 to 300 characters)')
    expect(screen.getByLabelText('Comment (optional)')).toBeInTheDocument()

    // Missing and too short reasons are refused before any request.
    await user.click(screen.getByRole('button', { name: 'Record assessment' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Give a reason for the fail of 10 to 300 characters.')
    await user.type(reasonField, 'Too short')
    await user.click(screen.getByRole('button', { name: 'Record assessment' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Give a reason for the fail of 10 to 300 characters.')
    expect(onSubmit).not.toHaveBeenCalled()

    await user.clear(reasonField)
    await user.type(reasonField, '  Skipped the second bucket rinse.  ')
    await user.click(screen.getByRole('button', { name: 'Record assessment' }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        itemsMet: [true, false],
        result: 'failed',
        assessorComment: '',
        failureReason: 'Skipped the second bucket rinse.',
        correctionReason: null,
      })
    })
  })
})
