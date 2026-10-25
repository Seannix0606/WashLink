import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildTrainingProgram, createTrainingTestHarness } from '../../../../test/trainingFixtures'
import { ownerAttestationText } from '../../../utilities/trainingNoticeCopy'
import { OpenTrainingProgramConfirmModal } from './OpenTrainingProgramConfirmModal'

describe('Open training program (W6 owner attestation)', () => {
  it('w6_open_program_modal_requires_attestation', async () => {
    const user = userEvent.setup()
    const draftProgram = buildTrainingProgram({ status: 'draft', ownerAttestationVersion: null })
    const onConfirm = vi.fn()
    render(<OpenTrainingProgramConfirmModal program={draftProgram} isSubmitting={false} onConfirm={onConfirm} onCancel={vi.fn()} />)

    expect(screen.getByText(ownerAttestationText)).toBeInTheDocument()
    expect(screen.getByText(/It is not a signature and not a WashLink compliance statement\./)).toBeInTheDocument()
    const openButton = screen.getByRole('button', { name: 'Open program' })
    expect(openButton).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'I confirm the statement above for this program.' }))
    await user.click(openButton)
    expect(onConfirm).toHaveBeenCalledWith(draftProgram, true)

    // The service sends the attestation version only when opening, and refuses without it.
    const harness = createTrainingTestHarness()
    harness.programRepository.transition.mockResolvedValue(buildTrainingProgram())
    const { trainingProgramService } = harness.trainingDependencies
    await expect(trainingProgramService.transition(draftProgram, 'open', false)).rejects.toThrow(
      'Confirm the free-training statement before opening.',
    )
    await trainingProgramService.transition(draftProgram, 'open', true)
    await trainingProgramService.transition(buildTrainingProgram({ status: 'open' }), 'closed', false)
    await waitFor(() => {
      expect(harness.programRepository.transition.mock.calls).toEqual([
        [draftProgram.id, 'draft', 'open', 'w6_owner_v1'],
        [draftProgram.id, 'open', 'closed', null],
      ])
    })
  })
})
