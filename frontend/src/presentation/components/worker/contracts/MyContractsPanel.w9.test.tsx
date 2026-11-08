import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { workerContractActions } from '../../../../domain/utilities/workerContractActions'
import { buildOpeningSnapshot } from '../../../../test/jobApplicationFixtures'
import {
  buildMyContract,
  buildMyContractWithAmendment,
  createWorkerContractTestHarness,
  testContractIdentifier,
  type WorkerContractTestHarness,
} from '../../../../test/workerContractFixtures'
import { MyContractsPanel } from './MyContractsPanel'

function renderPanel(harness: WorkerContractTestHarness): ReturnType<typeof render> {
  return render(
    <MyContractsPanel
      workerContractDependencies={{ workerContractService: harness.workerContractService, workerContractResponseService: harness.workerContractResponseService }}
    />,
  )
}

describe('Worker contracts panel (W9)', () => {
  it('w9_worker_decline_and_terminate_always_available', async () => {
    const user = userEvent.setup()
    // Decline and terminate do not depend on the shop, its verification or the server hint.
    const shopGoneOffer = buildMyContract({ isShopRemoved: true, isOwnerRemoved: true, shopId: null, allowedActions: [] })
    expect(workerContractActions(shopGoneOffer)).toEqual(['decline'])
    expect(workerContractActions(buildMyContractWithAmendment({ allowedActions: [] }))).toEqual(['decline_amendment', 'terminate'])
    expect(workerContractActions(buildMyContract({ status: 'accepted', effectiveStatus: 'accepted', pendingVersionId: null, allowedActions: [] }))).toEqual(['terminate'])

    // Even when the offer text cannot be loaded, Decline stays available and Accept is not offered.
    const harness = createWorkerContractTestHarness([], [buildMyContract({ isShopRemoved: true, shopId: null, allowedActions: ['decline'] })])
    harness.repository.fetchVersionDocument.mockRejectedValue(new Error('Could not load the contract text.'))
    const { unmount } = renderPanel(harness)
    await user.click(await screen.findByRole('button', { name: 'Open the contract with Test Wash Bay' }))
    expect(await screen.findByText('The contract text could not be loaded')).toBeInTheDocument()
    expect(screen.getByText('This shop is no longer on WashLink, so this offer can only be declined.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decline offer' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /^Accept/ })).toBeNull()
    unmount()

    // An active contract can always be ended by the worker, with a reason of 10 to 500 characters.
    const activeHarness = createWorkerContractTestHarness([], [
      buildMyContract({ status: 'active', effectiveStatus: 'active', revision: 9, pendingVersionId: null, pendingVersionNumber: null, pendingVersionKind: null, allowedActions: [] }),
    ])
    activeHarness.actionRepository.terminate.mockResolvedValue({ contractId: testContractIdentifier, status: 'terminated', revision: 10 })
    renderPanel(activeHarness)
    await user.click(await screen.findByRole('button', { name: 'Open the contract with Test Wash Bay' }))
    await user.click(await screen.findByRole('button', { name: 'End contract' }))
    const dialog = await screen.findByRole('dialog', { name: 'End this contract' })
    expect(dialog).toHaveTextContent('You can record the end of this contract on WashLink at any time.')
    await user.type(within(dialog).getByRole('textbox'), 'Too short')
    await user.click(within(dialog).getByRole('button', { name: 'End contract' }))
    expect(within(dialog).getByText('Give a reason of 10 to 500 characters.')).toBeInTheDocument()
    expect(activeHarness.actionRepository.terminate).not.toHaveBeenCalled()
    await user.type(within(dialog).getByRole('textbox'), ' for me now.')
    await user.click(within(dialog).getByRole('button', { name: 'End contract' }))
    expect(activeHarness.actionRepository.terminate).toHaveBeenCalledWith(testContractIdentifier, 9, 'Too short for me now.')
  })

  it('w9_contract_lists_loading_empty_error_states', async () => {
    const user = userEvent.setup()
    const emptyHarness = createWorkerContractTestHarness([], [])
    const { unmount } = renderPanel(emptyHarness)
    expect(screen.getByLabelText('Loading your contracts')).toBeInTheDocument()
    expect(await screen.findByText('No contract offers')).toBeInTheDocument()
    expect(screen.getByText('When a shop sends you a contract to review, it appears here.')).toBeInTheDocument()
    unmount()

    const errorHarness = createWorkerContractTestHarness([], [buildMyContract()])
    errorHarness.repository.listMyContracts.mockRejectedValueOnce(new Error('Could not load your contracts.')).mockResolvedValue([buildMyContract()])
    renderPanel(errorHarness)
    expect(await screen.findByText('Your contracts could not be loaded')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    const list = await screen.findByRole('list', { name: 'My contracts' })
    expect(within(list).getByRole('listitem', { name: 'Contract with Test Wash Bay' })).toHaveTextContent('Waiting for your answer')
  })

  it('w9_retained_application_records_listed', async () => {
    const user = userEvent.setup()
    const harness = createWorkerContractTestHarness([], [])
    harness.repository.listRetainedApplicationRecords.mockResolvedValue([
      {
        recordId: 'r9r9r9r9-0000-4000-8000-000000000001',
        applicationId: 'r9r9r9r9-0000-4000-8000-000000000002',
        openingSnapshot: buildOpeningSnapshot({ title: 'Car wash attendant', shopName: 'Closed Test Shop' }),
        status: 'accepted',
        submittedAt: '2026-10-20T02:00:00Z',
        decidedAt: '2026-10-21T02:00:00Z',
        removedAt: '2026-10-25T02:00:00Z',
        removalReason: 'shop_or_owner_removed',
      },
    ])
    renderPanel(harness)
    const records = await screen.findByRole('list', { name: 'Kept application records' })
    const record = within(records).getByRole('listitem', { name: 'Car wash attendant' })
    expect(record).toHaveTextContent('Closed Test Shop · Accepted')
    const summary = record.querySelector('summary')
    expect(summary).not.toBeNull()
    if (summary !== null) {
      await user.click(summary)
    }
    expect(within(record).getByRole('article', { name: 'What you applied to' })).toHaveTextContent('Car wash attendant')
  })
})
