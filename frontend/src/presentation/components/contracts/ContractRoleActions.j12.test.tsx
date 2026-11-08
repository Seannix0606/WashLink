import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { WorkerContractAction } from '../../../domain/models/WorkerContract'
import { ownerContractActions, workerContractActions } from '../../../domain/utilities/workerContractActions'
import {
  buildActiveOwnerContract,
  buildMyContract,
  buildOwnerContract,
  createWorkerContractTestHarness,
  testPendingVersionIdentifier,
} from '../../../test/workerContractFixtures'
import { OwnerWorkerContractsPanel } from '../owner/workerContracts/OwnerWorkerContractsPanel'
import { MyContractsPanel } from '../worker/contracts/MyContractsPanel'

const workerOnlyLabels = [/^Accept/, /^Decline/]
const ownerOnlyLabels = [/^Record start$/, /^Propose a change$/, /^Withdraw/, /^Edit draft/, /^Review and send$/, /^New contract draft$/]

describe('Contract views by role (J12)', () => {
  it('j12_contract_views_hide_other_role_actions', async () => {
    const user = userEvent.setup()
    const sentOwnerContract = buildOwnerContract({
      status: 'sent_for_review',
      effectiveStatus: 'sent_for_review',
      pendingVersionId: testPendingVersionIdentifier,
      pendingVersionNumber: 1,
      pendingVersionKind: 'initial',
      draftVersionId: null,
      draftVersionNumber: null,
      allowedActions: ['withdraw'],
    })
    const harness = createWorkerContractTestHarness([sentOwnerContract], [buildMyContract()])
    const { unmount } = render(<OwnerWorkerContractsPanel workerContractService={harness.workerContractService} />)
    await user.click(await screen.findByRole('button', { name: 'Open the contract with Test Worker' }))
    const ownerActions = await screen.findByRole('group', { name: 'Contract actions' })
    expect(within(ownerActions).getByRole('button', { name: 'Withdraw offer' })).toBeInTheDocument()
    await screen.findByRole('region', { name: 'Sent version' })
    for (const workerLabel of workerOnlyLabels) {
      expect(screen.queryByRole('button', { name: workerLabel })).toBeNull()
    }
    unmount()

    render(
      <MyContractsPanel
        workerContractDependencies={{ workerContractService: harness.workerContractService, workerContractResponseService: harness.workerContractResponseService }}
      />,
    )
    await user.click(await screen.findByRole('button', { name: 'Open the contract with Test Wash Bay' }))
    expect(await screen.findByRole('button', { name: 'Accept this offer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decline offer' })).toBeInTheDocument()
    for (const ownerLabel of ownerOnlyLabels) {
      expect(screen.queryByRole('button', { name: ownerLabel })).toBeNull()
    }

    // The action rules: owners never get worker actions, workers never get owner actions,
    // and an action the server does not offer is not shown to the owner.
    const pollutedWorkerContract = buildMyContract({
      allowedActions: ['accept', 'decline', 'activate', 'amend', 'send'] as unknown as WorkerContractAction[],
    })
    expect(workerContractActions(pollutedWorkerContract)).toEqual(['accept', 'decline'])
    expect(ownerContractActions(buildActiveOwnerContract())).toEqual(['amend', 'terminate'])
    expect(ownerContractActions(buildActiveOwnerContract({ allowedActions: ['terminate'] }))).toEqual(['terminate'])
    expect(ownerContractActions(buildActiveOwnerContract({ isShopRemoved: true }))).toEqual([])
    expect(ownerContractActions(sentOwnerContract)).not.toContain('accept')
  })
})
