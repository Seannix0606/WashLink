import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildMyRelationship, buildProgress, createOwnerRelationshipTestHarness } from '../../../../test/ownerRelationshipFixtures'
import { MyOwnerRelationshipsList } from './MyOwnerRelationshipsList'
import { OwnerRelationshipProgressCard } from './OwnerRelationshipProgressCard'

describe('Worker owner relationship list (J14)', () => {
  it('j14_relationship_list_one_row_per_owner_with_contract_count', async () => {
    // Two contracts at two shops of the same owner: one row, both shops, one owner in the count.
    const sameOwnerTwoShops = buildMyRelationship({
      shopNames: ['North Bay', 'South Bay'],
      acceptedContractCount: 2,
      qualifyingContractCount: 2,
    })
    const { unmount } = render(<MyOwnerRelationshipsList relationships={[sameOwnerTwoShops]} />)
    const list = screen.getByRole('list', { name: 'Shop owners you have contracts with' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    const row = within(list).getByRole('listitem', { name: 'Relationship with Alma Owner' })
    expect(row).toHaveTextContent('Shops: North Bay, South Bay')
    expect(row).toHaveTextContent('2 accepted contracts')
    expect(row).toHaveTextContent('Active')
    expect(row).toHaveTextContent('Counts toward your progress goal.')
    unmount()

    // The card shows the server count (distinct owners), not the number of contracts or shops.
    const harness = createOwnerRelationshipTestHarness(buildProgress({ qualifyingOwnerCount: 1, remainingOwnerCount: 2 }), [
      sameOwnerTwoShops,
      buildMyRelationship({
        relationshipId: '00000000-0000-4000-8000-0000000010a2',
        ownerName: 'Ben Owner',
        shopNames: ['Ben Wash'],
        status: 'ended',
        statusReason: 'contract_terminated',
        countsTowardGoal: false,
        qualifyingContractCount: 0,
      }),
    ])
    render(<OwnerRelationshipProgressCard ownerRelationshipService={harness.ownerRelationshipService} />)
    expect(await screen.findByText('1 of 3 different shop owners')).toBeInTheDocument()
    const rows = within(screen.getByRole('list', { name: 'Shop owners you have contracts with' })).getAllByRole('listitem')
    expect(rows.map((listItem) => listItem.getAttribute('aria-label'))).toEqual(['Relationship with Alma Owner', 'Relationship with Ben Owner'])
    expect(rows[1]).toHaveTextContent('1 accepted contract')
    expect(rows[1]).toHaveTextContent('Ended')
  })
})
