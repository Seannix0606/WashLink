import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { buildWorkforcePolicy, createWorkforcePolicyTestHarness } from '../../../test/ownerRelationshipFixtures'
import { WorkforcePolicyPanel } from './WorkforcePolicyPanel'

const validReason = '  Pilot of a higher progress goal.  '

describe('Workforce policy panel (W10)', () => {
  it('w10_policy_panel_validates_range_and_reason_and_maps_errors', async () => {
    const user = userEvent.setup()
    const harness = createWorkforcePolicyTestHarness()
    render(<WorkforcePolicyPanel workforcePolicyService={harness.workforcePolicyService} />)
    const policyItem = await screen.findByRole('listitem', { name: 'Different shop owners in the worker progress goal' })
    expect(policyItem).toHaveTextContent('Informational only')
    expect(policyItem).toHaveTextContent('Current value3')
    expect(policyItem).toHaveTextContent('WashLink default3')
    expect(policyItem).toHaveTextContent('Revision1')
    expect(policyItem).toHaveTextContent('Not changed since setup')

    await user.click(within(policyItem).getByRole('button', { name: 'Change value' }))
    const dialog = await screen.findByRole('dialog', { name: 'Change the progress goal' })
    const valueField = within(dialog).getByRole('textbox', { name: /^New value/ })
    const reasonField = within(dialog).getByRole('textbox', { name: /^Reason for the change/ })
    const saveButton = within(dialog).getByRole('button', { name: 'Save change' })

    // Range and reason are checked before anything is sent.
    await user.clear(valueField)
    await user.type(valueField, '11')
    await user.type(reasonField, 'Too short')
    await user.click(saveButton)
    expect(within(dialog).getByText('Choose a whole number from 1 to 10.')).toBeInTheDocument()
    expect(within(dialog).getByText('Give a reason of 10 to 300 characters.')).toBeInTheDocument()
    for (const invalidValue of ['0', '2.5', '-1', 'abc']) {
      await user.clear(valueField)
      await user.type(valueField, invalidValue)
      await user.click(saveButton)
      expect(within(dialog).getByText('Choose a whole number from 1 to 10.')).toBeInTheDocument()
    }
    await user.clear(valueField)
    await user.type(valueField, '3')
    await user.click(saveButton)
    expect(within(dialog).getByText('This is already the current value.')).toBeInTheDocument()
    expect(harness.repository.changePolicyValue).not.toHaveBeenCalled()

    // A server field message is shown next to its field.
    harness.repository.changePolicyValue.mockRejectedValueOnce(new Error('Give a reason of 10 to 300 characters.'))
    await user.clear(valueField)
    await user.type(valueField, '5')
    await user.clear(reasonField)
    await user.type(reasonField, validReason)
    await user.click(saveButton)
    expect(await within(dialog).findByText('Give a reason of 10 to 300 characters.')).toBeInTheDocument()

    // A stale revision re-reads the policies; the next attempt sends the new revision.
    harness.repository.changePolicyValue.mockRejectedValueOnce(new Error('This policy changed. Reload it and try again.'))
    harness.repository.listPolicies.mockResolvedValue([buildWorkforcePolicy({ revision: 2, integerValue: 4, lastChangeReason: 'Another admin changed it.' })])
    const readsBefore = harness.repository.listPolicies.mock.calls.length
    await user.click(saveButton)
    await waitFor(() => {
      expect(harness.repository.listPolicies.mock.calls.length).toBeGreaterThan(readsBefore)
    })
    expect(await within(dialog).findByText(/Revision 2\./)).toBeInTheDocument()

    harness.repository.changePolicyValue.mockResolvedValueOnce(buildWorkforcePolicy({ revision: 3, integerValue: 5 }))
    harness.repository.listPolicies.mockResolvedValue([buildWorkforcePolicy({ revision: 3, integerValue: 5, lastChangeReason: 'Pilot of a higher progress goal.' })])
    await user.click(saveButton)
    expect(harness.repository.changePolicyValue).toHaveBeenLastCalledWith({
      policyKey: 'minimum_distinct_owners', newValue: 5, expectedRevision: 2, changeReason: 'Pilot of a higher progress goal.',
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Change the progress goal' })).toBeNull()
    })
    const updatedItem = await screen.findByRole('listitem', { name: 'Different shop owners in the worker progress goal' })
    expect(updatedItem).toHaveTextContent('Current value5')
    expect(updatedItem).toHaveTextContent('Reason for the last change: Pilot of a higher progress goal.')
  })
})
