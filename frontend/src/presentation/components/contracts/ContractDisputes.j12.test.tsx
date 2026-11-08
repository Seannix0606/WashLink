import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canReportContractProblem, contractDisputeCategoriesFor } from '../../../domain/models/ContractDispute'
import { buildMyDispute, createOversightTestHarness, testDisputeIdentifier } from '../../../test/oversightFixtures'
import { buildMyContract, createWorkerContractTestHarness, testContractIdentifier } from '../../../test/workerContractFixtures'
import { MyContractsPanel } from '../worker/contracts/MyContractsPanel'

const toastDouble = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastDouble, Toaster: (): null => null }))

const dayMilliseconds = 86_400_000
const validStatement = 'The contract was ended without the notice the terms describe.'

function renderWorkerContracts(
  oversight: ReturnType<typeof createOversightTestHarness>,
  endedByOwnerDaysAgo: number,
): ReturnType<typeof createWorkerContractTestHarness> {
  const terminatedContract = buildMyContract({
    status: 'terminated',
    effectiveStatus: 'terminated',
    endedAt: new Date(Date.now() - endedByOwnerDaysAgo * dayMilliseconds).toISOString(),
    endedBy: 'owner',
    endReason: 'The shop is reducing staff this month.',
    pendingVersionId: null,
    pendingVersionNumber: null,
    pendingVersionKind: null,
    allowedActions: [],
  })
  const contractHarness = createWorkerContractTestHarness([], [terminatedContract])
  render(
    <MyContractsPanel
      workerContractDependencies={{
        workerContractService: contractHarness.workerContractService,
        workerContractResponseService: contractHarness.workerContractResponseService,
      }}
      contractDisputeService={oversight.contractDisputeService}
    />,
  )
  return contractHarness
}

describe('Reported contract problems (J12, W11)', () => {
  beforeEach(() => {
    toastDouble.success.mockClear()
    toastDouble.error.mockClear()
  })

  it('j12_w11_dispute_categories_follow_contract_end', async () => {
    // The "ended" category exists only for the other party's ending.
    expect(contractDisputeCategoriesFor('worker', 'owner')).toContain('owner_ended_contract')
    expect(contractDisputeCategoriesFor('worker', 'owner')).not.toContain('worker_ended_contract')
    expect(contractDisputeCategoriesFor('owner', 'worker')).toContain('worker_ended_contract')
    expect(contractDisputeCategoriesFor('owner', 'owner')).not.toContain('owner_ended_contract')
    expect(contractDisputeCategoriesFor('worker', null)).toEqual(['contract_terms', 'amendment', 'acceptance_record', 'other'])
    // Unsent drafts and contracts ended more than 90 days ago are not offered (the database re-checks).
    const now = new Date('2026-10-29T02:00:00Z')
    const facts = { sentAt: '2026-06-01T02:00:00Z', endedAt: '2026-07-01T02:00:00Z', endedBy: 'owner' as const, endDate: null, effectiveStatus: 'terminated' as const }
    expect(canReportContractProblem(facts, now)).toBe(false)
    expect(canReportContractProblem({ ...facts, endedAt: '2026-10-01T02:00:00Z' }, now)).toBe(true)
    expect(canReportContractProblem({ ...facts, sentAt: null, endedAt: null, effectiveStatus: 'draft' }, now)).toBe(false)

    const user = userEvent.setup()
    const oversight = createOversightTestHarness()
    oversight.disputeRepository.raise.mockResolvedValue({ disputeId: testDisputeIdentifier, status: 'open', revision: 1 })
    renderWorkerContracts(oversight, 5)
    await user.click(await screen.findByRole('button', { name: /Report a problem with the contract with Test/ }))
    const dialog = screen.getByRole('dialog', { name: 'Report a problem with this contract' })
    const categorySelect = within(dialog).getByLabelText(/What is the problem about/)
    const optionLabels = within(categorySelect).getAllByRole('option').map((option) => option.textContent)
    expect(optionLabels).toContain('The shop owner ended the contract')
    expect(optionLabels).not.toContain('The worker ended the contract')

    await user.click(within(dialog).getByRole('button', { name: 'Send report' }))
    expect(within(dialog).getByText('Choose a problem category.')).toBeInTheDocument()
    expect(within(dialog).getByText('Write a statement of 20 to 1000 characters.')).toBeInTheDocument()
    expect(oversight.disputeRepository.raise).not.toHaveBeenCalled()
    await user.selectOptions(categorySelect, 'owner_ended_contract')
    await user.type(within(dialog).getByLabelText(/Describe the problem/), validStatement)
    await user.click(within(dialog).getByRole('button', { name: 'Send report' }))
    await waitFor(() => {
      expect(oversight.disputeRepository.raise).toHaveBeenCalledWith({ contractId: testContractIdentifier, category: 'owner_ended_contract', statement: validStatement })
    })
    expect(toastDouble.success).toHaveBeenCalledWith('The problem was reported to WashLink. The contract has not changed.')
  })

  it('j12_w11_party_dispute_list_respond_withdraw', async () => {
    const user = userEvent.setup()
    const oversight = createOversightTestHarness()
    const answerable = buildMyDispute({ disputeId: 'dispute-answer', category: 'contract_terms', canRespond: true, canWithdraw: false })
    const mine = buildMyDispute({ disputeId: 'dispute-mine', category: 'other', isRaisedByMe: true, canRespond: false, canWithdraw: true, statement: 'My own report about the schedule wording.' })
    const closed = buildMyDispute({
      disputeId: 'dispute-closed',
      category: 'amendment',
      status: 'closed',
      canRespond: false,
      resolutionKind: 'information_shared',
      resolutionNote: 'We explained how proposed changes work.',
      closedAt: '2026-10-29T02:00:00Z',
    })
    oversight.disputeRepository.listMyDisputes.mockResolvedValue([answerable, mine, closed])
    oversight.disputeRepository.respond.mockResolvedValue({ disputeId: 'dispute-answer', status: 'open', revision: 2 })
    oversight.disputeRepository.withdraw.mockResolvedValue({ disputeId: 'dispute-mine', status: 'withdrawn', revision: 2 })
    // Ended 120 days ago: listed, but no new report is offered for it.
    const contractHarness = renderWorkerContracts(oversight, 120)

    const disputeList = await screen.findByRole('list', { name: 'Reported problems' })
    expect(screen.queryByRole('button', { name: /Report a problem with the contract/ })).toBeNull()
    const [answerItem, mineItem, closedItem] = within(disputeList).getAllByRole('listitem')
    expect(within(mineItem).queryByRole('button', { name: 'Add your side' })).toBeNull()
    expect(within(closedItem).queryByRole('button')).toBeNull()
    expect(closedItem).toHaveTextContent('WashLink closed this report: Information shared')
    expect(closedItem).toHaveTextContent('We explained how proposed changes work.')

    await user.click(within(answerItem).getByRole('button', { name: 'Add your side' }))
    const respondDialog = screen.getByRole('dialog', { name: 'Add your side' })
    await user.type(within(respondDialog).getByLabelText(/Your side/), 'The notice was given in writing a week before.')
    await user.click(within(respondDialog).getByRole('button', { name: 'Add your side' }))
    await waitFor(() => {
      expect(oversight.disputeRepository.respond).toHaveBeenCalledWith('dispute-answer', 'The notice was given in writing a week before.')
    })

    await user.click(within(mineItem).getByRole('button', { name: 'Withdraw report' }))
    const withdrawDialog = screen.getByRole('dialog', { name: 'Withdraw this report?' })
    await user.click(within(withdrawDialog).getByRole('button', { name: 'Withdraw report' }))
    await waitFor(() => {
      expect(oversight.disputeRepository.withdraw).toHaveBeenCalledWith('dispute-mine')
    })
    // No W9 contract action was called by any dispute action.
    for (const contractAction of [contractHarness.actionRepository.terminate, contractHarness.actionRepository.declineVersion, contractHarness.actionRepository.acceptVersion]) {
      expect(contractAction).not.toHaveBeenCalled()
    }
  })
})
