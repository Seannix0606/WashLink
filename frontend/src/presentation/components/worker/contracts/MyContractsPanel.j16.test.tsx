import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { OwnerRelationshipService } from '../../../../application/services/OwnerRelationshipService'
import { buildProgress, createOwnerRelationshipTestHarness, obligationWording } from '../../../../test/ownerRelationshipFixtures'
import {
  buildMyContract,
  createWorkerContractTestHarness,
  testContractIdentifier,
  testPendingVersionIdentifier,
  type WorkerContractTestHarness,
} from '../../../../test/workerContractFixtures'
import { ownerRelationshipCopyTexts } from '../../../utilities/ownerRelationshipCopy'
import { ownerRelationshipDisplayLabels } from '../../../utilities/ownerRelationshipDisplay'
import { MyContractsPanel } from './MyContractsPanel'

/** The only allowed mentions of duty or blocking words: negated, never a claim (D-3, W10-L1). */
const allowedNegatedPhrases: readonly RegExp[] = [
  /it is not a requirement and not an obligation/gi,
  /it never stops you/gi,
  /it never blocks/gi,
]

function stripNegatedPhrases(text: string): string {
  return allowedNegatedPhrases.reduce((remainingText, negatedPhrase) => remainingText.replace(negatedPhrase, ''), text)
}

function renderPanel(contractHarness: WorkerContractTestHarness, ownerRelationshipService: OwnerRelationshipService): ReturnType<typeof render> {
  return render(
    <MyContractsPanel
      workerContractDependencies={{
        workerContractService: contractHarness.workerContractService,
        workerContractResponseService: contractHarness.workerContractResponseService,
        ownerRelationshipService,
      }}
    />,
  )
}

const activeContract = buildMyContract({
  status: 'active', effectiveStatus: 'active', revision: 9, pendingVersionId: null, pendingVersionNumber: null, pendingVersionKind: null, allowedActions: [],
})

describe('Owner goal never blocks decline or termination (J16)', () => {
  it('j16_progress_copy_is_informational_and_never_an_obligation', async () => {
    for (const fixedText of [...ownerRelationshipCopyTexts, ...ownerRelationshipDisplayLabels]) {
      expect(stripNegatedPhrases(fixedText)).not.toMatch(obligationWording)
    }
    const harness = createOwnerRelationshipTestHarness(buildProgress({ qualifyingOwnerCount: 0, remainingOwnerCount: 3 }), [])
    renderPanel(createWorkerContractTestHarness([], []), harness.ownerRelationshipService)
    const progressRegion = await screen.findByRole('region', { name: 'Progress toward working with different shop owners' })
    expect(await within(progressRegion).findByText('0 of 3 different shop owners')).toBeInTheDocument()
    expect(progressRegion).toHaveTextContent(
      'This is a WashLink progress goal. It is not a requirement and not an obligation to work for several shops at the same time. It never stops you from declining an offer or recording the end of a contract.',
    )
    expect(stripNegatedPhrases(progressRegion.textContent)).not.toMatch(obligationWording)
  })

  it('j16_decline_and_end_actions_unaffected_by_progress', async () => {
    const user = userEvent.setup()
    // Zero owners with the minimum raised to ten: declining an offer still goes straight to the database.
    const offerHarness = createWorkerContractTestHarness([], [buildMyContract()])
    const zeroProgress = createOwnerRelationshipTestHarness(
      buildProgress({ minimumDistinctOwners: 10, qualifyingOwnerCount: 0, remainingOwnerCount: 10 }),
      [],
    )
    renderPanel(offerHarness, zeroProgress.ownerRelationshipService)
    await user.click(await screen.findByRole('button', { name: 'Open the contract with Test Wash Bay' }))
    await user.click(await screen.findByRole('button', { name: 'Decline offer' }))
    const declineDialog = await screen.findByRole('dialog', { name: 'Decline this offer' })
    await user.click(within(declineDialog).getByRole('button', { name: 'Decline offer' }))
    expect(offerHarness.actionRepository.declineVersion).toHaveBeenCalledWith(testContractIdentifier, testPendingVersionIdentifier, null)
  })

  it('j16_terminate_and_decline_modals_show_no_owner_goal_text', async () => {
    const user = userEvent.setup()
    // Ending the only qualifying relationship at the exact minimum: the modal says nothing about owners or goals.
    const activeHarness = createWorkerContractTestHarness([], [activeContract])
    activeHarness.actionRepository.terminate.mockResolvedValue({ contractId: testContractIdentifier, status: 'terminated', revision: 10 })
    const atMinimum = createOwnerRelationshipTestHarness(buildProgress({ minimumDistinctOwners: 1, qualifyingOwnerCount: 1, remainingOwnerCount: 0, isGoalReached: true }))
    const { unmount } = renderPanel(activeHarness, atMinimum.ownerRelationshipService)
    await user.click(await screen.findByRole('button', { name: 'Open the contract with Test Wash Bay' }))
    await user.click(await screen.findByRole('button', { name: 'End contract' }))
    const terminateDialog = await screen.findByRole('dialog', { name: 'End this contract' })
    expect(terminateDialog).not.toHaveTextContent(/owner|goal|progress/i)
    expect(screen.queryByRole('region', { name: 'Progress toward working with different shop owners' })).toBeNull()
    await user.type(within(terminateDialog).getByRole('textbox'), 'Moving to another city.')
    await user.click(within(terminateDialog).getByRole('button', { name: 'End contract' }))
    expect(activeHarness.actionRepository.terminate).toHaveBeenCalledWith(testContractIdentifier, 9, 'Moving to another city.')

    unmount()

    renderPanel(createWorkerContractTestHarness([], [buildMyContract()]), createOwnerRelationshipTestHarness().ownerRelationshipService)
    await user.click(await screen.findByRole('button', { name: 'Open the contract with Test Wash Bay' }))
    await user.click(await screen.findByRole('button', { name: 'Decline offer' }))
    const declineDialog = await screen.findByRole('dialog', { name: 'Decline this offer' })
    expect(declineDialog).not.toHaveTextContent(/owner|goal|progress/i)
  })
})
