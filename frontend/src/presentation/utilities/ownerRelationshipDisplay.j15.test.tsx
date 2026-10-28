import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { workerOwnerRelationshipReasons, workerOwnerRelationshipStatuses } from '../../domain/models/OwnerRelationship'
import { relationshipStatusCounts } from '../../domain/utilities/ownerRelationshipProgress'
import { buildMyRelationship } from '../../test/ownerRelationshipFixtures'
import { MyOwnerRelationshipsList } from '../components/worker/contracts/MyOwnerRelationshipsList'
import { relationshipCountingText, relationshipReasonText, relationshipStatusDisplay } from './ownerRelationshipDisplay'

describe('Owner relationship statuses (J15)', () => {
  it('j15_status_labels_and_counting_explanations_match_d3', () => {
    // D-3: only active counts; pending_start, suspended, ended and owner_removed never do.
    expect(workerOwnerRelationshipStatuses.filter(relationshipStatusCounts)).toEqual(['active'])
    for (const status of workerOwnerRelationshipStatuses) {
      expect(relationshipStatusDisplay[status].label.length).toBeGreaterThan(0)
      const countingText = relationshipCountingText[status]
      if (status === 'active') {
        expect(countingText).toBe('Counts toward your progress goal.')
      } else {
        expect(countingText).toMatch(/^Does not count/)
      }
    }
    expect(relationshipStatusDisplay.pending_start.label).toBe('Accepted, not started')
    expect(relationshipStatusDisplay.suspended.label).toBe('Not counting right now')
    expect(relationshipStatusDisplay.ended.label).toBe('Ended')
    expect(relationshipStatusDisplay.owner_removed.label).toBe('Owner account removed')
    // Every database reason has a text for both viewers.
    for (const reason of workerOwnerRelationshipReasons) {
      expect(relationshipReasonText(reason, 'worker').length).toBeGreaterThan(0)
      expect(relationshipReasonText(reason, 'owner').length).toBeGreaterThan(0)
    }
    expect(relationshipReasonText('contract_expired', 'worker')).toBe('The contract reached its end date.')
    expect(relationshipReasonText('contract_terminated', 'worker')).toBe('The contract was ended.')
  })

  it('j15_suspended_relationship_explains_verification_not_current', () => {
    render(
      <MyOwnerRelationshipsList
        relationships={[
          buildMyRelationship({ status: 'suspended', statusReason: 'owner_verification_not_current', countsTowardGoal: false, qualifyingContractCount: 0 }),
          buildMyRelationship({
            relationshipId: '00000000-0000-4000-8000-0000000010a3',
            ownerName: 'Gone Owner',
            isOwnerRemoved: true,
            shopNames: [],
            status: 'owner_removed',
            statusReason: 'owner_account_removed',
            countsTowardGoal: false,
            qualifyingContractCount: 0,
            acceptedContractCount: 0,
          }),
        ]}
      />,
    )
    const suspendedRow = screen.getByRole('listitem', { name: 'Relationship with Alma Owner' })
    expect(suspendedRow).toHaveTextContent('Not counting right now')
    expect(suspendedRow).toHaveTextContent("The shop's verification is not current right now.")
    expect(suspendedRow).toHaveTextContent(
      'Does not count toward your progress goal right now. Your contract itself is unchanged. It counts again on its own once the reason below is resolved.',
    )
    expect(suspendedRow).not.toHaveTextContent(/suspend/i)

    // A removed owner keeps its name snapshot; no shops or contract count are guessed.
    const removedRow = screen.getByRole('listitem', { name: 'Relationship with Gone Owner' })
    expect(removedRow).toHaveTextContent('Owner account removed')
    expect(removedRow).toHaveTextContent("The owner's account was removed. Your contract records are kept.")
    expect(removedRow).not.toHaveTextContent('Shops:')
    expect(removedRow).not.toHaveTextContent('accepted contract')
  })
})
