import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { workerOwnerRelationshipStatuses } from '../../domain/models/OwnerRelationship'
import { mapMyOwnerRelationshipRow, mapOwnerWorkerRelationshipRow } from '../../infrastructure/supabase/supabaseOwnerRelationshipRows'
import {
  buildMyRelationship,
  buildOwnerSideRelationship,
  buildProgress,
  createOwnerRelationshipTestHarness,
} from '../../test/ownerRelationshipFixtures'
import { OwnerWorkerRelationshipsList } from '../components/owner/workerContracts/OwnerWorkerRelationshipsList'
import { MyOwnerRelationshipsList } from '../components/worker/contracts/MyOwnerRelationshipsList'
import { OwnerRelationshipProgressCard } from '../components/worker/contracts/OwnerRelationshipProgressCard'
import { describeOwnerGoalSource } from './ownerRelationshipCopy'
import { relationshipCountingText, relationshipStatusLabel } from './ownerRelationshipDisplay'

describe('Owner relationship wording and dates (W10 fix cycle 1)', () => {
  it('w10_suspended_label_is_counting_neutral_for_worker_and_owner', async () => {
    // The contract stays active: no label or counting text reads as a suspension of work or pay (C1, W10-L9).
    for (const status of workerOwnerRelationshipStatuses) {
      expect(relationshipStatusLabel(status, 'worker').label).not.toMatch(/suspend/i)
      expect(relationshipStatusLabel(status, 'owner').label).not.toMatch(/suspend/i)
      expect(relationshipCountingText[status]).not.toMatch(/suspend/i)
    }
    expect(relationshipStatusLabel('suspended', 'worker').label).toBe('Not counting right now')
    expect(relationshipStatusLabel('suspended', 'owner').label).toBe('Needs attention')
    expect(relationshipStatusLabel('active', 'owner').label).toBe('Active')

    // The owner label mentions no counting or goal (D-38); the reason line says what needs attention.
    const harness = createOwnerRelationshipTestHarness(null, [], [
      buildOwnerSideRelationship({ status: 'suspended', statusReason: 'owner_verification_not_current' }),
    ])
    render(<OwnerWorkerRelationshipsList ownerRelationshipService={harness.ownerRelationshipService} />)
    const row = await screen.findByRole('listitem', { name: 'Relationship with Test Worker' })
    expect(row).toHaveTextContent('Needs attention')
    expect(row).toHaveTextContent("Your shop's verification is not current right now.")
    expect(row.textContent).not.toMatch(/suspend|count|goal|progress/i)
  })

  it('w10_since_date_hidden_when_status_changed_at_is_null', async () => {
    // The mapper keeps the null the server sends when the live status differs from the stored one.
    expect(
      mapMyOwnerRelationshipRow({
        relationship_id: 'r1', owner_name: 'Alma Owner', owner_removed: false, shop_names: ['North Bay'], status: 'ended',
        status_reason: 'contract_expired', counts_toward_goal: false, qualifying_contract_count: 0, accepted_contract_count: 1,
        first_accepted_at: '2026-10-01T02:00:00Z', status_changed_at: null,
      }).statusChangedAt,
    ).toBeNull()
    expect(
      mapOwnerWorkerRelationshipRow({
        relationship_id: 'r1', worker_id: 'w1', worker_name: 'Test Worker', status: 'ended', status_reason: 'contract_expired',
        contracts_with_you_count: 1, first_accepted_at: '2026-10-01T02:00:00Z', status_changed_at: null,
      }).statusChangedAt,
    ).toBeNull()

    const { unmount } = render(
      <MyOwnerRelationshipsList
        relationships={[
          buildMyRelationship({ statusChangedAt: null }),
          buildMyRelationship({ relationshipId: '00000000-0000-4000-8000-0000000010a7', ownerName: 'Ben Owner' }),
        ]}
      />,
    )
    expect(screen.getByRole('listitem', { name: 'Relationship with Alma Owner' })).not.toHaveTextContent('Since')
    expect(screen.getByRole('listitem', { name: 'Relationship with Ben Owner' })).toHaveTextContent('Since')
    unmount()

    const harness = createOwnerRelationshipTestHarness(null, [], [buildOwnerSideRelationship({ statusChangedAt: null })])
    render(<OwnerWorkerRelationshipsList ownerRelationshipService={harness.ownerRelationshipService} />)
    const ownerRow = await screen.findByRole('listitem', { name: 'Relationship with Test Worker' })
    expect(ownerRow).toHaveTextContent('2 accepted contracts with you')
    expect(ownerRow).not.toHaveTextContent('Since')
  })

  it('w10_goal_source_grammar_for_minimum_one', async () => {
    expect(describeOwnerGoalSource(1, 3)).toBe('Goal set by WashLink: 1 shop owner (WashLink default: 3).')
    expect(describeOwnerGoalSource(3, 3)).toBe('Goal set by WashLink: 3 different shop owners.')
    expect(describeOwnerGoalSource(5, 3)).toBe('Goal set by WashLink: 5 different shop owners (WashLink default: 3).')

    const harness = createOwnerRelationshipTestHarness(
      buildProgress({ minimumDistinctOwners: 1, qualifyingOwnerCount: 0, remainingOwnerCount: 1 }),
    )
    render(<OwnerRelationshipProgressCard ownerRelationshipService={harness.ownerRelationshipService} />)
    expect(await screen.findByText('0 of 1 shop owner')).toBeInTheDocument()
    expect(screen.getByText('1 more shop owner with an active contract would reach this goal.')).toBeInTheDocument()
    expect(screen.getByText(/Goal set by WashLink: 1 shop owner \(WashLink default: 3\)\./)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\b1 different shop owners\b/)
  })
})
