import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WorkforcePolicyService } from '../../../../application/services/WorkforcePolicyService'
import { createModerationTestHarness, testLookupProfileIdentifier } from '../../../../test/moderationFixtures'
import { RelationshipLookupPanel } from './RelationshipLookupPanel'

const lookupNote = 'The worker asked why one relationship shows as ended.'

describe('Super_admin relationship lookups (W14)', () => {
  it('w14_relationship_lookup_requires_purpose_and_note', async () => {
    const user = userEvent.setup()
    const harness = createModerationTestHarness()
    const loadPolicies = vi.fn().mockResolvedValue([{ policyKey: 'minimum_distinct_owners', integerValue: 3 }])
    const workforcePolicyService = { loadPolicies } as unknown as WorkforcePolicyService
    harness.oversightRepository.lookupRelationships
      .mockResolvedValueOnce({
        kind: 'worker',
        isFound: true,
        displayName: 'Test Worker',
        distinctQualifyingOwnerCount: 1,
        relationships: [
          {
            relationshipId: 'rel-1',
            counterpartNameSnapshot: 'Test Owner',
            isOwnerPresent: true,
            status: 'active',
            statusReason: 'accepted_contract',
            countsTowardGoal: true,
            qualifyingContractCount: 1,
            firstAcceptedAt: '2026-10-20T02:00:00Z',
            lastActiveAt: null,
            endedAt: null,
          },
        ],
      })
      .mockResolvedValueOnce({ kind: 'owner', isFound: false })
    render(<RelationshipLookupPanel adminOversightService={harness.adminOversightService} workforcePolicyService={workforcePolicyService} />)

    const form = screen.getByRole('form', { name: 'Look up relationships' })
    await user.click(within(form).getByRole('button', { name: 'Look up and record' }))
    expect(within(form).getByText('Choose a person to look up.')).toBeInTheDocument()
    expect(within(form).getByText('Choose a purpose for this lookup.')).toBeInTheDocument()
    expect(within(form).getByText('Write a note of 20 to 300 characters.')).toBeInTheDocument()
    expect(harness.oversightRepository.lookupRelationships).not.toHaveBeenCalled()
    // The minimum is read only once a worker lookup is shown.
    expect(loadPolicies).not.toHaveBeenCalled()

    await user.type(within(form).getByLabelText(/Account id/), testLookupProfileIdentifier)
    await user.selectOptions(within(form).getByLabelText(/Purpose/), 'party_support_request')
    await user.click(within(form).getByLabelText(/Note/))
    await user.paste(lookupNote)
    await user.click(within(form).getByRole('button', { name: 'Look up and record' }))
    await waitFor(() => {
      expect(harness.oversightRepository.lookupRelationships).toHaveBeenCalledWith({
        kind: 'worker',
        profileId: testLookupProfileIdentifier,
        purpose: 'party_support_request',
        note: lookupNote,
      })
    })
    const result = await screen.findByRole('region', { name: 'Lookup result' })
    expect(result).toHaveTextContent('Distinct qualifying owners: 1')
    expect(await within(result).findByText(/Current informational minimum: 3 distinct owners/)).toBeInTheDocument()
    expect(within(result).getByRole('list', { name: 'Relationships' })).toHaveTextContent('Test Owner')

    // An unknown id answers "not found" and is still recorded by the database.
    await user.selectOptions(within(form).getByLabelText('Look up'), 'owner')
    await user.click(within(form).getByRole('button', { name: 'Look up and record' }))
    expect(await screen.findByRole('status')).toHaveTextContent('No account of this kind was found. The lookup was still recorded.')
    expect(harness.oversightRepository.lookupRelationships).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'owner' }))
  })
})
