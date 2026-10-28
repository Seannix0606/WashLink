import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { buildProgress, createOwnerRelationshipTestHarness } from '../../../../test/ownerRelationshipFixtures'
import { OwnerRelationshipProgressCard } from './OwnerRelationshipProgressCard'

describe('Worker progress card states (W10)', () => {
  it('w10_progress_loading_empty_error_states', async () => {
    const user = userEvent.setup()
    // Loading.
    const loadingHarness = createOwnerRelationshipTestHarness()
    loadingHarness.repository.fetchMyProgress.mockReturnValue(new Promise(() => undefined))
    const { unmount } = render(<OwnerRelationshipProgressCard ownerRelationshipService={loadingHarness.ownerRelationshipService} />)
    expect(screen.getByLabelText('Loading your progress')).toHaveAttribute('aria-busy', 'true')
    unmount()

    // Error, then retry succeeds.
    const errorHarness = createOwnerRelationshipTestHarness(buildProgress({ qualifyingOwnerCount: 2, remainingOwnerCount: 1 }))
    errorHarness.repository.listMyRelationships.mockRejectedValueOnce(new Error('Could not load your owner relationships.'))
    const errorRender = render(<OwnerRelationshipProgressCard ownerRelationshipService={errorHarness.ownerRelationshipService} />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your progress could not be loaded')
    expect(alert).toHaveTextContent('Could not load your owner relationships.')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('2 of 3 different shop owners')).toBeInTheDocument()
    errorRender.unmount()

    // Empty: no relationships yet, progress zero.
    const emptyHarness = createOwnerRelationshipTestHarness(buildProgress({ qualifyingOwnerCount: 0, remainingOwnerCount: 3 }), [])
    const emptyRender = render(<OwnerRelationshipProgressCard ownerRelationshipService={emptyHarness.ownerRelationshipService} />)
    expect(await screen.findByText('No shop owner relationships yet')).toBeInTheDocument()
    expect(screen.getByText('0 of 3 different shop owners')).toBeInTheDocument()
    expect(screen.getByText('3 more different shop owners with an active contract would reach this goal.')).toBeInTheDocument()
    // Without a handler there is no Find work button.
    expect(screen.queryByRole('button', { name: 'Find work' })).toBeNull()
    emptyRender.unmount()

    // No progress row from the server: nothing is invented.
    const noProgressHarness = createOwnerRelationshipTestHarness(null, [])
    render(<OwnerRelationshipProgressCard ownerRelationshipService={noProgressHarness.ownerRelationshipService} />)
    expect(await screen.findByText('Progress is not available')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})
