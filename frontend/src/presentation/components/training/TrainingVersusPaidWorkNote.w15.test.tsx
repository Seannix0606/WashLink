import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildShop } from '../../../test/fixtures'
import { buildMyTraining, buildTrainingProgram, createTrainingTestHarness } from '../../../test/trainingFixtures'
import { shopTrainingVersusPaidWorkText, trainingVersusPaidWorkText } from '../../utilities/trainingNoticeCopy'
import { OwnerTrainingProgramsPanel } from '../owner/training/OwnerTrainingProgramsPanel'
import { TrainingProgramEditorModal } from '../owner/training/TrainingProgramEditorModal'
import { TrainingProgramManageView } from '../owner/training/TrainingProgramManageView'
import { MyTrainingsPanel } from '../worker/training/MyTrainingsPanel'
import { TrainerProgramsPanel } from '../worker/training/TrainerProgramsPanel'
import { TrainingInvitationDetail } from '../worker/training/TrainingInvitationDetail'
import { TrainingProgramDetailsView } from './TrainingProgramDetailsView'

// W15 fix cycle 1 (C-SF-1, W15-L2): owner and trainer views show the shop-side rule; trainee views keep the D-81 text.
function expectShopNoteOnly(container: HTMLElement): void {
  expect(within(container).getAllByText(shopTrainingVersusPaidWorkText).length).toBeGreaterThan(0)
  expect(within(container).queryByText(trainingVersusPaidWorkText)).toBeNull()
}

function expectTraineeNoteOnly(container: HTMLElement): void {
  expect(within(container).getAllByText(trainingVersusPaidWorkText).length).toBeGreaterThan(0)
  expect(within(container).queryByText(shopTrainingVersusPaidWorkText)).toBeNull()
}

describe('Training vs productive work note by audience (W15 fix cycle 1)', () => {
  it('w15_shop_note_states_the_rule_without_second_person_or_detection_limits', () => {
    expect(shopTrainingVersusPaidWorkText).toContain('Training is not productive work for customers.')
    expect(shopTrainingVersusPaidWorkText).toContain("may not assign trainees to that owner's customer bookings")
    expect(shopTrainingVersusPaidWorkText).not.toMatch(/\byou(r)?\b/i)
    expect(shopTrainingVersusPaidWorkText).not.toMatch(/cannot detect|never linked|outside WashLink/i)
    expect(shopTrainingVersusPaidWorkText.toLowerCase()).not.toMatch(/not paid work|unpaid/)
  })

  it('w15_owner_programs_panel_and_preview_show_shop_note', async () => {
    const user = userEvent.setup()
    const harness = createTrainingTestHarness()
    harness.programRepository.listOwnPrograms.mockResolvedValue([buildTrainingProgram({ status: 'open' })])
    render(<OwnerTrainingProgramsPanel trainingDependencies={harness.trainingDependencies} ownerShopList={[buildShop()]} rosterWorkers={[]} />)
    expectShopNoteOnly(document.body)
    await user.click(await screen.findByRole('button', { name: 'View details' }))
    expectShopNoteOnly(screen.getByRole('dialog'))
  })

  it('w15_owner_manage_view_shows_shop_note', () => {
    const harness = createTrainingTestHarness()
    const { container } = render(
      <TrainingProgramManageView trainingDependencies={harness.trainingDependencies} program={buildTrainingProgram({ status: 'open' })}
        shopName="Test Shop" sessions={[]} rosterWorkers={[]} onScheduleChanged={vi.fn()} onBack={vi.fn()} />,
    )
    expectShopNoteOnly(container)
  })

  it('w15_owner_editor_preview_shows_shop_note', async () => {
    const user = userEvent.setup()
    render(<TrainingProgramEditorModal program={null} initialShopId={buildShop().id} ownerShopList={[buildShop()]} onSave={vi.fn()} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expectShopNoteOnly(screen.getByRole('dialog'))
  })

  it('w15_trainer_panel_shows_shop_note', () => {
    const { container } = render(
      <TrainerProgramsPanel trainingDependencies={createTrainingTestHarness().trainingDependencies} designatedPrograms={[]}
        isLoadingDesignatedPrograms={false} designatedProgramsErrorMessage={null} onRetry={vi.fn()} />,
    )
    expectShopNoteOnly(container)
  })

  it('w15_trainee_views_keep_the_d81_text', async () => {
    const harness = createTrainingTestHarness()
    const { container, unmount } = render(<MyTrainingsPanel trainingDependencies={harness.trainingDependencies} />)
    expect(await screen.findByText('Not enrolled')).toBeInTheDocument()
    expectTraineeNoteOnly(container)
    unmount()

    const invitation = render(
      <TrainingInvitationDetail trainingEnrollmentService={harness.trainingDependencies.trainingEnrollmentService} myTraining={buildMyTraining()}
        isDeclinePending={false} refreshTrainings={vi.fn()} onDeclineRequested={vi.fn()} onAccepted={vi.fn()} />,
    )
    expectTraineeNoteOnly(invitation.container)
    invitation.unmount()

    const details = render(<TrainingProgramDetailsView content={buildTrainingProgram()} shopName="Test Shop" />)
    expectTraineeNoteOnly(details.container)
  })
})
