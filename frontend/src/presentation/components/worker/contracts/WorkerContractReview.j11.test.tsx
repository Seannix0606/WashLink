import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ContractVersionChange } from '../../../../domain/models/WorkerContract'
import {
  buildDocument,
  buildMyContractWithAmendment,
  buildVersionSummary,
  createWorkerContractTestHarness,
  testContractIdentifier,
  testCurrentVersionIdentifier,
  testPendingVersionIdentifier,
} from '../../../../test/workerContractFixtures'
import { MyContractsPanel } from './MyContractsPanel'

const amendmentChanges: ContractVersionChange[] = [
  { changeKind: 'contract_detail_changed', sectionNumber: null, itemKey: 'schedule_summary', heading: null, previousText: 'Weekdays, morning shift', newText: 'Weekdays, afternoon shift' },
  { changeKind: 'clause_changed', sectionNumber: 7, itemKey: 'pay_terms', heading: 'Pay terms', previousText: 'Paid every Friday.', newText: 'Paid every second Friday.' },
]

function renderAmendmentReview(): ReturnType<typeof createWorkerContractTestHarness> {
  const harness = createWorkerContractTestHarness([], [buildMyContractWithAmendment()])
  harness.repository.listVersionChanges.mockImplementation((versionId) => Promise.resolve(versionId === testPendingVersionIdentifier ? amendmentChanges : []))
  harness.repository.fetchVersionDocument.mockImplementation((versionId) =>
    Promise.resolve(buildDocument({ versionId, versionNumber: versionId === testPendingVersionIdentifier ? 2 : 1, kind: versionId === testPendingVersionIdentifier ? 'amendment' : 'initial' })),
  )
  harness.repository.listVersions.mockResolvedValue([
    buildVersionSummary({ versionId: testPendingVersionIdentifier, versionNumber: 2, kind: 'amendment' }),
    buildVersionSummary({ versionId: testCurrentVersionIdentifier, versionNumber: 1, state: 'accepted', isCurrent: true, isPending: false }),
  ])
  const dependencies = { workerContractService: harness.workerContractService, workerContractResponseService: harness.workerContractResponseService }
  render(<MyContractsPanel workerContractDependencies={dependencies} />)
  return harness
}

describe('Worker contract amendments (J11)', () => {
  it('j11_amendment_review_shows_changes_and_current_terms_stay_copy', async () => {
    const user = userEvent.setup()
    renderAmendmentReview()
    const listItem = await screen.findByRole('listitem', { name: 'Contract with Test Wash Bay' })
    expect(listItem).toHaveTextContent('A proposed change is waiting for your answer.')
    await user.click(within(listItem).getByRole('button', { name: 'Open the contract with Test Wash Bay' }))

    const proposed = await screen.findByRole('region', { name: 'Proposed change' })
    const changes = await within(proposed).findByRole('region', { name: 'What this change alters' })
    expect(changes).toHaveTextContent('Your current terms stay until you accept this change.')
    expect(changes).toHaveTextContent('Contract detail changed: Schedule')
    expect(changes).toHaveTextContent('Now: Weekdays, morning shift')
    expect(changes).toHaveTextContent('Proposed: Weekdays, afternoon shift')
    expect(changes).toHaveTextContent('Clause changed: Section 7: Pay terms')
    expect(within(proposed).getByRole('button', { name: 'Accept this change' })).toBeInTheDocument()
    // The version in force is shown separately and stays as it is.
    expect(screen.getByRole('region', { name: 'Version in force' })).toHaveTextContent('Version 1: in force')
  })

  it('j11_worker_can_decline_amendment', async () => {
    const user = userEvent.setup()
    const harness = renderAmendmentReview()
    await user.click(await screen.findByRole('button', { name: 'Open the contract with Test Wash Bay' }))
    const answer = await screen.findByRole('group', { name: 'Your answer' })
    await user.click(within(answer).getByRole('button', { name: 'Decline change' }))
    const dialog = await screen.findByRole('dialog', { name: 'Decline the proposed change' })
    expect(dialog).toHaveTextContent('Declining keeps your current contract terms unchanged.')
    await user.type(within(dialog).getByRole('textbox'), '  I prefer the morning shift.  ')
    await user.click(within(dialog).getByRole('button', { name: 'Decline change' }))
    expect(harness.actionRepository.declineVersion).toHaveBeenCalledWith(testContractIdentifier, testPendingVersionIdentifier, 'I prefer the morning shift.')
    expect(harness.actionRepository.acceptVersion).not.toHaveBeenCalled()
    // The list is re-read after the answer.
    expect(harness.repository.listMyContracts.mock.calls.length).toBeGreaterThan(1)
  })
})
