import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { toUserFacingErrorMessage } from '../../../../infrastructure/supabase/supabaseErrorMessages'
import { ownerRelationshipDatabaseMessages } from '../../../../infrastructure/supabase/supabaseOwnerRelationshipErrorMessages'
import { mapOwnerWorkerRelationshipRow, type SupabaseOwnerWorkerRelationshipRow } from '../../../../infrastructure/supabase/supabaseOwnerRelationshipRows'
import { buildOwnerSideRelationship, createOwnerRelationshipTestHarness } from '../../../../test/ownerRelationshipFixtures'
import { OwnerWorkerRelationshipsList } from './OwnerWorkerRelationshipsList'

describe('Owner view of worker relationships (W10)', () => {
  it('w10_owner_relationship_view_hides_worker_progress_and_other_owners', async () => {
    // Even if the server sent extra columns, the mapped row keeps only the owner's own fields.
    const rowWithExtraColumns = {
      relationship_id: 'r1', worker_id: 'w1', worker_name: 'Test Worker', status: 'active', status_reason: 'contract_active',
      contracts_with_you_count: 2, first_accepted_at: '2026-10-01T02:00:00Z', status_changed_at: '2026-10-02T02:00:00Z',
      qualifying_owner_count: 3, remaining_owner_count: 0, other_owner_names: ['Ben Owner'],
    } as SupabaseOwnerWorkerRelationshipRow
    expect(Object.keys(mapOwnerWorkerRelationshipRow(rowWithExtraColumns)).sort()).toEqual([
      'contractsWithYouCount', 'firstAcceptedAt', 'relationshipId', 'status', 'statusChangedAt', 'statusReason', 'workerId', 'workerName',
    ])

    const harness = createOwnerRelationshipTestHarness(null, [], [
      buildOwnerSideRelationship(),
      buildOwnerSideRelationship({
        relationshipId: '00000000-0000-4000-8000-0000000010a9', workerName: 'Second Worker', status: 'suspended',
        statusReason: 'owner_verification_not_current', contractsWithYouCount: 1,
      }),
    ])
    render(<OwnerWorkerRelationshipsList ownerRelationshipService={harness.ownerRelationshipService} />)
    const list = await screen.findByRole('list', { name: 'Your relationships with workers' })
    const firstRow = within(list).getByRole('listitem', { name: 'Relationship with Test Worker' })
    expect(firstRow).toHaveTextContent('Active')
    expect(firstRow).toHaveTextContent('2 accepted contracts with you')
    const secondRow = within(list).getByRole('listitem', { name: 'Relationship with Second Worker' })
    expect(secondRow).toHaveTextContent('1 accepted contract with you')
    expect(secondRow).toHaveTextContent("Your shop's verification is not current right now.")

    // No goal, count, remaining, progress or other owner appears anywhere in the owner's view.
    const section = screen.getByRole('heading', { name: 'Your relationships with workers' }).closest('section')
    expect(section).not.toBeNull()
    expect(section?.textContent).not.toMatch(/goal|progress|remaining|different shop owners|of 3|Ben Owner/i)
    // The worker-side reads are never called for an owner.
    expect(harness.repository.fetchMyProgress).not.toHaveBeenCalled()
    expect(harness.repository.listMyRelationships).not.toHaveBeenCalled()
  })

  it('w10_owner_relationship_error_messages_mapped', async () => {
    const user = userEvent.setup()
    // Every message the W10 migrations raise on purpose is shown as written.
    for (const databaseMessage of ownerRelationshipDatabaseMessages) {
      expect(toUserFacingErrorMessage({ code: '42501', message: databaseMessage }, 'Fallback.')).toBe(databaseMessage)
    }
    // Raw SQL text never passes through.
    expect(toUserFacingErrorMessage({ code: '42501', message: 'permission denied for table worker_owner_relationships' }, 'Fallback.')).toBe(
      'Your account is not allowed to do this.',
    )
    expect(toUserFacingErrorMessage({ code: '22023', message: 'The refresh date cannot be in the past.' }, 'Fallback.')).toBe('Fallback.')

    // The owner list shows its error state with retry, then the empty state.
    const harness = createOwnerRelationshipTestHarness(null, [], [])
    harness.repository.listOwnerWorkerRelationships.mockRejectedValueOnce(new Error('Your account is not allowed to do this.'))
    render(<OwnerWorkerRelationshipsList ownerRelationshipService={harness.ownerRelationshipService} />)
    expect(screen.getByLabelText('Loading your worker relationships')).toBeInTheDocument()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your worker relationships could not be loaded')
    expect(alert).toHaveTextContent('Your account is not allowed to do this.')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No worker relationships yet')).toBeInTheDocument()
  })
})
