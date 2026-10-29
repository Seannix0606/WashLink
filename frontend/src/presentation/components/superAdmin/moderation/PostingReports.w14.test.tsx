import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminModerationCase } from '../../../../domain/models/JobOpeningModeration'
import {
  buildAdminCase,
  buildQueueItem,
  createModerationTestHarness,
  testModerationCaseIdentifier,
  validAdminNote,
  validOwnerMessage,
} from '../../../../test/moderationFixtures'
import { PostingReportCaseDrawer } from './PostingReportCaseDrawer'
import { PostingReportQueuePanel } from './PostingReportQueuePanel'

const toastDouble = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastDouble, Toaster: (): null => null }))

function renderDrawer(moderationCase: AdminModerationCase): ReturnType<typeof createModerationTestHarness> {
  const harness = createModerationTestHarness()
  harness.moderationRepository.fetchAdminCase.mockResolvedValue(moderationCase)
  render(
    <PostingReportCaseDrawer
      moderationService={harness.jobOpeningModerationService}
      caseId={testModerationCaseIdentifier}
      onClose={vi.fn()}
      onDecided={vi.fn().mockResolvedValue(undefined)}
    />,
  )
  return harness
}

function actionOptionValues(form: HTMLElement): string[] {
  return within(form)
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value)
    .filter((value) => ['dismiss', 'pause', 'close', 'keep_paused', 'lift'].includes(value))
}

describe('Super_admin posting reports (W14)', () => {
  beforeEach(() => {
    toastDouble.success.mockClear()
    toastDouble.error.mockClear()
  })

  it('w14_admin_posting_queue_and_case_drawer', async () => {
    const user = userEvent.setup()
    const harness = createModerationTestHarness()
    harness.moderationRepository.listAdminQueue.mockResolvedValue([buildQueueItem()])
    render(<PostingReportQueuePanel moderationService={harness.jobOpeningModerationService} />)

    const queueList = await screen.findByRole('list', { name: 'Posting report cases' })
    expect(harness.moderationRepository.listAdminQueue).toHaveBeenCalledWith('active')
    expect(queueList).toHaveTextContent('Age requirement, Asks workers for a fee or deposit · 2 open of 2 reports')
    // The queue carries no statements; the case is not read until it is opened.
    expect(queueList).not.toHaveTextContent('uniform deposit')
    expect(harness.moderationRepository.fetchAdminCase).not.toHaveBeenCalled()

    await user.click(within(queueList).getByRole('button', { name: /Open the case/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Posting report' })
    expect(await within(dialog).findByText('Opening this case is recorded in the audit log.')).toBeInTheDocument()
    const reports = within(dialog).getByRole('list', { name: 'Reports' })
    expect(reports).toHaveTextContent('Reporter 1 · Asks workers for a fee or deposit')
    expect(reports).toHaveTextContent('Reporter 2 · Age requirement')
    expect(reports).toHaveTextContent('uniform deposit')
    // Audited read: once per opening, never polled.
    expect(harness.moderationRepository.fetchAdminCase).toHaveBeenCalledTimes(1)
    expect(harness.moderationRepository.fetchAdminCase).toHaveBeenCalledWith(testModerationCaseIdentifier)

    await user.selectOptions(screen.getByLabelText('Show'), 'closed_by_washlink')
    await waitFor(() => {
      expect(harness.moderationRepository.listAdminQueue).toHaveBeenLastCalledWith('closed_by_washlink')
    })
  })

  it('w14_moderate_form_requires_reason_and_message', async () => {
    const user = userEvent.setup()
    const harness = renderDrawer(buildAdminCase('open'))
    harness.moderationRepository.moderate.mockResolvedValue({
      caseId: testModerationCaseIdentifier,
      status: 'paused_by_washlink',
      revision: 5,
      statusChangedAt: '2026-10-29T02:00:00Z',
    })
    const form = await screen.findByRole('form', { name: 'Decide this case' })

    await user.click(within(form).getByRole('button', { name: 'Record decision' }))
    expect(within(form).getByText('Choose a moderation action.')).toBeInTheDocument()

    await user.selectOptions(within(form).getByLabelText(/^Action/), 'pause')
    await user.click(within(form).getByRole('button', { name: 'Record decision' }))
    expect(within(form).getByText('Choose a reason for this action.')).toBeInTheDocument()
    expect(within(form).getByText('Write a message to the owner of 20 to 500 characters.')).toBeInTheDocument()

    // Dismiss needs an internal note instead.
    await user.selectOptions(within(form).getByLabelText(/^Action/), 'dismiss')
    await user.click(within(form).getByRole('button', { name: 'Record decision' }))
    expect(within(form).getByText('Write an internal note of 20 to 1000 characters.')).toBeInTheDocument()
    expect(harness.moderationRepository.moderate).not.toHaveBeenCalled()

    await user.selectOptions(within(form).getByLabelText(/^Action/), 'pause')
    await user.selectOptions(within(form).getByLabelText(/Reason shown to the owner/), 'worker_fee_or_deposit')
    await user.click(within(form).getByLabelText(/Message to the owner/))
    await user.paste(validOwnerMessage)
    await user.clear(within(form).getByLabelText(/Internal note/))
    await user.click(within(form).getByRole('button', { name: 'Record decision' }))
    await waitFor(() => {
      expect(harness.moderationRepository.moderate).toHaveBeenCalledWith({
        caseId: testModerationCaseIdentifier,
        expectedRevision: 4,
        action: 'pause',
        reasonKind: 'worker_fee_or_deposit',
        ownerMessage: validOwnerMessage,
        adminNote: null,
      })
    })
    // The case is read again once after the action (a new audited read).
    await waitFor(() => {
      expect(harness.moderationRepository.fetchAdminCase).toHaveBeenCalledTimes(2)
    })
    expect(toastDouble.success).toHaveBeenCalledWith('The opening was paused. The owner can read why.')

    // A 55000 answer is reported as "changed", never as success.
    harness.moderationRepository.moderate.mockRejectedValueOnce(new Error('This case changed. Refresh and try again.'))
    const formAgain = await screen.findByRole('form', { name: 'Decide this case' })
    await user.selectOptions(within(formAgain).getByLabelText(/^Action/), 'dismiss')
    await user.click(within(formAgain).getByLabelText(/Internal note/))
    await user.paste(validAdminNote)
    await user.click(within(formAgain).getByRole('button', { name: 'Record decision' }))
    await waitFor(() => {
      expect(toastDouble.error).toHaveBeenCalledWith('This case changed. Refresh and try again. It was reloaded.')
    })
  })

  it('w14_decide_changes_form_actions_by_status', async () => {
    renderDrawer(buildAdminCase('changes_submitted'))
    const changesForm = await screen.findByRole('form', { name: 'Decide the owner’s changes' })
    expect(actionOptionValues(changesForm)).toEqual(['keep_paused', 'lift', 'close'])
    expect(screen.getByText('Owner’s note: Removed the deposit line.')).toBeInTheDocument()
    cleanup()

    renderDrawer(buildAdminCase('open'))
    expect(actionOptionValues(await screen.findByRole('form', { name: 'Decide this case' }))).toEqual(['dismiss', 'pause', 'close'])
    cleanup()

    renderDrawer(buildAdminCase('paused_by_washlink'))
    expect(actionOptionValues(await screen.findByRole('form', { name: 'Decide this case' }))).toEqual(['lift', 'close'])
    cleanup()

    // The opening is gone: only dismiss remains (D4).
    renderDrawer(buildAdminCase('paused_by_washlink', { opening: null }))
    expect(actionOptionValues(await screen.findByRole('form', { name: 'Decide this case' }))).toEqual(['dismiss'])
    expect(screen.getByText('The job opening no longer exists. Only dismiss is available.')).toBeInTheDocument()
    cleanup()

    // A decided case has no form; WashLink never edits, archives or deletes an opening.
    renderDrawer(buildAdminCase('closed_by_washlink'))
    expect(await screen.findByText('Opening this case is recorded in the audit log.')).toBeInTheDocument()
    expect(screen.queryByRole('form')).toBeNull()
    expect(screen.queryByRole('button', { name: /edit|archive|delete|publish/i })).toBeNull()
  })
})
