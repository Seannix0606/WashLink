import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  buildActiveOwnerContract,
  buildPreview,
  createWorkerContractTestHarness,
  testContractIdentifier,
  testFlagNotices,
} from '../../../../test/workerContractFixtures'
import { ContractProblemTermFlags } from '../../contracts/ContractProblemTermFlags'
import { OwnerWorkerContractsPanel } from './OwnerWorkerContractsPanel'

const staleMessage = 'This contract changed. Reload it and try again.'

describe('Owner worker contracts panel (W9)', () => {
  it('w9_stale_contract_error_reloads', async () => {
    const user = userEvent.setup()
    const acceptedContract = buildActiveOwnerContract({ status: 'accepted', effectiveStatus: 'accepted', activatedAt: null, allowedActions: ['activate', 'amend', 'terminate'] })
    const harness = createWorkerContractTestHarness([acceptedContract])
    harness.actionRepository.activate.mockRejectedValue(new Error(staleMessage))
    const { unmount } = render(<OwnerWorkerContractsPanel workerContractService={harness.workerContractService} />)
    await user.click(await screen.findByRole('button', { name: 'Open the contract with Test Worker' }))
    await user.click(within(await screen.findByRole('group', { name: 'Contract actions' })).getByRole('button', { name: 'Record start' }))
    const listReadsBefore = harness.repository.listOwnerContracts.mock.calls.length
    const dialog = await screen.findByRole('dialog', { name: 'Record the contract start?' })
    expect(dialog).toHaveTextContent('Training is not productive work')
    await user.click(within(dialog).getByRole('button', { name: 'Record start' }))

    // The stale answer is never success: the list is re-read with the expected revision sent.
    expect(harness.actionRepository.activate).toHaveBeenCalledWith(testContractIdentifier, acceptedContract.revision)
    expect(harness.repository.listOwnerContracts.mock.calls.length).toBeGreaterThan(listReadsBefore)
    expect(screen.getByRole('heading', { name: 'Contract with Test Worker' }).parentElement).toHaveTextContent('Accepted, not started')
    unmount()

    // A stale draft save reloads the latest draft instead of overwriting it.
    const draftHarness = createWorkerContractTestHarness()
    draftHarness.actionRepository.saveDraft.mockRejectedValue(new Error(staleMessage))
    render(<OwnerWorkerContractsPanel workerContractService={draftHarness.workerContractService} />)
    await user.click(await screen.findByRole('button', { name: 'Open the contract with Test Worker' }))
    await user.click(await screen.findByRole('button', { name: 'Edit draft version 1' }))
    const roleTitle = await screen.findByRole('textbox', { name: /^Role title/ })
    await user.type(roleTitle, ' lead')
    const draftReadsBefore = draftHarness.repository.fetchDraftVersion.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByRole('textbox', { name: /^Role title/ })).toHaveValue('Wash bay crew')
    expect(draftHarness.repository.fetchDraftVersion.mock.calls.length).toBeGreaterThan(draftReadsBefore)
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled()
  })

  it('w9_flags_disclaimer_and_no_match_copy', async () => {
    const { rerender } = render(<ContractProblemTermFlags flags={[]} notices={testFlagNotices} />)
    expect(screen.getByText('Automatic keyword check. It may miss problems or flag acceptable text. It is not legal advice and WashLink does not check whether terms are lawful.')).toBeInTheDocument()
    expect(screen.getByText('No keyword matches. This does not mean the terms are lawful.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Keyword check: 0 keyword matches' })).toBeInTheDocument()

    // Without the server notices the same fixed texts are shown.
    rerender(<ContractProblemTermFlags flags={[]} notices={null} />)
    expect(screen.getByText(testFlagNotices.noMatchText)).toBeInTheDocument()
    expect(screen.getByText(testFlagNotices.disclaimer)).toBeInTheDocument()

    rerender(<ContractProblemTermFlags flags={buildPreview().flags} notices={testFlagNotices} />)
    const matches = screen.getByRole('list', { name: 'Keyword matches' })
    expect(matches).toHaveTextContent('Deposit or bond (Section 7)')
    expect(matches).toHaveTextContent('"a deposit is kept by the shop"')
    expect(matches).toHaveTextContent('may need legal review')
    expect(screen.getByText(testFlagNotices.disclaimer)).toBeInTheDocument()
    expect(screen.queryByText(testFlagNotices.noMatchText)).toBeNull()

    // The owner's saved-draft check shows the live flags with the disclaimer; flags never disable sending.
    const user = userEvent.setup()
    const harness = createWorkerContractTestHarness()
    rerender(<OwnerWorkerContractsPanel workerContractService={harness.workerContractService} />)
    await user.click(await screen.findByRole('button', { name: 'Open the contract with Test Worker' }))
    await user.click(await screen.findByRole('button', { name: 'Edit draft version 1' }))
    const check = await screen.findByRole('region', { name: 'Saved draft check' })
    expect(check).toHaveTextContent(testFlagNotices.disclaimer)
    expect(check).toHaveTextContent('Keyword check: 1 keyword match')
    expect(screen.getByRole('button', { name: 'Review and send' })).toBeEnabled()
  })

  it('w9_owner_contract_list_states', async () => {
    const user = userEvent.setup()
    const emptyHarness = createWorkerContractTestHarness([])
    const { unmount } = render(<OwnerWorkerContractsPanel workerContractService={emptyHarness.workerContractService} />)
    expect(screen.getByLabelText('Loading your worker contracts')).toBeInTheDocument()
    expect(await screen.findByText('No worker contracts yet')).toBeInTheDocument()
    unmount()

    const errorHarness = createWorkerContractTestHarness()
    errorHarness.repository.listOwnerContracts.mockRejectedValueOnce(new Error('Could not load your worker contracts.')).mockResolvedValue([buildActiveOwnerContract()])
    render(<OwnerWorkerContractsPanel workerContractService={errorHarness.workerContractService} />)
    expect(await screen.findByText('Your worker contracts could not be loaded')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    const list = await screen.findByRole('list', { name: 'Worker contracts' })
    expect(within(list).getByRole('listitem', { name: 'Contract with Test Worker' })).toHaveTextContent('Active')
  })
})
