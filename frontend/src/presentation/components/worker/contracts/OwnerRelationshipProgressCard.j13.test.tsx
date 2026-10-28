import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ownerGoalState, progressBarValue, remainingOwnerCount } from '../../../../domain/utilities/ownerRelationshipProgress'
import { buildProgress, createOwnerRelationshipTestHarness } from '../../../../test/ownerRelationshipFixtures'
import { OwnerRelationshipProgressCard } from './OwnerRelationshipProgressCard'

describe('Worker owner relationship progress (J13)', () => {
  it('j13_progress_card_shows_count_and_remaining_from_policy', async () => {
    const harness = createOwnerRelationshipTestHarness(buildProgress({ qualifyingOwnerCount: 1, remainingOwnerCount: 2 }))
    const { unmount } = render(<OwnerRelationshipProgressCard ownerRelationshipService={harness.ownerRelationshipService} />)
    expect(await screen.findByText('1 of 3 different shop owners')).toBeInTheDocument()
    expect(screen.getByText('2 more different shop owners with an active contract would reach this goal.')).toBeInTheDocument()
    const progressBar = screen.getByRole('progressbar', { name: 'Progress toward working with different shop owners' })
    expect(progressBar).toHaveAttribute('aria-valuenow', '1')
    expect(progressBar).toHaveAttribute('aria-valuemax', '3')
    expect(progressBar).toHaveAttribute('aria-valuetext', '1 of 3 different shop owners')
    expect(screen.getByText(/Goal set by WashLink: 3 different shop owners\./)).toHaveTextContent('Counted as of 2026-10-28.')
    unmount()

    // The minimum comes from the policy row: a raised value changes the remaining, not the count, and the default stays visible.
    const raisedHarness = createOwnerRelationshipTestHarness(
      buildProgress({ minimumDistinctOwners: 5, qualifyingOwnerCount: 1, remainingOwnerCount: 4, policyRevision: 2 }),
    )
    render(<OwnerRelationshipProgressCard ownerRelationshipService={raisedHarness.ownerRelationshipService} />)
    expect(await screen.findByText('1 of 5 different shop owners')).toBeInTheDocument()
    expect(screen.getByText('4 more different shop owners with an active contract would reach this goal.')).toBeInTheDocument()
    expect(screen.getByText(/WashLink default: 3/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '5')
    expect(raisedHarness.repository.fetchMyProgress).toHaveBeenCalledTimes(1)
  })

  it('j13_remaining_never_negative_and_goal_reached_copy', async () => {
    expect(remainingOwnerCount(0, 3)).toBe(3)
    expect(remainingOwnerCount(3, 3)).toBe(0)
    expect(remainingOwnerCount(4, 3)).toBe(0)
    expect(progressBarValue({ qualifyingOwnerCount: 4, minimumDistinctOwners: 3 })).toBe(3)
    expect(ownerGoalState({ qualifyingOwnerCount: 0, minimumDistinctOwners: 3 })).toBe('not_started')
    expect(ownerGoalState({ qualifyingOwnerCount: 2, minimumDistinctOwners: 3 })).toBe('in_progress')
    expect(ownerGoalState({ qualifyingOwnerCount: 4, minimumDistinctOwners: 3 })).toBe('goal_reached')

    // Even a negative remaining from the server is never shown.
    const harness = createOwnerRelationshipTestHarness(
      buildProgress({ qualifyingOwnerCount: 4, remainingOwnerCount: -1, isGoalReached: true }),
    )
    const overview = await harness.ownerRelationshipService.loadMyOverview()
    expect(overview.progress?.remainingOwnerCount).toBe(0)

    render(<OwnerRelationshipProgressCard ownerRelationshipService={harness.ownerRelationshipService} />)
    expect(await screen.findByText('4 of 3 different shop owners')).toBeInTheDocument()
    expect(screen.getByText('You have reached this WashLink progress goal.')).toBeInTheDocument()
    expect(screen.queryByText(/(^|\s)-1\b/)).toBeNull()
    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuenow', '3')
    expect(progressBar).toHaveAttribute('aria-valuemax', '3')
  })
})
